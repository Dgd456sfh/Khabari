import { enWords, hiWords } from "../compose";
import type { Current, ForecastBlock, Lang, Product } from "../types";

/* Builds the written reply (text) and the spoken reply (speech, with numbers as words). */

type Mode = "text" | "speech";

const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTH_EN[Number(m[2]) - 1]} ${m[1]}`;
}

export function money(v: number, mode: Mode, lang: Lang, decimals: number): string {
  if (mode === "text") return `₹${v.toFixed(decimals)}`;
  const words = lang === "hi" ? hiWords : enWords;
  const total = Math.round(v * 100);
  const rupees = Math.floor(total / 100);
  const paise = total % 100;
  const r = lang === "hi" ? "रुपये" : "rupees";
  if (decimals === 0 || paise === 0) return `${words(decimals === 0 ? Math.round(v) : rupees)} ${r}`;
  return lang === "hi"
    ? `${words(rupees)} रुपये ${words(paise)} पैसे`
    : `${words(rupees)} rupees ${words(paise)} paise`;
}

const decimalsFor = (unit: string) => (unit === "litre" ? 2 : 1);

function unitWord(unit: string, lang: Lang): string {
  if (lang !== "hi") return unit;
  if (unit === "kg") return "किलो";
  if (unit === "litre") return "लीटर";
  return unit;
}

function confWord(c: "high" | "medium" | "low", lang: Lang): string {
  if (lang === "hi") return c === "high" ? "ज़्यादा" : c === "medium" ? "मध्यम" : "कम";
  return c;
}

export interface LiveCtx {
  lang: Lang;
  product: Product;
  current: Current;
  previous: { value: number; date: string } | null;
  forecast: ForecastBlock | null;
  wantsForecast: boolean;
  asOfIso: string | null;
  fellBackFrom: string | null; // the place asked for, when we widened the area
  sourceTag: string; // e.g. "mandi" or "PPAC"
  note?: string | null;
}

function build(i: LiveCtx, mode: Mode): string {
  const hi = i.lang === "hi";
  const dec = decimalsFor(i.current.unit);
  const m = (v: number) => money(v, mode, i.lang, dec);
  const N = (n: number) => (mode === "text" ? String(n) : (hi ? hiWords : enWords)(n));
  const item = hi ? i.product.hi : i.product.en;
  const u = unitWord(i.current.unit, i.lang);
  const s: string[] = [];

  if (i.fellBackFrom) {
    s.push(
      hi
        ? `${i.fellBackFrom} के लिए आज का भाव नहीं मिला, इसलिए ${i.current.label} का भाव बता रहा हूँ।`
        : `No price was reported for ${i.fellBackFrom} today, so here is ${i.current.label}.`
    );
  }

  if (i.current.kind.startsWith("Median")) {
    const n = i.current.count ?? 0;
    s.push(
      hi
        ? `${i.current.label} में ${item} का आमतौर पर भाव ${m(i.current.value)} प्रति ${u} है${n > 1 ? ` (${N(n)} मंडियों के आधार पर)` : ""}।`
        : `${item} in ${i.current.label}: typically ${m(i.current.value)} per ${u}${n > 1 ? ` (median of ${N(n)} mandis)` : ""}.`
    );
    if (n > 1 && i.current.lo && i.current.hi) {
      s.push(
        hi
          ? `सबसे सस्ता ${i.current.lo.label} में ${m(i.current.lo.value)}, सबसे महँगा ${i.current.hi.label} में ${m(i.current.hi.value)}।`
          : `Lowest ${m(i.current.lo.value)} at ${i.current.lo.label}; highest ${m(i.current.hi.value)} at ${i.current.hi.label}.`
      );
    }
  } else {
    s.push(
      hi
        ? `${item} का ${i.current.label} में आधिकारिक भाव ${m(i.current.value)} प्रति ${u} है।`
        : `${item} in ${i.current.label}: ${m(i.current.value)} per ${u} (official price).`
    );
  }

  if (i.previous) {
    s.push(
      hi
        ? `पिछला दर्ज भाव ${m(i.previous.value)} था।`
        : `Previous recorded price: ${m(i.previous.value)}.`
    );
  }

  const f = i.forecast;
  if (f) {
    if (f.status === "ok") {
      const when = f.horizonDays === 1 ? (hi ? "कल" : "tomorrow") : hi ? `अगले ${N(f.horizonDays)} दिनों में` : `in ${f.horizonDays} days`;
      const pct = Math.abs(f.pct);
      const pctTxt = mode === "text" ? pct.toFixed(1) : N(Math.max(1, Math.round(pct)));
      if (f.direction === "flat") {
        s.push(
          hi
            ? `पूर्वानुमान (अनुमान, असली भाव नहीं): ${when} कोई खास बदलाव नहीं, लगभग ${m(f.value)}। भरोसा: ${confWord(f.confidence, i.lang)}।`
            : `AI forecast (an estimate, not an actual price): no clear change ${when}, about ${m(f.value)}. Confidence: ${f.confidence}.`
        );
      } else {
        const up = f.direction === "up";
        s.push(
          hi
            ? `पूर्वानुमान (अनुमान, असली भाव नहीं): ${when} भाव ${up ? "बढ़कर" : "घटकर"} लगभग ${m(f.value)} होने की संभावना है, यानी करीब ${pctTxt} प्रतिशत ${up ? "ज़्यादा" : "कम"}। भरोसा: ${confWord(f.confidence, i.lang)}।`
            : `AI forecast (an estimate, not an actual price): ${when} the price may ${up ? "rise" : "fall"} to about ${m(f.value)}, ${up ? "up" : "down"} ${pctTxt}%. Confidence: ${f.confidence}.`
        );
      }
    } else if (f.status === "insufficient" && i.wantsForecast) {
      s.push(
        hi
          ? `अभी पूर्वानुमान नहीं दे सकता: सिर्फ ${N(f.have)} दिन का भाव दर्ज है, कम से कम ${N(f.need)} दिन चाहिए।`
          : `I can't forecast this yet: only ${f.have} day${f.have === 1 ? "" : "s"} of price history is recorded, and at least ${f.need} are needed.`
      );
    } else if (f.status === "official_revision" && i.wantsForecast) {
      s.push(
        hi
          ? `पेट्रोल-डीज़ल के दाम सिर्फ तेल कंपनियों के आधिकारिक संशोधन से बदलते हैं, इसलिए मैं अनुमान नहीं लगाता।`
          : `Fuel prices only change through official revisions by the oil companies, so I don't forecast them.`
      );
    }
  }

  if (mode === "text" && i.asOfIso) {
    s.push(hi ? `भाव ${prettyDate(i.asOfIso)} तक के हैं।` : `Latest price dated ${prettyDate(i.asOfIso)}.`);
  }
  if (mode === "text" && i.note) s.push(i.note);
  return s.join(" ");
}

