import { RiskModule, ModuleResult, SentinelRequest, Evidence } from "../types";

/**
 * BehaviorAnomalyDetector
 * ----------------------------------------------------------------------------
 * Monitors the *calling agent itself* against its declared behavioral
 * profile. Stateless inputs come in via SentinelRequest; the detector
 * keeps a small in-memory ring buffer per agent_id to compute
 * frequency and spending velocity. In production this state lives
 * in Redis behind the same interface.
 */

interface AgentProfile {
  whitelistedSkills?: string[];      // optional declared scope
  maxTxPerMinute?: number;           // declared rate ceiling
  maxValuePerHourWei?: bigint;       // declared spend ceiling
}

interface RecentAction {
  ts: number;        // ms epoch
  value: bigint;     // wei
  skill?: string;
}

export class BehaviorAnomalyDetector implements RiskModule {
  name = "BehaviorAnomalyDetector";

  private history = new Map<string, RecentAction[]>();
  private profiles = new Map<string, AgentProfile>();

  setProfile(agentId: string, profile: AgentProfile): void {
    this.profiles.set(agentId, profile);
  }

  private recordAction(agentId: string, action: RecentAction): void {
    const arr = this.history.get(agentId) ?? [];
    arr.push(action);
    // keep only last hour
    const cutoff = Date.now() - 60 * 60 * 1000;
    while (arr.length && arr[0].ts < cutoff) arr.shift();
    this.history.set(agentId, arr);
  }

  async evaluate(req: SentinelRequest): Promise<ModuleResult> {
    const evidence: Evidence[] = [];
    let score = 0;

    const profile = this.profiles.get(req.agent_id) ?? {};
    const now = Date.now();
    const value =
      req.payload.value && /^\d+$/.test(req.payload.value)
        ? BigInt(req.payload.value)
        : BigInt(0);

    // 1. Whitelist scope check
    if (
      req.action_type === "skill_call" &&
      profile.whitelistedSkills &&
      req.payload.target_skill &&
      !profile.whitelistedSkills.includes(req.payload.target_skill)
    ) {
      score += 40;
      evidence.push({
        module: "behavior",
        severity: "high",
        code: "SCOPE_VIOLATION",
        message: `Agent invoked non-whitelisted skill '${req.payload.target_skill}'`,
        data: { whitelist: profile.whitelistedSkills },
      });
    }

    // 2. Frequency anomaly (rate over last 60s)
    const recent = this.history.get(req.agent_id) ?? [];
    const last60s = recent.filter((a) => now - a.ts <= 60_000).length;
    const rateLimit = profile.maxTxPerMinute ?? 30;
    if (last60s + 1 > rateLimit) {
      score += 25;
      evidence.push({
        module: "behavior",
        severity: "medium",
        code: "RATE_ANOMALY",
        message: `Agent exceeded ${rateLimit} actions/min (current=${last60s + 1})`,
      });
    }

    // 3. Spending velocity (last 3600s)
    const lastHourValue = recent.reduce((s, a) => s + a.value, BigInt(0)) + value;
    const valueCap = profile.maxValuePerHourWei ?? BigInt("10000000000000000000"); // 10 native
    if (lastHourValue > valueCap) {
      score += 30;
      evidence.push({
        module: "behavior",
        severity: "high",
        code: "SPEND_VELOCITY",
        message: `Hourly spend ${lastHourValue.toString()} wei exceeds cap ${valueCap.toString()} wei`,
      });
    }

    // 4. Burst detection: >5 actions in last 5 seconds
    const last5s = recent.filter((a) => now - a.ts <= 5_000).length;
    if (last5s >= 5) {
      score += 15;
      evidence.push({
        module: "behavior",
        severity: "medium",
        code: "BURST",
        message: `Burst of ${last5s + 1} actions in 5s window`,
      });
    }

    // record this action (post-evaluation so it does not self-count)
    this.recordAction(req.agent_id, {
      ts: now,
      value,
      skill: req.payload.target_skill,
    });

    if (score > 100) score = 100;
    return { score, evidence };
  }
}
