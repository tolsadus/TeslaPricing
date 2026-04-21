"""LaCentrale listing scraper.

LaCentrale is a SPA fronted by Datadome. Instead of guessing CSS
selectors we intercept the JSON API responses the frontend fires when
loading a search, and parse listings from those payloads. This is the
same approach that worked for Leboncoin.

If Datadome shows a challenge, run with `--debug` — the browser opens
visibly so you can solve it by hand, and the search will load afterwards.
"""

from __future__ import annotations

import asyncio
import json
import random
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

from playwright.async_api import Browser, Response, async_playwright

BASE_URL = "https://www.lacentrale.fr"
SEARCH_URL = (
    f"{BASE_URL}/listing"
    "?makesModelsCommercialNames=TESLA%3A%3AMODEL%203"
    "&sortBy=priceAsc"
)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)

DEBUG_DIR = Path(__file__).resolve().parent.parent / "debug"


@dataclass
class ScrapedListing:
    source: str
    external_id: str
    title: str
    make: str | None
    model: str | None
    version: str | None
    price_eur: int | None
    year: int | None
    mileage_km: int | None
    fuel: str | None
    gearbox: str | None
    location: str | None
    url: str
    image_url: str | None


def _parse_int(value: Any) -> int | None:
    if value is None:
        return None
    digits = re.sub(r"[^\d]", "", str(value))
    return int(digits) if digits else None


def _first(node: dict, *keys: str) -> Any:
    for key in keys:
        if key in node and node[key] not in (None, ""):
            return node[key]
    return None


def _find_listings(payload: Any) -> list[dict]:
    """Walk the JSON tree looking for an array of listing-like dicts.

    LaCentrale has changed the nesting of search results several times
    (hits, classifieds, results, vehicles, items...). A recursive search
    for arrays of objects with listing-y keys is more resilient than
    hard-coding a path.
    """
    listing_keys = {"classified_id", "classifiedId", "adId", "ad_id", "id"}
    title_keys = {"title", "commercialName", "model", "make", "brand"}
    found: list[dict] = []
    seen_ids: set[str] = set()

    def looks_like_listing(obj: dict) -> bool:
        keys = set(obj.keys())
        if not keys & listing_keys:
            return False
        if not keys & title_keys:
            return False
        # A listing should have at least one price-ish or vehicle-ish field.
        vehicle_markers = {"price", "customerPrice", "mileage", "km", "year", "energy", "fuel"}
        return bool(keys & vehicle_markers)

    def walk(node: Any):
        if isinstance(node, dict):
            if looks_like_listing(node):
                ident = str(_first(node, "classified_id", "classifiedId", "adId", "ad_id", "id"))
                if ident and ident not in seen_ids:
                    seen_ids.add(ident)
                    found.append(node)
                return
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(payload)
    return found


