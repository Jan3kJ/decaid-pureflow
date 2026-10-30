# A-Flow 3.0

A-Flow 3.0 turns a set of parameters into the steps of a Decaid v2 profile. The generator is
`src/aflow/` (`generateProfile`, `generateSteps`, `resolveParams`, `hasSecondFill`,
`validateParams`, `serializeParams` / `parseParams`, `readSteps`, `DEFAULT_PROFILES`). Its
fixed values come from the A-Flow plugin for de1app (`code.tcl` and the
`profiles/A-Flow____default-*.tcl` files of Jan3kJ/A_Flow), which agree with the
`A-Flow____default-*.json` files in Decaid 0.8.8's `assets/defaultProfiles`. The machine
maxima come from de1app (`de1plus/machine.tcl`, `binary.tcl`, `de1_de1.tcl`).

## 1. Parameters and the step fields they set

Step names are the plugin's. A step that is off is not in the list. "Detail" marks a value
that only detail mode edits; its default is the value the plugin fixed, so a profile that
leaves these alone generates the steps the plugin does.

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
| | `pauseExitFlow` (pause ends at flow under, detail) | 1 ml/s | Pause: `exit` flow under it |
| Pressurize | `pourPressure` (target pressure) | | Pressure Up: `pressure` |
| | `rampTime` | | Pressure Up: `seconds`. Under 1 s: the step Flow Start exists |
| | `rampTemperature` (detail) | follows `pourTemperature` | Pressure Up: `temperature` |
| Flow | `pourFlow` (start flow) | | Pressure Up: `exit` flow over it. Flow Start: `flow`, and `exit` flow over it - 0.1 |
| | `pourEndFlow` (end flow, detail) | follows the toggle `flowUp` | Flow Extraction: `flow` |
| | `pourTime` (detail) | 60 s | Flow Extraction: `seconds` |
| | `pourTemperature` | | `temperature` of Flow Start and Flow Extraction |
| | `stopWeight` | | profile: `target_weight` |
| | `pourPressureLimit` (max pressure, detail) | follows `pourPressure` | Flow Extraction: `limiter.value` |
| Options | `flowUp` (toggle) | | Flow Extraction: `flow` = 2 x start flow (up) or 0 (down), while `pourEndFlow` is `null` |
| | setting "first-step workaround" | off | on: the step Pre Fill exists. It is an option of `generateProfile` / `generateSteps`, not a parameter, and is not saved with a profile |

**The 2nd fill is on when the pause time is over 0.** There is no separate toggle value:
`hasSecondFill` reads `pauseDuration`. The editor's toggle writes 15 s or 0 s; switching it
off forgets the pause time, switching it on starts at 15 s.

**A value that follows another one is `null` in the parameters.** `resolveParams` is the one
place that fills it in; a number makes the value its own, and setting it back to `null` makes
it follow again. The chain is: the infuse temperature follows the fill temperature, the 2nd
fill temperature follows the infuse temperature, the ramp temperature follows the pour
temperature, the pour pressure limit follows the pour pressure, and the end flow follows the
toggle.

**The flow gradient is the flow the Flow Extraction step moves to**, in ml/s, reached over
the flow time (a `smooth` step runs from the start flow to its target). The toggle's two
states are the end flows 2 x start flow, rounded to 0.1 (flow up), and 0 (flow down). While
`pourEndFlow` is `null` the toggle decides; a number replaces it. A derived end flow is not
range-checked: flow up with a start flow over half the maximum flow gives a target above it.

**Other behaviour of the generator**

- Flow Start (the step for a ramp under 1 s) belongs to the flow phase: it has the flow
  temperature, not the pressurize temperature.
- A limiter of 0 is off (infuse flow limit, max pressure). A fill, 2nd fill or flow time of
  0 s leaves a step of 0 s in the profile; only a pause of 0 s removes steps.
