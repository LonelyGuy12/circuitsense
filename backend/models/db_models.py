"""
SQLAlchemy ORM models for CircuitSense.

Uses JSON columns to store the nested netlist and findings structures,
keeping the schema simple while retaining full queryability of top-level fields.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String, Text
from sqlalchemy.orm import DeclarativeBase


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class CircuitSubmissionDB(Base):
    __tablename__ = "circuit_submissions"

    id: str = Column(String, primary_key=True, default=_new_uuid)
    created_at: datetime = Column(DateTime(timezone=True), default=_now_utc, nullable=False)
    input_method: str = Column(String, nullable=False, default="manual")
    image_url: str | None = Column(String, nullable=True)

    # Serialised JSON blobs
    netlist_json: str = Column(Text, nullable=False, default="{}")
    findings_json: str = Column(Text, nullable=False, default="[]")
    summary: str | None = Column(Text, nullable=True)
    analysis_status: str = Column(String, nullable=False, default="pending")
