# Khabri — Indian Market Intelligence Agent

Ask the price of produce, fuel, gas cylinders, groceries or building materials, in Hindi or English, by typing or speaking. Khabri answers in text and voice, shows where the number came from, and forecasts only when it has enough real history to do so.

**Honesty rules built into the code**
- No price is ever hardcoded, simulated or guessed. If there is no verified live source, the screen says **"Data currently unavailable"** and gives the reason.
- Actual prices and AI forecasts are visually separate (solid black line vs dashed blue line, "ACTUAL" vs "AI FORECAST" labels).
- No forecast is produced with fewer than 7 days of recorded history.
- Petrol and diesel are **not** machine-forecast: only official revisions are reported.

## What is live and what is not

| Category | Items | Status | Source |
| --- | --- | --- | --- |
| Agriculture | ~40 vegetables, fruits, grains, pulses, oilseeds (rice, wheat, tomato, onion, dal ...) | **Live**, all mandis in India, by state / district / city, with forecast | Agmarknet via data.gov.in |
| Fuel | Petrol, diesel | **Live for Delhi only** (official). Other cities show "Data currently unavailable" and Delhi as a labelled reference | PPAC daily notices (IOCL Delhi outlet) |
| Fuel | CNG, PNG | Data currently unavailable | No single official API (city gas distributors set prices) |
| LPG | Domestic 14.2 kg, commercial 19 kg | Data currently unavailable | No free official API for city/district prices. IOCL/BPCL/HPCL publish on their websites |
| Grocery | Milk, sugar, flour, cooking oil, salt, eggs | Data currently unavailable | DoCA's price portal has no public API; data.gov.in retail datasets stop at 2015 |
| Construction | Cement, steel, sand, bricks | Data currently unavailable | No official public feed |
| Essentials | Tea, jaggery, vanaspati | Data currently unavailable | No verified feed |

To light up a category later, add a provider in `lib/providers/` and set `provider` for the products in `lib/catalog.ts`. The agent, UI, forecaster and history store need no other change. If you obtain a licensed feed (for example a city-wise LPG/fuel API), that is the only place to plug it in.

## Where is FastAPI?

The Khabri project you received is **Next.js + TypeScript** (you asked for TypeScript). It has no Python/FastAPI service, so the backend is the Next.js API routes in `app/api/`. They were extended, not replaced, and no separate backend was created.

## Install and run (Windows, VS Code)

