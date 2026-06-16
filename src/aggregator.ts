import {
  SentinelRequest,
  SentinelResponse,
  Evidence,
  ModuleScores,
  Verdict,
  PolicyLevel,
  RiskModule,
} from "./types";
import { PromptGuard } from "./modules/promptGuard";
import { OnChainRiskScanner } from "./modules/onChainRiskScanner";
import { BehaviorAnomalyDetector } from "./modules/behaviorAnomalyDetector";
import { ComplianceFilter } from "./modules/complianceFilter";

const WEIGHTS: Record<PolicyLevel, ModuleScores> = {
  strict:     { prompt: 0.25, chain: 0.35, behavior: 0.20, compliance: 0.20 },
  balanced:   { prompt: 0.20, chain: 0.35, behavior: 0.25, compliance: 0.20 },
  permissive: { prompt: 0.15, chain: 0.30, behavior: 0.25, compliance: 0.30 },
};

// thresholds: tighter for strict, looser for permissive
const THRESHOLDS: Record<PolicyLevel, { warn: number; block: number }> = {
  strict:     { warn: 30, block: 60 },
  balanced:   { warn: 40, block: 70 },
  permissive: { warn: 50, block: 80 },
};

export interface AggregatorOptions {
  prompt?: RiskModule;
  chain?: RiskModule;
  behavior?: RiskModule;
  compliance?: RiskModule;
  auditLogger?: (resp: SentinelResponse, req: SentinelRequest) => Promise<string>;
}

export class SentinelAggregator {
  prompt: RiskModule;
  chain: RiskModule;
  behavior: RiskModule;
  compliance: RiskModule;
  auditLogger?: (resp: SentinelResponse, req: SentinelRequest) => Promise<string>;

  constructor(opts: AggregatorOptions = {}) {
    this.prompt     = opts.prompt     ?? new PromptGuard();
    this.chain      = opts.chain      ?? new OnChainRiskScanner();
    this.behavior   = opts.behavior   ?? new BehaviorAnomalyDetector();
    this.compliance = opts.compliance ?? new ComplianceFilter();
    this.auditLogger = opts.auditLogger;
  }

  async evaluate(req: SentinelRequest): Promise<SentinelResponse> {
    const [p, c, b, k] = await Promise.all([
      this.prompt.evaluate(req),
      this.chain.evaluate(req),
      this.behavior.evaluate(req),
      this.compliance.evaluate(req),
    ]);

    const module_scores: ModuleScores = {
      prompt: p.score,
      chain: c.score,
      behavior: b.score,
      compliance: k.score,
    };

    const w = WEIGHTS[req.policy_level];
    const aggregate_score = Math.round(
      module_scores.prompt * w.prompt +
      module_scores.chain * w.chain +
      module_scores.behavior * w.behavior +
      module_scores.compliance * w.compliance,
    );

    const evidence: Evidence[] = [
      ...p.evidence, ...c.evidence, ...b.evidence, ...k.evidence,
    ];

    // Severity-escalation rules (cannot be bypassed by low weighted score):
    //   any "critical" evidence  -> BLOCK
    //   any "high"     evidence  -> at least WARN
    const hasCritical = evidence.some((e) => e.severity === "critical");
    const hasHigh     = evidence.some((e) => e.severity === "high");
    const t = THRESHOLDS[req.policy_level];

    let verdict: Verdict;
    if (hasCritical || aggregate_score >= t.block) {
      verdict = "BLOCK";
    } else if (hasHigh || aggregate_score >= t.warn) {
      verdict = "WARN";
    } else {
      verdict = "ALLOW";
    }

    const recommended_action = this.recommend(verdict, evidence);

    const response: SentinelResponse = {
      verdict,
      aggregate_score,
      module_scores,
      evidence,
      recommended_action,
      audit_tx_hash: "0x0",
      expires_at: Math.floor(Date.now() / 1000) + 300, // 5-minute validity
    };

    if (this.auditLogger) {
      try {
        response.audit_tx_hash = await this.auditLogger(response, req);
      } catch {
        response.audit_tx_hash = "0xLOG_FAILED";
      }
    }

    return response;
  }

  private recommend(verdict: Verdict, evidence: Evidence[]): string {
    if (verdict === "ALLOW") return "Proceed with action.";
    const top = evidence
      .slice()
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
    if (!top) return verdict === "BLOCK" ? "Abort action." : "Request user confirmation.";

    switch (top.code) {
      case "UNLIMITED_APPROVAL":
        return "Reduce ERC20 allowance to the exact required amount.";
      case "HONEYPOT_TARGET":
        return "Abort: destination contract is a known honeypot.";
      case "SANCTIONED_ADDRESS":
        return "Abort: destination is on the sanctions list.";
      case "DIRECT_MIXER":
      case "MIXER_1HOP":
        return "Abort: destination has direct exposure to mixers.";
      case "PROMPT_INJECTION":
        return "Reject user prompt and respond with safe-completion template.";
      case "SECRET_LEAK":
        return "Strip secret material from outbound response before sending.";
      case "RATE_ANOMALY":
      case "BURST":
        return "Throttle agent: enforce cool-down before next action.";
      case "SCOPE_VIOLATION":
        return "Reject skill invocation: not in declared whitelist.";
      case "SPEND_VELOCITY":
        return "Halt further spending until next budget window.";
      default:
        return verdict === "BLOCK"
          ? "Abort action and notify agent operator."
          : "Request user confirmation before proceeding.";
    }
  }
}

function severityRank(s: Evidence["severity"]): number {
  return { info: 0, low: 1, medium: 2, high: 3, critical: 4 }[s];
}

export { WEIGHTS, THRESHOLDS };
