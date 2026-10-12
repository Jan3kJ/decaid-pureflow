# A-Flow 3.0: how the parameters become profile steps

Status: D3, 2026-10-12, for the founder's review.

The generator is `src/aflow/` (`generateProfile`, `validateParams`, `serializeParams` /
`parseParams`, `DEFAULT_PROFILES`). Sources read on 2026-10-12, as raw files: `code.tcl` and
the five `profiles/A-Flow____default-*.tcl` of Jan3kJ/A_Flow, and the five
`A-Flow____default-*.json` in Decaid 0.8.8's `assets/defaultProfiles`.

## 1. Parameters and the step fields they set

Step names are the plugin's. A step that is off is not in the list.

| Parameter (`AFlowParams`) | Sets |
|---|---|
| `dose` | nothing in the profile. It belongs to the workflow (`context.targetDoseWeight`) and is saved with the parameters |
| `fillFlow` | Fill: `flow` |
| `fillTemperature` | `temperature` of Pre Fill, Fill, Infuse, 2nd Fill, Pause |
| `infusePressure` | Infuse: `pressure` |
| `infuseTime` | Infuse: `seconds` |
| `infuseWeight` | Infuse: `weight` |
| `secondFill` (toggle) | on: the steps 2nd Fill and Pause exist |
| `secondFillFlow` | 2nd Fill: `flow` |
| `pauseDuration` | Pause: `seconds` |
| `pourPressure` | Pressure Up: `pressure`. Flow Extraction: `limiter.value` |
| `rampTime` | Pressure Up: `seconds`. Under 1 s: the step Flow Start exists |
| `pourFlow` | Pressure Up: `exit` flow over it. Flow Start: `flow`, and `exit` flow over it - 0.1. Flow Extraction: `flow` = 2 x it with flow up |
| `pourTemperature` | `temperature` of Pressure Up, Flow Start, Flow Extraction |
| `stopWeight` | profile: `target_weight` |
| `flowUp` (toggle) | Flow Extraction: `flow` = 2 x pour flow (up) or 0 (down) |
| setting "first-step workaround" | on: the step Pre Fill exists. It is an option of `generateProfile`, not a parameter, and is not saved with a profile |

## 2. Constants

All in `src/aflow/constants.ts`. Each is the same in `code.tcl` (the old-format fallback
block and `update_A-Flow`), in all five `.tcl` files and in all five Decaid files.

| Step (spec 3.2 item) | Pump, transition | Fixed values |
|---|---|---|
| every step | | `sensor` coffee, `volume` 100, `limiter.range` 0.6, `weight` 0 except Infuse |
| Pre Fill (0) | flow, fast | 8 ml/s, 1 s, limiter 8 bar, no exit |
| Fill (1) | flow, fast | 15 s, limiter 8 bar, exit pressure over 3 bar |
| Infuse (2) | pressure, fast | limiter 1 ml/s, no exit |
| 2nd Fill (3) | flow, fast | 15 s, limiter 3 bar, exit pressure over 2.5 bar |
| Pause (4) | pressure, fast | 1 bar, limiter 1 ml/s, exit flow under 1 ml/s |
| Pressure Up (5) | pressure, smooth | no limiter (0) |
| Flow Start (6) | flow, fast | 10 s, no limiter (0), on when ramp time < 1 s, exit margin 0.1 ml/s |
| Flow Extraction (7) | flow, smooth | 60 s, no exit, factor 2 (flow up), target 0 (flow down) |
| profile | | `version` "2", `beverage_type` espresso, `tank_temperature` 0, `target_volume` 100, `target_volume_count_start` 2 |

The profile is written the way Decaid's API returns one (`GET /api/v1/profiles`, recorded by
the rig): JSON numbers, only the pump's own target per step (`flow` or `pressure`), and `exit`
only where the plugin's `exit_if` is 1. The plugin's unused values (for example `pressure 3.0`
on a flow step) are not written.

