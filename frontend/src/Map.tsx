import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { fetchListingsForMap } from "./api";
import { useTranslation } from "./i18n";
import { formatPrice, formatMileage } from "./utils";
import type { Listing, ListingFilters } from "./types";

// Fix default marker icons (Leaflet's default icon URLs break under bundlers).
delete (L.Icon.Default.prototype as { _getIconUrl?: () => string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const FRANCE_CENTER: L.LatLngTuple = [46.6, 2.4];
const FRANCE_ZOOM = 6;

function formatKm(v: number | null, market: string | null, locale: string, newLabel: string): string {
  if (v === null) return "—";
  if (v <= 100) return newLabel;
  return formatMileage(v, market, locale);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c] as string));
}

function popupHtml(l: Listing, locale: string, t: (k: import("./i18n").TKey) => string): string {
  const img = l.image_url ? `<img src="${escapeHtml(l.image_url)}" alt="" />` : "";
  const meta = [l.year ?? "—", formatKm(l.mileage_km, l.market, locale, t("card_new")), l.location ?? ""].filter(Boolean).join(" · ");
  return `
    <div class="map-popup">
      ${img}
      <div class="map-popup-body">
        <h4>${escapeHtml(l.title)}</h4>
        <div class="map-popup-price">${formatPrice(l.price, l.currency, locale)}</div>
        <div class="map-popup-meta">${escapeHtml(meta)}</div>
        <a class="map-popup-link" href="#/listing/${l.id}">${t("card_view")} →</a>
      </div>
    </div>
  `;
}

export default function MapView({ filters }: { filters: ListingFilters }) {
  const { t, lang } = useTranslation();
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: FRANCE_CENTER, zoom: FRANCE_ZOOM, scrollWheelZoom: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    const cluster = L.markerClusterGroup({ chunkedLoading: true });
    map.addLayer(cluster);
    mapRef.current = map;
    clusterRef.current = cluster;
    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, []);

  // Fetch listings whenever filters change
  useEffect(() => {
    const { sort_by: _sb, sort_dir: _sd, limit: _lim, offset: _off, ...filtersForMap } = filters;
    setLoading(true);
    setError(null);
    fetchListingsForMap(filtersForMap)
      .then(setListings)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters]);

  // Render markers
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;
    cluster.clearLayers();
    const markers: L.Marker[] = [];
    for (const l of listings) {
      if (l.latitude == null || l.longitude == null) continue;
      const m = L.marker([l.latitude, l.longitude]);
      m.bindPopup(popupHtml(l, locale, t), { minWidth: 220, maxWidth: 260 });
      markers.push(m);
    }
    cluster.addLayers(markers);
  }, [listings, locale, t]);

  return (
    <div className="map-page">
      <div className="map-header">
        <h2 className="dropped-title">{t("map_title")}</h2>
        <p className="dropped-subtitle">
          {loading ? t("loading") : t("map_count", { n: listings.length })}
        </p>
        {error && <p className="state error">Error: {error}</p>}
      </div>
      <div ref={containerRef} className="map-container" />
    </div>
  );
}
