declare const __GIT_BRANCH__: string;
declare const __GIT_COMMIT__: string;

import { useEffect, useRef, useState } from "react";
import { fetchListings, fetchStats } from "./api";
import ListingDetail from "./ListingDetail";
import Trends from "./Trends";
import type { Listing, ListingFilters, SortBy, SortDir } from "./types";

const MODELS = ["Model S", "Model 3", "Model X", "Model Y"] as const;

const SORT_OPTIONS: { label: string; sort_by: SortBy; sort_dir: SortDir }[] = [
  { label: "Latest crawl", sort_by: "scraped_at", sort_dir: "desc" },
  { label: "Price ↑", sort_by: "price", sort_dir: "asc" },
  { label: "Price ↓", sort_by: "price", sort_dir: "desc" },
  { label: "Mileage ↑", sort_by: "mileage_km", sort_dir: "asc" },
  { label: "Mileage ↓", sort_by: "mileage_km", sort_dir: "desc" },
  { label: "Year (newest)", sort_by: "year", sort_dir: "desc" },
  { label: "Year (oldest)", sort_by: "year", sort_dir: "asc" },
  { label: "Biggest drop", sort_by: "price_delta", sort_dir: "asc" },
];

const PRICE_MIN = 0;
const PRICE_MAX = 150_000;
const PRICE_STEP = 1_000;
const YEAR_MIN = 2012;
const YEAR_MAX = new Date().getFullYear();

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

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
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

function parsePage(hash: string): "listings" | "trends" | "detail" {
  if (hash.startsWith("#/listing/")) return "detail";
  if (hash === "#/trends") return "trends";
  return "listings";
}

function RangeSlider({
  label,
  min,
  max,
  step,
  valueMin,
  valueMax,
  formatValue,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  formatValue: (v: number, which: "min" | "max") => string;
  onChange: (min: number, max: number) => void;
}) {
  const pctMin = ((valueMin - min) / (max - min)) * 100;
  const pctMax = ((valueMax - min) / (max - min)) * 100;

  return (
    <div className="slider-group">
      <div className="slider-label">
        <span>{label}</span>
        <span className="slider-values">
          {formatValue(valueMin, "min")} – {formatValue(valueMax, "max")}
        </span>
      </div>
      <div className="slider-track-wrap">
        <div className="slider-fill" style={{ left: `${pctMin}%`, width: `${pctMax - pctMin}%` }} />
        <input
          type="range"
          className="slider-input slider-lower"
          min={min} max={max} step={step} value={valueMin}
          onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax - step), valueMax)}
        />
        <input
          type="range"
          className="slider-input slider-upper"
          min={min} max={max} step={step} value={valueMax}
          onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin + step))}
        />
      </div>
    </div>
  );
}

