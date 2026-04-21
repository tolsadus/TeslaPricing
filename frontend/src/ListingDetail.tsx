import { useEffect, useState } from "react";
import { fetchListing, fetchPriceHistory } from "./api";
import type { Listing, PricePoint } from "./types";

function formatPrice(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function formatKm(v: number | null): string {
  if (v === null) return "—";
  return `${new Intl.NumberFormat("fr-FR").format(v)} km`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

type ChartPoint = { x: number; y: number; price: number; date: string };

function PriceChart({ points }: { points: PricePoint[] }) {
  const valid = points.filter((p) => p.price_eur !== null) as { price_eur: number; recorded_at: string }[];
  if (valid.length === 0) {
    return <p className="state">No price history yet.</p>;
  }

  const W = 720;
  const H = 280;
  const PAD_L = 64;
  const PAD_R = 24;
  const PAD_T = 24;
  const PAD_B = 40;

  const prices = valid.map((p) => p.price_eur);
  const times = valid.map((p) => new Date(p.recorded_at).getTime());
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);

  const priceRange = maxP - minP || 1;
  const timeRange = maxT - minT || 1;

  const plotted: ChartPoint[] = valid.map((p) => {
    const t = new Date(p.recorded_at).getTime();
    const x = PAD_L + ((t - minT) / timeRange) * (W - PAD_L - PAD_R);
    const y = PAD_T + (1 - (p.price_eur - minP) / priceRange) * (H - PAD_T - PAD_B);
    return { x, y, price: p.price_eur, date: p.recorded_at };
  });

  if (plotted.length === 1) {
    plotted.push({ ...plotted[0], x: W - PAD_R });
  }

  const path = plotted.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
  const area = `${path} L ${plotted[plotted.length - 1].x.toFixed(1)} ${H - PAD_B} L ${plotted[0].x.toFixed(1)} ${H - PAD_B} Z`;

  const yTicks = 4;
  const tickValues = Array.from({ length: yTicks + 1 }, (_, i) => minP + ((maxP - minP) * i) / yTicks);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#171a20" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#171a20" stopOpacity="0" />
        </linearGradient>
      </defs>

      {tickValues.map((v, i) => {
        const y = PAD_T + (1 - (v - minP) / priceRange) * (H - PAD_T - PAD_B);
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#e3e3e3" strokeWidth="1" />
            <text x={PAD_L - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#8a8d93">
              {formatPrice(Math.round(v))}
            </text>
          </g>
        );
      })}

      <text x={PAD_L} y={H - 12} fontSize="11" fill="#8a8d93">{formatDate(valid[0].recorded_at)}</text>
      <text x={W - PAD_R} y={H - 12} textAnchor="end" fontSize="11" fill="#8a8d93">
        {formatDate(valid[valid.length - 1].recorded_at)}
      </text>

      <path d={area} fill="url(#area-grad)" />
      <path d={path} fill="none" stroke="#171a20" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {plotted.slice(0, valid.length).map((pt, i) => (
        <g key={i}>
          <circle cx={pt.x} cy={pt.y} r="4" fill="#fff" stroke="#171a20" strokeWidth="2" />
          <title>{`${formatPrice(pt.price)} — ${formatDate(pt.date)}`}</title>
        </g>
      ))}
    </svg>
  );
}

export default function ListingDetail({ id }: { id: number }) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([fetchListing(id), fetchPriceHistory(id)])
      .then(([l, h]) => {
        setListing(l);
        setHistory(h);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="state error">Error: {error}</p>;
  if (!listing) return <p className="state">Loading…</p>;

  const prices = history.map((h) => h.price_eur).filter((p): p is number => p !== null);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const delta = first !== undefined && last !== undefined ? last - first : 0;

  return (
    <div className="detail">
      <button className="back-btn" onClick={() => { window.location.hash = ""; }}>← Back</button>

      <div className="detail-grid">
        {listing.image_url && <img className="detail-img" src={listing.image_url} alt={listing.title} />}
        <div className="detail-info">
          <h2>{listing.title}</h2>
          <p className="detail-price">{formatPrice(listing.price_eur)}</p>
          <p className="meta">
            {listing.year ?? "—"} · {formatKm(listing.mileage_km)} · {listing.fuel ?? "—"}
          </p>
          <p className="location">{listing.location ?? ""}</p>
          <div className="cta-row">
            <a className="btn btn-primary" href={listing.url} target="_blank" rel="noreferrer">
              View on {listing.source}
            </a>
          </div>
        </div>
      </div>

      <section className="chart-section">
        <div className="chart-head">
          <h3>Price evolution</h3>
          {first !== undefined && last !== undefined && first !== last && (
            <span className={`delta ${delta < 0 ? "down" : "up"}`}>
              {delta > 0 ? "+" : ""}{formatPrice(delta)} since first crawl
            </span>
          )}
        </div>
        <PriceChart points={history} />
      </section>
    </div>
  );
}
