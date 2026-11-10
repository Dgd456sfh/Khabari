import { byState, latestDate, median, summarize, toMarkets } from "../analyze";
import { detectPlace, key as k } from "../intent";
import { getRows, getRowsForDate, isoFromDmy } from "../mandi";
import { hasDate, record, series } from "../store";
import { SOURCES } from "../catalog";
import type { Current, MarketAgg, PlaceSel, Product, SeriesPoint, TableRow } from "../types";

const perKg = (quintal: number) => quintal / 100;

export type Level = "india" | "state" | "district" | "market";

export interface AgriOut {
  scope: { level: Level; label: string; fellBack: boolean; asked: string | null };
  current: Current;
  previous: { value: number; date: string; label: string } | null;
  history: SeriesPoint[];
  compare: { title: string; unit: string; rows: { label: string; value: number; mark?: boolean }[] };
  table: { title: string; rows: TableRow[] };
  asOf: string | null;
  marketsTotal: number;
  sources: { name: string; url: string }[];
}

function row(m: MarketAgg): TableRow {
  return {
    market: m.market,
    district: m.district,
    state: m.state,
    min: perKg(m.min),
    modal: perKg(m.modal),
    max: perKg(m.max),
  };
}

/** Work out which mandis the person means, falling back to a wider area when needed. */
function resolveScope(all: MarketAgg[], sel: PlaceSel) {
  const asked = sel.city ?? sel.district ?? sel.state ?? null;
  const inState = (m: MarketAgg) => !sel.state || k(m.state) === k(sel.state);

  if (sel.city) {
    const c = k(sel.city);
    const inCity = all.filter((m) => inState(m) && (k(m.market) === c || k(m.district) === c));
    if (inCity.length) {
      const sameMarket = inCity.some((m) => k(m.market) === c);
      return {
        markets: inCity,
        level: (sameMarket ? "market" : "district") as Level,
        label: `${sel.city}, ${inCity[0].state}`,
        fellBack: false,
        asked,
      };
    }
  }
  if (sel.district) {
    const d = k(sel.district);
    const inDist = all.filter((m) => inState(m) && k(m.district) === d);
    if (inDist.length) {
      return {
        markets: inDist,
        level: "district" as Level,
        label: `${sel.district}, ${inDist[0].state}`,
        fellBack: Boolean(sel.city),
        asked,
      };
    }
  }
  if (sel.state) {
    const inSt = all.filter((m) => k(m.state) === k(sel.state!));
    if (inSt.length) {
      return {
        markets: inSt,
        level: "state" as Level,
        label: inSt[0].state,
        fellBack: Boolean(sel.city || sel.district),
        asked,
      };
    }
  }
  return {
    markets: all,
    level: "india" as Level,
    label: "All India",
    fellBack: Boolean(asked),
    asked,
  };
}

function seriesKey(api: string, level: Level, markets: MarketAgg[]): string {
  const first = markets[0];
  if (level === "state") return `mandi:${api}:S:${first.state}`;
  if (level === "district") return `mandi:${api}:D:${first.state}|${first.district}`;
  if (level === "market") return `mandi:${api}:M:${first.state}|${first.market}`;
  return `mandi:${api}:IN`;
}

/* One backfill attempt per item per server run, never blocking an answer. */
const gt = globalThis as unknown as { __khabriTried?: Set<string> };
const tried = (gt.__khabriTried ??= new Set<string>());

