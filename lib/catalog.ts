import { COMMODITIES } from "./intent";
import type { Category, Product } from "./types";

export const CATEGORIES: { id: Category; en: string; hi: string }[] = [
  { id: "agri", en: "Agriculture", hi: "\u0915\u0943\u0937\u093F" },
  { id: "lpg", en: "LPG", hi: "\u090F\u0932\u092A\u0940\u091C\u0940" },
  { id: "fuel", en: "Fuel", hi: "\u0908\u0902\u0927\u0928" },
  { id: "grocery", en: "Grocery", hi: "\u0915\u093F\u0930\u093E\u0928\u093E" },
  { id: "construction", en: "Construction", hi: "\u0928\u093F\u0930\u094D\u092E\u093E\u0923" },
  { id: "essentials", en: "Essentials", hi: "\u091C\u093C\u0930\u0942\u0930\u0940 \u0938\u093E\u092E\u093E\u0928" },
];

/* ------------------------------------------------------------------ */
/* Agriculture: every item here is fetched live from Agmarknet.         */
/* `apiName` must match Agmarknet's commodity spelling. If an item says */
/* "no prices reported" while you expect data, fix the spelling here.   */
/* ------------------------------------------------------------------ */

const VEGETABLES = new Set([
  "Onion", "Potato", "Tomato", "Garlic", "Ginger(Green)", "Green Chilli", "Cauliflower", "Cabbage",
  "Brinjal", "Bhindi(Ladies Finger)", "Carrot", "Capsicum", "Pumpkin", "Bottle gourd", "Beetroot",
  "Cucumbar(Kheera)", "Peas Wet", "Coriander(Leaves)",
]);
const FRUITS = new Set([
  "Banana", "Apple", "Mango", "Lemon", "Pomegranate", "Papaya", "Grapes", "Orange", "Water Melon", "Pineapple",
]);
const PULSES = new Set([
  "Arhar (Tur/Red Gram)(Whole)", "Bengal Gram(Gram)(Whole)", "Green Gram (Moong)(Whole)",
  "Black Gram (Urd Beans)(Whole)", "Lentil (Masur)(Whole)",
]);
const OILSEEDS = new Set(["Mustard", "Groundnut", "Soyabean"]);

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function subOf(api: string): string {
  if (VEGETABLES.has(api)) return "vegetables";
  if (FRUITS.has(api)) return "fruits";
  if (PULSES.has(api)) return "pulses";
  if (OILSEEDS.has(api)) return "oilseeds";
  return "grains";
}

const EXTRA_AGRI: { api: string; en: string; hi: string; aliases: string[] }[] = [
  { api: "Carrot", en: "Carrot", hi: "गाजर", aliases: ["carrot", "gajar", "गाजर"] },
  { api: "Capsicum", en: "Capsicum", hi: "शिमला मिर्च", aliases: ["capsicum", "shimla mirch", "शिमला मिर्च"] },
  { api: "Lemon", en: "Lemon", hi: "नींबू", aliases: ["lemon", "nimbu", "nimboo", "नींबू"] },
  { api: "Pomegranate", en: "Pomegranate", hi: "अनार", aliases: ["pomegranate", "anar", "अनार"] },
  { api: "Papaya", en: "Papaya", hi: "पपीता", aliases: ["papaya", "papita", "पपीता"] },
  { api: "Grapes", en: "Grapes", hi: "अंगूर", aliases: ["grapes", "angoor", "angur", "अंगूर"] },
  { api: "Orange", en: "Orange", hi: "संतरा", aliases: ["orange", "santra", "santara", "संतरा"] },
  { api: "Water Melon", en: "Watermelon", hi: "तरबूज़", aliases: ["watermelon", "water melon", "tarbooz", "तरबूज", "तरबूज़"] },
  { api: "Pineapple", en: "Pineapple", hi: "अनानास", aliases: ["pineapple", "ananas", "अनानास"] },
  { api: "Pumpkin", en: "Pumpkin", hi: "कद्दू", aliases: ["pumpkin", "kaddu", "कद्दू"] },
  { api: "Bottle gourd", en: "Bottle gourd", hi: "लौकी", aliases: ["bottle gourd", "lauki", "louki", "लौकी"] },
  { api: "Beetroot", en: "Beetroot", hi: "चुकंदर", aliases: ["beetroot", "chukandar", "चुकंदर"] },
  { api: "Cucumbar(Kheera)", en: "Cucumber", hi: "खीरा", aliases: ["cucumber", "kheera", "khira", "खीरा"] },
  { api: "Peas Wet", en: "Green peas", hi: "मटर", aliases: ["peas", "green peas", "matar", "मटर"] },
  { api: "Coriander(Leaves)", en: "Coriander", hi: "धनिया", aliases: ["coriander", "dhania", "dhaniya", "धनिया"] },
];

const agri: Product[] = [
  ...COMMODITIES.map((c) => ({ api: c.api, en: c.en, hi: c.hi, aliases: c.aliases })),
  ...EXTRA_AGRI,
].map((c) => ({
  id: slug(c.en),
  category: "agri" as const,
  sub: subOf(c.api),
  en: c.en,
  hi: c.hi,
  unit: "kg",
  aliases: c.aliases,
  provider: "mandi" as const,
  apiName: c.api,
}));

/* ------------------------------------------------------------------ */
/* Everything else.                                                    */
/* Only petrol and diesel have a live official feed (PPAC). The others */
/* are listed so the agent understands them, but they show             */
/* "Data currently unavailable" until a real feed is connected.        */
/* ------------------------------------------------------------------ */

const R_LPG =
  "No free official API publishes city- or district-wise LPG cylinder prices. IOCL, BPCL and HPCL publish them on their own websites and the price depends on the state and city, so Khabri will not guess one.";
