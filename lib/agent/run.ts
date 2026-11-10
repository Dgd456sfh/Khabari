import { byId, CATEGORIES, inCategory, SOURCES } from "../catalog";
import { forecast } from "../forecast";
import { detectLang, detectPlace } from "../intent";
import { MandiError } from "../mandi";
import { agri, NoPrices } from "../providers/agri";
import { fuel, FuelError } from "../providers/fuel";
import type { Answer, Category, LangPref, PlaceSel, Product } from "../types";
import { parseQuery } from "./nlu";
import { replyClarify, replyLive, replyReference, replyUnavailable } from "./reply";

export interface Req {
  question?: string;
  lang?: LangPref;
  productId?: string;
  category?: Category;
  state?: string;
  district?: string;
  city?: string;
  horizon?: number;
}

const clean = (v: unknown, max = 80) => String(v ?? "").trim().slice(0, max);

const normDelhi = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const isDelhi = (s: string) => ["delhi", "newdelhi", "nctofdelhi"].includes(normDelhi(s));

function emptyAnswer(base: Pick<Answer, "lang" | "parsed">): Answer {
  return {
    ok: true,
    lang: base.lang,
    status: "unavailable",
    text: "",
    speech: "",
    parsed: base.parsed,
    product: null,
    place: null,
    current: null,
    previous: null,
    forecast: null,
    history: [],
    compare: null,
    table: null,
    sources: [],
    updatedAt: new Date().toISOString(),
    dataAsOf: null,
    notes: [],
    marketsTotal: 0,
  };
}

function productView(p: Product) {
  return { id: p.id, category: p.category, en: p.en, hi: p.hi, unit: p.unit };
}

function pointersFor(p: Product): { name: string; url: string }[] {
  if (p.category === "lpg") return [SOURCES.iocl, SOURCES.ppacPrices];
  if (p.category === "grocery" || p.category === "essentials") return [SOURCES.doca];
  return [];
}

