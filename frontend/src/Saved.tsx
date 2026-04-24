import { useEffect, useState } from "react";
import { fetchListingsByIds } from "./api";
import type { Listing } from "./types";
import { useSaved } from "./useSaved";
import { useAuth } from "./useAuth";
import { getDrivetrain, DRIVETRAIN_LABEL } from "./utils";

function formatPrice(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function formatKm(v: number | null): string {
  if (v === null) return "—";
  return `${new Intl.NumberFormat("fr-FR").format(v)} km`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function Saved() {
  const { user } = useAuth();
  const { saved, toggle } = useSaved(user);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || saved.size === 0) { setListings([]); return; }
    setLoading(true);
    fetchListingsByIds([...saved])
      .then(setListings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [saved, user]);

  if (!user) {
    return (
      <div className="auth-gate">
        <div className="auth-gate-icon">🔖</div>
        <h2 className="auth-gate-title">Sign in to use your watchlist</h2>
        <p className="auth-gate-sub">Save listings and access them from any device. Use the Sign in button at the top right.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-hero">
        <div className="page-header">
          <div>
            <h2 className="dropped-title">Saved listings</h2>
            <p className="dropped-subtitle">{saved.size} car{saved.size !== 1 ? "s" : ""} on your watchlist</p>
          </div>
        </div>
      </div>

      <div className="saved-body">
        {loading && <p className="state">Loading…</p>}
        {error && <p className="state error">Error: {error}</p>}
        {!loading && saved.size === 0 && (
          <p className="state">No saved listings yet. Click the bookmark icon on any car to save it.</p>
        )}

        <ul className="grid">
          {listings.map((listing) => (
            <li key={listing.id} className="card">
              <div className="card-img-wrap">
                {listing.image_url && <img src={listing.image_url} alt={listing.title} referrerPolicy="no-referrer" />}
                <button
                  className={`bookmark-btn active`}
                  onClick={() => toggle(listing.id)}
                  aria-label="Remove from saved"
                  title="Remove from saved"
                >
                  ✕
                </button>
              </div>
              <div className="card-body">
                <h3>{listing.title}</h3>
                <div className="card-badges">
                  {(() => { const dt = (listing.drivetrain as keyof typeof DRIVETRAIN_LABEL | null) ?? getDrivetrain(listing); return dt ? <span className={`drivetrain-badge dt-${dt.toLowerCase()}`}>{DRIVETRAIN_LABEL[dt] ?? dt}</span> : null; })()}
                  {listing.autopilot && <span className={`autopilot-badge ap-${listing.autopilot.toLowerCase()}`}>{listing.autopilot}</span>}
                </div>
                <div className="price-row">
                  <p className="price">{formatPrice(listing.price_eur)}</p>
                  {listing.max_price !== null && listing.price_eur !== null && listing.max_price > listing.price_eur && (
                    <span className="price-delta delta-down"><s>{formatPrice(listing.max_price)}</s></span>
                  )}
                </div>
                <p className="meta">{listing.year ?? "—"} · {formatKm(listing.mileage_km)} · {listing.fuel ?? "—"}</p>
                <p className="location">{listing.location ?? ""}</p>
                <p className="scraped-at">Crawled {formatDate(listing.scraped_at)}</p>
                <div className="cta-row">
                  <a className="btn btn-primary" href={`#/listing/${listing.id}`}>View</a>
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
