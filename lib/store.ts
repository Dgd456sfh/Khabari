import fs from "node:fs";
import path from "node:path";
import type { SeriesPoint } from "./types";



interface Db {
  series: Record<string, Record<string, number>>;
}

const FILE = path.join(process.cwd(), "data", "history.json");
const KEEP_DAYS = 400;

const gs = globalThis as unknown as { __khabriDb?: Db | null; __khabriTimer?: ReturnType<typeof setTimeout> | null };
let db: Db | null = gs.__khabriDb ?? null;
let timer: ReturnType<typeof setTimeout> | null = gs.__khabriTimer ?? null;

function load(): Db {
  if (db) return db;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as Db;
    db = parsed && typeof parsed === "object" && parsed.series ? parsed : { series: {} };
  } catch {
    db = { series: {} };
  }
  gs.__khabriDb = db;
  return db;
}

function scheduleSave() {
  if (timer) return;
  timer = gs.__khabriTimer = setTimeout(() => {
    timer = gs.__khabriTimer = null;
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(load()));
      fs.renameSync(tmp, FILE);
    } catch {
      
    }
  }, 400);
}

export function record(key: string, isoDate: string, value: number): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !(value > 0) || !Number.isFinite(value)) return;
  const d = load();
  const s = (d.series[key] ??= {});
  const rounded = Math.round(value * 100) / 100;
  if (s[isoDate] === rounded) return;
  s[isoDate] = rounded;
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(s)) if (k < cutoff) delete s[k];
  scheduleSave();
}

export function series(key: string): SeriesPoint[] {
  const s = load().series[key];
  if (!s) return [];
  return Object.keys(s)
    .sort()
    .map((date) => ({ date, value: s[date] }));
}

export function hasDate(key: string, isoDate: string): boolean {
  return load().series[key]?.[isoDate] !== undefined;
}
