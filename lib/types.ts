export type Lang = "hi" | "en";
export type LangPref = Lang | "auto";

/* ------------------------------------------------------------------ */
/* Raw mandi data (unchanged from the mandi version)                   */
/* ------------------------------------------------------------------ */

/** One price report from one mandi for one variety. Prices are Rs per quintal (100 kg). */
export interface MandiRow {
  state: string;
  district: string;
  market: string;
  variety: string;
  date: string; // dd/mm/yyyy as published
  ts: number; // date as a timestamp (0 if unknown)
  min: number;
  max: number;
  modal: number;
}

/** One mandi, with all its varieties folded into a single line. Rs per quintal. */
export interface MarketAgg {
  state: string;
  district: string;
  market: string;
  modal: number;
  min: number;
  max: number;
  varieties: number;
  date: string;
}

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export type Category = "agri" | "lpg" | "fuel" | "grocery" | "construction" | "essentials";

export type Provider = "mandi" | "ppac" | "none";

export interface Product {
  id: string;
  category: Category;
  sub?: string; // e.g. vegetables, fruits, grains, pulses
  en: string;
  hi: string;
  unit: string; // what one price is for: "kg", "litre", "14.2 kg cylinder" ...
  aliases: string[];
  provider: Provider;
  /** Commodity name exactly as Agmarknet spells it (provider "mandi" only). */
  apiName?: string;
  /** Why no live data exists (provider "none" only). */
  unavailableReason?: string;
}

/* ------------------------------------------------------------------ */
/* Answer returned to the UI                                           */
/* ------------------------------------------------------------------ */

export interface PlaceSel {
  state?: string;
  district?: string;
  city?: string;
}

export interface SeriesPoint {
  date: string; // yyyy-mm-dd
  value: number;
}

export interface TableRow {
  market: string;
  district: string;
  state: string;
  min: number; // Rs per kg
  modal: number;
  max: number;
}

export interface Current {
  value: number;
  unit: string;
  label: string; // where the number applies, e.g. "Bhopal, Madhya Pradesh"
  kind: string; // e.g. "Median wholesale (mandi) price"
  count?: number; // how many mandis it is based on
  lo?: { label: string; value: number };
  hi?: { label: string; value: number };
}

export interface ForecastOk {
  status: "ok";
  horizonDays: number;
  targetDate: string; // yyyy-mm-dd
  value: number;
  low: number;
  high: number;
  change: number;
  pct: number;
  direction: "up" | "down" | "flat";
  confidence: "high" | "medium" | "low";
  confidencePct: number;
  basedOnDays: number;
  method: string;
}

export type ForecastBlock =
  | ForecastOk
  | { status: "insufficient"; have: number; need: number; message: string }
  | {
      status: "official_revision";
      message: string;
      lastRevision: { date: string; from: number; to: number } | null;
    }
  | { status: "unavailable"; message: string };

export type AnswerStatus = "live" | "reference" | "unavailable" | "clarify";

export interface Answer {
  ok: true;
  lang: Lang;
  status: AnswerStatus;
  text: string; // shown on screen
  speech: string; // sent to Gnani text-to-speech (numbers as words)
  parsed: {
    productId: string | null;
    category: Category | null;
    place: string | null;
    when: "today" | "yesterday" | "tomorrow" | "week" | "unclear_kal";
    wantsForecast: boolean;
    horizonDays: number;
  };
  product: { id: string; category: Category; en: string; hi: string; unit: string } | null;
  place: { label: string; level: "india" | "state" | "district" | "market" | "city"; fellBack: boolean; asked: string | null } | null;
  current: Current | null;
  previous: { value: number; date: string; label: string } | null;
  forecast: ForecastBlock | null;
  history: SeriesPoint[];
  compare: { title: string; unit: string; rows: { label: string; value: number; mark?: boolean }[] } | null;
  table: { title: string; rows: TableRow[] } | null;
  sources: { name: string; url: string }[];
  updatedAt: string; // when Khabri fetched this (ISO)
  dataAsOf: string | null; // the date the source says the price is for (dd/mm/yyyy or ISO)
  notes: string[];
  marketsTotal: number;
}

export interface ApiError {
  ok: false;
  code: string;
  message: string;
}
