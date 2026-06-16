// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SentinelAuditLog
 * @notice Immutable audit log of every Sentinel security check.
 *         Enables dispute resolution, insurance, and reputation scoring.
 */
contract SentinelAuditLog {
    enum Verdict { ALLOW, WARN, BLOCK }

    struct CheckRecord {
        bytes32 agentId;
        bytes32 actionHash;
        Verdict verdict;
        uint8   aggregateScore;
        uint8   promptScore;
        uint8   chainScore;
        uint8   behaviorScore;
        uint8   complianceScore;
        uint256 timestamp;
        address reporter;
    }

    address public registry;
    mapping(bytes32 => CheckRecord) public records; // keccak256(agentId, actionHash, ts)
    mapping(bytes32 => uint256) public blockCount;  // agentId => # of BLOCK verdicts

    event SentinelCheck(
        bytes32 indexed agentId,
        bytes32 indexed actionHash,
        uint8   verdict,
        uint8   aggregateScore,
        uint256 timestamp
    );

    constructor(address _registry) {
        registry = _registry;
    }

    function logCheck(
        bytes32 agentId,
        bytes32 actionHash,
        uint8 verdict,
        uint8 aggregateScore,
        uint8 promptScore,
        uint8 chainScore,
        uint8 behaviorScore,
        uint8 complianceScore
    ) external returns (bytes32 recordId) {
        require(verdict <= 2, "Sentinel: bad verdict");
        require(aggregateScore <= 100, "Sentinel: bad score");

        recordId = keccak256(abi.encodePacked(agentId, actionHash, block.timestamp, msg.sender));
        records[recordId] = CheckRecord({
            agentId: agentId,
            actionHash: actionHash,
            verdict: Verdict(verdict),
            aggregateScore: aggregateScore,
            promptScore: promptScore,
            chainScore: chainScore,
            behaviorScore: behaviorScore,
            complianceScore: complianceScore,
            timestamp: block.timestamp,
            reporter: msg.sender
        });

        if (verdict == uint8(Verdict.BLOCK)) {
            blockCount[agentId] += 1;
        }

        emit SentinelCheck(agentId, actionHash, verdict, aggregateScore, block.timestamp);
    }

    function getRecord(bytes32 recordId) external view returns (CheckRecord memory) {
        return records[recordId];
    }

    function getBlockCount(bytes32 agentId) external view returns (uint256) {
        return blockCount[agentId];
    }
}
