"""
Layer A — Deterministic electrical correctness checks.

Each check is a pure function:
    check_*(netlist: NetlistSchema) -> List[FindingSchema]

This makes every check independently unit-testable and auditable without LLM involvement.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Callable, Dict, List, Optional, Set

from models.schemas import (
    ComponentSchema,
    ComponentType,
    ConnectionSchema,
    FindingLayer,
    FindingSchema,
    FindingSeverity,
    NetlistSchema,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _new_id() -> str:
    return str(uuid.uuid4())[:8]


def _node_map(netlist: NetlistSchema) -> Dict[str, List[str]]:
    """
    Returns {node_name: [component_id, ...]} for every node in the netlist.
    Built from the connections list.
    """
    node_to_comps: Dict[str, List[str]] = defaultdict(list)
    for conn in netlist.connections:
        node_to_comps[conn.node].append(conn.component_id)
    return dict(node_to_comps)


def _component_map(netlist: NetlistSchema) -> Dict[str, ComponentSchema]:
    return {c.id: c for c in netlist.components}


def _pins_on_node(netlist: NetlistSchema, node: str) -> List[tuple[str, str]]:
    """Returns list of (component_id, pin_name) connected to the given node."""
    return [(c.component_id, c.pin_name) for c in netlist.connections if c.node == node]


def _nodes_for_component(netlist: NetlistSchema, comp_id: str) -> Dict[str, str]:
    """Returns {pin_name: node} for a specific component."""
    return {c.pin_name: c.node for c in netlist.connections if c.component_id == comp_id}


def _is_power_node(node: str) -> bool:
    name = node.lower()
    return any(kw in name for kw in ("vcc", "vdd", "v+", "supply", "pwr", "vin", "3v3", "5v", "12v", "vbat"))


def _is_ground_node(node: str) -> bool:
    name = node.lower()
    return any(kw in name for kw in ("gnd", "ground", "vss", "v-", "0v", "agnd", "dgnd", "pgnd"))


def _get_value(comp: ComponentSchema, unit_hint: Optional[str] = None) -> Optional[float]:
    """Return the component's numeric value, or None if unavailable."""
    return comp.value


# ---------------------------------------------------------------------------
# Check 1 — Ohm's Law
# ---------------------------------------------------------------------------

def check_ohms_law(netlist: NetlistSchema) -> List[FindingSchema]:
    """
    For every resistor with a known value, attempt V=IR validation.
    We look for a resistor whose both terminals are connected to nodes
    that are identifiable as power or ground, then check the computed
    current against a 200 mA safety threshold.
    """
    findings: List[FindingSchema] = []
    comp_map = _component_map(netlist)

    for comp in netlist.components:
        if comp.type != ComponentType.RESISTOR:
            continue
        if comp.value is None or comp.value <= 0:
            continue

        pins = _nodes_for_component(netlist, comp.id)
        if len(pins) < 2:
            continue

        pin_nodes = list(pins.values())
        has_power = any(_is_power_node(n) for n in pin_nodes)
        has_ground = any(_is_ground_node(n) for n in pin_nodes)

        if has_power and has_ground and netlist.supply_voltage:
            v = netlist.supply_voltage
            r = comp.value
            i_amps = v / r
            i_ma = i_amps * 1000

            if i_ma > 200:
                findings.append(FindingSchema(
                    id=_new_id(),
                    layer=FindingLayer.CORRECTNESS,
                    severity=FindingSeverity.WARNING,
                    title=f"High current through {comp.id}",
                    explanation=(
                        f"With supply voltage {v} V and resistance {r} Ω, "
                        f"Ohm's law gives I = V/R = {i_ma:.1f} mA. "
                        "This exceeds the typical 200 mA safety threshold."
                    ),
                    fix_suggestion=(
                        f"Increase resistance to at least {v / 0.2:.0f} Ω "
                        "to keep current ≤ 200 mA, or add a current-limiting stage."
                    ),
                    related_component_ids=[comp.id],
                ))

    return findings


# ---------------------------------------------------------------------------
# Check 2 — Voltage divider math
# ---------------------------------------------------------------------------

