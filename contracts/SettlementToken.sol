// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SettlementToken is ERC20, Ownable {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) Ownable(msg.sender) {
        _mint(msg.sender, 1_000_000 * (10 ** decimals())); // initial mint for testing
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