- Times are not rounded. The machine keeps tenths of a second up to 12.7 s and whole seconds
  above (de1app's encoding); the generator writes what it gets.
- The profile is written the way Decaid's API returns one: JSON numbers, only the pump's own
  target per step (`flow` or `pressure`), and `exit` only where the plugin's `exit_if` is 1.

## 2. Constants

All in `src/aflow/constants.ts`.

| Step | Pump, transition | Fixed values |
|---|---|---|
| every step | | `sensor` coffee, `volume` 100, `limiter.range` 0.6, `weight` 0 except Infuse |
| Pre Fill | flow, fast | 8 ml/s, 1 s, limiter 8 bar, no exit |
| Fill | flow, fast | limiter 8 bar |
| Infuse | pressure, fast | no exit |
| 2nd Fill | flow, fast | limiter 3 bar |
| Pause | pressure, fast | 1 bar, limiter 1 ml/s |
| Pressure Up | pressure, smooth | no limiter (0) |
| Flow Start | flow, fast | 10 s, no limiter (0), on when ramp time < 1 s, exit margin 0.1 ml/s |
| Flow Extraction | flow, smooth | no exit |
| profile | | `version` "2", `beverage_type` espresso, `tank_temperature` 0, `target_volume` 100, `target_volume_count_start` 2 |

### Ranges (`src/aflow/validate.ts`)

| Values | Range | Note |
|---|---|---|
| temperatures (all five) | 50-105 °C | |
| times (all six) | 0-127 s | each is one profile step; de1app encodes a step's seconds in one byte that holds 127 at most (`convert_float_to_F8_1_7`, `binary.tcl`) |
| weights | 0-1000 g | |
| dose | 0-30 g in steps of 0.1 | |
| pressures, move-on pressures, max pressure | 0 to the maximum pressure | |
| pump flows (fill, 2nd fill, start flow, pause exit flow) | 0.1 ml/s to the maximum flow | 0.1 is the plugin's minimum for the pour flow |
| infuse flow limit, end flow | 0 to the maximum flow | 0 is a limiter that is off, and the end of flow down |

**Machine maxima** are an argument of `validateParams` (`MachineLimits`).

- The maximum pressure is 12 bar, de1app's `set ::de1(maxpressure) 12`.
- The maximum flow is the skin's setting `maxFlow`, 8 ml/s by default, held to 4-20 ml/s
  (`machineLimits`, `MAX_FLOW_RANGE`). 20 is de1app's `max_flowrate_v11`; a DE1's wire
  format holds 15.9375 ml/s at most (`convert_float_to_U8P4`, `binary.tcl`).
- A profile that is read (opened, imported) is checked against the widest limits
  (`WIDEST_MACHINE_LIMITS`, maximum flow 20), so lowering the setting hides no profile.

## 3. The default profiles

`src/aflow/defaults/default-*.json`, in this order, titled "A-Flow / default-<name>". In all
five: dose 16 g, fill flow 8, 2nd fill flow 8, and every detail value at its default of
section 1. Their author is "Janek".

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

- **floral** is light with the 2nd fill on and infuse pressure 0 bar.
- **46mm** is the plugin's very-dark with pour pressure 9 bar, ramp time 40 s and flow down.
- light, medium and dark equal the plugin's files; the regression tests compare them with the
  plugin's steps, written by hand (`plugin-expected.ts`). floral and 46mm have fixture tests
  only.
- Decaid ships the plugin's profiles with a Pause step of 15 s where the plugin's files have
  0 s. The skin's defaults do not start from Decaid's copies. Decaid's bundled A-Flow
  profiles are skipped by the import (section 6).

The defaults have no stored record. The picker lists them with their parameters as
`metadata`, as a stored record would have them, so they load and show their dose like a
stored A-Flow 3.0 profile.

## 4. The saved parameters

The parameters are JSON, `{"aflow":"3.0","params":{...}}`, with a fixed key order (the order
of section 1, the toggle last) and every key present; a value that follows another one is
written as `null`. `encodeParams` / `decodeParams` work on the object, `serializeParams` /
`parseParams` on the string. Reading checks the version and the types, not the ranges
(`validateParams` does that). Unknown keys are ignored, and a string without `pauseExitFlow`
reads it as 1 ml/s (`ADDED_FIELDS` in `src/aflow/codec.ts`); the version stays `3.0`.

**Where they are stored:** in the profile record's `metadata` as `aflow` and `params`, beside
its `source`, and not in its `notes`. `src/editor/storage.ts` is the one module that knows the
place.

- `readParams(profile, metadata)` gives the parameters, or nothing when the profile is not
  A-Flow 3.0: no parameters in the metadata or the notes, a value out of its range, a target
  weight other than `stopWeight`, or steps that are not what the generator writes for the
  parameters (with or without the Pre Fill step). The last check keeps a profile whose steps
  were changed in another editor from opening with old parameters.
- Parameters in a profile's `notes` as the codec's string (an earlier storage format) still
  read; the next save moves them to the metadata and keeps the rest of the notes.
- The workflow's profile has no record and so no metadata: the copy the skin loads carries the
  string on the first line of its notes (`workflowNotes`), so the editor, the unsaved-edits
  warning and the history can read the profile on the machine from Decaid alone.
- `writeProfile` / `writeParams` store a profile. Decaid's id of a profile is a hash of its
  steps and target weight, so for steps that exist the `POST /api/v1/profiles` answers with
  the existing record. Then: the same title with other content is changed with
  `PUT /api/v1/profiles/{id}` (which replaces the metadata whole); a hidden record is taken
  over and made visible; a visible profile with another title is left alone and a
  `StepsTakenError` is thrown, unless it is the record being renamed.

The dose is read from the parameters when a profile is loaded and written to the workflow
(`context.targetDoseWeight`); the stop weight is the profile's `target_weight` and the
workflow's `targetYield`.

## 5. Reading older A-Flow profiles

`readSteps` (`src/aflow/reader.ts`) is the inverse of the generator: a profile's steps in,
parameters out. It reads the plugin's profiles of every version (1.0 to 1.3: Fill, Infuse,
Pressure Up, Pressure Decline, Flow Start, Flow Extraction; 1.4 on: Pre Fill, Fill, Infuse,
2nd Fill, Pause, then the same four) and the generator's own.

