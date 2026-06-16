/**
 * Minimal HTTP server exposing the AgentSentinel skill over the
 * Pharos Skill ABI. Uses Node's built-in http module so the package
 * has zero runtime dependencies.
 *
 *   POST /v1/invoke    body: SentinelRequest    => SentinelResponse
 *   GET  /v1/health                              => { status: "ok" }
 *   GET  /v1/spec                                => OpenAPI doc (stub)
 */
import * as http from "http";
import { SentinelAggregator } from "./aggregator";
import { InMemoryChainLogger } from "./audit/chainLogger";
import { SentinelRequest } from "./types";

const logger = new InMemoryChainLogger();
const aggregator = new SentinelAggregator({
  auditLogger: (resp, req) => logger.log(resp, req),
});

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/v1/health") {
        return send(res, 200, { status: "ok", skill: "AgentSentinel", version: "1.0.0" });
      }

      if (req.method === "GET" && req.url === "/v1/spec") {
        return send(res, 200, {
          skill: "AgentSentinel",
          version: "1.0.0",
          endpoints: ["POST /v1/invoke", "GET /v1/health", "GET /v1/spec"],
        });
      }

      if (req.method === "POST" && req.url === "/v1/invoke") {
        const body = await readBody(req);
        let parsed: SentinelRequest;
        try {
          parsed = JSON.parse(body);
        } catch {
          return send(res, 400, { error: "invalid JSON" });
        }
        if (!parsed.agent_id || !parsed.action_type || !parsed.policy_level) {
          return send(res, 400, { error: "missing required fields" });
        }
        const result = await aggregator.evaluate(parsed);
        return send(res, 200, result);
      }

      send(res, 404, { error: "not found" });
    } catch (err: any) {
      send(res, 500, { error: err?.message ?? "internal error" });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 8787);
  createServer().listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`AgentSentinel skill listening on :${port}`);
  });
}
