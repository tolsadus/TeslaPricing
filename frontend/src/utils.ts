import type { Listing } from "./types";

export type Drivetrain = "RWD" | "AWD" | "Performance" | "Plaid";

export function getDrivetrain(listing: Listing): Drivetrain | null {
  const hay = `${listing.title ?? ""} ${listing.version ?? ""}`.toLowerCase();

  if (/plaid/i.test(hay)) return "Plaid";

  if (/performance|pup\b|p\d+d\b/i.test(hay)) return "Performance";

  if (
    /\bawd\b|dual.motor|grande.autonomie|long.?range|transmission.int[eé]grale|long-range/i.test(hay)
  )
    return "AWD";

  if (
    /\brwd\b|propulsion|standard.?plus|standard.?range|standard\b|single.motor/i.test(hay)
  )
    return "RWD";

  return null;
}

// Markets where Tesla reports/displays odometer in miles. Mileage is stored as
// canonical km, so convert for display in these markets.
const MILE_MARKETS = new Set(["US", "GB", "PR"]);

export function formatPrice(value: number | null, currency: string | null = "EUR", locale = "fr-FR"): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "EUR", maximumFractionDigits: 0 }).format(value);
}

// The currency symbol alone (e.g. "€", "$", "£") for the given ISO currency code.
export function currencySymbol(currency: string | null, locale = "fr-FR"): string {
  const code = currency || "EUR";
  const parts = new Intl.NumberFormat(locale, { style: "currency", currency: code, maximumFractionDigits: 0 }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? code;
}

export function formatMileage(km: number | null, market: string | null = null, locale = "fr-FR"): string {
  if (km == null) return "—";
  if (market && MILE_MARKETS.has(market.toUpperCase())) {
    return `${new Intl.NumberFormat(locale).format(Math.round(km / 1.60934))} mi`;
  }
  return `${new Intl.NumberFormat(locale).format(km)} km`;
}

export function formatFuel(fuel: string | null, t: (k: any) => string): string {
  if (!fuel) return "—";
  const n = fuel.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/electr/i.test(n)) return t("fuel_electric");
  if (/hybrid/i.test(n)) return t("fuel_hybrid");
  return fuel;
}

const COLOR_EN: Record<string, string> = {
  "noir uni":                    "Solid Black",
  "blanc nacré multicouches":    "Pearl White Multi-Coat",
  "blanc perle":                 "Pearl White",
  "bleu marine":                 "Midnight Blue",
  "bleu outremer métallisé":     "Deep Blue Metallic",
  "gris nuit métallisé":         "Midnight Silver Metallic",
  "gris stealth":                "Stealth Grey",
  "quicksilver":                 "Quicksilver",
  "rouge multicouches":          "Multi-Coat Red",
  "rouge ultra":                 "Ultra Red",
  "noir diamant":                "Diamond Black",
};

export function formatColor(color: string | null, lang = "fr"): string | null {
  if (!color) return null;
  const stripped = color.replace(/^(coloris|peinture)\s+/i, "").trim();
  if (lang === "en") {
    const key = stripped.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const match = Object.entries(COLOR_EN).find(([k]) =>
      key === k.normalize("NFD").replace(/[̀-ͯ]/g, "")
    );
    if (match) return match[1];
  }
  return stripped;
}

export const DRIVETRAIN_LABEL: Record<Drivetrain, string> = {
  RWD: "RWD",
  AWD: "AWD",
  Performance: "Perf",
  Plaid: "Plaid",
};

const SOURCE_COUNTRY: Record<string, { code: string; flag: string; name: string }> = {
  tesla:      { code: "FR", flag: "🇫🇷", name: "France" },
  leboncoin:  { code: "FR", flag: "🇫🇷", name: "France" },
  lacentrale: { code: "FR", flag: "🇫🇷", name: "France" },
  capcar:     { code: "FR", flag: "🇫🇷", name: "France" },
  lbauto:     { code: "FR", flag: "🇫🇷", name: "France" },
  aramisauto: { code: "FR", flag: "🇫🇷", name: "France" },
  gmecars:    { code: "FR", flag: "🇫🇷", name: "France" },
  renew:      { code: "FR", flag: "🇫🇷", name: "France" },
  heycar:     { code: "FR", flag: "🇫🇷", name: "France" },
  alcopa:     { code: "FR", flag: "🇫🇷", name: "France" },
  ewigo:      { code: "FR", flag: "🇫🇷", name: "France" },
  nikola:     { code: "BE", flag: "🇧🇪", name: "Belgium" },
  mmxbv:      { code: "NL", flag: "🇳🇱", name: "Netherlands" },
};

export function getCountry(source: string | null): { code: string; flag: string; name: string } | null {
  if (!source) return null;
  return SOURCE_COUNTRY[source] ?? null;
}

// Derive flag/name from a 2-letter ISO country code (e.g. a listing's market).
export function getCountryByCode(code: string | null, locale = "en"): { code: string; flag: string; name: string } | null {
  if (!code) return null;
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const flag = String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  let name = cc;
  try {
    name = new Intl.DisplayNames([locale], { type: "region" }).of(cc) ?? cc;
  } catch {
    // Intl.DisplayNames unavailable — fall back to the code.
  }
  return { code: cc, flag, name };
}
