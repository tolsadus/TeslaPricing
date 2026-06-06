import { useEffect, useState } from "react";
import { useTranslation } from "./i18n";
import { getCountryByCode } from "./utils";
import type { ListingFilters, Market } from "./types";

const MODELS = ["Model S", "Model 3", "Model X", "Model Y", "Cybertruck", "Roadster"] as const;
const SOURCES = ["tesla", "leboncoin", "lacentrale", "capcar", "lbauto", "aramisauto", "gmecars", "renew", "heycar", "alcopa", "mmxbv", "nikola", "ewigo"] as const;
const DRIVETRAINS = ["RWD", "AWD", "Performance", "Plaid"] as const;
const AUTOPILOTS = ["EAP", "FSD"] as const;
const SEATS_OPTIONS = [5, 6, 7] as const;
const COLOR_FAMILIES = ["Noir", "Blanc", "Gris", "Bleu", "Rouge"] as const;
export const COLOR_LABEL_KEY = { Noir: "color_noir", Blanc: "color_blanc", Gris: "color_gris", Bleu: "color_bleu", Rouge: "color_rouge" } as const;

const PRICE_BOUNDS = { min: 0, max: 200000, step: 1000 };
const YEAR_BOUNDS = { min: 2008, max: new Date().getFullYear(), step: 1 };
const MILEAGE_BOUNDS = { min: 0, max: 300000, step: 1000 };

function SidebarSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`sidebar-section${className ? ` ${className}` : ""}`}>
      <h3 className="sidebar-heading">{title}</h3>
      <div className="sidebar-body">{children}</div>
    </div>
  );
}

function RangeInputs({ minVal, maxVal, unit, disabled, ariaLabel, sliderMin, sliderMax, step = 1, onChangeMin, onChangeMax }: {
  minVal?: number;
  maxVal?: number;
  unit?: string;
  disabled?: boolean;
  ariaLabel: string;
  sliderMin: number;
  sliderMax: number;
  step?: number;
  onChangeMin: (v: number | undefined) => void;
  onChangeMax: (v: number | undefined) => void;
}) {
  const [localMin, setLocalMin] = useState(minVal !== undefined ? String(minVal) : "");
  const [localMax, setLocalMax] = useState(maxVal !== undefined ? String(maxVal) : "");

  useEffect(() => { setLocalMin(minVal !== undefined ? String(minVal) : ""); }, [minVal]);
  useEffect(() => { setLocalMax(maxVal !== undefined ? String(maxVal) : ""); }, [maxVal]);

  const minPlaceholder = unit ? `Min ${unit}` : "Min";
  const maxPlaceholder = unit ? `Max ${unit}` : "Max";

  const clamp = (v: number) => Math.min(Math.max(v, sliderMin), sliderMax);
  const sMin = clamp(minVal ?? sliderMin);
  const sMax = clamp(maxVal ?? sliderMax);
  const pct = (v: number) => ((v - sliderMin) / (sliderMax - sliderMin)) * 100;

  const commitMin = (raw: number) => {
    const v = Math.min(raw, sMax);
    onChangeMin(v <= sliderMin ? undefined : v);
  };
  const commitMax = (raw: number) => {
    const v = Math.max(raw, sMin);
    onChangeMax(v >= sliderMax ? undefined : v);
  };

  const minOnTop = sMin > (sliderMin + sliderMax) / 2;

  return (
    <div className="range-filter">
      <div className={`range-slider${disabled ? " disabled" : ""}`}>
        <div className="range-slider-rail" />
        <div className="range-slider-fill" style={{ left: `${pct(sMin)}%`, right: `${100 - pct(sMax)}%` }} />
        <input type="range" className="range-slider-input"
          style={{ zIndex: minOnTop ? 5 : 3 }}
          min={sliderMin} max={sliderMax} step={step} value={sMin} disabled={disabled}
          aria-label={`${ariaLabel} min`}
          onChange={e => commitMin(Number(e.target.value))} />
        <input type="range" className="range-slider-input"
          style={{ zIndex: 4 }}
          min={sliderMin} max={sliderMax} step={step} value={sMax} disabled={disabled}
          aria-label={`${ariaLabel} max`}
          onChange={e => commitMax(Number(e.target.value))} />
      </div>
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
  markets: Market[];
};

export default function Sidebar({ filters, setFilters, defaultLimit, resetKey, bumpResetKey, hiddenCount = 0, showHidden = false, onToggleHidden, onClearHidden, markets }: SidebarProps) {
  const { t, lang } = useTranslation();
  const locale = lang === "fr" ? "fr-FR" : "en-GB";

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

      <SidebarSection title={t("filter_country")}>
        <select className="country-select" value={filters.country ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value || undefined }))}>
          <option value="">{t("filter_all")}</option>
          {markets.map((m) => {
            const info = getCountryByCode(m.market, locale);
            return <option key={m.market} value={m.market}>{info ? `${info.flag} ${info.name}` : m.market}</option>;
          })}
        </select>
      </SidebarSection>

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
          sliderMin={PRICE_BOUNDS.min} sliderMax={PRICE_BOUNDS.max} step={PRICE_BOUNDS.step}
          minVal={filters.min_price} maxVal={filters.max_price}
          onChangeMin={v => setFilters(f => ({ ...f, min_price: v }))}
          onChangeMax={v => setFilters(f => ({ ...f, max_price: v }))}
        />
      </SidebarSection>

      <SidebarSection key={`Year-${resetKey}`} title={t("filter_year")}>
        <RangeInputs ariaLabel={t("filter_year")}
          sliderMin={YEAR_BOUNDS.min} sliderMax={YEAR_BOUNDS.max} step={YEAR_BOUNDS.step}
          minVal={filters.min_year} maxVal={filters.max_year}
          onChangeMin={v => setFilters(f => ({ ...f, min_year: v }))}
          onChangeMax={v => setFilters(f => ({ ...f, max_year: v }))}
        />
      </SidebarSection>

      <SidebarSection key={`Mileage-${resetKey}`} title={t("filter_mileage")}>
        <RangeInputs ariaLabel={t("filter_mileage")} unit="km"
          sliderMin={MILEAGE_BOUNDS.min} sliderMax={MILEAGE_BOUNDS.max} step={MILEAGE_BOUNDS.step}
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
                onClick={() => setFilters((f) => ({ ...f, color_family: f.color_family === c ? undefined : c }))}>{t(COLOR_LABEL_KEY[c])}</button>
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
