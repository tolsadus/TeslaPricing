import { useEffect, useState } from "react";
import { fetchListing, fetchPhotos, fetchPriceHistory } from "./api";
import type { Listing, PricePoint } from "./types";
import { getDrivetrain, DRIVETRAIN_LABEL, formatColor } from "./utils";
import { useTranslation } from "./i18n";

function formatPrice(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function formatKm(v: number | null, newLabel: string): string {
  if (v === null) return "—";
  if (v <= 100) return newLabel;
  return `${new Intl.NumberFormat("fr-FR").format(v)} km`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

// Minimal sparkline for price history
function Sparkline({ points, color }: { points: PricePoint[]; color: string }) {
  const valid = points.filter((p): p is { price_eur: number; recorded_at: string } => p.price_eur !== null);
  if (valid.length === 0) return <span className="cmp-no-data">—</span>;

  const W = 160;
  const H = 48;
  const PAD = 4;
  const prices = valid.map((p) => p.price_eur);
  const times = valid.map((p) => new Date(p.recorded_at).getTime());
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const pRange = maxP - minP || 1;
  const tRange = maxT - minT || 1;

  const pts = valid.map((p) => {
    const x = PAD + ((new Date(p.recorded_at).getTime() - minT) / tRange) * (W - PAD * 2);
    const y = PAD + (1 - (p.price_eur - minP) / pRange) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  if (pts.length === 1) pts.push(`${(W - PAD).toFixed(1)},${pts[0].split(",")[1]}`);

  return (
    <div className="cmp-sparkline-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {valid.map((_p, i) => {
          const [x, y] = pts[i].split(",").map(Number);
          return <circle key={i} cx={x} cy={y} r="2.5" fill="#fff" stroke={color} strokeWidth="1.5" />;
        })}
      </svg>
      <div className="cmp-sparkline-dates">
        <span>{formatDate(valid[0].recorded_at)}</span>
        {valid.length > 1 && <span>{formatDate(valid[valid.length - 1].recorded_at)}</span>}
      </div>
    </div>
  );
}

function PhotoCell({ photos, fallback, alt }: { photos: string[]; fallback: string | null; alt: string }) {
  const [idx, setIdx] = useState(0);
  const images = photos.length > 0 ? photos : fallback ? [fallback] : [];
  if (images.length === 0) return <div className="cmp-photo-empty" />;

  return (
    <div className="cmp-photo-wrap">
      <img src={images[idx]} alt={alt} referrerPolicy="no-referrer" className="cmp-photo" />
      {images.length > 1 && (
        <div className="cmp-photo-nav">
          <button onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}>‹</button>
          <span>{idx + 1}/{images.length}</span>
          <button onClick={() => setIdx((i) => (i + 1) % images.length)}>›</button>
        </div>
      )}
    </div>
  );
}

const MODEL_COLORS: Record<string, string> = {
  "Model 3": "#171a20",
  "Model Y": "#c0392b",
  "Model S": "#2471a3",
  "Model X": "#1e8449",
};
const FALLBACK_COLORS = ["#8e44ad", "#d35400", "#16a085", "#f39c12"];

type ColData = {
  listing: Listing;
  photos: string[];
  history: PricePoint[];
};

type SpecRow = {
  label: string;
  values: (string | null)[];
};

function buildSpecs(cols: ColData[], t: (k: any) => string, lang: string): SpecRow[] {
  return [
    { label: t("compare_spec_price"),      values: cols.map((c) => formatPrice(c.listing.price_eur)) },
    { label: t("compare_spec_model"),      values: cols.map((c) => [c.listing.make, c.listing.model, c.listing.version].filter(Boolean).join(" ") || null) },
    { label: t("compare_spec_year"),       values: cols.map((c) => c.listing.year != null ? String(c.listing.year) : null) },
    { label: t("compare_spec_mileage"),    values: cols.map((c) => c.listing.mileage_km != null ? formatKm(c.listing.mileage_km, t("spec_new")) : null) },
    { label: t("compare_spec_drivetrain"), values: cols.map((c) => { const dt = (c.listing.drivetrain as any) ?? getDrivetrain(c.listing); return dt ? (DRIVETRAIN_LABEL[dt as keyof typeof DRIVETRAIN_LABEL] ?? dt) : null; }) },
    { label: t("compare_spec_autopilot"),  values: cols.map((c) => c.listing.autopilot ?? null) },
    { label: t("compare_spec_power"),      values: cols.map((c) => c.listing.horse_power != null ? `${c.listing.horse_power} ch` : null) },
    { label: t("compare_spec_color"),      values: cols.map((c) => formatColor(c.listing.color, lang)) },
    { label: t("compare_spec_seats"),      values: cols.map((c) => c.listing.seats != null ? String(c.listing.seats) : null) },
    { label: t("compare_spec_soh"),        values: cols.map((c) => c.listing.soh != null ? `${c.listing.soh}%` : null) },
    { label: t("compare_spec_source"),     values: cols.map((c) => c.listing.source ?? null) },
    { label: t("compare_spec_location"),   values: cols.map((c) => c.listing.location ?? null) },
  ];
}

