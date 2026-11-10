import type { MandiRow, MarketAgg } from "./types";
const marketsMemo = new WeakMap<MandiRow[], MarketAgg[]>();
const statesMemo = new WeakMap<MarketAgg[], { state: string; median: number; count: number }[]>();


export function toMarkets(rows: MandiRow[]): MarketAgg[] {
  const hit = marketsMemo.get(rows);
  if (hit) return hit;
  const out = buildMarkets(rows);
  marketsMemo.set(rows, out);
  return out;
}

function buildMarkets(rows: MandiRow[]): MarketAgg[] {
  interface Acc {
    state: string;
    district: string;
    market: string;
    sum: number;
    n: number;
    min: number;
    max: number;
    ts: number;
    date: string;
  }
  const map = new Map<string, Acc>();
  for (const r of rows) {
    const k = `${r.state}|${r.district}|${r.market}`;
    const lo = r.min > 0 ? r.min : r.modal;
    const hi = r.max > 0 ? r.max : r.modal;
    const cur = map.get(k);
    if (!cur) {
      map.set(k, {
        state: r.state,
        district: r.district,
        market: r.market,
        sum: r.modal,
        n: 1,
        min: lo,
        max: hi,
        ts: r.ts,
        date: r.date,
      });
    } else {
      cur.sum += r.modal;
      cur.n += 1;
      cur.min = Math.min(cur.min, lo);
      cur.max = Math.max(cur.max, hi);
      if (r.ts > cur.ts) {
        cur.ts = r.ts;
        cur.date = r.date;
      }
    }
  }
  return Array.from(map.values()).map((v) => ({
    state: v.state,
    district: v.district,
    market: v.market,
    modal: v.sum / v.n,
    min: v.min,
    max: v.max,
    varieties: v.n,
    date: v.date,
  }));
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface Summary {
  median: number; 
  count: number;
  lo: MarketAgg;
  hi: MarketAgg;
}

export function summarize(ms: MarketAgg[]): Summary | null {
  if (ms.length === 0) return null;
  let lo = ms[0];
  let hi = ms[0];
  for (const m of ms) {
    if (m.modal < lo.modal) lo = m;
    if (m.modal > hi.modal) hi = m;
  }
  return { median: median(ms.map((m) => m.modal)), count: ms.length, lo, hi };
}

export function byState(ms: MarketAgg[]): { state: string; median: number; count: number }[] {
  const hit = statesMemo.get(ms);
  if (hit) return hit;
  const out = buildStates(ms);
  statesMemo.set(ms, out);
  return out;
}

function buildStates(ms: MarketAgg[]): { state: string; median: number; count: number }[] {
  const groups = new Map<string, number[]>();
  for (const m of ms) {
    const g = groups.get(m.state);
    if (g) g.push(m.modal);
    else groups.set(m.state, [m.modal]);
  }
  return Array.from(groups.entries())
    .map(([state, v]) => ({ state, median: median(v), count: v.length }))
    .sort((a, b) => a.median - b.median);
}

export function latestDate(rows: MandiRow[]): string | null {
  let best: MandiRow | null = null;
  for (const r of rows) if (!best || r.ts > best.ts) best = r;
  return best && best.date ? best.date : null;
}
