---
name: pharos-agent-sentinel
description: Pharos-native security and risk assessment for AI agent actions on Pharos testnet (chainId 688689, native token PHRS). Use this skill BEFORE the agent signs any Pharos transaction, sends a user-facing message, invokes another Pharos skill, or processes a PHRS payment. Returns ALLOW / WARN / BLOCK verdict with a 0-100 risk score, structured evidence with Pharos block-explorer links, and a recommended action. Detects prompt injection, secret/PII leakage, honeypot contracts, unlimited ERC-20 approvals on Pharos DEX routers, mixer / sanctions exposure, agent-registry scope violations, and behavioural anomalies. Optimised for the Pharos parallel-EVM, the Pharos AI Agent Skill ABI, and the Pharos faucet / agent-economy primitives documented at docs.pharos.xyz.
---

# Pharos AgentSentinel — Security & Risk Skill for Pharos AI Agents

## Pharos network defaults

| Field | Value |
|-------|-------|
| Network name | Pharos Testnet |
| ChainID | `688689` (verify at runtime; some endpoints expose `688689`) |
| Native token | `PHRS` (18 decimals) |
| Public RPC | `https://testnet.dplabs-internal.com` (see `references/pharos-network.md` for current list) |
| Block explorer | `https://pharos-testnet.socialscan.io` (also `https://testnet.pharosscan.xyz`) |
| Faucet | linked from <https://docs.pharos.xyz> |
| Skill ABI | `POST /v1/invoke` (Pharos Skill Standard) |

If the chain you connect to does not match `688689`, the
skill **must refuse to run** — see `scripts/check.py --verify-chain`.

## When to use this skill

Invoke this skill **before** any of the following Pharos-side actions:

- ✅ Signing a Pharos transaction (transfer PHRS, swap, approve, contract call)
- ✅ Sending a message to the user (check for secret / private-key leakage)
- ✅ Invoking another Pharos skill via the Pharos Skill Registry
- ✅ Settling a PHRS payment between two agents
- ✅ Approving an ERC-20 token allowance on a Pharos DEX router
- ✅ Registering / updating the calling agent's identity on the Pharos Agent Registry

## How to use this skill

### Step 1 — Build a `SentinelRequest` (Pharos-flavoured)

```json
{
  "agent_id": "did:pharos:0xYourAgentAddress",
  "action_type": "tx | message | skill_call | payment",
  "policy_level": "strict | balanced | permissive",
  "payload": {
    "to":           "0x...",
    "data":         "0x...",
    "value":        "0",
    "prompt":       "...",
    "output":       "...",
    "target_skill": "..."
  },
  "chain": {
    "chain_id": 688689,
    "rpc_url":  "https://testnet.dplabs-internal.com"
  },
  "simulate": false
}
```

`agent_id` should be a Pharos DID. The Pharos format is
`did:pharos:<eth-address>`; the skill will normalise mixed-case
addresses and reject malformed DIDs.

`chain` is optional — if omitted, the server reads its own
`PHAROS_RPC_URL` / `PHAROS_CHAIN_ID` env vars (see
`references/pharos-network.md`).

### Step 2 — Invoke the skill

#### Option A — Bundled Python helper (recommended for any agent)

```bash
# Verify you're on a Pharos chain first (zero-cost RPC eth_chainId call)
python scripts/check.py --verify-chain

# Then run a check
python scripts/check.py --tx 0xRouterAddress --data 0x095ea7b3... --policy strict
```

#### Option B — HTTP

```bash
curl -X POST $SENTINEL_ENDPOINT/v1/invoke \
  -H 'Content-Type: application/json' \
  -d @request.json
```

#### Option C — TypeScript SDK

```ts
import { Sentinel } from "@pharos/skill-sentinel";
const sentinel = new Sentinel({
  endpoint: process.env.SENTINEL_ENDPOINT,
  defaultChain: { chainId: 688689, rpcUrl: process.env.PHAROS_RPC_URL },
});
const verdict = await sentinel.check(request);
```

### Step 3 — Act on the verdict

```
verdict = "ALLOW"  -> proceed; broadcast the tx via Pharos RPC
verdict = "WARN"   -> ask the user for confirmation;
                      surface response.evidence[*].explorer_url
verdict = "BLOCK"  -> abort; log response.audit_tx_hash; do NOT retry blindly
```

For `WARN` / `BLOCK`, every piece of evidence carries a Pharos
explorer link (e.g. `https://pharos-testnet.socialscan.io/address/0x...`)
so the user can verify the finding.

### Step 4 — Persist the audit hash on Pharos

Each invocation produces `response.audit_tx_hash`, an immutable
commitment written to the on-chain `SentinelAuditLog` contract on
Pharos testnet. Store it alongside the action you took for later
reputation scoring.

