// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TenantRegistry is Ownable {
    struct Tenant {
        string name;
        string metadata; // JSON: {description, logo, website, twitter}
        address feeRecipient;
        bool active;
        uint256 registeredAt;
    }

    mapping(address => Tenant) public tenants;
    address[] private _tenantList;
    uint256 public registrationFee;

    event TenantRegistered(address indexed tenant, string name);
    event TenantUpdated(address indexed tenant);
    event TenantDeactivated(address indexed tenant);

    constructor() Ownable(msg.sender) {}

    function registerTenant(
        string calldata name,
        string calldata metadata,
        address feeRecipient
    ) external payable {
        require(!tenants[msg.sender].active, "Already registered");
        require(bytes(name).length > 0, "Name required");
        require(msg.value >= registrationFee, "Insufficient registration fee");
        require(feeRecipient != address(0), "Invalid fee recipient");

        tenants[msg.sender] = Tenant({
            name: name,
            metadata: metadata,
            feeRecipient: feeRecipient,
            active: true,
            registeredAt: block.timestamp
        });

        _tenantList.push(msg.sender);
        emit TenantRegistered(msg.sender, name);
    }

    function updateTenant(
        string calldata name,
        string calldata metadata,
        address feeRecipient
    ) external {
        require(tenants[msg.sender].active, "Not registered");
        require(bytes(name).length > 0, "Name required");
        require(feeRecipient != address(0), "Invalid fee recipient");
        tenants[msg.sender].name = name;
        tenants[msg.sender].metadata = metadata;
        tenants[msg.sender].feeRecipient = feeRecipient;
        emit TenantUpdated(msg.sender);
    }

    function isTenant(address addr) external view returns (bool) {
        return tenants[addr].active;
    }

    function getTenantCount() external view returns (uint256) {
        return _tenantList.length;
    }

    function getTenants() external view returns (address[] memory) {
        return _tenantList;
    }

    function getTenantInfo(address addr) external view returns (
        string memory name,
        string memory metadata,
        address feeRecipient,
        bool active,
        uint256 registeredAt
    ) {
        Tenant memory t = tenants[addr];
        return (t.name, t.metadata, t.feeRecipient, t.active, t.registeredAt);
    }

    function setRegistrationFee(uint256 fee) external onlyOwner {
        registrationFee = fee;
    }

    function deactivateTenant(address tenant) external onlyOwner {
        tenants[tenant].active = false;
        emit TenantDeactivated(tenant);
    }

    function withdraw() external onlyOwner {
        (bool ok,) = payable(owner()).call{value: address(this).balance}("");
        require(ok, "Transfer failed");
    }
}
