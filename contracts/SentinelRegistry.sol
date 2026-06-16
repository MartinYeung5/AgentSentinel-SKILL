// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SentinelRegistry
 * @notice On-chain registry of AgentSentinel skill versions on Pharos.
 *         Other agents query this contract to verify they are calling
 *         an audited, version-pinned security skill.
 */
contract SentinelRegistry {
    struct SkillVersion {
        bytes32 versionHash;   // keccak256 of the published runtime artifact
        string  uri;           // ipfs:// or https:// pointer to spec
        address maintainer;
        uint256 pricePerCall;  // in wei of PHAR
        bool    active;
        uint256 registeredAt;
    }

    address public owner;
    bytes32 public constant SKILL_ID = keccak256("AgentSentinel");

    mapping(string => SkillVersion) public versions; // "v1.0.0" => SkillVersion
    string[] public versionList;

    event VersionRegistered(string version, bytes32 versionHash, address maintainer);
    event VersionDeactivated(string version);
    event PriceUpdated(string version, uint256 newPrice);

    modifier onlyOwner() {
        require(msg.sender == owner, "Sentinel: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function registerVersion(
        string calldata version,
        bytes32 versionHash,
        string calldata uri,
        uint256 pricePerCall
    ) external onlyOwner {
        require(versions[version].registeredAt == 0, "Sentinel: version exists");
        versions[version] = SkillVersion({
            versionHash: versionHash,
            uri: uri,
            maintainer: msg.sender,
            pricePerCall: pricePerCall,
            active: true,
            registeredAt: block.timestamp
        });
        versionList.push(version);
        emit VersionRegistered(version, versionHash, msg.sender);
    }

    function deactivateVersion(string calldata version) external onlyOwner {
        require(versions[version].active, "Sentinel: not active");
        versions[version].active = false;
        emit VersionDeactivated(version);
    }

    function updatePrice(string calldata version, uint256 newPrice) external onlyOwner {
        require(versions[version].active, "Sentinel: not active");
        versions[version].pricePerCall = newPrice;
        emit PriceUpdated(version, newPrice);
    }

    function getVersion(string calldata version) external view returns (SkillVersion memory) {
        return versions[version];
    }

    function totalVersions() external view returns (uint256) {
        return versionList.length;
    }
}
