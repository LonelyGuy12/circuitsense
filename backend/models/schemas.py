"""
Pydantic schemas for all CircuitSense request/response models.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ComponentType(str, Enum):
    RESISTOR = "resistor"
    CAPACITOR = "capacitor"
    LED = "LED"
    DIODE = "diode"
    IC = "IC"
    BATTERY = "battery"
    SWITCH = "switch"
    TRANSISTOR = "transistor"
    INDUCTOR = "inductor"
    VOLTAGE_REGULATOR = "voltage_regulator"
    MICROCONTROLLER = "microcontroller"
    CRYSTAL = "crystal"
    FUSE = "fuse"
    RELAY = "relay"
    UNKNOWN = "unknown"


class FindingLayer(str, Enum):
    CORRECTNESS = "correctness"
    SECURITY = "security"


class FindingSeverity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class InputMethod(str, Enum):
    PHOTO = "photo"
    MANUAL = "manual"


# ---------------------------------------------------------------------------
# Core building blocks
# ---------------------------------------------------------------------------

class PinSchema(BaseModel):
    name: str = Field(..., description="Pin name, e.g. 'anode', 'cathode', 'JTAG_TDI'")
    node: Optional[str] = Field(None, description="Net/node this pin is connected to")


class ComponentSchema(BaseModel):
    id: str = Field(..., description="Unique component identifier, e.g. 'R1', 'LED1'")
    type: ComponentType
    value: Optional[float] = Field(None, description="Numeric value of the component")
    unit: Optional[str] = Field(None, description="Unit string, e.g. 'ohm', 'F', 'V'")
    pins: List[PinSchema] = Field(default_factory=list)
    properties: Optional[dict[str, Any]] = Field(
        default_factory=dict,
        description="Extra key-value properties (e.g. forward_voltage, max_current)"
    )


class ConnectionSchema(BaseModel):
    """Maps a component pin to a named net/node."""
    component_id: str
    pin_name: str
    node: str


class NetlistSchema(BaseModel):
    id: Optional[str] = Field(None, description="Optional netlist identifier")
    components: List[ComponentSchema] = Field(default_factory=list)
    connections: List[ConnectionSchema] = Field(default_factory=list)
    supply_voltage: Optional[float] = Field(
        None, description="Overall supply voltage (V), if known"
    )


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------

class FindingSchema(BaseModel):
    id: Optional[str] = None
    layer: FindingLayer
    severity: FindingSeverity
    title: str
    explanation: str
    fix_suggestion: str
    related_component_ids: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Submission create / update
# ---------------------------------------------------------------------------

class CircuitSubmissionCreate(BaseModel):
    input_method: InputMethod = InputMethod.MANUAL
    netlist: NetlistSchema
    image_url: Optional[str] = None


class AnalyzeRequest(BaseModel):
    """Optional override parameters for the /analyze endpoint."""
    run_layer_a: bool = True
    run_layer_b: bool = True


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

class CircuitSubmissionResponse(BaseModel):
    id: str
    created_at: datetime
    input_method: InputMethod
    image_url: Optional[str] = None
    netlist: NetlistSchema
    findings: List[FindingSchema] = Field(default_factory=list)
    summary: Optional[str] = None
    analysis_status: str = "pending"  # pending | running | done | error

    model_config = {"from_attributes": True}


class CircuitListResponse(BaseModel):
    submissions: List[CircuitSubmissionResponse]
    total: int


class AnalyzeResponse(BaseModel):
    submission_id: str
    findings: List[FindingSchema]
    summary: str
    analysis_status: str


class NetlistExtractionResponse(BaseModel):
    netlist: NetlistSchema
    confidence: str  # "high" | "medium" | "low"
    extraction_notes: Optional[str] = None
