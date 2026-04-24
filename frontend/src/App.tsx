declare const __GIT_BRANCH__: string;
declare const __GIT_COMMIT__: string;

import { useEffect, useRef, useState } from "react";
import { fetchListings, fetchStats, fetchCount } from "./api";
import ListingDetail from "./ListingDetail";
import Trends from "./Trends";
import Dropped from "./Dropped";
import Details from "./Details";
import Saved from "./Saved";
import { useSaved } from "./useSaved";
import { useAuth } from "./useAuth";
import type { Listing, ListingFilters, SortBy, SortDir } from "./types";
import { getDrivetrain, DRIVETRAIN_LABEL } from "./utils";

const MODELS = ["Model S", "Model 3", "Model X", "Model Y"] as const;
const SOURCES = ["tesla", "leboncoin", "lacentrale", "capcar", "lbauto", "aramisauto", "gmecars", "renew"] as const;

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
const MILEAGE_MIN = 0;
const MILEAGE_MAX = 200_000;
const MILEAGE_STEP = 5_000;

const DRIVETRAINS = ["RWD", "AWD", "Performance", "Plaid"] as const;
const AUTOPILOTS = ["EAP", "FSD"] as const;
const SEATS_OPTIONS = [5, 6, 7] as const;
const COLOR_FAMILIES = ["Noir", "Blanc", "Gris", "Bleu", "Rouge"] as const;

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

function parsePage(hash: string): "listings" | "trends" | "detail" | "dropped" | "details" | "watchlist" {
  if (hash.startsWith("#/listing/")) return "detail";
  if (hash === "#/trends") return "trends";
  if (hash === "#/dropped") return "dropped";
  if (hash === "#/details") return "details";
  if (hash === "#/watchlist") return "watchlist";
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

function SidebarSection({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button type="button" className="sidebar-heading-btn" onClick={() => setOpen(o => !o)}>
        <span>{label}</span>
        <span className={`sidebar-arrow ${open ? "open" : ""}`}>▾</span>
      </button>
      <div className={`sidebar-body-wrap ${open ? "open" : ""}`}>
        <div className="sidebar-body">{children}</div>
      </div>
    </div>
  );
}

function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <button className="scroll-top-btn" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
      ↑
    </button>
  );
}

