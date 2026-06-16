import { RiskModule, ModuleResult, SentinelRequest, Evidence } from "../types";

/**
 * OnChainRiskScanner
 * ----------------------------------------------------------------------------
 * Inspects the target of any pending transaction:
 *   - ERC20 approve() with unlimited allowance is flagged
 *   - Calls to contracts on the local risk-list (proxy w/ mutable impl,
 *     known honeypots, mixers) are blocked
 *   - Dry-run via eth_call when `simulate=true` (mocked here so the
 *     skill can run offline / in unit tests)
 *
 * The class accepts an optional `chainClient` so production deployments
 * can plug in an ethers.js / viem provider. In tests we inject a stub.
 */
export interface ChainClient {
  getCode(address: string): Promise<string>;
  call(tx: { to: string; data: string; value?: string }): Promise<string>;
}

export interface RiskList {
  isHoneypot(address: string): boolean;
  isMixer(address: string): boolean;
  isMutableProxy(address: string): boolean;
}

const DEFAULT_RISK_LIST: RiskList = {
  isHoneypot: (a) =>
    ["0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"].includes(a.toLowerCase()),
  isMixer: (a) =>
    ["0x000000000000000000000000000000000000dead"].includes(a.toLowerCase()),
  isMutableProxy: () => false,
};

const APPROVE_SELECTOR = "0x095ea7b3";              // approve(address,uint256)
const TRANSFER_SELECTOR = "0xa9059cbb";             // transfer(address,uint256)
const MAX_UINT256 =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

export class OnChainRiskScanner implements RiskModule {
  name = "OnChainRiskScanner";

  constructor(
    private chainClient?: ChainClient,
    private riskList: RiskList = DEFAULT_RISK_LIST,
  ) {}

  async evaluate(req: SentinelRequest): Promise<ModuleResult> {
    const evidence: Evidence[] = [];
    let score = 0;

    if (req.action_type !== "tx" && req.action_type !== "payment") {
      return { score, evidence };
    }
    const { to, data = "0x", value = "0" } = req.payload;
    if (!to) {
      return { score, evidence };
    }

    // 1. Risk-list lookups
    if (this.riskList.isHoneypot(to)) {
      score += 90;
      evidence.push({
        module: "chain",
        severity: "critical",
        code: "HONEYPOT_TARGET",
        message: `Destination ${to} is on the honeypot risk list`,
      });
    }
    if (this.riskList.isMixer(to)) {
      score += 70;
      evidence.push({
        module: "chain",
        severity: "high",
        code: "MIXER_TARGET",
        message: `Destination ${to} is on the mixer risk list`,
      });
    }
    if (this.riskList.isMutableProxy(to)) {
      score += 25;
      evidence.push({
        module: "chain",
        severity: "medium",
        code: "MUTABLE_PROXY",
        message: `Destination ${to} is a proxy with mutable implementation`,
      });
    }

    // 2. Calldata analysis
    if (data && data.length >= 10) {
      const selector = data.slice(0, 10).toLowerCase();
      if (selector === APPROVE_SELECTOR) {
        const amount = data.slice(-64).toLowerCase();
        if (amount === MAX_UINT256) {
          score += 40;
          evidence.push({
            module: "chain",
            severity: "high",
            code: "UNLIMITED_APPROVAL",
            message: "Unlimited ERC20 approval detected",
            data: { selector, amount: "MAX_UINT256" },
          });
        } else {
          score += 5;
          evidence.push({
            module: "chain",
            severity: "info",
            code: "BOUNDED_APPROVAL",
            message: "Bounded ERC20 approval (low risk)",
          });
        }
      }
      if (selector === TRANSFER_SELECTOR) {
        score += 5; // baseline informational signal
        evidence.push({
          module: "chain",
          severity: "info",
          code: "ERC20_TRANSFER",
          message: "ERC20 transfer detected",
        });
      }
    }

    // 3. Value spike heuristic (>1e18 wei = >1 native token)
    try {
      const v = BigInt(value || "0");
      if (v > BigInt("1000000000000000000")) {
        score += 10;
        evidence.push({
          module: "chain",
          severity: "low",
          code: "HIGH_NATIVE_VALUE",
          message: `Transaction sends ${v.toString()} wei of native token`,
        });
      }
    } catch {
      /* ignore parse errors */
    }

    // 4. Optional simulation
    if (req.simulate && this.chainClient) {
      try {
        await this.chainClient.call({ to, data, value });
      } catch (err: any) {
        score += 30;
        evidence.push({
          module: "chain",
          severity: "high",
          code: "SIMULATION_REVERT",
          message: `Dry-run reverted: ${err?.message ?? "unknown"}`,
        });
      }
    }

    if (score > 100) score = 100;
    return { score, evidence };
  }
}