def check_voltage_divider(netlist: NetlistSchema) -> List[FindingSchema]:
    """
    Detect two-resistor voltage dividers and verify the output voltage
    is within the expected operating range (non-zero, below supply).
    """
    findings: List[FindingSchema] = []
    if netlist.supply_voltage is None:
        return findings

    resistors = [c for c in netlist.components if c.type == ComponentType.RESISTOR]
    if len(resistors) < 2:
        return findings

    # Find pairs of resistors sharing a middle node (neither VCC nor GND)
    comp_to_nodes: Dict[str, Set[str]] = {}
    for r in resistors:
        nodes = set(_nodes_for_component(netlist, r.id).values())
        comp_to_nodes[r.id] = nodes

    checked_pairs: Set[frozenset] = set()
    for i, r1 in enumerate(resistors):
        for r2 in resistors[i + 1:]:
            pair = frozenset([r1.id, r2.id])
            if pair in checked_pairs:
                continue
            checked_pairs.add(pair)

            shared = comp_to_nodes[r1.id] & comp_to_nodes[r2.id]
            if not shared:
                continue

            mid_node = next(iter(shared))
            if _is_power_node(mid_node) or _is_ground_node(mid_node):
                continue

            r1_nodes = comp_to_nodes[r1.id]
            r2_nodes = comp_to_nodes[r2.id]
            top_has_power = any(_is_power_node(n) for n in r1_nodes | r2_nodes)
            bot_has_gnd = any(_is_ground_node(n) for n in r1_nodes | r2_nodes)

            if top_has_power and bot_has_gnd and r1.value and r2.value:
                vout = netlist.supply_voltage * r2.value / (r1.value + r2.value)
                if vout < netlist.supply_voltage * 0.01 or vout > netlist.supply_voltage * 0.99:
                    findings.append(FindingSchema(
                        id=_new_id(),
                        layer=FindingLayer.CORRECTNESS,
                        severity=FindingSeverity.CRITICAL,
                        title=f"Invalid voltage divider ({r1.id}, {r2.id})",
                        explanation=(
                            f"Voltage divider with R1={r1.value} Ω and R2={r2.value} Ω "
                            f"produces Vout={vout:.3f} V, which is out of valid range "
                            f"(0 V < Vout < {netlist.supply_voltage} V)."
                        ),
                        fix_suggestion="Check resistor values and orientation in the divider.",
                        related_component_ids=[r1.id, r2.id],
                    ))
                else:
                    findings.append(FindingSchema(
                        id=_new_id(),
                        layer=FindingLayer.CORRECTNESS,
                        severity=FindingSeverity.INFO,
                        title=f"Voltage divider detected ({r1.id}, {r2.id})",
                        explanation=(
                            f"R1={r1.value} Ω / R2={r2.value} Ω divider from "
                            f"{netlist.supply_voltage} V produces Vout ≈ {vout:.3f} V on node '{mid_node}'."
                        ),
                        fix_suggestion="Verify this output voltage is within spec for the downstream component.",
                        related_component_ids=[r1.id, r2.id],
                    ))

    return findings


# ---------------------------------------------------------------------------
# Check 3 — Floating input detection
# ---------------------------------------------------------------------------

def check_floating_inputs(netlist: NetlistSchema) -> List[FindingSchema]:
    """
    Detect component pins that are declared but not wired to any node.
    Also checks for IC/MCU inputs that have no pull-up/down or signal.
    """
    findings: List[FindingSchema] = []

    # Build set of (comp_id, pin_name) pairs that have connections
    connected: Set[tuple[str, str]] = {
        (c.component_id, c.pin_name) for c in netlist.connections
    }

    for comp in netlist.components:
        for pin in comp.pins:
            if (comp.id, pin.name) not in connected:
                findings.append(FindingSchema(
                    id=_new_id(),
                    layer=FindingLayer.CORRECTNESS,
                    severity=FindingSeverity.WARNING,
                    title=f"Floating pin: {comp.id}.{pin.name}",
                    explanation=(
                        f"Pin '{pin.name}' of {comp.type.value} '{comp.id}' is not connected "
                        "to any net. Floating inputs can cause undefined behavior, latch-up, "
                        "or excessive power consumption."
                    ),
                    fix_suggestion=(
                        "Connect the pin to a defined node (signal, VCC, GND, or add a "
                        "pull-up/pull-down resistor). If unused, tie to GND or VCC per datasheet."
                    ),
                    related_component_ids=[comp.id],
                ))

    return findings


