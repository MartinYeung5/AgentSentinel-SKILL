/**
 * AgentSentinel — public entry point.
 * Exports the aggregator, modules, types, and audit logger so other
 * Pharos skills and SDKs can compose them.
 */
export * from "./types";
export { SentinelAggregator, WEIGHTS, THRESHOLDS } from "./aggregator";
export { PromptGuard } from "./modules/promptGuard";
export { OnChainRiskScanner } from "./modules/onChainRiskScanner";
export { BehaviorAnomalyDetector } from "./modules/behaviorAnomalyDetector";
export { ComplianceFilter } from "./modules/complianceFilter";
export { InMemoryChainLogger, ChainLogger } from "./audit/chainLogger";
