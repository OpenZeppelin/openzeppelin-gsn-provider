pragma solidity ^0.5.0;

import "./IRelayRecipient.sol";
import "./GSNContext.sol";

contract Greeter is IRelayRecipient, GSNContext {
  address constant FAILS_PRE =  0x28a8746e75304c0780E011BEd21C72cD78cd535E;
  address constant FAILS_POST = 0xACa94ef8bD5ffEE41947b4585a84BdA5a3d3DA6E;

  event Greeted(address indexed greeter, string message);

  function reverts() public {
    emit Greeted(_msgSender(), "Error");
    revert("GreetingError");
  }

  function greet(string memory message) public payable {
    emit Greeted(_msgSender(), message);
  }

  function acceptRelayedCall(
      address,
      address from,
      bytes calldata,
      uint256,
      uint256,
      uint256,
      uint256,
      bytes calldata,
      uint256
  ) external view returns (uint256, bytes memory) {
    return (0, abi.encode(from));
  }

  function preRelayedCall(bytes calldata context) external returns (bytes32) { 
    address from = abi.decode(context, (address));
    if (from == FAILS_PRE) revert("FailedPre");
  }

  function postRelayedCall(bytes calldata context, bool, uint, bytes32) external { 
    address from = abi.decode(context, (address));
    if (from == FAILS_POST) revert("FailedPost");
  }
}