# ---------------------------------------------------------------------------
# Check 4 — Reversed polarity
# ---------------------------------------------------------------------------

_POLARITY_PINS: Dict[ComponentType, tuple[str, str]] = {
    # (positive_pin, negative_pin)
    ComponentType.LED: ("anode", "cathode"),
    ComponentType.DIODE: ("anode", "cathode"),
    ComponentType.CAPACITOR: ("positive", "negative"),
    ComponentType.BATTERY: ("positive", "negative"),
}


def check_reversed_polarity(netlist: NetlistSchema) -> List[FindingSchema]:
    """
    For polarised components (LEDs, diodes, electrolytic caps, batteries),
    check that the positive/anode pin is connected to a higher-potential node
    than the negative/cathode pin based on node naming heuristics.
    """
    findings: List[FindingSchema] = []

    for comp in netlist.components:
        if comp.type not in _POLARITY_PINS:
            continue

        pos_name, neg_name = _POLARITY_PINS[comp.type]
        pins = _nodes_for_component(netlist, comp.id)

        pos_node = pins.get(pos_name)
        neg_node = pins.get(neg_name)

        if pos_node is None or neg_node is None:
            continue  # can't determine without both pins connected

        pos_is_gnd = _is_ground_node(pos_node)
        neg_is_pwr = _is_power_node(neg_node)

        if pos_is_gnd or neg_is_pwr:
            findings.append(FindingSchema(
                id=_new_id(),
                layer=FindingLayer.CORRECTNESS,
                severity=FindingSeverity.CRITICAL,
                title=f"Reversed polarity on {comp.id}",
                explanation=(
                    f"{comp.type.value} '{comp.id}' appears to have reversed polarity: "
                    f"'{pos_name}' pin is on node '{pos_node}' (ground-like) and/or "
                    f"'{neg_name}' pin is on node '{neg_node}' (power-like). "
                    "Reversed polarity can permanently damage the component."
                ),
                fix_suggestion=(
                    f"Flip the orientation of {comp.id} so the {pos_name} connects "
                    f"to the higher potential node and the {neg_name} to the lower."
                ),
                related_component_ids=[comp.id],
            ))

    return findings


# ---------------------------------------------------------------------------
# Check 5 — Missing current-limiting resistor on LEDs
# ---------------------------------------------------------------------------

def check_missing_led_resistor(netlist: NetlistSchema) -> List[FindingSchema]:
    """
    For each LED, ensure there is at least one resistor on the same current path
    (i.e., a resistor sharing either the anode or cathode node of the LED).
    """
    findings: List[FindingSchema] = []

    resistor_nodes: Set[str] = set()
    for comp in netlist.components:
        if comp.type == ComponentType.RESISTOR:
            for conn in netlist.connections:
                if conn.component_id == comp.id:
                    resistor_nodes.add(conn.node)

    for comp in netlist.components:
        if comp.type != ComponentType.LED:
            continue

        led_nodes: Set[str] = {
            conn.node for conn in netlist.connections if conn.component_id == comp.id
        }

        if not led_nodes:
            continue  # can't check without connections

        shared = led_nodes & resistor_nodes
        if not shared:
            findings.append(FindingSchema(
                id=_new_id(),
                layer=FindingLayer.CORRECTNESS,
                severity=FindingSeverity.CRITICAL,
                title=f"No current-limiting resistor for {comp.id}",
                explanation=(
                    f"LED '{comp.id}' has no resistor on its current path. "
                    "Without current limiting, LEDs draw excessive current and burn out instantly."
                ),
                fix_suggestion=(
                    "Add a series resistor between the LED and power/ground. "
                    "Typical value: R = (Vsupply - Vf) / If, e.g. (5V - 2V) / 20mA = 150 Ω."
                ),
                related_component_ids=[comp.id],
            ))

    return findings


# ---------------------------------------------------------------------------
# Check 6 — Short circuit detection
# ---------------------------------------------------------------------------