const R_CNG =
  "CNG and PNG are priced by city gas distributors (IGL, MGL, Adani Total Gas and others). There is no single official API for them.";
const R_GROCERY =
  "The Department of Consumer Affairs price portal has no public API, and the data.gov.in retail-price datasets stop at 2015. Khabri has no verified live source for this item.";
const R_CONSTRUCTION =
  "There is no official public price feed for construction materials; prices are set by local suppliers and change by city.";
const R_ESSENTIAL =
  "Khabri has no verified live official source for this item.";

function none(
  id: string,
  category: Category,
  en: string,
  hi: string,
  unit: string,
  aliases: string[],
  unavailableReason: string
): Product {
  return { id, category, en, hi, unit, aliases, provider: "none", unavailableReason };
}

const others: Product[] = [
  // Fuel
  {
    id: "petrol",
    category: "fuel",
    en: "Petrol",
    hi: "पेट्रोल",
    unit: "litre",
    aliases: ["petrol", "gasoline", "पेट्रोल"],
    provider: "ppac",
  },
  {
    id: "diesel",
    category: "fuel",
    en: "Diesel",
    hi: "डीज़ल",
    unit: "litre",
    aliases: ["diesel", "डीजल", "डीज़ल"],
    provider: "ppac",
  },
  none("cng", "fuel", "CNG", "सीएनजी", "kg", ["cng", "सीएनजी"], R_CNG),
  none("png", "fuel", "PNG", "पीएनजी", "SCM", ["png", "piped gas", "pipeline gas", "पीएनजी"], R_CNG),

  // LPG
  none(
    "lpg-domestic",
    "lpg",
    "Domestic LPG (14.2 kg)",
    "घरेलू गैस सिलेंडर (14.2 किलो)",
    "14.2 kg cylinder",
    ["lpg", "gas cylinder", "cylinder", "cooking gas", "rasoi gas", "domestic gas", "domestic lpg", "gas", "सिलेंडर", "सिलिंडर", "रसोई गैस", "एलपीजी", "गैस"],
    R_LPG
  ),
  none(
    "lpg-commercial",
    "lpg",
    "Commercial LPG (19 kg)",
    "कमर्शियल गैस सिलेंडर (19 किलो)",
    "19 kg cylinder",
    ["commercial lpg", "commercial cylinder", "commercial gas", "कमर्शियल सिलेंडर", "कमर्शियल गैस"],
    R_LPG
  ),

  // Grocery
  none("milk", "grocery", "Milk", "दूध", "litre", ["milk", "doodh", "dudh", "दूध"], R_GROCERY),
  none("sugar", "grocery", "Sugar", "चीनी", "kg", ["sugar", "chini", "cheeni", "shakkar", "चीनी", "शक्कर"], R_GROCERY),
  none("flour", "grocery", "Flour (atta)", "आटा", "kg", ["flour", "atta", "aata", "maida", "आटा", "मैदा"], R_GROCERY),
  none("cooking-oil", "grocery", "Cooking oil", "खाने का तेल", "litre", ["cooking oil", "edible oil", "mustard oil", "refined oil", "sarson ka tel", "khane ka tel", "tel", "oil", "तेल", "खाने का तेल"], R_GROCERY),
  none("salt", "grocery", "Salt", "नमक", "kg", ["salt", "namak", "नमक"], R_GROCERY),
  none("eggs", "grocery", "Eggs", "अंडे", "dozen", ["egg", "eggs", "anda", "ande", "अंडा", "अंडे"], R_GROCERY),

  // Construction
  none("cement", "construction", "Cement", "सीमेंट", "50 kg bag", ["cement", "सीमेंट"], R_CONSTRUCTION),
  none("steel", "construction", "Steel (TMT)", "सरिया / स्टील", "tonne", ["steel", "tmt", "sariya", "saria", "iron rod", "सरिया", "स्टील"], R_CONSTRUCTION),
  none("sand", "construction", "Sand", "रेत", "tonne", ["sand", "ret", "baalu", "balu", "रेत", "बालू"], R_CONSTRUCTION),
  none("bricks", "construction", "Bricks", "ईंट", "1,000 bricks", ["brick", "bricks", "eent", "ईंट"], R_CONSTRUCTION),

  // Other daily essentials
  none("tea", "essentials", "Tea", "चाय", "kg", ["tea", "chai", "chay", "चाय"], R_ESSENTIAL),
  none("jaggery", "essentials", "Jaggery", "गुड़", "kg", ["jaggery", "gur", "gud", "गुड़", "गुड"], R_ESSENTIAL),
  none("vanaspati", "essentials", "Vanaspati", "वनस्पति घी", "kg", ["vanaspati", "वनस्पति"], R_ESSENTIAL),
];

export const CATALOG: Product[] = [...agri, ...others];

export function byId(id: string | null | undefined): Product | null {
  if (!id) return null;
  return CATALOG.find((p) => p.id === id) ?? null;
}

export function inCategory(c: Category): Product[] {
  return CATALOG.filter((p) => p.category === c);
}

export const SOURCES = {
  agmarknet: {
    name: "Agmarknet via data.gov.in (Ministry of Agriculture, Govt. of India)",
    url: "https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi",
  },
  ppac: { name: "PPAC (Ministry of Petroleum & Natural Gas) — daily RSP, IOCL Delhi outlet", url: "https://ppac.gov.in/archives/impnews" },
  ppacPrices: { name: "PPAC — Prices", url: "https://ppac.gov.in/prices" },
  iocl: { name: "Indian Oil — prices of petroleum products", url: "https://iocl.com/prices-of-petroleum-products" },
  doca: { name: "Dept. of Consumer Affairs — Price Monitoring", url: "https://fcainfoweb.nic.in/" },
};
