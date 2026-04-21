import { useEffect, useState } from "react";
import { fetchListings } from "./api";
import ListingDetail from "./ListingDetail";
import type { Listing, ListingFilters, SortBy, SortDir } from "./types";

const MODELS = ["Model S", "Model 3", "Model X", "Model Y"] as const;

const SORT_OPTIONS: { label: string; sort_by: SortBy; sort_dir: SortDir }[] = [
  { label: "Latest crawl", sort_by: "scraped_at", sort_dir: "desc" },
  { label: "Mileage ↑", sort_by: "mileage_km", sort_dir: "asc" },
  { label: "Mileage ↓", sort_by: "mileage_km", sort_dir: "desc" },
  { label: "Year (newest)", sort_by: "year", sort_dir: "desc" },
  { label: "Year (oldest)", sort_by: "year", sort_dir: "asc" },
];

function sortKey(f: ListingFilters): string {
  return `${f.sort_by ?? "scraped_at"}:${f.sort_dir ?? "desc"}`;
}

function formatPrice(v: number | null): string {
  if (v === null) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function formatKm(v: number | null): string {
  if (v === null) return "—";
  return `${new Intl.NumberFormat("fr-FR").format(v)} km`;
}

function useHashRoute(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function parseListingId(hash: string): number | null {
  const m = hash.match(/^#\/listing\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

export default function App() {
  const hash = useHashRoute();
  const detailId = parseListingId(hash);

  const [listings, setListings] = useState<Listing[]>([]);
  const [filters, setFilters] = useState<ListingFilters>({
    sort_by: "scraped_at",
    sort_dir: "desc",
    limit: 1000,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (detailId !== null) return;
    setLoading(true);
    setError(null);
    fetchListings(filters)
      .then(setListings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters, detailId]);

  return (
    <div className="app">
      <div className="topbar">
        <a className="brand" href="#">Crawsla</a>
        <div className="topbar-meta">{detailId !== null ? "Detail" : `${listings.length} inventory`}</div>
      </div>

      {detailId !== null ? (
        <div className="grid-wrap">
          <ListingDetail id={detailId} />
        </div>
      ) : (
        <>
          <section className="hero">
            <h1>Aggregated tesla listing</h1>
            <p>Crawls are done once a day in the morning</p>
          </section>

          <div className="model-chips">
            <button
              type="button"
              className={`chip ${!filters.model ? "active" : ""}`}
              onClick={() => setFilters({ ...filters, model: undefined })}
            >
              All
            </button>
            {MODELS.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip ${filters.model === m ? "active" : ""}`}
                onClick={() => setFilters({ ...filters, model: m })}
              >
                {m}
              </button>
            ))}
          </div>

          <section className="filters">
            <select
              value={sortKey(filters)}
              onChange={(e) => {
                const [sort_by, sort_dir] = e.target.value.split(":") as [SortBy, SortDir];
                setFilters({ ...filters, sort_by, sort_dir });
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={`${o.sort_by}:${o.sort_dir}`} value={`${o.sort_by}:${o.sort_dir}`}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Min price"
              value={filters.min_price ?? ""}
              onChange={(e) => setFilters({ ...filters, min_price: e.target.value ? Number(e.target.value) : undefined })}
            />
            <input
              type="number"
              placeholder="Max price"
              value={filters.max_price ?? ""}
              onChange={(e) => setFilters({ ...filters, max_price: e.target.value ? Number(e.target.value) : undefined })}
            />
            <input
              type="number"
              placeholder="Min year"
              value={filters.min_year ?? ""}
              onChange={(e) => setFilters({ ...filters, min_year: e.target.value ? Number(e.target.value) : undefined })}
            />
          </section>

          <div className="grid-wrap">
            {loading && <p className="state">Loading…</p>}
            {error && <p className="state error">Error: {error}</p>}
            {!loading && !error && listings.length === 0 && (
              <p className="state">No listings yet. Run the scraper: <code>./scrape.sh leboncoin</code></p>
            )}

            <ul className="grid">
              {listings.map((listing) => (
                <li key={listing.id} className="card">
                  {listing.image_url && <img src={listing.image_url} alt={listing.title} />}
                  <div className="card-body">
                    <h3>{listing.title}</h3>
                    <p className="price">{formatPrice(listing.price_eur)}</p>
                    <p className="meta">
                      {listing.year ?? "—"} · {formatKm(listing.mileage_km)} · {listing.fuel ?? "—"}
                    </p>
                    <p className="location">{listing.location ?? ""}</p>
                    <div className="cta-row">
                      <a className="btn btn-primary" href={`#/listing/${listing.id}`}>
                        View
                      </a>
                      <span className="btn btn-secondary">{listing.source}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
