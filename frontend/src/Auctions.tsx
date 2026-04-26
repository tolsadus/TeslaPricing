import { useEffect, useState } from "react";
import { fetchAuctions } from "./api";
import { useTranslation } from "./i18n";
import type { Listing } from "./types";
import { DRIVETRAIN_LABEL } from "./utils";

function formatPrice(v: number | null, fallback: string): string {
  if (v === null) return fallback;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function formatKm(v: number | null): string {
  if (v === null) return "—";
  return `${new Intl.NumberFormat("fr-FR").format(v)} km`;
}

function formatAuctionDate(dateStr: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(dateStr + "T00:00:00"));
}

export default function Auctions() {
  const { t } = useTranslation();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuctions()
      .then(setListings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Group listings by auction_date
  const grouped = listings.reduce<Record<string, Listing[]>>((acc, l) => {
    const key = l.auction_date ?? "unknown";
    (acc[key] ??= []).push(l);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="auctions-page">
      <div className="page-hero">
        <div className="page-header">
          <div>
            <h2 className="dropped-title">{t("auctions_title")}</h2>
            <p className="dropped-subtitle">{t("auctions_subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="auctions-content">
        {loading && <span className="spinner" />}
        {error && <p className="state error">Error: {error}</p>}
        {!loading && !error && listings.length === 0 && (
          <p className="state">{t("auctions_empty")}</p>
        )}

        {sortedDates.map((date) => (
          <div key={date} className="auction-group">
            <h3 className="auction-date-header">
              <span className="auction-date-icon">🗓</span>
              {formatAuctionDate(date)}
            </h3>
            <ul className="auction-list">
              {grouped[date].map((listing) => {
                const dt = listing.drivetrain as keyof typeof DRIVETRAIN_LABEL | null;
                return (
                  <li key={listing.id} className="auction-card">
                    {listing.image_url && (
                      <div className="auction-card-img">
                        <img src={listing.image_url} alt={listing.title} referrerPolicy="no-referrer" />
                      </div>
                    )}
                    <div className="auction-card-body">
                      <div className="auction-card-top">
                        <span className="auction-lot">{t("auctions_lot")} n°{listing.lot_number}</span>
                        {dt && <span className={`drivetrain-badge dt-${dt.toLowerCase()}`}>{DRIVETRAIN_LABEL[dt] ?? dt}</span>}
                        {listing.soh != null && <span className="auction-soh">{t("auctions_soh")} {listing.soh}%</span>}
                      </div>
                      <h4 className="auction-card-title">{listing.title}</h4>
                      <p className="auction-card-meta">
                        {listing.year ?? "—"} · {formatKm(listing.mileage_km)} · {listing.location ?? "—"}
                      </p>
                    </div>
                    <div className="auction-card-price">
                      <p className="auction-price">
                        {formatPrice(listing.price_eur, t("auctions_tba"))}
                      </p>
                      <a className="btn btn-primary btn-sm" href={listing.url} target="_blank" rel="noreferrer">
                        {t("auctions_view")}
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
