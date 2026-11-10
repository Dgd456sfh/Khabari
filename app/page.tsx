"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForecastCard from "@/components/ForecastCard";
import PriceChart from "@/components/PriceChart";
import { blobToWav16k } from "@/lib/audio";
import { CATALOG, CATEGORIES } from "@/lib/catalog";
import { formatRupee } from "@/lib/compose";
import type { Answer, ApiError, Category, Lang, LangPref } from "@/lib/types";

const EXAMPLES = [
  "Rice price in Bhopal",
  "Aaj gas cylinder ka kya rate hai?",
  "Petrol ka price kitna hai?",
  "Kal tamatar mehenga hoga?",
  "Is week rice ke prices badhenge?",
  "Aaj cement ka rate kya hai?",
];

const MAX_RECORD_MS = 25_000;

const SUBS = [
  { id: "all", label: "All" },
  { id: "vegetables", label: "Vegetables" },
  { id: "fruits", label: "Fruits" },
  { id: "grains", label: "Grains" },
  { id: "pulses", label: "Pulses" },
  { id: "oilseeds", label: "Oilseeds" },
];

interface Tree {
  state: string;
  districts: { district: string; cities: string[] }[];
}

interface ChatMsg {
  id: number;
  role: "user" | "khabri";
  text: string;
  speech?: string;
  lang?: Lang;
  status?: Answer["status"];
}

type SpeakState = "idle" | "loading" | "playing";

function MicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="3" />
    </svg>
  );
}
function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return `${Number(d)} ${mon} ${y}`;
}

