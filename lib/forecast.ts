import type { ForecastBlock, SeriesPoint } from "./types";

/*
 * Forecasting from recorded price history.
 * Method: damped-trend exponential smoothing (Holt), parameters chosen by minimising
 * one-step-ahead error on the history itself. No forecast is produced unless there are
 * at least MIN_DAYS recent daily observations. Confidence reflects both how much history
 * exists and how well the model predicted the history it has seen.
 */

export const MIN_DAYS = 7;
const MAX_GAP_DAYS = 3;
const MAX_STALE_DAYS = 3;

const DAY = 86400000;
const toTs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/** The most recent run of observations with no gap longer than MAX_GAP_DAYS. */
function recentRun(points: SeriesPoint[]): SeriesPoint[] {
  const p = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  let start = 0;
  for (let i = p.length - 1; i > 0; i--) {
    if ((toTs(p[i].date) - toTs(p[i - 1].date)) / DAY > MAX_GAP_DAYS) {
      start = i;
      break;
    }
  }
  return p.slice(start);
}

interface Fit {
  alpha: number;
  beta: number;
  phi: number;
  level: number;
  trend: number;
  sse: number;
  mape: number;
  count: number;
}

function fit(y: number[], alpha: number, beta: number, phi: number): Fit {
  let level = y[0];
  let trend = y[1] - y[0];
  let sse = 0;
  let ape = 0;
  let count = 0;
  for (let t = 1; t < y.length; t++) {
    const pred = level + phi * trend;
    const err = y[t] - pred;
    sse += err * err;
    ape += Math.abs(err) / y[t];
    count++;
    const newLevel = pred + alpha * err;
    trend = phi * trend + alpha * beta * err;
    level = newLevel;
  }
  return { alpha, beta, phi, level, trend, sse, mape: count ? ape / count : 1, count };
}

export function forecast(points: SeriesPoint[], horizonDays: number, today = new Date()): ForecastBlock {
  const run = recentRun(points);
  const have = run.length;

  if (have < MIN_DAYS) {
    return {
      status: "insufficient",
      have,
      need: MIN_DAYS,
      message: `Not enough price history to forecast: ${have} day${have === 1 ? "" : "s"} recorded, at least ${MIN_DAYS} needed. Khabri records prices every day it runs, so forecasts appear as history builds.`,
    };
  }

  const lastDate = run[run.length - 1].date;
  const staleDays = Math.floor((today.getTime() - toTs(lastDate)) / DAY);
  if (staleDays > MAX_STALE_DAYS) {
    return {
      status: "insufficient",
      have,
      need: MIN_DAYS,
      message: `The latest recorded price is ${staleDays} days old, which is too stale to forecast from.`,
    };
  }

  const y = run.map((p) => p.value);
  let best: Fit | null = null;
  for (const alpha of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
    for (const beta of [0.05, 0.1, 0.2, 0.3]) {
      for (const phi of [0.8, 0.9, 0.95]) {
        const f = fit(y, alpha, beta, phi);
        if (!best || f.sse < best.sse) best = f;
      }
    }
  }
  const f = best as Fit;

  const h = Math.max(1, Math.min(14, Math.round(horizonDays)));
  let damp = 0;
  for (let i = 1; i <= h; i++) damp += Math.pow(f.phi, i);
  const current = y[y.length - 1];
  const value = Math.max(0, f.level + damp * f.trend);

  const sigma = Math.sqrt(f.sse / Math.max(1, f.count - 1));
  const band = 1.28 * sigma * Math.sqrt(h); // about an 80% range
  const low = Math.max(0, value - band);
  const high = value + band;

  const change = value - current;
  const pct = current > 0 ? (change / current) * 100 : 0;
  const quiet = Math.abs(change) <= Math.max(band * 0.5, current * 0.005);
  const direction: "up" | "down" | "flat" = quiet ? "flat" : change > 0 ? "up" : "down";

  // Confidence: sample size and past accuracy, both capped.
  const accuracy = 1 - Math.min(1, f.mape / 0.08); // 0% error -> 1, 8%+ error -> 0
  const size = Math.min(1, have / 21);
  const confidencePct = Math.round(100 * accuracy * (0.4 + 0.6 * size));
  const confidence = confidencePct >= 70 ? "high" : confidencePct >= 40 ? "medium" : "low";

  return {
    status: "ok",
    horizonDays: h,
    targetDate: toIso(toTs(lastDate) + h * DAY),
    value: Math.round(value * 100) / 100,
    low: Math.round(low * 100) / 100,
    high: Math.round(high * 100) / 100,
    change: Math.round(change * 100) / 100,
    pct: Math.round(pct * 10) / 10,
    direction,
    confidence,
    confidencePct,
    basedOnDays: have,
    method: "Damped-trend exponential smoothing on recorded daily prices",
  };
}