def _extract_image_url(ad: dict) -> str | None:
    for key in ("mainPhoto", "photo", "thumbnail", "image"):
        value = ad.get(key)
        if isinstance(value, str) and value.startswith("http"):
            return value
        if isinstance(value, dict):
            for sub in ("url", "src", "large", "medium", "small"):
                if isinstance(value.get(sub), str):
                    return value[sub]

    photos = ad.get("photos") or ad.get("thumbnails") or ad.get("images")
    if isinstance(photos, list) and photos:
        first = photos[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            for sub in ("url", "src", "large", "medium", "small"):
                if isinstance(first.get(sub), str):
                    return first[sub]
    return None


def _ad_to_listing(ad: dict) -> ScrapedListing | None:
    ident = _first(ad, "classified_id", "classifiedId", "adId", "ad_id", "id")
    if ident is None:
        return None

    make = _first(ad, "make", "brand")
    model = _first(ad, "model")
    version = _first(ad, "version", "commercialName", "trim")
    title_parts = [str(p) for p in (make, model, version) if p]
    title = _first(ad, "title") or " ".join(title_parts)

    price_eur = _parse_int(_first(ad, "customerPrice", "price", "priceValue"))
    year = _parse_int(_first(ad, "year", "firstRegistrationYear"))
    if year is None:
        reg = _first(ad, "registration_date", "firstRegistrationDate", "registrationDate")
        if isinstance(reg, str):
            m = re.search(r"(19|20)\d{2}", reg)
            if m:
                year = int(m.group(0))

    mileage_km = _parse_int(_first(ad, "mileage", "km", "kilometers"))
    fuel = _first(ad, "energy", "fuel", "energyLabel")
    gearbox = _first(ad, "gearbox", "transmission")

    city = _first(ad, "city", "cityLabel")
    zipcode = _first(ad, "zipCode", "zipcode", "postalCode")
    location = " ".join(str(p) for p in (city, zipcode) if p) or None

    detail_url = _first(ad, "urlDetail", "url", "link", "detailUrl")
    if isinstance(detail_url, str):
        url = urljoin(BASE_URL, detail_url)
    else:
        url = f"{BASE_URL}/auto-occasion-annonce-{ident}.html"

    image_url = _extract_image_url(ad)

    return ScrapedListing(
        source="lacentrale",
        external_id=str(ident),
        title=title.strip() if title else str(ident),
        make=str(make).title() if make else None,
        model=str(model).title() if model else None,
        version=str(version) if version else None,
        price_eur=price_eur,
        year=year,
        mileage_km=mileage_km,
        fuel=str(fuel) if fuel else None,
        gearbox=str(gearbox) if gearbox else None,
        location=location,
        url=url,
        image_url=image_url,
    )


async def _scrape_page(browser: Browser, url: str, debug: bool = False) -> list[ScrapedListing]:
    context = await browser.new_context(
        user_agent=USER_AGENT,
        viewport={"width": 1440, "height": 900},
        locale="fr-FR",
    )
    page = await context.new_page()

    captured_payloads: list[tuple[str, dict]] = []

    async def on_response(response: Response) -> None:
        try:
            req_url = response.url
            if "lacentrale" not in req_url:
                return
            ctype = (response.headers or {}).get("content-type", "")
            if "json" not in ctype:
                return
            # Search / listing API endpoints: keep the filter loose.
            if not any(k in req_url for k in ("search", "listing", "classified", "/api/", "graphql")):
                return
            try:
                data = await response.json()
            except Exception:
                return
            if isinstance(data, (dict, list)):
                captured_payloads.append((req_url, data))
        except Exception:
            pass

    page.on("response", lambda r: asyncio.create_task(on_response(r)))

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_timeout(random.randint(1500, 3000))
        try:
            await page.get_by_role("button", name=re.compile("accepter|accept|tout accepter", re.I)).click(timeout=2000)
        except Exception:
            pass
        try:
            await page.wait_for_load_state("networkidle", timeout=12_000)
        except Exception:
            pass
        await page.wait_for_timeout(random.randint(1000, 2000))

        if debug:
            DEBUG_DIR.mkdir(exist_ok=True)
            await page.screenshot(path=str(DEBUG_DIR / "lacentrale.png"), full_page=True)
            (DEBUG_DIR / "lacentrale.html").write_text(await page.content(), encoding="utf-8")
            for i, (req_url, payload) in enumerate(captured_payloads):
                (DEBUG_DIR / f"lacentrale_api_{i:02d}.json").write_text(
                    f"// {req_url}\n" + json.dumps(payload, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            print(
                f"  [debug] saved screenshot, html, "
                f"{len(captured_payloads)} api payload(s) to {DEBUG_DIR}"
            )

        ads: list[dict] = []
        for _, payload in captured_payloads:
            ads.extend(_find_listings(payload))

        # Dedupe by external id (same ad can appear across multiple API calls).
        unique: dict[str, dict] = {}
        for ad in ads:
            ident = _first(ad, "classified_id", "classifiedId", "adId", "ad_id", "id")
            if ident is not None:
                unique.setdefault(str(ident), ad)

        listings: list[ScrapedListing] = []
        for ad in unique.values():
            try:
                listing = _ad_to_listing(ad)
                if listing:
                    listings.append(listing)
            except Exception as exc:
                print(f"  ! ad parse failed: {exc}")
        return listings
    finally:
        await context.close()


async def scrape(search_url: str = SEARCH_URL, pages: int = 1, debug: bool = False) -> list[ScrapedListing]:
    all_results: list[ScrapedListing] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=not debug)
        try:
            for page_num in range(1, pages + 1):
                if page_num == 1:
                    url = search_url
                else:
                    sep = "&" if "?" in search_url else "?"
                    url = f"{search_url}{sep}page={page_num}"
                print(f"[lacentrale] page {page_num}: {url}")
                results = await _scrape_page(browser, url, debug=debug)
                print(f"  -> {len(results)} listings")
                all_results.extend(results)
                if page_num < pages:
                    await asyncio.sleep(random.uniform(3, 6))
        finally:
            await browser.close()
    return all_results


if __name__ == "__main__":
    listings = asyncio.run(scrape(pages=1, debug=True))
    for listing in listings[:5]:
        print(listing)
    print(f"Total: {len(listings)}")
