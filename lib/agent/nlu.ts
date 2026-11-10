import { CATALOG } from "../catalog";
import type { Category, Product } from "../types";

/*
 * Understands a Hindi / English / Hinglish question and pulls out:
 * the product, the category, whether a forecast is wanted, and when (today, tomorrow, this week).
 * The place is resolved separately (it needs the list of real locations).
 */

export interface Parsed {
  product: Product | null;
  category: Category | null;
  when: "today" | "yesterday" | "tomorrow" | "week" | "unclear_kal";
  wantsForecast: boolean;
  horizonDays: number;
}

const ASCII = /^[\x00-\x7F]+$/;

function tokens(q: string): string[] {
  return q.toLowerCase().split(/[\s,.?!।;:()"'/\\-]+/).filter(Boolean);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasMatches(lower: string, toks: string[], alias: string): boolean {
  if (ASCII.test(alias)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRe(alias)}([^a-z0-9]|$)`).test(lower);
  }
  // Devanagari: short words must match a whole token; longer ones may carry a suffix.
  return toks.some((t) => t === alias || (alias.length > 3 && t.includes(alias)));
}

const ALIAS_INDEX = CATALOG.flatMap((p) => p.aliases.map((a) => ({ p, a }))).sort(
  (x, y) => y.a.length - x.a.length
);

const COMMERCIAL = /commercial|19\s?kg|कमर्शियल|व्यावसायिक/i;

const CATEGORY_WORDS: [RegExp, Category][] = [
  [/vegetable|sabzi|sabji|sabziyan|सब्ज़ी|सब्जी|fruit|phal|फल|mandi|मंडी|pulses|दालें/i, "agri"],
  [/fuel|ईंधन|eendhan/i, "fuel"],
  [/grocery|kirana|किराना|राशन|ration/i, "grocery"],
  [/construction|nirman|निर्माण|building material/i, "construction"],
];

export function parseQuery(q: string): Parsed {
  const lower = q.toLowerCase();
  const toks = tokens(q);

  // Product: longest alias wins ("mustard oil" beats "mustard", "commercial lpg" beats "lpg").
  let product: Product | null = null;
  for (const { p, a } of ALIAS_INDEX) {
    if (aliasMatches(lower, toks, a)) {
      product = p;
      break;
    }
  }
  if (product?.id === "lpg-domestic" && COMMERCIAL.test(q)) {
    product = CATALOG.find((p) => p.id === "lpg-commercial") ?? product;
  }

  let category: Category | null = product?.category ?? null;
  if (!category) {
    for (const [re, c] of CATEGORY_WORDS) {
      if (re.test(q)) {
        category = c;
        break;
      }
    }
  }

  // Time words.
  const futureCue =
    /\b(hoga|hogi|honge|badhega|badhegi|badhenge|ghatega|ghategi|ghatenge|badh|ghat|will|expected|predict|prediction|forecast|going to|trend|rise|fall|increase|decrease|drop)\b/i.test(q) ||
    /होगा|होगी|होंगे|बढ़ेगा|बढ़ेगी|बढ़ेंगे|बढेगा|बढेंगे|घटेगा|घटेगी|घटेंगे|अनुमान|पूर्वानुमान/.test(q);
  const pastCue =
    /\b(tha|thi|the|was|were|yesterday|kal ka|pehle|previous|last)\b/i.test(q) || /था|थी|थे|बीता|पिछला/.test(q);
  const hasKal = /\bkal\b/i.test(q) || /कल/.test(q);
  const weekWord =
    /\b(week|hafte|hafta|haftey|saptah)\b/i.test(q) || /हफ्ते|हफ़्ते|हफ्ता|सप्ताह/.test(q);
  const parso = /\bparso\b|परसों|day after tomorrow/i.test(q);
  const tomorrowWord = /\btomorrow\b|\btmrw\b/i.test(q);

  let when: Parsed["when"] = "today";
  let horizon = 1;

  if (weekWord && (futureCue || /\b(next|is|this|agle|aane)\b/i.test(q) || /अगले|इस|आने/.test(q))) {
    when = "week";
    horizon = 7;
  } else if (parso) {
    when = "tomorrow";
    horizon = 2;
  } else if (tomorrowWord || (hasKal && futureCue && !pastCue)) {
    when = "tomorrow";
    horizon = 1;
  } else if (hasKal && pastCue) {
    when = "yesterday";
  } else if (hasKal) {
    when = "unclear_kal";
  }

  const wantsForecast = futureCue || when === "tomorrow" || when === "week";

  return { product, category, when, wantsForecast, horizonDays: horizon };
}
