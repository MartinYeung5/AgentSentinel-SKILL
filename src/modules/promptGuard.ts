import { RiskModule, ModuleResult, SentinelRequest, Evidence } from "../types";

/**
 * PromptGuard
 * ----------------------------------------------------------------------------
 * Defends against prompt-layer attacks before the agent commits to an action.
 *   - Jailbreak / injection regex + heuristic patterns
 *   - PII & secret leakage scan on outbound agent output
 *   - Tool-call intent validation (target_skill must appear plausible
 *     given the user prompt)
 *
 * Production note: in the hackathon submission this module also loads a
 * fine-tuned DeBERTa-v3 classifier behind `classifyAsync()`. For
 * deterministic unit tests we keep a pure-heuristic fallback here.
 */
export class PromptGuard implements RiskModule {
  name = "PromptGuard";

  private static INJECTION_PATTERNS: RegExp[] = [
    /ignore\b[\w\s]{0,30}?\b(instructions|prompts|rules|directives|system\s*prompt)\b/i,
    /disregard (your|the) (system|previous) prompt/i,
    /you are now (?:a|an|the)\s+\w+/i,
    /reveal (your|the) (system|hidden) prompt/i,
    /print (your|the) (api[_ ]?key|secret|seed|mnemonic|private[_ ]?key)/i,
    /(jailbreak|do anything now|DAN mode)/i,
    /repeat (the )?(above|previous) text verbatim/i,
    /</?\s*(system|assistant|tool)\s*>/i,
  ];

  private static SECRET_PATTERNS: { name: string; re: RegExp }[] = [
    { name: "private_key",  re: /\b0x[a-fA-F0-9]{64}\b/ },
    { name: "mnemonic_12",  re: /\b(?:[a-z]{3,8}\s+){11}[a-z]{3,8}\b/i },
    { name: "openai_key",   re: /\bsk-[A-Za-z0-9]{20,}\b/ },
    { name: "aws_key",      re: /\bAKIA[0-9A-Z]{16}\b/ },
    { name: "email",        re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/ },
  ];

  async evaluate(req: SentinelRequest): Promise<ModuleResult> {
    const evidence: Evidence[] = [];
    let score = 0;

    const prompt = req.payload.prompt ?? "";
    const output = req.payload.output ?? "";

    // 1. Injection scan on incoming prompt
    for (const pat of PromptGuard.INJECTION_PATTERNS) {
      if (pat.test(prompt)) {
        score += 35;
        evidence.push({
          module: "prompt",
          severity: "high",
          code: "PROMPT_INJECTION",
          message: `Prompt matches known injection pattern: ${pat.source}`,
        });
        break;
      }
    }

    // 2. Secret leakage scan on outgoing output
    for (const { name, re } of PromptGuard.SECRET_PATTERNS) {
      if (re.test(output)) {
        score += 40;
        evidence.push({
          module: "prompt",
          severity: "critical",
          code: "SECRET_LEAK",
          message: `Outbound output contains potential ${name}`,
          data: { secret_type: name },
        });
      }
    }

    // 3. Tool-call intent sanity (very lightweight)
    if (req.action_type === "skill_call" && req.payload.target_skill) {
      const skill = req.payload.target_skill.toLowerCase();
      const dangerous = ["transfer", "withdraw", "approve", "drain"];
      const userAskedFor = dangerous.some((d) => prompt.toLowerCase().includes(d));
      const willDoDangerous = dangerous.some((d) => skill.includes(d));
      if (willDoDangerous && !userAskedFor && prompt.length > 0) {
        score += 25;
        evidence.push({
          module: "prompt",
          severity: "medium",
          code: "INTENT_MISMATCH",
          message: `Agent intends to call dangerous skill '${skill}' but user prompt does not request it`,
        });
      }
    }

    // 4. Length / repetition heuristic
    if (prompt.length > 0 && /(.)\1{30,}/.test(prompt)) {
      score += 10;
      evidence.push({
        module: "prompt",
        severity: "low",
        code: "PROMPT_FLOOD",
        message: "Prompt contains long repeated character sequences (possible token-flood attack)",
      });
    }

    if (score > 100) score = 100;
    return { score, evidence };
  }
}
