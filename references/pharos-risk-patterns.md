# Pharos-Specific Risk Patterns (Public Specification)

This document is the **public specification** of Pharos extensions to
the four base risk modules. It enumerates *what* is detected and the
*severity class* that is assigned, but **not** the exact numeric scores
or threshold values used in production.

For the generic public spec see `references/modules.md`. For the
public/private boundary see `SECURITY.md`.

The patterns below are **only active when `chain.chain_id` matches a
Pharos network** (canonically `688689`; alias `688689`).

## 1. Pharos-aware chain checks (extends `OnChainRiskScanner`)

| Code | Trigger | Severity |
|------|---------|:--------:|
| `WRONG_CHAIN_ID` | Tx signed for a chainId outside the Pharos allowlist but submitted to a Pharos endpoint | critical |
| `EOA_TARGET` | Destination has codesize 0 (looks like an EOA) but calldata is non-empty | medium |
| `UNDEPLOYED_TARGET` | Destination has codesize 0 and value > 0 with non-empty data | high |
| `NON_PHAROS_NATIVE_TOKEN` | Calldata calls `transfer` on an ERC-20 whose chainId binding is not Pharos | high |
| `PHAROS_DEX_ROUTER_UNLIMITED_APPROVE` | `approve(spender, MAX_UINT256)` to a known Pharos DEX router | high |
| `KNOWN_PHAROS_HONEYPOT` | Destination matches the (private) Pharos honeypot risk-list | critical |

## 2. Pharos Skill-Registry checks (extends `BehaviorAnomalyDetector`)

| Code | Trigger | Severity |
|------|---------|:--------:|
| `SKILL_NOT_REGISTERED` | `target_skill` not present in `SentinelRegistry` (or generic Pharos Skill Registry) | high |
| `SKILL_DEACTIVATED` | `target_skill` exists but `active=false` | high |
| `SKILL_PRICE_DRIFT` | Quoted price differs significantly from on-chain `pricePerCall` | medium |
| `AGENT_DID_MALFORMED` | `agent_id` does not match `did:pharos:0x[0-9a-fA-F]{40}` | high |

## 3. Pharos faucet & PHRS economy (extends `BehaviorAnomalyDetector`)

| Code | Trigger | Severity |
|------|---------|:--------:|
| `FAUCET_DRAIN_SUSPECT` | Pull-then-relay pattern within the faucet-drain detection window | high |
| `LOW_PHRS_BALANCE_ATTACK` | Agent keeps emitting actions despite a chronically low PHRS balance | medium |
| `PHRS_VELOCITY` | Hourly PHRS spend exceeds the agent's declared ceiling | high |

The exact detection window length, percentage threshold, and
balance/velocity ceilings are **private** (proprietary heuristics).

## 4. Pharos-specific prompt patterns (extends `PromptGuard`)

| Code | Trigger | Severity |
|------|---------|:--------:|
| `PHAROS_API_KEY_LEAK` | Outbound output contains a Pharos developer API key | critical |
| `PHAROS_PRIVATE_KEY_LEAK` | Outbound output contains a private key matching a known Pharos deployer | critical |
| `PHAROS_SOCIAL_HANDLE_LEAK` | Outbound output reveals the user's Pharos social-graph handle without consent | medium |

The exact key-format regex patterns are private to avoid trivial bypass.

## 5. Aggregation note

Pharos extensions plug into the same per-policy weights as the four
generic modules. Severity-escalation behaviour is identical: any
`critical` evidence forces `BLOCK`; any `high` evidence forces at
least `WARN`.

## 6. Recommended-action mapping (Pharos-specific)

| Evidence code | Recommended action |
|---------------|--------------------|
| `WRONG_CHAIN_ID` | Abort: re-sign the transaction with the Pharos chainId. |
| `KNOWN_PHAROS_HONEYPOT` | Abort: destination is on the Pharos honeypot risk-list; report to Pharos Discord. |
| `PHAROS_DEX_ROUTER_UNLIMITED_APPROVE` | Use the router's `approve(spender, exact)` flow instead of `MAX_UINT256`. |
| `SKILL_NOT_REGISTERED` | Resolve the skill via the Pharos Skill Registry first, then retry. |
| `FAUCET_DRAIN_SUSPECT` | Hold the agent's outbound transfers for a cool-down period after faucet receipt. |
| `PHAROS_API_KEY_LEAK` | Strip the leaked key, rotate via the Pharos developer portal, notify the operator. |
| `AGENT_DID_MALFORMED` | Re-derive the agent's DID using `did:pharos:<checksummed-address>`. |

## 7. Risk-list governance

The Pharos risk-lists (honeypots, mixers, sanctions) are **not
shipped in this repository**. Production deployments load them from:

- A subscribed feed signed by the maintainer
- An on-chain registry contract (planned)
- A locally-curated `private/risklists/*.json` file (gitignored)

The public demo build ships obvious placeholder addresses (e.g.
`0xDEADBEEF…`) so the integration path can be exercised without
revealing real attacker infrastructure. See `config/public-defaults.json`.

## 8. What is intentionally **not** in this document

- Exact numeric scores added by each Pharos trigger
- Exact value of the faucet-drain detection window or pull-relay
  percentage
- Exact key-format regexes for `PHAROS_API_KEY_LEAK` /
  `PHAROS_PRIVATE_KEY_LEAK`
- Real Pharos honeypot / mixer / sanctions addresses
- Pharos DEX router allowlist contents
