import { useEffect, useState } from "react";
import { fetchListing, fetchPhotos, fetchPriceHistory } from "./api";
import type { Listing, PricePoint } from "./types";
import { getDrivetrain, DRIVETRAIN_LABEL } from "./utils";
import { useTranslation } from "./i18n";

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

function PriceChart({ points, emptyMessage }: { points: PricePoint[]; emptyMessage: string }) {
  const valid = points.filter((p) => p.price_eur !== null) as { price_eur: number; recorded_at: string }[];
  if (valid.length === 0) {
    return <p className="state">{emptyMessage}</p>;
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

function Carousel({ photos, fallback, photoAlt }: { photos: string[]; fallback: string | null; photoAlt: string }) {
  const [index, setIndex] = useState(0);
  const images = photos.length > 0 ? photos : fallback ? [fallback] : [];
  if (images.length === 0) return null;

  return (
    <div className="carousel">
      <img src={images[index]} alt={`${photoAlt} ${index + 1}`} referrerPolicy="no-referrer" />
      {images.length > 1 && (
        <>
          <button className="carousel-btn prev" onClick={() => setIndex((i) => (i - 1 + images.length) % images.length)}>‹</button>
          <button className="carousel-btn next" onClick={() => setIndex((i) => (i + 1) % images.length)}>›</button>
          <div className="carousel-dots">
            {images.map((_, i) => (
              <button key={i} className={`dot ${i === index ? "active" : ""}`} onClick={() => setIndex(i)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ListingDetail({ id, isSaved, onToggle }: { id: number; isSaved?: boolean; onToggle?: () => void }) {
  const { t } = useTranslation();
  const [listing, setListing] = useState<Listing | null>(null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([fetchListing(id), fetchPriceHistory(id), fetchPhotos(id)])
      .then(([l, h, p]) => {
        setListing(l);
        setHistory(h);
        setPhotos(p);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="state error">Error: {error}</p>;
  if (!listing) return <p className="state">{t("loading")}</p>;

  const prices = history.map((h) => h.price_eur).filter((p): p is number => p !== null);
  const last = prices[prices.length - 1];
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const delta = last !== undefined && maxPrice !== null && maxPrice !== last ? last - maxPrice : null;

  return (
    <div className="detail">
      <button className="back-btn" onClick={() => { window.location.hash = ""; }}>{t("detail_back")}</button>

      <div className="detail-grid">
        <Carousel photos={photos} fallback={listing.image_url} photoAlt={t("photo_alt")} />
        <div className="detail-info">
          <div>
            <h2>{listing.title}</h2>
            {listing.version && <p className="detail-version">{listing.version}</p>}
          </div>
          <div className="card-badges">
            {(() => { const dt = (listing.drivetrain as keyof typeof DRIVETRAIN_LABEL | null) ?? getDrivetrain(listing); return dt ? <span className={`drivetrain-badge dt-${dt.toLowerCase()}`}>{DRIVETRAIN_LABEL[dt] ?? dt}</span> : null; })()}
            {listing.autopilot && <span className={`autopilot-badge ap-${listing.autopilot.toLowerCase()}`}>{listing.autopilot}</span>}
          </div>
          <p className="detail-price">{formatPrice(listing.price_eur)}</p>
          <div className="detail-specs">
            {listing.year && <div className="spec-item"><span className="spec-label">{t("spec_year")}</span><span className="spec-value">{listing.year}</span></div>}
            {listing.mileage_km != null && <div className="spec-item"><span className="spec-label">{t("spec_mileage")}</span><span className="spec-value">{listing.mileage_km <= 100 ? t("spec_new") : formatKm(listing.mileage_km)}</span></div>}
            {listing.fuel && <div className="spec-item"><span className="spec-label">{t("spec_fuel")}</span><span className="spec-value">{listing.fuel}</span></div>}
            {listing.horse_power != null && <div className="spec-item"><span className="spec-label">{t("spec_power")}</span><span className="spec-value">{listing.horse_power} ch</span></div>}
            {listing.color && <div className="spec-item"><span className="spec-label">{t("spec_color")}</span><span className="spec-value">{listing.color}</span></div>}
            {listing.doors != null && <div className="spec-item"><span className="spec-label">{t("spec_doors")}</span><span className="spec-value">{listing.doors}</span></div>}
            {listing.seats != null && <div className="spec-item"><span className="spec-label">{t("spec_seats")}</span><span className="spec-value">{listing.seats}</span></div>}
            {listing.soh != null && <div className="spec-item"><span className="spec-label">{t("spec_soh")}</span><span className="spec-value">{listing.soh}%</span></div>}
            {listing.autopilot && <div className="spec-item"><span className="spec-label">{t("spec_autopilot")}</span><span className="spec-value">{listing.autopilot}</span></div>}
          </div>
          {listing.location && <p className="location">{listing.location}</p>}
          <p className="scraped-at">{t("card_crawled")} {formatDate(listing.scraped_at)}</p>
          <div className="cta-row">
            <a className="btn btn-primary" href={listing.url} target="_blank" rel="noreferrer">{t("detail_view_on")} {listing.source}</a>
            {onToggle && (
              <button className={`btn btn-secondary${isSaved ? " active" : ""}`} onClick={onToggle}>
                {isSaved ? `✕ ${t("detail_remove")}` : `🔖 ${t("detail_save")}`}
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="chart-section">
        <div className="chart-head">
          <h3>{t("price_history")}</h3>
          {delta !== null && (
            <span className={`delta ${delta < 0 ? "down" : "up"}`}>
              {delta > 0 ? "+" : ""}{formatPrice(delta)} {t("price_highest")}
            </span>
          )}
        </div>
        <PriceChart points={history} emptyMessage={t("price_history_empty")} />
      </section>
    </div>
  );
}
