"""
NVIDIA NIM LLM client — single module for all AI calls.

Uses NVIDIA's OpenAI-compatible endpoint so the request format is identical.
Swap model names here without touching any business logic:
  VISION_MODEL    → used for image → netlist extraction (must be multimodal)
  REASONING_MODEL → used for Layer B security analysis
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# NVIDIA NIM OpenAI-compatible base URL
NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"

# ---------------------------------------------------------------------------
# Model configuration — change here to swap models
# ---------------------------------------------------------------------------
VISION_MODEL    = "meta/llama-3.2-90b-vision-instruct"  # best vision model on NIM
REASONING_MODEL = "meta/llama-3.3-70b-instruct"          # strong reasoning for security analysis



def _get_api_key() -> str:
    key = os.environ.get("NVIDIA_API_KEY", "")
    if not key:
        raise EnvironmentError(
            "NVIDIA_API_KEY environment variable is not set. "
            "Set it before running the server."
        )
    return key


def _strip_code_fences(text: str) -> str:
    """Remove markdown code fences (```json ... ```) if present."""
    text = text.strip()
    # Remove leading fence with optional language tag
    text = re.sub(r"^```(?:json)?\s*\n?", "", text, flags=re.IGNORECASE)
    # Remove trailing fence
    text = re.sub(r"\n?```\s*$", "", text)
    return text.strip()


async def chat_completion(
    messages: list[dict],
    model: str,
    temperature: float = 0.2,
    max_tokens: int = 4096,
    max_retries: int = 3,
) -> str:
    """
    Async call to Google AI Studio chat completions with retry on 429.
    Returns the raw text content of the first choice.
    Raises httpx.HTTPStatusError on non-2xx responses after all retries.
    """
    headers = {
        "Authorization": f"Bearer {_get_api_key()}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    last_exc: Exception | None = None
    for attempt in range(max_retries):
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{NVIDIA_NIM_BASE_URL}/chat/completions",
                headers=headers,
                json=payload,
            )

        if resp.status_code == 429:
            wait = 2 ** attempt  # 1s, 2s, 4s
            logger.warning("Rate limited (429) — retrying in %ds (attempt %d/%d)", wait, attempt + 1, max_retries)
            await asyncio.sleep(wait)
            last_exc = httpx.HTTPStatusError(
                f"429 Too Many Requests", request=resp.request, response=resp
            )
            continue

        resp.raise_for_status()
        break
    else:
        raise last_exc  # type: ignore[misc]

    data = resp.json()
    return data["choices"][0]["message"]["content"]


async def extract_netlist_from_image(image_b64: str, media_type: str = "image/jpeg") -> dict:
    """
    Send a base64-encoded image to the vision model and ask it to extract
    a structured netlist JSON matching the NetlistSchema.

    Returns the parsed JSON dict (ready to pass to NetlistSchema.model_validate).
    Raises ValueError if the model returns unparseable JSON.
    """
    system_prompt = (
        "You are an expert electrical engineer and circuit diagram interpreter. "
        "Your task is to analyze the provided circuit image and extract a complete, "
        "structured netlist in JSON format.\n\n"
        "You MUST return ONLY valid JSON — no markdown fences, no prose, no explanation. "
        "The JSON must conform exactly to this schema:\n"
        "{\n"
        '  "components": [\n'
        '    {"id": "R1", "type": "resistor", "value": 150, "unit": "ohm",\n'
        '     "pins": [{"name": "a", "node": null}, {"name": "b", "node": null}],\n'
        '     "properties": {}}\n'
        "  ],\n"
        '  "connections": [\n'
        '    {"component_id": "R1", "pin_name": "a", "node": "VCC"},\n'
        '    {"component_id": "R1", "pin_name": "b", "node": "node1"}\n'
        "  ],\n"
        '  "supply_voltage": 5.0\n'
        "}\n\n"
        "Component types allowed: resistor, capacitor, LED, diode, IC, battery, switch, "
        "transistor, inductor, voltage_regulator, microcontroller, crystal, fuse, relay, unknown.\n"
        "Use descriptive node names (VCC, GND, node1, node2, etc.). "
        "If a value is not readable, omit it (null). "
        "Include ALL visible components and ALL connections you can identify."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{media_type};base64,{image_b64}",
                        "detail": "high",
                    },
                },
                {
                    "type": "text",
                    "text": (
                        "Please extract the complete netlist from this circuit image. "
                        "Return ONLY valid JSON, no other text."
                    ),
                },
            ],
        },
    ]

    raw = await chat_completion(messages, model=VISION_MODEL, temperature=0.0)
    cleaned = _strip_code_fences(raw)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("Vision model returned non-JSON: %s", raw[:500])
        raise ValueError(f"Vision model returned invalid JSON: {exc}") from exc


async def analyze_security(netlist_dict: dict) -> list[dict]:
    """
    Send a structured netlist to the reasoning model for Layer B security analysis.

    Returns a list of finding dicts conforming to FindingSchema (layer='security').
    Defensively handles code fences and JSON parse failures.
    """
    system_prompt = (
        "You are a hardware security engineer performing a security review of an electronic circuit. "
        "You will receive a structured netlist JSON describing circuit components and connections.\n\n"
        "Analyze the netlist for the following security concerns:\n"
        "1. Exposed debug/programming interfaces (JTAG, SWD, UART, ICSP) without protection\n"
        "2. Missing reset or brown-out protection on microcontrollers/ICs\n"
        "3. Missing over-current or over-voltage protection on exposed/external inputs\n"
        "4. Physical tampering or fault-injection attack surfaces (e.g. easily accessible clock lines)\n"
        "5. Unprotected power rails accessible from the outside\n"
        "6. Missing watchdog timer configuration signals\n\n"
        "Return ONLY a JSON array of findings. Each finding must have exactly these fields:\n"
        '{"layer": "security", "severity": "critical"|"warning"|"info", '
        '"title": "...", "explanation": "...", "fix_suggestion": "...", '
        '"related_component_ids": ["..."]}\n\n'
        "Return [] if no security issues are found. "
        "Return ONLY the JSON array, no markdown fences, no prose."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": (
                "Please perform a security analysis of this circuit netlist:\n\n"
                + json.dumps(netlist_dict, indent=2)
            ),
        },
    ]

    try:
        raw = await chat_completion(messages, model=REASONING_MODEL, temperature=0.1)
    except Exception as exc:
        logger.error("OpenRouter security analysis call failed: %s", exc)
        return []

    cleaned = _strip_code_fences(raw)

    try:
        result = json.loads(cleaned)
        if not isinstance(result, list):
            logger.warning("Security analysis returned non-list JSON, wrapping: %s", type(result))
            result = [result] if isinstance(result, dict) else []
        return result
    except json.JSONDecodeError as exc:
        logger.error("Security analysis returned invalid JSON: %s | raw: %s", exc, raw[:500])
        return []