export async function run(req: Req): Promise<Answer> {
  const question = clean(req.question, 300);
  const lang = detectLang(question, req.lang === "hi" || req.lang === "en" ? req.lang : "auto");
  const nlu = question
    ? parseQuery(question)
    : { product: null, category: null, when: "today" as const, wantsForecast: false, horizonDays: 1 };

  const product = byId(clean(req.productId, 40)) ?? nlu.product;
  const category: Category | null = product?.category ?? req.category ?? nlu.category;
  const horizon = Math.max(1, Math.min(14, Math.round(Number(req.horizon) || nlu.horizonDays || 1)));
  const wantsForecast = nlu.wantsForecast;

  const selectors: PlaceSel = {
    state: clean(req.state) || undefined,
    district: clean(req.district) || undefined,
    city: clean(req.city) || undefined,
  };

  const parsedBase = {
    productId: product?.id ?? null,
    category,
    place: null as string | null,
    when: nlu.when,
    wantsForecast,
    horizonDays: horizon,
  };
  const ans = emptyAnswer({ lang, parsed: parsedBase });

  /* ---------- which product? ---------- */
  if (!product) {
    ans.status = "clarify";
    const cat = category ? CATEGORIES.find((c) => c.id === category) : null;
    const r = replyClarify(lang, cat ? (lang === "hi" ? cat.hi : cat.en) : null);
    ans.text = r.text;
    ans.speech = r.speech;
    return ans;
  }
  ans.product = productView(product);

  const notes: string[] = [];
  if (nlu.when === "unclear_kal") {
    notes.push(
      lang === "hi"
        ? "“कल” का मतलब बीता या आने वाला कल हो सकता है। आज का भाव दिखाया गया है; पूर्वानुमान के लिए “कल … होगा?” पूछिए।"
        : "“Kal” can mean yesterday or tomorrow, so today's price is shown. Ask “kal … hoga?” for a forecast.",
    );
  }

  /* ---------- agriculture: live mandi prices + forecast ---------- */
  if (product.provider === "mandi") {
    try {
      const out = await agri(product, selectors, question);
      const fc = forecast(out.history, horizon);
      const placeLabel = out.scope.label;
      parsedBase.place = out.scope.asked;
      ans.parsed.place = out.scope.asked;
      if (nlu.when === "yesterday" && !out.previous) {
        notes.push(
          lang === "hi" ? "कल का भाव अभी दर्ज नहीं है।" : "Yesterday's price has not been recorded yet.",
        );
      }
      const note = notes.join(" ") || null;

      ans.status = "live";
      ans.place = {
        label: placeLabel,
        level: out.scope.level,
        fellBack: out.scope.fellBack,
        asked: out.scope.asked,
      };
      ans.current = out.current;
      ans.previous = out.previous;
      ans.forecast = fc;
      ans.history = out.history;
      ans.compare = out.compare;
      ans.table = out.table;
      ans.sources = out.sources;
      ans.dataAsOf = out.asOf;
      ans.marketsTotal = out.marketsTotal;
      ans.notes = notes;

      const asOfIso = out.asOf ? out.asOf.split("/").reverse().join("-") : null;
      const r = replyLive({
        lang,
        product,
        current: out.current,
        previous: out.previous,
        forecast: fc,
        wantsForecast,
        asOfIso,
        fellBackFrom: out.scope.fellBack ? out.scope.asked : null,
        sourceTag: "mandi",
        note,
      });
      ans.text = r.text;
      ans.speech = r.speech;
      return ans;
    } catch (e) {
      const reason =
        e instanceof MandiError
          ? e.message
          : e instanceof NoPrices
          ? "No mandi has reported a price for this item in the latest data."
          : "Something went wrong while loading mandi prices.";
      return unavailable(ans, lang, product, selectors, question, reason, [SOURCES.agmarknet]);
    }
  }

  /* ---------- fuel: official PPAC prices, revisions instead of ML ---------- */
  if (product.provider === "ppac") {
    const placeText =
      selectors.city ?? selectors.district ?? selectors.state ?? detectPlace(question, [])?.asked ?? null;
    ans.parsed.place = placeText;
    try {
      const out = await fuel(product);
      ans.current = out.current;
      ans.previous = out.previous;
      ans.forecast = out.forecast;
      ans.history = out.history;
      ans.sources = out.sources;
      ans.dataAsOf = out.asOf;
      ans.notes = notes;

      if (placeText && !isDelhi(placeText)) {
        ans.status = "reference";
        ans.place = { label: "Delhi (reference only)", level: "city", fellBack: true, asked: placeText };
        ans.current = { ...out.current, label: "Delhi (reference only)" };
        const r = replyReference(lang, product, placeText, out.current.value, out.asOf);
        ans.text = r.text;
        ans.speech = r.speech;
        ans.notes.push(
          "PPAC's free daily notices cover Delhi only. Prices in other cities differ because of state taxes.",
        );
        return ans;
      }

      ans.status = "live";
      ans.place = { label: "Delhi", level: "city", fellBack: false, asked: placeText };
      const r = replyLive({
        lang,
        product,
        current: out.current,
        previous: out.previous,
        forecast: out.forecast,
        wantsForecast,
        asOfIso: out.asOf,
        fellBackFrom: null,
        sourceTag: "PPAC",
        note: notes.join(" ") || null,
      });
      ans.text = r.text;
      ans.speech = r.speech;
      return ans;
    } catch (e) {
      const reason =
        e instanceof FuelError ? e.message : "Something went wrong while loading fuel prices.";
      return unavailable(ans, lang, product, selectors, question, reason, [SOURCES.ppac, SOURCES.ppacPrices]);
    }
  }

  /* ---------- everything without a verified live source ---------- */
  return unavailable(
    ans,
    lang,
    product,
    selectors,
    question,
    product.unavailableReason ?? "No verified live source is connected for this item.",
    pointersFor(product),
  );
}

function unavailable(
  ans: Answer,
  lang: "hi" | "en",
  product: Product,
  selectors: PlaceSel,
  question: string,
  reason: string,
  sources: { name: string; url: string }[],
): Answer {
  const placeText =
    selectors.city ?? selectors.district ?? selectors.state ?? detectPlace(question, [])?.asked ?? null;
  ans.parsed.place = placeText;
  ans.status = "unavailable";
  ans.place = placeText ? { label: placeText, level: "city", fellBack: false, asked: placeText } : null;
  ans.forecast = {
    status: "unavailable",
    message: "No forecast: there is no verified live price source for this item.",
  };
  ans.sources = sources;
  const r = replyUnavailable(lang, product, placeText, reason);
  ans.text = r.text;
  ans.speech = r.speech;
  ans.notes = [reason];
  return ans;
}

export { inCategory };
