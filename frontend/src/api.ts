import { supabase } from "./supabase";
import type { Listing, ListingFilters, PricePoint, TrendPoint, DroppedListing } from "./types";

const SORT_COLUMN: Record<string, string> = {
  scraped_at: "scraped_at",
  mileage_km: "mileage_km",
  year: "year",
  price: "price_eur",
  price_delta: "price_delta",
  drop_pct: "drop_pct",
};

const COLOR_OR: Record<string, string> = {
  Noir:  "color.ilike.%noir%",
  Blanc: "color.ilike.%blanc%",
  Gris:  "color.ilike.%gris%,color.ilike.%silver%",
  Bleu:  "color.ilike.%bleu%",
  Rouge: "color.ilike.%rouge%",
};

function applyFilters<T>(query: T, filters: ListingFilters): T {
  let q = query as any;
  if (filters.model) q = q.ilike("model", `%${filters.model}%`);
  if (filters.drivetrain) q = q.eq("drivetrain", filters.drivetrain);
  if (filters.autopilot) q = q.eq("autopilot", filters.autopilot);
  if (filters.seats !== undefined) q = q.eq("seats", filters.seats);
  if (filters.color_family && COLOR_OR[filters.color_family]) q = q.or(COLOR_OR[filters.color_family]);
  if (filters.min_price !== undefined) q = q.gte("price_eur", filters.min_price);
  if (filters.max_price !== undefined) q = q.lte("price_eur", filters.max_price);
  if (filters.min_year !== undefined) q = q.gte("year", filters.min_year);
  if (filters.max_year !== undefined) q = q.lte("year", filters.max_year);
  if (filters.new_only) q = q.lte("mileage_km", 100);
  else {
    if (filters.min_mileage !== undefined) q = q.gte("mileage_km", filters.min_mileage);
    if (filters.max_mileage !== undefined) q = q.lte("mileage_km", filters.max_mileage);
  }
  if (filters.source) q = q.eq("source", filters.source);
  return q as T;
}

export async function fetchListings(filters: ListingFilters = {}): Promise<Listing[]> {
  const {
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

  query = applyFilters(query, filters);

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

export async function fetchCount(filters: ListingFilters = {}): Promise<number> {
  let query = supabase.from("listings_with_delta").select("*", { count: "exact", head: true });
  query = applyFilters(query, filters);
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

export async function fetchAuctions(): Promise<Listing[]> {
  const { data, error } = await supabase
    .from("listings_with_delta")
    .select("*")
    .not("auction_date", "is", null)
    .order("auction_date", { ascending: true })
    .order("lot_number", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Listing[];
}

export async function searchListings(q: string, limit = 8): Promise<Listing[]> {
  const v = `%${q.replace(/[%,]/g, "")}%`;
  const { data, error } = await supabase
    .from("listings_with_delta")
    .select("*")
    .or(`title.ilike.${v},vin.ilike.${v},version.ilike.${v},model.ilike.${v}`)
    .order("scraped_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Listing[];
}

export async function fetchModelCounts(models: readonly string[]): Promise<Record<string, number>> {
  const counts = await Promise.all(models.map((m) => fetchCount({ model: m })));
  return Object.fromEntries(models.map((m, i) => [m, counts[i]]));
}

export async function fetchRecentDrops(hours = 48): Promise<DroppedListing[]> {
  const { data, error } = await supabase.rpc("get_recent_drops", { hours });
  if (error) throw new Error(error.message);
  return (data ?? []) as DroppedListing[];
}
