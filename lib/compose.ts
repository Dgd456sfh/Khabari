import type { Lang } from "./types";

/* ---------------- numbers as spoken words (Gnani TTS reads words best) ---------------- */

const EN_ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enBelow1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${EN_ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n > 0) {
    if (n < 20) parts.push(EN_ONES[n]);
    else parts.push(EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : ""));
  }
  return parts.join(" ");
}

export function enWords(n: number): string {
  n = Math.max(0, Math.round(n));
  if (n === 0) return "zero";
  const parts: string[] = [];
  if (n >= 1000) {
    parts.push(`${enBelow1000(Math.floor(n / 1000))} thousand`);
    n %= 1000;
  }
  if (n > 0) parts.push(enBelow1000(n));
  return parts.join(" ");
}

const HI_BELOW_100 = [
  "शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ",
  "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस",
  "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस",
  "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस",
  "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चौवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास",
  "पचास", "इक्यावन", "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ",
  "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर",
  "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
  "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी",
  "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पंचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे",
];

export function hiWords(n: number): string {
  n = Math.max(0, Math.round(n));
  if (n < 100) return HI_BELOW_100[n];
  const parts: string[] = [];
  if (n >= 1000) {
    parts.push(`${HI_BELOW_100[Math.floor(n / 1000)]} हज़ार`);
    n %= 1000;
  }
  if (n >= 100) {
    parts.push(`${HI_BELOW_100[Math.floor(n / 100)]} सौ`);
    n %= 100;
  }
  if (n > 0) parts.push(HI_BELOW_100[n]);
  return parts.join(" ");
}

/** "₹38.5" style text for the screen. */
export function formatRupee(v: number): string {
  const s = v < 100 ? v.toFixed(1).replace(/\.0$/, "") : String(Math.round(v));
  return `₹${s}`;
}

/* ---------------- the reply ---------------- */

export interface PricePt {
  label: string;
  kg: number;
}
export interface Sum {
  median: number; // Rs per kg
  count: number;
  lo: PricePt;
  hi: PricePt;
}
export interface ComposeIn {
  lang: Lang;
  item: { en: string; hi: string };
  place: { asked: string; label: string; level: "local" | "state" | "none"; fellBack: boolean } | null;
  local: Sum | null;
  national: Sum;
  date: string | null;
}

type Mode = "text" | "speech";

function build(i: ComposeIn, mode: Mode): string {
  const hi = i.lang === "hi";
  const words = hi ? hiWords : enWords;
  const rs = (v: number) =>
    mode === "text" ? formatRupee(v) : hi ? `${words(v)} रुपये` : `${words(v)} rupees`;
  const N = (n: number) => (mode === "text" ? String(n) : words(n));
  const item = hi ? i.item.hi : i.item.en;
  const itemLower = hi ? item : item.toLowerCase();
  const s: string[] = [];
  const p = i.place;

  if (p && p.level === "none") {
    s.push(
      hi
        ? `${p.asked} के लिए आज ${item} का भाव नहीं मिला। पूरे भारत की तस्वीर देखिए।`
        : `No ${itemLower} price was reported today for ${p.asked}. Here is the all-India picture.`
    );
  }

  if (p && p.level !== "none" && i.local) {
    const l = i.local;
    if (p.fellBack) {
      s.push(
        hi
          ? `${p.asked} के लिए आज ${item} का भाव नहीं मिला, इसलिए ${p.label} का भाव बता रहा हूँ।`
          : `No ${itemLower} price was reported today for ${p.asked}, so here is ${p.label}.`
      );
    }
    s.push(
      hi
        ? `${p.label} में ${item} का आमतौर पर भाव ${rs(l.median)} प्रति किलो है${
            l.count > 1 ? ` (${N(l.count)} मंडियों के आधार पर)` : ""
          }।`
        : `${item} in ${p.label}: typically ${rs(l.median)} per kg${
            l.count > 1 ? ` (median of ${N(l.count)} mandis)` : ""
          }.`
    );
    if (l.count > 1) {
      s.push(
        hi
          ? `सबसे सस्ता ${l.lo.label} में ${rs(l.lo.kg)}, सबसे महँगा ${l.hi.label} में ${rs(l.hi.kg)}।`
          : `Lowest ${rs(l.lo.kg)} at ${l.lo.label}, highest ${rs(l.hi.kg)} at ${l.hi.label}.`
      );
    }
    s.push(
      hi
        ? `पूरे भारत में आमतौर पर ${rs(i.national.median)} प्रति किलो।`
        : `All-India typical price: ${rs(i.national.median)} per kg.`
    );
  } else {
    const n = i.national;
    s.push(
      hi
        ? `पूरे भारत में ${item} का आमतौर पर भाव ${rs(n.median)} प्रति किलो है (${N(n.count)} मंडियों के आधार पर)।`
        : `Across India, ${itemLower} is typically ${rs(n.median)} per kg (median of ${N(n.count)} mandis).`
    );
    s.push(
      hi
        ? `सबसे सस्ता ${n.lo.label} में ${rs(n.lo.kg)}, सबसे महँगा ${n.hi.label} में ${rs(n.hi.kg)}।`
        : `Cheapest ${rs(n.lo.kg)} at ${n.lo.label}; costliest ${rs(n.hi.kg)} at ${n.hi.label}.`
    );
  }

  if (mode === "text" && i.date) {
    s.push(hi ? `भाव ${i.date} तक के हैं।` : `Latest prices reported on ${i.date}.`);
  }
  return s.join(" ");
}

export function compose(i: ComposeIn): { text: string; speech: string } {
  return { text: build(i, "text"), speech: build(i, "speech") };
}

export function askWhichItem(lang: Lang): string {
  return lang === "hi"
    ? "आप किस चीज़ का भाव जानना चाहते हैं? जैसे चावल, गेहूं, प्याज़, आलू, टमाटर या दाल।"
    : "Which item would you like the price of? For example rice, wheat, onion, potato, tomato or dal.";
}

export function noDataFor(lang: Lang, item: { en: string; hi: string }): string {
  return lang === "hi"
    ? `आज ${item.hi} का कोई भाव मंडियों से रिपोर्ट नहीं हुआ है।`
    : `No ${item.en.toLowerCase()} prices have been reported by the mandis today.`;
}
