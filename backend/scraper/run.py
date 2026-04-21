"""CLI entry point: scrape a source and persist to SQLite.

Usage:
    python3 -m scraper.run lacentrale --pages 2
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

import typer
from sqlalchemy import select, tuple_
from sqlalchemy.dialects.sqlite import insert

from app.db import SessionLocal, init_db
from app.models import Listing, PriceHistory

app = typer.Typer(help="Crawsla scraper runner")


def _upsert(session, rows: list[dict]) -> int:
    if not rows:
        return 0

    keys = [(r["source"], r["external_id"]) for r in rows]
    prior = {
        (r.source, r.external_id): r.price_eur
        for r in session.execute(
            select(Listing.source, Listing.external_id, Listing.price_eur).where(
                tuple_(Listing.source, Listing.external_id).in_(keys)
            )
        ).all()
    }

    stmt = insert(Listing).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["source", "external_id"],
        set_={
            "title": stmt.excluded.title,
            "price_eur": stmt.excluded.price_eur,
            "year": stmt.excluded.year,
            "mileage_km": stmt.excluded.mileage_km,
            "fuel": stmt.excluded.fuel,
            "gearbox": stmt.excluded.gearbox,
            "location": stmt.excluded.location,
            "url": stmt.excluded.url,
            "image_url": stmt.excluded.image_url,
            "scraped_at": stmt.excluded.scraped_at,
        },
    )
    session.execute(stmt)
    session.flush()

    id_map = {
        (r.source, r.external_id): r.id
        for r in session.execute(
            select(Listing.source, Listing.external_id, Listing.id).where(
                tuple_(Listing.source, Listing.external_id).in_(keys)
            )
        ).all()
    }

    history_rows = []
    for r in rows:
        key = (r["source"], r["external_id"])
        new_price = r["price_eur"]
        if key not in prior or prior[key] != new_price:
            history_rows.append(
                {
                    "listing_id": id_map[key],
                    "price_eur": new_price,
                    "recorded_at": r["scraped_at"],
                }
            )

    if history_rows:
        session.execute(insert(PriceHistory).values(history_rows))

    session.commit()
    return len(rows)


@app.command()
def lacentrale(
    pages: int = typer.Option(1, help="Number of search-result pages to scrape"),
    url: str = typer.Option(None, help="Override search URL"),
    debug: bool = typer.Option(False, help="Run headful, save screenshot and HTML to backend/debug/"),
):
    """Scrape LaCentrale search results and store in SQLite."""
    from scraper.lacentrale import SEARCH_URL, scrape

    init_db()
    target_url = url or SEARCH_URL
    listings = asyncio.run(scrape(search_url=target_url, pages=pages, debug=debug))

    now = datetime.now(UTC)
    rows = [{**asdict(listing), "scraped_at": now} for listing in listings]
    with SessionLocal() as session:
        n = _upsert(session, rows)

    typer.echo(f"Upserted {n} listings from lacentrale.")


@app.command()
def leboncoin(
    pages: int = typer.Option(1, help="Number of search-result pages to scrape"),
    url: str = typer.Option(None, help="Override search URL"),
    debug: bool = typer.Option(False, help="Run headful, dump screenshot + __NEXT_DATA__ to backend/debug/"),
):
    """Scrape Leboncoin search results and store in SQLite."""
    from scraper.leboncoin import SEARCH_URL, scrape

    init_db()
    target_url = url or SEARCH_URL
    listings = asyncio.run(scrape(search_url=target_url, pages=pages, debug=debug))

    now = datetime.now(UTC)
    rows = [{**asdict(listing), "scraped_at": now} for listing in listings]
    with SessionLocal() as session:
        n = _upsert(session, rows)

    typer.echo(f"Upserted {n} listings from leboncoin.")


@app.command()
def gmecars(
    pages: int = typer.Option(1, help="Number of search-result pages to scrape"),
    url: str = typer.Option(None, help="Override search URL"),
    debug: bool = typer.Option(False, help="Dump fetched HTML to backend/debug/"),
):
    """Scrape GMECars search results and store in SQLite."""
    from scraper.gmecars import SEARCH_URL, scrape

    init_db()
    target_url = url or SEARCH_URL
    listings = asyncio.run(scrape(search_url=target_url, pages=pages, debug=debug))

    now = datetime.now(UTC)
    rows = [{**asdict(listing), "scraped_at": now} for listing in listings]
    with SessionLocal() as session:
        n = _upsert(session, rows)

    typer.echo(f"Upserted {n} listings from gmecars.")


@app.command("mobile-de")
def mobile_de(
    pages: int = typer.Option(1, help="Number of search-result pages to scrape"),
    url: str = typer.Option(None, help="Override search URL"),
    debug: bool = typer.Option(False, help="Run headful, dump screenshot + API payloads to backend/debug/"),
):
    """Scrape mobile.de search results and store in SQLite."""
    from scraper.mobile_de import SEARCH_URL, scrape

    init_db()
    target_url = url or SEARCH_URL
    listings = asyncio.run(scrape(search_url=target_url, pages=pages, debug=debug))

    now = datetime.now(UTC)
    rows = [{**asdict(listing), "scraped_at": now} for listing in listings]
    with SessionLocal() as session:
        n = _upsert(session, rows)

    typer.echo(f"Upserted {n} listings from mobile.de.")


@app.command()
def capcar(
    pages: int = typer.Option(10, help="Max pages to fetch from Algolia (50 hits/page)"),
    debug: bool = typer.Option(False, help="Dump raw Algolia JSON to backend/debug/"),
):
    """Scrape CapCar Tesla listings via Algolia and store in SQLite."""
    from scraper.capcar import scrape

    init_db()
    listings = asyncio.run(scrape(pages=pages, debug=debug))

    now = datetime.now(UTC)
    rows = [{**asdict(listing), "scraped_at": now} for listing in listings]
    with SessionLocal() as session:
        n = _upsert(session, rows)

    typer.echo(f"Upserted {n} listings from capcar.")


@app.command()
def tesla(
    models: str = typer.Option("m3,my,ms,mx", help="Comma-separated model codes to fetch (m3,my,ms,mx)"),
    debug: bool = typer.Option(False, help="Print raw Node output"),
):
    """Fetch Tesla inventory via tesla-inventory npm package and store in SQLite."""
    import subprocess

    init_db()
    script = Path(__file__).resolve().parent.parent / "tesla_scrape.js"
    cmd = ["node", str(script)] + models.split(",")
    result = subprocess.run(cmd, capture_output=not debug, text=True)
    if result.returncode != 0:
        if not debug:
            typer.echo(result.stdout)
            typer.echo(result.stderr, err=True)
        raise typer.Exit(result.returncode)
    if not debug:
        typer.echo(result.stdout)


if __name__ == "__main__":
    app()