## Pharos-specific examples

### Example 1 — Block a known Pharos-testnet honeypot

```json
{
  "agent_id": "did:pharos:0xA3f",
  "action_type": "tx",
  "policy_level": "strict",
  "payload": {
    "to":   "0xDEADBEEFdeadbeefDEADBEEFdeadbeefDEADBEEF",
    "value": "1000000000000000000"
  },
  "chain": { "chain_id": 688689 }
}
```
→ `BLOCK`, `evidence[].explorer_url` points to
`pharos-testnet.socialscan.io/address/0xDEADBEEF...` so the user can
verify the contract has been flagged.

### Example 2 — Warn on unlimited approve to a Pharos DEX router

```json
{
  "agent_id": "did:pharos:0xA3f",
  "action_type": "tx",
  "policy_level": "strict",
  "payload": {
    "to":   "0xPharosRouter",
    "data": "0x095ea7b3...ffffffff...ffffffff"
  }
}
```
→ `WARN` with `UNLIMITED_APPROVAL`. Recommended action:
*"Reduce ERC20 allowance to the exact required amount."*

### Example 3 — Warn on an unregistered Pharos skill

When the calling agent tries to invoke a skill that is not present in
the Pharos Skill Registry contract, the skill flags `SKILL_NOT_REGISTERED`
(severity high → at least WARN):

```json
{
  "agent_id": "did:pharos:0xA3f",
  "action_type": "skill_call",
  "policy_level": "balanced",
  "payload": { "target_skill": "did:pharos-skill:UnknownSkill" }
}
```

### Example 4 — Block a PHRS payment to a sanctioned address

```json
{
  "agent_id": "did:pharos:0xA3f",
  "action_type": "payment",
  "policy_level": "permissive",
  "payload": {
    "to":   "0xSanctionedAddress",
    "value": "100000000000000000"
  }
}
```
→ `BLOCK` (severity-escalation overrides `permissive`).

### Example 5 — Detect Pharos faucet-drain pattern

The skill flags `FAUCET_DRAIN_SUSPECT` when the destination matches a
known Pharos faucet contract and the agent's recent action history
shows a "pull-then-relay" pattern (received from faucet, immediately
forwarded > 90% to another address). See
`references/pharos-risk-patterns.md`.

## Risk modules — Pharos extensions

Beyond the four base modules (Prompt / Chain / Behavior / Compliance),
this Pharos build adds Pharos-specific detectors. Full table in
`references/pharos-risk-patterns.md`.

| Pharos detector | Module | Severity |
|-----------------|:------:|:--------:|
| Destination not deployed on Pharos (codesize 0) | chain | medium |
| `target_skill` absent from Pharos Skill Registry | behavior | high |
| Faucet-drain pull-then-relay pattern | behavior | high |
| PHRS payment to deployer-whitelist-locked contract | chain | low |
| Mismatched chainId (signed for non-Pharos chain) | chain | critical |
| Outbound message contains a Pharos developer API key | prompt | critical |

> Numeric scores are intentionally not published. See `SECURITY.md` for the
> public/private boundary and `references/modules.md` for severity classes.

## Configuration

Environment variables read by the bundled scripts and the HTTP server:

| Variable | Default | Meaning |
|----------|---------|---------|
| `PHAROS_RPC_URL` | `https://testnet.dplabs-internal.com` | Pharos JSON-RPC |
| `PHAROS_CHAIN_ID` | `688689` | Expected chainId — used by `--verify-chain` |
| `PHAROS_EXPLORER_URL` | `https://pharos-testnet.socialscan.io` | Used in evidence URLs |
| `PHAROS_REGISTRY_ADDR` | `0x<fill-after-deploy>` | Pharos Skill Registry address |
| `SENTINEL_ENDPOINT` | `http://localhost:8787` | HTTP endpoint of this skill |
| `SENTINEL_API_KEY` | (none) | Optional bearer token |

## On-chain artefacts (Pharos testnet)

When deployed on Pharos testnet, this skill itself is registered in
three contracts; addresses live in `references/pharos-network.md`:

- `SentinelRegistry`  — version + price (paid in PHRS)
- `SentinelAuditLog`  — append-only verdict log on Pharos
- `SentinelPayments`  — pay-per-call settlement in PHRS

Costs, ABIs, and event signatures: `references/pharos-network.md`.

## References

- Pharos network constants & live URLs: `references/pharos-network.md`
- Pharos-specific risk patterns:        `references/pharos-risk-patterns.md`
- Generic risk-module deep dive:        `references/modules.md`
- Generic on-chain integration:         `references/onchain.md`
- Official Pharos docs:                 <https://docs.pharos.xyz>
- Source repository:                    <https://github.com/<your-org>/agent-sentinel>

## License

MIT
