import { useEffect, useState } from "react";
import { useTranslation } from "./i18n";
import type { ListingFilters } from "./types";

const MODELS = ["Model S", "Model 3", "Model X", "Model Y", "Cybertruck", "Roadster"] as const;
const SOURCES = ["tesla", "leboncoin", "lacentrale", "capcar", "lbauto", "aramisauto", "gmecars", "renew", "heycar", "alcopa", "mmxbv", "nikola", "ewigo"] as const;
const DRIVETRAINS = ["RWD", "AWD", "Performance", "Plaid"] as const;
const AUTOPILOTS = ["EAP", "FSD"] as const;
const SEATS_OPTIONS = [5, 6, 7] as const;
const COLOR_FAMILIES = ["Noir", "Blanc", "Gris", "Bleu", "Rouge"] as const;

function SidebarSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`sidebar-section${className ? ` ${className}` : ""}`}>
      <h3 className="sidebar-heading">{title}</h3>
      <div className="sidebar-body">{children}</div>
    </div>
  );
}

function RangeInputs({ minVal, maxVal, unit, disabled, ariaLabel, onChangeMin, onChangeMax }: {
  minVal?: number;
  maxVal?: number;
  unit?: string;
  disabled?: boolean;
  ariaLabel: string;
  onChangeMin: (v: number | undefined) => void;
  onChangeMax: (v: number | undefined) => void;
}) {
  const [localMin, setLocalMin] = useState(minVal !== undefined ? String(minVal) : "");
  const [localMax, setLocalMax] = useState(maxVal !== undefined ? String(maxVal) : "");

  useEffect(() => { setLocalMin(minVal !== undefined ? String(minVal) : ""); }, [minVal]);
  useEffect(() => { setLocalMax(maxVal !== undefined ? String(maxVal) : ""); }, [maxVal]);

  const minPlaceholder = unit ? `Min ${unit}` : "Min";
  const maxPlaceholder = unit ? `Max ${unit}` : "Max";

  return (
    <div className="range-inputs-row">
      <input type="number" className="range-input" placeholder={minPlaceholder} disabled={disabled}
        aria-label={`${ariaLabel} min`}
        value={localMin} onChange={e => setLocalMin(e.target.value)}
        onBlur={e => onChangeMin(e.target.value !== "" ? Number(e.target.value) : undefined)} />
      <span className="range-inputs-sep">–</span>
      <input type="number" className="range-input" placeholder={maxPlaceholder} disabled={disabled}
        aria-label={`${ariaLabel} max`}
        value={localMax} onChange={e => setLocalMax(e.target.value)}
        onBlur={e => onChangeMax(e.target.value !== "" ? Number(e.target.value) : undefined)} />
    </div>
  );
}

type SidebarProps = {
  filters: ListingFilters;
  setFilters: (f: ListingFilters | ((prev: ListingFilters) => ListingFilters)) => void;
  defaultLimit: number;
  resetKey: number;
  bumpResetKey: () => void;
  hiddenCount?: number;
  showHidden?: boolean;
  onToggleHidden?: () => void;
  onClearHidden?: () => void;
};

