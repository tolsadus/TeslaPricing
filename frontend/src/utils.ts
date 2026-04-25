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
