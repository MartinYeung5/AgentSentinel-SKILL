> ⚠ **Security model.** This repository ships a **public demo build**
> with placeholder risklists and demo-grade thresholds. Real
> deployments override these via a gitignored `private/` directory.
> See [`SECURITY.md`](./SECURITY.md) for the full public/private
> boundary before forking or deploying.

---

# AgentSentinel
### A reusable security & risk-assessment Skill for the Pharos AI-Agent economy

`AgentSentinel` is a composable on-chain Skill that any Pharos agent can call
before signing a transaction, sending a message, or invoking another skill.
It performs four parallel checks — **prompt-layer**, **on-chain**,
**behavioral**, and **compliance / KYT** — aggregates the result into a
policy-tunable risk score, and writes an immutable verdict to the
`SentinelAuditLog` contract on Pharos.

> Built for the **Skill-to-Agent Dual Cascade Hackathon**
> (Pharos × Anvita Flow, Pharos 1st Anniversary).

---

## 1. Prerequisites

| Tool | Tested version |
|------|---------------|
| Node.js | **v18.18+** or **v20 LTS** |
| npm | 9+ |
| (optional) Git | any |

> Windows users: install Node.js from https://nodejs.org. PowerShell works
> out of the box — no extra setup required.

---

## 2. Repository Layout

```
agent-sentinel/
├── contracts/                  Solidity smart contracts
│   ├── SentinelRegistry.sol
│   ├── SentinelAuditLog.sol
│   └── SentinelPayments.sol
├── src/                        TypeScript skill runtime
│   ├── modules/
│   │   ├── promptGuard.ts
│   │   ├── onChainRiskScanner.ts
│   │   ├── behaviorAnomalyDetector.ts
│   │   └── complianceFilter.ts
│   ├── audit/chainLogger.ts
│   ├── aggregator.ts
│   ├── server.ts
│   ├── index.ts
│   └── types.ts
├── sdk/                        @pharos/skill-sentinel client SDK
├── demo/safeSwapAgent.ts
├── tests/                      zero-dep unit-test suite
├── scripts/deploy.ts           Hardhat deployment script
├── hardhat.config.ts
├── tsconfig.json
├── package.json
├── .env.example
└── README.md
```

---

## 3. Install

### bash / zsh / WSL
```bash
cd agent-sentinel
npm install
```

### Windows PowerShell
```powershell
cd agent-sentinel
npm install
```

The same commands work in both shells. If PowerShell complains about
script execution policy when running `npx hardhat …`, run **once**
in an admin PowerShell:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

---

## 4. Run the Test Suite

```bash
npm test
```

Expected output:

```
✓ [PromptGuard] ALLOWs benign prompts
✓ [PromptGuard] flags injection patterns
✓ [PromptGuard] flags secret leakage
✓ [OnChainRiskScanner] flags unlimited approvals
✓ [OnChainRiskScanner] blocks honeypots
✓ [OnChainRiskScanner] ignores non-tx actions
✓ [BehaviorAnomalyDetector] flags scope violations
✓ [BehaviorAnomalyDetector] flags rate anomalies
✓ [ComplianceFilter] blocks sanctioned addresses
✓ [ComplianceFilter] scores mixer proximity
✓ [SentinelAggregator] ALLOWs benign action
✓ [SentinelAggregator] BLOCKs honeypot tx
✓ [SentinelAggregator] BLOCKs sanctioned address regardless of policy
✓ [SentinelAggregator] logs to audit logger
✓ [SentinelAggregator] emits ALLOW->WARN->BLOCK as risk climbs
✓ [SentinelAggregator] escalates to WARN on any high-severity evidence

16 passed, 0 failed
```

---

## 5. Compile & Deploy Contracts

### 5.1 Configure environment

#### bash / zsh / WSL
```bash
cp .env.example .env
# then edit .env
```

#### Windows PowerShell
```powershell
Copy-Item .env.example .env
notepad .env        # or: code .env
```

Fill in:

```
PHAROS_RPC_URL=https://testnet.dplabs-internal.com
PHAROS_CHAIN_ID=688688
DEPLOYER_PRIVATE_KEY=<your_64_hex_key>
```

> Get the current Pharos testnet RPC + chain id from
> https://docs.pharosnetwork.xyz . Fund your deployer from the official
> faucet before deploying.

### 5.2 Compile

```bash
npx hardhat compile
```

### 5.3 Deploy to Pharos testnet

The **same command works on bash, zsh, and PowerShell**:

```bash
npx hardhat run scripts/deploy.ts --network pharosTestnet
```

Or via npm script:

```bash
npm run deploy:pharos
```

Deploy to a local in-memory chain first (no funds needed) to sanity-check:

```bash
npm run deploy:local
```

