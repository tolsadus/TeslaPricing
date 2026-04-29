import { useEffect, useRef, useState } from "react";
import { searchListings, fetchModelCounts } from "./api";
import type { Listing, ListingFilters } from "./types";
import { useTranslation } from "./i18n";

const MODELS = ["Model S", "Model 3", "Model X", "Model Y"] as const;

const MODEL_SHORTCUTS: Record<string, string> = {
  m3: "Model 3", my: "Model Y", ms: "Model S", mx: "Model X",
};

const DRIVETRAIN_PATTERNS: { rx: RegExp; value: "RWD" | "AWD" | "Performance" | "Plaid"; label: string }[] = [
  { rx: /\b(plaid)\b/i, value: "Plaid", label: "Plaid" },
  { rx: /\b(performance|perf)\b/i, value: "Performance", label: "Performance trim" },
  { rx: /\b(awd|long\s*range|lr|grande\s*autonomie)\b/i, value: "AWD", label: "Long Range trim" },
  { rx: /\b(rwd|propulsion)\b/i, value: "RWD", label: "RWD" },
];

const AUTOPILOT_PATTERNS: { rx: RegExp; value: "EAP" | "FSD"; label: string }[] = [
  { rx: /\b(fsd|full\s*self[\s-]*driving)\b/i, value: "FSD", label: "FSD" },
  { rx: /\b(eap|enhanced\s*autopilot)\b/i, value: "EAP", label: "EAP" },
];

function parseQuery(q: string): { filters: Partial<ListingFilters>; chips: string[] } {
  const filters: Partial<ListingFilters> = {};
  const chips: string[] = [];
  const lower = q.toLowerCase();

  for (const [alias, model] of Object.entries(MODEL_SHORTCUTS)) {
    if (new RegExp(`(?:^|\\s)${alias}(?:\\s|$)`).test(lower)) {
      filters.model = model;
      break;
    }
  }
  if (!filters.model) {
    for (const m of MODELS) {
      if (lower.includes(m.toLowerCase())) { filters.model = m; break; }
    }
  }
  if (!filters.model) {
    const m = lower.match(/(?:^|\s)(?:tesla\s+)?([3sxy])(?:\s|$)/);
    if (m) {
      const map: Record<string, string> = { "3": "Model 3", y: "Model Y", s: "Model S", x: "Model X" };
      filters.model = map[m[1]];
    }
  }
  if (filters.model) chips.push("1 make");

  for (const p of DRIVETRAIN_PATTERNS) {
    if (p.rx.test(lower)) { filters.drivetrain = p.value; chips.push(p.label); break; }
  }
  for (const p of AUTOPILOT_PATTERNS) {
    if (p.rx.test(lower)) { filters.autopilot = p.value; chips.push(p.label); break; }
  }

  return { filters, chips };
}

function tokensMatchModel(query: string, model: string): boolean {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const hay = `tesla ${model}`.toLowerCase();
  const shortcuts: Record<string, string> = { m3: "model 3", my: "model y", ms: "model s", mx: "model x" };
  return tokens.every((t) => hay.includes(t) || hay.includes(shortcuts[t] ?? ""));
}

function TeslaT() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M12 5.5c2.6 0 5 .55 7.2 1.55l-1.95 2.4c-1.5-.6-3.3-.95-5.25-.95s-3.75.35-5.25.95L4.8 7.05C7 6.05 9.4 5.5 12 5.5Zm0 4.2c1.4 0 2.7.2 3.85.55L15 11.5h-2v6.95h-2V11.5H9l-.85-1.25c1.15-.35 2.45-.55 3.85-.55Z"/>
    </svg>
  );
}

type Props = {
  onApplyFilters: (patch: Partial<ListingFilters>) => void;
};

