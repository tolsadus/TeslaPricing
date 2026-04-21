"""CapCar listing scraper.

CapCar embeds Algolia credentials in a base64 config blob (window.hx) on every page.
We query the Algolia index directly — no Playwright needed.
"""

from __future__ import annotations

import asyncio
import json
import re
import urllib.request
from dataclasses import dataclass
from pathlib import Path

BASE_URL = "https://www.capcar.fr"
SEARCH_URL = f"{BASE_URL}/voiture-occasion?brand%5B0%5D=Tesla"

ALGOLIA_APP_ID = "691K8M71IA"
ALGOLIA_API_KEY = "95874bf3cc96f8de61eced3440501724"
ALGOLIA_INDEX = "production_cars"
ALGOLIA_URL = f"https://{ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/{ALGOLIA_INDEX}/query"

CLOUDINARY_BASE = "https://res.cloudinary.com/lghaauto/image/upload"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"
)

DEBUG_DIR = Path(__file__).resolve().parent.parent / "debug"

HITS_PER_PAGE = 50

ENERGY_MAP = {
    "ELECTRIC": "Électrique",
    "HYBRID": "Hybride",
    "PETROL": "Essence",
    "DIESEL": "Diesel",
}

GEARBOX_MAP = {
    "AUTOMATIC": "Automatique",
    "MANUAL": "Manuelle",
}


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


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[àâä]", "a", text)
    text = re.sub(r"[éèêë]", "e", text)
    text = re.sub(r"[îï]", "i", text)
    text = re.sub(r"[ôö]", "o", text)
    text = re.sub(r"[ùûü]", "u", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def _listing_url(version: str, reference: str) -> str:
    return f"{BASE_URL}/voiture-occasion/{_slugify(version)}/{reference}"


def _image_url(image_id: str | None) -> str | None:
    if not image_id:
        return None
    return f"{CLOUDINARY_BASE}/{image_id}"


def _parse_hit(hit: dict) -> ScrapedListing | None:
    reference = hit.get("reference") or hit.get("objectID")
    if not reference:
        return None

    brand = hit.get("brand") or "Tesla"
    version = hit.get("version") or ""
    package = hit.get("carPackage") or ""

    title_parts = [p for p in (brand, version, package) if p]
    title = " ".join(title_parts)

    city = hit.get("city") or ""
    dept = hit.get("department") or ""
    location_parts = [p for p in (city.title(), dept) if p]
    location = ", ".join(location_parts) or None

    energy_raw = (hit.get("energy") or "").upper()
    gearbox_raw = (hit.get("gearbox") or "").upper()

    return ScrapedListing(
        source="capcar",
        external_id=reference,
        title=title,
        make=brand,
        model=version or None,
        version=package or None,
        price_eur=hit.get("price"),
        year=hit.get("year"),
        mileage_km=hit.get("mileage"),
        fuel=ENERGY_MAP.get(energy_raw, energy_raw.capitalize() or None),
        gearbox=GEARBOX_MAP.get(gearbox_raw, gearbox_raw.capitalize() or None),
        location=location,
        url=_listing_url(version or reference, reference),
        image_url=_image_url(hit.get("imageId")),
    )


def _algolia_query(page: int) -> bytes:
    payload = json.dumps({
        "query": "",
        "filters": "brand:Tesla",
        "hitsPerPage": HITS_PER_PAGE,
        "page": page,
    }).encode()
    req = urllib.request.Request(
        ALGOLIA_URL,
        data=payload,
        method="POST",
        headers={
            "x-algolia-application-id": ALGOLIA_APP_ID,
            "x-algolia-api-key": ALGOLIA_API_KEY,
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


async def scrape(pages: int = 10, debug: bool = False) -> list[ScrapedListing]:
    results: list[ScrapedListing] = []
    loop = asyncio.get_running_loop()
    page = 0

    while True:
        print(f"[capcar] page {page}")
        raw = await loop.run_in_executor(None, _algolia_query, page)
        payload = json.loads(raw)

        if debug:
            DEBUG_DIR.mkdir(exist_ok=True)
            (DEBUG_DIR / f"capcar_p{page}.json").write_bytes(raw)

        hits = payload.get("hits") or []
        nb_pages = payload.get("nbPages", 1)
        print(f"  -> {len(hits)} hits (page {page+1}/{nb_pages})")

        for hit in hits:
            try:
                listing = _parse_hit(hit)
                if listing:
                    results.append(listing)
            except Exception as exc:
                print(f"  ! parse failed for {hit.get('reference')}: {exc}")

        page += 1
        if page >= nb_pages or page >= pages:
            break

        await asyncio.sleep(0.5)

    unique: dict[str, ScrapedListing] = {}
    for listing in results:
        unique.setdefault(listing.external_id, listing)
    return list(unique.values())


if __name__ == "__main__":
    items = asyncio.run(scrape(debug=True))
    for item in items[:5]:
        print(item)
    print(f"Total: {len(items)}")
