import { NextResponse } from "next/server";
import { run, type Req } from "@/lib/agent/run";
import type { ApiError, Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATS: Category[] = ["agri", "lpg", "fuel", "grocery", "construction", "essentials"];

function fail(status: number, code: string, message: string) {
  const body: ApiError = { ok: false, code, message };
  return NextResponse.json(body, { status });
}


export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return fail(400, "BAD_JSON", "Send a JSON body.");

  const question = typeof b.question === "string" ? b.question : "";
  const productId = typeof b.productId === "string" ? b.productId : "";
  const category = CATS.find((c) => c === b.category);
  if (!question.trim() && !productId && !category) {
    return fail(400, "EMPTY", "Please type or speak a question, or choose a product.");
  }

  const input: Req = {
    question,
    productId: productId || undefined,
    category,
    lang: b.lang === "hi" || b.lang === "en" ? b.lang : "auto",
    state: typeof b.state === "string" ? b.state : undefined,
    district: typeof b.district === "string" ? b.district : undefined,
    city: typeof b.city === "string" ? b.city : undefined,
    horizon: typeof b.horizon === "number" ? b.horizon : undefined,
  };

  try {
    return NextResponse.json(await run(input));
  } catch {
    return fail(500, "UNKNOWN", "Something went wrong while answering. Please try again.");
  }
}
