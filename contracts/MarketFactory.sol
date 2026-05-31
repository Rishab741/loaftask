// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Market.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MarketFactory is Ownable {
    struct MarketInfo {
        address creator;
        address tenant;   // address(0) if no tenant
        string category;  // stocks | crypto | sports | politics | custom
        uint256 createdAt;
    }

    address[] public allMarkets;
    mapping(address => MarketInfo) public marketInfo;
    mapping(address => address[]) private _tenantMarkets;
    mapping(bytes32 => address[]) private _categoryMarkets;
    mapping(address => address[]) private _creatorMarkets;

    event MarketCreated(
        address indexed market,
        address indexed creator,
        address indexed tenant,
        string category
    );

    constructor() Ownable(msg.sender) {}

    function createMarket(
        address settlementToken,
        string calldata metadata,
        uint256 outcomesCount,
        uint256 feeBps,
        string calldata category,
        address tenant
    ) external returns (address) {
        Market m = new Market(IERC20(settlementToken), metadata, outcomesCount, feeBps, msg.sender);
        address addr = address(m);

        allMarkets.push(addr);
        marketInfo[addr] = MarketInfo({
            creator: msg.sender,
            tenant: tenant,
            category: category,
            createdAt: block.timestamp
        });

        if (tenant != address(0)) {
            _tenantMarkets[tenant].push(addr);
        }
        _categoryMarkets[keccak256(bytes(category))].push(addr);
        _creatorMarkets[msg.sender].push(addr);

        emit MarketCreated(addr, msg.sender, tenant, category);
        return addr;
    }

    // --- Read functions ---

    function getMarkets() external view returns (address[] memory) {
        return allMarkets;
    }

    function getMarketCount() external view returns (uint256) {
        return allMarkets.length;
    }

    function getTenantMarkets(address tenant) external view returns (address[] memory) {
        return _tenantMarkets[tenant];
    }

    function getCategoryMarkets(string calldata category) external view returns (address[] memory) {
        return _categoryMarkets[keccak256(bytes(category))];
    }

    function getCreatorMarkets(address creator) external view returns (address[] memory) {
        return _creatorMarkets[creator];
    }

    function getMarketInfo(address market) external view returns (
        address creator,
        address tenant,
        string memory category,
        uint256 createdAt
    ) {
        MarketInfo memory info = marketInfo[market];
        return (info.creator, info.tenant, info.category, info.createdAt);
    }
}
