import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gnani Speech-to-Text (REST): POST https://api.vachana.ai/stt/v3, multipart form.
const STT_URL = "https://api.vachana.ai/stt/v3";

function friendly(status: number): string {
  if (status === 401) return "Gnani rejected the API key. Check GNANI_API_KEY in .env.local.";
  if (status === 402) return "Your Gnani credits look exhausted. Top up and try again.";
  if (status === 403) return "This Gnani key is not allowed to use Speech-to-Text (check key scope and credits).";
  if (status === 429) return "Gnani allows one request at a time. Wait a moment and try again.";
  return `Gnani speech recognition failed (status ${status}).`;
}

export async function POST(req: Request) {
  const apiKey = process.env.GNANI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, code: "MISSING_GNANI_KEY", message: "GNANI_API_KEY is not set in .env.local." },
      { status: 500 }
    );
  }

  const incoming = await req.formData().catch(() => null);
  const audio = incoming?.get("audio");
  const lang = String(incoming?.get("lang") ?? "auto");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ ok: false, code: "NO_AUDIO", message: "No audio received." }, { status: 400 });
  }

  const form = new FormData();
  form.append("audio_file", audio, "speech.wav");
  if (lang === "hi") {
    form.append("language_code", "hi-IN");
  } else if (lang === "en") {
    form.append("language_code", "en-IN");
  } else {
    // Auto-detect Indian languages (Prisma v3.0). Pick Hindi or English if your key lacks v3.0.
    form.append("model", process.env.GNANI_STT_AUTO_MODEL || "prisma-v3.0");
    form.append("language_code", process.env.GNANI_STT_AUTO_CODE || "indic-auto");
  }

  let res: Response;
  try {
    res = await fetch(STT_URL, { method: "POST", headers: { "X-API-Key-ID": apiKey }, body: form });
  } catch {
    return NextResponse.json({ ok: false, code: "NETWORK", message: "Could not reach Gnani." }, { status: 502 });
  }

  if (!res.ok) {
    const hint = lang === "auto" && res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 402 && res.status !== 429
      ? " Try choosing Hindi or English instead of Auto."
      : "";
    return NextResponse.json(
      { ok: false, code: `GNANI_${res.status}`, message: friendly(res.status) + hint },
      { status: 502 }
    );
  }

  const data = (await res.json().catch(() => null)) as { transcript?: string; text?: string } | null;
  const transcript = String(data?.transcript ?? data?.text ?? "").trim();
  return NextResponse.json({ ok: true, transcript });
}
