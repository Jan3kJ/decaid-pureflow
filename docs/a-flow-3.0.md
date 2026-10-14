# A-Flow 3.0: how the parameters become profile steps

Status: 2026-10-13, after the founder's review of 2026-10-12
([review-a-flow-editor-10-12-26.md](review-a-flow-editor-10-12-26.md)). Sections 1 to 4 hold
what is built; section 5 lists the choices the founder has not seen; section 6 is open.

The generator is `src/aflow/` (`generateProfile`, `resolveParams`, `hasSecondFill`,
`validateParams`, `serializeParams` / `parseParams`, `DEFAULT_PROFILES`). Sources: `code.tcl`
and the `profiles/A-Flow____default-*.tcl` files of Jan3kJ/A_Flow and the
`A-Flow____default-*.json` files in Decaid 0.8.8's `assets/defaultProfiles` (read
2026-10-12); de1app's `de1plus/machine.tcl`, `binary.tcl` and `de1_de1.tcl` and the rig's
`rest_v1.yml` (read 2026-10-13).

## 1. Parameters and the step fields they set

Step names are the plugin's. A step that is off is not in the list. "Detail" marks a value
that only detail mode edits (review, "values to be changable"); its default is what the plugin
fixed, so a profile that leaves these alone generates the steps it did before the review.

| Phase | Parameter (`AFlowParams`) | Default | Sets |
|---|---|---|---|
| (shot) | `dose` | 16 g | nothing in the profile. It belongs to the workflow (`context.targetDoseWeight`) and is saved with the parameters |
| Fill | `fillFlow` | | Fill: `flow` |
| | `fillExitPressure` (move-on pressure, detail) | 3 bar | Fill: `exit` pressure over it |
| | `fillTemperature` | | `temperature` of Pre Fill and Fill |
| | `fillTime` (detail) | 15 s | Fill: `seconds` |
| Infuse | `infusePressure` | | Infuse: `pressure` |
| | `infuseTime` | | Infuse: `seconds` |
| | `infuseWeight` (move-on weight) | | Infuse: `weight` |
| | `infuseTemperature` (detail) | follows `fillTemperature` | Infuse: `temperature` |
| | `infuseFlowLimit` (detail) | 1 ml/s | Infuse: `limiter.value` |
| 2nd fill | `secondFillFlow` | | 2nd Fill: `flow` |
| | `secondFillExitPressure` (move-on pressure, detail) | 2.5 bar | 2nd Fill: `exit` pressure over it |
| | `secondFillTemperature` (detail) | follows `infuseTemperature` | `temperature` of 2nd Fill and Pause |
| | `secondFillTime` (fill time, detail) | 15 s | 2nd Fill: `seconds` |
| | `pauseDuration` (pause time, detail) | 0 s (off); 15 s in floral and when switched on | Pause: `seconds`. Over 0: the steps 2nd Fill and Pause exist |
| | `pauseExitFlow` (pause ends at flow under, detail) (founder, 2026-10-13) | 1 ml/s, the plugin's constant | Pause: `exit` flow under it |
| Pressurize | `pourPressure` (target pressure) | | Pressure Up: `pressure` |
| | `rampTime` | | Pressure Up: `seconds`. Under 1 s: the step Flow Start exists |
| | `rampTemperature` (detail) | follows `pourTemperature` | Pressure Up: `temperature` |
| Flow | `pourFlow` (start flow) | | Pressure Up: `exit` flow over it. Flow Start: `flow`, and `exit` flow over it - 0.1 |
| | `pourEndFlow` (flow gradient, detail) | follows the toggle `flowUp` | Flow Extraction: `flow` |
| | `pourTime` (detail) | 60 s | Flow Extraction: `seconds` |
| | `pourTemperature` | | `temperature` of Flow Start and Flow Extraction |
| | `stopWeight` | | profile: `target_weight` |
| | `pourPressureLimit` (max pressure, detail) | follows `pourPressure` | Flow Extraction: `limiter.value` |
| Options | `flowUp` (toggle) | | Flow Extraction: `flow` = 2 x start flow (up) or 0 (down), while `pourEndFlow` follows it |
| | setting "first-step workaround" | off | on: the step Pre Fill exists. It is an option of `generateProfile`, not a parameter, and is not saved with a profile |

**The 2nd fill is on when the pause time is over 0** (founder, 2026-10-12). There is no
separate toggle value: `hasSecondFill` reads `pauseDuration`, and the toggle in the editor
writes 15 s or 0 s.

**A value that follows another one is `null` in the parameters.** `resolveParams` is the one
place that fills it in; a number makes the value its own, and setting it back to `null` makes
it follow again. So the simple mode's two temperatures still move whole groups of steps, and
today's two-temperature profiles are unchanged. The 2nd fill follows the infuse temperature
(founder), which itself follows the fill temperature.

