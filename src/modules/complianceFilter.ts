import { RiskModule, ModuleResult, SentinelRequest, Evidence } from "../types";

/**
 * ComplianceFilter
 * ----------------------------------------------------------------------------
 * Lightweight KYT (Know-Your-Transaction) layer.
 *   - OFAC / sanctioned-address screening
 *   - Mixer-proximity scoring (1-hop / 2-hop) via injected graph oracle
 *   - Optional jurisdictional flagging
 *
 * For deterministic tests we ship a minimal in-memory sanctions list
 * and a stub graph oracle. Production deployments inject Chainalysis,
 * TRM, or an open-source equivalent behind the same interface.
 */

export interface GraphOracle {
  hopsToMixer(address: string): number | null; // null = unknown / > 2 hops
}

const DEFAULT_SANCTIONS = new Set<string>([
  "0x7f367cc41522ce07553e823bf3be79a889debe1b", // example placeholder
  "0x098b716b8aaf21512996dc57eb0615e2383e2f96", // example placeholder
]);

const DEFAULT_GRAPH: GraphOracle = {
  hopsToMixer: () => null,
};

export class ComplianceFilter implements RiskModule {
  name = "ComplianceFilter";

  constructor(
    private sanctions: Set<string> = DEFAULT_SANCTIONS,
    private graph: GraphOracle = DEFAULT_GRAPH,
  ) {}

  async evaluate(req: SentinelRequest): Promise<ModuleResult> {
    const evidence: Evidence[] = [];
    let score = 0;
    const to = (req.payload.to ?? "").toLowerCase();

    if (!to) return { score, evidence };

    // 1. Sanctions list
    if (this.sanctions.has(to)) {
      score += 100;
      evidence.push({
        module: "compliance",
        severity: "critical",
        code: "SANCTIONED_ADDRESS",
        message: `Destination ${to} is on the sanctions list`,
      });
    }

    // 2. Mixer proximity
    const hops = this.graph.hopsToMixer(to);
    if (hops !== null) {
      if (hops === 0) {
        score += 90;
        evidence.push({
          module: "compliance",
          severity: "critical",
          code: "DIRECT_MIXER",
          message: `Destination ${to} is a mixer contract`,
        });
      } else if (hops === 1) {
        score += 55;
        evidence.push({
          module: "compliance",
          severity: "high",
          code: "MIXER_1HOP",
          message: `Destination ${to} is 1 hop from a mixer`,
        });
      } else if (hops === 2) {
        score += 25;
        evidence.push({
          module: "compliance",
          severity: "medium",
          code: "MIXER_2HOP",
          message: `Destination ${to} is 2 hops from a mixer`,
        });
      }
    }

    if (score > 100) score = 100;
    return { score, evidence };
  }
}
