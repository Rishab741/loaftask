// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Market.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MarketFactory is Ownable {
    address[] public markets;
    event MarketCreated(address indexed market, address creator);

    // FIX: Add the constructor to initialize the Ownable parent
    constructor() Ownable(msg.sender) {
        // The body can be empty if no other setup is needed
    }

    function createMarket(address settlementToken, string calldata metadata, uint256 outcomesCount, uint256 feeBps) external returns (address) {
        Market m = new Market(IERC20(settlementToken), metadata, outcomesCount, feeBps, msg.sender);
        
        markets.push(address(m));
        emit MarketCreated(address(m), msg.sender);
        return address(m);
    }

    function getMarkets() external view returns (address[] memory) {
        return markets;
    }
}