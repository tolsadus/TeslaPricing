import type { Listing, ListingFilters, PricePoint } from "./types";

export async function fetchListings(filters: ListingFilters = {}): Promise<Listing[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && value !== null) {
      params.set(key, String(value));
    }
  }
  const res = await fetch(`/api/listings?${params.toString()}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchListing(id: number): Promise<Listing> {
  const res = await fetch(`/api/listings/${id}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchPhotos(id: number): Promise<string[]> {
  const res = await fetch(`/api/listings/${id}/photos`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchStats(): Promise<{ total: number }> {
  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function fetchPriceHistory(id: number): Promise<PricePoint[]> {
  const res = await fetch(`/api/listings/${id}/price-history`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
