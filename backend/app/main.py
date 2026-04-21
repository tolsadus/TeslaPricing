from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import nulls_last, select
from sqlalchemy.orm import Session

from app.db import get_db, init_db
from app.models import Listing, ListingPhoto, PriceHistory
from app.schemas import ListingOut, PricePoint

app = FastAPI(title="Crawsla API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    init_db()
    _backfill_price_history()


def _backfill_price_history() -> None:
    from sqlalchemy import func

    from app.db import SessionLocal

    with SessionLocal() as db:
        if db.scalar(select(func.count(PriceHistory.id))):
            return
        listings = db.execute(
            select(Listing.id, Listing.price_eur, Listing.scraped_at)
        ).all()
        if not listings:
            return
        db.add_all(
            PriceHistory(listing_id=l.id, price_eur=l.price_eur, recorded_at=l.scraped_at)
            for l in listings
        )
        db.commit()


SORT_COLUMNS = {
    "scraped_at": Listing.scraped_at,
    "mileage_km": Listing.mileage_km,
    "year": Listing.year,
    "price": Listing.price_eur,
}


@app.get("/api/listings", response_model=list[ListingOut])
def list_listings(
    db: Annotated[Session, Depends(get_db)],
    make: str | None = None,
    model: str | None = None,
    min_price: int | None = Query(None, ge=0),
    max_price: int | None = Query(None, ge=0),
    min_year: int | None = Query(None, ge=1950),
    max_year: int | None = Query(None, le=2100),
    source: str | None = None,
    sort_by: Literal["scraped_at", "mileage_km", "year", "price"] = "scraped_at",
    sort_dir: Literal["asc", "desc"] = "desc",
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    column = SORT_COLUMNS[sort_by]
    order = column.asc() if sort_dir == "asc" else column.desc()
    stmt = select(Listing).order_by(nulls_last(order), Listing.id.desc())

    if make:
        stmt = stmt.where(Listing.make.ilike(f"%{make}%"))
    if model:
        stmt = stmt.where(Listing.model.ilike(f"%{model}%"))
    if min_price is not None:
        stmt = stmt.where(Listing.price_eur >= min_price)
    if max_price is not None:
        stmt = stmt.where(Listing.price_eur <= max_price)
    if min_year is not None:
        stmt = stmt.where(Listing.year >= min_year)
    if max_year is not None:
        stmt = stmt.where(Listing.year <= max_year)
    if source:
        stmt = stmt.where(Listing.source == source)

    stmt = stmt.limit(limit).offset(offset)
    return list(db.scalars(stmt))


@app.get("/api/listings/{listing_id}", response_model=ListingOut)
def get_listing(listing_id: int, db: Annotated[Session, Depends(get_db)]):
    listing = db.get(Listing, listing_id)
    if not listing:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


@app.get("/api/listings/{listing_id}/photos", response_model=list[str])
def get_photos(listing_id: int, db: Annotated[Session, Depends(get_db)]):
    rows = db.execute(
        select(ListingPhoto.url)
        .where(ListingPhoto.listing_id == listing_id)
        .order_by(ListingPhoto.sort_order)
    ).scalars().all()
    return list(rows)


@app.get("/api/listings/{listing_id}/price-history", response_model=list[PricePoint])
def get_price_history(listing_id: int, db: Annotated[Session, Depends(get_db)]):
    stmt = (
        select(PriceHistory.price_eur, PriceHistory.recorded_at)
        .where(PriceHistory.listing_id == listing_id)
        .order_by(PriceHistory.recorded_at.asc())
    )
    rows = db.execute(stmt).all()
    return [{"price_eur": r.price_eur, "recorded_at": r.recorded_at} for r in rows]


@app.get("/api/stats")
def stats(db: Annotated[Session, Depends(get_db)]):
    from sqlalchemy import func

    total = db.scalar(select(func.count(Listing.id))) or 0
    by_source = db.execute(
        select(Listing.source, func.count(Listing.id)).group_by(Listing.source)
    ).all()
    return {"total": total, "by_source": {src: n for src, n in by_source}}
