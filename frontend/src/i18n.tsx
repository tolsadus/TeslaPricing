'use strict';
import { createContext, useContext, useState } from "react";

export type Lang = "en" | "fr";

const en = {
  // Nav
  nav_listings: "Listings",
  nav_deals: "Deals",
  nav_trends: "Trends",
  nav_watchlist: "Watchlist",
  nav_details: "Details",
  nav_inventory: "inventory",
  // Sidebar
  reset_filters: "Reset filters",
  filter_model: "Model",
  filter_source: "Source",
  filter_sort: "Sort",
  filter_drivetrain: "Drivetrain",
  filter_autopilot: "Autopilot",
  filter_seats: "Seats",
  filter_color: "Color",
  filter_filters: "Filters",
  filter_all: "All",
  filter_price: "Price",
  filter_year: "Year",
  filter_mileage: "Mileage",
  filter_new: "New <100 km",
  input_min: "Min",
  input_max: "Max",
  // Sort options
  sort_latest: "Latest crawl",
  sort_price_asc: "Price ↑",
  sort_price_desc: "Price ↓",
  sort_mileage_asc: "Mileage ↑",
  sort_mileage_desc: "Mileage ↓",
  sort_year_newest: "Year (newest)",
  sort_year_oldest: "Year (oldest)",
  sort_biggest_drop: "Biggest drop",
  // Listings page
  listings_subtitle: "Crawled once a day from all sources",
  listings_in_stock: "in stock",
  // Cards
  card_view: "View",
  card_crawled: "Crawled",
  card_new: "New",
  chip_seats: "seats",
  // States
  loading: "Loading…",
  no_listings: "No listings yet.",
  // Auth
  sign_in: "Sign in",
  sign_out: "Sign out",
  auth_title: "Sign in to TeslaPricing",
  auth_subtitle: "Save listings and sync your watchlist across devices.",
  auth_google: "Continue with Google",
  auth_github: "Continue with GitHub",
  auth_x: "Continue with X",
  auth_close: "Close",
  // Misc
  report_issue: "Report an issue",
  save_listing: "Save listing",
  back_to_top: "Back to top",
  // ListingDetail
  detail_back: "← Back",
  spec_year: "Year",
  spec_mileage: "Mileage",
  spec_fuel: "Fuel",
  spec_power: "Power",
  spec_color: "Color",
  spec_doors: "Doors",
  spec_seats: "Seats",
  spec_soh: "Battery SoH",
  spec_autopilot: "Autopilot",
  spec_tow_hitch: "Tow hitch",
  spec_location: "Location",
  spec_new: "New",
  detail_save: "Save",
  detail_remove: "Remove",
  detail_view_on: "View on",
  price_history: "Price evolution",
  price_history_empty: "No price history yet.",
  price_highest: "highest ever crawl",
  photo_alt: "Photo",
  // Dropped
  dropped_title: "Price drops",
  dropped_subtitle: "Listings whose price decreased recently, sorted by biggest drop first.",
  dropped_empty: "No price drops in the last {hours}h. Run the scrapers to check for updates.",
  dropped_view: "View",
  dropped_24h: "24h",
  dropped_48h: "48h",
  dropped_7d: "7 days",
  dropped_top: "Top drops",
  dropped_others: "Others",
  dropped_label: "Dropped",
  // Trends
  trends_title: "Trends",
  trends_subtitle: "Average listing price per model across all crawled sources",
  trends_empty: "Not enough data yet — run more scrapes to see price trends over time.",
  trends_listings: "listings",
  // Saved
  saved_title: "Saved listings",
  saved_subtitle_one: "car on your watchlist",
  saved_subtitle_many: "cars on your watchlist",
  saved_empty: "No saved listings yet. Click the bookmark icon on any car to save it.",
  saved_auth_title: "Sign in to use your watchlist",
  saved_auth_subtitle: "Save listings and access them from any device. Use the Sign in button at the top right.",
  saved_remove: "Remove from saved",
  saved_view: "View",
  // Details audit
  details_title: "Details audit",
  details_subtitle: "Inspect which fields are missing for any listing",
  details_placeholder: "Listing ID…",
  details_inspect: "Inspect",
  details_field: "Field",
  details_value: "Value",
  details_status: "Status",
  details_open: "Open listing ↗",
  details_missing: "missing",
  details_filled: "fields filled",
  details_fields_missing: "fields missing",
  // Compare
  nav_compare: "Compare",
  compare_title: "Compare listings",
  compare_subtitle: "Side-by-side comparison of up to 3 cars",
  compare_empty: "No listings selected. Use the ⊕ button on any listing card to add it here.",
  compare_add: "Add to compare",
  compare_remove: "Remove",
  compare_clear: "Clear all",
  compare_view_btn: "Compare {n}",
  compare_spec_model: "Model",
  compare_spec_year: "Year",
  compare_spec_mileage: "Mileage",
  compare_spec_price: "Price",
  compare_spec_drivetrain: "Drivetrain",
  compare_spec_autopilot: "Autopilot",
  compare_spec_power: "Power",
  compare_spec_color: "Color",
  compare_spec_seats: "Seats",
  compare_spec_soh: "Battery SoH",
  compare_spec_source: "Source",
  compare_spec_location: "Location",
  compare_price_history: "Price history",
  compare_open: "View listing",
} as const;

