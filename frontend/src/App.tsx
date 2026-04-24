declare const __GIT_BRANCH__: string;
declare const __GIT_COMMIT__: string;

import { useEffect, useRef, useState } from "react";
import { fetchListings, fetchStats, fetchCount } from "./api";
import ListingDetail from "./ListingDetail";
import Trends from "./Trends";
import Dropped from "./Dropped";
import Details from "./Details";
import Saved from "./Saved";
import Compare from "./Compare";
import { useSaved } from "./useSaved";
import { useCompare } from "./useCompare";
import { useAuth } from "./useAuth";
import { useTranslation } from "./i18n";
import type { Listing, ListingFilters } from "./types";
import { getDrivetrain, DRIVETRAIN_LABEL } from "./utils";

const MODELS = ["Model S", "Model 3", "Model X", "Model Y"] as const;
const SOURCES = ["tesla", "leboncoin", "lacentrale", "capcar", "lbauto", "aramisauto", "gmecars", "renew"] as const;



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

function formatKm(v: number | null, newLabel = "New"): string {
  if (v === null) return "—";
  if (v <= 100) return newLabel;
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

function parsePage(hash: string): "listings" | "trends" | "detail" | "dropped" | "details" | "watchlist" | "compare" {
  if (hash.startsWith("#/listing/")) return "detail";
  if (hash === "#/trends") return "trends";
  if (hash === "#/dropped") return "dropped";
  if (hash === "#/details") return "details";
  if (hash === "#/watchlist") return "watchlist";
  if (hash === "#/compare") return "compare";
  return "listings";
}

function RangeInputs({ label, minVal, maxVal, unit, disabled, onChangeMin, onChangeMax }: {
  label: string;
  minVal?: number;
  maxVal?: number;
  unit?: string;
  disabled?: boolean;
  onChangeMin: (v: number | undefined) => void;
  onChangeMax: (v: number | undefined) => void;
}) {
  const [localMin, setLocalMin] = useState(minVal !== undefined ? String(minVal) : "");
  const [localMax, setLocalMax] = useState(maxVal !== undefined ? String(maxVal) : "");

  useEffect(() => { setLocalMin(minVal !== undefined ? String(minVal) : ""); }, [minVal]);
  useEffect(() => { setLocalMax(maxVal !== undefined ? String(maxVal) : ""); }, [maxVal]);

  return (
    <div className="range-inputs-group">
      <span className="range-inputs-label">{label}{unit && <span className="range-inputs-unit">{unit}</span>}</span>
      <div className="range-inputs-row">
        <input type="number" className="range-input" placeholder="Min" disabled={disabled}
          value={localMin} onChange={e => setLocalMin(e.target.value)}
          onBlur={e => onChangeMin(e.target.value !== "" ? Number(e.target.value) : undefined)} />
        <span className="range-inputs-sep">–</span>
        <input type="number" className="range-input" placeholder="Max" disabled={disabled}
          value={localMax} onChange={e => setLocalMax(e.target.value)}
          onBlur={e => onChangeMax(e.target.value !== "" ? Number(e.target.value) : undefined)} />
      </div>
    </div>
  );
}

const sidebarSectionPrefs: Record<string, boolean> = (() => {
  try { return JSON.parse(localStorage.getItem("sidebarSections") ?? "{}"); } catch { return {}; }
})();

function SidebarSection({ label, title, children, defaultOpen = false }: { label: string; title?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(() => sidebarSectionPrefs[label] ?? defaultOpen);

  function toggle() {
    setOpen(o => {
      const next = !o;
      sidebarSectionPrefs[label] = next;
      localStorage.setItem("sidebarSections", JSON.stringify(sidebarSectionPrefs));
      return next;
    });
  }

  return (
    <div className="sidebar-section">
      <button type="button" className="sidebar-heading-btn" onClick={toggle}>
        <span>{title ?? label}</span>
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
  const { t, lang, setLang } = useTranslation();
  const hash = useHashRoute();
  const page = parsePage(hash);
  const detailId = parseListingId(hash);

  const LIMIT = 50;

  const SORT_OPTIONS = [
    { label: t("sort_latest"),      sort_by: "scraped_at" as const, sort_dir: "desc" as const },
    { label: t("sort_price_asc"),   sort_by: "price"      as const, sort_dir: "asc"  as const },
    { label: t("sort_price_desc"),  sort_by: "price"      as const, sort_dir: "desc" as const },
    { label: t("sort_mileage_asc"), sort_by: "mileage_km" as const, sort_dir: "asc"  as const },
    { label: t("sort_mileage_desc"),sort_by: "mileage_km" as const, sort_dir: "desc" as const },
    { label: t("sort_year_newest"), sort_by: "year"       as const, sort_dir: "desc" as const },
    { label: t("sort_year_oldest"), sort_by: "year"       as const, sort_dir: "asc"  as const },
    { label: t("sort_biggest_drop"),sort_by: "price_delta"as const, sort_dir: "asc"  as const },
  ];
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [sectionResetKey, setSectionResetKey] = useState(0);
  const [filters, setFilters] = useState<ListingFilters>(() => {
    try {
      const saved = localStorage.getItem("filters");
      if (saved) return { ...JSON.parse(saved), limit: LIMIT };
    } catch {}
    return { sort_by: "scraped_at", sort_dir: "desc", limit: LIMIT };
  });
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, isAdmin, signOut, signInWithGoogle, signInWithGithub, signInWithTwitter } = useAuth();
  const [showAuthMenu, setShowAuthMenu] = useState(false);
  const { toggle, isSaved, saved } = useSaved(user);
  const { ids: compareIds, toggle: toggleCompare, clear: clearCompare, isComparing } = useCompare();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { limit: _, ...toSave } = filters;
    localStorage.setItem("filters", JSON.stringify(toSave));
  }, [filters]);

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
          <a className={`nav-link ${page === "listings" || page === "detail" ? "active" : ""}`} href="#">{t("nav_listings")}</a>
          <a className={`nav-link ${page === "dropped" ? "active" : ""}`} href="#/dropped">{t("nav_deals")}</a>
          <a className={`nav-link ${page === "trends" ? "active" : ""}`} href="#/trends">{t("nav_trends")}</a>
          <a className={`nav-link ${page === "watchlist" ? "active" : ""}`} href="#/watchlist">{t("nav_watchlist")} {saved.size > 0 && <span className="nav-count">{saved.size}</span>}</a>
          <a className={`nav-link ${page === "compare" ? "active" : ""}`} href="#/compare">{t("nav_compare")} {compareIds.length > 0 && <span className="nav-count">{compareIds.length}</span>}</a>
          {isAdmin && <a className={`nav-link ${page === "details" ? "active" : ""}`} href="#/details">{t("nav_details")}</a>}
        </nav>
        <div className="topbar-meta">
          {page === "detail" ? t("nav_listings") : page === "trends" ? t("nav_trends") : `${totalCount ?? "…"} ${t("nav_inventory")}`}
        </div>
        <div className="topbar-auth">
          <div className="lang-toggle">
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")} title="English">🇬🇧</button>
            <button className={lang === "fr" ? "active" : ""} onClick={() => setLang("fr")} title="Français">🇫🇷</button>
          </div>
          {user ? (
            <>
              {user.user_metadata?.avatar_url && <img className="auth-avatar" src={user.user_metadata.avatar_url} alt={user.user_metadata.full_name ?? "User"} referrerPolicy="no-referrer" />}
              <button className="btn btn-secondary" onClick={signOut}>{t("sign_out")}</button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowAuthMenu(true)}>{t("sign_in")}</button>
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
      ) : page === "details" && isAdmin ? (
        <Details />
      ) : page === "compare" ? (
        <Compare ids={compareIds} onRemove={toggleCompare} onClear={clearCompare} />
      ) : (
        <>
          <div className="page-hero">
            <div className="page-header">
              <div>
                <h2 className="dropped-title">{t("nav_listings")}</h2>
                <p className="dropped-subtitle">
                  {filters.model
                    ? <>{filteredCount ?? "…"} {filters.model} {t("listings_in_stock")}</>
                    : <>{t("listings_subtitle")}</>
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
                    Object.keys(sidebarSectionPrefs).forEach(k => { sidebarSectionPrefs[k] = false; });
                    sidebarSectionPrefs["Model"] = true;
                    localStorage.setItem("sidebarSections", JSON.stringify(sidebarSectionPrefs));
                    setSectionResetKey(k => k + 1);
                  }}
                >
                  {t("reset_filters")}
                </button>
              </div>

              <SidebarSection key={`Model-${sectionResetKey}`} label="Model" title={t("filter_model")} defaultOpen>
                <div className="model-options">
                  <button
                    type="button"
                    className={`model-btn ${!filters.model ? "active" : ""}`}
                    onClick={() => setFilters({ ...filters, model: undefined })}
                  >
                    {t("filter_all")}
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

              <SidebarSection key={`Source-${sectionResetKey}`} label="Source" title={t("filter_source")}>
                <div className="model-options">
                  <button
                    type="button"
                    className={`model-btn ${!filters.source ? "active" : ""}`}
                    onClick={() => setFilters({ ...filters, source: undefined })}
                  >
                    {t("filter_all")}
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

              <SidebarSection key={`Sort-${sectionResetKey}`} label="Sort" title={t("filter_sort")}>
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

              <SidebarSection key={`Drivetrain-${sectionResetKey}`} label="Drivetrain" title={t("filter_drivetrain")}>
                <div className="model-options">
                  {DRIVETRAINS.map((d) => (
                    <button key={d} type="button"
                      className={`model-btn ${filters.drivetrain === d ? "active" : ""}`}
                      onClick={() => setFilters((f) => ({ ...f, drivetrain: f.drivetrain === d ? undefined : d }))}
                    >{d}</button>
                  ))}
                </div>
              </SidebarSection>

              <SidebarSection key={`Autopilot-${sectionResetKey}`} label="Autopilot" title={t("filter_autopilot")}>
                <div className="model-options">
                  {AUTOPILOTS.map((a) => (
                    <button key={a} type="button"
                      className={`model-btn ${filters.autopilot === a ? "active" : ""}`}
                      onClick={() => setFilters((f) => ({ ...f, autopilot: f.autopilot === a ? undefined : a }))}
                    >{a}</button>
                  ))}
                </div>
              </SidebarSection>

              <SidebarSection key={`Seats-${sectionResetKey}`} label="Seats" title={t("filter_seats")}>
                <div className="model-options">
                  {SEATS_OPTIONS.map((s) => (
                    <button key={s} type="button"
                      className={`model-btn ${filters.seats === s ? "active" : ""}`}
                      onClick={() => setFilters((f) => ({ ...f, seats: f.seats === s ? undefined : s }))}
                    >{s}</button>
                  ))}
                </div>
              </SidebarSection>

              <SidebarSection key={`Color-${sectionResetKey}`} label="Color" title={t("filter_color")}>
                <div className="model-options">
                  {COLOR_FAMILIES.map((c) => (
                    <button key={c} type="button"
                      className={`model-btn ${filters.color_family === c ? "active" : ""}`}
                      onClick={() => setFilters((f) => ({ ...f, color_family: f.color_family === c ? undefined : c }))}
                    >{c}</button>
                  ))}
                </div>
              </SidebarSection>

              <SidebarSection key={`Filters-${sectionResetKey}`} label="Filters" title={t("filter_filters")}>
                <RangeInputs label={t("filter_price")} unit="€"
                  minVal={filters.min_price} maxVal={filters.max_price}
                  onChangeMin={v => setFilters(f => ({ ...f, min_price: v }))}
                  onChangeMax={v => setFilters(f => ({ ...f, max_price: v }))}
                />
                <RangeInputs label={t("filter_year")}
                  minVal={filters.min_year} maxVal={filters.max_year}
                  onChangeMin={v => setFilters(f => ({ ...f, min_year: v }))}
                  onChangeMax={v => setFilters(f => ({ ...f, max_year: v }))}
                />
                <RangeInputs label={t("filter_mileage")} unit="km"
                  minVal={filters.min_mileage} maxVal={filters.max_mileage}
                  disabled={filters.new_only}
                  onChangeMin={v => setFilters(f => ({ ...f, min_mileage: v }))}
                  onChangeMax={v => setFilters(f => ({ ...f, max_mileage: v }))}
                />
                <button
                  type="button"
                  className={`new-only-btn ${filters.new_only ? "active" : ""}`}
                  onClick={() => setFilters(f => ({ ...f, new_only: !f.new_only, min_mileage: undefined, max_mileage: undefined }))}
                >
                  <span className="new-only-track"><span className="new-only-thumb" /></span>
                  {t("filter_new")}
                </button>
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
                    <button className="active-tag-chip" onClick={() => setFilters((f) => ({ ...f, seats: undefined }))}>{filters.seats} {t("chip_seats")} ✕</button>
                  )}
                  {filters.color_family && (
                    <button className="active-tag-chip" onClick={() => setFilters((f) => ({ ...f, color_family: undefined }))}>{filters.color_family} ✕</button>
                  )}
                </div>
              )}
              {loading && <p className="state">{t("loading")}</p>}
              {error && <p className="state error">Error: {error}</p>}
              {!loading && !error && listings.length === 0 && (
                <p className="state">{t("no_listings")}</p>
              )}

              <ul className="grid">
                {listings.map((listing) => (
                  <li key={listing.id} className="card">
                    <div className="card-img-wrap">
                      {listing.image_url && <img src={listing.image_url} alt={listing.title} referrerPolicy="no-referrer" />}
                      <button className={`bookmark-btn${isSaved(listing.id) ? " active" : ""}`} onClick={() => { if (!user) { setShowAuthMenu(true); return; } toggle(listing.id); }} aria-label={t("save_listing")}>🔖</button>
                      <button className={`compare-btn${isComparing(listing.id) ? " active" : ""}${compareIds.length >= 3 && !isComparing(listing.id) ? " disabled" : ""}`} onClick={() => { if (compareIds.length < 3 || isComparing(listing.id)) toggleCompare(listing.id); }} aria-label={t("compare_add")} title={t("compare_add")}>⊕</button>
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
                        {listing.year ?? "—"} · {formatKm(listing.mileage_km, t("card_new"))} · {listing.fuel ?? "—"}
                      </p>
                      <p className="location">{listing.location ?? ""}</p>
                      <p className="scraped-at">{t("card_crawled")} {formatDate(listing.scraped_at)}</p>
                      <div className="cta-row">
                        <a className="btn btn-primary" href={`#/listing/${listing.id}`}>{t("card_view")}</a>
                        <span className="btn btn-secondary">{listing.source}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div ref={sentinelRef} className="load-more">
                {loadingMore && <p className="state">{t("loading")}</p>}
              </div>
            </main>
          </div>
        </>
      )}

      {compareIds.length > 0 && page !== "compare" && (
        <div className="compare-bar">
          <span className="compare-bar-label">{t("compare_view_btn", { n: compareIds.length })}</span>
          <a className="btn btn-primary btn-sm" href="#/compare">{t("nav_compare")}</a>
          <button className="btn btn-secondary btn-sm" onClick={clearCompare}>{t("compare_clear")}</button>
        </div>
      )}

      {showAuthMenu && (
        <div className="auth-modal-overlay" onClick={() => setShowAuthMenu(false)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <button className="auth-modal-close" onClick={() => setShowAuthMenu(false)} aria-label={t("auth_close")}>✕</button>
            <h2 className="auth-modal-title">{t("auth_title")}</h2>
            <p className="auth-modal-sub">{t("auth_subtitle")}</p>
            <div className="auth-modal-providers">
              <button className="auth-provider-btn" onClick={() => { setShowAuthMenu(false); signInWithGoogle(); }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                {t("auth_google")}
              </button>
              <button className="auth-provider-btn" onClick={() => { setShowAuthMenu(false); signInWithGithub(); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                </svg>
                {t("auth_github")}
              </button>
              <button className="auth-provider-btn" onClick={() => { setShowAuthMenu(false); signInWithTwitter(); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                {t("auth_x")}
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
        title={t("report_issue")}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.92 6.085c.081-.16.19-.299.34-.398.145-.097.371-.187.74-.187.28 0 .553.087.738.225A.613.613 0 0 1 9 6.25c0 .177-.04.264-.077.318a.956.956 0 0 1-.277.245c-.076.051-.158.1-.258.161l-.007.004a7.728 7.728 0 0 0-.313.208 2.88 2.88 0 0 0-.37.358.75.75 0 0 0 1.063 1.06 1.39 1.39 0 0 1 .167-.165 6.28 6.28 0 0 1 .235-.155l.003-.002c.098-.06.201-.124.308-.197.222-.15.468-.349.667-.620.2-.275.315-.622.315-1.015 0-.658-.316-1.167-.755-1.478C9.878 4.6 9.32 4.5 8.75 4.5c-.63 0-1.156.16-1.572.438-.413.276-.68.646-.828.977a.75.75 0 0 0 1.37.615Z"/></svg>
        {t("report_issue")}
      </a>

      <ScrollToTop />
      <div className="version-badge">
        {totalCount != null && <><span>{totalCount} {t("nav_inventory")}</span><span className="version-badge-sep">·</span></>}
        {__GIT_BRANCH__}@{__GIT_COMMIT__}
      </div>
    </div>
  );
}