A profile is A-Flow by its step names in order. Every value read must give, through the
generator, the same steps again; otherwise the profile is not read and the reason is named.
What 3.0 has not got is dropped and reported (`Dropped`): Pre Fill (the setting writes it
again), ramp down (its time is added to the ramp up), a Pause without its 2nd Fill, and an
infuse volume other than 100 ml. The plugin switches a step off with 0 s, the generator
leaves it out; both read as off. The dose of a profile read from steps is 16 g.

A profile that holds 3.0 parameters whose steps were changed elsewhere is not read from its
steps: it opens in the step editor. So does an A-Flow profile whose steps cannot be read, with
a status line that gives the reason (`stepEditorReason`).

`planImport` (`src/editor/import.ts`) is the settings' import: it converts every visible
profile that is A-Flow by its steps and has no 3.0 parameters, storing each as 3.0 with the
old one as its parent, hidden. Decaid's bundled profiles and any under the title of one of the
skin's defaults are skipped; steps that cannot be read are listed as unread.

## 6. The editor

- It opens on floral, the first default.
- Simple mode edits the values of section 1 that are not marked detail, on the graph and in
  the chips; detail mode shows and edits every value (`src/editor/DetailPanel.svelte`).
- A drag in simple mode moves a temperature group as a whole and keeps the distances between
  its phases (the fill temperature with infuse and 2nd fill, the pour temperature with
  pressurize); `dragValue` in `src/editor/edit.ts`.
- Setting a temperature in detail mode first gives the phase that followed it its own value,
  so each phase is edited by itself (`setValue`).
- Setting an end flow replaces the toggle and sets `flowUp` from it; the toggle sets
  `pourEndFlow` back to `null` (`toggleFlow`).
- The pause time is the 2nd fill's switch: a pause of 0 s typed in detail mode switches the
  2nd fill off. The pause-ends-at-flow-under value is last in the 2nd fill's panel, in steps
  of 0.1 ml/s. The Pause step's 1 ml/s flow limiter is fixed, so an exit flow over 1 ml/s may
  end the pause as soon as it starts.
- `describeAFlow` makes the short text the picker shows under the graph from a profile's
  values. It is made when it is shown and never stored.