**The flow gradient is the flow the Flow Extraction step moves to**, in ml/s, reached over the
flow time (a `smooth` step runs from the start flow to its target). The toggle's two states
are the end flows 2 x start flow (flow up) and 0 (flow down), exactly as before; while
`pourEndFlow` is `null` the toggle decides, and a number in detail mode replaces it. The
toggle in simple mode therefore has to set `pourEndFlow` back to `null`.

## 2. Constants

All in `src/aflow/constants.ts`, the same in `code.tcl` and in the plugin's and Decaid's
profile files.

| Step (spec 3.2 item) | Pump, transition | Fixed values |
|---|---|---|
| every step | | `sensor` coffee, `volume` 100, `limiter.range` 0.6, `weight` 0 except Infuse |
| Pre Fill (0) | flow, fast | 8 ml/s, 1 s, limiter 8 bar, no exit |
| Fill (1) | flow, fast | limiter 8 bar |
| Infuse (2) | pressure, fast | no exit |
| 2nd Fill (3) | flow, fast | limiter 3 bar |
| Pause (4) | pressure, fast | 1 bar, limiter 1 ml/s |
| Pressure Up (5) | pressure, smooth | no limiter (0) |
| Flow Start (6) | flow, fast | 10 s, no limiter (0), on when ramp time < 1 s, exit margin 0.1 ml/s |
| Flow Extraction (7) | flow, smooth | no exit |
| profile | | `version` "2", `beverage_type` espresso, `tank_temperature` 0, `target_volume` 100, `target_volume_count_start` 2 |

The profile is written the way Decaid's API returns one: JSON numbers, only the pump's own
target per step (`flow` or `pressure`), and `exit` only where the plugin's `exit_if` is 1.

### Ranges (`src/aflow/validate.ts`)

| Values | Range | From |
|---|---|---|
| temperatures (all five) | 50-105 °C | founder, 2026-10-12 |
| times (all six) | 0-127 s | founder, 2026-10-12: each is one profile step. de1app encodes a step's seconds in one byte that holds 127 at most (`convert_float_to_F8_1_7`, `binary.tcl`) |
| weights | 0-1000 g | plugin |
| dose | 0-30 g in steps of 0.1 | plugin |
| pressures, move-on pressures, max pressure | 0 to the maximum pressure | plugin |
| pump flows (fill, 2nd fill, start flow) | 0.1 ml/s to the maximum flow | 0.1 is the plugin's minimum for the pour flow |
| infuse flow limit, end flow | 0 to the maximum flow | 0 is a limiter that is off, and the end of flow down |

**Where the machine maxima come from.** They are an argument of `validateParams`
(`DEFAULT_MACHINE_LIMITS`).

- **12 bar: confirmed.** de1app, `de1plus/machine.tcl` line 196: `set ::de1(maxpressure) 12`
  (branch main, commit 5b09f6a, read 2026-10-13). The plugin's pressure controls use
  `-max $::de1(maxpressure)`.
- **8 ml/s: not confirmed, kept.** The plugin's flow control uses
  `-max $::de1(max_flowrate_v11)`, and de1app sets that to **20** today (`machine.tcl` line
  164; a comment in `de1_de1.tcl` calls it a uniform ceiling for every machine). The same
  comment says a DE1's wire format holds 15.9375 ml/s at most (`convert_float_to_U8P4`,
  `binary.tcl`). So no source gives 8; it stays as the editor's cap until the founder
  decides (section 6).
- The rig's `rest_v1.yml` (Decaid 0.8.8, schema `ProfileStep`) gives no minimum or maximum
  for pressure, flow, seconds or temperature.

## 3. The default profiles

`src/aflow/defaults/default-*.json`, in this order. In all five: dose 16 g, fill flow 8,
2nd fill flow 8, and every detail value at its default of section 1.

| | floral | light | medium | dark | 46mm |
|---|---|---|---|---|---|
| fill temperature | 95 | 95 | 93 | 93 | 93 |
| infuse pressure | 0 | 3 | 3 | 3 | 3 |
| infuse time, weight | 60 s, 6 g | 60 s, 6 g | 60 s, 3.6 g | 10 s, 2 g | 6 s, 2 g |
| 2nd fill (pause) | on (15 s) | off | off | off | off |
| pour pressure, ramp time | 9.5, 10 s | 9.5, 10 s | 10, 10 s | 9, 5 s | 9, 40 s |
| pour flow, temperature | 3, 95 | 3, 95 | 2, 93 | 2, 88 | 1.8, 88 |
| stop weight | 48 | 48 | 42 | 36 | 32 |
| flow | up | up | up | down | down |

- **floral** is new: light with the 2nd fill on and infuse pressure 0 bar.
- **46mm** is the plugin's very-dark, renamed, with pour pressure 9 bar, ramp time 40 s and
  flow down. Its other values are very-dark's.
- **like-dflow is removed.**
- light, medium and dark equal the plugin's files, and the regression tests compare them with
  the plugin's steps, written by hand. floral and 46mm have fixture tests only: the plugin
  never wrote them.

