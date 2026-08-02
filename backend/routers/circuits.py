"""
Circuits router — all /api/circuits endpoints.
"""
from __future__ import annotations

import json
import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.db_models import CircuitSubmissionDB
from models.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    CircuitListResponse,
    CircuitSubmissionCreate,
    CircuitSubmissionResponse,
    FindingSchema,
    InputMethod,
    NetlistExtractionResponse,
    NetlistSchema,
)
import analyzer
import vision
from vision import VisionUnsupportedError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/circuits", tags=["circuits"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _db_to_response(db: CircuitSubmissionDB) -> CircuitSubmissionResponse:
    netlist_data = json.loads(db.netlist_json) if db.netlist_json else {}
    findings_data = json.loads(db.findings_json) if db.findings_json else []

    return CircuitSubmissionResponse(
        id=db.id,
        created_at=db.created_at,
        input_method=InputMethod(db.input_method),
        image_url=db.image_url,
        netlist=NetlistSchema.model_validate(netlist_data),
        findings=[FindingSchema.model_validate(f) for f in findings_data],
        summary=db.summary,
        analysis_status=db.analysis_status,
    )


def _new_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# POST /api/circuits — create submission (manual or photo)
# ---------------------------------------------------------------------------

@router.post(
    "",
    response_model=CircuitSubmissionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a circuit (manual netlist or photo upload)",
)
async def create_circuit(
    # Manual netlist path
    netlist_json: Optional[str] = Form(None, description="JSON-encoded NetlistSchema for manual entry"),
    # Photo upload path
    image: Optional[UploadFile] = File(None, description="Circuit photo for vision extraction"),
    db: AsyncSession = Depends(get_db),
):
    """
    Accept either:
    - `netlist_json` (form field with JSON string) for manual entry
    - `image` (file upload) for photo-based extraction

    Returns the stored CircuitSubmission. If a photo was uploaded, the
    extracted netlist is included and `analysis_status` is 'pending'
    (run /analyze next). For manual entry, same flow.
    """
    image_url: Optional[str] = None
    input_method = InputMethod.MANUAL
    extraction_response: Optional[NetlistExtractionResponse] = None

    if image is not None:
        # Photo path
        input_method = InputMethod.PHOTO
        image_bytes = await image.read()
        content_type = image.content_type or "image/jpeg"

        try:
            extraction_response = await vision.extract_netlist_from_upload(image_bytes, content_type)
            netlist = extraction_response.netlist
        except VisionUnsupportedError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "VISION_UNSUPPORTED", "message": str(exc)},
            )
        except Exception as exc:
            logger.error("Vision extraction failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Vision extraction failed: {exc}",
            )

    elif netlist_json is not None:
        # Manual path
        try:
            raw = json.loads(netlist_json)
            netlist = NetlistSchema.model_validate(raw)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid netlist JSON: {exc}",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either `netlist_json` (manual) or `image` (photo upload).",
        )

    # Persist to DB
    db_obj = CircuitSubmissionDB(
        id=_new_id(),
        input_method=input_method.value,
        image_url=image_url,
        netlist_json=netlist.model_dump_json(),
        findings_json="[]",
        summary=None,
        analysis_status="pending",
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)

    response = _db_to_response(db_obj)

    # Attach extraction metadata if this was a photo
    if extraction_response is not None:
        response.summary = (
            f"Extraction confidence: {extraction_response.confidence}. "
            + (extraction_response.extraction_notes or "")
        ).strip()

    return response


# ---------------------------------------------------------------------------
# POST /api/circuits/{id}/analyze
# ---------------------------------------------------------------------------

@router.post(
    "/{circuit_id}/analyze",
    response_model=AnalyzeResponse,
    summary="Run Layer A + Layer B analysis on a stored circuit",
)
async def analyze_circuit(
    circuit_id: str,
    req: AnalyzeRequest = AnalyzeRequest(),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CircuitSubmissionDB).where(CircuitSubmissionDB.id == circuit_id))
    db_obj = result.scalar_one_or_none()

    if db_obj is None:
        raise HTTPException(status_code=404, detail="Circuit submission not found")

    db_obj.analysis_status = "running"
    await db.commit()

    netlist_data = json.loads(db_obj.netlist_json)
    netlist = NetlistSchema.model_validate(netlist_data)

    try:
        findings, summary = await analyzer.run_analysis(
            netlist,
            run_layer_a=req.run_layer_a,
            run_layer_b=req.run_layer_b,
        )
        db_obj.findings_json = json.dumps([f.model_dump(mode="json") for f in findings])
        db_obj.summary = summary
        db_obj.analysis_status = "done"
    except Exception as exc:
        logger.error("Analysis failed for %s: %s", circuit_id, exc)
        db_obj.analysis_status = "error"
        db_obj.summary = f"Analysis error: {exc}"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")

    await db.commit()

    return AnalyzeResponse(
        submission_id=circuit_id,
        findings=findings,
        summary=summary,
        analysis_status="done",
    )


# ---------------------------------------------------------------------------
# GET /api/circuits/{id}
# ---------------------------------------------------------------------------

@router.get(
    "/{circuit_id}",
    response_model=CircuitSubmissionResponse,
    summary="Get a circuit submission with full netlist and findings",
)
async def get_circuit(circuit_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CircuitSubmissionDB).where(CircuitSubmissionDB.id == circuit_id))
    db_obj = result.scalar_one_or_none()

    if db_obj is None:
        raise HTTPException(status_code=404, detail="Circuit submission not found")

    return _db_to_response(db_obj)


# ---------------------------------------------------------------------------
# GET /api/circuits
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=CircuitListResponse,
    summary="List all past circuit submissions",
)
async def list_circuits(
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CircuitSubmissionDB)
        .order_by(CircuitSubmissionDB.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = result.scalars().all()
    submissions = [_db_to_response(r) for r in rows]
    return CircuitListResponse(submissions=submissions, total=len(submissions))


# ---------------------------------------------------------------------------
# POST /api/circuits/extract — standalone vision extraction (preview only)
# ---------------------------------------------------------------------------

@router.post(
    "/extract",
    response_model=NetlistExtractionResponse,
    summary="Extract a netlist from an image without storing it",
    tags=["vision"],
)
async def extract_only(image: UploadFile = File(...)):
    """
    Upload an image and get back the extracted netlist for review.
    Does NOT store anything in the database — use POST /api/circuits
    with the reviewed netlist to persist.
    """
    image_bytes = await image.read()
    content_type = image.content_type or "image/jpeg"
    try:
        return await vision.extract_netlist_from_upload(image_bytes, content_type)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
