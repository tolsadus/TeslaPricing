"""mobile.de listing scraper.

mobile.de is a German (also French-localized) car marketplace. Like
LaCentrale and Leboncoin, the SPA fires JSON API calls to populate the
search results, so we intercept those responses rather than scraping
the DOM. Field names follow the mobile.de API conventions
(makeName/modelName, firstRegistration, price.consumerPriceGross, …).
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

BASE_URL = "https://www.mobile.de"
SEARCH_URL = (
    f"{BASE_URL}/fr/voiture/recherche.html"
    "?sb=rel&od=up&vc=Car&ms=135&s=Car&pageNumber=1"
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
    """Walk the payload for listing-like dicts.

    mobile.de listings typically carry an `id` and `makeName`/`modelName`
    alongside `price`/`mileage`/`firstRegistration`.
    """
    id_keys = {"id", "adId", "mobileAdId", "classifiedId"}
    make_keys = {"makeName", "make", "brand", "makeLabel"}
    vehicle_markers = {"price", "priceRange", "mileage", "firstRegistration", "fuelType", "fuel"}
    found: list[dict] = []
    seen: set[str] = set()

    def looks_like_listing(obj: dict) -> bool:
        keys = set(obj.keys())
        if not keys & id_keys:
            return False
        if not keys & make_keys:
            return False
        return bool(keys & vehicle_markers)

    def walk(node: Any):
        if isinstance(node, dict):
            if looks_like_listing(node):
                ident = str(_first(node, *id_keys))
                if ident and ident not in seen:
                    seen.add(ident)
                    found.append(node)
                return
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(payload)
    return found


def _extract_price(ad: dict) -> int | None:
    price = ad.get("price")
    if isinstance(price, dict):
        for key in ("consumerPriceGross", "grossAmount", "amount", "value"):
            if key in price:
                return _parse_int(price[key])
    if isinstance(price, (int, float, str)):
        return _parse_int(price)
    price_range = ad.get("priceRange")
    if isinstance(price_range, dict):
        return _parse_int(price_range.get("from") or price_range.get("min"))
    return None


def _extract_year(ad: dict) -> int | None:
    for key in ("firstRegistration", "firstRegistrationDate", "year"):
        value = ad.get(key)
        if value is None:
            continue
        if isinstance(value, (int, float)):
            return int(value)
        m = re.search(r"(19|20)\d{2}", str(value))
        if m:
            return int(m.group(0))
    return None


def _extract_location(ad: dict) -> str | None:
    seller = ad.get("seller") or ad.get("dealer") or {}
    address = seller.get("address") if isinstance(seller, dict) else None
    if isinstance(address, dict):
        city = address.get("city") or address.get("cityName")
        zipcode = address.get("zipcode") or address.get("zip") or address.get("postalCode")
        country = address.get("country") or address.get("countryCode")
        parts = [p for p in (city, zipcode, country) if p]
        if parts:
            return " ".join(str(p) for p in parts)
    # Flat fallbacks on the listing itself.
    city = _first(ad, "city", "cityName")
    zipcode = _first(ad, "zipcode", "zipCode", "postalCode")
    parts = [p for p in (city, zipcode) if p]
    return " ".join(str(p) for p in parts) or None


def _extract_image(ad: dict) -> str | None:
    images = ad.get("images") or ad.get("media")
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, str):
            return first
        if isinstance(first, dict):
            for key in ("uri", "url", "src", "large", "medium"):
                value = first.get(key)
                if isinstance(value, str):
                    return value
            sizes = first.get("sizes")
            if isinstance(sizes, dict):
                for key in ("L", "M", "S", "XL"):
                    value = sizes.get(key)
                    if isinstance(value, dict) and isinstance(value.get("uri"), str):
                        return value["uri"]
    thumbnail = _first(ad, "thumbnail", "mainImage", "image")
    if isinstance(thumbnail, str):
        return thumbnail
    if isinstance(thumbnail, dict):
        for key in ("uri", "url", "src"):
            if isinstance(thumbnail.get(key), str):
                return thumbnail[key]
    return None


def _ad_to_listing(ad: dict) -> ScrapedListing | None:
    ident = _first(ad, "id", "adId", "mobileAdId", "classifiedId")
    if ident is None:
        return None

    make = _first(ad, "makeName", "make", "brand", "makeLabel")
    model = _first(ad, "modelName", "model", "modelLabel")
    version = _first(ad, "modelDescription", "description", "variant", "trim")

    title = _first(ad, "title", "headline", "shortDescription")
    if not title:
        title_parts = [str(p) for p in (make, model, version) if p]
        title = " ".join(title_parts) or str(ident)

    price_eur = _extract_price(ad)
    year = _extract_year(ad)
    mileage_km = _parse_int(_first(ad, "mileage", "km"))
    fuel = _first(ad, "fuelType", "fuel", "fuelLabel")
    gearbox = _first(ad, "gearbox", "transmission", "gearboxLabel")
    location = _extract_location(ad)

    detail_url = _first(ad, "detailPageUrl", "url", "detailUrl", "link")
    if isinstance(detail_url, str):
        url = urljoin(BASE_URL, detail_url)
    else:
        url = f"{BASE_URL}/fr/voiture/details.html?id={ident}"

    image_url = _extract_image(ad)

    return ScrapedListing(
        source="mobile_de",
        external_id=str(ident),
        title=str(title).strip(),
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


async def _extract_next_f_chunks(page) -> list[Any]:
    """Read `self.__next_f` from the page and parse each RSC chunk.

    mobile.de is a Next.js App Router site: listing data is streamed into
    `self.__next_f` as entries shaped like `[1, "N:<json>"]`. We decode
    each data string as JSON (dropping the `N:` prefix) and return the
    parsed payloads — any listing objects live somewhere inside these.
    """
    raw_chunks: list[str] = await page.evaluate(
        """
        () => {
          if (!self.__next_f || !Array.isArray(self.__next_f)) return [];
          return self.__next_f
            .filter(c => Array.isArray(c) && typeof c[1] === 'string')
            .map(c => c[1]);
        }
        """
    )

    parsed: list[Any] = []
    for chunk in raw_chunks:
        # RSC chunks typically look like "N:<payload>" where <payload> is
        # usually JSON (object or array). Strip the prefix, then try JSON.
        m = re.match(r"^[0-9a-fA-F]+:(.*)$", chunk, re.DOTALL)
        body = m.group(1) if m else chunk
        body = body.strip()
        if not body:
            continue
        if body[0] not in "{[":
            continue
        try:
            parsed.append(json.loads(body))
        except json.JSONDecodeError:
            # Some chunks include RSC reference markers like "$" that aren't
            # valid JSON — skip silently, there are many chunks.
            continue
    return parsed


async def _scrape_page(browser: Browser, url: str, debug: bool = False) -> list[ScrapedListing]:
    context = await browser.new_context(
        user_agent=USER_AGENT,
        viewport={"width": 1440, "height": 900},
        locale="fr-FR",
    )
    page = await context.new_page()

    captured_payloads: list[tuple[str, Any]] = []

    async def on_response(response: Response) -> None:
        try:
            req_url = response.url
            if "mobile.de" not in req_url:
                return
            ctype = (response.headers or {}).get("content-type", "")
            if "json" not in ctype:
                return
            if not any(k in req_url for k in ("search", "listing", "api", "graphql", "ads")):
                return
            try:
                data = await response.json()
            except Exception:
                return
            captured_payloads.append((req_url, data))
        except Exception:
            pass

    page.on("response", lambda r: asyncio.create_task(on_response(r)))

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_timeout(random.randint(1500, 3000))
        try:
            await page.get_by_role(
                "button", name=re.compile("accepter|accept|tout accepter|akzeptieren", re.I)
            ).click(timeout=2000)
        except Exception:
            pass
        try:
            await page.wait_for_load_state("networkidle", timeout=12_000)
        except Exception:
            pass
        await page.wait_for_timeout(random.randint(1000, 2000))

        next_f_payloads = await _extract_next_f_chunks(page)

        if debug:
            DEBUG_DIR.mkdir(exist_ok=True)
            await page.screenshot(path=str(DEBUG_DIR / "mobile_de.png"), full_page=True)
            (DEBUG_DIR / "mobile_de.html").write_text(await page.content(), encoding="utf-8")
            for i, (req_url, payload) in enumerate(captured_payloads):
                (DEBUG_DIR / f"mobile_de_api_{i:02d}.json").write_text(
                    f"// {req_url}\n" + json.dumps(payload, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
            (DEBUG_DIR / "mobile_de_next_f.json").write_text(
                json.dumps(next_f_payloads, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(
                f"  [debug] saved screenshot, html, "
                f"{len(captured_payloads)} api payload(s), "
                f"{len(next_f_payloads)} next_f chunk(s) to {DEBUG_DIR}"
            )

        ads: list[dict] = []
        for _, payload in captured_payloads:
            ads.extend(_find_listings(payload))
        for payload in next_f_payloads:
            ads.extend(_find_listings(payload))

        unique: dict[str, dict] = {}
        for ad in ads:
            ident = _first(ad, "id", "adId", "mobileAdId", "classifiedId")
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


def _paginate(search_url: str, page_num: int) -> str:
    # mobile.de uses pageNumber=N in the querystring.
    if "pageNumber=" in search_url:
        return re.sub(r"pageNumber=\d+", f"pageNumber={page_num}", search_url)
    sep = "&" if "?" in search_url else "?"
    return f"{search_url}{sep}pageNumber={page_num}"


async def scrape(search_url: str = SEARCH_URL, pages: int = 1, debug: bool = False) -> list[ScrapedListing]:
    all_results: list[ScrapedListing] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=not debug)
        try:
            for page_num in range(1, pages + 1):
                url = _paginate(search_url, page_num)
                print(f"[mobile_de] page {page_num}: {url}")
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