async function backfill(api: string, today: string) {
  if (tried.has(api)) return;
  tried.add(api);
  const natKey = `mandi:${api}:IN`;
  for (let i = 1; i <= 14; i++) {
    const d = new Date(Date.parse(`${today}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
    if (hasDate(natKey, d)) continue;
    try {
      const rows = await getRowsForDate(api, d);
      if (rows.length === 0) continue;
      const ms = toMarkets(rows);
      record(natKey, d, perKg(median(ms.map((m) => m.modal))));
      for (const s of byState(ms)) record(`mandi:${api}:S:${s.state}`, d, perKg(s.median));
    } catch {
      return; // stop quietly on any upstream problem
    }
  }
}

export async function agri(
  product: Product,
  selectors: PlaceSel,
  question: string
): Promise<AgriOut> {
  const api = product.apiName as string;
  const rows = await getRows(api); // throws MandiError
  if (rows.length === 0) throw new NoPrices();

  const all = toMarkets(rows);
  const asOf = latestDate(rows);
  const asOfIso = asOf ? isoFromDmy(asOf) : "";

  // A place named in the question wins over the dropdowns.
  const parsed = question ? detectPlace(question, all) : null;
  const sel: PlaceSel = parsed
    ? parsed.kind === "state"
      ? { state: parsed.asked }
      : { city: parsed.asked, state: parsed.state }
    : selectors;

  const scope = resolveScope(all, sel);
  const nat = summarize(all)!;
  const states = byState(all);
  const local = summarize(scope.markets)!;

  
  if (asOfIso) {
    record(`mandi:${api}:IN`, asOfIso, perKg(nat.median));
    for (const s of states) record(`mandi:${api}:S:${s.state}`, asOfIso, perKg(s.median));
    if (scope.level === "district" || scope.level === "market") {
      record(seriesKey(api, scope.level, scope.markets), asOfIso, perKg(local.median));
    }
  }

  const sKey = seriesKey(api, scope.level, scope.markets);
  const history = series(sKey);
  if (asOfIso && series(`mandi:${api}:IN`).length < 7) void backfill(api, asOfIso);

  const prevPoint = [...history].reverse().find((p) => p.date < asOfIso) ?? null;

  const current: Current = {
    value: perKg(local.median),
    unit: "kg",
    label: scope.label,
    kind: "Median wholesale (mandi) modal price",
    count: local.count,
    lo: { label: `${local.lo.market}, ${local.lo.state}`, value: perKg(local.lo.modal) },
    hi: { label: `${local.hi.market}, ${local.hi.state}`, value: perKg(local.hi.modal) },
  };

  
  const markedState = scope.level === "india" ? null : k(scope.markets[0].state);
  const compare = {
    title: `${product.en} · median price by state`,
    unit: "kg",
    rows: states.map((s) => ({
      label: s.state,
      value: perKg(s.median),
      mark: markedState !== null && k(s.state) === markedState,
    })),
  };

  const table =
    scope.level === "india"
      ? {
          title: `${product.en} · lowest prices in India today`,
          rows: [...all].sort((a, b) => a.modal - b.modal).slice(0, 8).map(row),
        }
      : {
          title: `${product.en} · mandis in ${scope.label}`,
          rows: [...scope.markets].sort((a, b) => a.modal - b.modal).slice(0, 15).map(row),
        };

  return {
    scope: { level: scope.level, label: scope.label, fellBack: scope.fellBack, asked: scope.asked },
    current,
    previous: prevPoint
      ? { value: prevPoint.value, date: prevPoint.date, label: "Last recorded price" }
      : null,
    history,
    compare,
    table,
    asOf,
    marketsTotal: all.length,
    sources: [SOURCES.agmarknet],
  };
}

export class NoPrices extends Error {}

/** Locations that have a price report today, for the State / District / City selectors. */
const treeMemo = new WeakMap<object, { state: string; districts: { district: string; cities: string[] }[] }[]>();

export async function locations(_product: Product | null) {
  // The place list is the same for every item, so one commodity (Rice, the most widely reported)
  // is enough. This also means switching items never triggers another big download.
  const rows = await getRows("Rice");
  const hit = treeMemo.get(rows);
  if (hit) return hit;
  const all = toMarkets(rows);
  const tree = new Map<string, Map<string, Set<string>>>();
  for (const m of all) {
    const st = tree.get(m.state) ?? new Map<string, Set<string>>();
    const ds = st.get(m.district) ?? new Set<string>();
    ds.add(m.market);
    st.set(m.district, ds);
    tree.set(m.state, st);
  }
  const out = Array.from(tree.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([state, ds]) => ({
      state,
      districts: Array.from(ds.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([district, ms]) => ({ district, cities: Array.from(ms).sort() })),
    }));
  treeMemo.set(rows, out);
  return out;
}
