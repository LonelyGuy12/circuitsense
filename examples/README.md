# CircuitSense — Sample Circuits & Test Images

Use these files to test the CircuitSense app without a real circuit photo.

## Sample Images (upload via "Upload Photo")

| File | Circuit | Expected Findings |
|------|---------|-------------------|
| `img_01_led_blinker.png` | 5V battery → 220Ω resistor → red LED | ✅ Clean — no issues |
| `img_02_transistor_motor.png` | NPN transistor motor driver with flyback diode | ✅ Clean — proper design |
| `img_03_arduino_bugs.png` | ATmega328P with exposed JTAG/UART + LED missing resistor | ⚠️ CRITICAL: missing resistor + security findings |
| `img_04_ldo_power_supply.png` | AMS1117-3.3 LDO with bypass caps + feedback divider | ✅ Clean — info findings for voltage divider |
| `img_05_broken_circuit.png` | Reversed LED, short-circuit switch, 5Ω across supply | 🔴 Multiple CRITICALs |

## Sample Netlists (manual entry reference)

| File | Description |
|------|-------------|
| `01_led_blinker.json` | Minimal LED circuit — corresponds to `img_01` |
| `02_transistor_motor_switch.json` | Motor driver — corresponds to `img_02` |
| `03_arduino_with_bugs.json` | Arduino with intentional bugs — corresponds to `img_03` |
| `04_ldo_power_supply.json` | LDO power supply — corresponds to `img_04` |
| `05_broken_circuit_demo.json` | Many faults — corresponds to `img_05` |

## How to Use

### Upload Photo (easiest demo path)
1. Go to `http://localhost:5173`
2. "Upload Photo" tab is selected by default
3. Drag any `img_*.png` file onto the dropzone
4. Click **Extract & Review**
5. Review the extracted netlist, then click **Run Analysis**

### Manual Entry
Use the JSON files as a reference for what to type into the manual entry form,
or submit them directly via the API:

```bash
# Submit a netlist manually via curl
curl -X POST http://localhost:8000/api/circuits \
  -F "netlist_json=$(cat 01_led_blinker.json | python3 -c 'import sys,json; d=json.load(sys.stdin); del d["_description"]; print(json.dumps(d))')"
```
