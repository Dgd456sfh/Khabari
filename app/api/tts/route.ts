import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Gnani Text-to-Speech (REST): POST https://api.vachana.ai/api/v1/tts/inference -> audio bytes.
const TTS_URL = "https://api.vachana.ai/api/v1/tts/inference";

const gt = globalThis as unknown as { __khabriTts?: Map<string, ArrayBuffer> };
const audioCache = (gt.__khabriTts ??= new Map<string, ArrayBuffer>());
const AUDIO_KEEP = 40;

function friendly(status: number): string {
  if (status === 401) return "Gnani rejected the API key. Check GNANI_API_KEY in .env.local.";
  if (status === 402) return "Your Gnani credits look exhausted. Top up and try again.";
  if (status === 403) return "This Gnani key is not allowed to use Text-to-Speech (check key scope and credits).";
  if (status === 429) return "Gnani allows one request at a time. Wait a moment and try again.";
  return `Gnani voice failed (status ${status}).`;
}

export async function POST(req: Request) {
  const apiKey = process.env.GNANI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, code: "MISSING_GNANI_KEY", message: "GNANI_API_KEY is not set in .env.local." },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as { text?: unknown; lang?: unknown } | null;
  const text = String(body?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 700);
  if (!text) return NextResponse.json({ ok: false, code: "EMPTY", message: "Nothing to speak." }, { status: 400 });

  const hindi = body?.lang === "hi";
  const cacheKey = `${hindi ? "hi" : "en"}|${text}`;
  const cached = audioCache.get(cacheKey);
  if (cached) {
    return new Response(cached, { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=3600" } });
  }
  const payload = {
    text,
    voice: hindi ? process.env.GNANI_VOICE_HI || "Nalini" : process.env.GNANI_VOICE_EN || "Kaveri",
    model: process.env.GNANI_TTS_MODEL || "timbre-v2.5",
    // "auto" reads the script, which suits Hindi sentences that contain English place names.
    language: hindi ? "auto" : "en-IN",
    speed: 1.0,
    audio_config: {
      sample_rate: 24000,
      num_channels: 1,
      sample_width: 2,
      encoding: "linear_pcm",
      container: "wav",
    },
  };

  let res: Response;
  try {
    res = await fetch(TTS_URL, {
      signal: AbortSignal.timeout(30000),
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key-ID": apiKey },
      body: JSON.stringify(payload),
    });
  } catch {
    return NextResponse.json({ ok: false, code: "NETWORK", message: "Could not reach Gnani." }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json(
      { ok: false, code: `GNANI_${res.status}`, message: friendly(res.status) },
      { status: 502 }
    );
  }

  const audio = await res.arrayBuffer();
  audioCache.set(cacheKey, audio);
  if (audioCache.size > AUDIO_KEEP) audioCache.delete(audioCache.keys().next().value as string);
  return new Response(audio, {
    headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=3600" },
  });
}
