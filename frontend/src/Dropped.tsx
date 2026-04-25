import { useEffect, useState } from "react";
import { fetchRecentDrops } from "./api";
import type { DroppedListing } from "./types";
import { getDrivetrain, DRIVETRAIN_LABEL } from "./utils";
import { useTranslation } from "./i18n";

type Props = {
  isSaved: (id: number) => boolean;
  toggle: (id: number) => void;
  isComparing: (id: number) => boolean;
  toggleCompare: (id: number) => void;
  compareCount: number;
};

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

export default function Dropped({ isSaved, toggle, isComparing, toggleCompare, compareCount }: Props) {
  const { t } = useTranslation();
  const [drops, setDrops] = useState<DroppedListing[]>([]);
  const [hours, setHours] = useState(48);
  const [loading, setLoading] = useState(true);

  const WINDOWS = [
    { label: t("dropped_24h"), hours: 24 },
    { label: t("dropped_48h"), hours: 48 },
    { label: t("dropped_7d"), hours: 168 },
  ];

  useEffect(() => {
    setLoading(true);
    fetchRecentDrops(hours)
      .then(setDrops)
      .finally(() => setLoading(false));
  }, [hours]);

  return (
    <div className="dropped-page">
      <div className="dropped-header">
        <div>
          <h2 className="dropped-title">{t("dropped_title")}</h2>
          <p className="dropped-subtitle">{t("dropped_subtitle")}</p>
        </div>
        <div className="dropped-window-tabs">
          {WINDOWS.map((w) => (
            <button
              key={w.hours}
              className={`window-tab ${hours === w.hours ? "active" : ""}`}
              onClick={() => setHours(w.hours)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <span className="spinner" />}
      {!loading && drops.length === 0 && (
        <p className="state">{t("dropped_empty", { hours })}</p>
      )}

      {!loading && drops.length > 0 && (() => {
        const top = drops.slice(0, 3);
        const rest = drops.slice(3);
        const MEDALS = ["🥇", "🥈", "🥉"];

        const renderCard = (d: DroppedListing, rank?: number) => {
          const dt = (d.drivetrain as keyof typeof DRIVETRAIN_LABEL | null) ?? getDrivetrain({ title: d.title, version: d.version } as any);
          return (
            <li key={`${d.id}-${d.dropped_at}`} className={`dropped-card${rank === 0 ? " dropped-card--gold" : ""}`}>
              <div className="dropped-img-wrap">
                {d.image_url
                  ? <img src={d.image_url} alt={d.title} referrerPolicy="no-referrer" />
                  : <div className="dropped-img-placeholder" />
                }
                <button className={`bookmark-btn${isSaved(d.id) ? " active" : ""}`} onClick={() => toggle(d.id)} aria-label="Save">🔖</button>
                <button className={`compare-btn${isComparing(d.id) ? " active" : ""}${compareCount >= 3 && !isComparing(d.id) ? " disabled" : ""}`} onClick={() => { if (compareCount < 3 || isComparing(d.id)) toggleCompare(d.id); }} aria-label="Compare">⊕</button>
                <div className="dropped-drop-badge">
                  −{formatPrice(d.drop_amount)}
                  <span className="dropped-pct">−{d.drop_pct}%</span>
                </div>
                {rank !== undefined && <span className="dropped-medal">{MEDALS[rank]}</span>}
              </div>
              <div className="dropped-body">
                <h3 className="dropped-name">{d.title}</h3>
                {dt && <span className={`drivetrain-badge dt-${dt.toLowerCase()}`}>{DRIVETRAIN_LABEL[dt] ?? dt}</span>}
                <div className="dropped-prices">
                  <span className="dropped-new-price">{formatPrice(d.price_eur)}</span>
                  <span className="dropped-old-price"><s>{formatPrice(d.old_price)}</s></span>
                </div>
                <p className="meta">{d.year ?? "—"} · {formatKm(d.mileage_km)} · {d.fuel ?? "—"}</p>
                <p className="location">{d.location ?? ""}</p>
                <p className="scraped-at">{t("dropped_label")} {formatDate(d.dropped_at)}</p>
                <div className="cta-row">
                  <a className="btn btn-primary" href={`#/listing/${d.id}`}>{t("dropped_view")}</a>
                  <span className="btn btn-secondary">{d.source}</span>
                </div>
              </div>
            </li>
          );
        };

        return (
          <>
            <p className="dropped-section-label">{t("dropped_top")}</p>
            <ul className="dropped-podium">
              {top.map((d, i) => renderCard(d, i))}
            </ul>
            {rest.length > 0 && (
              <>
                <p className="dropped-section-label">{t("dropped_others")}</p>
                <ul className="dropped-grid">
                  {rest.map((d) => renderCard(d))}
                </ul>
              </>
            )}
          </>
        );
      })()}
    </div>
  );
}
