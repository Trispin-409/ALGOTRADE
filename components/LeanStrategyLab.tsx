import React, { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, FlaskConical, Loader2, Play, RefreshCw } from "lucide-react";

type RunnerHealth = {
  ok?: boolean;
  configured?: boolean;
  engine?: string;
  message?: string;
  runner?: unknown;
};

const today = () => new Date().toISOString().slice(0, 10);

const inputClass = "w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400/60";
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400";

export default function LeanStrategyLab({ token }: { token: string }) {
  const [health, setHealth] = useState<RunnerHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);
  const [strategyId, setStrategyId] = useState("ema-crossover");
  const [symbol, setSymbol] = useState("EURUSD");
  const [resolution, setResolution] = useState("Hour");
  const [startDate, setStartDate] = useState("2022-01-01");
  const [endDate, setEndDate] = useState(today());
  const [startingCash, setStartingCash] = useState("10000");
  const [parametersText, setParametersText] = useState(JSON.stringify({ fastPeriod: 12, slowPeriod: 26 }, null, 2));

  const checkHealth = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/lean/health", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json();
      setHealth(data);
    } catch {
      setHealth({ ok: false, configured: false, message: "Could not contact the ALGOTRADE backend." });
    } finally {
      setChecking(false);
    }
  }, [token]);

  useEffect(() => { void checkHealth(); }, [checkHealth]);

  const submitBacktest = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setResult(null);

    let parameters: Record<string, unknown>;
    try {
      parameters = JSON.parse(parametersText || "{}");
      if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
        throw new Error("Parameters must be a JSON object.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid parameters JSON.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/lean/backtests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          strategyId: strategyId.trim(),
          symbol: symbol.trim(),
          resolution,
          startDate,
          endDate,
          startingCash: Number(startingCash),
          parameters,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || data?.message || `Backtest request failed (${response.status}).`);
      }
      const jobId = typeof data?.jobId === "string" ? data.jobId : (typeof data?.id === "string" ? data.id : "");
      if (!jobId || ["completed", "complete", "succeeded", "failed", "error"].includes(String(data?.status || "").toLowerCase())) {
        setResult(data);
      } else {
        setResult(data);
        for (let attempt = 0; attempt < 15; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const poll = await fetch(`/api/lean/backtests/${encodeURIComponent(jobId)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const next = await poll.json();
          if (!poll.ok) throw new Error(next?.error || "Could not retrieve backtest status.");
          setResult(next);
          if (["completed", "complete", "succeeded", "failed", "error"].includes(String(next?.status || "").toLowerCase())) break;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest request failed.");
    } finally {
      setSubmitting(false);
      void checkHealth();
    }
  };

  const statusText = health?.ok
    ? "Runner connected"
    : health?.configured
      ? "Runner configured but unreachable"
      : "Runner not configured";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 p-3 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-emerald-400">
            <FlaskConical className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Research Workspace</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Forex Strategy Lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Submit historical strategy tests to the separate QuantConnect LEAN runner. This workspace does not place trades.
          </p>
        </div>
        <button onClick={() => void checkHealth()} disabled={checking} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50">
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Check engine
        </button>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${health?.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
            {health?.ok ? <Activity className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </span>
          <div>
            <p className="font-semibold text-white">{statusText}</p>
            <p className="text-xs text-slate-400">{health?.message || (health?.ok ? "The runner responded to its health check." : "Configure the server-side LEAN runner to enable backtests.")}</p>
          </div>
        </div>
        <span className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300">{health?.engine || "QuantConnect LEAN"}</span>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <form onSubmit={submitBacktest} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <div>
            <h2 className="text-base font-bold text-white">Configure backtest</h2>
            <p className="mt-1 text-xs text-slate-400">The strategy ID must exist in the runner's approved strategy registry.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className={labelClass}>Strategy ID</span><input required value={strategyId} onChange={e => setStrategyId(e.target.value)} className={inputClass} placeholder="ema-crossover" /></label>
            <label><span className={labelClass}>Broker symbol</span><input required value={symbol} onChange={e => setSymbol(e.target.value)} className={inputClass} placeholder="EURUSD or broker symbol" /></label>
            <label><span className={labelClass}>Resolution</span><select value={resolution} onChange={e => setResolution(e.target.value)} className={inputClass}><option value="Minute">Minute</option><option value="Hour">Hour</option><option value="Daily">Daily</option></select></label>
            <label><span className={labelClass}>Starting cash</span><input required type="number" min="100" max="10000000" value={startingCash} onChange={e => setStartingCash(e.target.value)} className={inputClass} /></label>
            <label><span className={labelClass}>Start date</span><input required type="date" value={startDate} max={endDate} onChange={e => setStartDate(e.target.value)} className={inputClass} /></label>
            <label><span className={labelClass}>End date</span><input required type="date" value={endDate} min={startDate} max={today()} onChange={e => setEndDate(e.target.value)} className={inputClass} /></label>
          </div>
          <label className="block"><span className={labelClass}>Strategy parameters (JSON)</span><textarea value={parametersText} onChange={e => setParametersText(e.target.value)} rows={5} spellCheck={false} className={`${inputClass} font-mono text-xs`} /></label>
          {error && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
          <button type="submit" disabled={submitting || !token || !health?.ok} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 font-bold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {submitting ? "Submitting…" : "Run historical backtest"}
          </button>
          {!health?.ok && <p className="text-xs text-slate-500">The run button stays disabled until the server reports a healthy LEAN runner.</p>}
        </form>

        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <h2 className="text-base font-bold text-white">Backtest response</h2>
          <p className="mt-1 text-xs text-slate-400">Actual results from the runner will appear here. No results are fabricated.</p>
          <div className="mt-4 min-h-64 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3">
            {result ? (
              <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-emerald-200">{JSON.stringify(result, null, 2)}</pre>
            ) : (
              <div className="flex min-h-56 flex-col items-center justify-center gap-2 text-center text-slate-500">
                <FlaskConical className="h-8 w-8 opacity-50" />
                <p className="text-sm">No backtest submitted yet</p>
                <p className="max-w-xs text-xs">Results will include whatever verified metrics the runner returns.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
