# QuantConnect LEAN integration for ALGOTRADE

ALGOTRADE keeps its existing React/Vite frontend, Node.js/Express backend, Supabase, WebSockets and MetaApi connection. QuantConnect LEAN is an external research/backtesting engine; it must not be bundled into the browser app or allowed to bypass ALGOTRADE's risk and execution controls.

## Current integration boundary

The Node backend exposes these authenticated endpoints:

- `GET /api/lean/health` — checks the configured LEAN runner.
- `POST /api/lean/backtests` — validates a backtest request and forwards it to the runner.
- `GET /api/lean/backtests/:jobId` — retrieves a backtest job owned by the authenticated user.

The runner API contract is `GET /health`, `POST /api/backtests`, and `GET /api/backtests/{jobId}`. The backend sends a server-to-server bearer token and `x-algotrade-user-id`. The runner MUST validate the bearer token, enforce user ownership for every job, and never accept arbitrary shell commands or arbitrary algorithm source from a client.

## Configure

Set these variables only in the backend deployment environment:

- `LEAN_BACKTEST_SERVICE_URL` — HTTPS base URL for the separately deployed runner.
- `LEAN_BACKTEST_SERVICE_TOKEN` — strong shared secret used only between ALGOTRADE and the runner.

Do not use a `VITE_` prefix for either variable. Never expose the runner token in the frontend or mobile bundle.

Without both values, the endpoints return a clear 503 response; they do not fabricate results.

## Request example

```json
{
  "strategyId": "ema-crossover",
  "symbol": "EURUSD",
  "resolution": "Hour",
  "startDate": "2022-01-01",
  "endDate": "2025-01-01",
  "startingCash": 10000,
  "parameters": {
    "fastPeriod": 12,
    "slowPeriod": 26
  }
}
```

The runner must return a job identifier, then expose status/results through the job endpoint. Results should include the data source, period, strategy version and parameters, trade count, win rate, net profit, profit factor, drawdown, expectancy, fees and slippage assumptions.

## Required next implementation stage

1. Deploy an isolated LEAN runner using the official [QuantConnect/Lean](https://github.com/QuantConnect/Lean) engine and supported CLI/container workflow.
2. Implement an approved strategy registry; do not run user-supplied arbitrary code.
3. Export MetaApi historical candles to a LEAN-compatible data format and document bid/ask, timestamps, gaps, symbol mapping and transaction-cost assumptions. Do not substitute unrelated public data silently.
4. Add a Strategy Lab UI that submits backtests and polls job results.
5. Add tests and run demo-only validation before enabling any live signals.

LEAN backtests are research results, not a guarantee of future returns. The backtest service must never place live orders. MetaApi remains the source of truth for live broker data and execution.
