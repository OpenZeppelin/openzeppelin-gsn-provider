#!/usr/bin/env bash

# Exit script as soon as a command fails.
set -eo pipefail

# Executes cleanup function at script exit.
trap cleanup EXIT

cleanup() {
  # Kill the ganache instance that we started (if we started one and if it's still running).
  if [ -n "$ganache_pid" ] && ps -p $ganache_pid > /dev/null; then
    kill -9 $ganache_pid
  fi

  # Kill the GSN relay server that we started (if we started one and if it's still running).
  if [ -n "$gsn_relay_server_pid" ] && ps -p $gsn_relay_server_pid > /dev/null; then
    kill -9 $gsn_relay_server_pid
  fi
}

ganache_port=9545
ganache_url="http://localhost:$ganache_port"

relayer_port=8099
relayer_url="http://localhost:${relayer_port}"

ganache_running() {
  nc -z localhost "$ganache_port"
}

relayer_running() {
  nc -z localhost "$relayer_port"
}

start_ganache() {
  npx ganache-cli --port "$ganache_port" -d &> /dev/null &
  ganache_pid=$!

  echo "Waiting for ganache to launch on port "$ganache_port"..."

  while ! ganache_running; do
    sleep 0.1 # wait for 1/10 of the second before check again
  done

  echo "Ganache launched!"
}

setup_gsn_relay() {
  node ./node_modules/@openzeppelin/gsn-helpers/oz-gsn.js deploy-relay-hub --ethereumNodeURL $ganache_url # Replace this with npx once the package is out

  echo "Launching GSN relay server"

  ./bin/gsn-relay -DevMode -RelayHubAddress "0x537F27a04470242ff6b2c3ad247A05248d0d27CE" -GasPricePercent -99 -EthereumNodeUrl $ganache_url -Url $relayer_url &> /dev/null &
  gsn_relay_server_pid=$!

  while ! relayer_running; do
    sleep 0.1 # wait for 1/10 of the second before check again
  done

  echo "GSN relay server launched!"

  node ./node_modules/@openzeppelin/gsn-helpers/oz-gsn.js register-relayer --ethereumNodeURL $ganache_url --relayUrl $relayer_url # Replace this with npx once the package is out
}

# Main
if ganache_running; then
  echo "Using existing ganache instance"
else
  echo "Starting our own ganache instance"
  start_ganache
fi

setup_gsn_relay

env PROVIDER_URL=$ganache_url RELAYER_URL=$relayer_url ./node_modules/.bin/mocha $@

