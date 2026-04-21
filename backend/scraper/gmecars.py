"""GMECars listing scraper.

gmecars.fr is a French used-car dealer site. Listing pages are pure
server-rendered HTML with no bot protection, so we fetch with plain
urllib and parse the stable per-listing template with regex — no
Playwright needed.
"""

from __future__ import annotations

import asyncio
import html
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

BASE_URL = "https://www.gmecars.fr"
SEARCH_URL = f"{BASE_URL}/149/vehicules/?marque=94&photos=1"

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


LISTING_RE = re.compile(
    r'<div class="line-car"[^>]*id="svosite_vehicule_ligne_(?P<vid>\d+)"[^>]*>'
    r'(?P<body>.*?)'
    r'(?=<div class="line-car"|<div id="pagination"|</body>)',
    re.DOTALL,
)

HREF_RE = re.compile(r'<a href="(?P<v>[^"]+)"[^>]*class="vehiculeInfos"')
IMG_RE = re.compile(r'<img src="(?P<v>https?://[^"]+)"[^>]*style="visibility:hidden')
BRAND_RE = re.compile(r'<span class="marquemodele"[^>]*><strong>(?P<v>[^<]+)</strong></span>')
VERSION_RE = re.compile(r'<span class="version"[^>]*>(?P<v>[^<]+)</span>')
PICTOCARD_RE = re.compile(r'<div class="pictocard"[^>]*>([^<]+)</div>')
PRICE_RE = re.compile(r'class="encart_prix[^"]*"[^>]*>.*?([\d\s ]+?)\s*(?:&euro;|€)', re.DOTALL)

YEAR_RE = re.compile(r"^(?:19|20)\d{2}$")
KM_RE = re.compile(r"\d[\d\s ]*km", re.I)

GEARBOX_WORDS = {
    "automatique", "automatisee", "automatisée",
    "manuelle", "sequentielle", "séquentielle",
}
FUEL_WORDS = {
    "electrique", "électrique", "essence", "diesel",
    "hybride", "hybride essence", "hybride diesel", "hybride rechargeable",
    "gpl", "e85", "ethanol", "éthanol",
    "hydrogene", "hydrogène",
}


def _parse_int(value: Any) -> int | None:
    if value is None:
        return None
    digits = re.sub(r"[^\d]", "", str(value))
    return int(digits) if digits else None


def _parse_listing(body: str, vid: str) -> ScrapedListing | None:
    href_match = HREF_RE.search(body)
    if not href_match:
        return None
    listing_url = urljoin(BASE_URL, html.unescape(href_match.group("v")))

    img_match = IMG_RE.search(body)
    image_url = img_match.group("v") if img_match else None

    brand_match = BRAND_RE.search(body)
    make: str | None = None
    model: str | None = None
    if brand_match:
        brand_text = html.unescape(brand_match.group("v")).strip()
        if " - " in brand_text:
            make, model = (p.strip() for p in brand_text.split(" - ", 1))
        elif brand_text:
            make = brand_text

    version_match = VERSION_RE.search(body)
    version = html.unescape(version_match.group("v")).strip() if version_match else None

    gearbox: str | None = None
    fuel: str | None = None
    year: int | None = None
    mileage_km: int | None = None
    for raw in PICTOCARD_RE.findall(body):
        value = html.unescape(raw).strip()
        lower = value.lower()
        if YEAR_RE.match(value):
            year = int(value)
        elif KM_RE.match(value):
            mileage_km = _parse_int(value)
        elif lower in GEARBOX_WORDS:
            gearbox = value
        elif lower in FUEL_WORDS:
            fuel = value

    price_eur: int | None = None
    price_match = PRICE_RE.search(body)
    if price_match:
        price_eur = _parse_int(price_match.group(1))

    # Listings priced <= 1000 € on gmecars mean the vehicle is sold
    # (placeholder price on the card); skip them.
    if price_eur is not None and price_eur <= 1000:
        return None

    title_parts = [p for p in (make, model, version) if p]
    title = " ".join(title_parts) if title_parts else vid

    return ScrapedListing(
        source="gmecars",
        external_id=vid,
        title=title,
        make=make.title() if make else None,
        model=model,
        version=version,
        price_eur=price_eur,
        year=year,
        mileage_km=mileage_km,
        fuel=fuel,
        gearbox=gearbox,
        location=None,
        url=listing_url,
        image_url=image_url,
    )


def _parse_page_html(page_html: str) -> list[ScrapedListing]:
    listings: list[ScrapedListing] = []
    seen: set[str] = set()
    for match in LISTING_RE.finditer(page_html):
        vid = match.group("vid")
        if vid in seen:
            continue
        seen.add(vid)
        try:
            listing = _parse_listing(match.group("body"), vid)
            if listing:
                listings.append(listing)
        except Exception as exc:
            print(f"  ! gmecars parse failed for {vid}: {exc}")
    return listings


def _build_page_url(search_url: str, page_num: int) -> str:
    if page_num <= 1:
        return search_url
    parsed = urlparse(search_url)
    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    params["p"] = str(page_num)
    return urlunparse(parsed._replace(query=urlencode(params)))


def _fetch(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "fr-FR,fr;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")


async def scrape(search_url: str = SEARCH_URL, pages: int = 1, debug: bool = False) -> list[ScrapedListing]:
    all_results: list[ScrapedListing] = []
    loop = asyncio.get_running_loop()
    for page_num in range(1, pages + 1):
        url = _build_page_url(search_url, page_num)
        print(f"[gmecars] page {page_num}: {url}")
        try:
            page_html = await loop.run_in_executor(None, _fetch, url)
        except urllib.error.URLError as exc:
            print(f"  ! fetch failed: {exc}")
            continue
        if debug:
            DEBUG_DIR.mkdir(exist_ok=True)
            (DEBUG_DIR / f"gmecars_p{page_num}.html").write_text(page_html, encoding="utf-8")
            print(f"  [debug] saved html to {DEBUG_DIR}/gmecars_p{page_num}.html")
        results = _parse_page_html(page_html)
        print(f"  -> {len(results)} listings")
        all_results.extend(results)
        if page_num < pages:
            await asyncio.sleep(1.5)

    unique: dict[str, ScrapedListing] = {}
    for listing in all_results:
        unique.setdefault(listing.external_id, listing)
    return list(unique.values())


if __name__ == "__main__":
    items = asyncio.run(scrape(pages=1, debug=True))
    for item in items[:5]:
        print(item)
    print(f"Total: {len(items)}")
