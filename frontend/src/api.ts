import { supabase } from "./supabase";
import type { Listing, ListingFilters, PricePoint, TrendPoint, DroppedListing } from "./types";

const SORT_COLUMN: Record<string, string> = {
  scraped_at: "scraped_at",
  mileage_km: "mileage_km",
  year: "year",
  price: "price",
  price_delta: "price_delta",
  drop_pct: "drop_pct",
  market: "market",
};

const COLOR_OR: Record<string, string> = {
  Noir:  "color.ilike.%noir%",
  Blanc: "color.ilike.%blanc%",
  Gris:  "color.ilike.%gris%,color.ilike.%silver%",
  Bleu:  "color.ilike.%bleu%",
  Rouge: "color.ilike.%rouge%",
};

// Country = Tesla listings in that market, plus non-Tesla sources based in it
// (other sources don't set `market`). See SOURCE_COUNTRY in utils.ts.
const COUNTRY_OR: Record<string, string> = {
  FR: "and(source.eq.tesla,market.eq.FR),source.in.(leboncoin,lacentrale,capcar,lbauto,aramisauto,gmecars,renew,heycar,alcopa,ewigo)",
  BE: "and(source.eq.tesla,market.eq.BE),source.eq.nikola",
  NL: "and(source.eq.tesla,market.eq.NL),source.eq.mmxbv",
};

function applyFilters<T>(query: T, filters: ListingFilters): T {
  let q = query as any;
  if (filters.hide_sold) q = q.eq("is_sold", false).is("removed_at", null);
  if (filters.model) q = q.ilike("model", `%${filters.model}%`);
  if (filters.drivetrain) q = q.eq("drivetrain", filters.drivetrain);
  if (filters.autopilot) q = q.eq("autopilot", filters.autopilot);
  if (filters.seats !== undefined) q = q.eq("seats", filters.seats);
  if (filters.color_family && COLOR_OR[filters.color_family]) q = q.or(COLOR_OR[filters.color_family]);
  if (filters.country && COUNTRY_OR[filters.country]) q = q.or(COUNTRY_OR[filters.country]);
  if (filters.min_price !== undefined) q = q.gte("price", filters.min_price);
  if (filters.max_price !== undefined) q = q.lte("price", filters.max_price);
  if (filters.min_year !== undefined) q = q.gte("year", filters.min_year);
  if (filters.max_year !== undefined) q = q.lte("year", filters.max_year);
  if (filters.new_only) q = q.lte("mileage_km", 1000);
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
    .from("listings_with_delta_all")
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
    .select("price, recorded_at")
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

export async function fetchListingsForMap(filters: ListingFilters = {}): Promise<Listing[]> {
  let query = supabase
    .from("listings_with_delta")
    .select("id, source, title, model, price, year, mileage_km, image_url, latitude, longitude, drivetrain, autopilot, location, url, currency, market")
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(5000);
  query = applyFilters(query, filters);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Listing[];
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

export type VoteValue = -1 | 1;
export type VoteSummary = { up: number; down: number; mine: VoteValue | null };

export async function fetchVoteSummary(listingId: number, userId: string | null): Promise<VoteSummary> {
  const { data, error } = await supabase
    .from("listing_votes")
    .select("vote, user_id")
    .eq("listing_id", listingId);
  if (error) throw new Error(error.message);
  let up = 0, down = 0, mine: VoteValue | null = null;
  for (const row of data ?? []) {
    if (row.vote === 1) up++;
    else if (row.vote === -1) down++;
    if (userId && row.user_id === userId) mine = row.vote as VoteValue;
  }
  return { up, down, mine };
}

export async function castVote(listingId: number, userId: string, vote: VoteValue): Promise<void> {
  const { error } = await supabase
    .from("listing_votes")
    .upsert({ listing_id: listingId, user_id: userId, vote }, { onConflict: "listing_id,user_id" });
  if (error) throw new Error(error.message);
}

export async function clearVote(listingId: number, userId: string): Promise<void> {
  const { error } = await supabase
    .from("listing_votes")
    .delete()
    .eq("listing_id", listingId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
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
