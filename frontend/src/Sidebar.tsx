import { useEffect, useState } from "react";
import { useTranslation } from "./i18n";
import type { ListingFilters } from "./types";

const MODELS = ["Model S", "Model 3", "Model X", "Model Y", "Cybertruck", "Roadster"] as const;
const SOURCES = ["tesla", "leboncoin", "lacentrale", "capcar", "lbauto", "aramisauto", "gmecars", "renew", "heycar", "alcopa", "mmxbv", "nikola", "ewigo"] as const;
const DRIVETRAINS = ["RWD", "AWD", "Performance", "Plaid"] as const;
const AUTOPILOTS = ["EAP", "FSD"] as const;
const SEATS_OPTIONS = [5, 6, 7] as const;
const COLOR_FAMILIES = ["Noir", "Blanc", "Gris", "Bleu", "Rouge"] as const;

function sortKey(f: ListingFilters): string {
  return `${f.sort_by ?? "scraped_at"}:${f.sort_dir ?? "desc"}`;
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

type SidebarProps = {
  filters: ListingFilters;
  setFilters: (f: ListingFilters | ((prev: ListingFilters) => ListingFilters)) => void;
  defaultLimit: number;
  resetKey: number;
  bumpResetKey: () => void;
};

export default function Sidebar({ filters, setFilters, defaultLimit, resetKey, bumpResetKey }: SidebarProps) {
  const { t } = useTranslation();

  const SORT_OPTIONS = [
    { label: t("sort_latest"),      sort_by: "scraped_at" as const, sort_dir: "desc" as const },
    { label: t("sort_price_asc"),   sort_by: "price"      as const, sort_dir: "asc"  as const },
    { label: t("sort_price_desc"),  sort_by: "price"      as const, sort_dir: "desc" as const },
    { label: t("sort_mileage_asc"), sort_by: "mileage_km" as const, sort_dir: "asc"  as const },
    { label: t("sort_mileage_desc"),sort_by: "mileage_km" as const, sort_dir: "desc" as const },
    { label: t("sort_year_newest"), sort_by: "year"       as const, sort_dir: "desc" as const },
    { label: t("sort_year_oldest"), sort_by: "year"       as const, sort_dir: "asc"  as const },
    { label: t("sort_biggest_drop_eur"), sort_by: "price_delta" as const, sort_dir: "desc" as const },
    { label: t("sort_biggest_drop_pct"), sort_by: "drop_pct"    as const, sort_dir: "desc" as const },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <button
          type="button"
          className="reset-filters-btn"
          onClick={() => {
            setFilters({ sort_by: "scraped_at", sort_dir: "desc", limit: defaultLimit });
            Object.keys(sidebarSectionPrefs).forEach(k => { sidebarSectionPrefs[k] = false; });
            sidebarSectionPrefs["Model"] = true;
            localStorage.setItem("sidebarSections", JSON.stringify(sidebarSectionPrefs));
            bumpResetKey();
          }}
        >
          {t("reset_filters")}
        </button>
      </div>

      <SidebarSection key={`Model-${resetKey}`} label="Model" title={t("filter_model")} defaultOpen>
        <div className="model-options">
          <button type="button" className={`model-btn ${!filters.model ? "active" : ""}`}
            onClick={() => setFilters({ ...filters, model: undefined })}>{t("filter_all")}</button>
          {MODELS.map((m) => (
            <button key={m} type="button"
              className={`model-btn ${filters.model === m ? "active" : ""}`}
              onClick={() => setFilters({ ...filters, model: m })}>{m}</button>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection key={`Source-${resetKey}`} label="Source" title={t("filter_source")}>
        <div className="model-options">
          <button type="button" className={`model-btn ${!filters.source ? "active" : ""}`}
            onClick={() => setFilters({ ...filters, source: undefined })}>{t("filter_all")}</button>
          {SOURCES.map((s) => (
            <button key={s} type="button"
              className={`model-btn ${filters.source === s ? "active" : ""}`}
              onClick={() => setFilters({ ...filters, source: filters.source === s ? undefined : s })}>{s}</button>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection key={`Sort-${resetKey}`} label="Sort" title={t("filter_sort")}>
        <div className="sort-options">
          {SORT_OPTIONS.map((o) => {
            const key = `${o.sort_by}:${o.sort_dir}`;
            return (
              <button key={key} type="button"
                className={`sort-btn ${sortKey(filters) === key ? "active" : ""}`}
                onClick={() => setFilters({ ...filters, sort_by: o.sort_by, sort_dir: o.sort_dir })}>{o.label}</button>
            );
          })}
        </div>
      </SidebarSection>

      <SidebarSection key={`Drivetrain-${resetKey}`} label="Drivetrain" title={t("filter_drivetrain")}>
        <div className="model-options">
          {DRIVETRAINS.map((d) => (
            <button key={d} type="button"
              className={`model-btn ${filters.drivetrain === d ? "active" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, drivetrain: f.drivetrain === d ? undefined : d }))}>{d}</button>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection key={`Autopilot-${resetKey}`} label="Autopilot" title={t("filter_autopilot")}>
        <div className="model-options">
          {AUTOPILOTS.map((a) => (
            <button key={a} type="button"
              className={`model-btn ${filters.autopilot === a ? "active" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, autopilot: f.autopilot === a ? undefined : a }))}>{a}</button>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection key={`Seats-${resetKey}`} label="Seats" title={t("filter_seats")}>
        <div className="model-options">
          {SEATS_OPTIONS.map((s) => (
            <button key={s} type="button"
              className={`model-btn ${filters.seats === s ? "active" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, seats: f.seats === s ? undefined : s }))}>{s}</button>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection key={`Color-${resetKey}`} label="Color" title={t("filter_color")}>
        <div className="model-options">
          {COLOR_FAMILIES.map((c) => (
            <button key={c} type="button"
              className={`model-btn ${filters.color_family === c ? "active" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, color_family: f.color_family === c ? undefined : c }))}>{c}</button>
          ))}
        </div>
      </SidebarSection>

      <SidebarSection key={`Filters-${resetKey}`} label="Filters" title={t("filter_filters")}>
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
        <button
          type="button"
          className={`new-only-btn ${filters.hide_sold ? "active" : ""}`}
          onClick={() => setFilters(f => ({ ...f, hide_sold: !f.hide_sold }))}
        >
          <span className="new-only-track"><span className="new-only-thumb" /></span>
          {t("filter_hide_sold")}
        </button>
      </SidebarSection>
    </aside>
  );
}
