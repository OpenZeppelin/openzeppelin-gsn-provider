const BN = require('web3').utils.toBN;
const abi = require('web3-eth-abi');

//relays are "down-scored" in case they timed out a request.
// they are "forgiven" after this timeout.
const DEFAULT_RELAY_TIMEOUT_GRACE_SEC = 60*30

class ActiveRelayPinger {

    // TODO: 'httpSend' should be on a network layer
    constructor(filteredRelays, httpSend, gasPrice, verbose) {
        this.remainingRelays = filteredRelays.slice()
        this.httpSend = httpSend
        this.pingedRelays = 0
        this.relaysCount = filteredRelays.length
        this.gasPrice = gasPrice
        this.verbose = verbose
        this.errors = [];
    }

    /**
     * Ping those relays that were not returned yet. Remove the returned relay (first to respond) from {@link remainingRelays}
     * @returns the first relay to respond to a ping message. Note: will never return the same relay twice.
     */
    async nextRelay() {
        if (this.remainingRelays.length === 0) {
            return null
        }

        let firstRelayToRespond
        for ( ;!firstRelayToRespond && this.remainingRelays.length ; ) {
            let bulkSize = Math.min( 3, this.remainingRelays.length)
            try {
                let slice = this.remainingRelays.slice(0, bulkSize)
                if (this.verbose){
                    console.log("nextRelay: find fastest relay from: " + JSON.stringify(slice))
                }
                firstRelayToRespond = await this.raceToSuccess(
                    slice.map(relay => this.getRelayAddressPing(relay.relayUrl, relay.transactionFee, this.gasPrice))
                );
                if (this.verbose){
                    console.log("race finished with a champion: " + firstRelayToRespond.relayUrl)
                }
            } catch (e) {
                if (this.verbose) {
                    console.log("One batch of relays failed, last error: ", e)
                }
                //none of the first `bulkSize` items matched. remove them, to continue with the next bulk.
                this.remainingRelays = this.remainingRelays.slice(bulkSize)
            }
        }

        this.remainingRelays = this.remainingRelays.filter(a => a.relayUrl !== firstRelayToRespond.relayUrl)
        this.pingedRelays++
        return firstRelayToRespond
    }

    /**
     * @returns JSON response from the relay server, but adds the requested URL to it:
     * { relayUrl: url,
     *   transactionFee: fee,
     *   RelayServerAddress: address,
     *   Ready: bool,   //should ignore relays with "false"
     *   MinGasPrice:   //minimum gas requirement by this relay.
     * }
     */
    async getRelayAddressPing(relayUrl, transactionFee, gasPrice) {
        let self = this
        return new Promise(function (resolve, reject) {
            let callback = function (error, body) {
                if (error) {
                    reject(`Error querying relayer ${relayUrl}: ${error.message || error.error || error.toString()}`);
                    return
                }
                if ( !body ) {
                    reject(`Empty response from relayer ${relayUrl}`);
                    return;
                }
                if ( !body.Ready ) {
                    reject(`Relayer ${relayUrl} is not ready`);
                    return
                }
                if ( body.MinGasPrice > gasPrice ) {
                    reject(`Relayer ${relayUrl} requires a minimum gas price of ${body.MinGasPrice} which is over this transaction gas price (${gasPrice})`);
                    return
                }
                try {
                    //add extra attributes (relayUrl, transactionFee)
                    Object.assign(body, {relayUrl, transactionFee})
                    resolve(body);
                }
                catch (err) {
                    reject(err);
                }
            }
            if (self.verbose){
                console.log("getRelayAddressPing URL: " + relayUrl)
            }
            self.httpSend.send(relayUrl + "/getaddr", {}, callback)
        });
    }

    /**
     * From https://stackoverflow.com/a/37235207 (modified to catch exceptions)
     * Resolves once any promise resolves, ignores the rest, ignores rejections
     */
    async raceToSuccess(promises) {
        let numRejected = 0;
        return new Promise(
            (resolve, reject) =>
                promises.forEach(
                    promise =>
                        promise.then((res) => {
                            resolve(res)
                        }).catch(err => {
                            this.errors.push(err);
                            if (++numRejected === promises.length) {
                                reject("No response matched filter from any server: " + err);
                            }
                        })
                )
        );
    }
}

class ServerHelper {

    constructor( httpSend, failedRelays,
            {
                verbose,
                minStake, minDelay, //params for relayFilter: filter out this relay if unstakeDelay or stake are too low.
                relayTimeoutGrace,  //ignore score drop of a relay after this time (seconds)
                calculateRelayScore, //function: return relay score, higher the better. default uses transactionFee and some randomness
                relayFilter,        //function: return false to filter out a relay. default uses minStake, minDelay
                addScoreRandomness,  //function: return Math.random (0..1), to fairly distribute among relays with same score.
                                     // (used by test to REMOVE the randomness, and make the test deterministic.
            }) {

        this.httpSend = httpSend
        this.verbose = verbose
        this.failedRelays = failedRelays
        this.relayTimeoutGrace = relayTimeoutGrace || DEFAULT_RELAY_TIMEOUT_GRACE_SEC

        this.addScoreRandomness = addScoreRandomness || Math.random

        this.calculateRelayScore = calculateRelayScore || this.defaultCalculateRelayScore.bind(this)

        //default filter: either calculateRelayScore didn't set "score" field,
        // or if unstakeDelay is below min, or if stake is below min.
        this.relayFilter = relayFilter || ((relay) => (
            relay.score != null &&
            (!minDelay || BN(relay.unstakeDelay).gte(BN(minDelay))) &&
            (!minStake || BN(relay.stake).gte(BN(minStake)))
        ));

        this.filteredRelays = []
        this.isInitialized = false
        this.ActiveRelayPinger = ActiveRelayPinger
    }

