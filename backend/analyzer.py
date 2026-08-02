"""
Analyzer — orchestrates Layer A (deterministic) + Layer B (LLM security) analysis.
"""
from __future__ import annotations

import logging
import uuid
from typing import List

from models.schemas import FindingLayer, FindingSchema, FindingSeverity, NetlistSchema
import checks
import llm_client

logger = logging.getLogger(__name__)


def _make_summary(findings: List[FindingSchema]) -> str:
    total = len(findings)
    if total == 0:
        return "✅ No issues found. Circuit looks electrically correct and secure."

    critical = sum(1 for f in findings if f.severity == FindingSeverity.CRITICAL)
    warnings = sum(1 for f in findings if f.severity == FindingSeverity.WARNING)
    info = sum(1 for f in findings if f.severity == FindingSeverity.INFO)

    parts = []
    if critical:
        parts.append(f"{critical} critical")
    if warnings:
        parts.append(f"{warnings} warning{'s' if warnings != 1 else ''}")
    if info:
        parts.append(f"{info} info")

    return f"⚠️ {total} issue{'s' if total != 1 else ''} found: {', '.join(parts)}."


async def run_analysis(
    netlist: NetlistSchema,
    run_layer_a: bool = True,
    run_layer_b: bool = True,
) -> tuple[List[FindingSchema], str]:
    """
    Run enabled analysis layers and return (findings, summary).
    """
    findings: List[FindingSchema] = []

    # --- Layer A: Deterministic checks ---
    if run_layer_a:
        try:
            layer_a = checks.run_all_checks(netlist)
            # Ensure all have IDs
            for f in layer_a:
                if not f.id:
                    f.id = str(uuid.uuid4())[:8]
            findings.extend(layer_a)
            logger.info("Layer A: %d findings", len(layer_a))
        except Exception as exc:
            logger.error("Layer A analysis failed: %s", exc)

    # --- Layer B: LLM security analysis ---
    if run_layer_b:
        try:
            netlist_dict = netlist.model_dump(mode="json")
            raw_findings = await llm_client.analyze_security(netlist_dict)

            for raw in raw_findings:
                try:
                    # Enforce layer=security regardless of what LLM returned
                    raw["layer"] = "security"
                    if "id" not in raw or not raw.get("id"):
                        raw["id"] = str(uuid.uuid4())[:8]
                    finding = FindingSchema.model_validate(raw)
                    findings.append(finding)
                except Exception as ve:
                    logger.warning("Skipping invalid security finding: %s | data: %s", ve, raw)

            security_count = sum(1 for f in findings if f.layer == FindingLayer.SECURITY)
            logger.info("Layer B: %d security findings", security_count)
        except Exception as exc:
            logger.error("Layer B analysis failed: %s", exc)

    summary = _make_summary(findings)
    return findings, summary
