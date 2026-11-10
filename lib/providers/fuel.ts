import { SOURCES } from "../catalog";
import { record, series } from "../store";
import type { Current, ForecastBlock, Product, SeriesPoint } from "../types";

/*
 * Petrol and diesel: official retail selling prices published daily by PPAC
 * (Petroleum Planning & Analysis Cell, Ministry of Petroleum & Natural Gas).
 * PPAC's free daily notices cover the Delhi IOCL outlet. Other cities are NOT available
 * from this source, so Khabri never pretends otherwise.
 */

const LIST_URL = "https://ppac.gov.in/archives/impnews";
const CACHE_MS = 30 * 60 * 1000;

export class FuelError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07", aug: "08",
  sep: "09", sept: "09", oct: "10", nov: "11", dec: "12",
};

type FuelSeen = { fuel: "petrol" | "diesel"; date: string; value: number }[];
const gf = globalThis as unknown as { __khabriFuel?: { at: number; seen: FuelSeen } | null };
let cache: { at: number; seen: FuelSeen } | null = gf.__khabriFuel ?? null;

function parseListing(html: string) {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  const re =
    /RSP of (Petrol|Diesel) in Delhi as per IOCL outlet as on (\d{1,2})-([A-Za-z]+)-(\d{4}),?\s*Rs\.?\s*([\d.]+)\s*\/\s*ltr/gi;
  const out: { fuel: "petrol" | "diesel"; date: string; value: number }[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const month = MONTHS[m[3].toLowerCase()];
    const value = Number(m[5]);
    if (!month || !(value > 20 && value < 400)) continue; // sanity: a litre of fuel in rupees
    const date = `${m[4]}-${month}-${m[2].padStart(2, "0")}`;
    const fuel = m[1].toLowerCase() as "petrol" | "diesel";
    const id = `${fuel}|${date}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ fuel, date, value });
  }
  return out;
}

async function load() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.seen;
  let res: Response;
  try {
    res = await fetch(LIST_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Khabri/1.0)", Accept: "text/html" },
    });
  } catch {
    throw new FuelError("NETWORK", "Could not reach ppac.gov.in.");
  }
  if (!res.ok) throw new FuelError("UPSTREAM", `ppac.gov.in answered with status ${res.status}.`);
  const seen = parseListing(await res.text());
  if (seen.length === 0) {
    throw new FuelError(
      "PARSE",
      "ppac.gov.in did not list daily petrol/diesel prices in the expected format."
    );
  }
  for (const s of seen) record(`ppac:${s.fuel}:Delhi`, s.date, s.value);
  cache = gf.__khabriFuel = { at: Date.now(), seen };
  return seen;
}

export interface FuelOut {
  current: Current;
  previous: { value: number; date: string; label: string } | null;
  history: SeriesPoint[];
  forecast: ForecastBlock;
  asOf: string; // yyyy-mm-dd
  sources: { name: string; url: string }[];
}

export async function fuel(product: Product): Promise<FuelOut> {
  await load();
  const key = `ppac:${product.id}:Delhi`;
  const history = series(key);
  if (history.length === 0) throw new FuelError("EMPTY", "No price found for this fuel.");

  const last = history[history.length - 1];

  // Find the most recent official revision inside the recorded window.
  let revision: { date: string; from: number; to: number } | null = null;
  for (let i = history.length - 1; i > 0; i--) {
    if (history[i].value !== history[i - 1].value) {
      revision = { date: history[i].date, from: history[i - 1].value, to: history[i].value };
      break;
    }
  }

  const first = history[0].date;
  const forecast: ForecastBlock = {
    status: "official_revision",
    lastRevision: revision,
    message: revision
      ? `${product.en} prices change only when the oil companies officially revise them, so Khabri does not run a daily forecast. Last revision in the recorded period: ${revision.date}, from ₹${revision.from} to ₹${revision.to}.`
      : `${product.en} prices change only when the oil companies officially revise them, so Khabri does not run a daily forecast. No revision was recorded since ${first}.`,
  };

  return {
    current: {
      value: last.value,
      unit: "litre",
      label: "Delhi (IOCL outlet)",
      kind: "Official retail selling price",
    },
    previous: revision
      ? { value: revision.from, date: revision.date, label: "Price before the last official revision" }
      : null,
    history,
    forecast,
    asOf: last.date,
    sources: [SOURCES.ppac, SOURCES.ppacPrices],
  };
}
