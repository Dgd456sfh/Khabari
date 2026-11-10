import { NextResponse } from "next/server";
import { byId } from "@/lib/catalog";
import { MandiError } from "@/lib/mandi";
import { locations } from "@/lib/providers/agri";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/locations?product=rice
 * States -> districts -> cities (mandi towns) that have a live price report today.
 * Non-agriculture products use the same place list, taken from live mandi data.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("product");
  try {
    const tree = await locations(byId(id));
    return NextResponse.json({ ok: true, states: tree }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (e) {
    const message = e instanceof MandiError ? e.message : "Could not load the list of places.";
    return NextResponse.json({ ok: false, code: "LOCATIONS", message, states: [] }, { status: 502 });
  }
}
