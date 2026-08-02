"""
Unit tests for Layer A deterministic checks (checks.py).

Each test builds a minimal synthetic netlist that exercises exactly one
check scenario, then asserts the expected number and type of findings.
No network calls, no database, no LLM — pure Python.
"""
from __future__ import annotations

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import pytest
from models.schemas import (
    ComponentSchema,
    ComponentType,
    ConnectionSchema,
    FindingLayer,
    FindingSeverity,
    NetlistSchema,
    PinSchema,
)
from checks import (
    check_floating_inputs,
    check_missing_led_resistor,
    check_ohms_law,
    check_reversed_polarity,
    check_short_circuit,
    check_voltage_divider,
    run_all_checks,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_resistor(rid: str, value: float, node_a: str, node_b: str) -> tuple:
    """Returns (ComponentSchema, [ConnectionSchema, ConnectionSchema])."""
    comp = ComponentSchema(
        id=rid,
        type=ComponentType.RESISTOR,
        value=value,
        unit="ohm",
        pins=[PinSchema(name="a"), PinSchema(name="b")],
    )
    conns = [
        ConnectionSchema(component_id=rid, pin_name="a", node=node_a),
        ConnectionSchema(component_id=rid, pin_name="b", node=node_b),
    ]
    return comp, conns


def make_led(lid: str, anode_node: str, cathode_node: str) -> tuple:
    comp = ComponentSchema(
        id=lid,
        type=ComponentType.LED,
        pins=[PinSchema(name="anode"), PinSchema(name="cathode")],
    )
    conns = [
        ConnectionSchema(component_id=lid, pin_name="anode", node=anode_node),
        ConnectionSchema(component_id=lid, pin_name="cathode", node=cathode_node),
    ]
    return comp, conns


# ---------------------------------------------------------------------------
# check_ohms_law
# ---------------------------------------------------------------------------

class TestOhmsLaw:
    def test_high_current_warning(self):
        """10 Ω resistor across 5 V → 500 mA > 200 mA threshold → WARNING."""
        r, conns = make_resistor("R1", 10, "VCC", "GND")
        netlist = NetlistSchema(
            components=[r],
            connections=conns,
            supply_voltage=5.0,
        )
        findings = check_ohms_law(netlist)
        assert len(findings) == 1
        f = findings[0]
        assert f.layer == FindingLayer.CORRECTNESS
        assert f.severity == FindingSeverity.WARNING
        assert "R1" in f.related_component_ids
        assert "500.0 mA" in f.explanation or "500" in f.explanation

    def test_safe_current_no_finding(self):
        """1 kΩ resistor across 5 V → 5 mA → no finding."""
        r, conns = make_resistor("R1", 1000, "VCC", "GND")
        netlist = NetlistSchema(
            components=[r],
            connections=conns,
            supply_voltage=5.0,
        )
        assert check_ohms_law(netlist) == []

    def test_no_supply_voltage_skipped(self):
        """Without a supply voltage we can't compute current → no finding."""
        r, conns = make_resistor("R1", 10, "VCC", "GND")
        netlist = NetlistSchema(components=[r], connections=conns)
        assert check_ohms_law(netlist) == []

    def test_resistor_not_on_power_gnd_skipped(self):
        """Resistor between two signal nodes → can't compute, no finding."""
        r, conns = make_resistor("R1", 10, "node_A", "node_B")
        netlist = NetlistSchema(components=[r], connections=conns, supply_voltage=5.0)
        assert check_ohms_law(netlist) == []


# ---------------------------------------------------------------------------
# check_voltage_divider
# ---------------------------------------------------------------------------

class TestVoltageDivider:
    def test_valid_divider_info(self):
        """1 kΩ / 1 kΩ divider → Vout = 2.5 V → INFO finding."""
        r1, c1 = make_resistor("R1", 1000, "VCC", "MID")
        r2, c2 = make_resistor("R2", 1000, "MID", "GND")
        netlist = NetlistSchema(
            components=[r1, r2],
            connections=c1 + c2,
            supply_voltage=5.0,
        )
        findings = check_voltage_divider(netlist)
        assert len(findings) == 1
        assert findings[0].severity == FindingSeverity.INFO
        assert "2.5" in findings[0].explanation

    def test_invalid_divider_critical(self):
        """Tiny R2 → Vout ≈ 0 V → CRITICAL (out of valid range)."""
        r1, c1 = make_resistor("R1", 10_000_000, "VCC", "MID")  # huge top resistor
        r2, c2 = make_resistor("R2", 0.001, "MID", "GND")       # near-zero bottom → Vout ≈ 0 V
        netlist = NetlistSchema(
            components=[r1, r2],
            connections=c1 + c2,
            supply_voltage=5.0,
        )
        findings = check_voltage_divider(netlist)
        # Vout = 5 * 0.001 / (10M + 0.001) ≈ 0.000000 V → out of valid range
        assert any(f.severity == FindingSeverity.CRITICAL for f in findings)

    def test_no_supply_no_finding(self):
        r1, c1 = make_resistor("R1", 1000, "VCC", "MID")
        r2, c2 = make_resistor("R2", 1000, "MID", "GND")
        netlist = NetlistSchema(components=[r1, r2], connections=c1 + c2)
        assert check_voltage_divider(netlist) == []


# ---------------------------------------------------------------------------
# check_floating_inputs
# ---------------------------------------------------------------------------

class TestFloatingInputs:
    def test_floating_pin_detected(self):
        """A component with a declared pin not in connections → WARNING."""
        comp = ComponentSchema(
            id="IC1",
            type=ComponentType.IC,
            pins=[PinSchema(name="VCC"), PinSchema(name="GND"), PinSchema(name="EN")],
        )
        conns = [
            ConnectionSchema(component_id="IC1", pin_name="VCC", node="VCC"),
            ConnectionSchema(component_id="IC1", pin_name="GND", node="GND"),
            # EN pin deliberately left unconnected
        ]
        netlist = NetlistSchema(components=[comp], connections=conns)
        findings = check_floating_inputs(netlist)
        assert len(findings) == 1
        assert "EN" in findings[0].title
        assert findings[0].severity == FindingSeverity.WARNING

    def test_all_pins_connected_no_finding(self):
        comp = ComponentSchema(
            id="IC1",
            type=ComponentType.IC,
            pins=[PinSchema(name="VCC"), PinSchema(name="GND")],
        )
        conns = [
            ConnectionSchema(component_id="IC1", pin_name="VCC", node="VCC"),
            ConnectionSchema(component_id="IC1", pin_name="GND", node="GND"),
        ]
        netlist = NetlistSchema(components=[comp], connections=conns)
        assert check_floating_inputs(netlist) == []

    def test_component_with_no_pins_no_finding(self):
        comp = ComponentSchema(id="R1", type=ComponentType.RESISTOR, value=1000)
        netlist = NetlistSchema(components=[comp], connections=[])
        assert check_floating_inputs(netlist) == []


# ---------------------------------------------------------------------------
# check_reversed_polarity
# ---------------------------------------------------------------------------

class TestReversedPolarity:
    def test_reversed_led_detected(self):
        """LED with anode on GND and cathode on VCC → CRITICAL."""
        led, conns = make_led("LED1", anode_node="GND", cathode_node="VCC")
        netlist = NetlistSchema(components=[led], connections=conns)
        findings = check_reversed_polarity(netlist)
        assert len(findings) == 1
        assert findings[0].severity == FindingSeverity.CRITICAL
        assert "LED1" in findings[0].related_component_ids

    def test_correct_led_no_finding(self):
        """LED with anode on VCC, cathode on node_A → OK (no direct GND/PWR reversal)."""
        led, conns = make_led("LED1", anode_node="VCC", cathode_node="node_mid")
        netlist = NetlistSchema(components=[led], connections=conns)
        assert check_reversed_polarity(netlist) == []

    def test_reversed_diode_detected(self):
        comp = ComponentSchema(
            id="D1",
            type=ComponentType.DIODE,
            pins=[PinSchema(name="anode"), PinSchema(name="cathode")],
        )
        conns = [
            ConnectionSchema(component_id="D1", pin_name="anode", node="GND"),
            ConnectionSchema(component_id="D1", pin_name="cathode", node="node_sig"),
        ]
        netlist = NetlistSchema(components=[comp], connections=conns)
        findings = check_reversed_polarity(netlist)
        assert len(findings) == 1


# ---------------------------------------------------------------------------
# check_missing_led_resistor
# ---------------------------------------------------------------------------

class TestMissingLedResistor:
    def test_led_without_resistor(self):
        """LED connected only to VCC and GND with no resistor on the path → CRITICAL."""
        led, led_conns = make_led("LED1", "VCC", "GND")
        netlist = NetlistSchema(components=[led], connections=led_conns)
        findings = check_missing_led_resistor(netlist)
        assert len(findings) == 1
        assert findings[0].severity == FindingSeverity.CRITICAL

    def test_led_with_series_resistor_no_finding(self):
        """LED with a resistor sharing one of its nodes → safe."""
        led, led_conns = make_led("LED1", "node_mid", "GND")
        r, r_conns = make_resistor("R1", 150, "VCC", "node_mid")
        netlist = NetlistSchema(
            components=[led, r],
            connections=led_conns + r_conns,
        )
        assert check_missing_led_resistor(netlist) == []

    def test_led_not_connected_skipped(self):
        """LED with no connections at all → skip gracefully."""
        led = ComponentSchema(
            id="LED1",
            type=ComponentType.LED,
            pins=[PinSchema(name="anode"), PinSchema(name="cathode")],
        )
        netlist = NetlistSchema(components=[led], connections=[])
        findings = check_missing_led_resistor(netlist)
        assert len(findings) == 0  # no connections → can't determine path


# ---------------------------------------------------------------------------
# check_short_circuit
# ---------------------------------------------------------------------------

class TestShortCircuit:
    def test_switch_bridging_vcc_gnd(self):
        """A switch directly connecting VCC to GND → CRITICAL short circuit."""
        comp = ComponentSchema(
            id="SW1",
            type=ComponentType.SWITCH,
            pins=[PinSchema(name="a"), PinSchema(name="b")],
        )
        conns = [
            ConnectionSchema(component_id="SW1", pin_name="a", node="VCC"),
            ConnectionSchema(component_id="SW1", pin_name="b", node="GND"),
        ]
        netlist = NetlistSchema(components=[comp], connections=conns)
        findings = check_short_circuit(netlist)
        assert len(findings) >= 1
        assert any(f.severity == FindingSeverity.CRITICAL for f in findings)

    def test_resistor_bridging_vcc_gnd_ok(self):
        """A resistor across VCC/GND is normal — no short-circuit finding."""
        r, conns = make_resistor("R1", 10_000, "VCC", "GND")
        netlist = NetlistSchema(components=[r], connections=conns, supply_voltage=5.0)
        short_findings = check_short_circuit(netlist)
        assert len(short_findings) == 0

    def test_zero_ohm_resistor_shorted(self):
        """0 Ω resistor across VCC/GND → CRITICAL."""
        r, conns = make_resistor("R1", 0, "VCC", "GND")
        netlist = NetlistSchema(components=[r], connections=conns, supply_voltage=5.0)
        findings = check_short_circuit(netlist)
        assert any(f.severity == FindingSeverity.CRITICAL for f in findings)


# ---------------------------------------------------------------------------
# run_all_checks (integration)
# ---------------------------------------------------------------------------

class TestRunAllChecks:
    def test_combined_bad_circuit(self):
        """Circuit with multiple issues returns findings from multiple checks."""
        # LED directly across supply (no resistor + reversed polarity)
        led, led_conns = make_led("LED1", anode_node="GND", cathode_node="VCC")
        netlist = NetlistSchema(
            components=[led],
            connections=led_conns,
            supply_voltage=5.0,
        )
        findings = run_all_checks(netlist)
        layers = {f.layer for f in findings}
        severities = {f.severity for f in findings}
        # Should have at least CRITICAL findings
        assert FindingSeverity.CRITICAL in severities
        assert FindingLayer.CORRECTNESS in layers

    def test_clean_circuit_minimal_findings(self):
        """Simple safe circuit with a resistor and LED wired correctly."""
        led, led_conns = make_led("LED1", "node_mid", "GND")
        r, r_conns = make_resistor("R1", 150, "VCC", "node_mid")
        netlist = NetlistSchema(
            components=[led, r],
            connections=led_conns + r_conns,
            supply_voltage=5.0,
        )
        findings = run_all_checks(netlist)
        critical = [f for f in findings if f.severity == FindingSeverity.CRITICAL]
        assert len(critical) == 0
