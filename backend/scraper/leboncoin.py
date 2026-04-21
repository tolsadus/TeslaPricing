"""Leboncoin listing scraper.

Leboncoin is a Next.js site that embeds the full search result payload
in a `__NEXT_DATA__` script tag. We parse that JSON directly — far more
robust than CSS selectors. Datadome still fronts the site, so we still
need a real browser to reach the page.
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

BASE_URL = "https://www.leboncoin.fr"
SEARCH_URL = f"{BASE_URL}/recherche?category=2&u_car_brand=TESLA"

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


def _attr(attrs: list[dict], key: str) -> str | None:
    for attr in attrs or []:
        if attr.get("key") == key:
            value = attr.get("value") or attr.get("value_label")
            if value is not None:
                return str(value)
    return None


def _parse_int(text: str | None) -> int | None:
    if text is None:
        return None
    digits = re.sub(r"[^\d]", "", str(text))
    return int(digits) if digits else None


def _find_ads(payload: Any) -> list[dict]:
    """Walk the __NEXT_DATA__ tree looking for the ads array.

    Leboncoin nests the ads under several possible keys depending on the
    page layout; a recursive search is more resilient than hard-coding
    a path.
    """
    found: list[dict] = []

    def walk(node: Any):
        if isinstance(node, dict):
            if "ads" in node and isinstance(node["ads"], list) and node["ads"]:
                first = node["ads"][0]
                if isinstance(first, dict) and ("list_id" in first or "subject" in first):
                    found.extend(node["ads"])
                    return
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(payload)
    return found


def _ad_to_listing(ad: dict) -> ScrapedListing | None:
    list_id = ad.get("list_id")
    if list_id is None:
        return None

    title = (ad.get("subject") or "").strip()

    price = ad.get("price")
    if isinstance(price, list):
        price_eur = price[0] if price else None
    else:
        price_eur = price
    price_eur = _parse_int(str(price_eur)) if price_eur is not None else None

    attrs = ad.get("attributes") or []
    make = _attr(attrs, "brand")
    model = _attr(attrs, "model")
    year = _parse_int(_attr(attrs, "regdate"))
    mileage_km = _parse_int(_attr(attrs, "mileage"))
    fuel = _attr(attrs, "fuel")
    gearbox = _attr(attrs, "gearbox")

    location_obj = ad.get("location") or {}
    location_parts = [location_obj.get("city"), location_obj.get("zipcode")]
    location = " ".join(p for p in location_parts if p) or None

    url = ad.get("url") or urljoin(BASE_URL, f"/ad/voitures/{list_id}")

    images = ad.get("images") or {}
    urls = images.get("urls") or []
    image_url = urls[0] if urls else images.get("thumb_url")

    return ScrapedListing(
        source="leboncoin",
        external_id=str(list_id),
        title=title,
        make=(make or "").title() or None,
        model=(model or "").title() or None,
        version=None,
        price_eur=price_eur,
        year=year,
        mileage_km=mileage_km,
        fuel=fuel,
        gearbox=gearbox,
        location=location,
        url=url,
        image_url=image_url,
    )


async def _scrape_page(browser: Browser, url: str, debug: bool = False) -> list[ScrapedListing]:
    context = await browser.new_context(
        user_agent=USER_AGENT,
        viewport={"width": 1440, "height": 900},
        locale="fr-FR",
        java_script_enabled=True,
    )
    await context.add_init_script(_STEALTH_SCRIPT)
    page = await context.new_page()

    # Capture JSON responses that look like search-result payloads.
    captured_payloads: list[dict] = []

    async def on_response(response: Response) -> None:
        try:
            req_url = response.url
            if "leboncoin" not in req_url:
                return
            ctype = (response.headers or {}).get("content-type", "")
            if "json" not in ctype:
                return
            # Search API responses live under /finder/search or similar.
            if not any(k in req_url for k in ("/finder/", "/search", "/ads", "/listing")):
                return
            try:
                data = await response.json()
            except Exception:
                return
            if isinstance(data, dict):
                captured_payloads.append(data)
        except Exception:
            pass

    page.on("response", lambda r: asyncio.create_task(on_response(r)))

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        await page.wait_for_timeout(random.randint(1500, 3000))
        try:
            await page.get_by_role("button", name=re.compile("accepter|accept", re.I)).click(timeout=2000)
        except Exception:
            pass
        # Let the search request fire and settle.
        try:
            await page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass
        await page.wait_for_timeout(random.randint(1000, 2000))

        # Also grab __NEXT_DATA__ if it exists — legacy path, harmless if absent.
        next_raw = None
        try:
            if await page.locator("script#__NEXT_DATA__").count():
                next_raw = await page.locator("script#__NEXT_DATA__").first.text_content()
        except Exception:
            next_raw = None

        if debug:
            DEBUG_DIR.mkdir(exist_ok=True)
            await page.screenshot(path=str(DEBUG_DIR / "leboncoin.png"), full_page=True)
            (DEBUG_DIR / "leboncoin.html").write_text(await page.content(), encoding="utf-8")
            for i, payload in enumerate(captured_payloads):
                (DEBUG_DIR / f"leboncoin_api_{i:02d}.json").write_text(
                    json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
                )
            if next_raw:
                (DEBUG_DIR / "leboncoin_next.json").write_text(next_raw, encoding="utf-8")
            print(
                f"  [debug] saved screenshot, html, "
                f"{len(captured_payloads)} api payload(s){' + next.json' if next_raw else ''} to {DEBUG_DIR}"
            )

        ads: list[dict] = []
        for payload in captured_payloads:
            ads.extend(_find_ads(payload))

        if not ads and next_raw:
            try:
                ads.extend(_find_ads(json.loads(next_raw)))
            except json.JSONDecodeError:
                pass

        listings: list[ScrapedListing] = []
        for ad in ads:
            try:
                listing = _ad_to_listing(ad)
                if listing:
                    listings.append(listing)
            except Exception as exc:
                print(f"  ! ad parse failed: {exc}")
        return listings
    finally:
        await context.close()


_STEALTH_ARGS = [
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-infobars",
    "--window-size=1440,900",
]

_STEALTH_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3,4,5]});
Object.defineProperty(navigator, 'languages', {get: () => ['fr-FR', 'fr', 'en-US', 'en']});
window.chrome = {runtime: {}};
"""


async def scrape(search_url: str = SEARCH_URL, pages: int = 1, debug: bool = False) -> list[ScrapedListing]:
    all_results: list[ScrapedListing] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=_STEALTH_ARGS)
        try:
            for page_num in range(1, pages + 1):
                if page_num == 1:
                    url = search_url
                else:
                    sep = "&" if "?" in search_url else "?"
                    url = f"{search_url}{sep}page={page_num}"
                print(f"[leboncoin] page {page_num}: {url}")
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
