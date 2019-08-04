pragma solidity ^0.5.0;

import "./IRelayRecipient.sol";
import "./GSNContext.sol";

contract Greeter is IRelayRecipient, GSNContext {
  event Greeted(address indexed greeter, string message);

  function greet(string memory message) public {
    emit Greeted(_msgSender(), message);
  }

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
    return (0, "");
  }

  function preRelayedCall(bytes calldata context) external returns (bytes32) { }

  function postRelayedCall(bytes calldata context, bool success, uint actualCharge, bytes32 preRetVal) external { }
}