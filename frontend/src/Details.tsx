import { useState } from "react";
import { fetchListing } from "./api";
import type { Listing } from "./types";

type FieldDef = { key: keyof Listing; label: string; format?: (v: unknown) => string };

const FIELDS: FieldDef[] = [
  { key: "id",          label: "ID" },
  { key: "source",      label: "Source" },
  { key: "external_id", label: "External ID" },
  { key: "title",       label: "Title" },
  { key: "make",        label: "Make" },
  { key: "model",       label: "Model" },
  { key: "version",     label: "Version" },
  { key: "drivetrain",  label: "Drivetrain" },
  { key: "year",        label: "Year" },
  { key: "mileage_km",  label: "Mileage", format: (v) => v != null ? `${new Intl.NumberFormat("fr-FR").format(v as number)} km` : "" },
  { key: "fuel",        label: "Fuel" },
  { key: "gearbox",     label: "Gearbox" },
  { key: "color",       label: "Color" },
  { key: "horse_power", label: "Horse power", format: (v) => v != null ? `${v} ch` : "" },
  { key: "doors",       label: "Doors" },
  { key: "seats",       label: "Seats" },
  { key: "soh",         label: "Battery SoH", format: (v) => v != null ? `${v}%` : "" },
  { key: "autopilot",   label: "Autopilot" },
  { key: "price_eur",   label: "Price", format: (v) => v != null ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v as number) : "" },
  { key: "location",    label: "Location" },
  { key: "image_url",   label: "Image URL" },
  { key: "url",         label: "Listing URL" },
  { key: "scraped_at",  label: "Scraped at", format: (v) => v ? new Date(v as string).toLocaleString("fr-FR") : "" },
];

const MISSING_FIELDS: (keyof Listing)[] = ["make", "model", "version", "drivetrain", "year", "mileage_km", "fuel", "color", "horse_power", "doors", "seats", "soh", "location", "image_url"];

export default function Details() {
  const [inputVal, setInputVal] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = parseInt(inputVal.trim(), 10);
    if (!id) return;
    setError(null);
    setListing(null);
    setLoading(true);
    fetchListing(id)
      .then(setListing)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  const missing = listing ? MISSING_FIELDS.filter((k) => listing[k] == null) : [];
  const filled = listing ? MISSING_FIELDS.filter((k) => listing[k] != null) : [];

  return (
    <div className="details-audit">
      <div className="page-hero">
        <div className="page-header">
          <div>
            <h2 className="dropped-title">Details audit</h2>
            <p className="dropped-subtitle">Inspect which fields are missing for any listing</p>
          </div>
        </div>
      </div>

      <div className="details-audit-body">
        <form className="details-audit-form" onSubmit={handleSubmit}>
          <input
            className="details-audit-input"
            type="number"
            placeholder="Listing ID…"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            min={1}
          />
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Loading…" : "Inspect"}
          </button>
        </form>

        {error && <p className="state error">Error: {error}</p>}

        {listing && (
          <>
            <div className="details-audit-summary">
              <div className="audit-pill audit-ok">{filled.length} fields filled</div>
              <div className="audit-pill audit-missing">{missing.length} fields missing</div>
              <a className="btn btn-secondary" href={`#/listing/${listing.id}`} target="_blank" rel="noreferrer">Open listing ↗</a>
            </div>

            <table className="details-audit-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {FIELDS.map(({ key, label, format }) => {
                  const raw = listing[key];
                  const isEmpty = raw == null || raw === "";
                  const isTracked = MISSING_FIELDS.includes(key);
                  const display = isEmpty ? "" : format ? format(raw) : String(raw);
                  return (
                    <tr key={key} className={isTracked && isEmpty ? "row-missing" : ""}>
                      <td className="field-name">{label}</td>
                      <td className="field-value">
                        {isEmpty ? <span className="empty-dash">—</span> : display}
                      </td>
                      <td className="field-status">
                        {isTracked && (isEmpty
                          ? <span className="status-badge missing">missing</span>
                          : <span className="status-badge ok">✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
