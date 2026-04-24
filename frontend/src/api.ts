import { supabase } from "./supabase";
import type { Listing, ListingFilters, PricePoint, TrendPoint, DroppedListing } from "./types";

const SORT_COLUMN: Record<string, string> = {
  scraped_at: "scraped_at",
  mileage_km: "mileage_km",
  year: "year",
  price: "price_eur",
  price_delta: "price_delta",
};

export async function fetchListings(filters: ListingFilters = {}): Promise<Listing[]> {
  const {
    model,
    drivetrain,
    autopilot,
    min_price,
    max_price,
    min_year,
    max_year,
    source,
    sort_by = "scraped_at",
    sort_dir = "desc",
    limit = 50,
    offset = 0,
  } = filters;

  const column = SORT_COLUMN[sort_by] ?? "scraped_at";
  const ascending = sort_dir === "asc";

  let query = supabase
    .from("listings_with_delta")
    .select("*")
    .order(column, { ascending, nullsFirst: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);

  if (model) query = query.ilike("model", `%${model}%`);
  if (drivetrain) query = query.eq("drivetrain", drivetrain);
  if (autopilot) query = query.eq("autopilot", autopilot);
  if (min_price !== undefined) query = query.gte("price_eur", min_price);
  if (max_price !== undefined) query = query.lte("price_eur", max_price);
  if (min_year !== undefined) query = query.gte("year", min_year);
  if (max_year !== undefined) query = query.lte("year", max_year);
  if (source) query = query.eq("source", source);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Listing[];
}

export async function fetchListingsByIds(ids: number[]): Promise<Listing[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("listings_with_delta")
    .select("*")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as Listing[];
}

export async function fetchListing(id: number): Promise<Listing> {
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data as Listing;
}

export async function fetchPhotos(id: number): Promise<string[]> {
  const { data, error } = await supabase
    .from("listing_photos")
    .select("url")
    .eq("listing_id", id)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.url);
}

export async function fetchCount(filters: Pick<ListingFilters, "model" | "drivetrain" | "autopilot" | "min_price" | "max_price" | "min_year" | "max_year" | "source"> = {}): Promise<number> {
  let query = supabase.from("listings_with_delta").select("*", { count: "exact", head: true });
  if (filters.model) query = query.ilike("model", `%${filters.model}%`);
  if (filters.drivetrain) query = query.eq("drivetrain", filters.drivetrain);
  if (filters.autopilot) query = query.eq("autopilot", filters.autopilot);
  if (filters.min_price !== undefined) query = query.gte("price_eur", filters.min_price);
  if (filters.max_price !== undefined) query = query.lte("price_eur", filters.max_price);
  if (filters.min_year !== undefined) query = query.gte("year", filters.min_year);
  if (filters.max_year !== undefined) query = query.lte("year", filters.max_year);
  if (filters.source) query = query.eq("source", filters.source);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function fetchStats(): Promise<{ total: number; by_source: Record<string, number> }> {
  const { data, error } = await supabase.rpc("get_stats");
  if (error) throw new Error(error.message);
  const result = data as { total: number; by_source: Record<string, number> };
  return result;
}

export async function fetchPriceHistory(id: number): Promise<PricePoint[]> {
  const { data, error } = await supabase
    .from("price_history")
    .select("price_eur, recorded_at")
    .eq("listing_id", id)
    .order("recorded_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as PricePoint[];
}

export async function fetchTrends(): Promise<TrendPoint[]> {
  const { data, error } = await supabase.rpc("get_trends");
  if (error) throw new Error(error.message);
  return (data ?? []) as TrendPoint[];
}

export async function fetchRecentDrops(hours = 48): Promise<DroppedListing[]> {
  const { data, error } = await supabase.rpc("get_recent_drops", { hours });
  if (error) throw new Error(error.message);
  return (data ?? []) as DroppedListing[];
}
