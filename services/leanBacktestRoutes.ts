import { Router, type Request } from "express";
import axios from "axios";

type UserIdResolver = (req: Request) => Promise<string>;
type UserEmailResolver = (req: Request) => Promise<string>;
const OWNER_EMAIL = "trispinblackops@gmail.com";

const ALLOWED_RESOLUTIONS = new Set(["Minute", "Hour", "Daily"]);
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;
const SYMBOL_PATTERN = /^[A-Za-z0-9._-]{3,24}$/;

function runnerConfig() {
  const baseUrl = (process.env.LEAN_BACKTEST_SERVICE_URL || "").trim().replace(/\/+$/, "");
  const token = (process.env.LEAN_BACKTEST_SERVICE_TOKEN || "").trim();
  return { baseUrl, token };
}

function runnerHeaders(token: string, userId?: string) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(userId ? { "x-algotrade-user-id": userId } : {}),
    "Content-Type": "application/json",
  };
}

function safeRunnerError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401 || status === 403) return "Backtesting service authentication failed.";
    if (status === 404) return "Backtesting service endpoint is not available.";
    if (status === 429) return "Backtesting service is busy. Try again shortly.";
    if (status && status >= 500) return "Backtesting service encountered an error.";
    if (error.code === "ECONNABORTED") return "Backtesting service timed out.";
  }
  return "Backtesting service is unavailable.";
}

export function createLeanBacktestRouter(resolveUserId: UserIdResolver, resolveUserEmail: UserEmailResolver) {
  const router = Router();

  router.get("/health", async (req, res) => {
    try {
      const email = await resolveUserEmail(req);
      if (email.toLowerCase() !== OWNER_EMAIL) return res.status(403).json({ error: "Forbidden" });
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { baseUrl, token } = runnerConfig();
    if (!baseUrl || !token) {
      return res.status(503).json({
        ok: false,
        configured: false,
        engine: "QuantConnect LEAN",
        message: "Set LEAN_BACKTEST_SERVICE_URL and LEAN_BACKTEST_SERVICE_TOKEN on the server.",
      });
    }

    try {
      const response = await axios.get(`${baseUrl}/health`, {
        headers: runnerHeaders(token),
        timeout: 5000,
      });
      return res.json({
        ok: true,
        configured: true,
        engine: "QuantConnect LEAN",
        runner: response.data,
      });
    } catch (error) {
      return res.status(503).json({
        ok: false,
        configured: true,
        engine: "QuantConnect LEAN",
        message: safeRunnerError(error),
      });
    }
  });

  router.post("/backtests", async (req, res) => {
    let userId: string;
    try {
      userId = await resolveUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const email = await resolveUserEmail(req);
      if (email.toLowerCase() !== OWNER_EMAIL) return res.status(403).json({ error: "Forbidden" });
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { baseUrl, token } = runnerConfig();
    if (!baseUrl || !token) {
      return res.status(503).json({
        error: "LEAN backtesting service is not configured.",
        code: "LEAN_SERVICE_NOT_CONFIGURED",
      });
    }

    const body = req.body || {};
    const strategyId = typeof body.strategyId === "string" ? body.strategyId.trim() : "";
    const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
    const resolution = typeof body.resolution === "string" ? body.resolution : "";
    const startDate = typeof body.startDate === "string" ? body.startDate : "";
    const endDate = typeof body.endDate === "string" ? body.endDate : "";
    const startingCash = body.startingCash === undefined ? 10000 : Number(body.startingCash);
    const parameters = body.parameters === undefined ? {} : body.parameters;

    if (!ID_PATTERN.test(strategyId)) {
      return res.status(400).json({ error: "strategyId is required and must be a valid identifier." });
    }
    if (!SYMBOL_PATTERN.test(symbol)) {
      return res.status(400).json({ error: "A valid broker symbol is required." });
    }
    if (!ALLOWED_RESOLUTIONS.has(resolution)) {
      return res.status(400).json({ error: "resolution must be Minute, Hour, or Daily." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return res.status(400).json({ error: "startDate and endDate must use YYYY-MM-DD." });
    }
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      return res.status(400).json({ error: "startDate must be earlier than endDate." });
    }
    if ((end - start) > 5 * 366 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: "A single backtest cannot exceed five years." });
    }
    if (!Number.isFinite(startingCash) || startingCash < 100 || startingCash > 10000000) {
      return res.status(400).json({ error: "startingCash must be between 100 and 10,000,000." });
    }
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters) ||
        JSON.stringify(parameters).length > 12000) {
      return res.status(400).json({ error: "parameters must be a JSON object no larger than 12 KB." });
    }

    try {
      const response = await axios.post(
        `${baseUrl}/api/backtests`,
        {
          strategyId,
          symbol,
          resolution,
          startDate,
          endDate,
          startingCash,
          parameters,
          dataSource: "metaapi",
          mode: "backtest-only",
        },
        {
          headers: runnerHeaders(token, userId),
          timeout: 15000,
          maxBodyLength: 20000,
        },
      );
      return res.status(response.status === 202 ? 202 : 200).json(response.data);
    } catch (error) {
      return res.status(503).json({ error: safeRunnerError(error) });
    }
  });

  router.get("/backtests/:jobId", async (req, res) => {
    let userId: string;
    try {
      userId = await resolveUserId(req);
      if (!userId) return res.status(401).json({ error: "Unauthorized" });
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const email = await resolveUserEmail(req);
      if (email.toLowerCase() !== OWNER_EMAIL) return res.status(403).json({ error: "Forbidden" });
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const jobId = req.params.jobId;
    if (!ID_PATTERN.test(jobId)) {
      return res.status(400).json({ error: "Invalid backtest job ID." });
    }
    const { baseUrl, token } = runnerConfig();
    if (!baseUrl || !token) {
      return res.status(503).json({ error: "LEAN backtesting service is not configured." });
    }

    try {
      const response = await axios.get(
        `${baseUrl}/api/backtests/${encodeURIComponent(jobId)}`,
        { headers: runnerHeaders(token, userId), timeout: 8000 },
      );
      return res.json(response.data);
    } catch (error) {
      return res.status(503).json({ error: safeRunnerError(error) });
    }
  });

  return router;
}
