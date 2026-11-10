import type { Lang, LangPref, MarketAgg } from "./types";


export interface Commodity {
  api: string;
  en: string;
  hi: string;
  aliases: string[];
}

export const COMMODITIES: Commodity[] = [
  { api: "Rice", en: "Rice", hi: "चावल", aliases: ["rice", "chawal", "chaval", "chawaal", "chaaval", "चावल"] },
  { api: "Paddy(Dhan)(Common)", en: "Paddy", hi: "धान", aliases: ["paddy", "dhan", "धान"] },
  { api: "Wheat", en: "Wheat", hi: "गेहूं", aliases: ["wheat", "gehu", "gehun", "gehoon", "गेहूं", "गेहूँ"] },
  { api: "Onion", en: "Onion", hi: "प्याज़", aliases: ["onion", "pyaz", "pyaaz", "pyaj", "प्याज", "प्याज़"] },
  { api: "Potato", en: "Potato", hi: "आलू", aliases: ["potato", "aloo", "aalu", "alu", "आलू"] },
  { api: "Tomato", en: "Tomato", hi: "टमाटर", aliases: ["tomato", "tamatar", "टमाटर"] },
  { api: "Garlic", en: "Garlic", hi: "लहसुन", aliases: ["garlic", "lahsun", "lasun", "लहसुन"] },
  { api: "Ginger(Green)", en: "Ginger", hi: "अदरक", aliases: ["ginger", "adrak", "अदरक"] },
  { api: "Green Chilli", en: "Green chilli", hi: "हरी मिर्च", aliases: ["green chilli", "green chili", "hari mirch", "हरी मिर्च"] },
  { api: "Maize", en: "Maize", hi: "मक्का", aliases: ["maize", "makka", "makai", "corn", "मक्का", "मक्की"] },
  { api: "Soyabean", en: "Soyabean", hi: "सोयाबीन", aliases: ["soyabean", "soybean", "soya", "सोयाबीन"] },
  { api: "Arhar (Tur/Red Gram)(Whole)", en: "Arhar (Tur) dal", hi: "अरहर दाल", aliases: ["arhar", "tur dal", "toor dal", "toor", "tur", "dal", "daal", "अरहर", "तुअर", "तूर", "दाल"] },
  { api: "Bengal Gram(Gram)(Whole)", en: "Chana (Bengal gram)", hi: "चना", aliases: ["chana", "channa", "bengal gram", "gram", "चना"] },
  { api: "Green Gram (Moong)(Whole)", en: "Moong", hi: "मूंग", aliases: ["moong", "mung", "green gram", "मूंग", "मूँग"] },
  { api: "Black Gram (Urd Beans)(Whole)", en: "Urad", hi: "उड़द", aliases: ["urad", "urd", "black gram", "उड़द"] },
  { api: "Lentil (Masur)(Whole)", en: "Masoor", hi: "मसूर", aliases: ["masoor", "masur", "lentil", "मसूर"] },
  { api: "Mustard", en: "Mustard", hi: "सरसों", aliases: ["mustard", "sarson", "sarso", "सरसों", "सरसो"] },
  { api: "Groundnut", en: "Groundnut", hi: "मूंगफली", aliases: ["groundnut", "peanut", "moongphali", "mungfali", "मूंगफली"] },
  { api: "Jowar(Sorghum)", en: "Jowar", hi: "ज्वार", aliases: ["jowar", "sorghum", "ज्वार"] },
  { api: "Bajra(Pearl Millet/Cumbu)", en: "Bajra", hi: "बाजरा", aliases: ["bajra", "bajri", "बाजरा"] },
  { api: "Cauliflower", en: "Cauliflower", hi: "फूलगोभी", aliases: ["cauliflower", "phool gobhi", "phulgobhi", "gobhi", "फूलगोभी", "फूल गोभी", "गोभी"] },
  { api: "Cabbage", en: "Cabbage", hi: "पत्तागोभी", aliases: ["cabbage", "patta gobhi", "band gobhi", "पत्तागोभी", "पत्ता गोभी"] },
  { api: "Brinjal", en: "Brinjal", hi: "बैंगन", aliases: ["brinjal", "baingan", "eggplant", "बैंगन"] },
  { api: "Bhindi(Ladies Finger)", en: "Bhindi", hi: "भिंडी", aliases: ["bhindi", "okra", "ladies finger", "भिंडी"] },
  { api: "Banana", en: "Banana", hi: "केला", aliases: ["banana", "kela", "केला"] },
  { api: "Apple", en: "Apple", hi: "सेब", aliases: ["apple", "seb", "सेब"] },
  { api: "Mango", en: "Mango", hi: "आम", aliases: ["mango", "aam", "आम"] },
];

function tokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[\s,.?!।;:()"'/\\-]+/)
    .filter(Boolean);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ASCII = /^[\x00-\x7F]+$/;

function aliasMatches(q: string, toks: string[], alias: string): boolean {
  if (ASCII.test(alias)) {
    return new RegExp(
      `(^|[^a-z])${escapeRe(alias)}([^a-z]|$)`
    ).test(q.toLowerCase());
  }

  return toks.some(
    (t) => t === alias || (alias.length > 3 && t.includes(alias))
  );
}

export function detectCommodity(q: string): Commodity | null {
  const toks = tokens(q);

  const flat = COMMODITIES.flatMap((c) =>
    c.aliases.map((a) => ({ c, a }))
  );

  flat.sort((x, y) => y.a.length - x.a.length);

  for (const { c, a } of flat) {
    if (aliasMatches(q, toks, a)) return c;
  }

  return null;
}



const HINGLISH =
  /(^|[^a-z])(kya|kitna|kitne|kitni|bhav|bhaav|bhaw|batao|bataiye|bataye|sasta|mehnga|mehenga|mandi|hai|hain|mein|chawal|gehu|pyaz|aloo|tamatar)([^a-z]|$)/;

export function detectLang(q: string, pref: LangPref): Lang {
  if (pref === "hi" || pref === "en") return pref;

  if (/[ऀ-ॿ]/.test(q)) return "hi";

  if (HINGLISH.test(q.toLowerCase())) return "hi";

  return "en";
}



const REPLACEMENTS: [RegExp, string][] = [
  [/chhattisgarh|chattisgarh/g, "chattisgarh"],
  [/bangalore/g, "bengaluru"],
  [/bombay/g, "mumbai"],
  [/calcutta/g, "kolkata"],
  [/madras/g, "chennai"],
  [/orissa/g, "odisha"],
  [/gurgaon/g, "gurugram"],
  [/banaras|benares/g, "varanasi"],
  [/nct of delhi|new delhi/g, "delhi"],
  [/jammu (and|&) kashmir/g, "jammu and kashmir"],
];

export function norm(s: string): string {
  let t = s.toLowerCase().replace(/\([^)]*\)/g, " ");

  for (const [re, to] of REPLACEMENTS) {
    t = t.replace(re, to);
  }

  return t
    .replace(/[^a-zऀ-ॿ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function key(s: string): string {
  return norm(s).replace(/ /g, "");
}

const DEV_PLACES: [string, string][] = [
  ["भोपाल", "bhopal"],
  ["इंदौर", "indore"],
  ["जबलपुर", "jabalpur"],
  ["ग्वालियर", "gwalior"],
  ["उज्जैन", "ujjain"],
  ["दुर्ग", "durg"],
  ["रायपुर", "raipur"],
  ["बिलासपुर", "bilaspur"],
  ["भिलाई", "bhilai"],
  ["राजनांदगांव", "rajnandgaon"],
  ["मुंबई", "mumbai"],
  ["मुम्बई", "mumbai"],
  ["पुणे", "pune"],
  ["नागपुर", "nagpur"],
  ["नासिक", "nashik"],
  ["औरंगाबाद", "aurangabad"],
  ["दिल्ली", "delhi"],
  ["लखनऊ", "lucknow"],
  ["कानपुर", "kanpur"],
  ["वाराणसी", "varanasi"],
  ["आगरा", "agra"],
  ["मेरठ", "meerut"],
  ["पटना", "patna"],
  ["रांची", "ranchi"],
  ["कोलकाता", "kolkata"],
  ["चेन्नई", "chennai"],
  ["हैदराबाद", "hyderabad"],
  ["बेंगलुरु", "bengaluru"],
  ["बेंगलूरु", "bengaluru"],
  ["बैंगलोर", "bengaluru"],
  ["जयपुर", "jaipur"],
  ["जोधपुर", "jodhpur"],
  ["अहमदाबाद", "ahmedabad"],
  ["सूरत", "surat"],
  ["राजकोट", "rajkot"],
  ["अमृतसर", "amritsar"],
  ["लुधियाना", "ludhiana"],
  ["चंडीगढ़", "chandigarh"],
  ["भुवनेश्वर", "bhubaneswar"],
  ["गुवाहाटी", "guwahati"],
  ["कोच्चि", "kochi"],
  ["मध्य प्रदेश", "madhya pradesh"],
  ["मध्यप्रदेश", "madhya pradesh"],
  ["छत्तीसगढ़", "chattisgarh"],
  ["छत्तीसगढ", "chattisgarh"],
  ["महाराष्ट्र", "maharashtra"],
  ["उत्तर प्रदेश", "uttar pradesh"],
  ["उत्तरप्रदेश", "uttar pradesh"],
  ["बिहार", "bihar"],
  ["राजस्थान", "rajasthan"],
  ["गुजरात", "gujarat"],
  ["पंजाब", "punjab"],
  ["हरियाणा", "haryana"],
  ["पश्चिम बंगाल", "west bengal"],
  ["तमिलनाडु", "tamil nadu"],
  ["कर्नाटक", "karnataka"],
  ["तेलंगाना", "telangana"],
  ["आंध्र प्रदेश", "andhra pradesh"],
  ["केरल", "kerala"],
  ["असम", "assam"],
  ["उत्तराखंड", "uttarakhand"],
  ["हिमाचल प्रदेश", "himachal pradesh"],
];

const CITY_STATE: Record<string, string> = {
  bhopal: "Madhya Pradesh",
  indore: "Madhya Pradesh",
  jabalpur: "Madhya Pradesh",
  gwalior: "Madhya Pradesh",
  ujjain: "Madhya Pradesh",
  durg: "Chattisgarh",
  raipur: "Chattisgarh",
  bilaspur: "Chattisgarh",
  bhilai: "Chattisgarh",
  rajnandgaon: "Chattisgarh",
  mumbai: "Maharashtra",
  pune: "Maharashtra",
  nagpur: "Maharashtra",
  nashik: "Maharashtra",
  aurangabad: "Maharashtra",
  delhi: "Delhi",
  lucknow: "Uttar Pradesh",
  kanpur: "Uttar Pradesh",
  varanasi: "Uttar Pradesh",
  agra: "Uttar Pradesh",
  meerut: "Uttar Pradesh",
  patna: "Bihar",
  ranchi: "Jharkhand",
  kolkata: "West Bengal",
  chennai: "Tamil Nadu",
  hyderabad: "Telangana",
  bengaluru: "Karnataka",
  jaipur: "Rajasthan",
  jodhpur: "Rajasthan",
  ahmedabad: "Gujarat",
  surat: "Gujarat",
  rajkot: "Gujarat",
  amritsar: "Punjab",
  ludhiana: "Punjab",
  chandigarh: "Chandigarh",
  bhubaneswar: "Odisha",
  guwahati: "Assam",
  kochi: "Kerala",
};

export interface Place {
  asked: string;
  kind: "state" | "local" | "city";
  state?: string;
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

interface PlaceCand {
  name: string;
  pad: string;
  kind: Place["kind"];
  state?: string;
  rank: number;
}

const candMemo = new WeakMap<MarketAgg[], PlaceCand[]>();

function candidatesFor(markets: MarketAgg[]): PlaceCand[] {
  const hit = candMemo.get(markets);
  if (hit) return hit;

  const cands = new Map<string, PlaceCand>();

  const add = (
    name: string,
    kind: Place["kind"],
    rank: number,
    state?: string
  ) => {
    const n = norm(name);
    if (n.length < 3) return;

    const prev = cands.get(n);

    if (!prev || rank < prev.rank) {
      cands.set(n, { name: n, pad: ` ${n} `, kind, state, rank });
    }
  };

  for (const m of markets) {
    add(m.district, "local", 1);
    add(m.market, "local", 2);
    add(m.state, "state", 3);
  }

  for (const [city, st] of Object.entries(CITY_STATE)) {
    add(city, "city", 4, st);
  }

  add("delhi", "city", 4, "Delhi");

  const list = Array.from(cands.values()).sort(
    (a, b) => b.name.length - a.name.length || a.rank - b.rank
  );

  candMemo.set(markets, list);

  return list;
}

export function detectPlace(
  question: string,
  markets: MarketAgg[]
): Place | null {
  let q = norm(question);

  for (const [dev, en] of DEV_PLACES) {
    if (question.includes(dev)) {
      q += ` ${en}`;
    }
  }

  const list = candidatesFor(markets);
  const padded = ` ${q} `;

  for (const c of list) {
    if (padded.includes(c.pad)) {
      const state = CITY_STATE[c.name] ?? c.state;
      const kind = c.kind === "city" ? "city" : c.kind;

      return {
        asked: titleCase(c.name),
        kind,
        state: kind === "local" ? state : c.state,
      };
    }
  }

  return null;
}