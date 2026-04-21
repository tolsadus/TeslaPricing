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
};

export type PricePoint = {
  price_eur: number | null;
  recorded_at: string;
};

export type SortBy = "scraped_at" | "mileage_km" | "year" | "price";
export type SortDir = "asc" | "desc";

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
