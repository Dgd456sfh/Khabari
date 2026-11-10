"use client";

import { formatRupee } from "@/lib/compose";
import type { ForecastBlock, SeriesPoint } from "@/lib/types";

/*
 * Actual prices are a solid black line with dots.
 * The AI forecast is a separate dashed light-blue line with a shaded range,
 * so the two can never be mistaken for each other.
 */

const W = 640;
const H = 240;
const PAD = { l: 52, r: 16, t: 16, b: 34 };

const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
const short = (d: string) => {
  const [, m, day] = d.split("-");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return `${Number(day)} ${mon}`;
};

export default function PriceChart({
  history,
  forecast,
  unit,
}: {
  history: SeriesPoint[];
  forecast: ForecastBlock | null;
  unit: string;
}) {
  const pts = history.slice(-60);
  const fc = forecast && forecast.status === "ok" ? forecast : null;

  if (pts.length < 2) {
    return (
      <div className="chart-empty">
        {pts.length === 0
          ? "No recorded history yet."
          : "Only one day of history is recorded so far. The chart appears after two or more days — Khabri saves prices every day it runs."}
      </div>
    );
  }

  const xs = pts.map((p) => ts(p.date));
  const xMin = xs[0];
  const xMax = Math.max(xs[xs.length - 1], fc ? ts(fc.targetDate) : 0);
  const values = [...pts.map((p) => p.value), ...(fc ? [fc.low, fc.high, fc.value] : [])];
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMax === yMin) {
    yMin -= 1;
    yMax += 1;
  }
  const padY = (yMax - yMin) * 0.12;
  yMin -= padY;
  yMax += padY;

  const x = (t: number) => PAD.l + ((t - xMin) / Math.max(1, xMax - xMin)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(ts(p.date)).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];

  const ticks = [0, 0.5, 1].map((f) => yMin + (yMax - yMin) * f);
  const dec = unit === "litre" ? 2 : 1;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Price history chart">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="grid-line" />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" className="axis">
              {`₹${v.toFixed(dec)}`}
            </text>
          </g>
        ))}

        {fc && (
          <>
            <polygon
              className="band"
              points={`${x(ts(last.date))},${y(last.value)} ${x(ts(fc.targetDate))},${y(fc.high)} ${x(ts(fc.targetDate))},${y(fc.low)}`}
            />
            <line
              className="fc-line"
              x1={x(ts(last.date))}
              y1={y(last.value)}
              x2={x(ts(fc.targetDate))}
              y2={y(fc.value)}
            />
            <circle cx={x(ts(fc.targetDate))} cy={y(fc.value)} r={5} className="fc-dot" />
          </>
        )}

        <path d={line} className="actual-line" />
        {pts.map((p) => (
          <circle key={p.date} cx={x(ts(p.date))} cy={y(p.value)} r={pts.length > 30 ? 1.5 : 3} className="actual-dot">
            <title>{`${short(p.date)}: ${formatRupee(p.value)}`}</title>
          </circle>
        ))}

        <text x={PAD.l} y={H - 10} className="axis">
          {short(pts[0].date)}
        </text>
        <text x={W - PAD.r} y={H - 10} textAnchor="end" className="axis">
          {fc ? `${short(fc.targetDate)} (forecast)` : short(last.date)}
        </text>
      </svg>
      <div className="legend">
        <span>
          <i className="sw actual" /> Actual recorded price
        </span>
        {fc && (
          <span>
            <i className="sw fc" /> AI forecast (estimate, with likely range)
          </span>
        )}
      </div>
    </div>
  );
}
