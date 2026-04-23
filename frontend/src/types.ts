export type Listing = {
  id: number;
  source: string;
  external_id: string;
  title: string;
  make: string | null;
  model: string | null;
  version: string | null;
  price_eur: number | null;
  year: number | null;
  mileage_km: number | null;
  fuel: string | null;
  gearbox: string | null;
  location: string | null;
  url: string;
  image_url: string | null;
  scraped_at: string;
  first_price: number | null;
  max_price: number | null;
  price_delta: number | null;
  drivetrain: string | null;
  soh: number | null;
  color: string | null;
  horse_power: number | null;
  doors: number | null;
  seats: number | null;
  autopilot: string | null;
};

export type DroppedListing = {
  id: number;
  source: string;
  title: string;
  make: string | null;
  model: string | null;
  version: string | null;
  drivetrain: string | null;
  price_eur: number | null;
  old_price: number;
  drop_amount: number;
  drop_pct: number;
  year: number | null;
  mileage_km: number | null;
  fuel: string | null;
  location: string | null;
  url: string;
  image_url: string | null;
  dropped_at: string;
};

export type PricePoint = {
  price_eur: number | null;
  recorded_at: string;
};

export type SortBy = "scraped_at" | "mileage_km" | "year" | "price" | "price_delta";
export type SortDir = "asc" | "desc";

export type TrendPoint = {
  date: string;
  model: string | null;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  count: number;
};

export type ListingFilters = {
  model?: string;
  min_price?: number;
  max_price?: number;
  min_year?: number;
  max_year?: number;
  source?: string;
  sort_by?: SortBy;
  sort_dir?: SortDir;
  limit?: number;
  offset?: number;
};