export type T = typeof en;
export type TKey = keyof T;

const fr: Record<TKey, string> = {
  // Nav
  nav_listings: "Annonces",
  nav_deals: "Bonnes affaires",
  nav_trends: "Tendances",
  nav_watchlist: "Favoris",
  nav_details: "Détails",
  nav_inventory: "inventaire",
  // Sidebar
  reset_filters: "Réinitialiser",
  filter_model: "Modèle",
  filter_source: "Source",
  filter_sort: "Trier",
  filter_drivetrain: "Transmission",
  filter_autopilot: "Autopilot",
  filter_seats: "Places",
  filter_color: "Couleur",
  filter_filters: "Filtres",
  filter_all: "Tous",
  filter_price: "Prix",
  filter_year: "Année",
  filter_mileage: "Kilométrage",
  filter_new: "Neuf <100 km",
  input_min: "Min",
  input_max: "Max",
  // Sort options
  sort_latest: "Dernière mise à jour",
  sort_price_asc: "Prix ↑",
  sort_price_desc: "Prix ↓",
  sort_mileage_asc: "Km ↑",
  sort_mileage_desc: "Km ↓",
  sort_year_newest: "Année (récente)",
  sort_year_oldest: "Année (ancienne)",
  sort_biggest_drop: "Meilleure baisse",
  // Listings page
  listings_subtitle: "Mis à jour quotidiennement depuis toutes les sources",
  listings_in_stock: "en stock",
  // Cards
  card_view: "Voir",
  card_crawled: "Crawlé le",
  card_new: "Neuf",
  chip_seats: "places",
  // States
  loading: "Chargement…",
  no_listings: "Aucune annonce.",
  // Auth
  sign_in: "Connexion",
  sign_out: "Déconnexion",
  auth_title: "Connexion à TeslaPricing",
  auth_subtitle: "Sauvegardez vos annonces et synchronisez votre liste sur tous vos appareils.",
  auth_google: "Continuer avec Google",
  auth_github: "Continuer avec GitHub",
  auth_x: "Continuer avec X",
  auth_close: "Fermer",
  // Misc
  report_issue: "Signaler un problème",
  save_listing: "Sauvegarder",
  back_to_top: "Retour en haut",
  // ListingDetail
  detail_back: "← Retour",
  spec_year: "Année",
  spec_mileage: "Kilométrage",
  spec_fuel: "Énergie",
  spec_power: "Puissance",
  spec_color: "Couleur",
  spec_doors: "Portes",
  spec_seats: "Places",
  spec_soh: "SoH batterie",
  spec_autopilot: "Autopilot",
  spec_tow_hitch: "Crochet d'attelage",
  spec_location: "Localisation",
  spec_new: "Neuf",
  detail_save: "Sauvegarder",
  detail_remove: "Retirer",
  detail_view_on: "Voir sur",
  price_history: "Évolution du prix",
  price_history_empty: "Pas encore d'historique de prix.",
  price_highest: "prix maximum crawlé",
  photo_alt: "Photo",
  // Dropped
  dropped_title: "Baisses de prix",
  dropped_subtitle: "Annonces dont le prix a récemment baissé, triées par plus forte baisse.",
  dropped_empty: "Aucune baisse de prix dans les dernières {hours}h. Relancez les scrapers.",
  dropped_view: "Voir",
  dropped_24h: "24h",
  dropped_48h: "48h",
  dropped_7d: "7 jours",
  dropped_top: "Meilleures baisses",
  dropped_others: "Autres",
  dropped_label: "Baissé le",
  // Trends
  trends_title: "Tendances",
  trends_subtitle: "Prix moyen par modèle sur toutes les sources crawlées",
  trends_empty: "Pas assez de données — relancez les scrapers pour voir les tendances.",
  trends_listings: "annonces",
  // Saved
  saved_title: "Annonces sauvegardées",
  saved_subtitle_one: "voiture dans vos favoris",
  saved_subtitle_many: "voitures dans vos favoris",
  saved_empty: "Aucune annonce sauvegardée. Cliquez sur l'icône marque-page pour en ajouter.",
  saved_auth_title: "Connectez-vous pour utiliser vos favoris",
  saved_auth_subtitle: "Sauvegardez vos annonces et accédez-y depuis n'importe quel appareil.",
  saved_remove: "Retirer des favoris",
  saved_view: "Voir",
  // Details audit
  details_title: "Audit des données",
  details_subtitle: "Inspectez les champs manquants pour une annonce",
  details_placeholder: "ID de l'annonce…",
  details_inspect: "Inspecter",
  details_field: "Champ",
  details_value: "Valeur",
  details_status: "Statut",
  details_open: "Ouvrir l'annonce ↗",
  details_missing: "manquant",
  details_filled: "champs renseignés",
  details_fields_missing: "champs manquants",
  // Compare
  nav_compare: "Comparer",
  compare_title: "Comparer des annonces",
  compare_subtitle: "Comparaison côte à côte de 3 voitures max",
  compare_empty: "Aucune annonce sélectionnée. Utilisez le bouton ⊕ sur une annonce pour l'ajouter.",
  compare_add: "Ajouter à la comparaison",
  compare_remove: "Retirer",
  compare_clear: "Tout effacer",
  compare_view_btn: "Comparer {n}",
  compare_spec_model: "Modèle",
  compare_spec_year: "Année",
  compare_spec_mileage: "Kilométrage",
  compare_spec_price: "Prix",
  compare_spec_drivetrain: "Transmission",
  compare_spec_autopilot: "Autopilot",
  compare_spec_power: "Puissance",
  compare_spec_color: "Couleur",
  compare_spec_seats: "Places",
  compare_spec_soh: "SoH batterie",
  compare_spec_source: "Source",
  compare_spec_location: "Localisation",
  compare_price_history: "Historique des prix",
  compare_open: "Voir l'annonce",
};

const translations: Record<Lang, Record<TKey, string>> = { en, fr };

type LangContextType = { lang: Lang; setLang: (l: Lang) => void; t: (key: TKey, vars?: Record<string, string | number>) => string };
const LangContext = createContext<LangContextType>({ lang: "en", setLang: () => {}, t: (k) => String(en[k]) });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem("lang");
    return saved === "fr" || saved === "en" ? saved : "en";
  });

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem("lang", l);
  }

  function t(key: TKey, vars?: Record<string, string | number>): string {
    let str: string = translations[lang][key];
    if (vars) Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{${k}}`, String(v)); });
    return str;
  }

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useTranslation() {
  return useContext(LangContext);
}