export function replyLive(i: LiveCtx): { text: string; speech: string } {
  return { text: build(i, "text"), speech: build(i, "speech") };
}

/** Delhi's official fuel price shown only as a reference for another place. */
export function replyReference(
  lang: Lang,
  product: Product,
  asked: string,
  value: number,
  asOfIso: string
): { text: string; speech: string } {
  const hi = lang === "hi";
  const item = hi ? product.hi : product.en;
  const mk = (mode: Mode) => {
    const v = money(value, mode, lang, 2);
    return hi
      ? `${asked} के लिए ${item} का आधिकारिक भाव अभी उपलब्ध नहीं है। संदर्भ के लिए दिल्ली में ${item} ${v} प्रति लीटर है${mode === "text" ? ` (${prettyDate(asOfIso)})` : ""}। आपके शहर का भाव राज्य के टैक्स की वजह से अलग होगा।`
      : `Data currently unavailable for ${item} in ${asked}. For reference only, ${item} in Delhi is ${v} per litre${mode === "text" ? ` (${prettyDate(asOfIso)})` : ""}. Your local price will differ because of state taxes.`;
  };
  return { text: mk("text"), speech: mk("speech") };
}

export function replyUnavailable(
  lang: Lang,
  product: Product | null,
  place: string | null,
  reason: string
): { text: string; speech: string } {
  const hi = lang === "hi";
  const item = product ? (hi ? product.hi : product.en) : null;
  const where = place ? (hi ? ` ${place} में` : ` in ${place}`) : "";
  const head = hi
    ? `डेटा अभी उपलब्ध नहीं है${item ? `: ${item}${where}` : ""}।`
    : `Data currently unavailable${item ? ` for ${item}${where}` : ""}.`;
  return {
    text: `${head} ${reason}`,
    // The detailed reason is English text; speak only the clear headline.
    speech: hi
      ? `${head} मैं अंदाज़े से कोई भाव नहीं बताऊँगा।`
      : `${head} I will not guess a price.`,
  };
}

export function replyClarify(lang: Lang, categoryName: string | null): { text: string; speech: string } {
  const hi = lang === "hi";
  const t = hi
    ? categoryName
      ? `${categoryName} में किस चीज़ का भाव जानना है? नीचे से चुनिए या नाम बताइए।`
      : "किस चीज़ का भाव जानना है? जैसे चावल, टमाटर, पेट्रोल, गैस सिलेंडर या सीमेंट।"
    : categoryName
    ? `Which ${categoryName.toLowerCase()} item do you want the price of? Pick one below or tell me the name.`
    : "Which item do you want the price of? For example rice, tomato, petrol, gas cylinder or cement.";
  return { text: t, speech: t };
}
