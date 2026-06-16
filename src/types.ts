/**
 * Shared types for the AgentSentinel skill runtime.
 */

export type ActionType = "tx" | "message" | "skill_call" | "payment";
export type PolicyLevel = "strict" | "balanced" | "permissive";
export type Verdict = "ALLOW" | "WARN" | "BLOCK";

export interface SentinelPayload {
  to?: string;
  data?: string;
  value?: string;
  prompt?: string;
  output?: string;
  target_skill?: string;
}

export interface SentinelRequest {
  agent_id: string;
  action_type: ActionType;
  payload: SentinelPayload;
  policy_level: PolicyLevel;
  simulate?: boolean;
}

export interface Evidence {
  module: "prompt" | "chain" | "behavior" | "compliance";
  severity: "info" | "low" | "medium" | "high" | "critical";
  code: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ModuleScores {
  prompt: number;
  chain: number;
  behavior: number;
  compliance: number;
}

export interface SentinelResponse {
  verdict: Verdict;
  aggregate_score: number;
  module_scores: ModuleScores;
  evidence: Evidence[];
  recommended_action: string;
  audit_tx_hash: string;
  expires_at: number;
}

export interface ModuleResult {
  score: number;             // 0-100
  evidence: Evidence[];
}

export interface RiskModule {
  name: string;
  evaluate(req: SentinelRequest): Promise<ModuleResult>;
}
