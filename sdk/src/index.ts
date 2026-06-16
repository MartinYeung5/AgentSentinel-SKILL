/**
 * @pharos/skill-sentinel
 *
 * Thin SDK wrapper any Pharos agent can use to call AgentSentinel
 * with one line of code:
 *
 *   import { Sentinel } from "@pharos/skill-sentinel";
 *   const sentinel = new Sentinel({ endpoint: "https://sentinel.pharos.skills" });
 *   const result = await sentinel.check({ ... });
 *   if (result.verdict === "BLOCK") agent.abort(result.recommended_action);
 */
import type {
  SentinelRequest,
  SentinelResponse,
  PolicyLevel,
} from "../../src/types";

export interface SentinelClientOptions {
  endpoint: string;          // e.g. http://localhost:8787
  apiKey?: string;
  defaultPolicy?: PolicyLevel;
  fetchImpl?: typeof fetch;  // injectable for tests
  timeoutMs?: number;
}

export class Sentinel {
  constructor(private opts: SentinelClientOptions) {}

  async check(req: SentinelRequest): Promise<SentinelResponse> {
    const policy = req.policy_level ?? this.opts.defaultPolicy ?? "balanced";
    const body: SentinelRequest = { ...req, policy_level: policy };

    const fetcher = this.opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
    if (!fetcher) {
      throw new Error("No fetch implementation available; pass fetchImpl in options");
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 10_000);
    try {
      const res = await fetcher(`${this.opts.endpoint}/v1/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.opts.apiKey ? { Authorization: `Bearer ${this.opts.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Sentinel returned HTTP ${res.status}`);
      }
      return (await res.json()) as SentinelResponse;
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Guard helper: throws if the action should be blocked, otherwise
   * returns the response so the caller can still inspect WARN/ALLOW.
   */
  async guard(req: SentinelRequest): Promise<SentinelResponse> {
    const resp = await this.check(req);
    if (resp.verdict === "BLOCK") {
      const err = new Error(`Sentinel BLOCKED action: ${resp.recommended_action}`);
      (err as any).sentinel = resp;
      throw err;
    }
    return resp;
  }
}

export type { SentinelRequest, SentinelResponse, PolicyLevel };
