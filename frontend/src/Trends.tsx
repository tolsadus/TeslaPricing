import { useEffect, useState } from "react";
import { fetchTrends } from "./api";
import type { TrendPoint } from "./types";
import { useTranslation } from "./i18n";

const MODEL_COLORS: Record<string, string> = {
  "Model 3": "#171a20",
  "Model Y": "#c0392b",
  "Model S": "#2471a3",
  "Model X": "#1e8449",
};
const FALLBACK_COLORS = ["#8e44ad", "#d35400", "#16a085", "#f39c12"];

function formatPrice(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type Series = { model: string; color: string; points: { date: string; avg: number; min: number; max: number; count: number }[] };

function normalizeModel(name: string): string {
  return name.replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

function buildSeries(data: TrendPoint[]): Series[] {
  const map = new Map<string, Series["points"]>();
  for (const row of data) {
    const key = normalizeModel(row.model ?? "Unknown");
    if (!map.has(key)) map.set(key, []);
    if (row.avg_price !== null) {
      map.get(key)!.push({
        date: row.date,
        avg: row.avg_price,
        min: row.min_price ?? row.avg_price,
        max: row.max_price ?? row.avg_price,
        count: row.count,
      });
    }
  }

  let fallbackIdx = 0;
  return Array.from(map.entries()).map(([model, points]) => ({
    model,
    color: MODEL_COLORS[model] ?? FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length],
    points,
  }));
}

function TrendChart({ series, emptyMessage }: { series: Series[]; emptyMessage: string }) {
  const allPoints = series.flatMap((s) => s.points);
  if (allPoints.length === 0) {
    return (
      <div className="trend-empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const W = 800;
  const H = 320;
  const PAD_L = 72;
  const PAD_R = 24;
  const PAD_T = 24;
  const PAD_B = 44;

  const allPrices = allPoints.map((p) => p.avg);
  const allDates = allPoints.map((p) => new Date(p.date).getTime());
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const minT = Math.min(...allDates);
  const maxT = Math.max(...allDates);
  const priceRange = maxP - minP || 1;
  const timeRange = maxT - minT || 1;

  const toX = (d: string) =>
    PAD_L + ((new Date(d).getTime() - minT) / timeRange) * (W - PAD_L - PAD_R);
  const toY = (p: number) =>
    PAD_T + (1 - (p - minP) / priceRange) * (H - PAD_T - PAD_B);

  const yTicks = 4;
  const tickStep = (maxP - minP) / yTicks || 1;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => minP + tickStep * i);

  // Unique x-axis dates
  const uniqueDates = [...new Set(allPoints.map((p) => p.date))].sort();

  return (
    <svg className="trend-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        {series.map((s) => (
          <linearGradient key={s.model} id={`grad-${s.model.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {/* Grid lines */}
      {yTickValues.map((v, i) => {
        const y = toY(v);
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#e3e3e3" strokeWidth="1" />
            <text x={PAD_L - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#8a8d93">
              {formatPrice(Math.round(v))}
            </text>
          </g>
        );
      })}

      {/* X axis date labels */}
      {uniqueDates.map((d, i) => {
        if (uniqueDates.length > 1 && i > 0 && i < uniqueDates.length - 1) return null;
        const x = toX(d);
        return (
          <text key={d} x={x} y={H - 10} textAnchor="middle" fontSize="11" fill="#8a8d93">
            {formatDate(d)}
          </text>
        );
      })}

      {/* Series */}
      {series.map((s) => {
        if (s.points.length === 0) return null;
        const pts = s.points.map((p) => ({ x: toX(p.date), y: toY(p.avg), ...p }));
        const extendedPts = pts.length === 1 ? [pts[0], { ...pts[0], x: W - PAD_R }] : pts;
        const linePath = extendedPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
        const areaPath = `${linePath} L ${extendedPts[extendedPts.length - 1].x.toFixed(1)} ${H - PAD_B} L ${extendedPts[0].x.toFixed(1)} ${H - PAD_B} Z`;

        return (
          <g key={s.model}>
            <path d={areaPath} fill={`url(#grad-${s.model.replace(/\s/g, "")})`} />
            <path d={linePath} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {pts.map((pt, i) => (
              <g key={i}>
                <circle cx={pt.x} cy={pt.y} r="5" fill="#fff" stroke={s.color} strokeWidth="2.5" />
                <title>{`${s.model} — ${formatDate(pt.date)}\nAvg: ${formatPrice(pt.avg)}\nMin: ${formatPrice(pt.min)} / Max: ${formatPrice(pt.max)}\n${pt.count} listings`}</title>
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function StatCard({ model, color, points, listingsLabel }: Series & { listingsLabel: string }) {
  const latest = points[points.length - 1];
  const first = points[0];
  if (!latest) return null;
  const delta = first && latest !== first ? latest.avg - first.avg : null;

  return (
    <div className="trend-card">
      <div className="trend-card-accent" style={{ background: color }} />
      <div className="trend-card-body">
        <p className="trend-card-model">{model}</p>
        <p className="trend-card-price">{formatPrice(latest.avg)}</p>
        <p className="trend-card-meta">
          {formatPrice(latest.min)} – {formatPrice(latest.max)}
        </p>
        <p className="trend-card-count">{latest.count} {listingsLabel}</p>
        {delta !== null && (
          <span className={`delta ${delta <= 0 ? "down" : "up"}`}>
            {delta > 0 ? "+" : ""}{formatPrice(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Trends() {
  const { t } = useTranslation();
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTrends()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const series = buildSeries(data);

  return (
    <div className="trends-page">
      <div className="page-header">
        <div>
          <h2 className="dropped-title">{t("trends_title")}</h2>
          <p className="dropped-subtitle">{t("trends_subtitle")}</p>
        </div>
      </div>


      {loading && <span className="spinner" />}
      {error && <p className="state error">Error: {error}</p>}

      {!loading && !error && (
        <>
          <div className="trend-chart-wrap">
            <div className="trend-legend">
              {series.map((s) => (
                <span key={s.model} className="trend-legend-item">
                  <span className="trend-legend-dot" style={{ background: s.color }} />
                  {s.model}
                </span>
              ))}
            </div>
            <TrendChart series={series} emptyMessage={t("trends_empty")} />
          </div>

          <div className="trend-cards">
            {series.map((s) => (
              <StatCard key={s.model} {...s} listingsLabel={t("trends_listings")} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