export default function Home() {
  const [question, setQuestion] = useState("");
  const [pref, setPref] = useState<LangPref>("auto");

  const [category, setCategory] = useState<Category>("agri");
  const [sub, setSub] = useState("all");
  const [productId, setProductId] = useState<string | null>("rice");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [horizon, setHorizon] = useState(1);

  const [tree, setTree] = useState<Tree[]>([]);
  const [treeMsg, setTreeMsg] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speak, setSpeak] = useState<SpeakState>("idle");
  const [speakingId, setSpeakingId] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);
  const msgId = useRef(0);
  const productIdRef = useRef<string | null>("rice");
  const skipEffect = useRef(false);
  const chatEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest" });
  }, [chat]);

  /* ---------------- voice out ---------------- */

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeak("idle");
    setSpeakingId(null);
  }

  async function speakText(text: string, lang: Lang, id: number | null = null) {
    stopAudio();
    setSpeak("loading");
    setSpeakingId(id);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as ApiError | null;
        setNote(j?.message ?? "The voice reply is unavailable right now.");
        setSpeak("idle");
        setSpeakingId(null);
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      const done = () => {
        URL.revokeObjectURL(url);
        setSpeak("idle");
        setSpeakingId(null);
      };
      audio.onended = done;
      audio.onerror = done;
      setSpeak("playing");
      await audio.play();
    } catch {
      setNote("Couldn't play the voice reply. Tap Listen to try again.");
      setSpeak("idle");
      setSpeakingId(null);
    }
  }

  /* ---------------- asking ---------------- */

  const query = useCallback(
    async (opts: { question?: string; productId?: string | null; fromChat: boolean }) => {
      const myReq = ++reqRef.current;
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: opts.question ?? "",
            productId: opts.productId ?? undefined,
            category,
            lang: pref,
            state: state || undefined,
            district: district || undefined,
            city: city || undefined,
            horizon,
          }),
        });
        const data = (await res.json()) as Answer | ApiError;
        if (myReq !== reqRef.current) return; // a newer request replaced this one
        if (!data.ok) {
          setError(data.message);
          return;
        }
        setAnswer(data);
        if (data.product) {
          // The chat answer already reflects the place named in the question, so do not let the
          // dashboard effect immediately replace it with a dropdown-based query.
          if (data.product.id !== productIdRef.current) skipEffect.current = true;
          setProductId(data.product.id);
          setCategory(data.product.category);
        } else if (data.parsed.category) {
          setCategory(data.parsed.category);
        }
        if (opts.fromChat) {
          const id = ++msgId.current;
          setChat((c) => [
            ...c.slice(-9),
            { id, role: "khabri", text: data.text, speech: data.speech, lang: data.lang, status: data.status },
          ]);
          void speakText(data.speech, data.lang, id);
        }
      } catch {
        setError("Could not reach the Khabri server. Is `npm run dev` still running?");
      } finally {
        if (myReq === reqRef.current) setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, pref, state, district, city, horizon]
  );

  function submitQuestion(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    stopAudio();
    setChat((c) => [...c.slice(-9), { id: ++msgId.current, role: "user", text }]);
    void query({ question: text, fromChat: true });
  }

  /* Dashboard: re-query whenever the product, place or horizon changes. */
  useEffect(() => {
    productIdRef.current = productId;
    if (skipEffect.current) {
      skipEffect.current = false;
      return;
    }
    if (!productId) return;
    void query({ productId, fromChat: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, state, district, city, horizon]);

  /* ---------------- locations ---------------- */

  useEffect(() => {
    let live = true;
    fetch("/api/locations")
      .then((r) => r.json())
      .then((j: { ok: boolean; states?: Tree[]; message?: string }) => {
        if (!live) return;
        setTree(j.states ?? []);
        setTreeMsg(j.ok ? null : j.message ?? "Could not load places.");
      })
      .catch(() => live && setTreeMsg("Could not load places."));
    return () => {
      live = false;
    };
    // The place list is the same for every item, so it is loaded once.
  }, []);

  const districts = useMemo(() => tree.find((t) => t.state === state)?.districts ?? [], [tree, state]);
  const cities = useMemo(() => {
    if (district) return districts.find((d) => d.district === district)?.cities ?? [];
    return Array.from(new Set(districts.flatMap((d) => d.cities))).sort();
  }, [districts, district]);

  /* ---------------- voice in ---------------- */

  async function transcribe(blob: Blob) {
    setTranscribing(true);
    setError(null);
    setNote(null);
    try {
      const wav = await blobToWav16k(blob);
      const form = new FormData();
      form.append("audio", wav, "speech.wav");
      form.append("lang", pref);
      const res = await fetch("/api/stt", { method: "POST", body: form });
      const data = (await res.json()) as { ok: boolean; transcript?: string; message?: string };
      if (!data.ok) {
        setError(data.message ?? "Speech recognition failed.");
        return;
      }
      const heard = (data.transcript ?? "").trim();
      if (!heard) {
        setNote("I couldn't hear anything clearly. Please try again, a little closer to the mic.");
        return;
      }
      setQuestion(heard);
      setTranscribing(false);
      submitQuestion(heard);
    } catch {
      setError("Could not process the recording in this browser. Try Chrome or Edge.");
    } finally {
      setTranscribing(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    stopAudio();
    setError(null);
    setNote(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) clearTimeout(timerRef.current);
        setRecording(false);
        void transcribe(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      timerRef.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, MAX_RECORD_MS);
    } catch {
      setError("The microphone is blocked. Allow microphone access in the browser address bar and try again.");
    }
  }

  /* ---------------- derived ---------------- */

  const uiHi = pref === "hi";
  const products = CATALOG.filter((p) => p.category === category && (category !== "agri" || sub === "all" || p.sub === sub));
  const cur = answer?.current ?? null;
  const unit = cur?.unit ?? answer?.product?.unit ?? "kg";
  const dec = unit === "litre" ? 2 : 1;
  const money = (v: number) => `₹${v.toFixed(dec)}`;
  const maxCompare = answer?.compare ? Math.max(...answer.compare.rows.map((r) => r.value), 1) : 1;

  let delta: { diff: number; pct: number } | null = null;
  if (cur && answer?.previous && answer.previous.value > 0) {
    const diff = cur.value - answer.previous.value;
    delta = { diff, pct: (diff / answer.previous.value) * 100 };
  }

  const status = recording
    ? "Listening… tap the square when you finish."
    : transcribing
    ? "Understanding your voice with Gnani…"
    : busy
    ? "Fetching live prices…"
    : speak === "loading"
    ? "Preparing the voice reply…"
    : "";

  const badge =
    answer?.status === "live"
      ? { cls: "live-b", text: "LIVE · OFFICIAL DATA" }
      : answer?.status === "reference"
      ? { cls: "ref-b", text: "REFERENCE ONLY" }
      : answer?.status === "unavailable"
      ? { cls: "na-b", text: "DATA CURRENTLY UNAVAILABLE" }
      : null;

  return (
    <main className="wrap">
      <header className="top">
        <div className="brand">
          <span className="logo">K</span>
          Khabri
        </div>
        <span className="live">
          <i /> Indian Market Intelligence
        </span>
      </header>

      <section className="hero">
        <h1>
          Every price that matters, <span>one question away.</span>
        </h1>
        <p className="sub">
          Mandi produce, fuel, gas cylinders, groceries and building materials. Official data only, with honest forecasts. Ask in Hindi or English.
        </p>
        <p className="sub-hi">किसी भी चीज़ का भाव पूछिए: सब्ज़ी, पेट्रोल, गैस सिलेंडर, सीमेंट।</p>

        <form
          className="ask"
          onSubmit={(e) => {
            e.preventDefault();
            submitQuestion(question);
            setQuestion("");
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Kal tamatar mehenga hoga? · LPG price in ALL India"
            aria-label="Your question"
            maxLength={300}
          />
          <button
            type="button"
            className={`mic ${recording ? "on" : ""}`}
            onClick={() => void toggleRecording()}
            disabled={transcribing || busy}
            aria-label={recording ? "Stop recording" : "Speak your question"}
            title={recording ? "Stop" : "Speak"}
          >
            {recording ? <StopIcon /> : <MicIcon />}
          </button>
          <button className="go" type="submit" disabled={busy || transcribing || !question.trim()}>
            Ask
          </button>
        </form>

        <div className="tools">
          <div className="chips">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip" onClick={() => submitQuestion(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <div className="langpick" role="group" aria-label="Language">
            {(
              [
                ["auto", "Auto"],
                ["hi", "हिन्दी"],
                ["en", "English"],
              ] as [LangPref, string][]
            ).map(([v, label]) => (
              <button key={v} type="button" className={pref === v ? "sel" : ""} onClick={() => setPref(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="status" aria-live="polite">
          {status}
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {note && <div className="note">{note}</div>}

      {chat.length > 0 && (
        <section className="card chat" aria-label="Conversation">
          {chat.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              <div className="bubble" lang={m.lang === "hi" ? "hi" : "en"}>
                {m.text}
              </div>
              {m.role === "khabri" && m.speech && (
                <button
                  className={`listen small ${speakingId === m.id && speak === "playing" ? "playing" : ""}`}
                  disabled={speak === "loading"}
                  onClick={() =>
                    speakingId === m.id && speak === "playing" ? stopAudio() : void speakText(m.speech!, m.lang ?? "en", m.id)
                  }
                >
                  {speakingId === m.id && speak === "playing" ? <StopIcon /> : <SpeakerIcon />}
                  {speakingId === m.id && speak === "playing" ? "Stop" : "Listen"}
                </button>
              )}
            </div>
          ))}
          <div ref={chatEnd} />
        </section>
      )}

      {/* ---------- category + product + location ---------- */}
      <section className="card controls">
        <div className="cats" role="tablist" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={category === c.id}
              className={`cat ${category === c.id ? "sel" : ""}`}
              onClick={() => {
                setCategory(c.id);
                setSub("all");
                const first = CATALOG.find((p) => p.category === c.id);
                if (first) setProductId(first.id);
              }}
            >
              {uiHi ? c.hi : c.en}
            </button>
          ))}
        </div>

        {category === "agri" && (
          <div className="subs">
            {SUBS.map((s) => (
              <button key={s.id} className={`subchip ${sub === s.id ? "sel" : ""}`} onClick={() => setSub(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        )}

        <div className="products">
          {products.map((p) => (
            <button
              key={p.id}
              className={`prod ${productId === p.id ? "sel" : ""}`}
              onClick={() => setProductId(p.id)}
              title={p.provider === "none" ? "No verified live source yet" : "Live official data"}
            >
              {uiHi ? p.hi : p.en}
              {p.provider === "none" && <em>·</em>}
            </button>
          ))}
        </div>

        <div className="loc">
          <label>
            <span>State</span>
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setDistrict("");
                setCity("");
              }}
            >
              <option value="">All India</option>
              {tree.map((t) => (
                <option key={t.state} value={t.state}>
                  {t.state}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>District</span>
            <select
              value={district}
              disabled={!state}
              onChange={(e) => {
                setDistrict(e.target.value);
                setCity("");
              }}
            >
              <option value="">{state ? "All districts" : "Choose a state first"}</option>
              {districts.map((d) => (
                <option key={d.district} value={d.district}>
                  {d.district}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>City / mandi town</span>
            <select value={city} disabled={!state} onChange={(e) => setCity(e.target.value)}>
              <option value="">{state ? "All cities" : "Choose a state first"}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="horizon" role="group" aria-label="Forecast horizon">
            <span>Forecast</span>
            <div className="langpick">
              <button className={horizon === 1 ? "sel" : ""} onClick={() => setHorizon(1)}>
                Tomorrow
              </button>
              <button className={horizon === 7 ? "sel" : ""} onClick={() => setHorizon(7)}>
                Next 7 days
              </button>
            </div>
          </div>
        </div>
        {treeMsg && <div className="fine">Place list unavailable: {treeMsg}</div>}
      </section>

      {/* ---------- dashboard ---------- */}
      {answer && answer.product && (
        <>
          <section className="card dash-head">
            <div>
              <div className="eyebrow">
                {CATEGORIES.find((c) => c.id === answer.product!.category)?.en}
              </div>
              <h2 className="dash-title">
                {uiHi ? answer.product.hi : answer.product.en}
                <span> · {answer.place?.label ?? "All India"}</span>
              </h2>
            </div>
            <div className="dash-meta">
              {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
              <span className="fine">
                Last updated {fmtDateTime(answer.updatedAt)}
                {answer.dataAsOf ? ` · price dated ${answer.dataAsOf.includes("/") ? answer.dataAsOf : fmtDate(answer.dataAsOf)}` : ""}
              </span>
            </div>
          </section>

          {answer.status === "unavailable" && (
            <section className="card unavailable">
              <div className="na-title">Data currently unavailable</div>
              <p>{answer.notes[0] ?? "No verified live source is connected for this item."}</p>
              <p className="fine">Khabri never invents a price. No number is shown here because none could be verified.</p>
            </section>
          )}

          {answer.status === "reference" && (
            <div className="note">
              No official price for {answer.place?.asked} is available. The Delhi figure below is shown for reference
              only and is not the price in {answer.place?.asked}.
            </div>
          )}

          {cur && answer.status !== "unavailable" && (
            <section className="stats4">
              <div className="stat big">
                <div className="k">
                  <span className="tag actual">ACTUAL</span> Current price
                </div>
                <div className="v">
                  {money(cur.value)} <small>/ {unit}</small>
                </div>
                <div className="where">{cur.label}</div>
                <div className="where">
                  {cur.kind}
                  {cur.count && cur.count > 1 ? ` · ${cur.count} mandis` : ""}
                </div>
              </div>

              <div className="stat">
                <div className="k">
                  <span className="tag actual">ACTUAL</span> Previous price
                </div>
                {answer.previous ? (
                  <>
                    <div className="v">
                      {money(answer.previous.value)} <small>/ {unit}</small>
                    </div>
                    <div className="where">
                      {answer.previous.label} · {fmtDate(answer.previous.date)}
                    </div>
                    {delta && (
                      <div className={`delta ${delta.diff > 0 ? "up" : delta.diff < 0 ? "down" : "flat"}`}>
                        {delta.diff > 0 ? "▲" : delta.diff < 0 ? "▼" : "●"} {delta.diff >= 0 ? "+" : "−"}
                        {money(Math.abs(delta.diff))} ({delta.pct >= 0 ? "+" : ""}
                        {delta.pct.toFixed(1)}%) since then
                      </div>
                    )}
                  </>
                ) : (
                  <div className="where" style={{ marginTop: 8 }}>
                    No earlier price recorded yet. Khabri saves prices every day it runs.
                  </div>
                )}
              </div>

              <ForecastCard forecast={answer.forecast} unit={unit} />

              {cur.lo && cur.hi && (
                <div className="stat">
                  <div className="k">Range today</div>
                  <div className="v small">
                    {money(cur.lo.value)} – {money(cur.hi.value)}
                  </div>
                  <div className="where">Lowest: {cur.lo.label}</div>
                  <div className="where">Highest: {cur.hi.label}</div>
                  {answer.marketsTotal > 0 && <div className="where">{answer.marketsTotal} mandis reporting across India</div>}
                </div>
              )}
            </section>
          )}

          {answer.status !== "unavailable" && (
            <section className="card panel chartpanel">
              <h2>Price history</h2>
              <PriceChart history={answer.history} forecast={answer.forecast} unit={unit} />
            </section>
          )}

          {(answer.compare || answer.table) && answer.status === "live" && answer.product.category === "agri" && (
            <div className="grid2">
              {answer.table && (
                <section className="card panel">
                  <h2>{answer.table.title}</h2>
                  <div className="tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Mandi</th>
                          <th className="num">Min</th>
                          <th className="num">Typical</th>
                          <th className="num">Max</th>
                        </tr>
                      </thead>
                      <tbody>
                        {answer.table.rows.map((r) => (
                          <tr key={`${r.state}-${r.district}-${r.market}`}>
                            <td>
                              {r.market}
                              <span className="sub-line">
                                {r.district}, {r.state}
                              </span>
                            </td>
                            <td className="num">{formatRupee(r.min)}</td>
                            <td className="num strong">{formatRupee(r.modal)}</td>
                            <td className="num">{formatRupee(r.max)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              {answer.compare && (
                <section className="card panel">
                  <h2>{answer.compare.title} · ₹ per {answer.compare.unit}</h2>
                  <div className="bars">
                    {answer.compare.rows.map((r) => (
                      <div key={r.label} className={`bar ${r.mark ? "mark" : ""}`}>
                        <span className="name" title={r.label}>
                          {r.label}
                        </span>
                        <span className="track">
                          <span className="fill" style={{ width: `${Math.max(4, (r.value / maxCompare) * 100)}%`, display: "block" }} />
                        </span>
                        <span className="val">{formatRupee(r.value)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          <section className="card panel sources">
            <h2>Sources</h2>
            {answer.sources.length === 0 ? (
              <p className="fine">No verified source is connected for this item.</p>
            ) : (
              <ul>
                {answer.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="fine">
              Actual prices come straight from the sources above. Forecasts are estimates made by Khabri from its own
              recorded history of those prices, and are always labelled “AI forecast”.
            </p>
          </section>
        </>
      )}

      <footer className="foot">
        Khabri · Indian Market Intelligence · Voice by <b>Gnani.ai</b>
      </footer>
    </main>
  );
}