1. Install **Node.js LTS** from https://nodejs.org (`node -v` should be 18.17 or newer).
2. Unzip, then **File → Open Folder** → the `khabri` folder (the one containing `package.json`). Keep it outside Downloads, for example `C:\khabri`.
3. Open the terminal (**Ctrl + `**):
   ```
   npm install
   copy .env.local.example .env.local
   ```
4. Open `.env.local` and fill in `GNANI_API_KEY` and `DATA_GOV_API_KEY` (free at https://data.gov.in → My Account).
5. Start:
   ```
   npm run dev
   ```
6. Open http://localhost:3000 in **Chrome or Edge** and allow the microphone.

## Making forecasts work (important)

Government feeds publish **today's** prices only. Khabri saves each day's prices to `data/history.json` and forecasts from that record. So:

- On day 1 the forecast card says "Not enough history (1 / 7 days)". That is correct behaviour, not a bug.
- Khabri also tries to fetch the previous 14 days from data.gov.in once per item. If the API supports it, history appears immediately; if not, it builds up daily.
- To save prices every day even when nobody uses the app, open http://localhost:3000/api/collect once a day, or schedule it on Windows:
  1. Keep `npm run dev` (or `npm run build` then `npm start`) running.
  2. Open **Task Scheduler → Create Basic Task → Daily**.
  3. Action: *Start a program* → `curl.exe` → arguments: `http://localhost:3000/api/collect`
- `/api/collect?items=all` saves every agriculture item (slow). `/api/collect?items=rice,wheat` saves chosen ones.

After about 7 days of history, forecasts appear. Confidence grows with more history and shrinks when prices are noisy.

## Speed

- **Instant answers:** mandi downloads are shared (one download per item, however many people ask), served instantly while refreshing in the background, and saved to `data/cache/` so a restart is not slow. Rice, Wheat, Tomato, Onion and Potato are pre-loaded when the server starts.
- **Faster questions:** place names and state summaries are computed once per download, not once per question.
- **Fewer downloads:** switching items no longer reloads the State / District / City lists.
- **Voice:** repeated spoken replies come from a small memory cache (instant, no extra Gnani credits).
- For the fastest feel, run the production build instead of `npm run dev`:
  ```
  npm run build
  npm start
  ```

## Try these

- `Rice price in Bhopal`
- `What is the domestic LPG cylinder price in Durg today?` → "Data currently unavailable" with the reason and official links
- `Petrol ka price kitna hai?`
- `Kal tamatar mehenga hoga?` → forecast, or an honest "not enough history yet"
- `Is week rice ke prices badhenge?` → 7-day forecast
- `Aaj cement ka rate kya hai?`
- `Aaj gas cylinder ka kya rate hai?`

("Kal" can mean yesterday or tomorrow. "kal ... hoga" is read as tomorrow, "kal ... tha" as yesterday, and plain "kal" shows today's price with a note.)

## How the forecast works

Damped-trend exponential smoothing (Holt) over the recorded daily series, with parameters chosen by minimising one-step-ahead error on that same history. It outputs the expected price, an 80% likely range, the change and percentage, and a confidence score combining how many days of history exist with how accurately the model predicted past days. Mandi series are the daily **median across reporting mandis**, which can move when the set of reporting mandis changes, so treat forecasts as indicative.

## Project map

| File | What it does |
| --- | --- |
| `app/page.tsx` | Interface: AI chat, categories, location selectors, dashboard, charts |
| `app/globals.css` | Light blue / black / white styling |
| `components/PriceChart.tsx` | History chart (actual solid, forecast dashed with range) |
| `components/ForecastCard.tsx` | Forecast / no-forecast / official-revision card |
| `app/api/ask/route.ts` | One endpoint for the chat box and the dashboard |
| `app/api/locations/route.ts` | State → district → city lists from live mandi data |
| `app/api/collect/route.ts` | Saves today's prices (daily job) |
| `app/api/stt/route.ts`, `app/api/tts/route.ts` | Gnani speech-to-text and text-to-speech |
| `lib/catalog.ts` | All products, categories, Hindi/English names, source links |
| `lib/agent/nlu.ts` | Understands product, category, date and forecast intent |
| `lib/agent/run.ts` | Orchestrates one question end to end |
| `lib/agent/reply.ts` | Builds the written and spoken replies (numbers as Hindi/English words) |
| `lib/providers/agri.ts` | Mandi service: scope resolution, analysis, history, backfill |
| `lib/providers/fuel.ts` | PPAC fuel service |
| `lib/forecast.ts` | Forecasting engine |
| `lib/store.ts` | History store (`data/history.json`) |
| `lib/mandi.ts` | data.gov.in client with caching and error handling |
| `lib/intent.ts`, `lib/analyze.ts`, `lib/compose.ts` | Unchanged mandi logic (item names, places, medians, number words) |

## Notes

- If an agriculture item says no prices reported but you expect data, its Agmarknet spelling in `lib/catalog.ts` / `lib/intent.ts` may need adjusting.
- The PPAC fuel parser reads PPAC's public "daily price" notices list. If PPAC changes that page, fuel shows "Data currently unavailable" instead of a wrong number.
- Gnani can limit you to one request at a time, so let a voice reply finish before asking again.
- If `npm install` fails with `ECONNRESET` or `EPERM`, move the folder out of Downloads and retry on a stable connection.
