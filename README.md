# Khabari – AI-Powered Information & Voice Assistant

Khabari is a voice-enabled AI assistant that helps people access everyday information without having to search through multiple websites or type complicated queries.

I built Khabari with a simple goal: make useful information easier to find, understand, and access through a conversational interface.

Users can ask questions in Hindi or English, either by typing or speaking. Khabari processes the query, finds relevant information, and responds with text and voice.

## What can Khabari do?

### 1. Agriculture and Mandi Prices

- Access agricultural commodity prices from mandis across India.
- Search for products such as rice, wheat, tomato, onion, potato, pulses, and other agricultural products.
- Explore prices based on state, district, and city.
- View historical price trends and AI-based forecasts when sufficient historical data is available.

### 2. Fuel Price Information

- Get official petrol and diesel price information for Delhi.
- Understand when verified price information is unavailable for other locations.
- Access source information rather than receiving estimated or invented prices.

### 3. Everyday Price Queries

Khabari also supports questions about:

- LPG cylinders
- CNG and PNG
- Milk and groceries
- Cooking oil and other essentials
- Cement, steel, sand, and building materials

Availability depends on verified data sources. When reliable data is unavailable, Khabari clearly communicates that instead of displaying an assumed price.

### 4. Voice-Based Interaction

- Ask questions using a microphone.
- Convert speech into text using speech recognition.
- Receive written responses.
- Listen to spoken responses using Gnani AI voice technology.

The speech recognition pipeline uses Hugging Face Whisper for automatic speech recognition, while Gnani AI supports speech generation.

## How the AI workflow works

Khabari follows a simple processing pipeline:

1. The user enters a question through text or voice.
2. If the user speaks, the audio is processed by the speech recognition system.
3. The application identifies the product, location, and type of information requested.
4. The backend retrieves relevant information from available data providers.
5. AI processes the request and prepares an understandable response.
6. The answer is displayed as text and can also be delivered through voice.

## Technology Stack

| Technology           | Purpose                           |
| -------------------- | --------------------------------- |
| Next.js              | Frontend and application backend  |
| TypeScript           | Application logic and type safety |
| React                | User interface                    |
| Tailwind CSS         | Styling                           |
| Hugging Face Whisper | Speech recognition                |
| Gnani AI             | Text-to-speech                    |
| Google Gemini        | AI-powered query processing       |
| data.gov.in          | Agricultural market price data    |
| PPAC                 | Official fuel price information   |

## Data Accuracy and Transparency

One thing I wanted to prioritize while building Khabari was data reliability.

- Prices are not hardcoded or randomly generated.
- Actual market prices and AI forecasts are displayed separately.
- Forecasting requires at least seven days of recorded price history.
- Petrol and diesel prices are not artificially forecast.
- When verified information is unavailable, the application communicates that clearly.

I believe an information assistant should be transparent about what it knows and what it cannot verify.

## Forecasting

Khabari uses damped-trend exponential smoothing (Holt's method) to analyze recorded daily price history.

It can provide:

- Expected future prices
- An estimated price range
- Percentage changes
- Forecast confidence

The forecasts are indicative, not guaranteed future prices.

## Project Structure

```text
khabri/
│
├── app/
│   ├── api/
│   │   ├── ask/
│   │   ├── collect/
│   │   ├── locations/
│   │   ├── stt/
│   │   └── tts/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── ForecastCard.tsx
│   └── PriceChart.tsx
│
├── lib/
│   ├── agent/
│   ├── providers/
│   ├── audio.ts
│   ├── forecast.ts
│   ├── mandi.ts
│   ├── catalog.ts
│   └── store.ts
│
├── public/
├── package.json
└── README.md
```

## Getting Started

### Requirements

- Node.js 18.17 or newer
- npm
- API credentials for the services you want to use

### Installation

Clone the repository:

```bash
git clone https://github.com/Dgd456sfh/khabari.git
```

Move into the project directory:

```bash
cd khabari
```

Install dependencies:

```bash
npm install
```

Create the environment file:

```bash
copy .env.local.example .env.local
```

Add your API credentials to `.env.local`:

```env
GNANI_API_KEY=your_gnani_api_key
DATA_GOV_API_KEY=your_data_gov_api_key
GEMINI_API_KEY=your_gemini_api_key
```

Use the exact Gemini environment variable name expected by your application if it differs from the example above.

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Allow microphone access when prompted.

## Future Improvements

Khabari is an ongoing project, and there are several things I would like to improve:

- Better recognition of regional Indian languages and dialects.
- More reliable multilingual speech interaction.
- Integration with additional verified government and public data sources.
- More historical data for improved forecasting.
- Better accessibility and a smoother voice interaction experience.

## Why I Built Khabari

I wanted to build something that solves a practical problem rather than just another application that demonstrates AI.

Information about agricultural prices, fuel, and everyday essentials matters to people in their daily lives. However, finding reliable information can sometimes be difficult.

With Khabari, I am exploring how AI, voice technology, and public data sources can work together to make that information easier to access.

This project is a step towards building more accessible and useful AI-powered applications.

---

**Built with curiosity and a passion for AI, voice technology, and real-world problem solving.**

**Project:** Khabari
**Developer:** Khushi Manikpuri