Validation ranges (`src/aflow/validate.ts`): temperatures 80-105 °C, times 0-1000 s, weights
0-1000 g, dose 0-30 g in steps of 0.1 (spec 3.2); pressures 0 to the machine's maximum; flows
0.1 ml/s (the plugin's minimum for the pour flow) to the machine's maximum.

## 3. Plugin and Decaid compared (step 1)

**The five profiles Decaid ships equal the plugin's files in every step value but one: the
Pause step's `seconds` is 0 in all five plugin files and 15 in all five Decaid files.**
Everything else is the same number: flows, pressures, temperatures, seconds, weights, exits,
limiters, and `target_weight`, which is the plugin's `final_desired_shot_weight_advanced`
(48, 42, 36, 32, 36). Decaid leaves out the exit of steps whose `exit_if` is 0.

- So the first research was right for the plugin (0 s) and the table in research.md 8.6 is
  right for Decaid (15 s; it matches the JSON files).
- What it means: the plugin reads `pause(seconds) > 0` as "2nd fill on" (`prep`). In the
  plugin's files the 2nd fill is off in all five. In Decaid's copies the Pause step is live
  in every default profile (1 bar for up to 15 s, ending when the flow is under 1 ml/s) while
  the 2nd Fill before it has 0 s. Why Decaid's copies differ was not looked into.
- **The 3.0 fixtures start from the plugin's files: 2nd fill off in all five.**
- One correction to research.md section 6: with the 2nd fill on, the plugin sets both steps
  to 15 s and to the pour temperature. Its table of default-medium matches the raw file.

## 4. The default profiles as 3.0 parameters

`src/aflow/defaults/default-*.json`. In all five: dose 18, fill flow 8, infuse pressure 3,
2nd fill off, 2nd fill flow 8, pause 15.

| | light | medium | dark | very-dark | like-dflow |
|---|---|---|---|---|---|
| fill temperature | 95 | 93 | 93 | 93 | 93 |
| infuse time, weight | 60 s, 6 g | 60 s, 3.6 g | 10 s, 2 g | 6 s, 2 g | 60 s, 4 g |
| pour pressure, ramp time | 9.5, 10 s | 10, 10 s | 9, 5 s | 10, 6 s | 10, 0 s |
| pour flow, temperature | 3, 95 | 2, 93 | 2, 88 | 1.8, 88 | 2, 93 |
| stop weight | 48 | 42 | 36 | 32 | 36 |
| flow | up | up | down | up | up |

## 5. Choices, where the spec and the plugin leave it open

1. **default-very-dark.** It is the one file with ramp down on (Pressure Up 3 s, Pressure
   Decline 3 s). The plugin's ramp value is the sum, so the 3.0 fixture has ramp time 6 s,
   which is what the plugin writes when ramp down is switched off. The alternative is 3 s.
2. **Dose 18 g** in every fixture. The plugin's profile files hold no dose (it is de1app's
   `grinder_dose_weight`).
3. **Step names** are the plugin's (Fill, Pressure Up, Flow Start, Flow Extraction), not the
   phase names of spec 3.2 (Filling, Ramp Up, Pouring start, Pouring), so a 3.0 profile reads
   like the shipped ones.
4. **Steps with 0 s stay** when their phase is on: Infuse with time 0, Pause with duration 0
   and the 2nd fill on, Pressure Up with ramp time 0 (as in default-like-dflow). Only the
   steps the spec names as conditional are left out.
5. **2nd Fill lasts at most 15 s**, the plugin's value. The spec makes its flow and the pause
   editable and does not say how long the fill itself may take; it ends at 2.5 bar.
6. **Times are not rounded.** The plugin rounds the ramp time to whole seconds; the generator
   writes what it gets, and Flow Start is on below 1 s. Derived flows are rounded to 0.1 as
   in the plugin.
7. **Flows have a minimum of 0.1 ml/s** in validation (the plugin has it for the pour flow
   only). **Machine maxima default to 12 bar and 8 ml/s**; the plugin takes them from de1app
   (`maxpressure`, `max_flowrate_v11`), which was not read in this task, so both numbers are
   from memory and are an argument of `validateParams`. To be read from the machine or
   confirmed.
8. **The saved string** is JSON, `{"aflow":"3.0","params":{...}}`, with a fixed key order.
   Reading checks the version and the types, not the ranges. Where it is stored is open.
9. **Not written:** the plugin's top-level `type` / `hidden` (in Decaid's files, not in its
   API form) and the infuse volume, which stays at the step default of 100 ml.

## 6. Where spec 3.2 may be wrong or incomplete

Sections 3 and 5 were not changed. For the founder to decide:

- **Pause can end early.** The plugin's Pause step exits when the flow is under 1 ml/s. With
  an editable pause duration the user probably expects the pause to last that long; at 1 bar
  the flow may fall under 1 ml/s at once. The generator keeps the plugin's exit. Removing it
  makes the duration exact.
- **The Fill step's exit is fixed at 3 bar** and does not follow the infuse pressure (the
  plugin never writes it). With an infuse pressure under 3 bar the fill runs to 3 bar first.
  Spec 3.2 does not name it.
- **Temperature range.** The spec says 80-105 °C "following the plugin"; the plugin's editor
  allows 0-105. Validation follows the spec.
- **Ramp time in default-very-dark** (choice 1) changes that profile compared with what the
  plugin ships, because ramp down is gone: its Pressure Up now exits at flow over 1.8 ml/s
  instead of 3.6.
- **Regression against the plugin with the 2nd fill on** holds only where fill and pour
  temperature are equal: the plugin puts 2nd Fill and Pause at the pour temperature, 3.0 at
  the fill temperature (founder, 2026-10-11). The tests say so for default-dark.
