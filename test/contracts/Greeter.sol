pragma solidity ^0.5.0;

import "./IRelayRecipient.sol";
import "./GSNContext.sol";
import "./ECDSA.sol";

contract VanillaGreeter {
  event Greeted(address indexed greeter, string message);

  function greet(string memory message) public payable {
    emit Greeted(msg.sender, message);
  }
}

contract Greeter is IRelayRecipient, GSNContext, VanillaGreeter {
  address constant FAILS_PRE =  0x28a8746e75304c0780E011BEd21C72cD78cd535E;
  address constant FAILS_POST = 0xACa94ef8bD5ffEE41947b4585a84BdA5a3d3DA6E;

  event PostGreet(address from, bytes approveData);

  function greet(string memory message) public payable {
    // Play around with msg data to increase gas consumption if sent as meta tx
    bytes memory data = _msgData();
    require(data.length > 0);

    emit Greeted(_msgSender(), message);
  }

  function greetFrom(address sender, string memory message) public payable {
    require(sender == _msgSender());
    greet(message);
  }

  function reverts() public {
    emit Greeted(_msgSender(), "Error");
    revert("GreetingError");
  }

  function acceptRelayedCall(
      address,
      address from,
      bytes calldata,
      uint256,
      uint256,
      uint256,
      uint256,
      bytes calldata approveData,
      uint256
  ) external view returns (uint256, bytes memory) {
    return (0, abi.encode(from, approveData));
  }

  function preRelayedCall(bytes calldata context) external returns (bytes32) { 
    (address from,) = abi.decode(context, (address, bytes));
    if (from == FAILS_PRE) revert("FailedPre");
  }

  function postRelayedCall(bytes calldata context, bool, uint, bytes32) external { 
    (address from, bytes memory approveData) = abi.decode(context, (address, bytes));
    if (from == FAILS_POST) revert("FailedPost");
    emit PostGreet(from, approveData);
  }

  function setHub(address hub) external {
    _upgradeRelayHub(hub);
  }
}

contract RejectfulGreeter is Greeter {
  function acceptRelayedCall(
      address,
      address,
      bytes calldata,
      uint256,
      uint256,
      uint256,
      uint256,
      bytes calldata,
      uint256
  ) external view returns (uint256, bytes memory) {
    return (20, "");
  }
}

contract SignatureBouncerGreeter is Greeter {
  using ECDSA for bytes32;

  address public trustedSigner;
  
  constructor(address _trustedSigner) public {
    trustedSigner = _trustedSigner;
  }

  function acceptRelayedCall(
    address relay,
    address from,
    bytes calldata encodedFunction,
    uint256 transactionFee,
    uint256 gasPrice,
    uint256 gasLimit,
    uint256 nonce,
    bytes calldata approvalData,
    uint256
  ) external view returns (uint256, bytes memory) {

    bytes memory blob = abi.encodePacked(
      relay,
      from,
      encodedFunction,
      transactionFee,
      gasPrice,
      gasLimit,
      nonce, // Prevents replays on RelayHub
      getHubAddr(), // Prevents replays in multiple RelayHubs
      address(this) // Prevents replays in multiple recipients
    );
    
    if (keccak256(blob).toEthSignedMessageHash().recover(approvalData) == trustedSigner) {
      return (0, abi.encode(from, approvalData));
    } else {
      return (20, abi.encode(from, approvalData));
    }
  }
}