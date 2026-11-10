"use client";

import { formatRupee } from "@/lib/compose";
import type { ForecastBlock } from "@/lib/types";

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const mon = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][Number(m) - 1];

  return `${Number(d)} ${mon} ${y}`;
}

export default function ForecastCard({
  forecast,
  unit,
}: {
  forecast: ForecastBlock | null;
  unit: string;
}) {
  const dec = unit === "litre" ? 2 : 1;

  const fmt = (v: number) => `₹${v.toFixed(dec)}`;

  if (!forecast) return null;

  if (forecast.status === "ok") {
    const arrow =
      forecast.direction === "up"
        ? "▲"
        : forecast.direction === "down"
          ? "▼"
          : "●";

    const dirText =
      forecast.direction === "flat"
        ? "No clear change expected"
        : `${forecast.direction === "up" ? "Increase" : "Decrease"} of ${fmt(
            Math.abs(forecast.change)
          )}`;

    return (
      <div className="stat forecast">
        <div className="k">
          <span className="tag ai">AI FORECAST</span>{" "}
          {prettyDate(forecast.targetDate)}
        </div>

        <div className="v">
          {fmt(forecast.value)} <small>/ {unit}</small>
        </div>

        <div className={`delta ${forecast.direction}`}>
          {arrow} {dirText}
          {forecast.direction !== "flat" &&
            ` (${forecast.pct > 0 ? "+" : ""}${forecast.pct}%)`}
        </div>

        <div className="where">
          Likely range {fmt(forecast.low)} – {fmt(forecast.high)}
        </div>

        <div
          className="meter"
          title={`Confidence ${forecast.confidencePct}%`}
        >
          <span
            style={{
              width: `${Math.max(6, forecast.confidencePct)}%`,
            }}
          />
        </div>

        <div className="where">
          Confidence: <b>{forecast.confidence}</b> (
          {forecast.confidencePct}%) · based on{" "}
          {forecast.basedOnDays} days of recorded prices
        </div>

        <div className="fine">
          An estimate, not an actual price.
        </div>
      </div>
    );
  }

  if (forecast.status === "insufficient") {
    return (
      <div className="stat forecast muted">
        <div className="k">
          <span className="tag">NO FORECAST</span>{" "}
          Not enough history
        </div>

        <div className="v small">
          {forecast.have} / {forecast.need} days
        </div>

        <div className="meter">
          <span
            style={{
              width: `${Math.min(
                100,
                (forecast.have / forecast.need) * 100
              )}%`,
            }}
          />
        </div>

        <div className="where">{forecast.message}</div>
      </div>
    );
  }

  if (forecast.status === "official_revision") {
    return (
      <div className="stat forecast muted">
        <div className="k">
          <span className="tag">OFFICIAL REVISIONS</span>{" "}
          No ML forecast
        </div>

        <div className="where">{forecast.message}</div>

        {forecast.lastRevision && (
          <div className="delta flat">
            Last revision{" "}
            {prettyDate(forecast.lastRevision.date)}:{" "}
            {formatRupee(forecast.lastRevision.from)} →{" "}
            {formatRupee(forecast.lastRevision.to)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stat forecast muted">
      <div className="k">
        <span className="tag">NO FORECAST</span>
      </div>

      <div className="where">{forecast.message}</div>
    </div>
  );
}