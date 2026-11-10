import { NextResponse } from "next/server";
import { byId, CATALOG } from "@/lib/catalog";
import { agri } from "@/lib/providers/agri";
import { fuel } from "@/lib/providers/fuel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/collect                -> saves today's prices for the most common items
 * GET /api/collect?items=rice,wheat
 * GET /api/collect?items=all      -> every agriculture item (slow)
 *
 * Forecasts need recorded history, so call this once a day (see README for a Windows
 * Task Scheduler recipe). If COLLECT_KEY is set in .env.local, add &key=<value>.
 */
const DEFAULT_ITEMS = [
  "rice", "wheat", "onion", "potato", "tomato", "garlic", "maize", "soyabean", "arhar-tur-dal", "banana",
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const required = process.env.COLLECT_KEY;
  if (required && url.searchParams.get("key") !== required) {
    return NextResponse.json({ ok: false, message: "Wrong or missing key." }, { status: 401 });
  }

  const itemsParam = url.searchParams.get("items");
  const ids =
    itemsParam === "all"
      ? CATALOG.filter((p) => p.provider === "mandi").map((p) => p.id)
      : (itemsParam ? itemsParam.split(",") : DEFAULT_ITEMS).map((s) => s.trim()).filter(Boolean);

  const done: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const id of ids) {
    const p = byId(id);
    if (!p || p.provider !== "mandi") {
      failed.push({ id, reason: "not a live agriculture item" });
      continue;
    }
    try {
      await agri(p, {}, "");
      done.push(id);
    } catch (e) {
      failed.push({ id, reason: e instanceof Error ? e.message : "failed" });
    }
  }

  for (const id of ["petrol", "diesel"]) {
    const p = byId(id);
    if (!p) continue;
    try {
      await fuel(p);
      done.push(id);
    } catch (e) {
      failed.push({ id, reason: e instanceof Error ? e.message : "failed" });
    }
  }

  return NextResponse.json({ ok: true, saved: done, failed, at: new Date().toISOString() });
}