Expected output (truncated):

```
Network         : pharosTestnet
Deployer        : 0xAbC...
Deployer balance: 1.5 native

[1/4] Deploying SentinelRegistry ...
       SentinelRegistry @ 0x...
[2/4] Deploying SentinelAuditLog ...
       SentinelAuditLog @ 0x...
[3/4] Deploying SentinelPayments ...
       SentinelPayments @ 0x...
[4/4] Registering skill version v1.0.0 ...
       Registered. tx: 0x...
=== Deployment summary ===
{ ... }
```

> The script aborts with a clear message if `PHAROS_RPC_URL` or
> `DEPLOYER_PRIVATE_KEY` are missing, so PowerShell users will not see
> the cryptic "no signers" error from raw Hardhat.

---

## 6. Run the Skill Server (HTTP, Pharos Skill ABI)

```bash
npm run build
npm start              # listens on :8787
```

```bash
curl -X POST http://localhost:8787/v1/invoke ^
     -H "Content-Type: application/json" ^
     -d "{\"agent_id\":\"a1\",\"action_type\":\"tx\",\"policy_level\":\"strict\",\"payload\":{\"to\":\"0xDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEF\"}}"
```

(`^` is the PowerShell / cmd line-continuation; on bash use `\`.)

---

## 7. Run the Demo Agent

```bash
npm run demo
```

The reference SafeSwap agent prepares an unlimited-approval transaction;
Sentinel returns `WARN` with `recommended_action="Reduce ERC20 allowance to the exact required amount."`

---

## 8. Skill API

### `POST /v1/invoke`

```jsonc
{
  "agent_id": "did:pharos:0xA3f...",
  "action_type": "tx",
  "payload": {
    "to":   "0x...",
    "data": "0x095ea7b3...",
    "value": "0",
    "prompt": "...",
    "output": "...",
    "target_skill": "DexRouter"
  },
  "policy_level": "strict",
  "simulate": false
}
```

Response:

```jsonc
{
  "verdict": "BLOCK",
  "aggregate_score": 78,
  "module_scores": { "prompt": 0, "chain": 90, "behavior": 0, "compliance": 0 },
  "evidence": [
    { "module": "chain", "severity": "critical",
      "code": "HONEYPOT_TARGET", "message": "..." }
  ],
  "recommended_action": "Abort: destination contract is a known honeypot.",
  "audit_tx_hash": "0x...",
  "expires_at": 1735689600
}
```

---

## 9. Risk Scoring

| Module      | strict | balanced | permissive |
|-------------|:------:|:--------:|:----------:|
| prompt      | 0.25   | 0.20     | 0.15       |
| chain       | 0.35   | 0.35     | 0.30       |
| behavior    | 0.20   | 0.25     | 0.25       |
| compliance  | 0.20   | 0.20     | 0.30       |

Verdict (strict): `0–29 ALLOW · 30–59 WARN · 60+ BLOCK`.

**Severity-escalation safeguard**: any `critical` evidence forces
`BLOCK`; any `high` evidence forces at least `WARN`. This prevents
high-severity findings from being silently allowed by a low weighted
score.

---

## 10. Smart-Contract Surface

| Contract               | Purpose                                          |
|------------------------|--------------------------------------------------|
| `SentinelRegistry`     | Register skill versions, prices, maintainers     |
| `SentinelAuditLog`     | Append-only record of every check                |
| `SentinelPayments`     | Pay-per-call settlement in PHAR                  |

`solidity 0.8.20` with `evmVersion: "paris"` so the produced bytecode
contains **no PUSH0 opcodes** — required for current Pharos testnet builds.

---

## 11. SDK Integration in 3 Lines

```ts
import { Sentinel } from "@pharos/skill-sentinel";
const sentinel = new Sentinel({ endpoint: "https://sentinel.pharos.skills" });
await sentinel.guard({ agent_id, action_type: "tx", policy_level: "strict", payload });
```

`guard()` throws if the verdict is `BLOCK`; otherwise returns the full
response.

---

## 12. Troubleshooting (PowerShell)

| Error | Fix |
|-------|-----|
| `npx : 無法載入檔案 ... 因為這個系統上已停用指令碼執行` | Run admin PS: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `Error HH8: Invalid account: ...` | Ensure `DEPLOYER_PRIVATE_KEY` in `.env` is 64 hex chars (with or without 0x) |
| `getaddrinfo ENOTFOUND ...` | Wrong `PHAROS_RPC_URL` — verify against Pharos docs |
| `insufficient funds for intrinsic transaction cost` | Fund the deployer from the testnet faucet |
| `invalid opcode: PUSH0` | Already fixed: `evmVersion: "paris"` is set in `hardhat.config.ts` |

---

## 13. License
MIT
