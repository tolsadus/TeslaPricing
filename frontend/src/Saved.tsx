import { useEffect, useState } from "react";
import { fetchListingsByIds } from "./api";
import type { Listing } from "./types";
import { useAuth } from "./useAuth";
import { getDrivetrain, DRIVETRAIN_LABEL, formatFuel } from "./utils";
import { useTranslation } from "./i18n";

function formatPrice(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function formatKm(v: number | null, newLabel = "New"): string {
  if (v === null) return "—";
  if (v <= 100) return newLabel;
  return `${new Intl.NumberFormat("fr-FR").format(v)} km`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function Saved({ saved, toggle, isComparing, toggleCompare, compareCount }: { saved: Set<number>; toggle: (id: number) => void; isComparing: (id: number) => boolean; toggleCompare: (id: number) => void; compareCount: number }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (saved.size === 0) { setListings([]); return; }
    setLoading(true);
    fetchListingsByIds([...saved])
      .then(setListings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [saved]);

  // Remove listings from local state immediately when unbookmarked
  useEffect(() => {
    setListings((prev) => prev.filter((l) => saved.has(l.id)));
  }, [saved]);

  return (
    <div>
      <div className="page-hero">
        <div className="page-header">
          <div>
            <h2 className="dropped-title">{t("saved_title")}</h2>
            <p className="dropped-subtitle">{saved.size} {saved.size !== 1 ? t("saved_subtitle_many") : t("saved_subtitle_one")}</p>
          </div>
        </div>
      </div>
      {!user && saved.size > 0 && (
        <div className="saved-sync-banner">
          <span>🔖 {t("saved_auth_subtitle")}</span>
        </div>
      )}
      {!user && saved.size === 0 && (
        <div className="auth-gate">
          <div className="auth-gate-icon">🔖</div>
          <h2 className="auth-gate-title">{t("saved_auth_title")}</h2>
          <p className="auth-gate-sub">{t("saved_auth_subtitle")}</p>
        </div>
      )}

      <div className="saved-body">
        {loading && <span className="spinner" />}
        {error && <p className="state error">Error: {error}</p>}
        {!loading && saved.size === 0 && (
          <p className="state">{t("saved_empty")}</p>
        )}

        <ul className="grid">
          {listings.map((listing) => (
            <li key={listing.id} className="card">
              <div className="card-img-wrap">
                {listing.image_url && <img src={listing.image_url} alt={listing.title} referrerPolicy="no-referrer" />}
                <button className="bookmark-btn active" onClick={() => toggle(listing.id)} aria-label={t("saved_remove")} title={t("saved_remove")}>✕</button>
                <button className={`compare-btn${isComparing(listing.id) ? " active" : ""}${compareCount >= 3 && !isComparing(listing.id) ? " disabled" : ""}`} onClick={() => { if (compareCount < 3 || isComparing(listing.id)) toggleCompare(listing.id); }} aria-label={t("compare_add")} title={t("compare_add")}>⊕</button>
                {listing.price_delta !== null && listing.price_delta > 0 && listing.max_price !== null && (
                  <div className="card-drop-badge">
                    −{formatPrice(listing.price_delta)}
                    <span className="card-drop-pct">−{Math.round((listing.price_delta / listing.max_price) * 100)}%</span>
                  </div>
                )}
              </div>
              <div className="card-body">
                <h3>{listing.title}</h3>
                <div className="card-badges">
                  {(() => { const dt = (listing.drivetrain as keyof typeof DRIVETRAIN_LABEL | null) ?? getDrivetrain(listing); return dt ? <span className={`drivetrain-badge dt-${dt.toLowerCase()}`}>{DRIVETRAIN_LABEL[dt] ?? dt}</span> : null; })()}
                  {listing.autopilot && <span className={`autopilot-badge ap-${listing.autopilot.toLowerCase()}`}>{listing.autopilot}</span>}
                </div>
                <div className="price-row">
                  <p className="price">{formatPrice(listing.price_eur)}</p>
                  {listing.price_delta !== null && listing.price_delta > 0 && listing.max_price !== null && (
                    <span className="price-delta delta-down"><s>{formatPrice(listing.max_price)}</s></span>
                  )}
                </div>
                <p className="meta">{listing.year ?? "—"} · {formatKm(listing.mileage_km, t("card_new"))} · {formatFuel(listing.fuel, t)}</p>
                <p className="location">{listing.location ?? ""}</p>
                <p className="scraped-at">{t("card_crawled")} {formatDate(listing.scraped_at)}</p>
                <div className="cta-row">
                  <a className="btn btn-primary" href={`#/listing/${listing.id}`}>{t("saved_view")}</a>
                  <span className="btn btn-secondary">{listing.source}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