    defaultCalculateRelayScore(relay)  {
        //basic score is trasnaction fee (which is %)
        //higher the better.
        let score = 1000-relay.transactionFee

        let failedRelay = this.failedRelays[relay.relayUrl]
        if ( failedRelay ) {
            const elapsed = (new Date().getTime() - failedRelay.lastError)/1000
            if ( elapsed < this.relayTimeoutGrace )
                score -= 10   //relay failed to answer lately. demote.
            else
                delete this.failedRelays[relay.relayUrl]
        }

        return score;
    }

    //compare relay scores.
    // if they are the same, use addScoreRandomness to shuffle them..
    compareRelayScores(r1, r2) {
        let diff = r2.score - r1.score
        if ( diff )
            return diff
        return this.addScoreRandomness()-0.5
    }


    /**
     *
     * @param {*} relayHubInstance
     */
    setHub(relayHubInstance) {
        if (this.relayHubInstance !== relayHubInstance){
            this.filteredRelays = []
        }
        this.relayHubInstance = relayHubInstance
        this.addedAndRemovedSignatures = 
            this.relayHubInstance.options.jsonInterface.filter(e =>
                e.name === 'RelayAdded' || e.name === 'RelayRemoved'
            ).map(abi.encodeEventSignature);
    }

    async newActiveRelayPinger(fromBlock, gasPrice ) {
        if (typeof this.relayHubInstance === 'undefined') {
            throw new Error("Must call to setHub first!")
        }
        if (this.filteredRelays.length == 0 || this.fromBlock !== fromBlock)
        {
            this.fromBlock = fromBlock
            await this.fetchRelaysAdded()
        }
        return this.createActiveRelayPinger(this.filteredRelays, this.httpSend, gasPrice, this.verbose)
    }

    createActiveRelayPinger(filteredRelays, httpSend, gasPrice, verbose) {
        return new ActiveRelayPinger(filteredRelays, httpSend, gasPrice, verbose)
    }

    /**
     * Iterates through all RelayAdded and RelayRemoved logs emitted by given hub
     * initializes an array {@link filteredRelays} of relays curently registered on given RelayHub contract
     */
    async fetchRelaysAdded() {
        let activeRelays = {}
        let fromBlock = this.fromBlock || 2;
        let addedAndRemovedEvents = await this.relayHubInstance.getPastEvents("allEvents", { fromBlock: fromBlock,
            topics: [this.addedAndRemovedSignatures],
        })

        if (this.verbose){
            console.log("fetchRelaysAdded: found " + addedAndRemovedEvents.length + " events")
        }
        //TODO: better filter RelayAdded, RelayRemoved events: otherwise, we'll be scanning all TransactionRelayed too...
        //since RelayAdded can't be called after RelayRemoved, its OK to scan first for add, and the remove all removed relays.
        for (var index in addedAndRemovedEvents) {
            let event = addedAndRemovedEvents[index]
            if (event.event === "RelayAdded") {
                let args = event.returnValues
                let relay = {
                    address: args.relay,
                    relayUrl: args.url,
                    transactionFee: args.transactionFee,
                    stake: args.stake,
                    unstakeDelay: args.unstakeDelay
                }
                relay.score = this.calculateRelayScore(relay)
                activeRelays[args.relay] =relay
            } else if (event.event === "RelayRemoved") {
                delete activeRelays[event.returnValues.relay]
            }
        }

        const origRelays = Object.values(activeRelays)
        if (origRelays.length === 0) {
            throw new Error(`No relayers registered in the requested hub at ${this.relayHubInstance.options.address}`);
        }

        const filteredRelays = origRelays.filter(this.relayFilter).sort(this.compareRelayScores.bind(this));
        if (filteredRelays.length == 0) {
            throw new Error("No relayers elligible after filtering. Available relayers:\n" + origRelays.map(r => 
                ` score=${r.score} txFee=${r.transactionFee} stake=${r.stake} unstakeDelay=${r.unstakeDelay} address=${r.address} url=${r.relayUrl}`
            ));
        }

        if (this.verbose){
            console.log("fetchRelaysAdded: after filtering have " + filteredRelays.length + " active relays")
        }

        this.filteredRelays = filteredRelays;
        this.isInitialized = true;
        return filteredRelays;
    }
}

module.exports = ServerHelper