Decaid ships the plugin's five profiles with a Pause step of 15 s where the plugin's files
have 0 s (found on 2026-10-12; why was not looked into). The 3.0 defaults do not start from
Decaid's copies.

## 4. The saved string

JSON, `{"aflow":"3.0","params":{...}}`, with a fixed key order (the order of section 1) and
every key present; a value that follows another one is written as `null`. Reading checks the
version and the types, not the ranges. The format changed on 2026-10-13 and kept the version
`3.0`: there is no `secondFill` key any more, and a string written before lacks the new keys
and is rejected. No 3.0 profile had been saved.

**Where it is stored (D7, 2026-10-13): the string is the profile's `notes`**, the whole of
them, as spec 3.2 allows; the founder confirmed the notes on 2026-10-13 (request 166).
`src/editor/storage.ts` is the one module that knows the place:

- `readParams(profile)` gives the parameters, or nothing when the profile is not A-Flow 3.0:
  the notes are not this string, a value is out of its range, or the profile's steps and
  target weight are not what the generator writes for the parameters (with or without the
  Pre Fill step). The last check keeps a profile whose steps were changed in another editor
  from opening with old parameters. Only a profile with readable parameters is edited.
- `writeParams(client, profile, params)` stores the profile with the string. Decaid's id of
  a profile is a hash of its steps and target weight, so for steps that exist the `POST`
  answers with the old record and its old notes; the notes are then changed with
  `PUT /api/v1/profiles/{id}` (research.md, section 11).

The five defaults are stored with their string as well (`defaultProfile` in
`src/shell/profiles.ts`), in place of the plugin's notes text. The dose is read from the
string when a profile is loaded and written to the workflow (`context.targetDoseWeight`);
the stop weight is the profile's `target_weight` and the workflow's `targetYield`.

## 5. Choices the founder has not seen

1. **"Follows" is `null`**, not a copy of the other value (section 1). The editor adds two
   rules on top (`src/editor/edit.ts`): a drag in simple mode moves a temperature group as a
   whole and keeps the distances between its phases (founder, 2026-10-12), and setting a
   temperature in detail mode first gives the phase that followed it its own value, so that
   each phase is edited by itself.
2. **The flow gradient is an end flow in ml/s**, not a slope in ml/s per second and not a
   factor. With flow up, the end flow keeps following the start flow (2 x) until it is set.
3. **The 2nd fill has no toggle value**; the pause time is the switch. Switching it off
   forgets the pause time, and switching it on starts at 15 s.
4. **Names in the parameters** stay the old ones where a value existed (`pourPressure` is the
   pressurize target, `pourFlow` the start flow, `rampTime` the pressurize time); the labels
   on screen are the editor's.
5. **Flow Start** (the step for a ramp under 1 s) belongs to the flow phase: it has the flow
   temperature, not the pressurize temperature.
6. **The limiters may be 0**, which switches them off (infuse flow limit, max pressure).
   A fill, 2nd fill or flow time of 0 s leaves a step of 0 s in the profile; only a pause of
   0 s removes steps.
7. **Fixed and not in the review's list:** the pressure limiters of Fill (8 bar) and 2nd Fill
   (3 bar), the Pause's 1 bar and its 1 ml/s limiter, and Flow Start's 10 s.
8. **Times are not rounded.** The machine keeps tenths of a second up to 12.7 s and whole
   seconds above (de1app's encoding); the generator writes what it gets.
9. **A derived end flow is not range-checked:** flow up with a start flow over half the
   maximum flow gives a target above it (start flow 5 gives 10), as in the plugin.
10. **Ids and titles:** `default-floral` and `default-46mm`, "A-Flow / default-46mm".
11. **In the editor**, after its rework to the review (2026-10-13): it opens on floral (the
    first default); the detail panel shows every value of section 1; a pause of 0 s typed
    in detail mode switches the 2nd fill off.
12. **The pause ends at a flow under `pauseExitFlow`** (founder, 2026-10-13, request 169:
    'Pause ends at flow under X (editable)'). It is the review's "move on pressure pause": a
    v2 step has one exit, and the Pause step's is a flow. The value is 1 ml/s in every
    default, the plugin's constant, so every existing profile generates the same steps. It is
    edited in detail mode only, in the 2nd fill's panel, in steps of 0.1 ml/s, with the range
    of the other flows (0.1 ml/s to the maximum flow). A saved string without the value reads
    as 1 ml/s; the version stays '3.0' (`ADDED_FIELDS` in `src/aflow/codec.ts`).

## 6. Open for the founder

- **The pause's exit flow, choices of 2026-10-14:** its label is 'pause ends at flow under',
  its step 0.1 ml/s, and it sits last in the 2nd fill's panel. The Pause step's 1 ml/s flow
  limiter stays fixed, so an exit flow over 1 ml/s may end the pause as soon as it starts.
- **The maximum flow.** 8 ml/s is not from a source; de1app allows 20 (section 2). Which cap
  should the editor use?
