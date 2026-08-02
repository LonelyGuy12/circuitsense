"""
Vision extraction — converts an uploaded image into a structured Netlist.

Note: Vision extraction requires a multimodal LLM model. If the configured
model does not support image inputs, a VisionUnsupportedError is raised so the
frontend can gracefully suggest manual entry instead.
"""
from __future__ import annotations

import base64
import logging

from models.schemas import NetlistExtractionResponse, NetlistSchema
import llm_client

logger = logging.getLogger(__name__)

# Confidence heuristics based on component count
_MIN_COMPONENTS_HIGH_CONFIDENCE = 2


class VisionUnsupportedError(Exception):
    """Raised when the configured model does not support image/vision inputs."""
    pass


def _assess_confidence(netlist: NetlistSchema) -> str:
    n = len(netlist.components)
    c = len(netlist.connections)
    if n >= _MIN_COMPONENTS_HIGH_CONFIDENCE and c >= n:
        return "high"
    elif n > 0:
        return "medium"
    return "low"


_VISION_UNSUPPORTED_HINTS = (
    "must be a string",         # Groq text-only models
    "not support image",
    "does not support vision",
    "unsupported content type",
    "image_url",
    "404",
)


def _is_vision_unsupported(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(hint in msg for hint in _VISION_UNSUPPORTED_HINTS)


async def extract_netlist_from_upload(
    image_bytes: bytes,
    content_type: str = "image/jpeg",
) -> NetlistExtractionResponse:
    """
    Given raw image bytes, call the vision LLM to extract a netlist.

    Returns a NetlistExtractionResponse with confidence assessment and
    optional extraction notes.

    Raises VisionUnsupportedError if the configured model cannot process images.
    """
    b64 = base64.b64encode(image_bytes).decode("ascii")

    try:
        raw_dict = await llm_client.extract_netlist_from_image(b64, media_type=content_type)
    except Exception as exc:
        if _is_vision_unsupported(exc):
            model = llm_client.VISION_MODEL
            raise VisionUnsupportedError(
                f"The current model ({model!r}) does not support image inputs. "
                "Please use Manual Entry to describe your circuit instead, "
                "or switch to a vision-capable model in llm_client.py."
            ) from exc
        raise

    # Validate into the Pydantic model (raises ValidationError on bad data)
    netlist = NetlistSchema.model_validate(raw_dict)

    confidence = _assess_confidence(netlist)

    notes: str | None = None
    if confidence == "low":
        notes = (
            "The AI extracted very few components. The image may be low quality, "
            "a non-circuit diagram, or too complex. Please review and correct the "
            "component list before running analysis."
        )
    elif confidence == "medium":
        notes = (
            "Extraction confidence is medium. Some connections may be missing. "
            "Please review the netlist before running analysis."
        )

    return NetlistExtractionResponse(
        netlist=netlist,
        confidence=confidence,
        extraction_notes=notes,
    )
