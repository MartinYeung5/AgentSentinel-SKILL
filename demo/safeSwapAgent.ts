/**
 * SafeSwap Agent — reference demo showing how a Pharos agent uses
 * AgentSentinel as its first-line defense before signing any swap tx.
 *
 * Pipeline:
 *   user prompt  -->  PromptGuard precheck
 *                -->  build candidate tx
 *                -->  Sentinel actionCheck (chain + behavior + compliance)
 *                -->  sign & broadcast      [only if verdict != BLOCK]
 */
import { SentinelAggregator } from "../src/aggregator";
import { InMemoryChainLogger } from "../src/audit/chainLogger";
import { BehaviorAnomalyDetector } from "../src/modules/behaviorAnomalyDetector";
import { SentinelRequest } from "../src/types";

async function main(): Promise<void> {
  const behavior = new BehaviorAnomalyDetector();
  behavior.setProfile("did:pharos:safeswap-001", {
    whitelistedSkills: ["DexRouter", "PriceOracle", "AgentSentinel"],
    maxTxPerMinute: 10,
    maxValuePerHourWei: BigInt("5000000000000000000"), // 5 native
  });

  const logger = new InMemoryChainLogger();
  const sentinel = new SentinelAggregator({
    behavior,
    auditLogger: (resp, req) => logger.log(resp, req),
  });

  // -------- step 1: user requests a swap ------------------------------
  const userPrompt = "Please swap 1 PHAR for USDC on the best route.";

  // -------- step 2: agent prepares a candidate approve() tx -----------
  const candidate: SentinelRequest = {
    agent_id: "did:pharos:safeswap-001",
    action_type: "tx",
    policy_level: "strict",
    payload: {
      prompt: userPrompt,
      to: "0x1111111111111111111111111111111111111111", // router
      // approve(spender, MAX_UINT256)  -> this should trigger UNLIMITED_APPROVAL
      data:
        "0x095ea7b3" +
        "0000000000000000000000002222222222222222222222222222222222222222" +
        "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      value: "0",
    },
    simulate: false,
  };

  const verdict = await sentinel.evaluate(candidate);

  // -------- step 3: act on verdict ------------------------------------
  // eslint-disable-next-line no-console
  console.log("Sentinel verdict:", JSON.stringify(verdict, null, 2));

  if (verdict.verdict === "BLOCK") {
    // eslint-disable-next-line no-console
    console.log("Aborting tx. Recommended:", verdict.recommended_action);
    return;
  }

  if (verdict.verdict === "WARN") {
    // In a real agent: surface to user for confirmation.
    // eslint-disable-next-line no-console
    console.log("Proceeding with WARN. User confirmation required:", verdict.recommended_action);
  }

  // ...broadcastTransaction(candidate.payload) -- omitted in demo
}

if (require.main === module) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
}