export default function App() {
  const hash = useHashRoute();
  const page = parsePage(hash);
  const detailId = parseListingId(hash);

  const LIMIT = 50;
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [filters, setFilters] = useState<ListingFilters>({
    sort_by: "scraped_at",
    sort_dir: "desc",
    limit: LIMIT,
  });
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, PRICE_MAX]);
  const [yearRange, setYearRange] = useState<[number, number]>([YEAR_MIN, YEAR_MAX]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applySliders(price: [number, number], year: [number, number]) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((f) => ({
        ...f,
        min_price: price[0] > PRICE_MIN ? price[0] : undefined,
        max_price: price[1] < PRICE_MAX ? price[1] : undefined,
        min_year: year[0] > YEAR_MIN ? year[0] : undefined,
        max_year: year[1] < YEAR_MAX ? year[1] : undefined,
      }));
    }, 300);
  }

  useEffect(() => {
    fetchStats().then((s) => setTotalCount(s.total)).catch(() => {});
  }, []);

  useEffect(() => {
    if (page !== "listings") return;
    setLoading(true);
    setError(null);
    setOffset(0);
    fetchListings({ ...filters, offset: 0 })
      .then((data) => { setListings(data); setHasMore(data.length === LIMIT); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters, detailId]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loadingMore) loadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  });

  function loadMore() {
    const nextOffset = offset + LIMIT;
    setLoadingMore(true);
    fetchListings({ ...filters, offset: nextOffset })
      .then((data) => { setListings((prev) => [...prev, ...data]); setOffset(nextOffset); setHasMore(data.length === LIMIT); })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMore(false));
  }

  return (
    <div className="app">
      <div className="topbar">
        <a className="brand" href="#">TeslaPricing</a>
        <nav className="topbar-nav">
          <a className={`nav-link ${page === "listings" || page === "detail" ? "active" : ""}`} href="#">Listings</a>
          <a className={`nav-link ${page === "trends" ? "active" : ""}`} href="#/trends">Trends</a>
        </nav>
        <div className="topbar-meta">
          {page === "detail" ? "Detail" : page === "trends" ? "Trends" : `${totalCount ?? "…"} inventory`}
        </div>
      </div>

      {page === "detail" ? (
        <div className="detail-wrap">
          <ListingDetail id={detailId!} />
        </div>
      ) : page === "trends" ? (
        <Trends />
      ) : (
        <>
          <section className="hero">
            <h1>Aggregated tesla listing</h1>
            <p>Crawls are done once a day in the morning</p>
          </section>

          <div className="content-area">
            {/* ── Left sidebar ── */}
            <aside className="sidebar">
              <div className="sidebar-section">
                <p className="sidebar-heading">Model</p>
                <div className="model-options">
                  <button
                    type="button"
                    className={`model-btn ${!filters.model ? "active" : ""}`}
                    onClick={() => setFilters({ ...filters, model: undefined })}
                  >
                    All
                  </button>
                  {MODELS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`model-btn ${filters.model === m ? "active" : ""}`}
                      onClick={() => setFilters({ ...filters, model: m })}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sidebar-section">
                <p className="sidebar-heading">Sort</p>
                <div className="sort-options">
                  {SORT_OPTIONS.map((o) => {
                    const key = `${o.sort_by}:${o.sort_dir}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`sort-btn ${sortKey(filters) === key ? "active" : ""}`}
                        onClick={() => setFilters({ ...filters, sort_by: o.sort_by, sort_dir: o.sort_dir })}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sidebar-section">
                <p className="sidebar-heading">Filters</p>
                <RangeSlider
                  label="Price"
                  min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP}
                  valueMin={priceRange[0]} valueMax={priceRange[1]}
                  formatValue={(v, which) =>
                    which === "max" && v === PRICE_MAX
                      ? "Any"
                      : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v)
                  }
                  onChange={(lo, hi) => { setPriceRange([lo, hi]); applySliders([lo, hi], yearRange); }}
                />
                <RangeSlider
                  label="Year"
                  min={YEAR_MIN} max={YEAR_MAX} step={1}
                  valueMin={yearRange[0]} valueMax={yearRange[1]}
                  formatValue={(v, which) =>
                    which === "min" && v === YEAR_MIN ? "Any" : String(v)
                  }
                  onChange={(lo, hi) => { setYearRange([lo, hi]); applySliders(priceRange, [lo, hi]); }}
                />
              </div>
            </aside>

            {/* ── Main grid ── */}
            <main className="grid-wrap">
              {loading && <p className="state">Loading…</p>}
              {error && <p className="state error">Error: {error}</p>}
              {!loading && !error && listings.length === 0 && (
                <p className="state">No listings yet. Run the scraper: <code>./scrape.sh leboncoin</code></p>
              )}

              <ul className="grid">
                {listings.map((listing) => (
                  <li key={listing.id} className="card">
                    {listing.image_url && <img src={listing.image_url} alt={listing.title} referrerPolicy="no-referrer" />}
                    <div className="card-body">
                      <h3>{listing.title}</h3>
                      <div className="price-row">
                        <p className="price">{formatPrice(listing.price_eur)}</p>
                        {listing.price_delta !== null && listing.price_delta !== 0 && listing.first_price !== null && (
                          <span className={`price-delta ${listing.price_delta < 0 ? "delta-down" : "delta-up"}`}>
                            <s>{formatPrice(listing.first_price)}</s>
                          </span>
                        )}
                      </div>
                      <p className="meta">
                        {listing.year ?? "—"} · {formatKm(listing.mileage_km)} · {listing.fuel ?? "—"}
                      </p>
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

              <div ref={sentinelRef} className="load-more">
                {loadingMore && <p className="state">Loading…</p>}
              </div>
            </main>
          </div>
        </>
      )}

      <div className="version-badge">
        {__GIT_BRANCH__}@{__GIT_COMMIT__}
      </div>
    </div>
  );
}
