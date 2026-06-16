# Pharos Testnet — Network Reference

Loaded on demand when an AI agent (or operator) needs the precise
network constants, RPC URLs, faucet, explorer, or contract addresses
for the Pharos testnet target of this skill.

> All values must be verified against <https://docs.pharos.xyz> before
> production use. Pharos is in active testnet development and constants
> can change between releases. The skill always cross-checks `chainId`
> at runtime via `eth_chainId`.

## Network constants

| Field | Value |
|-------|-------|
| Network name      | Pharos Testnet |
| ChainID (canonical) | `688689` (`0xa8190` hex) |
| ChainID (observed on `dplabs-internal` endpoint) | `688689` (`0xa8191`) — accepted by skill as alias |
| Native token symbol | `PHRS` |
| Native token decimals | 18 |
| EVM target | `paris` (PUSH0 NOT supported by all Pharos client versions) |
| Block time | ~1–2 s |
| Default gas price | 10 gwei (legacy fee model) |
| Skill ABI version | Pharos Skill Standard v1 |

## Public endpoints

| Service | URL |
|---------|-----|
| RPC (general) | `https://testnet.dplabs-internal.com` |
| RPC (alternate, atlantic) | `https://atlantic.dplabs-internal.com` |
| RPC (devnet, may differ chainId) | `https://devnet.dplabs-internal.com` |
| Block explorer (primary) | `https://pharos-testnet.socialscan.io` |
| Block explorer (alternate) | `https://testnet.pharosscan.xyz` |
| Faucet portal | linked from <https://docs.pharos.xyz> |
| Documentation | <https://docs.pharos.xyz> |

> **Important** — the two block explorers index different node sets and
> may show different state. Always cross-check tx hashes on both before
> declaring a deployment "failed".

## Hardhat configuration snippet

```ts
// hardhat.config.ts
import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import type { HardhatUserConfig } from "hardhat/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",          // ← required, avoids PUSH0
    },
  },
  networks: {
    pharosTestnet: {
      url:      process.env.PHAROS_RPC_URL  || "https://testnet.dplabs-internal.com",
      chainId:  Number(process.env.PHAROS_CHAIN_ID || 688689),
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
export default config;
```

## Sample `.env`

```
PHAROS_RPC_URL=https://testnet.dplabs-internal.com
PHAROS_CHAIN_ID=688689
PHAROS_EXPLORER_URL=https://pharos-testnet.socialscan.io
PHAROS_REGISTRY_ADDR=0x<fill-after-deploy>
DEPLOYER_PRIVATE_KEY=<64 hex, with or without 0x>
PORT=8787
```

## Faucet notes

The faucet portal linked from `docs.pharos.xyz` typically requires:

1. A Twitter or Discord proof-of-personhood
2. Pasting the deployer wallet address
3. Solving a captcha
4. ~1–2 minutes for PHRS to land

Recommend funding **at least 1 PHRS** before attempting deployments —
each `Sentinel*` contract costs ~0.05 PHRS to deploy at the default
10 gwei price.

## Block-explorer URL templates

The skill embeds these patterns in evidence so AI agents can surface
verifiable links to the user:

| Resource | URL pattern |
|----------|-------------|
| Address | `https://pharos-testnet.socialscan.io/address/{addr}` |
| Tx | `https://pharos-testnet.socialscan.io/tx/{hash}` |
| Block | `https://pharos-testnet.socialscan.io/block/{number}` |
| Token | `https://pharos-testnet.socialscan.io/token/{addr}` |

## Deployed Sentinel contracts

After running `npm run deploy:pharos`, fill these in:

| Contract | Pharos testnet address |
|----------|------------------------|
| `SentinelRegistry` | `0x<fill>` |
| `SentinelAuditLog` | `0x<fill>` |
| `SentinelPayments` | `0x<fill>` |

## Known deployment caveats

1. **PUSH0 opcode** — older Pharos client builds reject PUSH0 (opcode
   `0x5f`). Always compile with `evmVersion: "paris"`.

2. **Possible deployer-creation gating** — some Pharos testnet builds
   accept the deploy tx into a block but immediately revert with
   `gasUsed = 21000`, leaving an empty contract slot. If you observe
   this, verify on `pharos-testnet.socialscan.io` that the tx
   `Input Data` field is intact (proves the RPC didn't strip it), then
   contact the Pharos team via Discord — this is a chain-side
   permission issue, not a code issue.

3. **Two-explorer drift** — a deployment may be visible on one explorer
   and not the other. Always verify on both.

4. **Node v23 is unsupported by Hardhat 2.x** — Pharos deployment
   tooling uses Hardhat 2.x. Pin Node to LTS (v20 or v22).