export default function SearchBar({ onApplyFilters }: Props) {
  const { t, lang } = useTranslation();
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelCounts, setModelCounts] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    fetchModelCounts(MODELS).then(setModelCounts).catch(() => {});
  }, []);

  useEffect(() => {
    const text = q.trim();
    if (!text) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const id = ++reqId.current;
    const handle = setTimeout(() => {
      searchListings(text, 8)
        .then((data) => { if (id === reqId.current) setResults(data); })
        .catch(() => { if (id === reqId.current) setResults([]); })
        .finally(() => { if (id === reqId.current) setLoading(false); });
    }, 150);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const text = q.trim();
  const matchedModels = text ? MODELS.filter((m) => tokensMatchModel(text, m)) : [];
  const parsed = text ? parseQuery(text) : { filters: {}, chips: [] };
  const hasExtraChips = parsed.chips.some((c) => c !== "1 make");

  function applyFilters(patch: Partial<ListingFilters>) {
    onApplyFilters(patch);
    setQ("");
    setOpen(false);
    if (window.location.hash && window.location.hash !== "#") window.location.hash = "";
  }

  function gotoListing(id: number) {
    setQ("");
    setOpen(false);
    window.location.hash = `#/listing/${id}`;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
    if (e.key === "Enter") {
      if (results.length > 0) gotoListing(results[0].id);
      else if (matchedModels.length === 1) applyFilters({ model: matchedModels[0] });
      else if (parsed.filters.model || parsed.filters.drivetrain || parsed.filters.autopilot) applyFilters(parsed.filters);
    }
  }

  function fmtPrice(v: number | null) {
    if (v === null) return "—";
    return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  }
  function fmtKm(v: number | null) {
    if (v === null) return "—";
    if (v <= 100) return t("card_new");
    return `${new Intl.NumberFormat(locale).format(v)} km`;
  }

  const showDropdown = open && text.length > 0;
  const nothing = !loading && matchedModels.length === 0 && !hasExtraChips && results.length === 0;

  return (
    <div className="search-bar" ref={containerRef}>
      <div className="search-input-wrap">
        <svg className="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          className="search-input"
          type="text"
          placeholder={t("search_placeholder")}
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        {q && (
          <button className="search-clear" onClick={() => { setQ(""); setResults([]); }} aria-label="Clear">✕</button>
        )}
      </div>

      {showDropdown && (
        <div className="search-dropdown">
          {matchedModels.length > 0 && (
            <div className="search-section">
              <div className="search-section-label">{t("search_models")}</div>
              {matchedModels.map((m) => (
                <button key={m} type="button" className="search-row" onClick={() => applyFilters({ model: m })}>
                  <div className="search-row-icon search-row-icon-logo"><TeslaT /></div>
                  <div className="search-row-text">
                    <div className="search-row-title">Tesla {m}</div>
                    <div className="search-row-sub">
                      {modelCounts[m] != null ? `${modelCounts[m].toLocaleString(locale)} ${t("search_for_sale")}` : "…"}
                    </div>
                  </div>
                  <span className="search-row-chev">›</span>
                </button>
              ))}
            </div>
          )}

          {hasExtraChips && (
            <div className="search-section">
              <div className="search-section-label">{t("search_suggested")}</div>
              <button type="button" className="search-row" onClick={() => applyFilters(parsed.filters)}>
                <div className="search-row-icon">🌐</div>
                <div className="search-row-text">
                  <div className="search-row-title">{text}</div>
                  <div className="search-row-chips">
                    {parsed.chips.map((c, i) => <span key={i} className="search-chip">{c}</span>)}
                  </div>
                </div>
                <span className="search-row-chev">›</span>
              </button>
            </div>
          )}

          {results.length > 0 && (
            <div className="search-section">
              <div className="search-section-label">{t("search_listings")}</div>
              {results.map((r) => (
                <button key={r.id} type="button" className="search-row" onClick={() => gotoListing(r.id)}>
                  <div className="search-row-icon">
                    {r.image_url ? <img src={r.image_url} alt="" referrerPolicy="no-referrer" /> : <TeslaT />}
                  </div>
                  <div className="search-row-text">
                    <div className="search-row-title">{r.title}</div>
                    <div className="search-row-sub">
                      {r.year ?? "—"} · {fmtKm(r.mileage_km)} · {fmtPrice(r.price_eur)}
                    </div>
                  </div>
                  <span className="search-row-chev">›</span>
                </button>
              ))}
            </div>
          )}

          {loading && results.length === 0 && (
            <div className="search-empty"><span className="spinner spinner-sm" /></div>
          )}
          {nothing && <div className="search-empty">{t("search_no_match")}</div>}
        </div>
      )}
    </div>
  );
}