export default function Sidebar({ filters, setFilters, defaultLimit, resetKey, bumpResetKey, hiddenCount = 0, showHidden = false, onToggleHidden, onClearHidden }: SidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="sidebar">
      <div className="sidebar-section sidebar-actions">
        <button
          type="button"
          className="reset-filters-btn"
          onClick={() => {
            setFilters({ sort_by: "scraped_at", sort_dir: "desc", limit: defaultLimit });
            bumpResetKey();
          }}
        >
          {t("reset_filters")}
        </button>
        {hiddenCount > 0 && onToggleHidden && (
          <button type="button" className="reset-filters-btn" onClick={onToggleHidden}>
            {showHidden ? t("hidden_hide_count", { n: hiddenCount }) : t("hidden_show_count", { n: hiddenCount })}
          </button>
        )}
        {hiddenCount > 0 && onClearHidden && (
          <button
            type="button"
            className="reset-filters-btn"
            onClick={() => {
              if (window.confirm(t("hidden_clear_confirm", { n: hiddenCount }))) onClearHidden();
            }}
          >
            {t("hidden_clear")}
          </button>
        )}
      </div>

      <div className="sidebar-section model-block">
        <div className="model-block-header">
          <span className="sidebar-heading-label">{t("filter_model")}</span>
          <button
            type="button"
            className={`model-all-btn ${!filters.model ? "active" : ""}`}
            onClick={() => setFilters({ ...filters, model: undefined })}
          >
            {t("filter_all")}
          </button>
        </div>
        <div className="model-grid">
          {MODELS.map((m) => {
            const isActive = filters.model === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={isActive}
                className={`model-tile ${isActive ? "active" : ""}`}
                onClick={() => setFilters({ ...filters, model: m })}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <SidebarSection key={`Price-${resetKey}`} title={t("filter_price")}>
        <RangeInputs ariaLabel={t("filter_price")} unit="€"
          minVal={filters.min_price} maxVal={filters.max_price}
          onChangeMin={v => setFilters(f => ({ ...f, min_price: v }))}
          onChangeMax={v => setFilters(f => ({ ...f, max_price: v }))}
        />
      </SidebarSection>

      <SidebarSection key={`Year-${resetKey}`} title={t("filter_year")}>
        <RangeInputs ariaLabel={t("filter_year")}
          minVal={filters.min_year} maxVal={filters.max_year}
          onChangeMin={v => setFilters(f => ({ ...f, min_year: v }))}
          onChangeMax={v => setFilters(f => ({ ...f, max_year: v }))}
        />
      </SidebarSection>

      <SidebarSection key={`Mileage-${resetKey}`} title={t("filter_mileage")}>
        <RangeInputs ariaLabel={t("filter_mileage")} unit="km"
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

      <SidebarSection title={t("filter_drivetrain")}>
        <div className="chip-options">
          {DRIVETRAINS.map((d) => {
            const isActive = filters.drivetrain === d;
            return (
              <button key={d} type="button" aria-pressed={isActive}
                className={`chip-btn ${isActive ? "active" : ""}`}
                onClick={() => setFilters((f) => ({ ...f, drivetrain: f.drivetrain === d ? undefined : d }))}>{d}</button>
            );
          })}
        </div>
      </SidebarSection>

      <SidebarSection title={t("filter_autopilot")}>
        <div className="chip-options">
          {AUTOPILOTS.map((a) => {
            const isActive = filters.autopilot === a;
            return (
              <button key={a} type="button" aria-pressed={isActive}
                className={`chip-btn ${isActive ? "active" : ""}`}
                onClick={() => setFilters((f) => ({ ...f, autopilot: f.autopilot === a ? undefined : a }))}>{a}</button>
            );
          })}
        </div>
      </SidebarSection>

      <SidebarSection title={t("filter_seats")}>
        <div className="chip-options">
          {SEATS_OPTIONS.map((s) => {
            const isActive = filters.seats === s;
            return (
              <button key={s} type="button" aria-pressed={isActive}
                className={`chip-btn ${isActive ? "active" : ""}`}
                onClick={() => setFilters((f) => ({ ...f, seats: f.seats === s ? undefined : s }))}>{s}</button>
            );
          })}
        </div>
      </SidebarSection>

      <SidebarSection title={t("filter_color")}>
        <div className="chip-options">
          {COLOR_FAMILIES.map((c) => {
            const isActive = filters.color_family === c;
            return (
              <button key={c} type="button" aria-pressed={isActive}
                className={`chip-btn ${isActive ? "active" : ""}`}
                onClick={() => setFilters((f) => ({ ...f, color_family: f.color_family === c ? undefined : c }))}>{c}</button>
            );
          })}
        </div>
      </SidebarSection>

      <SidebarSection title={t("filter_source")}>
        <div className="model-options">
          <button type="button" aria-pressed={!filters.source} className={`model-btn ${!filters.source ? "active" : ""}`}
            onClick={() => setFilters({ ...filters, source: undefined })}>{t("filter_all")}</button>
          {SOURCES.map((s) => {
            const isActive = filters.source === s;
            return (
              <button key={s} type="button" aria-pressed={isActive}
                className={`model-btn ${isActive ? "active" : ""}`}
                onClick={() => setFilters({ ...filters, source: filters.source === s ? undefined : s })}>{s}</button>
            );
          })}
        </div>
      </SidebarSection>

      <div className="sidebar-section">
        <button
          type="button"
          className={`new-only-btn ${filters.hide_sold ? "active" : ""}`}
          onClick={() => setFilters(f => ({ ...f, hide_sold: !f.hide_sold }))}
        >
          <span className="new-only-track"><span className="new-only-thumb" /></span>
          {t("filter_hide_sold")}
        </button>
      </div>
    </aside>
  );
}