function isDiff(values: (string | null)[]): boolean {
  const filled = values.filter(Boolean);
  return filled.length > 1 && new Set(filled).size > 1;
}

export default function Compare({ ids, onRemove, onClear }: { ids: number[]; onRemove: (id: number) => void; onClear: () => void }) {
  const { t, lang } = useTranslation();
  const [cols, setCols] = useState<(ColData | null)[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ids.length === 0) { setCols([]); return; }
    setLoading(true);
    Promise.all(
      ids.map((id) =>
        Promise.all([fetchListing(id), fetchPhotos(id), fetchPriceHistory(id)])
          .then(([listing, photos, history]): ColData => ({ listing, photos, history }))
          .catch(() => null)
      )
    ).then(setCols).finally(() => setLoading(false));
  }, [ids.join(",")]);

  const loaded = cols.filter((c): c is ColData => c !== null);

  if (ids.length === 0) {
    return (
      <div className="compare-page">
        <p className="state">{t("compare_empty")}</p>
      </div>
    );
  }

  const specs = loaded.length > 0 ? buildSpecs(loaded, t, lang) : [];
  let fallbackIdx = 0;

  return (
    <div className="compare-page">
      <div className="page-header">
        <div>
          <h2 className="dropped-title">{t("compare_title")}</h2>
        </div>
        <button className="btn btn-secondary" onClick={onClear}>{t("compare_clear")}</button>
      </div>

      {loading && <p className="state">{t("loading")}</p>}

      {!loading && loaded.length > 0 && (
        <div className="cmp-table-wrap">
          <table className="cmp-table">
            <colgroup>
              <col className="cmp-col-label" />
              {loaded.map((_, i) => <col key={i} className="cmp-col-data" />)}
            </colgroup>
            <thead>
              <tr className="cmp-header-row">
                <th />
                {loaded.map((col) => {
                  const color = MODEL_COLORS[col.listing.model ?? ""] ?? FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];
                  return (
                    <th key={col.listing.id} className="cmp-header-cell">
                      <div className="cmp-header-accent" style={{ background: color }} />
                      <PhotoCell photos={col.photos} fallback={col.listing.image_url} alt={col.listing.title ?? t("photo_alt")} />
                      <p className="cmp-header-title">{col.listing.title}</p>
                      <p className="cmp-header-price">{formatPrice(col.listing.price_eur)}</p>
                      <div className="cmp-header-actions">
                        <a className="btn btn-primary btn-sm" href={col.listing.url} target="_blank" rel="noreferrer">{t("compare_open")}</a>
                        <button className="btn btn-secondary btn-sm" onClick={() => onRemove(col.listing.id)}>{t("compare_remove")}</button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {specs.map((row) => {
                const diff = isDiff(row.values);
                return (
                  <tr key={row.label} className={diff ? "cmp-row-diff" : ""}>
                    <td className="cmp-label">{row.label}</td>
                    {row.values.map((val, i) => (
                      <td key={i} className="cmp-value">
                        {val ?? <span className="cmp-no-data">—</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td className="cmp-label">{t("compare_price_history")}</td>
                {loaded.map((col, i) => {
                  const color = MODEL_COLORS[col.listing.model ?? ""] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
                  return (
                    <td key={col.listing.id} className="cmp-value">
                      <Sparkline points={col.history} color={color} />
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