export default function App() {
  const hash = useHashRoute();
  const page = parsePage(hash);
  const detailId = parseListingId(hash);

  const LIMIT = 50;
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [filters, setFilters] = useState<ListingFilters>(() => {
    try {
      const saved = localStorage.getItem("filters");
      if (saved) return { ...JSON.parse(saved), limit: LIMIT };
    } catch {}
    return { sort_by: "scraped_at", sort_dir: "desc", limit: LIMIT };
  });
  const [priceRange, setPriceRange] = useState<[number, number]>(() => {
    try {
      const saved = localStorage.getItem("priceRange");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [PRICE_MIN, PRICE_MAX];
  });
  const [yearRange, setYearRange] = useState<[number, number]>(() => {
    try {
      const saved = localStorage.getItem("yearRange");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [YEAR_MIN, YEAR_MAX];
  });
  const [mileageRange, setMileageRange] = useState<[number, number]>(() => {
    try {
      const saved = localStorage.getItem("mileageRange");
      if (saved) return JSON.parse(saved);
    } catch {}
    return [MILEAGE_MIN, MILEAGE_MAX];
  });
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, signOut, signInWithGoogle, signInWithGithub } = useAuth();
  const [showAuthMenu, setShowAuthMenu] = useState(false);
  const { toggle, isSaved, saved } = useSaved(user);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function applySliders(price: [number, number], year: [number, number], mileage: [number, number]) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((f) => ({
        ...f,
        min_price: price[0] > PRICE_MIN ? price[0] : undefined,
        max_price: price[1] < PRICE_MAX ? price[1] : undefined,
        min_year: year[0] > YEAR_MIN ? year[0] : undefined,
        max_year: year[1] < YEAR_MAX ? year[1] : undefined,
        min_mileage: mileage[0] > MILEAGE_MIN ? mileage[0] : undefined,
        max_mileage: mileage[1] < MILEAGE_MAX ? mileage[1] : undefined,
      }));
    }, 300);
  }

  useEffect(() => {
    const { limit: _, ...toSave } = filters;
    localStorage.setItem("filters", JSON.stringify(toSave));
  }, [filters]);

  useEffect(() => { localStorage.setItem("priceRange", JSON.stringify(priceRange)); }, [priceRange]);
  useEffect(() => { localStorage.setItem("yearRange", JSON.stringify(yearRange)); }, [yearRange]);
  useEffect(() => { localStorage.setItem("mileageRange", JSON.stringify(mileageRange)); }, [mileageRange]);

  useEffect(() => {
    fetchStats().then((s) => setTotalCount(s.total)).catch(() => {});
  }, []);

  useEffect(() => {
    setFilteredCount(null);
    fetchCount(filters).then(setFilteredCount).catch(() => {});
  }, [filters]);

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
          <a className={`nav-link ${page === "dropped" ? "active" : ""}`} href="#/dropped">Deals</a>
          <a className={`nav-link ${page === "trends" ? "active" : ""}`} href="#/trends">Trends</a>
          <a className={`nav-link ${page === "watchlist" ? "active" : ""}`} href="#/watchlist">Watchlist {saved.size > 0 && <span className="nav-count">{saved.size}</span>}</a>
          <a className={`nav-link ${page === "details" ? "active" : ""}`} href="#/details">Details</a>
        </nav>
        <div className="topbar-meta">
          {page === "detail" ? "Detail" : page === "trends" ? "Trends" : `${totalCount ?? "…"} inventory`}
        </div>
        <div className="topbar-auth">
          {user ? (
            <>
              {user.user_metadata?.avatar_url && <img className="auth-avatar" src={user.user_metadata.avatar_url} alt={user.user_metadata.full_name ?? "User"} referrerPolicy="no-referrer" />}
              <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowAuthMenu(true)}>Sign in</button>
          )}
        </div>
      </div>

      {page === "detail" ? (
        <div className="detail-wrap">
          <ListingDetail id={detailId!} isSaved={isSaved(detailId!)} onToggle={() => { if (!user) { setShowAuthMenu(true); return; } toggle(detailId!); }} />
        </div>
      ) : page === "trends" ? (
        <Trends />
      ) : page === "dropped" ? (
        <Dropped />
      ) : page === "watchlist" ? (
        <Saved saved={saved} toggle={toggle} />
      ) : page === "details" ? (
        <Details />
      ) : (
        <>
          <div className="page-hero">
            <div className="page-header">
              <div>
                <h2 className="dropped-title">Listings</h2>
                <p className="dropped-subtitle">
                  {filters.model
                    ? <>{filteredCount ?? "…"} {filters.model} in stock</>
                    : <>Crawled once a day from all sources</>
                  }
                </p>
              </div>
            </div>
          </div>

          <div className="content-area">
            {/* ── Left sidebar ── */}
            <aside className="sidebar">
              <div className="sidebar-section">
                <button
                  type="button"
                  className="reset-filters-btn"
                  onClick={() => {
                    setFilters({ sort_by: "scraped_at", sort_dir: "desc", limit: LIMIT });
                    setPriceRange([PRICE_MIN, PRICE_MAX]);
                    setYearRange([YEAR_MIN, YEAR_MAX]);
                    setMileageRange([MILEAGE_MIN, MILEAGE_MAX]);
                  }}
                >
                  Reset filters
                </button>
              </div>

              <SidebarSection label="Model" defaultOpen>
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
              </SidebarSection>

              <SidebarSection label="Source">
                <div className="model-options">
                  <button
                    type="button"
                    className={`model-btn ${!filters.source ? "active" : ""}`}
                    onClick={() => setFilters({ ...filters, source: undefined })}
                  >
                    All
                  </button>
                  {SOURCES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`model-btn ${filters.source === s ? "active" : ""}`}
                      onClick={() => setFilters({ ...filters, source: filters.source === s ? undefined : s })}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </SidebarSection>

              <SidebarSection label="Sort">
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
              </SidebarSection>

              <SidebarSection label="Drivetrain">
                <div className="model-options">
                  {DRIVETRAINS.map((d) => (
                    <button key={d} type="button"
                      className={`model-btn ${filters.drivetrain === d ? "active" : ""}`}
                      onClick={() => setFilters((f) => ({ ...f, drivetrain: f.drivetrain === d ? undefined : d }))}
                    >{d}</button>
                  ))}
                </div>
              </SidebarSection>

              <SidebarSection label="Autopilot">
                <div className="model-options">
                  {AUTOPILOTS.map((a) => (
                    <button key={a} type="button"
                      className={`model-btn ${filters.autopilot === a ? "active" : ""}`}
                      onClick={() => setFilters((f) => ({ ...f, autopilot: f.autopilot === a ? undefined : a }))}
                    >{a}</button>
                  ))}
                </div>
              </SidebarSection>

              <SidebarSection label="Seats">
                <div className="model-options">
                  {SEATS_OPTIONS.map((s) => (
                    <button key={s} type="button"
                      className={`model-btn ${filters.seats === s ? "active" : ""}`}
                      onClick={() => setFilters((f) => ({ ...f, seats: f.seats === s ? undefined : s }))}
                    >{s}</button>
                  ))}
                </div>
              </SidebarSection>

              <SidebarSection label="Color">
                <div className="model-options">
                  {COLOR_FAMILIES.map((c) => (
                    <button key={c} type="button"
                      className={`model-btn ${filters.color_family === c ? "active" : ""}`}
                      onClick={() => setFilters((f) => ({ ...f, color_family: f.color_family === c ? undefined : c }))}
                    >{c}</button>
                  ))}
                </div>
              </SidebarSection>

              <SidebarSection label="Filters">
                <RangeSlider
                  label="Price"
                  min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP}
                  valueMin={priceRange[0]} valueMax={priceRange[1]}
                  formatValue={(v, which) =>
                    which === "max" && v === PRICE_MAX
                      ? "Any"
                      : new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v)
                  }
                  onChange={(lo, hi) => { setPriceRange([lo, hi]); applySliders([lo, hi], yearRange, mileageRange); }}
                />
                <RangeSlider
                  label="Year"
                  min={YEAR_MIN} max={YEAR_MAX} step={1}
                  valueMin={yearRange[0]} valueMax={yearRange[1]}
                  formatValue={(v, which) =>
                    which === "min" && v === YEAR_MIN ? "Any" : String(v)
                  }
                  onChange={(lo, hi) => { setYearRange([lo, hi]); applySliders(priceRange, [lo, hi], mileageRange); }}
                />
                <RangeSlider
                  label="Mileage"
                  min={MILEAGE_MIN} max={MILEAGE_MAX} step={MILEAGE_STEP}
                  valueMin={mileageRange[0]} valueMax={mileageRange[1]}
                  formatValue={(v, which) =>
                    which === "max" && v === MILEAGE_MAX
                      ? "Any"
                      : `${new Intl.NumberFormat("fr-FR").format(v)} km`
                  }
                  onChange={(lo, hi) => { setMileageRange([lo, hi]); applySliders(priceRange, yearRange, [lo, hi]); }}
                />
              </SidebarSection>
            </aside>

            {/* ── Main grid ── */}
            <main className="grid-wrap">
              {(filters.drivetrain || filters.autopilot || filters.seats || filters.color_family) && (
                <div className="active-tag-filters">
                  {filters.drivetrain && (
                    <button className="active-tag-chip" onClick={() => setFilters((f) => ({ ...f, drivetrain: undefined }))}>{filters.drivetrain} ✕</button>
                  )}
                  {filters.autopilot && (
                    <button className="active-tag-chip" onClick={() => setFilters((f) => ({ ...f, autopilot: undefined }))}>{filters.autopilot} ✕</button>
                  )}
                  {filters.seats && (
                    <button className="active-tag-chip" onClick={() => setFilters((f) => ({ ...f, seats: undefined }))}>{filters.seats} seats ✕</button>
                  )}
                  {filters.color_family && (
                    <button className="active-tag-chip" onClick={() => setFilters((f) => ({ ...f, color_family: undefined }))}>{filters.color_family} ✕</button>
                  )}
                </div>
              )}
              {loading && <p className="state">Loading…</p>}
              {error && <p className="state error">Error: {error}</p>}
              {!loading && !error && listings.length === 0 && (
                <p className="state">No listings yet. Run the scraper: <code>./scrape.sh leboncoin</code></p>
              )}

              <ul className="grid">
                {listings.map((listing) => (
                  <li key={listing.id} className="card">
                    <div className="card-img-wrap">
                      {listing.image_url && <img src={listing.image_url} alt={listing.title} referrerPolicy="no-referrer" />}
                      <button className={`bookmark-btn${isSaved(listing.id) ? " active" : ""}`} onClick={() => { if (!user) { setShowAuthMenu(true); return; } toggle(listing.id); }} aria-label="Save listing">🔖</button>
                    </div>
                    <div className="card-body">
                      <h3>{listing.title}</h3>
                      <div className="card-badges">
                        {(() => { const dt = (listing.drivetrain as keyof typeof DRIVETRAIN_LABEL | null) ?? getDrivetrain(listing); return dt ? <span className={`drivetrain-badge dt-${dt.toLowerCase()}${filters.drivetrain === dt ? " badge-active" : " badge-clickable"}`} onClick={() => setFilters((f) => ({ ...f, drivetrain: f.drivetrain === dt ? undefined : dt }))}>{DRIVETRAIN_LABEL[dt] ?? dt}</span> : null; })()}
                        {listing.autopilot && <span className={`autopilot-badge ap-${listing.autopilot.toLowerCase()}${filters.autopilot === listing.autopilot ? " badge-active" : " badge-clickable"}`} onClick={() => setFilters((f) => ({ ...f, autopilot: f.autopilot === listing.autopilot ? undefined : listing.autopilot! }))}>{listing.autopilot}</span>}
                      </div>
                      <div className="price-row">
                        <p className="price">{formatPrice(listing.price_eur)}</p>
                        {listing.max_price !== null && listing.price_eur !== null && listing.max_price > listing.price_eur && (
                          <span className="price-delta delta-down"><s>{formatPrice(listing.max_price)}</s></span>
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

      {showAuthMenu && (
        <div className="auth-modal-overlay" onClick={() => setShowAuthMenu(false)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <button className="auth-modal-close" onClick={() => setShowAuthMenu(false)} aria-label="Close">✕</button>
            <h2 className="auth-modal-title">Sign in to TeslaPricing</h2>
            <p className="auth-modal-sub">Save listings and sync your watchlist across devices.</p>
            <div className="auth-modal-providers">
              <button className="auth-provider-btn" onClick={() => { setShowAuthMenu(false); signInWithGoogle(); }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
              <button className="auth-provider-btn" onClick={() => { setShowAuthMenu(false); signInWithGithub(); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                </svg>
                Continue with GitHub
              </button>
            </div>
          </div>
        </div>
      )}

      <a
        className="issue-btn"
        href="https://github.com/tolsadus/TeslaPricing/issues/new"
        target="_blank"
        rel="noreferrer"
        title="Report an issue"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.92 6.085c.081-.16.19-.299.34-.398.145-.097.371-.187.74-.187.28 0 .553.087.738.225A.613.613 0 0 1 9 6.25c0 .177-.04.264-.077.318a.956.956 0 0 1-.277.245c-.076.051-.158.1-.258.161l-.007.004a7.728 7.728 0 0 0-.313.208 2.88 2.88 0 0 0-.37.358.75.75 0 0 0 1.063 1.06 1.39 1.39 0 0 1 .167-.165 6.28 6.28 0 0 1 .235-.155l.003-.002c.098-.06.201-.124.308-.197.222-.15.468-.349.667-.620.2-.275.315-.622.315-1.015 0-.658-.316-1.167-.755-1.478C9.878 4.6 9.32 4.5 8.75 4.5c-.63 0-1.156.16-1.572.438-.413.276-.68.646-.828.977a.75.75 0 0 0 1.37.615Z"/></svg>
        Report an issue
      </a>

      <ScrollToTop />
      <div className="version-badge">
        {totalCount != null && <><span>{totalCount} cars</span><span className="version-badge-sep">·</span></>}
        {__GIT_BRANCH__}@{__GIT_COMMIT__}
      </div>
    </div>
  );
}
