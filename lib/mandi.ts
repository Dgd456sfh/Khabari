import fs from "fs";
import path from "path";
import type { MandiRow } from "./types";

// published on data.gov.in (Government of India).
const RESOURCE =
  process.env.DATA_GOV_RESOURCE_ID || "9ef84268-d588-465a-a308-a864a43d0070";
const PAGE_SIZE = 1000;
const MAX_PAGES = 8; // up to 8,000 live price records per item
const CACHE_MS = 15 * 60 * 1000; // fresh for 15 minutes
const STALE_MS = 12 * 60 * 60 * 1000; // after that, still served instantly while refreshing in the background
const DISK_DIR = path.join(process.cwd(), "data", "cache");

export class MandiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}


const g = globalThis as unknown as {
  __khabriMandi?: { cache: Map<string, { at: number; rows: MandiRow[] }>; inflight: Map<string, Promise<MandiRow[]>> };
};
const shared = (g.__khabriMandi ??= { cache: new Map(), inflight: new Map() });
const cache = shared.cache;
const inflight = shared.inflight;

const diskFile = (commodity: string) => path.join(DISK_DIR, `${commodity.replace(/[^A-Za-z0-9]+/g, "_")}.json`);

function readDisk(commodity: string): { at: number; rows: MandiRow[] } | null {
  try {
    const j = JSON.parse(fs.readFileSync(diskFile(commodity), "utf8")) as { at: number; rows: MandiRow[] };
    return j && Array.isArray(j.rows) && typeof j.at === "number" ? j : null;
  } catch {
    return null;
  }
}

function writeDisk(commodity: string, entry: { at: number; rows: MandiRow[] }) {
  try {
    fs.mkdirSync(DISK_DIR, { recursive: true });
    const tmp = `${diskFile(commodity)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entry));
    fs.renameSync(tmp, diskFile(commodity));
  } catch {
   
  }
}

function parseDate(s: string): number {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return 0;
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}


export function isoFromDmy(s: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function dmyFromIso(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function toNumber(v: unknown): number {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

interface Page {
  total?: number | string;
  records?: Record<string, unknown>[];
}

async function fetchPage(
  key: string,
  commodity: string,
  offset: number,
  arrivalDate?: string
): Promise<Page> {
  const u = new URL(`https://api.data.gov.in/resource/${RESOURCE}`);
  u.searchParams.set("api-key", key);
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", String(PAGE_SIZE));
  u.searchParams.set("offset", String(offset));
  u.searchParams.set("filters[commodity]", commodity);
  if (arrivalDate) u.searchParams.set("filters[arrival_date]", arrivalDate);

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2 && !res; attempt++) {
    try {
      const r = await fetch(u.toString(), { cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (r.status >= 500 && attempt === 0) continue; // one quick retry on a server hiccup
      res = r;
    } catch {
      if (attempt === 1) {
        throw new MandiError("NETWORK", "Could not reach data.gov.in. Check your internet connection.");
      }
    }
  }
  if (!res) throw new MandiError("NETWORK", "Could not reach data.gov.in. Check your internet connection.");
  if (res.status === 401 || res.status === 403) {
    throw new MandiError(
      "BAD_DATA_KEY",
      "data.gov.in rejected DATA_GOV_API_KEY. Check the key in .env.local."
    );
  }
  if (!res.ok) {
    throw new MandiError("UPSTREAM", `data.gov.in answered with status ${res.status}. Try again shortly.`);
  }
  return (await res.json()) as Page;
}

function lowerKeys(r: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(r)) o[k.toLowerCase()] = r[k];
  return o;
}

function normalize(records: Record<string, unknown>[]): MandiRow[] {
  return records
    .map(lowerKeys)
    .map((r) => {
      const date = String(r.arrival_date ?? "");
      return {
        state: String(r.state ?? "").trim(),
        district: String(r.district ?? "").trim(),
        market: String(r.market ?? "").trim(),
        variety: String(r.variety ?? "").trim(),
        date,
        ts: parseDate(date),
        min: toNumber(r.min_price),
        max: toNumber(r.max_price),
        modal: toNumber(r.modal_price),
      };
    })
    .filter((r) => r.modal > 0 && r.state !== "" && r.market !== "");
}

function requireKey(): string {
  const key = process.env.DATA_GOV_API_KEY;
  if (!key) {
    throw new MandiError(
      "MISSING_DATA_KEY",
      "DATA_GOV_API_KEY is not set. Add your free data.gov.in key to .env.local and restart."
    );
  }
  return key;
}

async function fetchAll(
  key: string,
  commodity: string,
  maxPages: number,
  arrivalDate?: string
): Promise<MandiRow[]> {
  const first = await fetchPage(key, commodity, 0, arrivalDate);
  const records: Record<string, unknown>[] = [...(first.records ?? [])];
  const total = Number(first.total ?? records.length);
  const pages = Math.min(maxPages, Math.ceil(total / PAGE_SIZE));
  if (pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: pages - 1 }, (_, i) =>
        fetchPage(key, commodity, (i + 1) * PAGE_SIZE, arrivalDate)
      )
    );
    for (const p of rest) records.push(...(p.records ?? []));
  }
  return normalize(records);
}

async function download(commodity: string): Promise<MandiRow[]> {
  const key = requireKey();
  let rows = await fetchAll(key, commodity, MAX_PAGES);

  // Keep only the freshest days so an old report never passes as today's price.
  const newest = rows.reduce((m, r) => Math.max(m, r.ts), 0);
  if (newest > 0) {
    const cutoff = newest - 3 * 24 * 3600 * 1000;
    rows = rows.filter((r) => r.ts >= cutoff);
  }
  const entry = { at: Date.now(), rows };
  cache.set(commodity, entry);
  writeDisk(commodity, entry);
  return rows;
}

/** One download per commodity at a time, however many requests ask for it. */
function refresh(commodity: string): Promise<MandiRow[]> {
  let p = inflight.get(commodity);
  if (!p) {
    p = download(commodity).finally(() => inflight.delete(commodity));
    inflight.set(commodity, p);
  }
  return p;
}


export async function getRows(commodity: string): Promise<MandiRow[]> {
  requireKey();
  let hit = cache.get(commodity);
  if (!hit) {
    hit = readDisk(commodity) ?? undefined; 
  }
  if (hit) {
    const age = Date.now() - hit.at;
    if (age < CACHE_MS) return hit.rows;
    if (age < STALE_MS) {
      void refresh(commodity).catch(() => {});
      return hit.rows;
    }
  }
  return refresh(commodity);
}


export async function getRowsForDate(commodity: string, isoDate: string): Promise<MandiRow[]> {
  const key = requireKey();
  const dmy = dmyFromIso(isoDate);
  const rows = await fetchAll(key, commodity, 4, dmy);
  return rows.filter((r) => isoFromDmy(r.date) === isoDate);
}
