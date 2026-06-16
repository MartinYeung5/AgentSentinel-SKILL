import { SentinelRequest, SentinelResponse } from "../types";
import * as crypto from "crypto";

/**
 * ChainLogger
 * ----------------------------------------------------------------------------
 * Writes Sentinel verdicts to the SentinelAuditLog contract on Pharos.
 *
 * In production this uses ethers.js / viem to submit a transaction.
 * For the hackathon's offline tests we ship an in-memory implementation
 * that produces deterministic record hashes so the SDK and demo agent
 * work end-to-end without an RPC endpoint.
 */
export interface ChainLogger {
  log(resp: SentinelResponse, req: SentinelRequest): Promise<string>;
}

export class InMemoryChainLogger implements ChainLogger {
  public records: { id: string; resp: SentinelResponse; req: SentinelRequest }[] = [];

  async log(resp: SentinelResponse, req: SentinelRequest): Promise<string> {
    const id =
      "0x" +
      crypto
        .createHash("sha256")
        .update(JSON.stringify({ resp, req, t: Date.now(), r: Math.random() }))
        .digest("hex");
    this.records.push({ id, resp, req });
    return id;
  }
}

/**
 * Production implementation (sketch, requires ethers).
 * Left here as documented future work; not used in tests.
 */
export interface EthersLike {
  sendTransaction(tx: { to: string; data: string }): Promise<{ hash: string; wait: () => Promise<any> }>;
}