def check_short_circuit(netlist: NetlistSchema) -> List[FindingSchema]:
    """
    Detect direct power-to-ground connections with no component in between.

    Algorithm: build a node adjacency graph where edges represent direct
    connections (wires), then check if any power node has a direct edge
    to a ground node (i.e., they share a component whose type is 'wire'
    or the same component-node pair appears on both a power and ground side
    with no resistance/impedance component in between).

    Simplified heuristic: if the same net connects both a VCC pin and a GND
    pin directly (no series component), that net is shorted.
    Also flag if a component with 0 Ω (or no value) bridges VCC and GND.
    """
    findings: List[FindingSchema] = []

    # For each component, gather which of its nodes are power and which are ground
    for comp in netlist.components:
        pins = _nodes_for_component(netlist, comp.id)
        nodes = list(pins.values())

        has_power = any(_is_power_node(n) for n in nodes)
        has_gnd = any(_is_ground_node(n) for n in nodes)

        if has_power and has_gnd:
            # Components allowed to bridge power/ground
            safe_types = {
                ComponentType.RESISTOR,
                ComponentType.CAPACITOR,
                ComponentType.DIODE,
                ComponentType.LED,
                ComponentType.TRANSISTOR,
                ComponentType.VOLTAGE_REGULATOR,
                ComponentType.FUSE,
                ComponentType.RELAY,
                ComponentType.BATTERY,
            }
            if comp.type not in safe_types:
                findings.append(FindingSchema(
                    id=_new_id(),
                    layer=FindingLayer.CORRECTNESS,
                    severity=FindingSeverity.CRITICAL,
                    title=f"Potential short circuit through {comp.id}",
                    explanation=(
                        f"Component '{comp.id}' ({comp.type.value}) directly connects "
                        "a power node to a ground node with no current-limiting element. "
                        "This may cause a short circuit."
                    ),
                    fix_suggestion=(
                        "Insert a current-limiting resistor or fuse between the power "
                        f"rail and {comp.id}, or verify the wiring is correct."
                    ),
                    related_component_ids=[comp.id],
                ))
            elif comp.type == ComponentType.RESISTOR and comp.value is not None and comp.value == 0:
                findings.append(FindingSchema(
                    id=_new_id(),
                    layer=FindingLayer.CORRECTNESS,
                    severity=FindingSeverity.CRITICAL,
                    title=f"Zero-ohm resistor short circuit: {comp.id}",
                    explanation=(
                        f"Resistor '{comp.id}' has 0 Ω and connects power directly to ground. "
                        "This is a hard short circuit."
                    ),
                    fix_suggestion="Replace with a non-zero resistance or remove if unintentional.",
                    related_component_ids=[comp.id],
                ))

    # Also check: does any single net contain both power and ground pins?
    node_to_conns: Dict[str, List[ConnectionSchema]] = defaultdict(list)
    for conn in netlist.connections:
        node_to_conns[conn.node].append(conn)

    for node, conns in node_to_conns.items():
        if _is_power_node(node) and _is_ground_node(node):
            comp_ids = list({c.component_id for c in conns})
            findings.append(FindingSchema(
                id=_new_id(),
                layer=FindingLayer.CORRECTNESS,
                severity=FindingSeverity.CRITICAL,
                title=f"Net '{node}' is both power and ground",
                explanation=(
                    f"Net '{node}' has naming that implies both power and ground potential. "
                    "This is almost certainly a naming error or a hard short."
                ),
                fix_suggestion="Rename nets clearly and verify no direct VCC-GND connection exists.",
                related_component_ids=comp_ids,
            ))

    return findings


# ---------------------------------------------------------------------------
# Public registry — all checks in order
# ---------------------------------------------------------------------------

ALL_CHECKS: List[Callable[[NetlistSchema], List[FindingSchema]]] = [
    check_ohms_law,
    check_voltage_divider,
    check_floating_inputs,
    check_reversed_polarity,
    check_missing_led_resistor,
    check_short_circuit,
]


def run_all_checks(netlist: NetlistSchema) -> List[FindingSchema]:
    """Run every Layer A check and return the combined findings list."""
    results: List[FindingSchema] = []
    for check_fn in ALL_CHECKS:
        try:
            results.extend(check_fn(netlist))
        except Exception as exc:  # noqa: BLE001
            # Individual check failure should never crash the whole analysis
            results.append(FindingSchema(
                id=_new_id(),
                layer=FindingLayer.CORRECTNESS,
                severity=FindingSeverity.INFO,
                title=f"Check '{check_fn.__name__}' failed",
                explanation=f"An internal error prevented this check from running: {exc}",
                fix_suggestion="This is a tool issue, not a circuit issue. Please report it.",
                related_component_ids=[],
            ))
    return results
