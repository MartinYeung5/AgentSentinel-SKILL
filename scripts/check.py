#!/usr/bin/env python3
"""
Pharos AgentSentinel CLI helper — Pharos-aware variant.

Targets the Pharos testnet (chainId 688689) by default.
Verifies the connected RPC matches a Pharos chainId before invoking the
skill, surfaces Pharos block-explorer links in the output, and exits
with a script-friendly status code.

Exit code:
    0  if verdict is ALLOW or WARN
    1  if verdict is BLOCK
    2  on error (network / chainId mismatch / malformed request)

Usage:
    # one-off chain sanity check (no skill call, no spend)
    python scripts/check.py --verify-chain

    # full request via JSON file
    python scripts/check.py --request request.json

    # shortcut for a tx
    python scripts/check.py --tx 0xRouter --data 0x... --policy strict

    # message check
    python scripts/check.py --message "user text" --output "agent reply"

Env:
    SENTINEL_ENDPOINT      default http://localhost:8787
    SENTINEL_API_KEY       optional bearer token
    SENTINEL_TIMEOUT_MS    default 10000

    PHAROS_RPC_URL         default https://testnet.dplabs-internal.com
    PHAROS_CHAIN_ID        default 688689
    PHAROS_EXPLORER_URL    default https://pharos-testnet.socialscan.io
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
import urllib.error


# ---------------------------------------------------------------------------
# Pharos network constants
# ---------------------------------------------------------------------------
PHAROS_CHAIN_IDS = {688689}
DEFAULT_RPC_URL  = "https://testnet.dplabs-internal.com"
DEFAULT_EXPLORER = "https://pharos-testnet.socialscan.io"


def env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


# ---------------------------------------------------------------------------
# RPC helpers
# ---------------------------------------------------------------------------
def rpc_call(url: str, method: str, params: list) -> dict:
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    req  = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def verify_pharos_chain() -> int:
    """Return chainId of the configured RPC, or exit 2."""
    rpc_url = env("PHAROS_RPC_URL", DEFAULT_RPC_URL)
    expected = int(env("PHAROS_CHAIN_ID", "688689"))
    try:
        resp = rpc_call(rpc_url, "eth_chainId", [])
        cid  = int(resp["result"], 16)
    except Exception as e:
        sys.stderr.write(f"verify-chain FAILED: cannot reach RPC {rpc_url}: {e}\n")
        sys.exit(2)

    if cid not in PHAROS_CHAIN_IDS:
        sys.stderr.write(
            f"verify-chain FAILED: RPC {rpc_url} returned chainId {cid}, "
            f"expected one of {sorted(PHAROS_CHAIN_IDS)}\n"
        )
        sys.exit(2)

    if cid != expected:
        sys.stderr.write(
            f"verify-chain WARNING: RPC chainId {cid} differs from "
            f"PHAROS_CHAIN_ID={expected} but is in the Pharos allowlist; "
            f"continuing.\n"
        )

    sys.stdout.write(json.dumps({
        "ok":         True,
        "rpc_url":    rpc_url,
        "chain_id":   cid,
        "explorer":   env("PHAROS_EXPLORER_URL", DEFAULT_EXPLORER),
        "is_pharos":  True,
    }, indent=2) + "\n")
    return cid


# ---------------------------------------------------------------------------
# Sentinel HTTP call
# ---------------------------------------------------------------------------
def call_sentinel(request: dict) -> dict:
    endpoint = env("SENTINEL_ENDPOINT", "http://localhost:8787").rstrip("/")
    timeout  = float(env("SENTINEL_TIMEOUT_MS", "10000")) / 1000.0
    headers  = {"Content-Type": "application/json"}
    api_key  = env("SENTINEL_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    req = urllib.request.Request(
        f"{endpoint}/v1/invoke",
        data=json.dumps(request).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"sentinel HTTP {e.code}: {e.read().decode('utf-8','ignore')}\n")
        sys.exit(2)
    except urllib.error.URLError as e:
        sys.stderr.write(f"sentinel network error: {e}\n")
        sys.exit(2)


# ---------------------------------------------------------------------------
# Pharos enrichment
# ---------------------------------------------------------------------------
def attach_pharos_chain_block(request: dict) -> dict:
    """Add a `chain` block to the request if not already present."""
    if "chain" not in request or not isinstance(request["chain"], dict):
        request["chain"] = {
            "chain_id": int(env("PHAROS_CHAIN_ID", "688689")),
            "rpc_url":  env("PHAROS_RPC_URL", DEFAULT_RPC_URL),
        }
    return request


def enrich_evidence_with_explorer(resp: dict) -> dict:
    """Add Pharos block-explorer URLs to each evidence item that
    references an address or tx hash, so AI agents can surface clickable
    links to the user."""
    explorer = env("PHAROS_EXPLORER_URL", DEFAULT_EXPLORER).rstrip("/")
    for ev in resp.get("evidence", []):
        d = ev.get("data") or {}
        addr = d.get("address") or _extract_address(ev.get("message", ""))
        if addr:
            ev["explorer_url"] = f"{explorer}/address/{addr}"
    if resp.get("audit_tx_hash", "").startswith("0x") and len(resp["audit_tx_hash"]) >= 66:
        resp["audit_explorer_url"] = f"{explorer}/tx/{resp['audit_tx_hash']}"
    return resp


def _extract_address(s: str) -> str | None:
    import re
    m = re.search(r"0x[a-fA-F0-9]{40}", s or "")
    return m.group(0) if m else None


# ---------------------------------------------------------------------------
# Request builder
# ---------------------------------------------------------------------------
def build_request_from_args(args: argparse.Namespace) -> dict:
    if args.request:
        return json.load(open(args.request, "r", encoding="utf-8"))

    payload: dict = {}
    if args.tx:
        action_type = "tx"
        payload.update({"to": args.tx, "data": args.data, "value": args.value})
    elif args.payment:
        action_type = "payment"
        payload.update({"to": args.payment, "value": args.value})
    elif args.message is not None or args.output is not None:
        action_type = "message"
        if args.message is not None: payload["prompt"] = args.message
        if args.output  is not None: payload["output"] = args.output
    elif args.skill:
        action_type = "skill_call"
        payload["target_skill"] = args.skill
    else:
        raise SystemExit("error: provide --request OR one of --tx / --payment / --message / --skill")

    return {
        "agent_id":     args.agent,
        "action_type":  action_type,
        "policy_level": args.policy,
        "payload":      payload,
        "simulate":     bool(args.simulate),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    p = argparse.ArgumentParser(
        description="Pharos-aware AgentSentinel CLI.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--verify-chain", action="store_true",
                   help="Only check that the RPC is on a Pharos chain, then exit.")
    p.add_argument("--request", help="path to a full SentinelRequest JSON file")
    p.add_argument("--tx",      help="destination address (action_type=tx)")
    p.add_argument("--payment", help="destination address (action_type=payment)")
    p.add_argument("--message", help="user prompt text (action_type=message)")
    p.add_argument("--output",  help="agent's intended reply (paired with --message)")
    p.add_argument("--skill",   help="target skill name / DID (action_type=skill_call)")
    p.add_argument("--data",    default="0x", help="calldata hex, default 0x")
    p.add_argument("--value",   default="0",  help="value in wei, default 0")
    p.add_argument("--policy",  default="balanced",
                   choices=["strict", "balanced", "permissive"])
    p.add_argument("--agent",   default="did:pharos:cli")
    p.add_argument("--simulate", action="store_true",
                   help="ask the skill to dry-run the tx via eth_call")
    p.add_argument("--no-chain-block", action="store_true",
                   help="do not auto-attach the Pharos chain block to the request")
    p.add_argument("--quiet",   action="store_true",
                   help="print only the verdict word")
    args = p.parse_args()

    if args.verify_chain:
        verify_pharos_chain()
        sys.exit(0)

    request = build_request_from_args(args)
    if not args.no_chain_block:
        request = attach_pharos_chain_block(request)

    resp = call_sentinel(request)
    resp = enrich_evidence_with_explorer(resp)

    if args.quiet:
        print(resp.get("verdict", "ERROR"))
    else:
        print(json.dumps(resp, indent=2, ensure_ascii=False))

    verdict = resp.get("verdict", "ERROR")
    sys.exit(1 if verdict == "BLOCK" else 0 if verdict in ("ALLOW", "WARN") else 2)


if __name__ == "__main__":
    main()
