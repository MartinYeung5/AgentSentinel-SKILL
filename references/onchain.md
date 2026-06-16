# AgentSentinel — On-chain Integration

Loaded on demand when the agent needs to read or write Sentinel state
directly on Pharos.

## Contract addresses

| Network | ChainID | Registry | AuditLog | Payments |
|---------|:------:|----------|----------|----------|
| Pharos testnet | 688689 | `0x<fill-after-deploy>` | `0x<fill-after-deploy>` | `0x<fill-after-deploy>` |
| Local hardhat  | 31337  | (via `npm run deploy:local`) | | |

## ABI surface (most-used methods)

### `SentinelRegistry`
```solidity
function getVersion(string version) view returns (SkillVersion);
function registerVersion(string version, bytes32 versionHash, string uri, uint256 pricePerCall);
function totalVersions() view returns (uint256);
event VersionRegistered(string version, bytes32 versionHash, address maintainer);
```

### `SentinelAuditLog`
```solidity
function logCheck(
    bytes32 agentId, bytes32 actionHash,
    uint8 verdict, uint8 aggregateScore,
    uint8 promptScore, uint8 chainScore,
    uint8 behaviorScore, uint8 complianceScore
) returns (bytes32 recordId);

function getRecord(bytes32 recordId) view returns (CheckRecord);
function getBlockCount(bytes32 agentId) view returns (uint256);
event SentinelCheck(bytes32 indexed agentId, bytes32 indexed actionHash,
                    uint8 verdict, uint8 aggregateScore, uint256 timestamp);
```

### `SentinelPayments`
```solidity
function deposit() payable;
function withdraw(uint256 amount);
function balanceOf(address agent) view returns (uint256);
function charge(address agent, string version, bytes32 actionHash) returns (uint256);
event Charged(address indexed agent, string version, uint256 amount, bytes32 actionHash);
```

## Reputation pattern

```ts
// Compute a simple agent reputation from the audit log
const blocks = await auditLog.getBlockCount(agentId);
const penalty = Math.min(100, Number(blocks) * 5);   // -5 reputation per BLOCK
const reputation = 100 - penalty;
```

## Cost model

Each `invoke()` charges `pricePerCall` of PHAR (default 0.05 PHAR),
settled atomically through `SentinelPayments.charge()`. Agents top up
once and stream calls until the balance is exhausted.

## Indexer hint

To build a per-agent dashboard, subscribe to `SentinelCheck(agentId, ...)`
events filtered by `agentId`, then aggregate by `verdict`. The full
`module_scores` are not indexed on-chain; fetch them off-chain from the
skill server's audit storage if you need them.
