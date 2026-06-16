# AgentSentinel — Risk Modules (Public Specification)

This document is the **public specification** of the four base risk
modules. It describes *what* each module detects and the *severity
class* it assigns, but **not** the exact numeric scores, regex
patterns, or threshold values used in production.

> Why? Publishing exact thresholds and patterns would let attackers
> deterministically calibrate their behaviour to stay just below
> detection. See `SECURITY.md` for the public / private boundary.

The public bundle ships **demo defaults** in `config/public-defaults.json`
that are good enough to demonstrate behaviour; production deployments
override them via `private/` (gitignored) or via runtime config.

Severity classes used throughout: `info < low < medium < high < critical`.

## 1. Module: `PromptGuard`

Targets the prompt / output text that flows in or out of the agent.

| Trigger class | Severity |
|---------------|:--------:|
| Prompt-injection patterns (jailbreak / instruction-override / role-hijack) | high |
| Outbound output contains a likely secret (private key, mnemonic, API key) | critical |
| Outbound output contains a likely PII string (email, social handle) | critical |
| Skill-call intent mismatch (tool requested but user prompt does not justify it) | medium |
| Token-flood / repetition attack | low |

Exact regex patterns and the LLM classifier prompt are private.

## 2. Module: `OnChainRiskScanner`

Targets the destination contract and calldata of a pending tx.

| Trigger class | Severity |
|---------------|:--------:|
| Destination on the honeypot risk-list | critical |
| Destination on the mixer risk-list | high |
| Destination is a proxy with mutable implementation | medium |
| `approve(spender, MAX_UINT256)` (unlimited approval) | high |
| `approve(spender, bounded)` | info |
| `transfer(to, amount)` baseline signal | info |
| Native value above the per-call ceiling | low |
| Dry-run via `eth_call` reverts (when `simulate=true`) | high |

Exact risk-list contents are private. They can be queried per-address
through the future `/v1/risklist/check` endpoint without exposing the
full list.

## 3. Module: `BehaviorAnomalyDetector`

Targets the calling agent itself. Stateless inputs come in via the
SentinelRequest; the detector keeps a per-agent ring buffer to compute
frequency and spending velocity.

| Trigger class | Severity |
|---------------|:--------:|
| Skill not in the agent's declared whitelist | high |
| Action rate exceeds the agent's declared `maxTxPerMinute` | medium |
| Hourly spend exceeds the agent's declared `maxValuePerHourWei` | high |
| Burst (many actions in a very short window) | medium |

The exact rate-limit windows, burst sizes, and default ceilings are
private (and per-deployment configurable).

## 4. Module: `ComplianceFilter`

Targets the destination address against sanctions and mixer-graph data.

| Trigger class | Severity |
|---------------|:--------:|
| Destination on the sanctions list | critical |
| Destination is a mixer (0 hops) | critical |
| Destination 1 hop from a mixer | high |
| Destination 2 hops from a mixer | medium |

Sanctions data sources, the mixer-graph oracle, and proximity-decay
parameters are private.

## 5. Aggregation (public)

Per-policy weights apply across the four modules:

| Policy | prompt | chain | behavior | compliance |
|--------|:------:|:-----:|:--------:|:----------:|
| `strict`     | higher | highest | medium | medium |
| `balanced`   | medium | highest | medium | medium |
| `permissive` | lower  | high    | medium | highest |

Verdict bands (concept, not exact numbers):

| Policy | ALLOW | WARN | BLOCK |
|--------|:-----:|:----:|:-----:|
| `strict`     | low band | mid band | high band |
| `balanced`   | wider low band | wider mid band | high band |
| `permissive` | widest low band | widest mid band | very high band |

Exact numeric weights and band edges are visible in the source code
of the public demo build (`src/aggregator.ts`) but are intentionally
treated as **demo defaults**, not production constants. Production
deployments are expected to override them via configuration.

**Severity-escalation rule (public, cannot be bypassed):**

- Any evidence of `critical` severity → `BLOCK`
- Any evidence of `high` severity     → at least `WARN`

This rule is intentionally publicised because it is the contract
between the skill and its callers — agents and users need to be able
to reason about minimum guarantees regardless of policy choice.

## 6. Recommended-action mapping (public)

| Evidence code class | Recommended action |
|---------------------|--------------------|
| `UNLIMITED_APPROVAL` | Reduce ERC20 allowance to the exact required amount. |
| `HONEYPOT_TARGET` | Abort: destination contract is on the honeypot risk-list. |
| `SANCTIONED_ADDRESS` | Abort: destination is on the sanctions list. |
| `DIRECT_MIXER` / `MIXER_1HOP` | Abort: destination has direct exposure to mixers. |
| `PROMPT_INJECTION` | Reject user prompt and respond with safe-completion template. |
| `SECRET_LEAK` | Strip secret material from outbound response before sending. |
| `RATE_ANOMALY` / `BURST` | Throttle agent: enforce cool-down before next action. |
| `SCOPE_VIOLATION` | Reject skill invocation: not in declared whitelist. |
| `SPEND_VELOCITY` | Halt further spending until next budget window. |
| (any other on `BLOCK`) | Abort action and notify agent operator. |
| (any other on `WARN`) | Request user confirmation before proceeding. |

## 7. What is intentionally **not** in this document

- Exact numeric scores added by each trigger
- Exact threshold values (rate limits, burst windows, value ceilings)
- Exact regex patterns of injection / secret detectors
- Risk-list addresses (honeypots, mixers, sanctions)
- LLM-classifier prompt template
- Aggregator weight numbers (those leak the calibration target)

These live in `private/*.json` (gitignored) for production and in
`config/public-defaults.json` for the public demo.
