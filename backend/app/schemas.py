from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, field_serializer


class ListingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
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
    scraped_at: datetime

    @field_serializer("scraped_at")
    def _serialize_scraped_at(self, v: datetime) -> str:
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()


class PricePoint(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    price_eur: int | None
    recorded_at: datetime

    @field_serializer("recorded_at")
    def _serialize_recorded_at(self, v: datetime) -> str:
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.isoformat()


class ListingIn(BaseModel):
    source: str
    external_id: str
    title: str
    make: str | None = None
    model: str | None = None
    version: str | None = None
    price_eur: int | None = None
    year: int | None = None
    mileage_km: int | None = None
    fuel: str | None = None
    gearbox: str | None = None
    location: str | None = None
    url: str
    image_url: str | None = None
