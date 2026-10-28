# pureflow: product spec

Status: draft 2026-10-11

Carried over from draft 0.5 (2026-10-10) in the team repository, which was written from the
founder's answers on 2026-10-07, the founder's sketches
([a-flow-editor.drawio](a-flow-editor.drawio)) and notes on the DSx2 skin. The findings of the
first research task are in [research.md](research.md). Design and feature content are still
partly open: see [Open questions](#8-open-questions).

## 1. What it is

A full skin for [Decaid](https://github.com/decentespresso/decaid), Decent's companion app for
the DE1 espresso machine. It is a minimal, single-purpose interface for making espresso, built
around a new editor for **A-Flow**, the founder's profile family
([Jan3kJ/A_Flow](https://github.com/Jan3kJ/A_Flow), a de1app Tcl plugin).

- **User:** the founder first. Published openly (GitHub, public) for other DE1 owners.
- **Device:** an Android tablet running Decaid. Windows and Linux are development and test
  targets.
- **Product of the team:** the only product while trading is frozen. It takes the AMS share of
  the weekly budget that trading does not use. AMS development continues on what this product
  breaks.

## 2. Principles

1. **Minimal.** Every control on screen earns its place. Fewer screens, fewer taps, large
   targets for wet hands. What is rarely used goes one level down, not on the main screen.
2. **A-Flow first.** The editor speaks A-Flow's terms (infuse, pour, ramp), not raw profile
   steps. You edit the curve, not the steps.
3. **The machine is the truth.** The UI shows the machine's state from the snapshot stream;
   it never assumes a state it did not read.
4. **Works without the machine.** Everything except a real shot can be developed and tested
   against Decaid's device simulation.

## 3. Scope of version 1

Approved 2026-10-11

### 3.1 The skin (full replacement of the default skin)
**Design:** landscape only and dark theme only in v1. Portrait and a light theme wait for
version 2.

**Design target (founder, 2026-10-12):** a Lenovo IdeaPad tablet with an 11 inch display of 2560 x 1600 physical pixels, that is a 1280 x 800 CSS-pixel landscape viewport at device scale factor 2. The design is optimised for it first; every layout is relative to the viewport, because it must scale to other sizes later.

| Area | v1 content |
|---|---|
| Home | no start: the DE1 is started at the machine; a stop button while something runs. The machine's state in one line: the state, group and steam temperature, the tank's water level and the scale's weight, or a warning without a scale; the same line is on the steam page. Top right a menu with settings, the steam switch and machine off, which is sleep (3.7; the scale entry went with 3.7), and left of it the current profile's name, which opens the **profile picker**, with a pen that opens the editor. **Steam** is a tab on the right edge, the mirror of the history's. Dose and target weight are not shown on home. The graph takes the rest of the screen (founder, 2026-10-13) |
| Espresso | live graph (pressure, flow, weight flow, temperature) from `/ws/v1/machine/snapshot`, with the live weight from `/ws/v1/scale/snapshot`, timer, stop at weight. The graph and the timer start when water moves, not while the machine heats; the profile's targets are dashed lines with their quantity; an optional legend sits under the graph, on by default (founder, 2026-10-13). The graph, live and in the history, draws the weight flow in g/s (the scale frame's `weightFlow`) in yellow instead of the weight, on the scale of flow and pressure ('ml/s · g/s'), with no target weight line; the screen keeps the weight in g as a number (founder, 2026-10-14) |
| Steam | stop (steam is started at the machine) (founder, 2026-10-13), a steam graph, and **the steam timer set from the milk's weight**: see 3.4 |
| Scale | connect state, tare (a 400 `block_tare_during_shot` is a notice, not an error). The page is removed in 3.7 (founder, 2026-10-16) |
| Profiles | list, select, load to the machine (`PUT /api/v1/workflow`) (founder, 2026-10-13) |
| Shot history | **an overlay, not a page:** a tab on the left edge of the screen (or a swipe from left to right) opens it; it closes when an item is selected or on a tap outside it. It holds **a list of previous shots; tapping one loads its profile, beans and grinder setting and shows its graph**: see 3.5 |
| Settings | a settings page with categories. **Steam** is one (3.4), and **Profile** holds the first-step workaround (3.2) and the editor's row of profiles to start from, up to five (founder, 2026-10-13); the others hold the few settings the founder needs. Everything else stays in Decaid's own settings. The settings stay in the tablet's localStorage; every change is backed up to Decaid's KV store (`pureflow/settings-backup`, with its time and the skin's version), a start without settings takes them from the backup and says so, and the page shows the backup's time with 'Restore from backup' (founder, 2026-10-14). The page names the skin's version, from its manifest, small in its top right corner (founder, 2026-10-14) |
| Sleep / wake | sleep button, wake on touch; brightness only where `platformSupported.brightness` |

### 3.2 The A-Flow profile editor (A-Flow 3.0)
The skin defines a new profile version, **A-Flow 3.0** (founder, 2026-10-10). It starts from
the de1app plugin and moves away from it in four places:
- **The Pre Fill step is off by default.** In the plugin it is a 1 s step at 8 ml/s before
  the fill, a workaround for a firmware bug that skipped a profile's first step (`code.tcl`:
  "prefill can be removed in future, if 'skip first step' bug is fixed"). It is no longer
  needed. A setting turns it back on in case the bug returns.
- **Ramp down is removed.** The founder no longer uses it.
- **The flow of the first fill is editable.** The plugin fixed it.
- **2nd fill and pause are one phase**, with an editable fill flow and pause duration. The
  plugin fixed both at 15 s.

Importing old de1app A-Flow profile files is **out of scope**.

Phases and their editable values:

| Phase | Values | Unit |
|---|---|---|
| (shot) | dose, 16 g by default (founder, 2026-10-12) | g |
| Fill | flow, move-on pressure, temperature, time (founder, 2026-10-12) | ml/s, bar, °C, s |
| Infuse | pressure, time, move-on weight, temperature, flow limit; volume is not shown (founder, 2026-10-12) | bar, s, g, °C, ml/s |
| 2nd fill (optional, one phase with its pause) | flow, move-on pressure, temperature, fill time, pause time (founder, 2026-10-12), the flow the pause ends under: 'pause ends at flow under X', 1 ml/s by default, with the range of the other flows (founder, 2026-10-13) | ml/s, bar, °C, s, s, ml/s |
| Pressurize | target pressure, time, temperature (founder, 2026-10-12) | bar, s, °C |
| Flow | start flow, flow gradient, time, temperature, stop at weight, max. pressure (founder, 2026-10-12) | ml/s, ml/s, s, °C, g, bar |
| Options | 2nd fill; flow up or flow down | toggles |

The pause duration and the fill's move-on pressure are edited in detail mode only (founder, 2026-10-12). So is the flow the pause ends under (founder, 2026-10-13).

Ranges: temperatures 50-105 °C and every time 0-127 s, each being one profile step (founder, 2026-10-12). The others follow the plugin (`code.tcl`): pressures and flows up to the
machine's maximum, weights 0-1000 g, dose 0-30 g in 0.1 steps.

Generated v2 profile, in order (the plugin's logic without ramp down; the exact mapping of
the new values to steps is fixed in D3 and reviewed by the founder):

0. **Pre Fill** - only with the setting "first-step workaround" on: 1 s at 8 ml/s, fill
   temperature, as in the plugin.
1. **Filling** - fill temperature, fill flow.
2. **Infuse** - infuse pressure; exits on time or weight.
3. **2nd Fill** - only with the toggle; its fill flow; the same temperature as the fill and infuse phases
   (founder, 2026-10-11).
4. **Pause** - only with the toggle; the pause duration.
5. **Ramp Up** - to pour pressure over the ramp time; exits when flow > pour flow.
6. **Pouring start** - 10 s only if ramp time < 1 s; otherwise skipped.
7. **Pouring** - the flow target is 2x pour flow with **flow up** (the flow rises slowly
   through the pour) and 0 with **flow down** (it declines slowly), as in the plugin; limited
   by pour pressure; ends at stop weight.

Editor layout, from the founder's sketch (two modes on one graph):
- **The graph is the editor.** Time runs left to right, with one column per phase: fill,
  infuse, 2nd fill, pressurize, flow.
- **Colour carries the meaning: blue is flow, green is pressure, red is temperature.** The
  same colours are used in the live shot graph and in history.
- **Simple mode (default).** There are no visible handles. The user touches a line and drags
  it: a level line up or down changes that phase's flow, pressure or temperature, and a phase
  border left or right changes a duration (infuse time, ramp time; not the pause duration (founder, 2026-10-12)). While a
  line is dragged, a small pop-up shows the current value. The infuse weight and the stop
  weight are value chips where they act (sketch: 6 g and 36 g). Two toggles sit under the
  graph: **2nd fill**, and one that reads **flow up** or **flow down** depending on its state.
  - The flow line falls to zero with a vertical edge at the end of the fill and rises from zero with a vertical edge at the start of the 2nd fill (founder, 2026-10-13).
  - The flow line is not drawn during the infuse phase, and the flow line's label in the flow phase is left aligned, in both modes: it is the value at the left edge (founder, 2026-10-12).
  - The time axis follows the set times: the fill is thin (3-4 s in practice, whatever its time limit), infuse is often the longest part, the 2nd fill with its pause is about as thin as the fill, and the flow phase takes the rest. Every column keeps a minimum width for a finger (founder, 2026-10-12).
  - The temperature lines move together: fill with infuse and 2nd fill, pressurize with flow. A drag keeps the distances between the phases that detail mode set (founder, 2026-10-12).
- **Detail mode.** The same graph. A row of phase buttons selects a phase, which is
  highlighted in the graph. A panel on the right lists every value that can be changed in that
  phase as an editable chip: the values of the table above (founder, 2026-10-12). Volume is left out.
  - The same lines as in simple mode can be dragged, and the pause duration too (founder, 2026-10-12).
  - Tapping a chip's value opens an on-screen number pad to type it, with the unit and the allowed range; plus and minus stay for small changes (founder, 2026-10-12).
  - Each phase has its own temperature here; dose is one value of the shot (founder, 2026-10-12).
- **Both modes.** A **save as** action sits next to the mode switch: it asks for a name and saves the edited profile under it (founder, 2026-10-12). The **profile steps** button opens a panel with the steps under the graph; the panel is closed whenever the editor opens, and with the setting 'profile steps' off the button is not shown (founder, 2026-10-13). The profile's name in the top bar opens the profile picker; a profile chosen there is loaded, and the editor comes back on it when it is an A-Flow profile (founder, 2026-10-13).

Editor behaviour:
- Edit the values, see the resulting curve update live, save as a named A-Flow profile.
  There is no 'load to machine': 'save' and 'save as' load the saved profile to the machine,
  and leaving the editor loads the values on screen when they differ from those it opened
  with (founder, 2026-10-13).
- The temperature axis shows 80 to 100 °C. A temperature outside, set by a drag or typed in detail mode, widens it to the next 5 °C step with at least 1 °C of room, up to the allowed 50-105 °C; it is 80 to 100 again once no temperature is outside. A drag may pass the lane's edge, and the axis widens under it (founder, 2026-10-14).
- Start from five default profiles (supplied as JSON fixtures), in this order: floral, light, medium, dark, 46mm (founder, 2026-10-12). light, medium and dark are the plugin's, converted to 3.0.
  - The row is configurable in the settings: up to five A-Flow profiles, the five defaults until it is changed. 'Save as' does not add a profile to it; a saved profile is reached through the profile picker (founder, 2026-10-13).
  - floral is new: light with the 2nd fill on and infuse pressure 0 bar (founder, 2026-10-12).
  - 46mm is the plugin's very-dark, renamed, with pour pressure 9 bar, ramp time 40 s and flow down (founder, 2026-10-12).
  - The plugin's like-dflow is removed (founder, 2026-10-12).
  - The 2nd fill is off in every default except floral, and the dose is 16 g in every default (founder, 2026-10-12).
- A saved profile is a normal Decaid v2 profile (`POST /api/v1/profiles`). The A-Flow
  parameters and the version (3.0) travel with it so it re-opens in the editor (in the
  profile's `notes` (founder, 2026-10-13, request 166)), and Decaid's profile
  lineage records edits.
- Other profiles can be selected and loaded, but only A-Flow profiles are editable in v1.

### 3.3 Out of scope for v1
Reviewed by the founder on 2026-10-18; items no longer out of scope say where they went.
- Import of de1app A-Flow `.tcl` profiles. (Converting the old A-Flow profiles Decaid already
  holds to 3.0 is planned: review 2026-10-18, item 6.)
- Editing non-A-Flow profiles: built in version 1.1 (3.6, E2-E6).
- Managing a bean and grinder catalogue: **built** (founder, 2026-10-18; review 2026-10-18,
  items 19 and 20; U9, 3.9): list, add, edit, archive and the pick for the next shot, on Decaid's
  `/api/v1/beans` and `/api/v1/grinders`. The history's filter by bean and grinder is U10; a
  bean from a photo is U13.
- Hot water and flush / rinse: built, a view in version 1.1 (3.6) and a hot water page (3.7).
- Rating a shot (Decaid's 0-10 enjoyment scale).
- Portrait layout and a light theme.
- Plugins, sensors, camera. Plugin settings are built (S2c, settings category 8) and so is the
  sensor calibration (S2c); external sensors stay out. The tablet's camera is planned only for
  the bean catalogue, low priority: a photo of the bag, read with Tesseract.js to pre-fill the
  typed name and roaster (review 2026-10-18, item 20).
- The ghost curve of the profile's last shot in the editor: version 2 (founder, 2026-10-13).
- iOS stays out (founder, 2026-10-18).

### 3.4 Steam page
From the founder's sketch and daily use of this feature in DSx2:
- **Left:** a steam graph with pressure and temperature.
- **Right, top:** optional favourites, three timer chips for a quick setting without a scale
  (sketch: 25 s, 50 s, 30 s).
- **Right, below:** the current steam timer, the live scale weight, **the detected mug size
  (s, m or l)** with its weight, and the milk (weight minus mug), then a **set timer** button.
- **Three mug sizes, detected automatically** from the scale weight. Auto-detection is a must.
  The size steps up at the midpoint between two full mugs, a mug of size n holding n drinks
  (founder, 2026-10-15): medium above `((s + 1 drink) + (m + 2 drinks)) / 2`, large above
  `((m + 2 drinks) + (l + 3 drinks)) / 2`. Built in version 1.1 (3.6).
- **The calculation, as DSx2 does it:** `timer = reference seconds / reference milk grams x
  (scale weight - mug weight)`, rounded to whole seconds. The timer is written to the
  machine's steam settings.
- **Settings, category Steam:** the three mug weights, the calibration (reference seconds and
  grams of milk), the milk of one drink, and the favourite timers.
- **Defaults (founder, 2026-10-12):** mug weights s = 150 g, m = 225 g, l = 275 g; milk of one drink 150 g; calibration 26 s for 180 g of milk.

### 3.5 Shot history
What the founder likes in DSx2: a list of previous shots, and one tap on an entry
- loads its **profile**, **beans** and **grinder setting** as the current ones, and
- shows the **graph of the last shot** made with it.

**An entry is one combination of profile and bean.** A shot with another bean or another
profile creates a new entry. The grinder setting is optional and belongs to the entry: changing
it updates the entry and does not create a new one (the founder has one grinder). So the list
is as long as the number of combinations in use, not the number of shots, and it is the
quickest way to repeat a good shot.

### 3.6 Version 1.1

Added by the founder on 2026-10-15, after version 1 was built.

| Area | v1.1 content |
|---|---|
| Water view | While hot water or flush runs, Home shows what runs instead of only **stop**: a **countdown ring around the stop button** (elapsed time against the target duration of `hotWaterData` or `rinseData`, with "Flush 6 / 10 s" inside), and **an animated picture**: an SVG group head with a water stream whose speed and width follow the measured flow, so it stops when the machine stops. For hot water a cup below fills to the volume so far (flow added up over time) against the target volume, or to the scale's weight when a scale is connected; for flush the stream falls into the drip tray. The stream's colour follows the mix temperature. Starting stays at the machine |
| Step editor for other profiles | Every profile that is not A-Flow opens in a **step editor ported from Streamline** (`decentespresso/streamline-js`, ISC): one card per step (pump flow or pressure, temperature, limiter, time, volume, weight, exit condition), adding, deleting and reordering steps, a curve preview, and the profile's settings (title, notes, target weight and volume, tank temperature). It saves through the skin's existing save path (lineage, the unsaved-edits warning). A-Flow profiles keep opening the A-Flow editor. Streamline's ISC copyright notice is kept |
| Step editor: SCRIPT tab | Streamline's SCRIPT tab, ported with the step editor: the profile's steps as text, editable, with a graph preview; a text that does not parse is shown as an error and is not saved. Replaced by 3.7: values as toggles and pickers, as in Streamline |
| A-Flow values in `metadata` | The editor's A-Flow values move from the profile's `notes` to the profile record's `metadata` (founder, 2026-10-15), after a rig check that `metadata` survives `PUT`, `/api/v1/profiles/export` and the data export and import. Profiles that hold the values in `notes` are moved on their next save and their `notes` cleared of them. **Fallback, only if `metadata` does not hold:** every A-Flow step is kept in the profile and a disabled step gets the time 0, as the de1app A-Flow editor does, so the values travel in the steps |
| Steam mug detection | the midpoint rule of 3.4 |
| Maximum flow | the editor's maximum flow is a setting, 8 ml/s by default; newer Decent machines drive more |
| Reconnect | when Decaid closes a stream with an error, the skin retries by itself for 30 s, then shows 'Decaid closed the connection' with the **reconnect** button |
| Default dose | a default dose in the skin's settings; the dose of each shot is in Decaid's shot record and the history |

Still out in 1.1: Streamline's `.tcl` import.

Built in E2 (2026-10-16), where 3.6 leaves the detail open: a profile is "A-Flow" when the
A-Flow editor can read its A-Flow 3.0 values; every other profile, Decaid's bundled de1app
"A-Flow / …" profiles too, opens in the step editor, from home, from the picker and from the
unsaved-edits warning ([research.md](research.md) 17.5).

Built in E3 (2026-10-16), where 3.6 leaves the detail open: the curve preview is a band above
the step cards, drawn by the skin's shot graph from the steps (`src/steps/curve.ts`); a step is
drawn as long as its time, and a step without a time 10 s long (Streamline's rule), whatever its
volume, weight or exit, and is shaded. The settings are a SETTINGS tab beside the cards: title,
notes, target weight (0-1000 g), target volume (0-500 ml), tank temperature (0-110 °C); 'save'
stores the title shown there, so it renames the profile, and is off while another visible
profile has that title ([research.md](research.md) 17.15).

Built in F1 (2026-10-16), where 3.6 leaves the detail open: mug detection is `mugSteps` and
`detectMug` in `src/steam/timer.ts`. The maximum flow is the setting `maxFlow`, 4 to 20 ml/s
(de1app allows 20), on the settings page's Profile line; it sets every flow range of the
A-Flow editor and its graph (`machineLimits` in `src/aflow/validate.ts`); the step editor
keeps Streamline's own ranges. A profile is read within 20 ml/s, so one saved with a flow
above a lowered maximum still opens: the editor shows the saved value, the graph's scale
reaches it, and ± or the number pad bring it into the range. The default dose is the setting
`defaultDose`, 18 g, 5 to 30 g: when the skin reads the workflow (the stream opens, home or
steam opens) and it has no dose, the skin writes the default (`doseToSet` in
`src/shell/profiles.ts`); a dose the profile brought on its load, or the user set, is kept.
Reconnect: a stream the gateway closes after an error frame is tried again with the stream's
backoff (1, 2, 4, 8, 16 s, the last one shortened to end at 30 s, `REFUSED_RETRY_MS` in
`src/api/stream.ts`); meanwhile home says 'Decaid is not reachable', and after 30 s 'Decaid
closed the connection' with **reconnect**, which starts another 30 s.

Built in M2 (2026-10-16), where 3.6 leaves the detail open: a stored record's `metadata` is
`{ source: 'pureflow', aflow: '3.0', params }`, `params` the 26 values as the codec writes
them (the 2nd fill's too while it is off), and its `notes` hold only what a user wrote there.
A record stored before the rename has `source: 'decaid-skin'`, the skin's former name, and
still counts as the skin's own (founder, 2026-10-18; `SKIN_SOURCES` in `src/shell/profiles.ts`).
Reading takes `metadata` first, then a line of the `notes` that is the codec's string, and the
steps must still be the generator's for the values. A profile of version 1 is moved on its next
save: the values go to `metadata`, the other lines of its `notes` stay. Decaid's workflow holds
a profile without its record, so the copy the skin loads into the workflow (and so each shot's
copy) carries the values as the first line of its `notes`; that is how the editor, the
unsaved-edits warning and the history read what is on the machine. All of it is in
`src/editor/storage.ts` ([research.md](research.md) 18.5).

Built in V1 (2026-10-16), where 3.6 leaves the detail open: the water view replaces home's
graph while hot water or flush runs, the picture on the left, the ring with **stop** inside on
the right (`src/shell/Water.svelte`, numbers in `src/shell/water.ts`). The ring counts whole
seconds and stays full past the duration. The cup takes the scale's weight as the scale sends
it, g as ml. The stream's colour runs from the flow blue at 20 °C to the temperature red at
90 °C, linear between; it stands still at 0.05 ml/s and below and is full at 10 ml/s. Home
does not open by itself when hot water or flush starts on another screen
([research.md](research.md) 19).

Built in E4 (2026-10-16), where 3.6 leaves the detail open: SCRIPT is a tab between cards and
settings, the text on the left and the curve preview on the right. The text is Streamline's
sentences, typed, read by the skin's own parser (`src/steps/script.ts`, grammar in
[research.md](research.md) 17.8): it is written from the profile when the tab opens and parsed on
every change; a text that parses is the editor's profile at once (preview, cards, 'save'). A text
that does not parse lists its errors with their lines, keeps the preview on the last text that
parsed, turns 'save' and 'save as' off and refuses leaving the editor; opening another tab drops
the broken text and shows the steps that last parsed. A value out of its range is an error unless
the profile's step at that place already has it, as on a card ([research.md](research.md) 17.16).

### 3.7 Founder's review of 2026-10-16

From the founder's review of the built version 1.1 ([review-10-16-26.md](review-10-16-26.md)).

| Area | Change |
|---|---|
| Steam page | **Bugs:** the steam graph stops when steam stops, and the last steam time (top right) is the steam's own time, not longer. **Layout:** the steam timer sits in the centre of the right column, in line with **set timer**. **Countdown:** while steam runs the timer counts down from the set seconds. **Adjust buttons:** above **set timer**, three buttons, by default −8 s, −4 s and +5 s, configurable in the settings (Steam); a selected one adds its amount to the calculated timer or to the selected favourite (use case: the milk's temperature changes what the calculation needs). **Graph:** the temperature scale is 140 to 170 °C. **Swipe:** a swipe from the right edge opens the steam page, as the swipe from the left edge opens the history. *Built (R1):* the steam run ends with the first frame that does not steam: another state, or the substates `pouringDone`, `puffing` and `pausedSteam` in which the real DE1 stays in steam after it (`steams` in `src/steam/run.ts`). The countdown is the machine's timer minus the run's time, labelled "steam left". The adjust amounts are the setting `steam.adjustments`, whole seconds from −60 to 60, typed with a sign key on the number pad; the milk of one drink moved into the calibration's row so that the settings page still fits. One adjust button is selected at a time, a tap on it clears it, and it is cleared when a steam ends; selecting writes nothing: the chips and 'set timer' show and send the seconds with the amount, held within 1 to 255 s. The tare button sits beside the scale weight. The swipe is on home only, from the right fifth, as the history's |
| Home menu | two shortcuts in the menu: **steam off** (the steam heater off, and on again) and **machine off** (sleep if the DE1 cannot be switched off through Decaid). *Built (R4):* Decaid 0.8.8 has no request that switches the DE1 off, only `sleeping` (research.md 22), so **machine off** is sleep, labelled so, and replaces the menu's 'Sleep' entry. The steam switch writes the workflow's steam temperature: 0 is off, on writes the temperature the heater had before (the setting `steam.heaterTemperature`, 150 °C by default). It reads 'Steam off' or 'Steam on' with a line saying whether the heater is on or off, from the machine's own `targetSteamTemp` |
| Water view | the animated group head and stream go, for flush and hot water; the countdown ring stays, and the values sit inside the stop button: temperature, flow, time, and for hot water the weight in g. *Built (R3):* the ring alone, centred in home's panel, still fills with the time so far against the target duration as V1 drew it. The stop button is dark with a red edge and red **stop**, and shows the kind, the time ('6 / 10 s'), the mix temperature, the flow and, for hot water while a scale is connected, the scale's weight to 0.1 g; flush shows no weight (`waterValues` in `src/shell/water.ts`) |
| Hot water page | a page of its own, opened from home by a button of its own: the steam tab is split, steam keeps most of it and hot water takes the rest, at the bottom. Its settings are temperature, flow, time and **stop at weight**. Stop at weight can be set from the last measured espresso shot by a ratio: a shot of 40 g and 1:2 give 80 g. Three ratio favourites, configurable, by default 1:2, 1:2.5 and 1:3. A **tare** button. Starting stays at the machine. *Built (R5):* the hot water tab is the bottom quarter of the right edge. Stop at weight is `hotWaterData.volume`: with a scale Decaid tares it at the start and stops hot water at that many grams by itself (setting `stopHotWaterAtWeight`, on by default; research.md 21), so the skin stops nothing. The last shot is the newest shot record's `annotations.actualYield`, read when the page opens; the weight is whole grams. The ranges are Streamline's (50-95 °C, 5-120 s, 10-500 g), flow 0.1-10 ml/s. The favourites are the setting `hotWater.ratios`, 1:0.5 to 1:10, shown on the settings page as the category Hot water. The page has stop while something runs, as the steam page |
| Scale page | removed completely. **Tare** moves: a tap on the weight in the state line tares the scale when one is connected, and the steam and hot water pages have a tare button. *Built (R2):* the weight is a button only while a scale is connected, with a finger's target larger than its text; without a scale the warning stays plain text. All tares go through one function (`Skin.tare` in `src/shell/skin.svelte.ts`), which does nothing without a connected scale. A tare Decaid blocks during a shot is a notice under the page that was tapped (home or steam); a skin that showed the scale page opens home |
| Settings | Streamline's settings page is ported, so that almost everything in it can be set without switching the skin; the skin's own settings go into its skin category, as Streamline has one. *Built (S2a):* the categories 1 Quick Adjustments, 3 Calibration (without sensor calibration), 4 Machine (USB), 6 Skin and 9 Miscellaneous (Decaid settings, brightness, wake lock), with Streamline's numbers, in a left column with the chosen category's subcategories under it; the category scrolls in the panel beside it, and the page opens on the category opened last (`src/settings-page/`). A change is written at once and read back. The flush of Quick Adjustments has temperature, flow and duration (founder, 2026-10-17), the workflow's `rinseData`, which Decaid passes to the machine (research.md 20.12). *Built (S2b):* 2 Connections (the machine and scale lists from `/ws/v1/devices`, connected first and remembered absent ones last; Search, Connect, Disconnect, Forget behind a confirm, the preferred switch; the scale's power mode, 'scale required' and Wi-Fi scales by address), 4's Machine Information and charging status, and 5 Maintenance (clean, descale, transport mode: Start after a confirm, Cancel while it runs, the steps the machine reports; a sleeping machine is woken first, and the descale switches the steam heater off and waits for 60 °C, as Streamline does). `Maintenance.svelte` takes the skin and a procedure, so it can be opened on its own (research.md 20.14). *Built (S2c), which completes S2:* 3's Sensor Calibration (temperature, pressure, flow: the stored correction, the one before this page's last write, the machine's live reading; Capture while the machine runs, the measured value typed, the outcome shown, Apply after a confirm and read back, Restore), 8 Extensions with one subcategory Plugins (a card per plugin Decaid lists, Visualizer and Shot Uploader among them: version, state, Enabled, a held update approved after a confirm, and a control per declared setting, string, number, boolean, enum and secure, a secure value never shown), 9's Presence Detection (presence, sleep after 1-120 min, the wake schedules added, edited, switched and deleted) and 10 Updates (the machine's firmware build, the bundled builds with their eligibility, Install of the recommended build after a confirm with its progress and Cancel, no file upload; Decaid's own update as `GET /api/v1/update` reports it, without asking GitHub) (research.md 20.15) |
| A-Flow editor, detail mode | "flow gradient to" is called **end flow**. The flow line of the last step is split: dragging its left half changes the start flow, its right half the end flow. The buttons above the graph go: a tap on a step is enough. *Built (A1):* the split is at the middle of the flow phase's column, in detail mode only; simple mode keeps one line for the start flow. The line's end follows the finger: the graph draws only the first 30 s of the flow time, so a drag of the right half moves the end flow by the inverse of that share (twice the finger for 60 s). The end flow is written at the line's right end, the start flow at its left. A drag sets the end flow as the panel does: from the value the toggle gave, with **flow up**/**flow down** following it. Both stay in their ranges, the flows under the setting `maxFlow`. Without the phase buttons of 3.2 a phase is selected by a tap on its column, its name under the plot included (`buildCurve` and `dragTarget` in `src/editor/curve.ts`) |
| A-Flow editor, infuse | the infuse phase is drawn by its move-on weight, not its time, because the weight ends it long before a time of 60 s; the founder's estimate is 1 g ≈ 5 s, 6 g ≈ 25 s. The **infuse to** weight can be dragged; a tap still shows the +/− buttons. *Built (A2):* the estimate is 4 s per gram plus 1 s, the straight line through the two points, never longer than the infuse time; without a move-on weight the time is drawn (`infuseWeightSeconds` in `src/editor/curve.ts`). The column's label still reads the time limit. The chip is dragged left or right: the weight moves as far as keeps the border under the finger (4 s of the time axis is 1 g); a press that moves less than 10 px is a tap. A drag of the infuse border starts where it is drawn; while it stays at or right of the weight's estimate the time limit is kept, so a touch does not cut 60 s to 25 s (`borderTarget`) |
| A-Flow editor, disabled phase | a phase dragged to 0 s is off: it collapses (today it stays as wide as the fill phase), and a button re-enables it with 5 s. *Built (A2):* the phases with a border that reaches 0 s, infuse and pressurize; the 2nd fill is off with its pause and keeps its toggle. A phase that is off has no width, no label and no border to take hold of; its button, '+ infuse' or '+ pressurize', sits where it collapsed, in the phase-name row under the axis (Z10, 3.14); in detail mode it also selects the phase (`phaseOff`, `REENABLE_SECONDS`) |
| Step editor, cards (low priority) | the arrow buttons go: a tap on the next card selects it, and the selected card always moves to the centre. *Built (E5):* the open card's header is its number and name only; a tap on a closed card opens it, and the row scrolls (the browser's smooth scroll) until the open card's centre is on the row's centre, held within what the row can scroll, so the first and last cards stop at the row's ends (`centredScroll` in `src/steps/centre.ts`). It centres again whenever another card opens: a tap, a step added, moved or deleted; returning to the cards tab places it at once. Moving stays in the open card, as text buttons **move left** and **move right** in its footer beside **delete step** and **+ step after** (research.md 17.17) |
| Step editor, SCRIPT (low priority) | as in Streamline: the steps' sentences are not edited as text; each value is a toggle (a chip that cycles) or opens a value picker (the number pad). This replaces the editable text of 3.6 and E4's parser. *Built (E6):* each step is its number and name and Streamline's sentences in its order (the volume marker, temperature, pump, limit, maximum, exit), Streamline's words and units ('mL/s', 'sec'), numbers with one decimal (`stepSentences` in `src/steps/sentences.ts`). Three state words cycle: the sensor (Coffee, Water), the pump (flow quickly, flow slowly, pressure quickly, pressure slowly, as the card's chip) and the exit (pressure over, pressure under, flow over, flow under; not off, as in Streamline, since off removes the sentence). Every number opens the editor's number pad with the card's range; a limit or maximum set to 0 leaves its sentence, and a limit, maximum or exit that is off is added on the cards, as in Streamline. The temperature's verb (Set, Increase, Decrease, Maintain) follows the step before and is not a chip. `src/steps/script.ts` and its tests are gone (research.md 17.18) |

### 3.8 Founder's review of 2026-10-17

From the founder's notes of 2026-10-17 ([review-10-17-26.md](review-10-17-26.md)), sent while
version 1.1 with the review of 2026-10-16 was in use. The two screenshots the notes name did not
arrive. Where a note leaves a choice open, the default below is built unless the founder says
otherwise (section 8). Where a note changes something 3.1, 3.2 or 3.7 decided, it says so; those
paragraphs and track R stay as built history.

The founder answered the questions on 2026-10-18: the font sizes as
recorded under T3 below, and 'rest of the question, agree to your proposal': every other default
of this section stands, except where 3.9 overrides it (T2's per-phase values, T7's save feedback,
T9's exit).

**Espresso graph: scale and the end (T1).** The shot graph's pressure and flow scale ends at
10 bar and opens to 12 only when a drawn value (pressure, flow, weight flow or a target) goes
over 10; the live graph draws only the shot itself, not the seconds after it, as the history's
graph of the same shot does (founder, 2026-10-17). Today `ShotGraph.svelte` has a fixed
`yMax = 12` with ticks at quarters (`mainTicks`); 10 needs ticks of its own (0, 2, 4, 6, 8, 10).
The live series comes from `recordFrame` in `src/shell/shot.ts`, which adds every frame in state
`espresso` "whatever its substate" until the state changes; the machine stays in `espresso` for
a few seconds after the stop, and those frames are the tail. The history's `seriesOf`
(`src/history/entries.ts`) draws Decaid's recorded measurements, which end earlier. The builder
finds the substates of that tail on the rig (8.2's simulated substates; the real DE1's
`pouringDone` / `ending` as the steam run's `steams` in `src/steam/run.ts` treats them) and ends
the live shot at its first frame; the timer stops there too. **Time axis:** the running graph's
axis starts at the shot's expected length instead of 30 s, so a 50 s shot is not rescaled at
30, 40 and 50 s (`timeAxis` in `src/graph/axis.ts`, `minSeconds`). Default: the duration of the
last shot with that profile's title in the history (the entries of `src/history/entries.ts`),
else the profile's estimate (the A-Flow editor's drawn length, `buildCurve` in
`src/editor/curve.ts`, for an A-Flow profile; the step editor's curve, `src/steps/curve.ts`,
for others), else 30 s, rounded up to 10 s; it still grows in steps of 10 s past that (section 8).
*Built (T1, research.md 23):* the simulated machine has no tail (it goes from `pouring` to
idle); the live shot ends at the first frame in `pouringDone` or out of espresso (`shotOver`,
`src/shell/shot.ts`), and the history's graph is cut there too. Over 10 the scale has ticks
every 2 up to 12. An A-Flow profile's estimate is its phases before the pour as the editor
expects them plus the 30 s of pour the editor draws (`drawnShotSeconds`).

**Espresso shot: an overlay that stays (T2).** The shot's values and the stop button are an
overlay over home, not a page of their own: it opens when a shot starts and stays after the shot
until the user taps the screen or the next shot starts, so the screen does not jump back to home
when the shot stops (founder, 2026-10-17). This changes 3.1's 'Espresso' row and D6's screen:
today `followMachine` in `src/shell/nav.ts` opens the screen `espresso`
(`src/shell/Espresso.svelte`) on entering espresso and returns to home on leaving it, and home
then shows the 'last shot' graph. Default: the overlay holds the graph and the side panel of
`Espresso.svelte` as it is now, over home's graph area, with home's state line still visible;
after the shot the stop button gives way to the shot's summary, and a tap anywhere closes it to
home with the shot as its 'last shot' (section 8). **Per-phase values:** the summary shows, as
Streamline does, per phase the duration, weight, maximum pressure and flow (founder,
2026-10-17). As Streamline's table of the founder's screenshot (3.9): rows Preinfusion,
Extraction and Total; columns seconds, grams, ml, °C (lowest → highest), ml/s and bar (start →
peak → end), computed as Streamline's `shotData.js` does: only frames in `preinfusion` or
`pouring`, the preinfusion ending with the frame before the first in `pouring`, the volume summed
from the flow, the extraction's weight the total minus the preinfusion's (research.md 24).
*Built (T2, research.md 24):* the screen `espresso` is gone; `ShotOverlay.svelte` takes home's
graph area under its header while `Skin.shotOpen`, which opens on entering espresso and is
closed by a tap anywhere once the shot is over. After the shot the stop button gives way to
'tap anywhere to close' and the table stands under the graph. The weight in the cup is the
highest scale weight since the shot ended (Streamline takes the latest), so a cup taken away
does not empty the total. A running hot water or flush keeps its ring in home's graph area.

**Heating state (T3).** The state line says **Heating** while the machine heats, not Idle: on
home until the group reaches the espresso target minus 3 °C, on the steam page until the steam
heater reaches the steam target minus 3 °C (founder, 2026-10-17). Today `statusOf` in
`src/shell/machine.ts` names the machine's own state (`STATE_LABEL`), and the DE1 reports `idle`
while it heats, so the skin must derive it: on home `groupTemperature <
targetGroupTemperature - 3` of the snapshot, on the steam page `steamTemperature` against the
machine's `targetSteamTemp` (`/ws/v1/machine/shotSettings`, read already for the steam switch in
`src/shell/steam-heater.ts`) minus 3. Only an `idle` machine is shown as heating; a steam
heater that is off (`targetSteamTemp` 0) is not heating. `StateLine.svelte` gets which target to
compare from its page. The tone is `busy`, not `ok`.
*Built (T3):* `isHeating` and `heatingStatus` in `src/shell/machine.ts` (`HEATED_MARGIN` 3 °C,
heating while strictly more than 3 °C under the target); `Skin.statusFor` gives a page its
status, `StateLine` takes `heat` ('group' on home, 'steam' on the steam page), and the steam
page's dot on the left edge follows it. A steam target that is not known yet counts as off. The
hot water page keeps the machine's own state: the founder named home and steam only.

**Home: tabs and font sizes (T3).** The history and steam (and hot water) tabs on the edges of
home are thinner and their labels larger (founder, 2026-10-17); today they are `Home.svelte`'s
edge tabs of about 5 % of the width with a small vertical label (screenshot
home.png (screenshot in the team repository)). The font sizes are reviewed and aligned: the founder's example is
home's state line (`StateLine.svelte`, 1.1rem) smaller than the profile picker's name beside it
(`Home.svelte`, 1.3rem). The note's sentence breaks off at "labels like"; the default is one type
scale in `src/app.css` (a few rem sizes as custom properties, for values, labels, titles and
big numbers) used by home, steam, hot water and the overlay, with the state line and the
profile's name the same size (section 8). *Answered (founder, 2026-10-18, message 41):* 'labels
like steam, group in the status row may be smaller as of today. Means not everything gets the
same font size.' So the type scale keeps a smaller size for labels: in the state line the labels
('group', 'steam', 'tank', 'scale') stay smaller than their values, and the state and the values
are the profile name's size.
*Built (T3):* the scale is six custom properties in `src/app.css`: `--text-label` 0.85rem
(a value's label, hints, notices), `--text-body` 1.1rem, `--text-value` 1.3rem (values, the
state, the profile's name, chips, the edge tabs' labels), `--text-title` 1.6rem, `--text-large`
2.2rem (stop buttons, the ring's numbers) and `--text-big` 3.6rem (a page's big number; hot
water's values were 4.2rem). The scale's warning 'not connected, tap to retry' is a hint at the
label's size, so that the state line still fits beside the profile at 1280 × 800. Home's edge
tabs are 3.5rem wide (56 CSS pixels, a finger's target; 4rem before) with labels at 1.3rem
(0.9rem before); the left edge of the other pages keeps 4rem for the way back.

**Profile picker: filter, preview, select (T4).** The picker gets a filter field: typing
"light" leaves the profiles whose title contains it, without regard to case (founder,
2026-10-17). A tap on a profile no longer loads it: it selects it and shows its description
(the profile's `notes`, without the A-Flow line the skin writes there, `src/editor/storage.ts`)
and a small preview chart of its targets, without labels, only to see the steps and their
values; a **load** button loads the selected one (founder, 2026-10-17). This overrides the
founder's 'a tap in the picker loads the profile at once' of 2026-10-13 (3.1 'Profiles', 8
'Loading from the editor'). Today `Profiles.svelte` loads on the tap (`load`, after
`skin.mayLoad()` for unsaved edits, which then moves to the load button) and its detail panel
shows steps, stop weight and dose. The preview is the step editor's curve preview
(`src/steps/curve.ts` drawn by `ShotGraph` with `preview`) for every profile, as small as the
panel allows; the filter is typed with the tablet's own keyboard. Built (`r17-profile-picker`):
the filter (`filterProfiles` in `src/shell/profiles.ts`, spaces around it ignored) sits over
the list and is not kept: the picker opens with the whole list, the loaded profile selected.
A selected profile the filter hides leaves the panel and cannot be loaded until it shows
again. The panel shows title, author, steps, stop weight and dose as before, then the
preview (`StepPreview` with `bare`: `ShotGraph` without ticks, units and times, steps'
borders kept), then the description (`profileDescription`: `notesText`, trimmed; nothing
when empty), then **load** at the bottom (`data-testid="load-profile"`), which asks
`skin.mayLoad()` first.

**A-Flow defaults kept in the app (T5).** The five A-Flow 3.0 defaults are not stored as
profiles in Decaid any more; they live in the skin (`DEFAULT_PROFILES`,
`src/aflow/defaults/`) and are listed by the picker from there, so an update of the skin can
change their values without overwriting a profile a user changed. A default is loaded as it is;
edited, it is saved only with 'save as' under another name (founder, 2026-10-17). So the
picker's offer 'A-Flow 3.0 defaults … not in Decaid yet' with its **add** button
(`missingDefaults`, `saveDefaults` in `src/shell/profiles.ts`) goes. The name clash the founder
saw is not one of names: Decaid's profile id is a hash of the steps and the stop weight
(research.md 11.1), so posting `A-Flow / default-light` with the steps of the founder's
`test-light` returns `test-light`'s record, and the picker selects it (`selectedId =
added[0]?.id`); with the defaults out of Decaid it cannot happen. Today the editor already holds
the defaults itself (its entries in `Editor.svelte`, `startChoices` in `src/editor/start.ts`)
and `unsavedOnMachine` (`src/editor/unsaved.ts`) knows a default by its title, so loading a
default is `loadProfile` with `defaultProfile(entry)` and no record. Default: the picker lists
the five defaults first, marked 'default'; copies of them already stored in Decaid (titles
`A-Flow / default-…`) are left in Decaid and not listed, since the app's default of that title
is the one shown; Decaid's bundled de1app 'A-Flow / …' profiles are listed as before
(section 8). *Built (T5, research.md 25):* `pickerEntries` lists the five first with the tag
'A-Flow 3.0 default' and hides every stored profile under a default's title, which includes
Decaid's bundled plugin `A-Flow / default-light`, `-medium` and `-dark` (as 3.9 counts them as
the default); the other bundled A-Flow profiles are listed. A default loads with `loadEntry`,
its parameters going with it in the workflow's notes; nothing is posted.

**Swipe navigation (T6).** Home, steam and hot water are one row of pages, from left to right
hot water, home, steam; a swipe left or right moves to the neighbour with an animated slide
(founder, 2026-10-17). This extends 3.7's right-edge swipe to the steam page (R1,
`src/history/swipe.ts`, on home only) to all three pages; the edge tabs stay. The left-edge
swipe on home opens the shot history (3.1). Default: a swipe that starts in home's left fifth
(`SWIPE_EDGE`) still opens the history; every other horizontal swipe on these three pages moves
pages, so from home hot water is reached by a swipe that starts right of that fifth or by its
tab (section 8). The slide follows the finger and finishes or springs back when it is let go;
a swipe never starts on a drag of a control (the steam page's chips, the number pad). `go` in
`src/shell/skin.svelte.ts` and `App.svelte` show one screen at a time today; the three pages
are then one strip. *Built (T6):* one gesture for the pages and the history, decided in
`src/shell/swipe.ts` (which replaces `src/history/swipe.ts`) and handled in `App.svelte`. A page
follows the finger after 10 CSS pixels more along than across; let go, it moves on after a
quarter of the width or a flick of 0.5 px/ms, and otherwise springs back in 220 ms; at the
row's ends it gives a fifth of the move and springs back. The neighbour is drawn beside the
page only while it comes in, inert. With `prefers-reduced-motion` nothing slides: the page
changes when the finger lets go. A control is a field or slider, a dialog (the number pad), a
backdrop (home's menu), anything with `touch-action: none` (the editor's graph and chips) and a
list that scrolls; the shot graphs of home and steam only show and are not controls, nor are
buttons: a swipe may start on one, and the button is then not pressed
(swipe-mid-slide.png (screenshot in the team repository)).

**A-Flow editor: steps panel and save feedback (T7).** In the profile steps panel the last line
'The shot stops at … g.' (`StepList.svelte`'s footer) goes; the stop weight is written in the
exit column of the flow step, which saves a line (founder, 2026-10-17). 'save' on a default
gives feedback instead of doing nothing: it shows a hint to use 'save as', since a default is
saved under a new name. For other profiles 'saved … and loaded' stands next to the save buttons,
not on a line of its own, or is a short pop-up (founder, 2026-10-17). Today 'save' is disabled
for a default (`canSave` in `Editor.svelte`) and the result is `notice`, a paragraph under the
graph (`editor-notice`). Default: 'save' stays tappable for a default and shows the hint for a
few seconds beside the buttons; the save result is a short text beside the buttons that goes
after 4 s; a failure stays until the next action. The step editor (`src/steps/`) keeps its own
notices. *Overridden by 3.9 (item 8):* the save result and the hint stand in one status line
under the row of default profiles, not beside the buttons; the timing stays. Built (T7,
2026-10-19): the last step of the steps panel, the flow step that runs until the end, reads
'stops at … g' in its exit column; 'save' on a default writes 'A default is not changed: use
‘save as’ to save it under a new name.' for 4 s and stores nothing; the status line is one line
of 1.5 rem under the header (`editor-status`, `src/editor/status.ts` for its timing), empty when
there is nothing to say, so the graph keeps its place; it holds every notice of the A-Flow
editor, also leaving's failed load and 'Decaid did not answer', which stay as failures do.

**Shot history: faster (T8).** The history opens without the delay: the newest 20 shots are
read and shown first, the older ones after them, and the shots are kept in memory instead of
being read every time the overlay opens (founder, 2026-10-17). Today `History.svelte` calls
`readShots` (`src/history/entries.ts`) on every mount, which pages through up to
`HISTORY_SHOTS` (500) summaries before `groupShots` shows anything. Default: the shots are held
by the skin (`src/shell/skin.svelte.ts`) for the session, read in the background once after the
start; a shot that ends adds its record; an entry list built from the first 20 is replaced when
the rest arrive, without moving the list under the finger.
*Built (T8, research.md 26):* `ShotCache` (`src/history/shots.svelte.ts`, held by the skin as
`Skin.shots`) is the one place the history's list, the restore's record and the expected
duration's last shot (`lastShotSeconds`, `src/shell/expected.ts`) come from. It reads when the
machine stream opens: `GET /api/v1/shots?limit=20&offset=0`, then pages of 100 up to 500 shots
(`HISTORY_SHOTS`). Later reads (the stream opened again, the overlay opened) ask
`GET /api/v1/shots/latest` and read pages of 20 from the newest only when that shot is not held.
A shot that ends looks for its record every 2 s for up to 30 s. Records with measurements are
kept for the 20 shots read last. While the older shots are read the list ends with 'Reading the
older shots …' (`history-more`); entries are ordered by their newest shot, so the older shots
only add entries below. The expected duration takes the newest held shot with the title, so a
profile whose last shot is older than the newest 500 starts at its estimate.

**Menu: clean (T9).** After the settings port, home's menu gets a shortcut to the maintenance
page's clean (S2b, `Maintenance.svelte`, research.md 20.10), and that page shows the tank's water
level, warns when it is under 350 ml, as a clean uses about 300 ml, and says to empty the drip
tray before starting (founder, 2026-10-17). The tank's level is in mm (`WaterLevels`,
`src/api/types.ts`); Streamline shows it in ml too (its `waterTankUnit`, research.md 20.3), so
the builder takes Streamline's conversion from mm to ml. The warning does not block Start.
*Built (T9):* the menu's **Clean** (under Settings) opens the settings page on 5 Maintenance,
whose first procedure is the clean. The clean in `Maintenance.svelte`, here and in the settings
page alike, shows 'Water tank: … ml', under 350 ml 'Under 350 ml: a clean uses about 300 ml.
Fill the tank first.' in red, and 'Empty the drip tray before starting.'; the level is the
skin's stream `/ws/v1/machine/waterLevels` (Decaid 0.8.8 has no REST request for it), turned
into ml with Streamline's table, rounded to whole mm (`src/settings-page/water-tank.ts`). A
level not read shows '–' and no warning.

**Menu: exit (T9).** Home's menu gets **Exit**, which leaves the Decaid app and sends the
machine to sleep, or off if that is possible (founder, 2026-10-17). Off is not: Decaid 0.8.8 has
no request that switches the DE1 off (research.md 22). Leaving the app is offered by the host,
not the gateway: `window.decentApp.exitToDashboard()`, which S2a's settings page offers as 'Go
to dashboard' where it exists (research.md 20.3, `SettingsPage.svelte`); it goes to Decaid's
dashboard, it does not close Decaid. Default: **Exit** sends `sleeping` (`Skin.machineOff`) and
then calls `exitToDashboard`; where the host does not offer it the entry is not shown, and
**Machine off** stays as it is (section 8). *Overridden by 3.9 (items 1 and 2):* there is no
**Exit**; T9 builds the clean shortcut only, **Machine off** becomes **Machine sleep** (U1), and
a second entry, **Machine and app sleep** (U4), takes Exit's place.

**Flush duration: built.** The flush's flow and duration in Quick Adjustments (founder,
2026-10-17) were built in S2a (`r16-settings-port-a`), recorded in 3.7's 'Settings' row; not
planned again.

### 3.9 Founder's review of 2026-10-18

From the founder's review of hand-over 0.2.0 ([review-10-18-26.md](review-10-18-26.md)), 20
items, checked by the founder; the item numbers are the review's. Where an item leaves a choice
open, the default below is built unless the founder says otherwise (section 8). Where an item
changes something 3.7 or 3.8 decided, it says so and wins; those paragraphs stay as history.
The bugs (items 1, 3, 10, 16) are built first, together (U1).

**Menu: machine sleep (item 1, bug; U1).** The menu's **Machine off** is renamed **Machine
sleep**, and its line says that Decaid cannot switch the DE1 off and that the button sends only
the machine to sleep, not the app (founder, 2026-10-18). Today it is R4's entry in
`src/shell/Home.svelte`, 'Machine off' with the line 'sleeps: Decaid cannot switch the DE1
off', calling `Skin.machineOff` (`sleeping`, research.md 22.3); only the words change, and the
method may be renamed with them. This overrides 3.7's label 'machine off'. The line goes in 3.10
(founder, 2026-10-20): each entry is its label alone.

**Menu: machine and app sleep (item 2; U4).** A second entry sends both the machine and the app
to sleep (founder, 2026-10-18). This replaces 3.8's **Exit** (T9): Decaid cannot be closed by a
skin nor switch the DE1 off, and 'the app sleeps' is what the founder asks for in its place, so
3.9 wins and T9 builds the clean shortcut only. What the skin has (research.md 13, 20.3): the
machine's `sleeping`, its own sleep screen (`.asleep` in `App.svelte`, brightness
`SLEEP_BRIGHTNESS` 5 where `platformSupported.brightness`), and Decaid's wake lock
(`POST`/`DELETE /api/v1/display/wakelock`, `wakeLockOverride`, Decaid's `keepAwake`), which keeps
the tablet's screen on. Default: **Machine and app sleep** sends `sleeping`, sets the brightness
to 0 instead of 5 and lets the tablet's screen go off by Android's own timeout, releasing
Decaid's wake lock for the sleep and putting it back as it was at the wake; a touch wakes both,
as the sleep screen does today. The builder checks on the rig what `GET /api/v1/display` reports
before and after, and whether Decaid takes the wake lock back by itself while the machine sleeps;
if the wake lock cannot be released, the entry only dims to 0 and its line says so.
`exitToDashboard` is not used (section 8). *Built (U4):* the entry is under **Machine sleep**,
offered when that one is, with the line 'the screen goes dark and then off by the tablet's own
timeout; a touch wakes both'. It sends `sleeping`; when the machine sleeps, `Dimmer`
(`src/shell/dimmer.ts`, the one sleep path) switches off what keeps Decaid's wake lock in sleep,
the override and the setting `keepAwake` where they are on (Decaid holds the lock while the
machine is awake anyway, research.md 13.1), and sets the brightness to 0
(`APP_SLEEP_BRIGHTNESS`); at the wake it switches them on again and the brightness goes to 100,
as after a machine sleep. What is to be put back is kept in `localStorage`
(`pureflow.app-sleep`, not a setting), so a reload while asleep puts it back at the next wake.
Overridden by 3.10 (founder, 2026-10-20, messages 42 and 43): 'app sleep' is the Asleep screen
as 0.3.0 shows it; the brightness 0, the released wake lock and the line go, and **Machine
sleep** keeps the app awake without the Asleep screen (W1).

**Scale: reconnect (item 3, bug; U1).** The scale is connected again when its connection is
lost, and when it was not there at the app's start: the skin retries with a time-out, and tries
again when the user taps the 'not connected' warning or a tare button on any page (founder,
2026-10-18). F1's 30 s retry (`REFUSED_RETRY_MS` in `src/api/stream.ts`) is about the gateway's
stream, not the scale's Bluetooth link, so it does not cover this. Today `Skin`
(`src/shell/skin.svelte.ts`) only listens: the scale stream's status frames set `scaleLink` to
`connected` or `disconnected`, nothing asks Decaid to find the scale again, the warning in
`StateLine.svelte` is plain text, and `Skin.tare` does nothing without a scale. Decaid connects
a scale with a scan: `scanDevices({ connect: true, quick: true })` in `src/api/client.ts`
(`GET /api/v1/devices/scan`, which connects a missing machine and scale without replacing
connected ones). Streamline's retry is the model (`scaleAutoRetryDecision`,
`attemptScaleAutoRetry`, `onScaleDisconnect` in `src/modules/app.js` at `3a4bd23`): after a drop
it scans every 5 s, at most 3 times, and not while the machine sleeps, nor within 4 s after a
wake (Decaid reacquires a preferred scale itself then, and a second scan fails it), nor while
Decaid already scans, nor with the scale power mode `disconnect`; it retries only when a scale is
known (`preferredScaleId`). Default: the skin does the same, and also once after the start when
the first status frame says no scale is connected; while a round runs the warning reads 'looking
for the scale', after its last try 'scale not connected, tap to retry'. A tap on the warning, or
on the tare button of the steam or hot water page, starts a new round, with no known scale too;
such a tap tares nothing.

**A-Flow profiles open in the A-Flow 3.0 editor (items 4 and 5; U2).** Every A-Flow profile
opens in the skin's A-Flow 3.0 editor, never in the step editor, and it is converted to 3.0 when
it is saved (founder, 2026-10-18). This overrides E2's routing (3.6, research.md 17.5), where
Decaid's bundled de1app 'A-Flow / …' profiles and the user's own old A-Flow profiles open in the
step editor because `readParams` (`src/editor/storage.ts`) finds no 3.0 values; `editorFor` in
`src/editor/route.ts` decides it in one place. What is new is a reader of the plugin's steps: the
de1app plugin writes an A-Flow profile as named steps (Pre Fill, Filling, Infuse, 2nd Fill,
Pause, Ramp Up, Pouring start, Pouring, and Ramp down; research.md 6, `code.tcl`), and the
generator (`src/aflow/generator.ts`, with the plugin's output in `src/aflow/plugin-expected.ts`)
writes the same steps, so the reader is its inverse: from the steps it takes the fill flow and
temperature, the infuse pressure, time and move-on weight, the 2nd fill and its pause, the ramp's
pressure and time, the pour flow and pressure, flow up or down, and the stop weight. A profile is
A-Flow by its steps (the plugin's step names in its order, with the values the generator would
write for them), not by its title, as 17.5 keeps it. What 3.0 has not got is dropped: ramp down
(3.2) and the Pre Fill step (the setting `firstStepWorkaround` decides it on save); the editor
then says once, in its status line (item 8), what was dropped. The opened profile is the
editor's start: 'save' stores it through the editor's save path as a 3.0 profile (the values in
`metadata`, M2) with the old record as its parent and hidden, as any save does; 'save as' under a
new name. A converted profile whose title is one of the skin's defaults (Decaid's bundled
`A-Flow / default-light`, `-medium`, `-dark`) counts as that default: T5 lists the skin's default
under that title, and it is saved only with 'save as' (3.8). A profile the reader cannot read
(steps changed in another app) still opens in the step editor, as an A-Flow 3.0 profile with
changed steps does today. Default (section 8): ramp down is dropped without asking. Built
(U2): the reader is `readSteps` in `src/aflow/reader.ts`; `openParams` in
`src/editor/storage.ts` gives the editor and `editorFor` a 3.0 profile's values, else those of
the steps. The plugin wrote two forms (research.md 27): six steps up to 1.3 (Fill, Infuse,
Pressure Up, Pressure Decline, Flow Start, Flow Extraction) and nine from 1.4 (Pre Fill, 2nd
Fill and Pause added); the names 3.9 lists (Filling, Ramp Up, …) are the plugin's internal
ones, its profiles carry these. The generator's own steps read too, so generating and reading
gives the values back. In the plugin's steps the 2nd fill is on when 2nd Fill and Pause both
last; Decaid's copies keep a 15 s Pause with a 0 s 2nd Fill, and that Pause is dropped and
named too, as is an infuse volume other than 100 ml (3.0 has none). A profile's steps hold no
dose: it opens with 3.2's 16 g. The status line names the drops and stays until the next
action (a failure's timing); with nothing dropped it only says that 'save' stores it as 3.0,
for 4 s. 'save' is offered for an opened old profile without an edit. A profile with 3.0
values whose steps were changed is not read from its steps; it and any A-Flow profile whose
steps cannot be read open in the step editor with a line in its status line that says why.

**Import of old A-Flow profiles (item 6; U7).** The skin's settings category
(`src/settings-page/SkinCategory.svelte`) gets a button that converts all old A-Flow profiles to
3.0 at once (founder, 2026-10-18). It uses U2's reader and save: each visible profile that is
A-Flow by its steps and has no 3.0 values is stored as 3.0, with the old one as its parent and
hidden. The button asks first and names how many it found, then reports how many were converted
and which could not be read. Default (section 8): Decaid's bundled de1app A-Flow profiles
(`A-Flow / default-…`, `default-very-dark` and `default-like-dflow` among them) are skipped, as
the skin's own defaults stand for them (T5), and so is every profile that already has 3.0
values.
Built (U7, 2026-10-20): 'Convert to 3.0' (`aflow-import`) in Skin > Profile. `planImport` in
`src/editor/import.ts` reads the visible profiles again and sorts them: a profile with 3.0
values (in `metadata` or the notes, its steps changed or not) or whose steps are not A-Flow's
is left out; of the rest, a bundled one (`isDefault`) or one under the title of a skin default
is skipped, one `readSteps` reads is converted, the others cannot be read. `runImport`
converts one after another with the editor's `saveEdit` and the setting `firstStepWorkaround`;
one that Decaid refuses (the same steps as another visible profile: one profile per set of
steps) is named and the rest go on. The question names how many will be stored and lists the
skipped count and the unreadable titles; with nothing to convert it is not asked and the line
under the button says so. The result reads 'Converted n, skipped n, could not read n.' with
the unread titles and each refusal (`docs/product/aflow-import.png`). Nothing is loaded to
the machine.

**Step editor: 0 s steps not drawn (item 7; U6).** For profiles that are not A-Flow, a step of
0 s is not drawn in the curve; it stays in the cards and in SCRIPT, where it can be seen and
changed (founder, 2026-10-18). Today `buildCurve` in `src/steps/curve.ts` draws a step without a
time `UNTIMED_STEP_SECONDS` (10 s) long and shaded, Streamline's rule (3.6, E3). The machine
passes a 0 s step at once (that is how the de1app A-Flow editor switches a step off, 3.6's
fallback), so the 10 s rule goes: a 0 s step has no width and no shading. The builder checks on
the rig that the simulation passes a 0 s step at once. The same curve is T4's preview in the
picker and T1's estimate of a step profile's length; both follow.
Built (U6, 2026-10-20): `stepCurve` leaves a step of 0 s (or without a time) out: no points, no
gap in the other pump's line, no border, and the next step's slow ramp starts from the target of
the drawn step before it. `UNTIMED_STEP_SECONDS`, the shading (`shaded` of `ShotGraph`) and the
preview's note 'shaded: a step without a time' are gone. On the rig (Decaid 0.8.8, simulated
DE1) a profile of 4 s, 0 s and 4 s steps passed the 0 s frame within one snapshot (0.1 s).

**A-Flow editor: status line and spacing (items 8 and 9; U5).** The status line ('saved as …',
'loaded', a failure) moves to the row below the default profiles, and the profile buttons get
more space between them (founder, 2026-10-18). Today `Editor.svelte`'s header holds the
profile's name, the start row (`.group.start`, `data-testid="start-row"`), save, save as and the
mode switch, and `notice` is a paragraph at the top of `.stage` (`editor-notice`), so it pushes
the graph down. This overrides T7's 'beside the buttons' (3.8); 3.9 wins: every notice of the
A-Flow editor (the save result, T7's hint to use 'save as' on a default, U2's note of what was
dropped) is one line under the start row, its height kept while it is empty, so nothing moves;
T7's timing stands (a result goes after 4 s, a failure stays until the next action). Default:
the gaps between the start row's buttons and between the header's groups are about twice
today's (`gap` of `.group`), within the 1280 px width.
Built (U5, 2026-10-20): every notice of the A-Flow editor (the hint, 'saved …', 'saved as …',
a failed save or load, 'Decaid did not answer', U2's line of what was dropped) is the one
`notice` shown in `editor-status`; the line of a profile whose steps cannot be read stands in
the step editor's own status line, as U2 says. The `gap` of `.group` had no effect, as the
groups were not flex boxes: the start row's buttons stood a space apart and save / save as and
simple / detail wrapped onto two lines. Now `.group` is a flex row with 0.75 rem between its
buttons and the header's groups stand 2 rem apart (`Editor.svelte`), so the header is one row
of 3 rem at 1280 x 800 and the graph gains the second row's height
(`docs/product/editor-status.png`).

**Text fields and the keyboard (item 10, bug; U1).** Tapping a text field ('save as', the
description in the profile's settings, T4's filter, the settings page's text fields) must not
shrink the app: the keyboard lies over the app, and the field being edited and what belongs to it
(its dialog, its label, its buttons) stay visible above the keyboard (founder, 2026-10-18). It
cannot be seen in the Windows rig. **The likely cause:** Decaid's Android activity has
`android:windowSoftInputMode="adjustResize"` (`android/app/src/main/AndroidManifest.xml` at
`v0.8.8`) and shows the skin in a Flutter `flutter_inappwebview` view (`pubspec.yaml`), which
Flutter shrinks to the space above the keyboard. So the WebView's viewport loses the keyboard's
height, and the skin sizes everything by the viewport's height: `src/app.css` sets the root
`font-size: min(2vh, 1.25vw)`, every size is in rem, and `html`, `body` and `#app` are
`height: 100%`. With a keyboard of about half the screen, `2vh` halves, every rem halves, and the
whole app is drawn small in the upper half: what the founder saw. The viewport meta
(`index.html`: `width=device-width, initial-scale=1.0`) has no `interactive-widget`, but that
key cannot help alone: it tells the browser how to resize its viewport, and in Decaid the host
resizes the view itself. **The fix:** the skin keeps its size from the full viewport. A small
module (`src/viewport.ts`, started in `main.ts`) writes the viewport's width and height in px to
two custom properties on `:root` at the start and on every resize that is not the keyboard: a
change of the width (rotation, another window), or a height that grows; a height that shrinks
while a text field has the focus is the keyboard and is not taken. `app.css` then sizes from them
(the root font size the smaller of 2 % of the stored height and 1.25 % of the stored width,
`#app` the stored height), so the app keeps its size and the keyboard covers its lower part; the portrait
rule of `app.css` and `App.svelte` follows the stored size too. Then the field is lifted: the
keyboard's top is the viewport's height after the resize (`window.innerHeight`, or
`visualViewport.height` + `offsetTop` where the host does not resize); when the focused field's
dialog (or, for a field in a page, the field with its label) reaches under it, the module sets a
third property, the distance to lift, which the dialog (`NameDialog.svelte`, the profile
settings' notes, the picker's filter, the settings page's fields) applies as a `translateY`; it
is 0 again when the field loses the focus or the keyboard closes. `interactive-widget=resizes-visual`
is added to the viewport meta for hosts that honour it. A Playwright test plays
the keyboard by shrinking the page's height with a field focused; the tablet is the founder's
check. Built (U1): one rule in `app.css` moves the marked element (`[data-lifted]`), so every
text field is covered without a change in its component; an element taller than the space above
the keyboard (the profile's notes fill their column) is also held to that space while it is
lifted.

**Hot water page: rows with sliders (item 11; U3).** The four squares of the hot water page,
one per value, become one row per value, with a slider under it to change the value (founder,
2026-10-18; values, not volumes). Today `HotWater.svelte` draws `HOT_WATER_FIELDS`
(`src/hotwater/hot-water.ts`) as a 2 × 2 grid of large tiles, a tap opening the number pad
(screenshot hot-water.png (screenshot in the team repository)); R5 built it (3.7). Default: a row is the
label and the value with its unit; the slider has the field's range and step (temperature, time
and weight whole, flow 0.1), moves the shown value while it is dragged and writes once when it
is let go, through the same `writeHotWater`; a tap on the value still opens the number pad. A
drag on a slider moves no page (T6's rule for controls). The right column (last shot, ratios,
scale, tare, hint) stays.

**Steam and hot water: no state dot (item 12; U3).** The green circle in the bottom-left corner
of the steam and hot water pages goes (founder, 2026-10-18). It is the machine's state: the
`.dot` with `skin.status.tone` under the back arrow in `App.svelte`'s left `nav`
(`data-testid="nav-status"`), shown on every page but home (screenshots
steam.png (screenshot in the team repository), hot-water.png (screenshot in the team repository)). Default: it goes from
every page; the state line of home, steam and hot water and the sleep screen show the state.

**Hot water page: the ring while it pours (item 13; U3).** While hot water pours, the hot water
page shows a circle like the flush's (founder, 2026-10-18). The flush's circle is R3's ring on
home (`src/shell/Water.svelte`, `ringOf` and `waterValues` in `src/shell/water.ts`), with stop
and the values inside; home shows it while hot water or flush runs, and the hot water page has
only a plain stop button. Default: while hot water runs, the hot water page shows
`Water.svelte`'s ring, at item 14's size, in place of its value rows, and the rows come back when
it ends; home is unchanged.

**Flush ring a little smaller (item 14; U3).** The flush circle looks good; its diameter is a
little smaller (founder, 2026-10-18). Today `.ring` in `Water.svelte` is `height: 100%` of
home's panel. Default: 85 % of it, centred, with the stop button and its values scaled with it.

**Hot water flow up to 8 ml/s (item 16, bug; U1).** The hot water flow goes up to 8 ml/s, the
DE1's maximum, on the hot water page and on the settings page (today 10); the Bengle's higher
maximum (about 12 ml/s) is not needed, the founder has a DE1 (founder, 2026-10-18). Both pages
take the range from one entry: the flow of `HOT_WATER_FIELDS` (`max: 10`,
`src/hotwater/hot-water.ts`), which the settings page's `hotWater('flow', …)`
(`src/settings-page/fields.ts`) reads; its comment ('the founder's newer machine drives more
than 8') is wrong and goes. A flow above 8 already in the workflow (the rig's is 10) is shown as
it is and held to 8 by the next change, as F1 does for a profile's flow. The settings page's
other flows up to 10 (`heaterPh1Flow`, `heaterPh2Flow`, the heater's warm-up and test flows) are
not hot water and stay.

**Steam page: heater off (item 18; U3).** When the steam heater is off, the steam page shows a
message saying so and a button that switches it on; both are hidden while it is on (founder,
2026-10-18). The heater's state is `heaterState` in `src/shell/steam-heater.ts` (the machine's
`targetSteamTemp`, 0 is off; the workflow's temperature while the machine's settings are not
known), and switching on is `Skin.setSteamHeater(true)`, which the menu's 'Steam on' uses (R4)
and which writes `steam.heaterTemperature` (150 °C by default). Default: the message ('The steam
heater is off') and **Steam on** sit at the top of the right column of `src/steam/Steam.svelte`,
in the place of the favourites, which come back when the heater is on.
Built (U3, 2026-10-20), items 11-14 and 18: each hot water row is the label and the value (a
button, `hot-water-{id}`, opening the number pad) over a slider (`hot-water-slider-{id}`) with the
field's range and step (`fieldStep`, `shownValue` in `src/hotwater/hot-water.ts`); a drag shows
the value as it moves, `change` writes once, and the dragged value stays shown until Decaid
answers. A slider is an `input`, which T6's `onControl` already leaves to the control. While hot
water pours (`shownRun` in `src/shell/water.ts`, which home uses too) the page shows
`Water.svelte` in place of the rows and hides its own stop, so the ring's stop is the only one;
a flush stays home's. The dot and its `nav-status` are gone from `App.svelte`. The ring is
`transform: scale(0.85)` of its full height, so stop and its values shrink with it, on home and
on the hot water page alike (`docs/product/water-flush.png`, `hot-water-pouring.png`). The
heater's message is red, as home's menu says it, and **Steam on** calls `setSteamHeater(true)`;
on the rig (Decaid 0.8.8, research.md 28) the machine's `targetSteamTemp` reads 0 when the
workflow's `steamSettings.targetTemperature` is 0, and `PUT /api/v1/workflow` with 150 brings
both back (`docs/product/steam-heater-off.png`).

**SCRIPT offers off (item 17; U6).** In the step editor's SCRIPT, the exit and both limits (the
limit and the maximum) can be set to off, as on the cards (founder, 2026-10-18). The founder
asked whether Streamline leaves it out on purpose. **It does, on purpose**, read in
`decentespresso/streamline-js` at `3a4bd23` (v0.2.14), `src/modules/profile_editor.js`:
`buildStepScript` (l. 2347) leaves out a limit, maximum or exit that is off ("an unset field is
left out rather than shown muted: this half is prose, and 'Limit to 0.0 bar' … asserts something
the step does not do. Nothing becomes unreachable — CARDS keeps a permanent row for each of
them, which is where one gets added"), and the exit chip in `renderScriptLine` (l. 2593) drops
off from its cycle ("Off is deliberately dropped from the cycle here. This line only exists while
the step HAS an exit, so landing on Off would delete the very control being tapped, halfway
through its own cycle — CARDS keeps a permanent Move-on-if row, and that is where an exit gets
switched off"); a limit or maximum typed as 0 removes its sentence. So it is a choice of wording
and of a vanishing control, not a mistake, and E6 ported it (`stepSentences` and `SCRIPT_EXITS`
in `src/steps/sentences.ts`, research.md 17.18). The founder wants the option in SCRIPT, so the
skin departs from Streamline here and avoids the vanishing chip. Default: each step in SCRIPT
always has its limit, maximum and exit lines; one that is off is muted ('No limit', 'No maximum',
'Move on: off') with a chip that switches it on. The exit chip cycles the four exits and **off**;
at off the line stays, muted, without its value pill, and the next tap brings the first exit back
with its remembered value. A limit and each amount of the maximum typed 0 on the number pad is
off and stays as a muted line or pill; switched on, a limit takes its remembered value or the
range's default, as the card does. Streamline's ISC notice stays on the file.
Built (U6, 2026-10-20): the lines read 'No limit' with a chip **switch on**, 'Move on:' with the
exit chip **off**, and, with every amount off, 'No maximum' before the three muted pills; an
amount that is off is a dashed pill 'weight off', 'time off' or 'volume off' in its place, and a
tap opens the number pad on it. A live limit typed 0 (on the cards too) becomes `limiter: null`,
what Decaid stores for most steps without a limit on the rig (246 of its steps; the others hold
`{ value: 0, range }`, which the editor keeps as it came); no exit is `exit: null` as before.
Switched on, a limit takes its value and range from before it was switched off, else 9 bar (a
flow step) or 6 ml/s (a pressure step) and `newLimiterRange`; the exit takes its remembered
value, else 9 bar or 6 ml/s, as on the cards. What is remembered lasts while the profile is
edited: a save reopens the stored profile and starts afresh. The step model's `switchLimiterOn`
and `cycleExit` serve SCRIPT; `cycleScriptExit` is gone.

**The screenshots of 2026-10-17 (T1, T2).** The screenshots of messages 38 and 39 were resent as
files (review-10-17-espresso-tail.png (screenshot in the team repository),
review-10-17-streamline-phase-values.png (screenshot in the team repository)).
The first is T1's tail as 3.8 describes it (A-Flow / floral2: the pressure drops at about 54 s,
then the flow rises to the 4 ml/s target), so T1 stands. The second answers T2's per-phase
question and overrides 3.8's default of one row per step with mean values: Streamline's table has
one row per **phase**, Preinfusion, Extraction ('Extraktion') and Total, with the columns
duration (s), weight (g), volume (ml), temperature (°C), flow (ml/s) and pressure (bar), the last
three as start → end and the pressure also with its peak (3.3 → 9.5 → 8.3). T2 builds that; the
split into phases and the values are taken from Streamline (`shotSummary.js` in
`decentespresso/streamline-js`, read before building), and acceptance 51 replaces item 28's
per-step table.

**Beans and grinders (item 19; U8, U9, U10).** A bean and grinder catalogue: list, add, edit and
archive beans and grinders, pick them for the next shot, and filter the history by them, on
Decaid's `/api/v1/beans` and `/api/v1/grinders` (founder, 2026-10-18; spec 3.3 as the founder
reviewed it, commits 032e579 and 4f4ef9d). Typing a bean's name and roaster by hand is what
matters first (item 20). Streamline uses the same paths, so it is a port in two parts, as the
settings were (S1, S2): **U8** reads Streamline's bean and grinder pages and writes the port plan
into research.md (files, data model, requests, which Svelte component each part becomes, what is
left out, how it meets the history's entries of 3.5); **U9** builds the catalogue and the pick
for the next shot; **U10** joins it to the history. Where to start reading, in
`decentespresso/streamline-js` at `3a4bd23`: the requests in `src/modules/api.js` (beans and
grinders, about l. 2350-2440, with `includeArchived`), `bean-selection.js`,
`bean-selection-modal.js`, `dye-selection.js`, `dye-context.js` and `dyeStrip.js` (its 'describe
your espresso' strip), and where `history.js` and `profile_selector.js` use them. Today the skin
keeps the bean and the grinder setting only in the workflow's `context` (`coffeeName`,
`coffeeRoaster`, `grinderSetting`; research.md 14): the history restores them (3.5, `entryKey` in
`src/history/entries.ts`, a bean is its name and roaster) and nothing lets the user type or pick
them. Picking a bean writes its fields (and its batch id, research.md 4) into the workflow's
`context`, so the next shot carries it; the history keeps one entry per profile and bean (3.5),
and its filter shows the entries of one bean or one grinder. The plan says where the catalogue
opens (home's menu and the bean's name on home or in the history are candidates) and checks every
request on the rig.

Built in U9 (research.md 29.6, 29.12): a screen **Beans and grinders** from home's menu, laid out
as the settings page (the kinds, the list with search and 'show archived', the form); a bean's
form has name and roaster (required), the current bag's roast date and notes, every new bean gets
a bag, **New bag** archives the current one and starts the next; a grinder's form has model
(required), burrs, the setting as numbers with a step (default 1) or as named positions, and
notes; archive asks first, restore does not; nothing is deleted. Home's header has a chip after
the profile with the bean ('no bean') and the grinder setting; it opens the pick (beans that are
not archived, grinders, the setting with − and + by the grinder's step or on the number pad),
whose 'Use for the next shot' writes the six context fields in one `PUT /api/v1/workflow`; the
pick stays until it is changed.

Built in U10 (research.md 29.13): the history's overlay has a filter row above the list,
**all**, **bean** and **grinder**; bean and grinder each open the catalogue's beans or grinders,
archived ones too, in the list's place, with 'any bean' / 'any grinder'; a bean and a grinder can
be chosen together, and 'all' clears both. The filter runs on the shots the skin holds (T8),
also on those that arrive later, and asks the gateway for nothing but the catalogue, read when
the overlay opens; it lasts for the session. A shot's bean is the catalogue's bean of its batch,
else (a shot from before the catalogue, with only the free text) the bean with its name and
roaster; a grinder is matched by its id, else by its model. Entries show a catalogue bean by its
current roaster and name and the grinder as 'Model 4.8' ('grinder 4.8' without a model).

**Bean from a photo (item 20, low priority; U13, after 19).** A bean can be added from a photo
of its bag taken with the tablet's camera; reading the name and the roaster from it is nice to
have (founder, 2026-10-18). **Step 1 is a check on the real tablet that only the founder can
make:** does Decaid's WebView let a skin use the camera, through `<input type="file"
accept="image/*" capture="environment">` or `getUserMedia`? Decaid's `flutter_inappwebview`
needs the app's camera permission and a file chooser for the first and a permission request
handler for the second; the Windows simulation shows neither. The check is a small test page in
the hand-over (H3) that the founder opens on the tablet. If the camera works, the photo is
stored with the bean, and step 2 reads the name and the roaster from it with Tesseract.js
(founder's choice, 2026-10-18: free, open source, no key, runs on the tablet), whose language
data is bundled in the ZIP and never fetched at run time; its result only pre-fills U9's typed
fields, which the user corrects. If the camera is blocked, the item stops after step 1 and says
so. U13 waits on the founder's check (`conditional_on`) and on U9.

*The check passed and U13 is built (2026-10-23).* On the tablet both ways work: the file input
with `capture` asks for permission each time, the live camera (`getUserMedia`) does not
(docs/install.md, 'The camera check'). So the bean form (add and edit) has a **Photo** button
that opens the live camera in the number pad's dialog, the rear camera preferred, with
**Capture**; where `getUserMedia` is refused or missing, **Take a picture** (the file input)
stands in. Decaid's bean has no image field (`rest_v1.yml`): the photo is a JPEG of 1024 px on
its long side in the skin's KV namespace, key `bean-photo-<bean id>`, shown in the form,
replaced with **New photo**, deleted with **Remove photo**, written when the bean is saved. The
skin only archives beans; a bean deleted in another app loses its photo at the catalogue's next
read (research.md 29.14). After a capture, Tesseract.js 7 (LSTM only, sparse text, English)
reads the bag with a progress line and **Cancel**; its worker, three cores and the English data
are in the ZIP's `ocr/` and nothing is fetched elsewhere. The roaster is the line with a
roaster's word (Roasters, Rösterei, Coffee Co …), else the topmost line; the name is the tallest
other line; weights, dates and notes are left out. Only empty fields are filled; a failure or a
cancel leaves them as they were. The ZIP grows from 152 517 to 7 782 573 bytes.
*Dropped by 3.17 item 3 (Z19): the reading (Tesseract.js, the progress line, Cancel, the pre-fill) is removed; the photo stays.*

**Settings: the rest of Streamline (item 15, low priority; U11, U12).** The settings page gets
Streamline's skin switch, and then the rest: display options, the Bengle pages, the manual,
feedback, and the firmware upload from a file; planned, after everything else (founder,
2026-10-18). S1 left these out (research.md 20.3, 20.6): category 6's Active Skin (`GET
/api/v1/webui/skins`, `PUT /api/v1/webui/skins/default`, `POST …/update`), 9's Display Size,
Temperature unit and Screen Saver (Streamline's `localStorage`; here they would be the skin's
settings), the Bengle-only pages (the rig's DE1 answers 404), 11's User Manual (Streamline's
Quick Start Guide text) and Send Feedback (`POST /api/v1/feedback`), and 10's firmware upload
(`POST /api/v1/machine/firmware` with a file, NDJSON progress). **U11** builds the skin switch
(the installed skins; switching after a confirm, since it leaves this skin) and the display
options that apply to this skin; **U12** the Bengle pages (shown only on a Bengle), the manual,
feedback and the firmware upload behind S2c's confirm. Built (U11, research.md 30): Skin > Display
Size (Streamline's display size and chart line width, in the settings object) and Skin > Active
Skin (the installed skins, the default first; after the confirm the default is set, Decaid's skin
server started again and the port it serves on opened, not port 3000); the temperature unit and
the screen saver are left out. Feedback goes to Decent through Decaid,
an outside service that spec 6 asks the founder to approve; item 15 asks for it, and the default
takes that as the approval (section 8). Talk to Decent (a Decent account) is not asked for and
stays out.
Built (U12, research.md 31): 3. Calibration > Load Cells, 4. Machine > Cup Warmer and Lighting (only
when the machine's model names a Bengle), 11. User Manual (Quick Start Guide, this skin's README)
and Send Feedback (confirm first), and Updates > Firmware Update > Install from a file (confirm
first, the machine must stay on).

**No change:** 'Steam on' falling back to 150 °C is fine, because it returns to the previously
set values (founder, 2026-10-18).

### 3.10 Founder's review of 2026-10-20

From the founder's feedback on hand-over 0.3.0 ([review-10-20-26.md](review-10-20-26.md)) of 2026-10-20. 0.3.0 held T1-T9
and U1, not U2-U9, so some of what the founder saw has changed since (said where it matters).
Where an item leaves a choice open, the default below is built unless the founder says otherwise
(section 8). Where an item changes something 3.9 decided, it says so and wins; that paragraph
stays as history. Hand-over 0.4.0 (H3) carries these changes with 3.9's.

**Home menu: two sleeps (item 4 and message 42; W1).** The menu offers two entries, **Machine
sleep** and **Machine and app sleep**, each its label alone: the long explanation lines go
(founder, 2026-10-20). **Machine sleep** puts only the machine to sleep and keeps the app awake:
it does not show the Asleep screen and does not dim. **Machine and app sleep** puts the machine to
sleep and the app shows the Asleep screen: 'app sleep' is the black screen with 'Asleep, touch to
wake' that 0.3.0 shows (founder, 2026-10-20, message 42), whose touch wakes the machine. This
answers section 8's question on 3.9 item 2 and overrides 3.9's 'Menu: machine sleep' (its line)
and 'Menu: machine and app sleep' (U4's brightness 0 and released wake lock). Today the two
entries are in `src/shell/Home.svelte`'s menu (`machine-sleep` with the detail 'only the machine
sleeps, not the app: Decaid cannot switch the DE1 off', `app-sleep` with U4's line), calling
`Skin.sleep` and `Skin.sleepApp`; the Asleep screen is the `.asleep` button in `App.svelte`, shown
whenever `Skin.asleep` (`isAsleep` in `src/shell/machine.ts`: the machine sleeps), whoever put it
to sleep; `Dimmer` (`src/shell/dimmer.ts`) sets `SLEEP_BRIGHTNESS` (5) for every sleep and, after
`sleepApp`, `APP_SLEEP_BRIGHTNESS` (0) with Decaid's `keepAwake` and wake lock override switched
off and kept in `localStorage` (`pureflow.app-sleep`). Default, the simplest: **what of U4 goes:**
the brightness 0, the switching of `keepAwake` and the override, `Released` and the key
`pureflow.app-sleep` (no hand-over carried U4, so no tablet holds it); a sleep never touches
Decaid's wake lock or `keepAwake`. **What stays:** both entries, both sending `sleeping`, and the
Asleep screen with its brightness 5 and its touch to wake, as 0.3.0 has it (5 kept by the founder
on 2026-10-15). **What is new:** **Machine sleep** marks the sleep as the machine's only (a flag of
`Skin`, cleared when the machine is awake again, not stored); while it is set the Asleep screen is
not shown and `Dimmer` leaves the brightness alone; the state line shows the machine's sleeping
state, and home's menu offers **Wake machine** (`Skin.wake`, `idle`) in the place of the two sleep
entries while the machine sleeps; the machine's own button wakes it too. A sleep the skin did not
ask for (Decaid's sleep timeout, presence detection, the machine's button) shows the Asleep screen
as today (section 8).
Built in W1 (2026-10-21): the mark is `SleepMark` in `src/shell/sleep.ts` (`askSleep`,
`followSleep`): 'Machine sleep' sets an ask that the next `sleeping` frame turns into the mark,
and the first frame after a sleep that is not `sleeping` clears it, whoever woke the machine; a
failed request takes the ask back. `Dimmer` is again as before U4 and dims only while the Asleep
screen is shown. The Asleep screen is `Skin.asleep`, the machine's sleep `Skin.machineAsleep`;
'Wake machine' is the menu entry `wake-machine`
(home-menu-asleep.png (screenshot in the team repository)).

**Countdown ring on every screen (item 6; W2).** While hot water or flush runs, the countdown
ring shows on every screen, not only on home (founder, 2026-10-20). Today `Water.svelte`
(`src/shell/Water.svelte`; `ringOf`, `waterValues` and `shownRun` in `src/shell/water.ts`) is
drawn by home, in the place of its graph, while hot water or flush runs, and by the hot water page
while hot water pours (U3, built after 0.3.0); the steam page, the editors, the picker, the
settings and the beans screen show only the state line's state. `Skin.waterRun` and
`Skin.canStop` hold what runs on every screen. Default: home and the hot water page keep their
large ring; every other screen (and the hot water page during a flush) shows a small ring at the
bottom of the left column, `App.svelte`'s `nav`, under the back arrow. That column is 4 rem wide on
every screen but home, holds only the back arrow since U3 removed the state dot, and its lower
part is empty, so the ring covers no control. The small ring is the column's width less its
padding, fills with `ringOf`'s share as the large one does, shows the time ('6 / 10 s',
`waterValues`) inside, and is one button that stops what runs (`Skin.stop`), named by its kind
('flush', 'hot water') for a screen reader; it goes when the run ends.
Built in W2 (2026-10-21): the small ring is `SmallRing.svelte` (`src/shell/`), drawn once by
`App.svelte` over the pages (not inside each page's column), at the column's bottom left, 3.4 rem
across, above the dialogs' backdrops and under the stream's banner and the Asleep screen; which
run it shows is `smallRingRun` in `water.ts` (none on home and on the hot water page while hot
water pours), its time on two lines `smallTime` ('6' over '/ 10 s'). The shot history covers
home's ring, so while it is open the small ring shows over the history's lower left, and the
history's list keeps room under its last entry. Removed in Z8 (3.14 'The ring's frame'): the
large ring over each screen's main frame replaces the small ring, its pictures and its room.

**Profile picker: graphs (item 1; W3).** In the picker's preview a step of 0 s is not drawn, a
step's limit is drawn with its target, and the graph matches the profile: default-dark's flow does
not drop to 0 (founder, 2026-10-20). The preview is `StepPreview` (`src/steps/StepPreview.svelte`,
`bare`), drawn from `stepCurve` in `src/steps/curve.ts`, the step editor's curve, for every
profile, the A-Flow ones too. **0 s steps:** since U6 (2026-10-20, after 0.3.0) `stepCurve` leaves
a step of 0 s out (no points, no border, the next step ramps from the drawn step before it), so the
picker already hides them, as the step editor does; W3 adds the picker's test. **The 0 flow:**
`stepCurve` counts the pump a step does not drive as 0 for the next step's ramp (Streamline's rule,
`prevFlow = 0` after a pressure step). An A-Flow pour is a smooth flow step after Ramp Up, a
pressure step, so default-dark (pour flow 2 ml/s, flow down: the Pouring step's target is 0 over
its 60 s) is drawn from 0 to 0, a flat 0 through the whole pour, and the flow-up defaults rise
from 0 instead of from the pour flow. The machine starts a smooth step from where the flow is,
and Ramp Up ends on 'flow over' the pour flow, so the pour starts there. Default: a smooth step
after a step of the other pump starts from that step's exit value when the exit is on this step's
quantity (Ramp Up's 'flow over 2'), else from that step's limit on it, else from 0 as today. The
A-Flow editor draws only the first 30 s of the pour (`POUR_SHOWN_SECONDS` in
`src/editor/curve.ts`), because the stop weight ends the shot long before 60 s, so its line for
default-dark runs from 2 to 1 ml/s; for an A-Flow profile (one whose values `openParams` in
`src/editor/storage.ts` reads) the picker draws the last step as far as the editor does, so both
end at 1 ml/s. The step editor's preview takes the start rule and draws every step whole.
**Limits:** a flow step's pressure limit (`limiter`, for example the 9 bar of default-dark's
Pouring step) is drawn as a pressure line at that value across the step, and a pressure step's
flow limit as a flow line, both dotted, thinner and in the quantity's colour muted, so they read as
a limit, not a target (in the preview the targets are solid and the step borders dashed); a step
without a limit (`limiter` null or 0) draws none. `stepCurve` gives two more series
(`pressureLimit`, `flowLimit`, null where a step has none), `ShotGraph` draws them in its
`preview`, and the scale (`previewMax`) counts them. The step editor's preview shows them too.
Built (W3, 2026-10-21): a limit line is 0.13rem wide, dotted (round dots 0.32rem apart) at 0.55
opacity (`.limit` in `ShotGraph`, test ids `shot-limit-pressure` and `shot-limit-flow`); the
picker passes `previewLastStepSeconds` (`src/shell/profiles.ts`) as `stepCurve`'s
`lastStepSeconds`, which cuts the last step and its ramp where it then is; the start rule takes
the step before's exit on this step's quantity whatever its condition ('over' or 'under'). On
the rig all 75 profiles the picker lists preview as their steps say (34 with a limit, 7 A-Flow
pours cut).

**Profile picker: delete a profile (item 2; W4).** A profile can be removed in the picker: a swipe
from right to left on its row shows a **delete** button at the row's right end (founder,
2026-10-20, the founder's idea). Today `src/shell/Profiles.svelte` lists `pickerEntries`
(`src/shell/profiles.ts`): the skin's five A-Flow 3.0 defaults first (`isDefault`, kept in the
skin since T5, no record), then the gateway's visible records; a row is a button that selects, and
the client (`src/api/client.ts`) has `setProfileVisibility` but no delete. Decaid 0.8.8 has
`DELETE /api/v1/profiles/{id}`, which 'soft deletes a user profile or hides a default profile'
(its `rest_v1.yml`), `PUT /api/v1/profiles/{id}/visibility` with `visible`, `hidden` or `deleted`,
and `DELETE /api/v1/profiles/{id}/purge`, a permanent delete that refuses Decaid's bundled profiles
(research.md 10, 11.2). Default, the simplest: a drag of a row to the left by more than a third of
the button's width opens it (the row slides left by the button's width; the list still scrolls up
and down, `touch-action: pan-y` on the rows), one row open at a time; a tap elsewhere or a swipe
back closes it, and a tap on the row still selects it. **delete** sends
`DELETE /api/v1/profiles/{id}` (a new `deleteProfile` in the client) and the picker reads the list
again; nothing is purged: Decaid keeps the record as deleted, with its lineage and in its data export. A
user's profile is soft-deleted; Decaid's bundled profiles (records with `isDefault`, the de1app
A-Flow ones among them) take the same request, which hides them. The skin's five defaults are not
records and cannot be deleted: their rows do not open. The profile on the machine (the row tagged
'loaded') does not open either and shows 'loaded on the machine: load another first' while it is
swiped: its record would go while the workflow still holds its copy, and `unsavedOnMachine`
(`src/editor/unsaved.ts`, which lists records with `includeHidden`) could then take the loaded
A-Flow profile for unsaved edits. A failed delete is the picker's error line. A deleted profile in
a slot of the editor's start row is 'missing' there, as section 8 has it. The builder checks on
the rig what `GET /api/v1/profiles` and `?includeHidden=true` list after a delete, and what a
'save as' with a deleted profile's steps does (11.1: a `POST` with the steps of a hidden record
returns it, still hidden, and `writeParams` takes a hidden record over). *Built (W4):* the open
row narrows by the button's width (7 rem) instead of sliding, so its title stays readable;
**delete** asks once, in the settings' `Confirm` ('Delete <title>?', Cancel and Delete), and the
Cancel, a tap outside the row, closes the row too; the loaded row's 'loaded on the machine: load
another first' stands in place of its tags until the next tap. `deleteRefusal` and `deleteEntry`
(`src/shell/profiles.ts`) decide and delete, `src/shell/row-swipe.ts` holds the row's gesture;
the rows are `data-no-swipe`. On the rig (Decaid 0.8.8): after a delete `GET /api/v1/profiles`
no longer lists the record, `?includeHidden=true` still does, with `visibility: deleted`;
`GET /api/v1/profiles/{id}` answers it; a `POST` of its steps returns it still deleted, and
`PUT .../visibility` `visible` brings it back, so a 'save' or 'save as' of the same steps
(`writeProfile`) makes it visible again; a second delete answers 200, an unknown id 404.

**Shot overlay: rounded frame, values off (item 3; W5).** The overlay's per-phase values are right
(Streamline's), but their frame has square corners; it gets the rounded corners of the graph's
frame. A new setting turns the shot values in the overlay off (founder, 2026-10-20). Today
`src/shell/ShotOverlay.svelte` draws the values as the `table` `shot-phases` (Preinfusion,
Extraction, Total; T2, acceptance 51) with `border-radius: 0.9rem` like the graph's `.plot`, but
with `border-collapse: collapse`, which drops a table's `border-radius`, so its corners are square
(shot-overlay-after.png (screenshot in the team repository)). Default: the table gets
`border-collapse: separate` with `border-spacing: 0` (or a frame of its own around it), so its
corners are those of `.plot`. The setting is `showShotValues` in `src/settings.ts`, a switch 'Shot
values' among the switches of `src/settings-page/SkinCategory.svelte` beside `showGraphLegend`, on
by default (the values shown) and backed up as every setting; off, the overlay draws no per-phase
table after the shot and the graph takes its height. The live numbers on the right (time, weight,
pressure, flow, temperature) are not the table and stay.

*Built (W5):* one CSS variable `--radius` (0.9rem, `src/app.css`) gives the corners of the graph's
frame on home and in the overlay, of the per-phase table and of the overlay's stop button and
hint; the table has `border-collapse: separate` with `border-spacing: 0`
(shot-overlay-after.png (screenshot in the team repository)). The switch 'shot values'
(`setting-show-shot-values`) is the second of the subcategory Graph, under 'legend'
(settings-shot-values.png (screenshot in the team repository)); off, the overlay's grid has no
table row, so the graph reaches its bottom (shot-overlay-no-values.png (screenshot in the team repository)).
The other frames of the skin keep their own numbers.

**Profile editor: swipe back to home (item 5; W6).** A swipe from left to right in the profile
editor returns to home, as home's swipes move between pages (founder, 2026-10-20). Today the one
gesture is `App.svelte`'s pointer handling with `src/shell/swipe.ts` (T6): `decide` returns
'across' on every screen that is not one of `PAGES` (hot water, home, steam), so the editor (the
screen `editor`, the A-Flow editor or the step editor) has no swipe, and its back arrow calls
`skin.leave('home')`. Default: on `editor` a drag to the right that `decide`'s rules take as along
(`SWIPE_SLOP`, more along than across) and that does not start on a control (`onControl`: the
A-Flow graph and its chips take drags with `touch-action: none`, the step cards' row scrolls, the
fields and the number pad are controls) moves the editor with the finger; let go past
`SWIPE_COMMIT` or after a flick (`commits`), it calls `skin.leave('home')`, exactly what the back
arrow does, else it springs back; a drag to the left only gives a little at the edge (`offset`'s
fifth). Home is not drawn beside the editor during the drag. **Unsaved edits** follow section 8's
leaving rules unchanged: leaving loads the values on screen when they differ from those the editor
opened with (`loadOnLeave`, `loadStepsOnLeave`, through `Skin.leaving`) and loads nothing when
nothing changed; a load that fails keeps the editor open with its line and the editor springs back,
and a second swipe or 'back' leaves without loading. Nothing is asked: unsaved edits are on the
machine, as after 'back'. *Built (W6):* `swipes` and `destination` in `src/shell/swipe.ts` add
the editor to the one gesture; `App.svelte` slides the editor out in 220 ms, then asks
`skin.mayLeave()` (the editor's `leaving`, which `skin.leave` asks for the back arrow too) and
goes home, or, when the load failed, the editor stays and springs back in another 220 ms; with `prefers-reduced-motion` nothing slides and the swipe leaves when
the finger lets go. The step editor's preview only shows, so a swipe may start on it; the
backdrops of the name dialog ('save as') and of the step editor's delete question are marked
`data-no-swipe`, so a swipe there neither leaves nor answers.

### 3.11 Founder's review of 2026-10-21

From the founder's look at home in 0.4.0 (home_screen_v0.4.0.png (screenshot in the team repository)),
2026-10-21; planned only, nothing of it is built. Where an item changes something earlier
sections decided, it says so and wins; that paragraph stays as history. The founder's points:
the header of home is too full (the scale's text is cut off in the screenshot), home and the
shot overlay both show a big graph of an espresso shot, and with swipe as the way between
pages the tabs for steam, hot water and the history are not needed. The founder's answers to
the first proposal: **the state line stays as it is**; the profile picker and the bean picker
move to the right column and **only the menu stays in the header**; and the pages' titles move
to the right so that the state line is the same on all three pages.

**Home and the shot overlay become one screen (X1).** The overlay of T2 goes: home is the shot
screen. Home is a grid of the graph on the left and a right column of a fixed width (the
17 rem of the overlay's `aside`), so nothing changes size when a shot starts. Today
`Home.svelte` shows `ShotOverlay.svelte` over the graph area while `skin.shotOpen`, else a
`section.last` with the recalled entry's graph, the last shot's graph (each with a 'dismiss'
chip) or the empty graph, and the overlay's own grid has the same two columns. Default: one
graph and one column, in three states.

| State | Graph | Right column |
|---|---|---|
| Idle | the finished shot until the next one starts; else the recalled history entry's last shot; else the empty graph with the expected time axis (`skin.expectedSeconds`; the profile's curve is not drawn) | the **profile and bean buttons** at the top, then the shot's time and weight, in the places of the live ones, and its values; before any shot, the profile's target yield (the overlay's 'stops at' text) and '–' |
| Shot running | the live curves, `fit` off as now | **no buttons**; time, weight, pressure, flow, temperature live, and **stop** at the bottom, the overlay's |
| After the shot | the shot, `fit` | as idle: the buttons are back and the stop button's place is empty; the table of phases is under the graph as the overlay draws it (setting `showShotValues`, W5) |

*Built (inbox #45, 2026-10-24):* before 'else the empty graph' home shows **the newest shot
record** from Decaid (`GET /api/v1/shots/latest`, then its record with the measurements), as a
finished shot without the table of phases. It is read whenever home has no shot of its own (no
running or kept shot, no recalled entry; `wantsNewest` in `home-shot.ts`): when the streams open
(the start, a page the tablet reloaded, every reconnect), when the machine leaves `sleeping`,
when the page becomes visible again (`visibilitychange`, `pageshow`, `resume`) and after a
recalled entry is dismissed; a kept or recalled shot is never replaced by it. The empty graph is
left for a Decaid without any shot.

The finished shot **stays on home until the next one starts**: no 'dismiss' chip, no 'tap anywhere
to close' (`shot-close-hint`, the `catch` layer of `ShotOverlay.svelte`), and `Skin.shotOpen`,
`closeShot` and `dismissShot` go with them; `followMachine` and the espresso screen of
`src/shell/nav.ts` are unchanged (the overlay never was a screen). A recalled history entry
keeps its 'dismiss' chip (it is not the machine's last run) and its line 'last shot
with profile, bean, grinder', now the caption over the graph; the caption of a running shot is
the overlay's step line ('heating', 'Step 6'), of a finished one 'shot finished' with the time
and weight. The profile's title is no longer a heading over the graph: it is the profile button
below. The per-phase table appears when the shot ends and goes when the next starts, so the
graph's height changes then, as the overlay's did; the graph's width never changes. Hot water
and flush are unchanged: **Water** replaces the graph and the column, as 3.6 says.

Built in X1 (`ShotView.svelte`, the overlay's parts; which shot home shows is `homeShot` in
`src/shell/home-shot.ts`): where the spec left it open, a history entry recalled after a shot
lies over the finished shot until its 'dismiss', which brings the finished shot back; the
column's pressure, flow and temperature are the machine's live values in every state, as the
overlay's were; the column's time and weight of a recalled entry are its shot's; the caption
row keeps its height when it is empty, so the graph does not move; the column's stop button
also stops what else runs (steam started at the machine), as home's stop did; the pages do not
swipe while a shot runs, as they did not over the overlay. Screenshots:
home-idle.png (screenshot in the team repository), home-shot-running.png (screenshot in the team repository),
home-shot-finished.png (screenshot in the team repository).

**Profile and bean pick in the right column (X2), idle only (founder, 2026-10-21).** The profile button (the name, opening the
profile picker, with the pen that opens the editor) and the bean button (the bean, the grinder
setting, opening the pick of 3.9 item 19) leave the header and sit at the top of the right
column, one under the other, each as wide as the column, **only while the machine is not
running a shot** (idle, heating and after a shot): while a shot runs they are not drawn, and
the room goes to the stop button and the live values, so the column does not need to shrink
anything. A profile or bean cannot be changed during a shot, so nothing is lost. The name and the bean are cut with an
ellipsis, not wrapped, so the column stays the same. The test ids `open-profiles`,
`profile-name`, `open-editor`, `open-pick`, `next-bean` and `next-setting` stay. **The header of
home holds the state line and the menu button**, nothing else; the state line now has the width
the profile and the bean took, so its texts are not cut. Below them the column holds the
values and the stop button as the table says. The column's height at 1280 x 800 is checked on
the tablet: idle it holds two buttons of 3.5 rem, two big numbers and three small rows; during
a shot the two buttons' room goes to the overlay's 7 rem stop button, which keeps its size.

Built in X2 (`src/shell/NextShot.svelte`, drawn by `ShotView.svelte` at the top of the column
while `homeShot` is not `running`; the bean pick opens from it): the column starts level with
the caption, under the menu button, so the profile button's top is the column's; the pen and
the grinder setting stay whole and only the name and the bean are cut. Where the spec left it
open: while hot water or flush runs, home's large ring replaces the graph and the column (3.6),
so the buttons are not drawn then either. At 1280 x 800 the idle column holds both buttons,
both big numbers and the three rows with about 16 rem to spare, and the running column the
7 rem stop at its bottom. Screenshots: home-idle.png (screenshot in the team repository),
home-shot-running.png (screenshot in the team repository),
home-column-long-names.png (screenshot in the team repository).

**One header on home, steam and hot water (X3).** The state line starts the header on all
three pages, in the same place with the same values (home and steam differ only in which
temperature `heat` compares for 'Heating', T3). The page's title goes to the right end of the
header: steam and hot water show **Steam** and **Hot water** where home has the menu button, so
the right end is the page's own mark and the state line does not move between pages. Today
`Steam.svelte` and `HotWater.svelte` start their header with the title in a `strong`, before
`StateLine`. The steam page's 'steaming / last steam 12 s' stays beside the state line, left of
the title (3.7: the steam's time, top right). The menu stays on home only. Home has no title.
*Built (X3):* one header component, `src/shell/PageHeader.svelte`: the state line, then what the
page adds beside it (steam's 'steaming / last steam'), then the title (`page-title`) or home's
menu at the right end. The three pages share home's padding. Since X4 home has no left edge but
steam and hot water keep the way back's column (4 rem, `--back` in `App.svelte`), so home's
header starts that far in and the state line stands at the same x on all three; the space left
of it on home is empty. Test: `e2e/one-header.spec.ts`. Screenshots:
header-home.png (screenshot in the team repository), header-steam.png (screenshot in the team repository),
header-hot-water.png (screenshot in the team repository).

**Swipe only: the tabs go (X4).** The edge tabs of home (history on the left, steam and hot
water on the right, T3 and R5) are removed, with the narrow strip each took, so home uses the
full width. This reverses T6's 'the edge tabs stay' and 3.1's tab for the history and 3.7's
split steam tab. The swipes are T6's, unchanged: left on home opens steam, right outside the
left fifth opens hot water, a swipe that starts in the left fifth (`SWIPE_EDGE`) opens the
history, and on the other two pages a swipe back goes home. Since a swipe shows nothing by
itself, two small hints are added. Default: **three page dots** (hot water, home, steam) in the
bottom padding of the three pages, the current one bright, each a finger-sized target that
moves to its page with the same slide (`go`); and **a handle for the history**, a thin bar at
the left edge of home, vertically centred, that opens the history on a tap as the tab did.
The back arrow of the other screens stays. The home menu's `.menu` offset and the tests that
tapped `open-steam`, `open-hot-water` and `nav-history` change; swiping becomes the way to them
in the tests (`e2e/swipe.spec.ts` already has the gestures).

Built in X4 (`App.svelte`; test ids `page-dot-hot-water`, `page-dot-home`, `page-dot-steam` and
`history-handle`): where the spec left it open, the dots are drawn once by the page frame, not by
each page, centred on the screen; each target is 56 x 42 CSS pixels, the dot 0.6 rem, the
current one in the text colour and the others in the line colour, and the three pages give
1.6 rem more at the bottom so that nothing lies under them. A dot to the page beyond home
slides across home, all three pages drawn while it slides; with reduced motion it changes the
page at once, as a swipe does. The handle is a 0.35 rem bar of 5 rem in a target of 2.6 x 8 rem
over home's left padding. Neither the dots nor the handle work while a shot runs on home, as the
swipes do not. The menu opens under its button at home's right padding. Screenshot:
home-no-tabs.png (screenshot in the team repository).

**Version.** These changes go out in the next hand-over, with 3.12's, as a minor bump, 0.5.0 (H4).

### 3.12 Founder's review of 2026-10-22

From the founder's voice notes of the morning of 2026-10-22 ([review-10-22-26.md](review-10-22-26.md),
with the steam page's screenshot (screenshot in the team repository)) and a Decaid 0.9.0
export of 2026-10-21 (`decent_export_2026-10-21T22-00-49.zip`: 12 steam records, the settings,
profiles, beans). Planned only, nothing of it is built. Ten items, five from the transcript and
five said after it (a seventh was dropped); the transcript's slips are read as said below. Hand-over 0.5.0 (H4) carries
these with 3.11.

**Beans: the date picker (item 1; Y1).** On the bean add and edit page the roast date's picker
does not fit the rest of the design (founder, 2026-10-22). Today `src/beans/BeanForm.svelte` has
`<input type="date" data-testid="bean-roast-date">`, so the WebView draws its own picker. Default:
the field becomes a button that shows the date as the catalogue does (`dateOf`) or 'no roast
date', and opens **a date picker of the skin's own**, a dialog like the number pad's
(`src/editor/NumberPad.svelte`: the same backdrop, frame, `--radius` and buttons, `data-no-swipe`):
a month grid with the month and year between two arrows (a tap on the year steps by year), days
as finger-sized buttons (3.5 rem), today ringed, the chosen day filled, 'today' and 'clear'
(a roast date is optional) and 'cancel'; a tap on a day sets it and closes the dialog. The value
stays the ISO date string `roastDate` holds now, so nothing stored changes, and a date after
today is allowed (a bag is sometimes dated ahead). The same picker serves any later date field.

*Built (Y1, 2026-10-23):* `src/shell/DatePicker.svelte` (props `label`, `value`, `onpick`,
`oncancel`) with the month grid in `src/shell/calendar.ts`; weeks start on Monday (the code base
had no rule for it). It opens on the chosen date's month, else on today's. A tap on the year
switches the two arrows to year steps (the year framed) until the next tap on it or a tap on the
month; a tap beside the dialog cancels it as the number pad's does. The bean form's button keeps
`data-testid="bean-roast-date"`. Screenshot (screenshot in the team repository).

**Hot water: the state line (item 2; Y2).** On the hot water page the machine's state seems to
show Idle always (founder, 2026-10-22). Today `HotWater.svelte` draws `<StateLine {skin} />`
without `heat`, while home passes `heat="group"` and steam `heat="steam"` (T3), so the line
cannot say 'Heating' there: an idle machine under its target is shown as Idle. Default (decided by item 9: the founder wants home and hot water the same, by the group
temperature): the hot
water page waits for the group's heater as home does (`heat="group"`); the milestone first looks on the rig at what the hot water page's line shows in
idle, while the machine heats, while hot water pours and after it, and the value the page should
wait for (the hot water temperature of `hotWaterData` against the mix temperature is the
alternative). While hot water pours the line says 'Hot water' as home's does; that is an
acceptance check, since the transcript can also mean the line stays 'Idle' during the pour.

*Built (Y2, 2026-10-23):* `HotWater.svelte` passes `heat="group"` to its `StateLine`, as home
does. On the rig (Decaid 0.8.8, simulated DE1) the page's line said 'Idle' while the idle group
heated from 77 to 90 °C against its 93 °C target, 'Hot water' while hot water poured
(`hotWater`/`pouring`; the frame's `targetGroupTemperature` is then the hot water's 75 °C), and
'Idle' again after it while the group still heated. With `heat="group"` it says 'Heating' before
and after the pour while the group is more than 3 °C under target, and 'Hot water' during it.

**Hot water: stop at volume without a scale (item 3; Y3).** Without a connected scale the row
reads **stop at volume** with the unit **ml**, with a scale **stop at weight** and **g**
(founder, 2026-10-22). The field is the same, `hotWaterData.volume`: with a scale Decaid stops it
at that many grams (research.md 21), without one the machine's own volume stop applies
(`src/hotwater/hot-water.ts`, whose `HOT_WATER_FIELDS` has the label 'stop at weight' and the
unit 'g' fixed). Default: the label and unit follow `skin.scaleLink` (`connected` is the scale;
`unknown` and `disconnected` are none), the number is not converted, and the range 10 to 500
stays. The **ratio favourites** (the last shot's grams times a ratio) stay shown, since a shot's
yield in grams is a good estimate of the water in ml; they are not offered when the last shot has
no weight. The home water view's weight line already appears only with a scale (3.8). Built in Y3:
`hotWaterFields(scaleLink)` gives the rows, the row's test ids stay `hot-water-weight` and
`hot-water-slider-weight`, a favourite reads its amount in the row's unit ('1:2 80 ml' without a
scale), and without a weighed last shot the favourites are not shown at all (no disabled chips).

**Sleep: the machine sleeps after use (item 4; Y4).** The machine goes to sleep sometimes
although the app was used a minute before; the sleep must follow the sleep-after setting
(founder, 2026-10-22; the transcript's 'sleeper after setting for a decade' is read as Presence
Detection's 'sleep after', `sleepTimeoutMinutes`, 15 min in the export; the founder confirmed it
is Decaid's own timer of 15 min and that it seems unconnected from the skin's use). It is Decaid
that sleeps the machine, not the skin (3.10).

*Research (2026-10-22, Decaid's `main`, the 0.9.0 of the export: `rest_v1.yml`, `doc/Skins.md`,
`doc/Api.md`, and Streamline-js `main`, all 118 files of its `src/`):* **there is a request the
skin must send.** `POST /api/v1/machine/heartbeat`, 'Signal user presence': 'Call this endpoint
periodically (e.g., on user interaction) to signal that a user is actively using the skin. This
resets the auto-sleep timer.' It answers `{"timeout": seconds}`, the seconds left before the
auto-sleep, or -1 when presence tracking is off or no machine is connected. Decaid forwards it
to the DE1 at most every 30 s and answers at once; it needs `userPresenceEnabled` true and a
connected DE1. There is no other event for presence. Streamline-js defines `signalHeartbeat` in
`api.js` and imports it in `settings.js`, but nothing in `src/` calls it, so even the default
skin may not send it (the Streamline 0.2.17 the rig serves was not read). The skin sends none:
`src/api/client.ts` has no heartbeat. That is why the machine sleeps from the last time
Decaid saw anything and not from the founder's last touch.

Default: `DecaidClient.heartbeat()` (`POST /api/v1/machine/heartbeat`, the `timeout` read from
the answer) and **a heartbeat on a touch of the skin**, at most once every 30 s (Decaid's own
minimum), sent from the one pointer handler `App.svelte` already has, on every screen and while
a shot, steam, hot water or flush runs. Not sent while the machine sleeps (a touch then wakes it
through the Asleep screen, 3.10). A failed heartbeat is ignored, with no notice: it is a comfort.
The skin never writes `sleepTimeoutMinutes`. The milestone checks on the rig, with the setting
at 1 min and the heartbeat's own `timeout` as the meter: that `timeout` falls from 60 and
returns to 60 after a heartbeat; that it is -1 with presence off; whether a heartbeat to a
sleeping machine wakes it (it must not, so the skin sends none then, and 'Machine sleep' of 3.10
keeps the app awake without waking the machine); and what resets the timer without a heartbeat
(a shot, steam, a touch only), to explain what the founder saw. If a heartbeat does something
else than the docs say, the skin reports what it found and the founder decides (section 8).

*Built (Y4, 2026-10-22):* `DecaidClient.heartbeat()` and `Heartbeat` (`src/shell/heartbeat.ts`),
fed by `Skin.touched()` from `App.svelte`'s pointer handler: the first touch sends at once, then
none until 30 s after the last one sent; none while the machine sleeps (`machineAsleep`, so not
after 'Machine sleep' either); a failed one still counts for the 30 s. On the rig (Decaid 0.8.8,
research.md 32) the heartbeat behaves as the docs say: each one starts Decaid's timer again and
answers the whole timeout (60 with 1 min; it never answers a falling value, so the timer's fall
is timed by the sleep itself), -1 with presence off, and it does not wake a sleeping machine.
Without a heartbeat only the machine's own runs start the timer again (a wake, a flush, steam,
a shot, each counted from its end); reads, workflow writes and an `idle` request to an idle
machine do not, which is what the founder saw: the skin used without a run did not count.

**Steam: the clock starts and ends with the steam (item 5; Y5).** The steam timer seems to start
too early: the countdown is at 0 while the machine still steams for 1 or 2 seconds, and the
'last steam' at the top right shows 32 s though the timer was 26 s, so there is time at the
start and at the end that is counted (founder, 2026-10-22,
the screenshot (screenshot in the team repository): the founder boxed the pressure
rising before the steam and the pressure falling after it, and the timer and 'last steam'). The
founder expected Decaid to send events for it, with flow or pressure as the fallback.

*Research (2026-10-22, same sources):* **Decaid sends the start, not the end, and no steam event
of its own.**

- `ws/v1/machine/shotState` ('ShotStateEvent': idle, preheating, pouring, stopping, finished, why
  a step advanced, why the shot stopped) is the espresso sequencer's feed; it has no steam.
- `SteamSequencer` and `GET /api/v1/steams` keep steam records, 'opened on entry to
  MachineState.steam and finalized when the machine leaves steam': a record holds the lead-in and
  the tail (43 to 55 s a record in the export) and says nothing of where the steam is.
- What the machine itself reports is the snapshot's `state.substate`: `preparingForShot`,
  `pouring`, `pouringDone`, `pausedSteam`, `puffing`. Streamline-js uses it so for shots: its
  shot clock starts at `preinfusion` or `pouring` and 'excludes the preparingForShot phase'
  (`app.js`). So **the start has an event: the first `pouring` frame.** The end has none.

The export's steam records show the rest, 12 records of 2026-10-13 to 2026-10-21, the last six
with a full steam:

- The machine is in `steam` with the substate `preparingForShot` for **2.2 s** before the steam:
  the pump primes, flow 0 to 3 ml/s, pressure rising to 0.8 bar. Then `pouring` starts.
- The flow falls under 0.5 ml/s at **the timer plus about 0.5 s after the start of `pouring`**
  (timer 24 s: 24.5 s; timer 25 s: 25.2 s; timer 23 s: 23.5 s). The machine's timer counts from
  `pouring` and the steam ends with it.
- The substate stays `pouring` for **3.5 to 5 s more** (28.5 s in all for a timer of 24 s, 30.2 s
  for 25 s) with the flow at 0.3 down to 0 ml/s and the pressure falling to 0.1 bar; then
  `puffing`. So the substate does not mark the end; the flow does, the pressure only follows it.

Today `steams` in `src/steam/run.ts` calls every frame of state `steam` that is not
`pouringDone`, `puffing` or `pausedSteam` steaming, so a run starts with `preparingForShot` and
ends at `puffing`: it is the timer plus about 2.2 s before and 4 s after, 32 s for the timer of
26 s, and the countdown (`secondsLeft`, from the run's own seconds) reaches 0 about 2 s before
the steam does and shows 0 while it still steams. Default: the run **starts with the first frame
of the substate `pouring`**, so the clock, the countdown and the graph's 0 s are the machine's
timer's; while the machine is in `preparingForShot` the page shows the timer unchanged and draws
no graph. The run **ends with the last frame at 0.5 ml/s or more** (the fallback the founder
named: the flow, not the pressure, whose fall is slower and noisier), with the frames after it
neither drawn nor counted, so the graph and 'last steam' end where the steam does (timer 24 s:
about 24.5 s). The substates after `pouring` (`pouringDone`, `puffing`, `pausedSteam`) and every
other state still end the run as before, and a run in which the machine leaves `steam` before the
flow falls ends there. Hysteresis: the flow must have been at 0.5 ml/s or more in `pouring`
before its fall can end the run, so a start that is slow to move water does not end it; the
0.5 ml/s is a constant to check against the rig's simulated steam, which has no
`preparingForShot` (research.md 8.7) and so also tests the fallback: without that substate the run
starts with the first steam frame as now. **The start condition, in one line:** the first frame whose substate is `pouring` (the machine's
own start of the steam, after `preparingForShot`); where a machine never reports `pouring`
(the rig's simulated one skips the real DE1's substates, research.md 8.7), the first frame of
state `steam` that steams, as today. **The end condition:** the last frame at
0.5 ml/s or more in `pouring`; the substate leaving `pouring`, or the state leaving `steam`,
ends it at once. `SteamSeries` gets a `flow` array (`frame.flow`, ml/s) for it, which item 11 draws.
The tests use the real frames: the `state`, `substate`,
`flow`, `pressure`, `steamTemperature` and timestamp of two or three of the export's steam records
(those of 2026-10-17 16:15 and 2026-10-21 07:51, trimmed, kept as test fixtures; the export
itself stays out of the repository, see `.gitignore`).

*Built (Y5, 2026-10-23):* `recordSteamFrame` in `src/steam/run.ts` with `STEAM_FLOW` = 0.5 ml/s;
the fixtures are `src/steam/fixtures/export-steams.json` (both records whole, six fields a
frame). The two records give runs of 24.48 s and 24.52 s for their timer of 24 s; of the
export's ten full records nine end between 0.03 s before and 0.5 s after their timer (one, timer
22 s, ends at 19.5 s, stopped early), and in none does the flow come back to 0.5 ml/s after its
fall. Left open by the text and decided so: the flow rule holds only
for a run that started in `pouring` (the simulated steam has flow 0 throughout and ends when it
leaves `steam`); after a run has ended no new one starts until the machine has left `steam`, so
the tail and the purge start none; while the machine is in `preparingForShot` the last steam's
graph and 'last steam' stay until the new run's first frame replaces them, as between steams
before.

**Hot water and flush ring: on every screen (item 6; Y6).** The founder wants the hot water and
the flush ring on any screen and sees, at the moment, only the flush ring and only on the home
screen (founder, 2026-10-22, said after the review). W2 (3.10 'Countdown ring on every screen')
decided exactly this and was built: `smallRingRun` in `src/shell/water.ts` gives the small ring of
`SmallRing.svelte` on every screen but home and the hot water page during a pour. So either the
build the founder tested does not behave as W2 says, or the hot water run is not seen. Default:
the milestone starts by reproducing it on the rig for every screen (home, steam, hot water,
profiles, both editors, settings, beans, the history over home) and both kinds (hot water, flush):
whether `Skin.waterRun` is set for hot water (the machine state `hotWater` and the substate
it passes through; the export's settings have `stopHotWaterAtWeight` on and a connected scale,
where hot water ends by weight), whether `canStop` is true, whether the small ring is drawn and
visible (its place above the pages' controls), and which of those fails; then it fixes the cause
and adds one test over the whole matrix (acceptance 78), since the W2 tests did not catch it.
The wording is also open: if the founder meant that the large ring should show on every screen,
not the small one, section 8 asks.
Built in Y6 (2026-10-23): on the rig (Decaid 0.8.8, simulated DE1 and scale,
`stopHotWaterAtWeight` on) every one of the 18 cases works: hot water is `hotWater`/`pouring`
from its first frame to its last, flush `flush`/`idle`, `Skin.waterRun` and `canStop` are set,
and the ring is drawn on top (large on home and on the hot water page for hot water, small
elsewhere and over the history). The failure the founder saw is not reproduced; the tablet's
Decaid 0.9.0 and real DE1 were not seen (their API documentation names the same states). What
the matrix did show is that the small ring was a grey disc in the corner, easy to take for
decoration, with nothing saying what it is. So the small ring now looks like the large stop:
edged in the temperature red, with its kind ('Hot water', 'Flush') in red under it, in the same
button; the history keeps 5.5 rem under its last entry for it. Tests: `e2e/water-ring.spec.ts`
'rings everywhere' (both kinds times the nine screens), rig `e2e-rig/rings-everywhere.spec.ts`.

**Profile picker: search (item 7; dropped).** The founder asked to add a search filter to the
profile picker, then dropped it (2026-10-22): the picker has had one since 0.3.0, T4's 'filter by
name' (`filterProfiles` in `src/shell/profiles.ts`, the field `profile-filter`, 3.8), the
founder may have looked at an older version, and the filter by name is enough. Nothing is
planned; a search over author and description would be a new item if it is missed later.

**Steam page: the heater-off warning goes to the header (item 8; Y8).** When the steam heater is
off, the steam page shows a warning and a button, 'The steam heater is off' and **Steam on**,
over the right column; the founder wants them in the header row (founder, 2026-10-22,
the screenshot (screenshot in the team repository), the warning and the steam timer
under it circled). Today `Steam.svelte` draws them as a block (`steam-heater-on`, built in U3
from 3.9 item 18) at the top of the right column when `skin.steamHeater` is `'off'`, and the
block pushes the steam timer down. Default: the **Steam on** button sits at the right end of
the header row, left of the page's title (X3), and the sentence goes: the state line says
**Off** (item 9) in the warning colour, which is the same message in one word, so the header
does not grow. The right column does not move when the heater is on or off: the timer keeps its
place and the space the block took is not reserved. The button keeps its test id and its
behaviour (`setSteamHeater(true)`, the notice if Decaid refuses); the block's `p` goes. If the
founder wants the whole sentence in the header, it fits at 1280 px beside the button when the
'last steam' text is not shown (the heater is off, so nothing steamed just now).
*Built (Y8):* **Steam on** (`steam-heater-on`) is in `Steam.svelte`'s part of the header
(PageHeader's `beside`), after 'steaming / last steam' and left of **Steam**, no taller than
the header (3.5 rem), so the header keeps its height; the block `steam-heater-off` and its
sentence are gone. The favourites no longer give way to it: they stay at the top of the right
column with the heater on or off, so nothing in the column moves. A refusal is the page's
notice, as before. Test: `e2e/steam.spec.ts` (the button in the header left of the title with
the heater off, gone with it on, header, favourites and timer in the same place, and the
notice when Decaid refuses); screenshot
steam-heater-off.png (screenshot in the team repository).

**State words: idle, heating and off follow the heater (item 9; Y9).** The machine state is
shown as Idle always on the steam page, as on the hot water page (founder, 2026-10-22; the
screenshot shows 'Idle' with the steam at 32 °C and the heater off). Home and the hot water page
say the same: **Heating** until the group is within 3 °C of its target, then **Idle**; the steam
page follows the steam heater: **Heating** until the steam temperature is within 3 °C of the
steam target, **Idle** in that range, **Off** when the steam is off (target 0). Today
`isHeating` and `heatingStatus` in `src/shell/machine.ts` give 'Heating' only for an idle machine
under its target (`HEATED_MARGIN`, 3 °C) and a heater that is off is explicitly 'not heating',
which leaves Idle; the hot water page does not pass `heat` at all (Y2). Default, in
`statusFor`/`heatingStatus`: **home and hot water: `heat="group"`**, the espresso target
`targetGroupTemperature` (this settles Y2's choice); **steam page: `heat="steam"`** with the
machine's `targetSteamTemp`: below target - 3 °C Heating (tone `busy`), at or above target - 3 °C
Idle (tone `ok`), and target 0 **Off** (tone `off`, the warning colour when the heater is off
while the page is shown, as the screenshot shows it). The 'plus 3 °C' side is the founder's
'in that range': a boiler hotter than target + 3 °C (just after steaming, cooling down) is also
ready, so it says Idle, not a fourth word; the founder says so if it should say something else.
Only an idle machine takes these words: Espresso, Steam, Hot water, Flush, Asleep and the rest
stay the machine's own state, as now. The decision uses the **filtered** temperature (item 10)
with a hysteresis of 1 °C (Heating again only below target - 4 °C), so a value that jitters at
the border does not flip the word.

*Built (Y9, 2026-10-23):* `heaterWord` in `src/shell/machine.ts` gives an idle machine's heater
as `off`, `heating` or `heated` (`HEATED_MARGIN` 3 °C, `HEATED_HYSTERESIS` 1 °C, the last word as
input) and `heatingStatus` turns it into the line's word; `Skin.statusFor` keeps the last word of
each heater, the group's shared by home and hot water. 'Off' is in the warning colour (title and
dot, `heater-off` in `StateLine.svelte`). A steam target that is not known yet (no settings
frame) leaves 'Idle'. Y10's filter was not committed when Y9 was built (its run timed out), so the
words first read the frame's temperatures as they come; since Y10 they read the filtered value
(`Skin.shown`), as the state line does.

**Temperatures: filtered and rounded (item 10; Y10).** The group and steam values of the state
line are noisy (founder, 2026-10-22): they get a filter, steam shows whole degrees and the group
one decimal, 'if that is not the case already'. **It is the case already**: `stateLine` in
`src/shell/machine.ts` writes the group `toFixed(1)` and the steam `toFixed(0)`; so what the
founder sees is the raw frame jittering across a rounding border. Default: a small pure
function (`smooth` in a new `src/shell/smooth.ts`, tested) that gives the **exponential moving
average** of the frames, time constant 1.5 s (the frames come at 4 per second, so about six of
them), restarting from the new frame when the last one is older than 3 s (a stale link) or the
value jumps by more than 5 °C (a reconnect, a heater switched), and applied to `groupTemperature`
and `steamTemperature` in the skin's streams (`src/shell/streams.svelte.ts`), once, so the state
line and item 9's words read the same value. It filters the display only: the **graphs**, the
**live temperature of a shot** (the overlay's value), the shot records and every write to the
machine keep the raw frames. The constant is checked on the rig and the tablet; a steam that cools
by 1 °C a second while it steams is shown about a second late, which is accepted. Rounding stays
as it is, after the filter.

*Built (Y10, 2026-10-23):* `smooth` in `src/shell/smooth.ts` as above (`SMOOTH_TAU_MS` 1500,
`SMOOTH_STALE_MS` 3000, `SMOOTH_JUMP` 5 °C; a frame weighs by the time since the last one).
`Streams.shown` is `snapshot` with the two temperatures filtered; `Skin.status`, `stateValues`
and item 9's `heaterWord` (in `statusFor`) read it, while the graphs, the shot view, shot records
and writes read `snapshot`. Since an average comes near a small step but never quite onto it, a
word at a border changes once the filtered value has crossed it, about a second after the frame
did. On the rig (Decaid 0.8.8) a shot's start drops the simulated group by 15.5 °C in one frame,
which the line takes at once, and its reheating from 77.5 to 93.8 °C climbs the line in steps of
0.3 °C at most.

**Steam graph: the flow (item 11; Y11).** The steam graph has no flow curve and should (founder,
2026-10-22, after the question of Y5's end condition). Today `Steam.svelte` draws `ShotGraph` with
`t`, `pressure` and `temperature` only, and `SteamSeries` (`src/steam/run.ts`) holds those three.
Default: Y5's `flow` series is drawn in blue, as in the espresso graph (blue is flow, green
pressure, red temperature, 3.2), on the scale that pressure already has: `yMax={4}` fits, since the
export's steam runs peak at 3.6 to 3.7 ml/s and 3.4 to 3.8 bar; the unit line under the axis reads
'bar ml/s' as the shot graph's does; the temperature keeps its band of 140 to 170 °C. The graph
begins and ends with Y5's run, so the flow starts at its first `pouring` frame at 2 to 3 ml/s and
falls to zero where the run ends, which is also the picture that shows the end rule working. The
legend (setting `showGraphLegend`, which the steam graph does not pass today) is passed to the
steam graph too, so the three curves are named under it when the setting is on. No target line is
drawn: the steam's flow setting (`steamSettings.flow`, 0.4 to 2.5) is the pump's request for the
machine's steam valve and is not the measured flow's scale.

*Built (Y11, 2026-10-23):* `Steam.svelte` passes `series.flow` and `showGraphLegend` to
`ShotGraph`; nothing else changed in the graph. In the export's steam of 2026-10-17 the flow
peaks at 3.6 ml/s in the first second of `pouring`, falls to about 1 ml/s within 5 s, stays at
0.8 to 1 ml/s and ends at 0.5 ml/s with the run (picture `docs/product/steam-flow.png`, the
mocked gateway replaying that export steam).

### 3.13 Publishing the skin

The founder wants to publish the skin after the roadmap's current items (H4 and what it carries),
2026-10-22: a clean public repository and **a user documentation**. Planned only. This section
is the audit of the repository on 2026-10-22 (what must change before it is public), the plan
for the user documentation, and the decisions that are the founder's. Spec 4.4 already says
'public GitHub repository under GPL-3.0' and 'later releases: the same ZIP attached to a GitHub
release, installable by URL'; this is how.

**Audit: what is in the repository today.** 433 tracked files and 173 commits, all by the
founder under a personal e-mail address; `package.json` and `public/manifest.json` carry the
repository `github.com/Jan3kJ/decaid-pureflow` (whether it is public today was not checked: no
`gh` on this machine). The skin itself is clean of secrets: no key, token or password outside
test fixtures, no MAC address but invented ones (`AA:BB:CC:00:00:01`), no real IP. What is not
ready, by how much it matters:

*Must be done before the first public commit*

1. **No `LICENSE` file.** Spec 4.4 decides GPL-3.0 and `package.json` says `GPL-3.0-only`, but
   the repository has no licence text. Add the GPL-3.0 text as `LICENSE`. The ported files carry
   Streamline's notice 'GPL v3 or later' (README, `src/shell/phases.ts`) while acceptance 12 and
   research.md call it ISC (Streamline-js's `package.json` says ISC): read Streamline's
   `LICENSE` at the ported tag (v0.2.14) and make README, the file headers, acceptance 12 and a
   new `NOTICE` (the ported files and their origin, Decaid's 73 bundled profiles as test data,
   D-Flow) say one thing. GPL-3.0-only for the whole is fine with GPL-3.0-or-later parts.
   *Built (P1, 2026-10-24):* Streamline's `LICENSE.txt` at v0.2.14 (and v0.2.17) is
   GPL-3.0-or-later; ISC is only its `package.json` field. `LICENSE` is the FSF's GPL-3.0 text,
   `NOTICE` lists the 43 ported files, the 73 profiles, D-Flow and DSx2, README has a Licence
   section (`GPL-3.0-only`), and `src/licence.test.ts` keeps them equal (research.md 17.9).
   Where this section (3.6, 3.9) and acceptance 12 say 'ISC notice', the notice is
   Streamline's GPL one; acceptance 12's wording is the founder's to change.
2. **D-Flow, and DSx2.** The TypeScript generator and the five defaults in `src/aflow/` are the
   founder's own code in this repository, so this repository's licence covers them; **the
   `Jan3kJ/A_Flow` repository needs no licence of its own** (founder, 2026-10-22): README links
   it as the old Tcl plugin the skin replaces ('the previous version of A-Flow'). What does
   matter is the line before it: A-Flow was forked from Damian Brakel's D-Flow, which has no
   licence file, and spec 4.4 says the founder has Damian's approval for it. **The founder asks
   Damian** (2026-10-22) and keeps his answer in writing (a comment on D-Flow's repository, or
   a message in the team repository); README and `NOTICE` credit D-Flow. A second credit line,
   asked for by the founder: **[DSx2](https://github.com/Damian-AU/DSx2)**, Damian Brakel's
   skin for the old Decent app, which the founder used and which inspired many of this skin's
   ideas. It is credited as inspiration ('many ideas are inspired by DSx2'); no DSx2 code or
   asset is known to be in the skin, and if P1 finds any, DSx2's licence is read and `NOTICE`
   names the file.
3. **Personal data and local paths.** `docs/research.md` holds 19 local paths
   (`..\decaid-rig`, `../streamline-js`), `docs/d4-rig-smoke.txt` a Windows user
   profile path, the stint day plans 70 more. **The founder's personal e-mail is in no file, only
   in the author of all 173 commits**: it comes from this machine's global git configuration
   (`~\.gitconfig`, `user.email`), and the founder does not want it in public
   (2026-10-22). The public repository therefore starts with a history written with the founder's
   GitHub noreply address, `52261469+Jan3kJ@users.noreply.github.com` (given 2026-10-22; item
   12). The commits Claude makes from 2026-10-22 on use it through this repository's own
   `user.email`; the founder's global configuration (`git config --global user.email`) is the
   founder's to change. The **screenshots** of `docs/product/` come from the mock gateway
   ('MockDe1', invented addresses) and are safe; the founder's own tablet screenshots, the
   Decaid export and anything with real beans, roasters or devices must not go in (the
   export is already ignored). Add `scripts/publish-check.mjs` that fails on a Windows path, an
   e-mail address, a MAC address that is not `AA:BB:CC:`, the messenger's name and a bot token pattern in
   the files of the product repository, run in CI.
4. **The team's records are not the skin, so they get a repository of their own** (founder,
   2026-10-22: 'work in two repositories, one for the product, one for docs and tools'). The
   split is item 12.

*Should be done*

5. **The ZIP holds `camera.html`**, the founder's camera test page for U13 (`public/`), and the
   repository holds the rig probes `scripts/rig-*-probe.mjs`. Default: `camera.html` stays out of
   the public ZIP until U13 is built or dropped (`npm run zip` rejects it), the probes move to
   `scripts/rig/` with a line in the README, or go private.
   *Built (P2, 2026-10-26):* U13 is built, so the camera test page is dropped: `camera.html`,
   its e2e spec and the 'Camera test' row of Skin > Backup and version are gone, and the
   product takes `public/` whole.
6. **No CI.** Add `.github/workflows/ci.yml`: `npm ci`, `npm run check`, `lint`,
   `format:check`, `test`, `build`, the e2e on the mock gateway (Playwright's browsers), and
   `scripts/publish-check.mjs`; and no `release.yml`: **the release is made by one script, `scripts/release.mjs` (3.15, P7)**, so there
   is one way to publish and not two. The rig suite (`e2e:rig`) needs a running Decaid and
   stays local.
   *Built (Z26):* `ci.yml` has a second job, `e2e`, beside `verify`: `npm ci`, Playwright's
   Chromium (`npx playwright install --with-deps chromium`) and `npm run e2e`, with
   `e2e/.results/` kept as an artifact when it fails; unproven until the next push runs it.
7. **No CONTRIBUTING, CHANGELOG, issue templates or SECURITY note.** Add a short
   `CONTRIBUTING.md` (the commands of README, the test rule, one-pull-request-one-change, the
   GPL), `CHANGELOG.md` (from the day records and 3.8 to 3.12, one entry per version),
   issue templates (bug: Decaid version, skin version, tablet, what happened; request) and a
   `SECURITY.md` of three lines (the skin talks only to the local Decaid, stores nothing but
   settings in the tablet's browser).
   *Built (P3, 2026-10-26):* `npm run verify` (`scripts/verify.mjs`) is the one list CI and
   the release script run: `check`, `lint`, `format:check`, `test`, `build`, the publish
   check, the docs check and `npm audit --audit-level=high`. `ci.yml` runs `npm ci` and `npm run
   verify` on Node 22, on push and pull request to `main`; the e2e on the mock gateway is not in
   it (about 11 minutes, run locally like the rig), and there is no release workflow. In the team
   repository, before the cut, the publish check reads the files as the cut makes them
   (`--cut=stint/cut`: the paths of `paths.txt`, rewritten by `text.txt`). `CONTRIBUTING.md`
   (the commands, the test rule, one pull request one change, the commit trailers of 3.15, the
   GPL notice of ported code), `CHANGELOG.md` (a section per hand-over, 0.1.0 to 0.6.1, in the
   format of 3.15 step 5), `.github/ISSUE_TEMPLATE/` (bug, request, and links to private
   reporting and to Decaid's issues) and `SECURITY.md` (GitHub's private vulnerability report; in
   scope the skin's code and its ZIP), linked from README; `docs-check` reads the three files too.
8. **README is a developer's.** It becomes the front page: what pureflow is, one screenshot,
   requirements, install in three lines with the user documentation's link, then
   Development, Credits and Licence as now.
9. **Naming.** 'pureflow' is the id Decaid installs under (a folder name; changing it later
   loses the founder's tablet settings, so it stays) and the name. Before publishing: search
   GitHub and Decent's forum for a clash, say 'unofficial skin for Decaid' under the title,
   and keep 'Decent', 'Decaid' and 'A-Flow' as names of what it works with. The migration of
   the former name `decaid-skin` (`src/former-name.ts`, `migrate.ts`, `former-keys.ts`) serves
   only the founder's tablet; keep it for one public release, then drop it.
   *Built (P3, 2026-10-26):* a web search on 2026-10-26 found no skin, plugin or repository
   named 'pureflow' for the DE1 or Decaid; GitHub's own search needs an account and was not run.
   README says 'An unofficial skin for Decaid' in its first line.
10. **Dependencies and checks.** `npm audit` and a list of the bundled dependencies' licences
    (the ZIP holds Svelte's runtime, MIT; dev tools do not ship) into `NOTICE`; a full run of
    `npm test`, `check`, `lint` and `format:check` on a clean clone (`npm ci`), not only on the
    founder's machine, with the result in `CHANGELOG.md`.
    *Built (P3, 2026-10-26):* the ZIP holds two packages of `node_modules` (read from the
    build's source maps): Svelte 5.57.2 and clsx 2.1.1, both MIT, listed in `NOTICE`; there are
    no production dependencies in `package.json`. `npm audit`: 0 vulnerabilities. A clean clone
    with `npm ci` (Node 24 on the founder's machine; CI uses 22) passed `npm run verify`
    (1191 tests); 0.7.0's CHANGELOG section carries the release's own result line.
11. **Version.** The first public release is **0.7.0**: the hand-over H5 of 3.14 takes
    0.6.0 (a hand-over raises the minor version), the release is the next minor, and not 1.0.0
    (founder, 2026-10-22: 0.6 or later; 2026-10-23: the release moves to 0.7.0). A 1.0.0 would be
    a major bump and is asked first.

**User documentation: plan.** **Short, and only what is the skin's** (founder, 2026-10-22):
Decent documents Decaid, its skin selector, the DE1 and its settings, and the skin should be
intuitive, so the documentation does not repeat any of that: it links Decent's pages for it. For
people who own a DE1 and run Decaid on a tablet. Markdown in `docs/user/`, English only, three
short pages and no more, each about a screen long, linked from README:

| Page | Holds |
|---|---|
| `install.md` | only what differs: the ZIP of the release or its URL into Decaid's skin selector (a link to Decent's page for the selector itself), the id `pureflow` so an update installs over the old one and keeps the settings, the settings backup in Decaid's store and where to restore it, what 'Decaid is not reachable' means for a skin opened outside Decaid |
| `guide.md` | **what is not obvious**, one short section each, in this order: the three pages are one row, swiped (hot water, home, steam), with the history behind a swipe from the left edge and the dots and handle that show it; the home screen is also the shot screen (the profile and bean buttons are there only when no shot runs; the finished shot stays until the next); 'Heating' and why the state line differs a little per page; a tap on the scale's weight tares; the A-Flow 3.0 editor and what it writes (and that every A-Flow profile opens in it, old ones converted on save or by the settings button); the step editor for other profiles; the steam timer from the milk's weight (mug, set timer, the adjust buttons, the countdown); hot water's stop at weight or volume and the ratio favourites; beans and grinders and the pick for the next shot; restoring a shot from the history; sleep (the two menu entries, and that the skin tells Decaid you are there so the machine does not sleep while you use it); the skin's own settings |
| `troubleshooting.md` | a table: the state line's messages and the control that fixes each (no machine, no scale, the stream refused), a profile that will not load, the machine sleeps, what to put in a bug report (versions, tablet, what happened) |

The pictures are **few, generated and exact**: eight at most (home idle, home during a shot, the
phone-like swipe row, the A-Flow editor, the steam page, the history overlay, the bean pick,
settings Skin), made by one Playwright script (`scripts/screenshots.mjs`, `npm run screenshots`)
on the mock gateway at 1280 x 800 CSS pixels, device scale factor 2, dark, into
`docs/user/img/`, so a release refreshes them and no real bean, device or address can be in
them. Each page names the version it was checked against, and `scripts/docs-check.mjs` fails when
a link or an image does not resolve (in CI). The text is written from this spec's built notes,
using the controls' labels as the skin shows them. *Built (P4, 2026-10-24):* `npm run screenshots`
(`scripts/screenshots.mjs`) runs `e2e/user-docs.shots.ts` with `playwright.screenshots.config.ts`
(the e2e configuration with locale `en-US`, time zone UTC and a fixed page date; `npm run e2e`
does not run it) and checks that `docs/user/img/` holds exactly `home-idle.png`, `home-shot.png`,
`swipe-row.png` (home half way to steam under a finger), `editor.png`, `steam.png`,
`history.png`, `bean-pick.png` and `settings-skin.png`; two runs write the same bytes. Beans,
roasters and grinder are invented ('Example Roasters · House Blend', 'Sample Coffee Co · Washed
Single Origin', 'Hand grinder'). `npm run docs-check` checks README and every `.md` of
`docs/user/` (relative paths, GitHub heading anchors, HTML `src`/`href`); `src/docs-check.test.ts`
plants a broken link, a missing image and a missing anchor. *Built (P5, 2026-10-25):*
`docs/user/install.md`, `guide.md` and `troubleshooting.md`, checked against 0.6.1 and linked
from README, follow the founder's later order (the corner menu and the swipe back, the A-Flow
editor, the picker's estimate, beans and the bag photo, the ring, the settings; the connection
messages, the scale, the steam timer, the bag photo's limits, the way back to Streamline). They
use seven of the eight pictures (not `home-shot.png`); the picker and the bag photo have none.
Decent's pages are linked: `decentespresso.com/docs` and Decaid's `doc/Skins.md` at `v0.8.8`.
The founder reads the three pages **cold on
the tablet** (acceptance 84) and a person who has not seen the skin installs it with them
alone (acceptance 85).

**Two repositories (item 12; P2).** The founder's choice (2026-10-22), simpler than a mirror
that is made by a script: **the product repository is public and is where the skin is
developed; a second repository, private, holds the team's records and tools.** Nothing is
copied between them, so there is nothing to keep in step.

| | Product repository (public) | Team repository (private) |
|---|---|---|
| Name (founder, 2026-10-22) | `Jan3kJ/decaid-pureflow`, the name `package.json` and the manifest already carry | `Jan3kJ/pureflow-team` |
| Holds | `src/`, `e2e/`, `e2e-rig/`, `public/`, `scripts/` (build, zip, screenshots, the checks), the configuration files, `LICENSE`, `NOTICE`, `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `.github/`, `docs/user/` and `docs/a-flow-3.0.md`; **`docs/spec.md` and `docs/research.md`**, scrubbed of local paths and message numbers, because the code's comments cite them ('spec 3.10', 'research.md 8.7') and a contributor needs the reasons | `stint/` (day plans, day records, blog, logs, prompts), `stint.toml`, `.claude/`, the founder's review notes (`docs/review-*.md`, `docs/answers-*.md`), `docs/acceptance.md` and `docs/install.md` (the founder's check list), the Decaid export, and the rig's logs and probes (`scripts/rig-*-probe.mjs`) |
| Who writes to it | the team's work on the skin, and pull requests | the team's planning and the founder's reviews |

How the one move is done (P2): **the product repository is cut from this one** with
`git filter-repo` on a fresh clone, keeping only the product paths above and rewriting every
author and committer to `52261469+Jan3kJ@users.noreply.github.com` with a `--mailmap`, so the public history is the
real history of the skin without the records, the personal address or the early messages
about them (commit messages that name a chat message or a token budget are rewritten with
`--replace-message`; the founder reads the list before it is pushed). **This repository is
not rewritten**: it keeps all its history and becomes the team repository by one commit that
removes the product paths, then it is renamed on GitHub and the product repository takes
the name `decaid-pureflow`. Pushing either, and the rename, are the founder's.

*From then on, no copying.* The skin is changed, tested and released in the product repository
(pull requests there, one `CHANGELOG.md` entry a release, CI, the tag and the ZIP of P3). The
team's tools run on the product repository from the team repository: `stint.toml` has the keys
for it (`repo_root`, `plan_dir`, `log_dir`, `roadmap_path`, `spec_path`, `days_dir`,
`blog_dir`), so `repo_root` points to the product checkout (`../decaid-pureflow`) and the plans,
logs, days, blog and `roadmap.json` stay in the team repository. **P2 starts by trying this**:
that the runner, the plan prompt (which reads `docs/spec.md` and writes to it) and the roadmap
check work with the two checkouts side by side, and that the three prompts, which the
configuration reads 'relative to `repo_root`', can sit in the team repository (otherwise they
move to the product repository's `.stint/`, public but harmless, or the key is given an
absolute path). If the runner cannot do it, the fallback is that the team repository holds the
tools and the product repository is a checkout inside it (a nested clone, ignored by the team
repository's `.gitignore`); either way the product's history is its own. The spec's roadmap
table (section 7) stays in `docs/spec.md`, in the product repository, and `roadmap.json`, the
data form, in the team repository; the founder's reviews cite the spec by section.

**Decisions that are the founder's (section 8).** Answered on 2026-10-22: the release is
**0.7.0** (moved from 0.6.0 on 2026-10-23, H5 takes 0.6.0), not 1.0.0; the documentation is **English only**; the **announcement is the
founder's**; **two repositories** (item 12) named `decaid-pureflow` (public) and
`pureflow-team` (private); the noreply address `52261469+Jan3kJ@users.noreply.github.com`;
**the founder asks Damian** about D-Flow, and DSx2 is credited. Nothing of 3.13's decisions is
open: what is left is the work, P1 to P6.

### 3.14 Founder's review of 2026-10-23

After the hand-over of 0.5.0 the founder looked at the three screens and the bean photo on the
tablet (2026-10-23; screenshots: the steam page with the flush ring (screenshot in the team repository),
home, marked up (screenshot in the team repository), [the bean form after a
photo](product/review-10-23-bean-photo.webp)). Planned only, nothing is built: 'do not implement
it now' stands. Roadmap track Z (Z1-Z12) and a hand-over H5. The founder's words, in order:

1. **The bean photo works, the reading does not** (item 1; Z1, Z2). The form got 'name: 2 ame,
   roaster: COFFeg ROASTERS' from a bag whose roaster is **aniko** and whose bean is **tropical
   candy**; 'how to improve that?'
2. **Home: cleaning up** (items 2-4; Z3, Z4). The empty top left corner gets the menu button, on
   home, hot water and steam alike; the line of the last shot's or the current step's information
   goes, the current step is said in the header during a shot; the back tab goes
   from **every** screen (founder, later the same day): the way back is always a swipe.
3. **One type size per kind of text** (item 5; Z5): 'font size should be aligned again, for example
   the profile and bean names on the home page'.
4. **The graph's unit line** (item 6; Z6): a dot between every two labels, on every graph.
5. **The tank in ml** (item 7; Z7): 'tank state should be shown in ml, not mm; how does Streamline
   calculate that?'
6. **The flush ring in the right frame** (item 8; Z8): 'it should be like on the home page'.
7. **The finished shot's weight must stay** (item 9; Z9), said after the rest: 'the weight on
   home page was changing. After the shot it showed the correct values. Then I was doing some
   things on hot water page and it seems the weight was updated on home screen too. It should
   keep the value of last shot until a new shot is started or some new values are loaded from
   history.'

**The bean photo's reading (item 1; Z1, Z2).** What `src/beans/ocr.ts` does today: Tesseract.js
(English data, `OEM.LSTM_ONLY`, `PSM.SPARSE_TEXT`) reads the photo **as the camera gave it**, no
cropping, no contrast, no scaling; `bagText` keeps lines with a confidence of 50 or more that are
word-like, takes the **line with a roaster's word** ('Roasters', 'Rösterei', 'Coffee Co' ...) as
the roaster, else the topmost, and the **tallest of the remaining lines** as the name. What went
wrong on the founder's bag can be read from the result and the thumbnail (a stylised 'aniko' logo
with 'COFFEE ROASTERS' in small letters under it, and 'TROPIC CANDY' printed over a palm picture):
(a) the roaster's word matched the **descriptor under the logo**, not the logo that is the name,
so the roaster became 'COFFeg ROASTERS', a misreading of the tagline; (b) the name is the tallest
line left, which on a picture bag is an artefact ('2 ame'); (c) logos, coloured or light-on-dark
lettering and curved text are what Tesseract reads worst, and it is given no help. The honest
limit: a stylised bag will never be read right every time; the aim is that the **fields are right
more often and that a wrong guess costs one tap**, not typing. Default, in two steps:

- **Z1, the rules (pure, tested; first a probe).** First, `scripts/ocr-probe.mjs` reads a photo
  with the skin's worker and options in Node and prints every line with its text, height,
  confidence and box, so the rules are tuned on real output; the founder gives the photo (the
  bean's photo is in the skin's store: Decaid's KV, key of the bean; a copy of the file is
  enough) and the lines of this bag and of two or three more bags become test fixtures
  (`ocr.test.ts` reads the recorded lines, not the photo). Then the rules change: **(1) a known
  roaster wins**: every line is compared (case-insensitive, letters and digits only, an edit
  distance of 1 for words of 5 letters, 2 for 8 or more) with the **roasters already in Decaid's
  catalogue** (the founder's list has aniko four times, hopplo, dak, seekind, kaffeekommune,
  maldaner, kaffeesack), and a line that matches is the roaster, whatever its words; it is the
  strongest signal there is and it improves with every bean added. **(2) A descriptor is not the
  roaster**: a line that has a roaster's word and **nothing else of more than two letters**
  ('Coffee Roasters', 'Roastery') is the roaster's descriptor, dropped, and the roaster is the line
  **just above it** (the logo) when there is one; a line with other words ('Aniko Coffee Roasters')
  is kept as printed. **(3) The name** is the tallest line that is word-like, with the stricter
  test that **most of its words have three letters or more** ('2 ame' fails) and a confidence of
  60 or more; a bean already known for that roaster in the catalogue is offered as the name when
  a line matches it. **(4) Nothing is better than rubbish**: a field with no line that passes
  stays empty, as it does today.
- **Z2, the help for the reader and for the user.** The photo is **prepared before it is read**:
  grey, contrast stretched, scaled so that the lines are 30 to 50 pixels high (a 4000-pixel photo
  is scaled down, a small crop up), and read twice, as it is and **inverted** (light on dark), the
  lines of the better pass kept (the cost is a second read, which is about the same time again;
  the progress line says so). And the form **shows what it read**: under the photo, up to six of
  the lines as **chips**; a tap on a chip puts it into the field that has the focus (name or
  roaster), so that a guess that is wrong in one field is fixed by two taps, not by typing;
  the chips are the lines, cleaned as today, in the order of the bag from the top. A photo that
  gives no line says so ('Nothing could be read from this photo'), and the fields stay as they
  are. Tesseract stays the engine (spec 3.9 item 20: free, no key, on the tablet); a cloud or
  an Android recogniser is not used.

*Z1 and Z2 dropped by 3.17 item 3 (Z19): the reading, its probe, rules, chips and tests are removed; the photo stays.*

**Home: the top left corner, the strip, the back tabs (items 2-4; Z3, Z4).** The screenshot of
home, marked up: the menu button at the right of the header circled with an arrow to the empty
corner at the left; the strip 'shot finished 55.5 s 589.4 g' crossed out; and the right column's
profile button pulled up to the header's height. Today the screens have a **left column of 4 rem**:
on hot water and steam it holds the back arrow on a panel, on home it is empty and the header
starts at its edge so that the state line does not move between pages (`App.svelte`, `--back`),
and home's strip above the graph says 'shot finished' with the time and the weight, or the
running step.

- **The menu in the corner (Z3).** The menu button moves from the right end of home's header to
  the **top left corner**, as high and as wide as the back arrow is today (56 CSS pixels), and
  **the same button is at the same place on hot water and steam**, where it takes the back arrow's
  place: the founder's 'do the same on hot water and steam page'. It opens the same menu (settings,
  history, beans, sleep, the others). The way home from those two pages stays the swipe and the
  dots, as the founder's earlier 'swipe is the better navigation' (3.11) says; the history's edge
  swipe and handle stay. The editors, the settings, the beans screen and the picker have **no
  back arrow either** (next item); their corner stays empty.
- **No back tab, anywhere (Z3).** **The left column and its panel go from every screen**
  (founder, 2026-10-23: 'for the other pages remove the back tab too to keep it consistent'): the
  content uses the whole width; on the three pages the corner button floats over the page's
  background and the state line begins right of it, at the width the button takes, so it sits at
  the same place on all three (the aim of 3.11 keeps). **The way back is one gesture: a swipe from
  left to right** (founder: 'navigating back is always a swipe left to right, except on hot water
  page'): from the steam page to home and from home to hot water, as now, and **from the editors,
  the settings (a category's page to the categories, then to home), the beans screen and the
  picker to where they were opened from**, which the editor already does (`App.svelte`: 'a swipe to
  the right leaves for home'). The one exception is the hot water page, the leftmost: **home lies
  to its right, so its way back is a swipe from right to left**, and the dots show it. The
  history overlay opens by the left-edge swipe to the right (3.8), so it **closes** by the reverse,
  a swipe to the left, or its handle, as now. Two things to settle in the build: a swipe must not
  start on a control that drags (sliders, the step editor's chips, the lists' row swipes of
  `row-swipe.ts`, the graph's scrub), which keep their own gestures; and an editor with unsaved
  edits asks as it does today before it leaves (the founder's 2026-10-14 rule). If a screen shows
  that a swipe is not found by users, a small chevron at the page's left edge is the fallback, not
  a column.
- **The right column rises (Z3).** With the menu button gone from its right end, the header's
  right end is free on home: the right column (profile button, bean button, then the values)
  starts at the **top of the page**, beside the header, and the header spans only the width left of
  it; so the column has the header's height more for what a shot shows. On hot water and steam
  the page's title (3.11) stays at the right end of the header, where the column starts.
- **Built in Z3 (2026-10-24), the details the items leave open.** The corner button is the
  first item of the shared header (`Menu.svelte` in `PageHeader.svelte`), so it and the state
  line are at the same place on the three pages; its menu opens under it at the left. The way
  back is one place, `App.svelte` with `destination` in `src/shell/swipe.ts`: the skin keeps
  where each screen outside the row was opened from (`Skin.back`), so the editor's picker goes
  back to the editor and the editor, after it, home. The settings page shows its categories and
  the chosen one side by side, so there is no category page to go back from: its swipe goes
  home. The open history closes by a swipe to the left anywhere on it, at the distance that
  opens it. A swipe starts anywhere but on a field, a dialog, a drag of its own
  (`touch-action: none`: the editor's graph and chips, the sliders), a row's swipe
  (`data-no-swipe`) or a row that scrolls sideways (the editor's start row, the step cards); a
  list that scrolls down is no obstacle, since the browser's pan is vertical only (`app.css`).
  Until Z8 the small ring of hot water and flush sits at the bottom left corner over the screen
  and may cover a control there.
- **The strip goes, the step goes into the header (Z4).** The strip above the graph is removed
  and the graph takes its height ('there is a lot of empty space when no shot is loaded'). What it
  said is said elsewhere: **'last shot info is already shown in the right column, right?' Yes**:
  the right column keeps the finished shot's time and weight (the time and the weight of the
  shot are its two large values, as the founder's screenshot shows 55.5 s and 589.4 g), so the
  strip's numbers are a copy. 'Shot finished' as a word is not lost: the right column's time
  label reads **'time, finished'** while a finished shot is kept, **'time'** while it runs; the
  state line says Idle, as the machine is. **The running step** goes to the header, **printed to the right of the
  state line's values** (founder, 2026-10-23: 'just print the step name next right to the status
  header, scale and weight'): after the scale's weight, one more item, the step's name as the
  profile has it, by the frame number the machine reports ('Preinfusion', 'Extraction'; a step
  without a name says 'Step 3'), in the state line's value size and colour of the state word,
  without a label. It is shown only while a shot runs and goes with it; the state word and the
  values keep their places and their words ('Espresso', not a pair). Hot water, flush and steam
  have no steps and show nothing. Nothing else of the strip is kept.
- **Other ideas (founder asked).** (a) The profile's name on the right column's button is one line
  and cut with an ellipsis when it is long; the full name is in the picker. (b) With the strip
  gone and the corner button in, the graph's legend ('flow, pressure, temperature, dashed') and
  the page dots no longer compete with a strip for the same width: the dots stay in the middle
  bottom. (c) A tap on the **time** in the right column of a finished shot could open the shot's
  entry in the history; not planned, said as an idea.
- **Built in Z4 (2026-10-25), the details the items leave open.** The step is `runningStep` in
  `src/shell/shot.ts`, read by `Skin.step` and printed by `StateLine.svelte` after the values, so
  it is the same item on home, hot water and steam and the line's x does not move. It is shown
  from the first frame in which water moves (`Shot.startedAt`) until the shot ends; while the
  machine heats before it nothing is printed (the strip's 'heating' is not kept). A frame number
  beyond the profile's steps, like one without a name, says 'Step n' (n is the frame number plus
  one). A name too long for the header's width is cut with an ellipsis. A recalled history entry
  keeps its caption 'last shot with …' and its 'dismiss' over the graph (acceptance 67): that row
  is drawn only while an entry is recalled, so with no entry the graph starts right under the
  header. The time label 'time, finished' is shown for every finished shot home keeps, also the
  newest shot record read from Decaid.

**One size per kind of text (item 5; Z5).** The founder: 'font size should be aligned again, for
example the profile and bean names on the home page' (the profile is set larger and in bold, the
bean in the body size and weight). The skin has six size tokens in `src/app.css` (`--text-label`
0.85 rem, `--text-body` 1.1, `--text-value` 1.3, `--text-title` 1.6, `--text-large` 2.2,
`--text-big` 3.6), and the `.svelte` files hold **about 150 more size declarations**, 83 of them as
literals in 28 different values (0.5 to 2.4 rem: 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25,
1.3, 1.35, 1.4 ... the 'a little different' that the founder sees). Default: **roles, and a
test that holds them**.

| Role | Token | Used for |
|---|---|---|
| caption | `--text-label` | the small words over a value, hints, units, table heads, the graph's legend |
| name | `--text-body`, weight 600 | the **names of things in a list or on a button**: a profile, a bean, a grinder, a step, a plugin, a setting's name; the **profile and the bean on home are the same size and weight**; the state word and the page header (3.17, Z23) |
| text | `--text-body` | running text, list details, button words |
| value | `--text-value` | a number the user reads or sets (a chip's value, the state line's numbers, the right column's pressure, flow and temperature) |
| title | `--text-title` | a dialog's or picker's title (the state word and the page header moved to name in 3.17, Z23) |
| large, big | `--text-large`, `--text-big` | the timer, the shot's time and weight |

The change is to **replace each literal by the role's token** (the nearest one: 0.9 and 0.95
become 0.85 or 1.1 by what the text is, 1.15 and 1.2 become 1.1 or 1.3, and so on), starting with
home's right column, the picker, the list rows and the buttons, and then the rest; sizes inside
the graph's SVG (ticks, units, the legend) and the ring's figures stay as they are
and are named in the file. The plan's first step is a **script that lists every size per screen**
(`getComputedStyle` of every text node on the mock gateway, grouped by role) so the drift can be
seen and the result checked; the roles are the founder's to adjust once in this table, not per
screen. A Playwright check holds the one rule that matters: **the profile button's and the bean
button's names have the same computed size and weight**, and the same holds for the rows of
the beans, grinders and profile lists. Z5 comes after Z3 and Z4 so that the sizes are set on the
final layout.

*Built (Z5):* `npm run type-sizes [file] [--shots folder]` (scripts/type-sizes.mjs,
e2e/type-sizes.sizes.ts) lists every visible text's computed size and weight on 22 screens of the
mock gateway (home, its menu, the history, the bean pick, steam, hot water, the picker, the A-Flow
and the step editor, beans, a bean, grinders, every settings category), grouped by the role whose
token gives that size. Before: 916 texts outside the graphs' SVG in 20 sizes, 377 of them off the
scale in 14 sizes (1rem alone 148 times: text no rule sized). After: 6 sizes, none off the scale.
Every literal is a token now; `npm run lint` runs scripts/font-sizes.mjs, which refuses any size
that is not `var(--text-…)` or `inherit`, except rules named there and in their files: the SVG
text of `ShotGraph.svelte`, `editor/Graph.svelte` and `GraphGrid.svelte`, the ring's figures in
`Water.svelte` (the tokens, shrunk in a small frame), and the root size in `app.css`. Text no rule
sizes is `--text-body` (the body's size). Choices where the table leaves room: a page's title
('Settings', 'Beans and grinders') and a dialog's question are title; the state word is title (its
values stay value); a unit beside a big number is title, beside a large one text, beside a value
or a title caption; a setting's, plugin's, step's and history entry's name is name; the selected
profile's detail values are value; compact chips (a step card's, the A-Flow chips' compact form)
keep their value at the text size; digits of the number pad and the − and + of a chip are title;
the editor's '+ infuse' lane chip and the step list's table are caption. e2e/type-roles.spec.ts
holds the names: home's profile and bean, the picker's rows (selected or not), the bean pick's
bean and grinder rows and the beans and grinders lists all have the text size at weight 600.

**The graph's unit line (item 6; Z6).** The line over the graph's axis reads 'bar ml/s · g/s': a
dot sits before 'g/s' only (`ShotGraph.svelte` writes the dot with the weight flow), so 'bar' and
'ml/s' touch (the screenshots of home and of the steam page). The **dot goes between every two
labels that are shown**, in the same dim colour and spacing: 'bar · ml/s' on the steam page,
'bar · ml/s · g/s' on a shot with a scale; with one label no dot; the temperature's own '°C' is
at the other side of the graph and has none. Built as one list of the units that are on, joined
by the dot, in `ShotGraph.svelte`; the step editor's preview and the history's graph use the same
component and take it.

*Built (Z6, 2026-10-24):* `graphUnits` in `src/graph/axis.ts` lists the units of the curves that are
drawn (bar, ml/s, then g/s while there is a weight flow), `unitLine` joins them with ' · ';
`ShotGraph.svelte` draws the list, each unit in its colour, the dot in the unit line's own colour
with the old 0.3 rem on both sides. The bare picker preview still has no unit line.

**The tank in ml (item 7; Z7).** The state line shows the tank as '39 mm' (`stateLine` in
`src/shell/machine.ts`, `currentLevel.toFixed(0)` of `/ws/v1/machine/waterLevels`). **How
Streamline calculates it** (its `waterTank.js`, read in Decaid's source): the DE1's sensor gives
the **water's height in mm**, which is all Decaid passes on (`currentLevel`, `refillLevel`), and
Streamline turns it into millilitres with a **lookup table, `MM_TO_ML`, one entry per millimetre
from 0 to 69**, 'ported from the TCL skin so volumes match across apps'; a level over the table
is the tank's maximum, 2058 ml; the level is **floored** to a whole millimetre first. The table is
**not linear**: about 27 ml per mm up to 30 mm, 28 to 35 mm above (the tank widens upward), for
example 20 mm is 537 ml, 40 mm 1104 ml, 60 mm 1808 ml, 69 mm 2058 ml. Streamline offers both units
(local setting `waterTankUnit`, default mm); the founder wants ml. Default: `src/shell/tank.ts`
holds the same 70 values and `tankMl(mm)`, which **interpolates linearly between two entries**
for a level between millimetres (a smoother figure than Streamline's floor, and the machine
does send fractions), rounded to **10 ml** (the sensor is not better than a millimetre, about 30 ml),
and the state line says **'1.1 l' from 1000 ml up and '540 ml' under it**? No: one unit, so it does
not jump in kind: **'1130 ml'** always. The warning colour still compares the millimetres with
the refill level, as now. A skin setting **'Tank unit' (ml, mm)** in Skin > Display like
Streamline's, default **ml**, so the founder's mm is one tap away; the settings page's 'water
alert' field (5 mm steps) shows the equivalent next to it ('15 mm, about 400 ml'). The table is a
measure of the DE1's tank taken from the TCL skin through Streamline: `NOTICE` names it (P1).
*Built (Z7, 2026-10-24):* the details the paragraph leaves open: Streamline's table (0.2.17 in
its repository, 0.2.18 on the rig, both the same) has **68 entries, 0 to 67 mm**, not 70; the
entry for 67 mm is already the full tank, 2058 ml, so 68 and 69 mm are the maximum too and every point the
paragraph names holds. `tankMl` (`src/shell/tank.ts`) is the exact interpolation, nothing under
0 mm; `shownTankMl` rounds it to 10 ml for every figure the skin shows (the state line, 'about …
ml' on the water alert), so a full tank shows '2060 ml'. 41.8 mm is 1138 + 0.8 × 34 = 1165 ml,
shown '1170 ml'; the paragraph's '1130 ml' is 40.8 mm. The setting is `tankUnit` in the settings
object ('ml' or 'mm'; anything else reads as ml), a row of two chips under 'chart line width';
mm shows the level as before ('38 mm'). The water alert's button reads '15mm, about 400 ml' (the unit set close to the number, as on every field of the page).
The clean's 'Water tank: … ml' (3.8, `water-tank.ts`) keeps its whole-mm figure from the same
table, now imported from `tank.ts`.

**The finished shot keeps its weight (item 9; Z9).** The cause is in `settleWeight`
(`src/shell/shot.ts`), which `home-shot.ts` shows as the finished shot's weight
(`shot.finalWeight`): it follows Streamline in letting a finished shot **take the highest weight
the scale reads after the shot** (the last drops falling into the cup), with **no end**: as long
as the shot is the kept one, every higher reading, a cup put on the scale, a hand, the water of a
hot water run poured into the cup on the scale, raises the figure on home. Default: the weight
**settles for a short time only and is then fixed**. `Shot` gets `endedAt` (the clock of the frame
that ended it) and `settleWeight` takes the highest reading only up to **15 s after it**
(the drips after a stop are over by then; the number is checked on the rig and the tablet);
after that `finalWeight` is never changed by the scale again. The weight is also fixed at once
when **hot water, flush or steam starts** (the machine leaves idle for something that is not
espresso), since from then the scale is measuring something else. The right column's weight, the
graph's weight curve and the history record of the shot keep that value. It changes again only
when **a new shot starts** (a new `Shot`) or **a history entry is recalled** (`recalled` in
`homeShot`, its own weight, as now). While the figure is fixed the scale's live weight stays in
the state line, which is the scale's.
Built in Z9 (2026-10-24), the details the paragraph leaves open: the 15 s (`SETTLE_S` in
`shot.ts`) are counted from the ending frame's timestamp to the scale frame's own timestamp, both
Decaid's clock; a machine frame more than 15 s after the end also fixes the weight, so a scale
frame without a time cannot keep it open (`Shot.weightFixed`). The states that fix it at once
are `hotWater`, `flush`, `steam` and `steamRinse` (steam's purge); sleep and idle do not. A weight
fixed before any reading after the end is the series' last weight. On the rig (Decaid 0.8.8) the
mock scale holds its weight after a simulated shot, so the 15 s show only in the unit test; the
rig checks hot water: Decaid tares the mock scale and it weighs about 57 g of water while home
keeps the shot's 16 g (`e2e-rig/fixed-weight.spec.ts`). The tablet shows whether 15 s fits the drips.

**The ring's frame (item 8; Z8).** The screenshot shows the flush ring (small, 3.4 rem, with
'Flush' under it) at the bottom left of the steam page, half over the edge of the left column and
cut off. 'The flush ring is shown in the wrong frame. It should be like on the home page.' Then,
the founder, 2026-10-23: 'there is no graph's frame on the hot water page; it should be in the
main frame (the biggest one)', and: **'drop the small ring, it should be the same ring on other
pages too. It covers the current main frame.'** The rule, final: **one ring, the large one of
home** (`Water.svelte`: the ring around the stop button with the kind, the time and the values,
spec 3.6), on **every screen**: while hot water or flush runs it **covers the screen's biggest
frame**, the content area that is its main one: home's and the steam page's graph frame, the
hot water page's main panel, the editor's step list and preview, the settings page's category
panel, the beans screen's list and form, the picker's dialog body, the history's list. The
frame's own content is under it and returns when the run ends; the screen's other controls
(the right column, the header, the dots) stay where they are, and the stop button in the ring
stops what runs, as `Skin.stop` does today. `SmallRing.svelte`, `smallRingRun` in `water.ts`
and the left-column ring of W2 are **removed**, with their tests and the acceptance items
that name them (49, W2's). One covering rule serves all screens: a screen marks its main frame
(`data-main-frame`, a wrapper component or a prop) and `App.svelte` draws `Water` over it, so no
screen has its own ring code; where a screen has no clear main frame (a full-screen dialog)
the ring covers the whole screen under the header.
Built in Z8 (2026-10-25): the marked frames are `data-main-frame` on home's and the steam
page's graph (`.plot`), the hot water page's rows, the A-Flow editor's graph and its step list,
the step editor's preview and cards (`StepPreview`'s `mainFrame`), the settings page's category
panel, the beans screen's list and form, the picker's list and preview, and the history's list;
several marks on one screen are covered as one box. The step editor's script and settings tabs
have no mark and are covered under the editor's header. `App.svelte` measures the box of the page
at rest (or of the open history) by layout offsets (`coverOf` in `src/shell/cover.ts`), again
when the layout or the marks change, and draws `Water` there, sliding with the page; it lies
under the page's menu and dialogs and over the history. The ring is sized by the frame's shorter
side (85 %), and its text shrinks with a smaller ring. The ring's stop is `water-stop`; home's
column keeps its own `stop`, and the hot water page's `hot-water-stop` hides while hot water or
flush runs. A swipe never starts on the ring (`data-no-swipe`), so a finger on it neither leaves
the screen nor stops the run; the history's handle and the dots stay over it
(ring-frame-home.png (screenshot in the team repository),
ring-frame-steam.png (screenshot in the team repository),
ring-frame-editor.png (screenshot in the team repository),
ring-frame-beans.png (screenshot in the team repository),
hot-water-pouring.png (screenshot in the team repository)).

**The turn-on chip of a collapsed step (item 10; Z10).** In the A-Flow editor a step dragged to
0 s collapses (the phase is off, `curve.off`, and has no width), and a dashed '+ name' chip
turns it on again with 5 s (`GraphChips.svelte`). The screenshot (founder, 2026-10-23): with
pressurize collapsed, its '+ pressurize' chip sits at the border where infuse ends, exactly where
infuse's 'move on by weight' chip (infuse to) is drawn, and the two overlap. Both are placed at
the border's x and at `box.gapMiddle`. Default: the turn-on chips get a **lane of their own**, so
they never share a place with a weight chip: the **phase-name row under the graph's axis**,
where the names ('fill', 'infuse') are printed. A collapsed step has no name there (it has no
width), so its dashed '+ name' chip takes the place at the border's x, pinned inside the plot's
width; two steps collapsed at one place sit side by side as now, and a chip that would run over a
neighbour's name moves to the next free spot along the row. The 'infuse to' and 'stop at' chips
stay in the gap between the bands; the collapse itself, the 0 s rule and the 5 s turn-on are
unchanged. The check is geometric: no two chips on the editor's graph overlap for any
combination of collapsed steps, at the tablet's width and at 600 px.

*Built (Z10, 2026-10-24):* `laneLefts` in `src/editor/plot.ts` places the turn-on chips;
`GraphChips.svelte` measures each group of chips and puts it with its top 0.2 rem under the axis,
so it covers the name and the duration rows. A neighbour's name is the wider of its name and its
duration, by an estimate of 0.6 em a character (the texts are SVG, drawn by `GraphGrid.svelte`).
The next free spot is the nearest one either way, 0.5 rem clear of names and of the chips placed
before; with no spot clear of the names the chip keeps clear of the other chips at least. Only
infuse and pressurize can collapse (3.1), so acceptance 101's 'with fill' is read as 'with
infuse'; the e2e (`e2e/turn-on-chip.spec.ts`) also runs the three with the 2nd fill on.

**The menu without descriptions (item 11; Z11).** 'Remove the descriptions in the menu, except
for steam on/off' (founder, 2026-10-23, from the screenshot of the home menu). The second lines
of 'Beans and grinders' ('add, edit and archive them; the pick for the next shot is on home') and
'Clean' ('the cleaning cycle of the settings page') go: `detail` is removed from those two
entries in `Home.svelte`. The steam entry keeps its line ('steam heater is off', red while off,
'steam heater: not known'), since it is the only place that shows the heater's state. Tests and
the e2e that read `open-beans-detail` or `open-clean-detail` are changed.

**The date picker scrolls through the months (item 12; Z12).** 'In the date picker I want to
scroll with my finger through the months, up and down. That's faster than the buttons, but keep
them for now.' (screenshot: a vertical stroke over the day grid). Default: a vertical drag on the
day grid of `DatePicker.svelte` moves the shown month, **dragging up shows the later month**
(the grid follows the finger, as a list does) and dragging down the earlier one; the grid
slides by whole months and settles on one (snap), a quick flick may pass several, and the title
('October 2026') follows. The previous and next buttons, the month and year taps and today,
clear and cancel stay as they are ('keep them for now'). A tap on a day still picks it (a drag of
more than a few pixels is not a tap), the mouse wheel does the same on a desktop, and the
dialog's own gestures (horizontal swipes, 3.14 item 2) are not started by a vertical drag.
A decision for the test on the tablet: whether the buttons go later.
*Built (Z12, 2026-10-24):* the grid always has room for six weeks, so the dialog keeps its
height; the months before and after sit above and below it and come into view as it is dragged;
the title moves once more than half of the next month is in view; on lifting, the finger's speed
over its last 0.1 s carries on for 0.3 s and the grid settles on the nearest whole month, at most
12 months away; a move of more than 6 px is a drag; one mouse wheel notch is one month, a
touchpad's small turns make one month per 100 px (rules in `calendar.ts`).

**The founder's four bag photos and a turned bag (item 1; Z1, Z2).** The founder took four photos
(2026-10-23) with the tablet's camera, kept in `docs/product/bags/`: a maldaner can
(`maldaner-elisabeth.jpg`: roaster 'maldaner', under it the descriptor 'KAFFEEHAUS ESPRESSO',
name 'ELISABETH' in large gold capitals on blue, 'Brasilien' and a tasting line in small type), a
second maldaner can (`maldaner-abdul.jpg`: 'maldaner', 'OMNI ROAST', 'ABDUL' in white on orange
and red, 'Indonesien'), an aniko bag (`aniko-feel-the-sun.jpg`: the name 'FEEL THE SUN' large
and top right, 'natural & fully washed', the tasting line, the logo 'aniko' with 'COFFEE ROASTERS'
under it small at the bottom left, on a picture of triangles) and an aniko bag **turned by 90
degrees** (`aniko-honey-dream-rotated.jpg`: 'aniko' and 'COFFEE ROASTERS' and 'Honey Dream' run
up the label, the tasting lines too). The founder: 'on one the bag is rotated by 90 degrees;
sometimes it's easier to hold it like that, so it would be good if that works too.' The expected
reading, which the fixtures pin: **maldaner / Elisabeth, maldaner / Abdul, aniko / Feel The Sun,
aniko / Honey Dream**. They are the probe's first input (Z1: they replace the 'the founder gives
the photo' step, and the aniko 'Tropic Candy' bag of the first review stays a fifth case when its
photo is given), and they add three rules to Z1 and Z2:

- **A small line directly under the roaster is its descriptor too** (Z1): 'KAFFEEHAUS ESPRESSO'
  and 'OMNI ROAST' sit right under 'maldaner' and are read as a line of the can, not a name; the
  name is the tallest line that is not the roaster and not directly under it in a smaller size
  (its height under 0.6 of the roaster's), which is 'ELISABETH' and 'ABDUL'. The words of the
  detail test grow by the German ones the cans show (Haselnuss, Kakao, Brasilien, Indonesien are
  not names: lines under a size limit and the country names of the catalogue are skipped), and
  a line in the tasting-line style, words joined by full stops or dots ('Haselnuss. Kakao.
  Nougat.', 'chocolate . vanilla . blueberry'), is dropped.
- **A turned bag is read too** (Z2): the photo is read **upright first and, when that gives no
  roaster from the catalogue and no name, turned by 90 and by 270 degrees** (the canvas that
  prepares the photo does the turning, no new dependency); the pass with the most word-like text
  at 60 percent confidence or more is kept, and the progress line says 'Turning the photo'. An
  upside-down bag (180) is not tried: nobody holds it so. Tesseract's own orientation detection
  is not used (it is not in the bundled data and costs a second download).
- **The chips are for what is left** (Z2): the six chips show the lines read, so a field the rules
  got wrong costs one tap.

*Built (Z1, 2026-10-24):* `scripts/ocr-probe.mjs` (a dev script, not in the ZIP) reads a photo with
the skin's worker and options in Node and prints its lines (text, height, confidence, box);
`--rotate`, `--scale`, `--prepare` (grey, contrast stretched between the 1st and 99th percentile)
and `--invert` do on a canvas of Playwright's Chromium what Z2 is to do, in the probe only, and
`--json` writes an entry of `src/beans/ocr-bags.json`, the fixture `ocr.test.ts` reads. Read as the
camera gave them, the photos give little ('maldaner' is missing on Elisabeth, 'ABDUL' is not read,
'FEEL THE SUN' is 'RRL SUN' at 30 %); the fixtures are therefore the probe's lines of the photos
scaled so that the main lines are 30 to 50 pixels high, which is Z2's preparation: Elisabeth and
Abdul at 0.6, prepared; Feel The Sun at 1.3, not prepared (the stretch loses the 'a' of 'aniko' on
the orange triangle). `bagText(lines, catalogue)` in `src/beans/ocr.ts` gives maldaner / Elisabeth,
maldaner / Abdul and aniko / Feel The Sun from them. The turned bag: read upright it gives no
roaster and no name; turned by 270 degrees clockwise (90 the other way), scaled 1.2 and prepared, it
gives aniko and 'Honey': 'Dream' is lost under the blue cloud of the print, so Honey Dream is left
to Z2. The details the spec left open: a line matches a known name as a whole or by as many words in
a row as the name has (`reads`), a name of under 5 letters only exactly; a descriptor may hold
'Coffee' or a misreading of it ('COFFeg ROASTERS'); a line counts as directly under the roaster when
it shares some of its width and starts within one roaster height under it; the size limit of a name
is 0.4 of the tallest line read; a tasting line has two or more full stops, commas or dots after its
words or spaced dashes between them; 'honey' is no longer a detail word, so that 'Honey Dream' can
be a name; a known bean of the roaster wins at the confidence of any kept line (50), a name read
otherwise needs 60; the beans screen passes the catalogue's beans to the form for the reading.

*Built (Z2, 2026-10-25):* the reading takes the **camera's picture** (at most 2800 px on its long
side), not the stored 1024-px photo: on the stored one the small 'aniko' logo of Feel The Sun is not
read at any scale. `src/beans/prepare.ts` draws it turned and scaled on a canvas and makes it grey
with the contrast stretched (1st to 99th percentile), inverted for the second pass. **The scale**: a
first read at 1200 px on the long side measures the median height of its sure lines (word-like,
confidence 60+); when that is 30 to 50 px the read is kept at that size, else the photo is read again
at the long side that makes them about 36 px, in steps of 200 px from 800 to 2800. Then the inverted
pass at that size; the pass with more letters in sure word-like lines is kept, the plain one on a
tie. **Turning**: when the upright reading gives no roaster of the catalogue and no name, the same is
done turned clockwise by 90 and by 270 degrees, and the turn that read more letters is kept, upright
when none did. The progress line says 'Reading the bag', 'Reading the bag inverted' and 'Turning the
photo'. **The chips**: the kept pass's lines that pass the noise test (confidence 50+, word-like, no
number of two digits), cleaned and in title case where printed in capitals, the six tallest of more,
in order from the top, under the photo; a tap puts one into the name or the roaster, whichever had
the focus last (the name before any), and the hint says which. No line and no guess: 'Nothing could
be read from this photo.'. `scripts/ocr-probe.mjs` now runs the skin's `readPasses` with the canvas
functions of `prepare.ts` in Chromium and `preparePixels` in Node, and records every pass in
`ocr-bags.json`; `ocr.test.ts` replays them through `readPasses`. The four photos give maldaner /
Elisabeth (1200 px), maldaner / Abdul (1200 px), aniko / Feel The Sun (2800 px) and, turned by 270
degrees clockwise (90 the other way) at 2400 px, aniko / **Honey**: 'Dream' is read at no size
(at most 'eam' or 'cam'), so the name is one chip tap and some typing short.

### 3.15 The cut, in steps, and a release script (2026-10-24)

The founder created the two GitHub repositories and named them: **`Jan3kJ/decaid-pureflow`**
(product) and **`Jan3kJ/pureflow-team`** (this one, renamed from `decaid-team`; the checkout is
`..\pureflow-team`). Both are **private** and stay so until P6. `decaid-pureflow` holds one
commit, 'init' with a README, which the cut replaces. Planned only; nothing is built ('do not
implement it now' stands). It sharpens 3.13 item 12 and adds the roadmap task P7.

**The cut (P2), step by step.** The cut changes no repository that exists: it is made in a fresh
clone, checked there, and only then offered to the founder to push.

1. **Freeze and tools.** Before the cut nothing is uncommitted here, H5 (0.6.0) is built, and
   from the cut on **the skin is changed only in the product repository**. `git-filter-repo` is
   installed (`pip install git-filter-repo`; free, no account; Python 3.13 is on the machine). The
   GitHub command line `gh` is not installed; P7 needs it, and `gh auth login` is the founder's.
2. **Try the tools across two checkouts first** (3.13): `stint.toml` with `repo_root =
   "../decaid-pureflow"`, the plan prompt, the roadmap check and the three prompts.
3. **A fresh clone:** `git clone --no-local ..\pureflow-team ..\pureflow-cut`; all of the
   below runs there. Today the history is 213 commits: 176 by the personal address and 37 by
   the noreply address.
4. **Which paths stay.** Product: `src/`, `e2e/`, `e2e-rig/`, `public/` (without `camera.html`),
   `scripts/` (without `rig-*-probe.mjs`, `rig-smoke.mjs` and `rig-installed.mjs`, which are the
   rig's and stay here), the configuration files (`package.json`, `package-lock.json`,
   `tsconfig*.json`, `vite.config.ts`, `svelte.config.js`, `eslint.config.js`,
   `playwright*.ts`, `index.html`, `.prettierrc`, `.prettierignore`, `.gitattributes`,
   `.gitignore`, `.git-blame-ignore-revs`), and `docs/spec.md`, `docs/research.md`,
   `docs/a-flow-3.0.md`. **Not `docs/product/` at all**: it holds the founder's tablet
   screenshots and the four bag photos (real roasters and beans), and P4 generates the pictures
   the public needs into `docs/user/img/`. The spec's links to `product/...` pictures become
   plain text ('screenshot in the team repository') in the scrub. `filter-repo --analyze` is read
   first, for files that were renamed in history and so match a path only in some commits.
5. **Authors:** `--mailmap` turns every author and committer into
   `Janek <52261469+Jan3kJ@users.noreply.github.com>`. The `Co-Authored-By: Claude` lines stay.
6. **Messages:** eight commit messages name a chat message, a token or a budget (found with
   `git log -i -E --grep`). `--replace-message` rewrites them; **the founder reads the list of
   the eight, old and new, before anything is pushed.**
7. **Content in every revision, not only in the tip:** `--replace-text` with a rules file
   removes, in each historical blob, local paths (a drive letter, the folder of the checkouts, a user profile),
   the personal address, and the messenger and message-number remarks of `spec.md` (6 places
   today). The scrub of the tip (3.13 item 3) is then only a check.
8. **`scripts/publish-check.mjs --history`** runs over `git rev-list --all` of the clone and
   must pass: no Windows path, no e-mail address but the noreply one, no MAC address but
   `AA:BB:CC:`, not the messenger's name, no token pattern, in any revision. The same script without the
   flag runs on the tip in CI (P3).
9. **Tags and the blame list.** `filter-repo` writes `.git/filter-repo/commit-map` (old hash,
   new hash). The cut uses it to rewrite `.git-blame-ignore-revs` and to put an annotated tag
   `v0.N.0` on the new commit of every hand-over (`0.1.0` to `0.6.0`: the commit that raised the
   version in `package.json`). **The last tag is the range start of P7's first run.**
10. **Proof in the clone:** `npm ci`; `check`, `lint`, `format:check`, `test`, `build`, the e2e
    on the mock gateway; and `npm run zip` gives a ZIP **whose files are the same, byte for byte,
    as the ZIP built here at the same commit**, minus `camera.html`.
11. **This repository becomes the team repository** by one commit that removes the product paths
    (`src/`, `e2e/`, `public/`, `package.json` and the other configuration files, the product
    scripts) and keeps `stint/`, `stint.toml`, `.claude/`, `docs/product/`, `docs/review-*`,
    `docs/answers-*`, `docs/acceptance.md`, `docs/install.md`, the Decaid export and the rig
    probes. **The spec is edited in the product repository** (it is the product's); the team
    repository reads it through `spec_path = "../decaid-pureflow/docs/spec.md"`, and edits its
    roadmap table's data, `roadmap.json`, here. The hashes in the day records stay true because
    the team history is not rewritten. The commit map is kept as `stint/cut-commit-map.txt`.
12. **Pushing is the founder's.** The product clone's history replaces the 'init' commit of
    `decaid-pureflow`: either the founder deletes and recreates that repository empty (no
    README), or force-pushes once (`git push --force origin main`, then `git push --tags`);
    nothing is lost, the repository is private and holds only 'init'. Then
    `..\decaid-pureflow` is cloned again from GitHub and `..\pureflow-cut` is deleted.
    `..\decaid-rig` stays where it is, outside both. **Making the product repository public
    is a separate step after P6's checks** (GitHub, Settings, Danger zone), and the founder's.

*Built (P2, 2026-10-25), stopped at step 10:* `scripts/publish-check.mjs` (`npm run
publish-check`, `--history` over every blob, message, author and tag of `git rev-list --all`;
binary files skipped; the allowed addresses are the noreply one and the `Co-Authored-By` line's
`noreply@anthropic.com`), with `src/publish-check.test.ts`. Steps 3 to 9 are one script,
`stint/cut/cut.sh`, with its inputs beside it (`paths.txt`, `mailmap.txt`, `messages.txt`,
`text.txt`). The paths add `README.md`, `LICENSE`, `NOTICE`, `docs/user/` and
`.release-notes.json` from the 3.13 table. The tags include `v0.1.1`. `--history` passes in
`..\pureflow-cut`. Step 10 fails on what the path list leaves out: README's links to
`docs/install.md` and `docs/acceptance.md` (the docs-check test), `camera.html` (the four tests
of `e2e/camera.spec.ts`), and a bag photo of `docs/product/bags/` (one test of
`e2e/bean-photo.spec.ts`). Steps 11 and 12 wait for the founder's choice, and
`docs/product/cut-request.md` holds the details.
*Built (P2, 2026-10-26):* the founder's answers: README is rewritten as the product's front page
and links only product files, the camera test page is dropped (3.13 item 5), so `public/` is
taken whole and the two ZIPs hold the same files, and the bag-photo test went with the reading
(Z19). `public/manifest.json` is checked out with LF everywhere (`.gitattributes`).

**A release script (P7).** The founder's request (2026-10-24): 'a script for releases: run all
checks, derive a change history from the completed tasks, build the package, increase the
version if needed, then publish a new release.' It is `scripts/release.mjs`, run with `npm run
release` **in the product repository**, and it is the only way a release is made, by the founder
or by Claude. In order:

1. **Before anything:** the working tree is clean, the branch is `main`, `git fetch` shows it is
   not behind `origin/main`, the last tag `vX.Y.Z` exists, and `gh auth status` is good. Any
   failure stops with the one line that fixes it. Nothing has been changed yet.
2. **The history, from the completed tasks.** Every task ends in one commit (the day records
   list it). From the cut on, a commit message ends with two trailers, written by the team's
   work prompt (`stint/prompts/plan.md` gets the lines in P7) and by anyone sending a pull
   request: `Task: Y10` (the roadmap ref; absent for a pull request) and `Changelog: added |
   changed | fixed | internal`. The subject line is then the entry's text, written for a user of
   the skin. The script reads `git log vLAST..HEAD`, **keeps the commits with a `Changelog:`
   trailer other than `internal`**, and groups them as Added, Changed, Fixed. **A commit with no
   `Changelog:` trailer stops the script** and is named with its hash; the fix is
   `.release-notes.json`, a file of `{ "<short hash>": "internal" | { "kind", "text" } }`,
   because a pushed commit's message is not rewritten. **A trailer `Breaking: yes`** means a
   major bump, which stops and asks (the standing rule: a major bump is asked first).
3. **The version, if needed.** No commit other than `internal` stops with 'nothing to release'.
   If `package.json` is **already ahead of the last tag** (a hand-over raised it, 3.14 H5: a
   minor bump), the script keeps it. Otherwise the bump is the largest of the commits: `Breaking`
   major (asked), `added` or `changed` minor, only `fixed` patch; `--bump major|minor|patch` or
   `--version X.Y.Z` override it. The script prints the version and the entries and **asks for a
   yes** before it writes a file.
4. **All checks**, in this order, stopping at the first failure with its output: `npm ci` (a
   clean install, not the founder's `node_modules`), then `npm run verify`, which is **one list
   that CI also runs** (P3): `check`, `lint`, `format:check`, `test`, `build`,
   `scripts/publish-check.mjs`, `scripts/docs-check.mjs` and `npm audit --audit-level=high`; then
   `npm run e2e`; then `npm run e2e:rig` in its three file groups when the rig answers (a Decaid
   on its port). **Without a rig the script stops**; `--no-rig` goes on and writes 'rig suite:
   not run' into the release notes, so a release never claims what was not run.
5. **The files.** The version in `package.json`, `package-lock.json` and `public/manifest.json`
   (the test that keeps them equal runs again), and a new section on top of `CHANGELOG.md`
   (`## 0.7.0 - 2026-11-12`, the grouped entries with their `Task` refs, the checks' result
   line). Then `npm run zip`, whose own checks of the ZIP run, and `release/SHA256SUMS.txt`
   with the ZIP's SHA-256.
6. **Local commit and tag:** one commit `Release 0.7.0` and an annotated tag `v0.7.0`. Up to here
   `git checkout -- . && git tag -d v0.7.0` undoes everything; the script prints that line if a
   later step fails.
7. **Publish, behind a second yes, which is the founder's** (constraints: every push to GitHub
   needs the founder's approval): `git push --atomic origin main v0.7.0`, then `gh release create
   v0.7.0 release/pureflow-0.7.0.zip release/SHA256SUMS.txt --notes-file` with the CHANGELOG
   section, as a **draft** the first time (`--publish` makes it public at once). Then it
   downloads the asset again, compares its SHA-256, and prints the asset's URL for Decaid's
   skin selector. **Claude never answers the second yes** and never passes `--yes`; a Claude
   session runs `--dry-run` or `--local` and hands over.
8. **Modes.** `--dry-run`: steps 1 to 4 and a print of 5; changes nothing. `--local`: steps 1 to
   6, no push, no GitHub; this is what a **hand-over** (the H tasks) uses, so a hand-over's ZIP,
   version, CHANGELOG entry and tag come from the same code as a release. `--resume` continues
   at step 7 when the tag exists and the push or the upload failed.
9. **Not in the script:** the Decaid install check by URL, the founder's cold read, the
   announcement, and making the repository public (P6); the script prints them as a list at the
   end. While the repository is private Decaid cannot fetch the ZIP's URL, so 0.7.0's URL
   install is checked after the repository is made public.

The pure parts (reading trailers, the bump, the changelog text, the version writes) are a module
with unit tests; the git and `gh` calls go through one small function that tests replace, and a
test runs the whole script with `--dry-run` and `--local` in a temporary repository. Spec 4 gets
the script's place in the layout when it is built.

*Built (P7, 2026-10-26):* `scripts/release.mjs` (`npm run release`) with its pure parts in
`scripts/release-lib.mjs` and the tests in `src/release.test.ts`. The trailers are read from the
message's last two paragraphs (not with `git interpret-trailers`); merge commits are skipped; a
subject's leading task id is dropped from its entry. A `.release-notes.json` entry also overrides
a wrong trailer. The release commit carries `Changelog: internal`, so the next release reads it.
`--local` makes no fetch and calls no `gh`, and compares with the `origin/main` it already has;
`--dry-run --local` is a dry run without GitHub. The rig is looked for before the checks
(`GET /api/v1/machine/state` on port 8080), so a missing rig stops before the 11 minutes of e2e,
and runs in four file groups (a spec the first three do not name goes into the fourth).
`--resume` uploads with `--clobber` when the release exists. `--publish` makes the release
public at once; there is no `--yes`.

### 3.16 Founder's review of 2026-10-24: the profile picker (planned, not built)

The founder, with a screenshot of the picker (80's Espresso selected, its long description
under the graph): 'in the profile picker the shot graph should have a fixed size of a similar
ratio as in the screenshot, the buffer is the text field below. this feels better when scrolling
through the profiles. In addition the graph should be improved: can we interpolate the flow,
pressure and temp curve based on profile values. it is only an approximation, but the goal is
to give the user an idea how the shot will look like. you can use the shots from the export to
create a model for that. Another idea: can we generate a brief description for A-Flow 3.0
profiles based on profile values? It would be better than the default sentence from my old
plugin.' Roadmap Z13-Z16, in the hand-over H5 (0.6.0). Nothing of it is built.

**The graph keeps its size (item 1; Z13).** Today the panel is a column: the graph takes what
the description leaves (`.preview` is `flex: 1 1 0`), so a long description shrinks it and a
profile without one lets it grow, and the graph jumps while the founder pages through the list.
New: the graph has **one size for every profile**, a box with the aspect ratio of the
screenshot (about 1:1, `aspect-ratio: 1 / 1`, the width of the panel's content, 24 rem less its
padding), and **the description is the buffer**: it takes the height that is left under the
graph and the caption, `min-height: 0`, `overflow-y: auto`, so a long text scrolls inside its own
field and a short one leaves empty space. Title, author, the three values, the graph, the
caption line and **load** stay where they are for every profile. On a display too low for the
box (the panel's height less the fixed parts under 6 rem) the graph's height gives way before the
text's, down to the existing 6 rem minimum, and still the same for every profile on that
display. The 1280 x 800 CSS pixel tablet is the check.

*Built (Z13), where the item left it open:* the title is one line, cut with an ellipsis (the
list shows the name too); the author's line and the line 'A-Flow 3.0: once it is loaded, the
editor opens on it' keep their place when empty, the latter between the description and
**load**; the caption line under the graph is there and empty until Z15 fills it. The
description keeps three lines while the graph gives way (its shrink is a thousandth of the
graph's), and only below the graph's 6 rem does it give way itself. Every size is in rem, which
follows the viewport, so a lower tablet alone keeps the square: the panel is too low for it
with a larger display size of Skin > Display (Extra Large at 1280 x 560 is the test's case).

**A modelled shot in the graph (item 2; Z14, Z15).** The preview draws the profile's targets
(`src/steps/curve.ts`, a schematic: 'not a simulation of a shot'). The founder wants **the
curves a shot would show**: flow, pressure and temperature, as an approximation, to give an
idea of the shot. What the targets leave out, and what the export shows (2,174 shots, 1,528 of
them A-Flow with a Flow Extraction step, about 160 samples each; first look at the targets as
the curves, 2026-10-24):

- the machine controls one quantity per step and the coffee decides the other: in a Fill step
  (flow target 8 ml/s) the flow is on average 5 ml/s from the target and the pressure sits
  around 2.4 bar; in Infuse (pressure target) the pressure is on average 2 bar from the target
  and the flow around 1.6 ml/s; Pressure Up's flow is around 1.8 ml/s. Taking the target as the
  curve is therefore wrong most of the time for the quantity the step does not control;
- a step that has an exit (Fill 'pressure over', Pressure Up 'flow over', Pause 'flow under') or
  an infuse weight ends when the coffee says so, so the moments of the steps move;
- the temperature does not jump to the step's target: the group sensor starts near the target
  and follows the next step's target with a lag (in the first eight seconds the median is within
  2.3 degrees of the target, below it around the second 2);
- the shot ends at the stop weight, not at the end of the last step; the median shot in the
  export is 38 s.

*The model* (`src/steps/predict.ts`, pure, no DOM; `predictShot(profile, puck?)` returns
`t`, `flow`, `pressure`, `temperature` and the moments the steps start):

1. **The controlled quantity follows its target through the machine's response**, a first-order
   lag with one time constant for flow and one for pressure, a fast transition with a short one,
   a smooth transition ramping as `stepCurve` does. A step's limiter (`limiter`) caps the other
   quantity: a flow step cannot exceed its pressure limit, a pressure step its flow limit.
2. **The coffee is a resistance** that the controlled quantity meets: pressure = R x flow for a
   flow step, flow = pressure / R for a pressure step. R is small while the puck is dry and
   rises towards a wet value as water has gone through (R = R1 + (R0 - R1) x e^(-V / V0), V the
   water pushed so far). R0, R1, V0 and the two time constants are **fitted to the export**; they
   are constants of one typical puck, and the picture says so (item 3 below).
3. **A step ends when its exit holds in the model** (pressure over, flow over or under, the
   infuse weight, taken as the water pushed minus what the puck keeps), or at its `seconds`,
   whichever comes first; the weight of the model ends the shot at the stop weight when the last
   step is not over yet. Without a stop weight it ends with its last step.
4. **The temperature** follows the targets of the steps with one lag and the starting offset the
   export shows (the group sensor at the start of a shot), both fitted.
5. It works for every profile that has steps, A-Flow or not; D-Flow, Adaptive and the user's
   own are in the export too (D-Flow / dantes inferno, 61 shots, My Profile / flat temperature,
   59) and are part of the check.

*The fit and the check* (Z14): a script, `scripts/shot-model-fit.mjs`, reads a Decaid export
(its path is an argument; the export holds the founder's shots and stays out of the repository,
as the 2026-10-21 one does), aligns each shot's samples to the machine's frame changes, fits the
constants by least squares on the flow, pressure and temperature of the shots, and writes
`src/steps/puck.ts` (the few constants) and `src/steps/fixtures/shots-model.json` (about ten
shots, thinned to one sample per 0.5 s, only the measurements and the profile: no beans, no
notes). The fit uses **the profiles apart from a held-out third**, chosen by the profile (so the
check is on profiles the fit did not see, as the picker meets them). The model is accepted
when, on the held-out shots: the mean absolute error of the flow and of the pressure is at least
**40 percent below that of the targets drawn as they are** (the first look: 1.4 to 6.3 ml/s
or bar per step), the temperature's error is no higher than the targets', and the length of
the shot is within 20 percent of the real one for four shots in five. The result, the numbers
and the plots of three shots go into `docs/research.md` ('the shot model'); where the model
fails the numbers say so and the picture says 'approximation' all the same. Fitting is offline;
the app only runs `predictShot`, once for the selected profile (milliseconds), never for the
whole list.

*Built (Z14), where the item left it open (research.md 34):* the check does not pass in full.
On 242 shots of 50 held-out profiles the flow is 85.7 percent below the targets' error and the
temperature 14.4 percent below; the pressure is 39.7 percent below (40 asked) and 59 percent of
the lengths are within 20 percent (80 asked). The real shots of one profile lie only 79 percent
within 20 percent of their own median length, so one puck's model cannot reach four in five.
Added to the model: R counts V once a fitted **headspace** (29 ml) is full, as the fills in the
export run at the dry R until then; the limiter caps the other quantity outright; the pump gives
8 ml/s at most; a step also ends at its volume; a shot is modelled for 180 s at most, in steps
of 0.1 s. `predictShot` also returns the model's weight (for the exits, not drawn). The
imported shots' `profileFrame` follows only the steps' seconds, so the fit aligns the samples
by the machine's targets (`targetFlow`, `targetPressure`). The errors are taken where the
targets, as `stepCurve` draws them, have a value for the quantity, the same samples for the
model and for the targets. The check is `src/steps/shot-check.ts`, shared by the fit script
and the tests.

*The picture* (Z15): in the picker's graph the model's curves are the lines, in the shot graph's
colours (flow blue, pressure green, temperature red, as on home), and the profile's targets
stay as thin dotted lines under them, so the founder sees what the profile asks for and what a
shot would do. The step borders stay dashed. Under the graph a **caption line** says 'estimate
from the steps, a real shot differs with the coffee' (small, `--dim`, one line; it is part of
the fixed area of item 1). The editor's own curve keeps the targets: this item is the picker's.
A later step may take the puck's R from the last shot of the profile in the history, so the
estimate fits the founder's coffee; that is not planned here.

*Built (Z15), where the item left it open:* `shotEstimate` in `src/steps/estimate.ts` turns
`predictShot` into the graph's series; `StepPreview` draws it with `estimate` (the picker only),
`stepCurve` as before without it. Each step's targets and limits, as `stepCurve` draws them (an
A-Flow pour's to its 30 s), are laid across the span the model gave that step, so a ramp runs
from its start to its end value within the model's step and default-dark's pour still ends at
1 ml/s; a step the model does not reach draws no target. The limits stay drawn as in 3.10 (muted
dots), the targets are thin, denser dots. The model's flow and pressure are drawn through a
median of three samples, which takes out its one-sample jump where a step ends on its exit. The
scale of flow and pressure takes the model's values too (12 at least, as before).

**A generated description for A-Flow 3.0 (item 3; Z16).** The picker shows the profile's
`notes`; an A-Flow profile of the old plugin carries one stock sentence ('A-Flow: an
alternative profile for D-Flow', see the screenshot of 2026-10-24 on the converted profiles).
New: for a profile whose A-Flow values are known (stored 3.0 by its metadata or notes, or an
old A-Flow profile that `readSteps` reads) the picker shows **a short text made from the
values**, `describeAFlow(params)` in `src/aflow/describe.ts`, pure and English, three to five
short sentences, only facts, in this order, a phase that is off left out:

1. dose and yield: '16 g in, 42 g out, a ratio of 1:2.6.' (no stop weight: 'No stop weight.');
2. the fill: 'Fills at 8 ml/s until 3 bar or 15 s, at 95 °C.';
3. the infuse, when it lasts: 'Infuses at 0 bar, 1 ml/s at most, for 15 s or until 3 g.';
4. the 2nd fill and its pause, when on: 'A second fill at 8 ml/s, then a pause of up to 15 s.';
5. the pour: 'Ramps to 11 bar in 10 s, then pours at 3 ml/s, rising to 6 ml/s over 60 s.' ('falling
   to 0' for flow down; 'at most 11 bar' for the pressure limit; the temperature only where it
   differs from the fill's: 'at 88 °C').

Numbers use the skin's formatters (whole numbers without a decimal point, one decimal otherwise,
a space before the unit). The text is **computed when the picker shows it, never written to the
profile's notes**, so a change to the wording changes every profile and nothing in Decaid.
What the user wrote in the notes comes first and stays: the plugin's stock sentence (and the
A-Flow line the skin writes, which `notesText` already strips) counts as nothing written; the
generated text follows the user's own notes after a blank line. A profile that is not A-Flow
keeps its notes alone, as before. The wording is checked by the founder on the tablet; the
sentences above are the plan, not the final text.

*Built (Z16), where the item left it open:* the numbers go through the editor's `formatValue`
at one decimal at most. A temperature is named with the first phase that lasts and again
wherever a later one differs from the one named last (the ramp's own temperature after
'Ramps to … in … s', the pour's at the end), not only against the fill's. The pressure limit
is named only when it is a value of its own: one that follows the pour pressure or is off (0)
says nothing. Without a ramp (0 s) the pour reads 'Pours at once at …'; an end flow equal to
the start reads 'pours at … for … s'. An old A-Flow profile read from its steps has no dose of
its own (the picker shows '–' for it), so its first sentence is the yield alone: '36 g out.'.
The stock sentence counts as nothing written whatever its spaces, case or final full stop; of
a profile that is not A-Flow it still shows. `describeAFlow` is in `src/aflow/describe.ts`,
the picker's text in `profileDescription` (`src/shell/profiles.ts`).

Not part of this review: a modelled weight curve, the model in the step editor, a description
for profiles that are not A-Flow, another language.

### 3.17 Founder's review of 2026-10-25 (planned for after the cut, not built)

The founder, from a spoken review of the 0.6.1 build, in order: 'On the settings page the swipe
to get back to home does not work on the left column, does it only work in the main frame? In
the profile picker the swipes are only working in the right column. On the beans and grinders
page it is only working in the left column. In the A-Flow editor it is only working above or
below the graph. Next topic: move the tank water unit to the Quick Adjustments, mini water tank.
Next topic: the OCR feature does not really work, drop this feature for now, just keep the
possibility to take a photo. Next topic: for the hot water ring, so the target weight or
volume' (the transcript ends there). In addition, in writing: 'add a rename feature to the
profile picker: moving a profile to the right shows a rename button similar to the delete
button; and add an edit button which opens the editor for the selected profile next to the load
button; use the space of the current load button for both.' **Planned for after the cut (P2):**
the work happens in the product repository, roadmap Z17-Z21 and the local release H6, before the
public release P6. Nothing is built. **The founder's answers of the same day:** the editor's
graph passes the swipe wherever it drags nothing (item 1); 'yes, show the target weight/volume in
the ring during hot water pouring' (item 4, Z22); 'edit button loads too, that's okay' (item 6);
and from his check of the Z5 line in install.md: the larger state word does not look right, it
should have the size of the profile and the bean, or of the page's title 'Steam' (item 7, Z23). **Three more topics of the same day** (items 8 to 10, Z24, Z25): the adjust
buttons change the running steam timer, the state word says 'Pouring' instead of 'Espresso', and
home keeps the profile and bean buttons while a shot runs.

**1. The swipe back works on the whole screen (Z17).** The skin's rule (3.14, `onControl` in
`src/shell/swipe.ts`) lets a drag that starts on a control or on something that scrolls
sideways be the control's. The likely cause of all four reports is one line: `onControl`
reads the computed `overflow-x` of every ancestor up to the page, and **a box that scrolls
only down (`overflow-y: auto`) computes `overflow-x: auto` too** (CSS makes the other axis
`auto` when one is not `visible`), so every list and column that scrolls down counts as 'scrolls
sideways' and takes the drag: the settings' category column, the picker's list, the beans
page's list, the editor's step cards. The page itself the swipe still reaches (the main frame,
the picker's right column, above and below the graph), which is exactly what the founder
reports. Plan:

- **Find it first** (a failing test before the fix): `e2e/swipe-back.spec.ts` swipes from the
  points the founder named, on the settings page (category column and content), the picker (list
  and detail), the beans page (list and form) and the A-Flow editor (cards, graph, header), and
  the unit test of `onControl` gets a case for a box with `overflow-y: auto` and a `scrollWidth`
  equal to its `clientWidth`.
- **The rule becomes what it says:** a node takes the drag only when it really scrolls sideways,
  `overflow-x` is `auto` or `scroll` **and its `scrollWidth` is greater than its `clientWidth`**.
  The editor's start row and step cards, which do scroll sideways when they overflow, stay the
  control's while they overflow; a row that fits lets the swipe through.
- **The edge always goes back.** A swipe to the right that **starts in the left 24 CSS pixels**
  of the screen goes back on every screen but home, whatever is under the finger: over the
  editor's graph (whose drags are its own, `touch-action: none`), over the picker's rows (which
  have swipes of their own, item 5), over a scrolling row of buttons. Home keeps its history
  swipe (the left fifth, 3.14). 24 px is a finger's width at the display's edge; the edge strip
  takes no tap (it only decides a drag that is horizontal and to the right).
- **The editor's graph takes only what it drags** (founder: 'there is a lot of space in the graph
  which drags nothing; if I start a swipe here it should go back to home'). Today the whole
  `<svg>` is `touch-action: none` and the swipe check treats it as the graph's, though
  `Graph.svelte` drags only what `hitTest` finds at the finger's `pointerdown`: a level line
  within 1.8 rem, a border within 1.4 rem (the pause's border in detail mode only), and the
  chips (`ValueChip`, their own `touch-action: none`). New: a drag that starts on the graph
  **away from those is the page's**: the swipe goes back (to the right) or is not ours (vertical).
  How: the graph gives the swipe check its own question, 'does the finger lie on something I
  drag?' (a function on the graph's element that the check calls with the point, the same
  `hitTest`, so the two cannot differ), and the svg stops being `touch-action: none` (`pan-y`: the
  page does not scroll sideways there); a drag that starts on a line or a border stays the
  graph's, as now. The left edge strip still goes back from anywhere. Test: from points far
  from every line and border the swipe goes back; from a level line, a border and a chip it moves
  the value and goes nowhere.

  *Built (Z17):* the edge (`BACK_EDGE`, `atBackEdge` in `src/shell/swipe.ts`) goes back over
  anything but a dialog or its backdrop (`role="dialog"`, `data-no-swipe`: the number pad, the date
  picker, home's menu); a row with a gesture of its own is marked `data-own-swipe` (the picker's
  rows; Z20's rename to the right is that row's, from further in than the edge). The graph's
  question is `dragsOnly` on its svg. A row that scrolls sideways (the editor's start row, the
  step cards) has the browser's pan along only while it overflows (`src/shell/sideways.ts` sets
  `data-sideways`): a pan along that is allowed cancels the swipe even when there is nothing to
  scroll.

**2. The tank unit in Quick Adjustments (item 2; Z18).** The setting 'tank unit' (ml or mm, 3.14
item 7) is under Skin > Display today. It moves to **Quick Adjustments > Water Tank**, the
subcategory that holds the machine's tank settings ('mini water tank' is read as that one; the
founder confirms on the tablet). It stays the skin's own setting (`settings.tankUnit`, local and
in the KV backup), shown there in the skin's controls with the hint 'The water in the tank on
the state line: in ml, or in mm as the machine measures it. This one is the skin's, not the
machine's.' The Display group keeps the display size and the line width. The settings search and
the page's links that name the old place follow. Nothing in `stateLine` changes.
*Built (Z18):* the Water Tank subcategory draws the skin's own row 'tank unit' (ml, mm) under the
machine's tank temperature and water level alert (`TankUnit.svelte`, the tree's view `tank-unit`),
with the same test ids (`setting-tank-unit-ml`, `-mm`); it is written to the settings object at
once and needs no machine. The skin has no settings search, so there is none to follow; the user
guide names the new place.

**3. The bean photo's reading is dropped (item 3; Z19).** 'The OCR feature does not really work,
drop this feature for now, just keep the possibility to take a photo.' This **supersedes Z1 and Z2**
(3.14 item 1) and the reading half of U13 (3.9). Kept: the **Photo** button, the
live camera with **Capture**, **Take a picture** where the camera is refused, **New photo**,
**Remove photo**, the JPEG of 1024 px in the KV namespace (`bean-photo-<id>`), the photos already
stored. Removed: `src/beans/ocr.ts` and its tests and fixtures (`ocr-bags.json`), the progress line,
**Cancel** and the six chips of the lines read, `scripts/ocr-probe.mjs`, the `ocr/` folder of the
ZIP and its entry in `vite.config.ts`, the dependencies `tesseract.js`, `tesseract.js-core` and
`@tesseract.js-data/eng`, the Tesseract credits in `NOTICE` (P1) and the licence files, the
bean form's pre-fill. The ZIP falls back to about the size it had before U13 (152 517 bytes, 3.9
item 20) plus what the skin grew since, **under 1 MB** instead of 7.8 MB. The photos of the bags in
`docs/product/bags/` stay in the team repository as they are (3.13). Acceptance item 104 and the
OCR items of 3.9 are marked as dropped; the history keeps what was built. A later reading (a
cloud or a better local model) is a new item, not this one.

**4. The target in the hot water ring (item 4; Z22).** The transcript broke off after 'for the hot
water ring so the target weight or volume'; the founder's answer: 'yes, show the target weight/volume
in the ring during hot water pouring. add a task for it'. The ring of a **hot water** run
(`Water.svelte`, `waterValues` in `src/shell/water.ts`) shows, under the values it has (time,
temperature, flow, weight), **a target line**: 'target 50 g' with a connected scale and 'target 50 ml'
without one, the number the hot water page's 'stop at' holds (`workflow.hotWaterData.volume`, which the
page labels g or ml by the scale, 3.12), in the same style as the other values (`value` role, the
ring's tokens as in Z5). With a scale the weight line reads '12.4 g' above it, so the two are read
together; without one there is no volume count to show beside it, the target alone. **Not for a flush**
(it has a time, not an amount) and not when the target is 0 (no stop). The ring still fills by
time as it does (3.14 item 8); filling by the weight against the target would be a change of its
own and is not planned. Unit test: `waterValues` gives 'target 50 g' with a scale, 'target 50 ml'
without, nothing for a flush or for 0; e2e on the mock gateway for both, over the ring's frame. *Built (Z22):*
the line sits between the values and **stop**, its unit follows the scale link as the page's row
does (`connected`: g), and it is yellow with a scale (read with the weight) and white without one.

**5. Rename in the picker (item 5; Z20).** A row of a stored profile moves **to the right** and
shows a **rename** button at its left end, as a move to the left shows **delete** at the right
end (3.10): the same 7 rem button in the same style (a neutral colour, not the warning's red),
the row narrows by it, one open row at a time, a tap elsewhere or a move back closes it, a
vertical drag still scrolls the list. The skin's defaults do not move to the right (they have no
record; the founder's 'rename' is for profiles he stored). The loaded profile **can** be
renamed, unlike deleted: the rename keeps its steps, and the skin then loads the renamed one again
so the workflow, the machine and the 'loaded' tag agree. The button opens a dialog (the number
pad's dialog frame, `Confirm.svelte` with a text field, the tablet's own keyboard) with the title
as it is, **Cancel** and **Rename**. The rule of the dialog: the new title is trimmed; empty is
refused ('A profile needs a name.'); the title of **another stored or default profile** is
refused ('A profile with that name exists.'), the same title as before is a cancel. How: `PUT
/api/v1/profiles/{id}` with the profile and the new `title`, no `metadata` field, which keeps the
id and the metadata (research.md: 'PUT with another title changed it and kept the id', seen running); the list is read again and sorted, the
renamed row is selected and scrolled to. An A-Flow 3.0 profile keeps its prefix as the user
typed it; the picker's tag 'A-Flow 3.0' comes from the values, not from the title. An error from
Decaid is shown in the picker's error line and changes nothing. A hidden older version keeps its
old title (it is hidden). The move to the right must not be mistaken for the swipe back: the edge
strip of item 1 goes back, a drag from further in is the row's (the row's gesture decides at
`SWIPE_SLOP` as the delete's does).
*Built (Z20):* a row rests at one of three places (`RowRest` in `src/shell/row-swipe.ts`: moved
left, closed, moved right); a move goes one step from where the row rests, so a move back from
delete or rename only closes. The rename button is the delete's size in `--dim` with dark text.
The dialog is `Confirm.svelte` with a `value` (its text field, focused, Enter is Rename) and a
reason line under it; its title reads 'Rename <title>'. The rule is `renameAnswer` in
`src/shell/profiles.ts`; titles are compared as typed, so another case is another title. A
filter that would hide the renamed row is cleared.

**6. An edit button beside load (item 6; Z21).** The picker's detail panel has one **load**
button, full width at the bottom (`min-height: 3.4rem`). It becomes **two buttons side by side in
the same place, `edit` and `load`, each half of the width, the same height, 0.6rem apart**; the
panel's other parts do not move (3.16 item 1). **Edit** opens the editor on the selected profile:
the editor works on the machine's profile (the workflow's), so it **loads the profile first, as
'load' does** (asking about unsaved edits through `skin.mayLoad()`), and goes to the editor, an
A-Flow 3.0 profile in the A-Flow editor and any other in the step editor (`editorFor`). A
default opens as it is held by the skin, without a record, as when it is loaded. The load button
keeps its own path: it loads and goes back to where the picker was opened from. (The founder: 'edit
button loads too, that's okay'.) Both are off while
nothing is selected and while busy, as the load button is. The edit button is not the editor's
'load' of 3.6 (the editor opened the picker, a profile is picked, back in the editor): that stays
the way it is.
*Built (Z21):* edit is the left button in the panel's plain style, load stays the right one,
filled; both run the one load of `Profiles.svelte`, and `screenAfter` in `src/shell/profiles.ts`
says where it goes (edit: the editor, load: back). The editor's way back after edit is the
picker when the picker was opened from home, and stays where it was when the editor opened it.

**7. The state word has the size of the names (item 7; Z23).** From the founder's check of 'Names alike
(Z5)' in install.md: 'does the larger state word ("Idle") look right? -> no, it should have the same
size as profile and bean or title "steam" on steam page'. Today the state word is the **title** role
(`--text-title`, 1.6 rem, weight 600; `StateLine.svelte`), above the 1.1 rem of the profile and bean
names (the **name** role); the page title on the steam and hot water pages is the title role too, so
the two are already equal to each other and both larger than the names, which is not what the founder
wants. His answer to the plan: 'less is more, don't introduce unnecessary font sizes; if the steam and
hot water titles are 1.6 then put them to 1.1'. So **no new size**: the state word and the page title
('Steam', 'Hot water', and every page header, `PageHeader.svelte`, one component) both take the **name**
role (`--text-body` 1.1 rem, weight 600), the size of the profile and the bean on home. Their values
stay values. Titles of dialogs and pickers (`--text-title` in the editor, settings, history, beans and
date dialogs) are not pages' headers and are not touched; the title token stays for them and for the
large values that use it (the steam page's readings, the chips). The first step is to **list the
computed sizes** of the state word, the page title and the names on home, steam and hot water with
`npm run type-sizes` and tell the founder what they were. The roles table (3.14) changes in two cells:
the state word and the page header leave 'title' and join 'name'; the type check (acceptance 95) gets
the line 'the state word and the page header have the profile name's size and weight'.

*Built (Z23):* `npm run type-sizes` before: the state word ('Idle') and the page titles ('Steam',
'Hot water') 1.6 rem (25.6 px) weight 600, the profile and bean names on home 1.1 rem (17.6 px)
weight 600 (steam and hot water show no names). After: all of them 1.1 rem weight 600; the
header row keeps its 56 px height on home, steam and hot water. The check is in
`e2e/type-roles.spec.ts`.

**8. The adjust buttons change the running steam timer (item 8; Z24).** Founder: 'during steaming
the +/- buttons should change the current running timer; use case: I forgot to tick one of them
and want to correct that on the fly'. Today (3.7) a tap on an adjust chip only selects it and
writes nothing; the amount goes into the timer with 'set timer' or a chip's seconds, which is
too late once steam runs. New, **while steam runs only**: a tap on a chip writes the steam timer
at once, the machine's current timer **plus the change the tap makes to the selection**: none to
chip i adds its amount, chip j to chip i adds the difference (amount i - amount j), the selected
chip tapped again takes its amount off. So the selection and the timer stay in step: forgetting
'+5 s', then tapping it at 12 s left, gives 17 s left; tapping '-4 s' instead of '+5 s' moves
the timer by -9 s. The write is the one 'set timer' makes (`setSteamTimer`, held within 1 to
255 s); the countdown, 'steam left', follows because it is the timer minus the run's time. A
timer set at or under the time already run ends the steam at the machine; that is the use of a
negative chip and is not guarded. 'Set timer' keeps its meaning (the calculated timer, with
the selected amount), also while steam runs. When steam ends the selection is cleared, as now.
**First step: find out what the machine does with a timer written mid-steam.** Decaid takes
`steamSettings.duration` from the workflow and the DE1's own settings (`applySteamTimer`); if the
running steam does not take the new value until the next one, the rig and the machine show it,
and the founder is told before anything is built on it (then the chips would only change the
countdown the skin draws, which is not planned: it would lie). Tests: `steam-control` unit test
of the three selection changes against a running and a finished steam (a finished one writes
nothing); e2e on the mock gateway: a tap while steaming changes the written duration and
'steam left'.
*Built (Z24):* the first step's answer is in research.md 35: Decaid passes a timer written
mid-steam to the machine at once, the simulated machine ends no steam at all, and Decaid's own
+10 s button and de1app's DPx_Steam_Stop plugin both rely on the DE1 reading it mid-steam.
`SteamControl.tapAdjust` (`src/shell/steam-control.svelte.ts`) takes the tap; while steam
runs it writes through `setTimer`, one write after another, each from the machine's timer the
one before left. The rig's steam spec is not extended (the simulated steam never ends).

**9. The state says 'Pouring' (item 9; Z25).** Founder: 'the state on home shows Espresso during
a shot; change that to Pouring; you can make filter coffee with the machine'. `STATE_LABEL` in
`src/shell/machine.ts` says 'Espresso' for the machine state `espresso`; it says **'Pouring'**. The
state is the same one that selects the shot screen and the phases, only the word changes; no
other place shows the word (the history and the profile names are the user's own). The tests
and the e2e that expect 'Espresso' expect 'Pouring'.

**10. Home keeps the profile and bean buttons while a shot runs (item 10; Z25).** Today
`ShotView.svelte` draws `NextShot` (the profile name with its pen, the bean and grinder button)
only when no shot runs, so the column's values jump up when a shot starts. New: **they stay**,
at the same place, for the whole shot. While a shot runs they are **shown but off** (dimmed,
not tappable): changing the profile or the bean in the middle of a shot would change what is
saved with it, and the load button already refuses while busy (3.16). They are live again when
the shot ends. The stop button stays at the column's bottom; the column must hold all of it at
the 1280 x 800 tablet size. Test: on the mock gateway the top of the time, weight and stop in
the column is the same before, during and after a shot, and the two buttons exist and are
disabled during it.
*Built (Z25):* `NextShot` takes `off` from `ShotView` while the shot runs: its three buttons
(name, pen, bean) are disabled and the block is at 40 % opacity; a bean pick left open when a
shot starts is closed.

**The order.** Z17 first (the others touch the same pages), Z18 and Z19 independent, Z20 after Z17
(the swipe's meaning), Z21 after Z20 (the same panel and file), Z22, Z23, Z24 and Z25 independent (the ring, the header, the steam chips, the home column), then the local release H6 with
`npm run release -- --local` (3.15), the founder's check on the tablet, and the public release
P6 resumes that release (`--resume`), so the public skin has no OCR to credit and no half-working
swipes.

### 3.18 The founder's picks from the design review of 2026-10-27 (planned, not built)

Z27 reviewed every screen and wrote 23 proposals (`design-review-2026-10-27.md`, with the
screenshots). The founder: 'all good findings, plan all of them except DR17'. **DR17 is dropped:**
the editor's graph needs no unit line, 'each line or chip has a value with unit'; it stays as it is.
His corrections to four of the others are part of the items below. Each item has the review's
problem and change, which are not repeated here; this says what is decided and what the founder
changed. Nothing is built; the work is in the product repository, roadmap Z29 to Z41.

**The order.** Z29 first (the words, so that the later tasks and their tests write the final
ones), then Z30 (colours, danger, disabled) and Z31 (the weight formatter, DR2); Z32 before Z33 (the
same file), Z30 before Z33 (DR9 needs the warning and the delete style); Z34 (the steam and hot
water pages) after Z30 and Z31; the others are independent. **Z41 (DR13, spacing) is last and after
the local release H6:** it touches every file and every screen, so the 3.17 and 3.18 tasks reach the
tablet without waiting for it, and it follows in the next release. H6 waits for Z29 to Z40.

**1. The words of the buttons (DR11; Z29).** One case: lower case for buttons ('delete', 'discard
and load', 'save', 'new bag', 'archive', 'photo', 'use for the next shot', 'steam on', 'cancel');
titles and the corner menu's entries stay in sentence case. The review's list of the places is the
start; a grep of the e2e texts finds the tests.

**2. Warning, danger, disabled (DR7, DR8, DR10, DR15; Z30).**
- DR7: `--warn` becomes the clearly orange #ff8a3d; text that warns ('Off', 'looking for it',
  'delete step', the scale's warning) gets the '⚠' the scale's warning has.
- DR8: an action that deletes or discards is an outline in the warning colour, never filled:
  `Confirm.svelte` gets a `danger` option (the picker's delete), 'discard and load' and 'delete
  step' follow; 'archive' stays plain (it can be undone).
- DR10: every disabled main button looks as the steam page's 'set timer' does (panel background,
  grey text): the number pad's 'set' and the bean and grinder forms' 'save'.
- DR15: `.tag.loaded` in the accent colour (the light blue), not pressure green.

**3. The scale's weight shows no jitter around zero (DR2; Z31).** One function writes every weight
of the scale, `gramsOf()` in `src/display.ts`, in place of the `toFixed(1)` in `machine.ts` (the
header), `Steam.svelte`, `HotWater.svelte`, the hot water ring and home's shot weight (a grep over
the weights finds them all). **Founder's correction:** negative values are real, they depend on the
scale, and stay (-0.6 g reads '-0.6 g'); what goes is the jitter around zero: **a weight from -0.1
to 0.1 g, both ends included, is shown as '0.0 g'**, never '-0.0'. The band is applied to the
reading before it is rounded, so 0.1 shows '0.0' and 0.11 shows '0.1'. Only what is shown changes:
the milk, the tare and every calculation keep the raw reading.

**4. The scale row of the steam and hot water pages (DR1, DR3, DR4, DR25; Z34).**
- DR1, variant B, **without the 'tap to tare' hint** (founder): the three rows (scale, mug, milk)
  are a grid of label, number and unit, the numbers right-aligned on one edge, the units in their
  own column, as on home. The scale's row is the tare, **one button over the whole row** (3.5 rem
  high, a frame like the other buttons, the test id `steam-tare` stays) and **off while steam
  runs**. The review's 'tared' note after a tare is not planned (the weight reading 0.0 says it;
  less is more). The mug's size 'S' moves into its label as a badge; its weight has the size of the
  others, in grey.
- DR3: the hot water page gets the same row, live while idle (an empty cup before pouring), off
  while water runs; 'last shot' and 'scale' share the number column.
- DR4: without a scale one line 'no scale: the chips set the timer' replaces the three rows; its
  tap looks for the scale again (3.9); 'set timer' is off and says 'needs the scale'.
- DR25: the header's elapsed time shows only after steam has ended ('last steam 28 s'); while it
  runs the countdown 'steam left' is the one clock.

**5. Home: the names first (DR5; Z35).** The profile and bean buttons have two lines: the name
(name role, one line, cut at its end) and a caption under it (the profile's family or the part
before ' / '; the roaster for the bean); the grinder setting stays at the right. The buttons stay
in the column during a shot (3.17 item 10), dimmed. The column grows by about 2.4 rem and must still
hold the values and stop at 1280 x 800 and at the largest display size of the settings.

**6. The picker (DR14, DR16; Z32).**
- DR14: opening the picker selects the loaded profile and scrolls to it, its detail is shown,
  'edit' works at once.
- DR16 (**founder: a little hint, no 'more' button**): the description's box has a **lower border
  in the accent colour while more text lies below** the visible part; at the end of the text, and
  when the text fits, the border is as the others. It follows the scrolling (`scroll` event,
  `scrollHeight`). The fade stays as it is.

**7. One selected look (DR9; Z33).** A choice of one among a few (chips, modes, tabs, Beans |
Grinders) is the white fill; the row whose detail is shown beside a list (the picker, the bean and
grinder lists, the bean pick) is the white outline; history's 'all' follows. After Z30 and Z32.

**8. Touch targets (DR12; Z36).** At least 3 rem on the short side by padding, not by larger text:
the page dots, the step card's - and + (the three 'maximum' chips stay in one row), the editor's
'infuse to' and 'stop at' chips, the settings' sub-entries. The tare button goes with item 4.

**9. Settings, titles, menu (DR20, DR21, DR26; Z37).**
- DR20: the three adjust fields in the settings show '−8 s', '−4 s', '+5 s' with the steam page's
  `signed()`.
- DR21: 'Settings' and 'Beans and grinders' take the name role like the other page headers; only
  dialogs and the picker keep the title token (roles table of 3.14, acceptance 95).
- DR26: the menu entry reads 'Steam heater' with the state as its value ('on', 'off'); a tap
  switches.

**10. The grinder's step (DR24; Z38).** 'step' on its own row as a value chip with - and +, like
the other values, not beside the 'numbers | named positions' choice.

**11. The A-Flow editor's phases (DR18; Z39).** **Founder: the simple view stays as it is** (its
shown durations are the values one changes), **and in the detail view the phases that have no time
yet, fill and flow, show their time as a caption like the other steps, not the way they end**: a
phase may leave by pressure, by weight or by time, and the caption would claim one. The caption is
the step's own time (`fillTime`, `pourTime`), in the style of the other durations, under the phase
name, read only (the detail panel changes it); it is left out where the column is too narrow and for
a phase that is off. **DR17 is not done** (above).

**12. History (DR22; Z40).** The three filter chips equal, in the selected style of item 7. A third
line '27.4 s · 33.8 g' (the weight in yellow) **only if the list's summary has the time and the
weight** (its `annotations`): the first step is to check that. If it has not, reading every record
would undo the list's speed-up (3.8), the line is not built and the founder is told; the chips are
built either way.

**13. Spacing (DR13; Z41, after H6).** Four spacing tokens in `src/app.css` (0.3, 0.6, 1.2 and 2.4
rem) and a lint rule like `scripts/font-sizes.mjs` that refuses any other `gap`. The first step
counts every gap and padding and maps each to the nearest token; the screenshots before and after of
every screen are compared by the founder, and the full e2e, rig and mock, runs.

### 3.19 The bean bag's reading returns, in a second build (planned, not built)

Z28 (research.md 36) recommended reading the bag on the tablet with PaddleOCR.js and PP-OCRv6 tiny.
The founder, 2026-10-27: 'plan PP-OCRv6 tiny, but create a build feature for it: a build should
produce two ZIPs, one with and one without OCR.' This answers open question (a) to (d) of section 8:
(a), as a second ZIP, so the public skin keeps its small ZIP of 3.18 and the reading is an extra one
downloads choose. **Gemini (c) is not planned**, and neither is the fetch-once variant (b). Work in the
product repository, roadmap Z42, Z43 and the local release H7, after the design-review tasks and after
the public release P6; nothing is built.

**1. Two flavours of one source (Z42).** One source tree, two builds, chosen at build time:
- **base** (what 0.7.0 is): no reading. The bean form is as 3.17 item 3 left it: Photo, Capture,
  New photo, Remove photo.
- **ocr**: the same and the reading of the bag (item 3). The flag is a build constant, `__OCR__`
  (Vite `define`, true only in the ocr build), so the reader, `@paddleocr/paddleocr-js` and its
  dependencies, OpenCV.js, the ONNX Runtime WASM and the models are **not in the base build at all**:
  the code that uses them is behind `if (__OCR__) { await import('./read') }`, which the bundler
  removes with its imports when the constant is false. No runtime setting, no download.
- `npm run build` builds both (`dist/` for base, `dist-ocr/` for ocr; `build:base` and `build:ocr`
  build one); `npm run dev:ocr` serves the ocr flavour, `npm run dev` the base one.
- **`npm run zip` writes two ZIPs** from them: `release/<id>-<version>.zip` (base) and
  `release/<id>-<version>-ocr.zip` (ocr). Both have the same `id` and `version` in their
  `manifest.json` (Decaid keeps one skin of an id, so installing the other replaces it); the ocr
  ZIP's manifest `description` ends with ' With bag reading.'. The checks of `zip.mjs` run on both,
  and two more: the base ZIP has no `ocr/` folder, no `.onnx`, no `.wasm`, no `paddleocr` or
  `onnxruntime` string in its scripts and **is under 1 MB**; the ocr ZIP has the `ocr/` folder with the
  two model files and the WASM and is **under 16 MB**.
- **The models** (the detector and the recogniser, 1.6 and 4.1 MB gzipped, 34 MB unpacked
  with the runtime) are **not committed**: `scripts/fetch-ocr-models.mjs` downloads the two ONNX
  archives of research.md 36.4 once into a git-ignored `.cache/ocr/`, checks their **SHA-256
  against the pins in the script**, and the ocr build copies them into `dist-ocr/ocr/`. A wrong hash
  or no network (and no cache) stops the ocr build with a message; the base build never needs them.
  So the public repository holds no binary model and a build is reproducible.
- **The release** (3.15): `npm run release` builds, checks and uploads **both ZIPs**;
  `release/SHA256SUMS.txt` has two lines; the check after the upload downloads both and compares them
  with the local files; the release notes name which is which ('pureflow-0.8.0.zip: the skin;
  pureflow-0.8.0-ocr.zip: the skin that also reads the bean bag, about 13 MB'); `--resume` and
  `--local` handle both. `docs/user/` and `install.md` say which to take: the small one unless the
  reading is wanted. `publish-check` and the licence check cover both flavours; `NOTICE` names the
  Apache-2.0, MIT and Boost licences of the reading's parts, in the ocr ZIP's copy only.

**2. CI and tests.** The mocked e2e runs against the base build; one extra spec, in the ocr flavour
(`playwright.ocr.config.ts`, a job of its own), loads a stored photo of a bag and reads it in
Chromium. A unit test of `zip.mjs`'s checks on two fixture trees (a base one that contains an
`.onnx` fails; an ocr one without the models fails). The picture tests (`npm run screenshots`) use
the base flavour.

**3. The reading (Z43; research.md 36.6).** In the ocr flavour only:
- `src/beans/read.ts` (about 80 lines): the reader (PaddleOCR.js with PP-OCRv6 tiny, the detector
  and recogniser pair) is made on the first photo and kept; the stored 1024-px photo's canvas goes in,
  the lines with their text, score and box come out; the photo is read upright and, when nothing is
  read, turned by 270 degrees first (the four bags of `docs/product/bags/` need that).
- `src/beans/fields.ts` (pure, about 120 lines) with its tests (the four bags' recorded lines as
  fixtures, as Z1's were): the roaster is a line that is a roaster of the catalogue, or the line right
  above or below the name; tasting lines and countries are not offered as the name; title case.
- `src/beans/BeanForm.svelte`: 'Reading the bag' while it reads (**Cancel** ends it), then the lines as
  **chips under the photo**; a tap on a chip puts it in the name or the roaster field, which is how
  a roaster the catalogue does not know yet is told from the name. Nothing is filled in by itself.
  No reading starts without a photo; the photo and its storage are as in the base flavour.
- The reading runs on the device; **nothing is sent anywhere** and nothing is fetched at run time
  (the models are in the ZIP). Offline it works.

**4. Versions.** The reading is a feature: the next release after P6 raises the minor version
(semver), H7 is its local release with both ZIPs for the tablet; the founder checks the reading on his
bags and decides whether the next public release carries both ZIPs (a public release is his, 3.13).

### 3.20 The CI's browser tests fail on GitHub and say nothing (planned, first task, not built)

Since the product repository went to GitHub, the `e2e` job of `.github/workflows/ci.yml` fails (runs
40559220438 and 40564238939 of 2026-10-27: 295 of 300 and 294 of 300 tests pass, 11 to 14 minutes) and
the page shows only 'Process completed with exit code 1'. The logs, read with `gh run view --log-failed`,
say what failed; the job's own page does not. Work in the product repository, roadmap **Z44**, the
first task of the next working day, before Z17 to Z43; the `verify` job passes.

**1. Make the failure readable.**
- `actions/upload-artifact@v4` leaves out hidden files and folders by default, and `e2e/.results/` is
  hidden: 'No files were found with the provided path', so no trace, picture or error context was ever
  kept. The step gets `include-hidden-files: true` (or `outputDir` moves to a folder without a dot).
- The Playwright reporter in CI is `[['list'], ['github']]` (annotations on the run's page) and the
  tests keep a trace on the first retry (`trace: 'retain-on-failure'` is enough with no retry); the
  job ends with `if: failure()` uploading `e2e/.results/` and a one-line summary of the failed tests.
- A retry is not added to hide the failures (`retries` stays 0): a test that fails now and then is
  found and fixed, as cda0fcd did for two others.

**2. Find the cause of each failing test.** The same five fail in both runs, a sixth in the first:
- `editor.spec.ts:177` 'the start flow is written at the left edge of the flow phase': the label's x is
  630 and the test expects at least 830 (the flow line's x);
- `editor.spec.ts:220` 'the pause is dragged in detail mode only' (first run only): 60 where less than
  60 is expected;
- `history.spec.ts:74` 'a swipe from the left edge ...': after a tap at (1100, 400) the history is
  still there;
- `picker-delete.spec.ts:99` 'a vertical drag scrolls the list ...': after the drag the delete button
  of the row is not there;
- `picker-estimate.spec.ts:55`: the estimate caption is wider than its box (`scrollWidth > clientWidth`);
- `settings-connections.spec.ts:128`: 'Reconnect' is 'detached from the DOM, retrying' until the
  30 s run out.

Two causes are likely and neither is checked: **the font** (the runner is Linux without the fonts the
founder's machine and tablet have, so widths, wraps and the editor's label positions differ: the
estimate caption and the label x) and **time** (the runner is slower: a swipe, a tap or a re-render
lands before or after the state the test expects: the history, the delete row, the Reconnect button).
The first step is to run them on the runner with the trace on and read what each test saw, or on a
Linux container of the same image (`mcr.microsoft.com/playwright`).

**3. Fix each where it belongs.** A skin that depends on a font being there is a defect (the
tablet has its own fonts, so the caption must not overflow with any fallback; the skin names its
font stack, 3.14); a test that depends on a font or a timing is a test defect and is changed to
state what the design requires (a width limit, a wait for the state, not a sleep). No test is skipped
or loosened to pass without a reason written in its comment. A defect in the skin gets a test first.

**4. Done** when the `e2e` job is green on `main`, twice in a row, and a deliberate failing test on a
branch leaves its trace in the artifact (then removed). `docs/` and CONTRIBUTING name `gh run view
--log-failed` as the way to read a failure. The Windows machine's `npm run e2e` stays green.

*Built (Z44), where the item left it open:* `outputDir` stays `e2e/.results` and the upload has
`include-hidden-files: true`; the reporter and the trace are CI's only (`CI` set), so a local run
is as fast as before; the summary line is grepped from the list reporter's output. Causes, found
on this machine (no Linux container ran): the caption is a skin defect, cut with any font wider
than the design font (it filled its box to the pixel there): it wraps to a second line now,
never cut; Forget's late answer threw away a newer list from Decaid, so the row Reconnect was
clicked on vanished: a skin defect, fixed; the start-flow label is not font-dependent: the test
read the flow column before detail mode's panel narrowed the graph and the label after it; the
history and the delete row followed a swipe that ended in a fling, which takes the next tap or
keeps the list moving; the pause test's cause was not found (failed once of more than 20 runs
here): it now waits for the time to follow the drag.

## 4. Technical approach

### 4.1 What a Decaid skin is
A static web app (`index.html` at the root) served by Decaid from localhost, talking to the
gateway's REST and WebSocket API on port 8080. Each installed skin has its own port, which
Decaid assigns from 24800 upward and keeps over restarts; the bundled Streamline skin is on
27906 on the test rig, and this skin got 28881 there (research.md, section 15). The skin
does not assume its port: `GET /api/v1/webui/server/status`
returns it (research.md, section 9). Decent prescribes
no framework and no design system. The **Streamline** skin is the reference implementation.
Rules from `doc/Skins.md`:
- persist state through the Decaid KV API or `localStorage`; `sessionStorage` is cleared when
  the WebView unloads (Android unloads after ten minutes in the background);
- reconnect the WebSocket with backoff, but not on connection-error frames;
- never use ports 3000, 4001 or 8080;
- optional `manifest.json` (id, name, description, version, author, repository); the id is one
  safe path component.

### 4.2 Stack (decided in D2, 2026-10-11)
- **TypeScript + Vite**, static build to `dist/`, with relative asset paths.
- **UI framework: Svelte 5.** Decided on the two criteria of the scaffold milestone:
  - *Bundle size.* The scaffold's whole build is 25 kB of JavaScript, 10.3 kB gzipped,
    measured with Svelte 5.57 and Vite 8; that is the framework's fixed cost. No framework
    costs 0 kB, so on size alone it wins, by about 10 kB. The skin is installed once as a ZIP
    and served from localhost, so 10 kB is not felt. Svelte compiles components at build time,
    which keeps it far below a framework with a full runtime.
  - *Code per screen.* The skin is live state on screen: two snapshot streams drive the home,
    espresso and steam screens, and the editor redraws a curve on every drag. In Svelte a
    value in the markup follows its state by itself; without a framework each of those
    updates is hand-written DOM code, on every screen. This is where Svelte wins, and it
    outweighs the 10 kB.
  - The live Streamline skin (`decentespresso/streamline-js` v0.2.12, GPL-3.0-or-later; its
    `package.json` says ISC) takes the other route: no framework, Tailwind + daisyUI, esbuild and ECharts. Its `api.js` stays a useful
    reference for the API client (D4).
- **Profile generator as a pure module** (A-Flow parameters -> v2 profile JSON), with no UI and
  no network. This is the product's core and gets the most tests.
- **Charts:** a small canvas or SVG line chart of our own, or a light library; decided by
  bundle size.
- **Tests:** Vitest for the generator and the API client; Playwright against Decaid's device
  simulation for the screens.
- **Formatting and lint (Q1, 2026-10-20):** the tree is formatted with Prettier
  (`prettier-plugin-svelte`; `npm run format`, `npm run format:check`) and linted with ESLint
  (`typescript-eslint`'s type-checked recommended rules, `eslint-plugin-svelte`,
  `eslint-config-prettier`; `npm run lint`). The check every task runs (`check_command` in
  `stint.toml`) runs both after the unit tests and svelte-check.
- All packages open source, free, no registration.

### 4.3 Build targets
The skin is one static build for every platform: the same ZIP runs in Decaid on Android,
Windows, Linux and macOS. What differs per platform is **Decaid itself**:
- **Android (the founder's tablet):** Decaid from its release; the skin is installed from a
  GitHub release URL (`POST /api/v1/webui/skins/install/url`) or a ZIP, or live-edited from a
  folder (needs Manage External Storage).
- **Windows / Linux (the team's test rig):** Decaid run with device simulation. Decaid
  v0.8.8 has prebuilt releases (a Windows x64 ZIP; Linux x86_64 and aarch64 AppImage and
  tar.gz), so the team does not build it. The prebuilt release has the simulation as a
  runtime setting: `POST /api/v1/settings` with `{"simulatedDevices":["machine","scale"]}`
  and a scan connect a simulated machine and scale; a first start needs the flag
  `--bypass-onboarding`. This was run on Windows on 2026-10-11 (research.md, section 8,
  with the steps to start it). A full simulated shot runs. Two limits: simulated steam does
  not end by itself, and the simulated scale's weight cannot be set. Only the `debug`
  endpoints and the replay simulator need a source build with `--dart-define=simulate=1`.

### 4.4 Release
- Public GitHub repository under **GPL-3.0**, the same licence as Decaid (founder's decision,
  2026-10-11). A-Flow is forked from Damian Brakel's D-Flow, which carries no licence file; the
  founder has Damian's approval to use that code.
- **Version 1:** a local ZIP with `index.html` at its root, which the founder installs on the
  tablet. No GitHub release. Built in D9, numbered 0.1.0 since 2026-10-14 (beta; founder,
  2026-10-13), fix rounds 0.1.x, 0.1.1 on 2026-10-15; a hand-over raises the minor version
  (founder, 2026-10-16), so the hand-over of version 1.1 and the review of 2026-10-16 is
  0.2.0 (H1, 2026-10-18), and the hand-over of the review of 2026-10-17 and the bugs of
  2026-10-18 is 0.3.0 (H2, 2026-10-20), and the hand-over of the reviews of 2026-10-18 and
  2026-10-20 is 0.4.0 (H3, 2026-10-21), and the hand-over of the reviews of 2026-10-21 and
  2026-10-22 is 0.5.0 (H4, 2026-10-23), and the hand-over of the review of 2026-10-23 and inbox
  #45 is 0.6.0 (H5, 2026-10-24), and the completion of 0.6.0's hand-over and the review of
  2026-10-24 is 0.6.1 (H5, 2026-10-25; a patch, since 0.7.0 is the public release, P6): `npm
  run zip` writes
  `release/pureflow-<version>.zip`; the steps and the
  founder's checks are in
  [install.md](install.md), the result of the automated items in
  [acceptance.md](acceptance.md).
- **Later releases:** the same ZIP attached to a GitHub release, installable by URL, made by
  `npm run release` (`scripts/release.mjs`, its pure parts in `scripts/release-lib.mjs`; 3.15,
  P7): the checks, the CHANGELOG section from the commits' trailers, the version, the ZIP and
  `release/SHA256SUMS.txt`, the commit and tag, and the publish step behind the founder's yes;
  a hand-over runs it with `--local`. The plan
  for publishing, the repository's clean-up and the user documentation are 3.13 (roadmap track P).

## 5. Acceptance (what "v1 done" means)

Approved 2026-10-11

Items 1 to 6 are automated tests; 2 to 6 run with Playwright against Decaid's simulation on
Windows or Linux. Items 7 and 8 are checks by the founder.

1. **Generator.** It produces the A-Flow 3.0 steps of 3.2 for each default profile and for
   every toggle combination (fixture tests). Where a 3.0 profile uses the plugin's fixed
   values, its steps equal the plugin's output with ramp down off and the first-step
   workaround on (regression tests, written from `code.tcl`).
2. **Shot.** The skin loads, shows machine state, loads an A-Flow profile, runs a simulated
   shot with a live graph and stops at the target weight.
3. **Editor.** In simple and in detail mode, changing a value redraws the curve, and the
   profile sent to the machine equals the generator's output for those values.
4. **Steam.** From a simulated scale weight the page detects mug s, m or l and sets the timer
   by the formula of 3.4; a favourite chip sets it directly.
5. **History.** Two simulated shots with a different profile or bean give two entries; tapping
   one restores profile, bean and grinder setting and shows its graph; the overlay closes on
   selection and on a tap outside it.
6. **Scale, settings, sleep.** (The scale page is removed by 3.7; tare is a tap on the weight.) Tare works and a 400 during a shot shows a notice; settings
   survive a reload; the sleep button puts the machine to sleep.
7. **Real machine (founder, by eye).** With a profile made in the editor loaded on the real
   DE1, all phases are set correctly and the target values are as expected.
8. **Install (founder).** A local ZIP of the build installs on the Android tablet and opens in
   landscape, dark. Version 1 has no GitHub release.

Version 1.1 (3.6); items 9 to 11 run with Playwright against the mock gateway or the rig:

9. **Water view.** In the hot-water and in the flush state, the ring shows the elapsed time
   against the workflow's target duration; the stream moves while the flow is above 0 and
   stands still at 0; the hot-water cup's level follows the volume so far, or the scale's
   weight when a scale is connected.
10. **Step editor.** A non-A-Flow profile opens in the step editor and an A-Flow profile in
    the A-Flow editor. Changing a step's values, adding, deleting and moving a step, then
    saving, gives a stored profile whose steps equal the edit, recorded in Decaid's lineage.
11. **Preview and settings.** The curve preview changes with each step edit; title, notes,
    target weight and tank temperature are saved with the profile.
12. **Licence (founder).** The ported files carry Streamline's ISC copyright notice.
13. **SCRIPT tab.** Editing a step's value in the text changes the graph preview and, saved,
    the stored steps; a text that does not parse shows an error and saves nothing. (Replaced
    by item 26 once E6 is built.)
14. **A-Flow values.** An A-Flow profile saved by the skin has its values in `metadata` and
    none in `notes`, opens in the editor with every value as saved (the 2nd fill's values too
    while it is off), and does so again after the data export and import on the rig. A
    profile with the values in `notes` opens right and is moved on its next save. With the
    fallback instead: the same, from the steps alone.
15. **Settings and steam (test).** Mug detection switches at the midpoints of 3.4 (with the
    defaults: medium above 412.5 g, large above 625 g); the maximum flow follows its setting;
    a new shot without a set dose takes the default dose.
16. **Reconnect (test).** After an error close the skin retries for 30 s and shows the
    reconnect button only after that.

The founder's review of 2026-10-16 (3.7); items 17 to 23 and 26 are tests, 24 and 25 the founder's:

17. **Steam page (test).** After steam ends the graph adds no more points and the last steam
    time equals the steam's duration; while steam runs the timer counts down from the set
    seconds; a selected adjust button adds its amount to the calculated timer and to a
    favourite, and the seconds sent to the machine include it; the three amounts come from
    the settings; the temperature axis is 140 to 170 °C; a swipe from the right edge opens
    the steam page; its tare button tares the scale.
18. **Home menu (test).** Steam off and machine off send the gateway's requests for them (on
    the rig: the steam heater is off, the machine is off), and steam off can be turned on
    again.
19. **Water view (test).** In the hot-water and flush states there is no group head picture;
    the ring counts down and the stop button shows temperature, flow and time, and for hot
    water the weight.
20. **Hot water page (test).** Temperature, flow, time and stop at weight are written to the
    workflow's `hotWaterData`; a ratio favourite with a last shot of 40 g sets 80 g for 1:2;
    the favourites come from the settings; hot water stops at the weight; the split steam tab's hot water part opens the page, and its
    tare button tares the scale.
21. **Scale page (test).** There is no scale page and no menu entry for it; the weight still
    shows in the state line, and a tap on it tares the scale when one is connected (nothing
    happens without one).
22. **Settings (test).** The ported settings page holds Streamline's settings and the skin's
    own in a skin category; a changed Decaid setting is read back from the gateway.
23. **A-Flow editor (test).** The label says "end flow"; in detail mode a drag on the left
    half of the last step's flow line changes the start flow and on the right half the end
    flow; there are no buttons above the graph; the infuse phase is as wide as its move-on
    weight's estimate; a drag changes the infuse-to weight; a phase dragged to 0 s collapses
    and its button sets it to 5 s.
24. **Steam on the real DE1 (founder).** The countdown and the adjust buttons are right in use.
25. **Hand-over (founder).** The next ZIP installs on the tablet; the checks of
    [install.md](install.md) not ticked by 2026-10-16 are asked again with the new ones.
26. **Step editor (test, low priority).** In card mode there are no arrow buttons; a tap on
    a card selects it and moves it to the centre. In SCRIPT a tap on a state word cycles it
    and a tap on a number opens the picker; either changes the preview and, saved, the stored
    steps; there is no text field.

The founder's review of 2026-10-17 (3.8); items 27 to 35 are tests, 36 and 37 the founder's:

27. **Espresso graph (test).** A shot with pressure and flow under 10 has a scale to 10; a
    value over 10 opens it to 12. The live series ends where the shot ends: the frames in
    espresso after it add no points and do not move the timer, and the live graph equals the
    history's graph of the same shot in length within one second. A running shot's time axis
    starts at the last shot's duration with that profile, else the profile's estimate, else
    30 s, and a shot shorter than it is not rescaled.
28. **Shot overlay (test).** A shot opens the overlay over home with the stop button; when the
    shot ends it stays, with the per-phase table (seconds, weight, maximum pressure, flow per
    step and the total); a tap closes it to home, and a new shot replaces it.
29. **Heating (test).** An `idle` machine with the group more than 3 °C under its target shows
    'Heating' on home, and 'Idle' at 3 °C under it or closer; the steam page does the same with
    the steam temperature and the steam target; with the steam heater off the steam page does
    not say heating.
30. **Profile picker (test).** Typing "light" leaves the profiles whose title holds "light", in
    any case; a tap selects a profile and shows its description and preview and loads nothing;
    **load** loads it, after the unsaved-edits question when there is one.
31. **A-Flow defaults (test).** The picker lists the five defaults from the skin without any
    `POST /api/v1/profiles`; there is no 'not in Decaid' offer; a default loads into the
    workflow; edited, 'save' shows the hint and 'save as' stores it under the new name; a
    stored profile with the steps of a default (the founder's `test-light`) is listed under its
    own title only.
32. **Swipe (test).** From home a swipe to the left opens steam and from steam back to home;
    a swipe to the right from home (outside the history's edge) opens hot water; the left-edge
    swipe on home still opens the history; a drag on a control moves no page.
33. **Editor feedback and steps (test).** The steps panel has no 'shot stops at' line and the
    flow step's exit holds the stop weight; 'save' on a default shows the 'save as' hint;
    a save shows its result beside the buttons and the graph does not move.
34. **History (test).** The overlay shows the newest 20 shots' entries before the older shots
    are read; opened a second time it reads no shot list again; a new shot is in it.
35. **Menu: clean and exit (test).** The menu's clean opens the maintenance page's clean with
    the water level in ml, a warning under 350 ml and the drip tray hint; exit sends
    `sleeping` and calls `window.decentApp.exitToDashboard` (a stub in the test), and is not
    shown without it.
36. **Fonts and tabs (founder).** Home's tabs are thinner with larger labels, and the sizes on
    home, steam and hot water look aligned.
37. **Hand-over (founder).** The 0.3.0 ZIP installs on the tablet; the checks of
    [install.md](install.md) still open are asked again with the new ones.

The founder's review of 2026-10-18 (3.9); items marked (test) are tests, (founder) the founder's.
Where an item here and one of 27-37 disagree, the item here wins (3.9 overrides 3.8):

38. **Machine sleep (test).** The menu's entry reads 'Machine sleep' with the line that Decaid
    cannot switch the DE1 off and that only the machine sleeps; it sends `sleeping`. The menu
    has no 'Machine off' and no 'Exit' (this replaces item 35's exit).
39. **Machine and app sleep (test).** The second entry sends `sleeping`, sets the brightness to 0
    where `platformSupported.brightness`, releases Decaid's wake lock, and after a touch the
    machine is `idle` and the wake lock and brightness are as before.
40. **Scale reconnect (test).** A scale that drops, or is missing at the start while a preferred
    scale is set, is scanned for (`GET /api/v1/devices/scan`) every 5 s, at most 3 times, not
    while the machine sleeps; the warning then offers a retry, and a tap on it or on the steam or
    hot water page's tare button starts a new round. On the rig the simulated scale,
    disconnected, is connected again without a touch.
41. **Keyboard (test).** With a text field focused and the page's height shrunk to that of a
    keyboard (1280 × 450 from 1280 × 800), the root font size and the app's height are
    unchanged, and the field's dialog (save as, the profile's notes, the picker's filter) lies
    entirely above the new height; with the focus gone it is back in its place.
42. **Keyboard on the tablet (founder).** Tapping 'save as', the profile's description and the
    picker's filter opens the keyboard over the app; the app keeps its size and the field with
    its dialog is readable above the keyboard.
43. **A-Flow profiles (test).** Decaid's bundled `A-Flow / default-medium` and an old de1app
    A-Flow profile open in the A-Flow 3.0 editor with the values the plugin wrote (the reader
    gives back the generator's input for every regression fixture); ramp down is dropped and the
    status line says so; 'save' stores the profile with its 3.0 values in `metadata`, the old
    one its parent and hidden; a profile with changed steps still opens in the step editor.
44. **A-Flow import (test).** The settings button, after its question, converts every old A-Flow
    profile of the user's to 3.0 and reports the count; Decaid's bundled A-Flow profiles and 3.0
    profiles are not touched; a second run converts nothing.
45. **0 s steps (test).** In the step editor's curve a 0 s step has no width and no shading, the
    other steps are as before; the cards and SCRIPT still show it and its values can be
    changed.
46. **A-Flow editor status and spacing (test).** 'save', 'save as', a failed save and a load
    show their text in the line under the start row; the graph does not move when it appears or
    goes; the start row's buttons stand further apart than in 0.2.0.
47. **Hot water page (test).** The page has one row per value with a slider; a slider let go
    writes the value to `hotWaterData` once; a tap on the value opens the number pad; the flow
    goes up to 8 ml/s on this page and on the settings page; while hot water runs the page shows
    the ring with stop and its values; a drag on a slider moves no page.
48. **Steam heater off (test).** With `targetSteamTemp` 0 the steam page shows the message and
    'Steam on', which switches the heater on with the remembered temperature; with the heater on
    neither is shown.
49. **No state dot, smaller ring (test).** No page shows the state dot under the back arrow;
    home's water ring is 85 % of its panel's height.
50. **SCRIPT off (test).** In SCRIPT a step's exit cycles the four exits and off, and stays a
    line at off; a limit and a maximum's amount typed 0 are off and stay muted; each can be
    switched on again; saved, the stored steps have `exit: null`, no limiter and 0 amounts.
51. **Per-phase values (test).** After a shot the overlay's table has the rows Preinfusion,
    Extraction and Total with duration, weight, volume, temperature, flow and pressure, the last
    three as start → end and the pressure with its peak, computed as Streamline does (this
    replaces item 28's per-step table).
52. **Beans and grinders (test).** Beans and grinders can be listed, added (name and roaster
    typed), edited and archived through `/api/v1/beans` and `/api/v1/grinders`; a picked bean
    and grinder setting are in the workflow's `context` and in the next shot's record; the
    history filtered by a bean shows only its entries.
53. **Settings, the rest (test).** The skin switch lists the installed skins and switches after
    a confirm; the display options apply; the Bengle pages are not shown on a DE1; the manual
    opens; feedback is sent with `POST /api/v1/feedback`; a firmware file uploads behind a
    confirm with its progress (the mocked gateway).
54. **Camera (founder; dropped in P2 and 3.17, Z19: the camera test page is gone, 3.13 item 5, and the bag is no longer read; the photo is item 117).** The hand-over's camera test page, opened on the tablet, says whether
    the skin can take a photo; if it can, a bean added from a photo of its bag has the photo and
    pre-filled name and roaster that can be corrected.
55. **Hand-over (founder).** The 0.4.0 ZIP installs on the tablet; the checks of
    [install.md](install.md) still open are asked again with the new ones.

The founder's review of 2026-10-20 (3.10); items marked (test) are tests, (founder) the founder's.
Where an item here and one of 27-55 disagree, the item here wins (3.10 overrides 3.9):

56. **Two sleeps (test).** Home's menu has 'Machine sleep' and 'Machine and app sleep' with no
    line under either. 'Machine sleep' sends `sleeping`; while the machine sleeps no Asleep
    screen is shown, the brightness is not set, and the menu offers 'Wake machine', which asks
    for `idle`. 'Machine and app sleep' sends `sleeping` and shows the Asleep screen, with the
    brightness 5 where `platformSupported.brightness`; a touch wakes the machine. Neither
    changes Decaid's `keepAwake` or wake lock (this replaces item 39). A sleep the skin did not
    ask for shows the Asleep screen.
57. **Two sleeps on the tablet (founder).** 'Machine sleep' leaves the skin on screen with the
    machine asleep, and 'Wake machine' or the machine's button wakes it; 'Machine and app sleep'
    shows the black Asleep screen, and a touch wakes the machine.
58. **Ring on every screen (test).** While hot water or flush runs (the mocked gateway), the
    steam page, both editors, the picker, the settings page and the beans screen show the small
    ring at the bottom of the left column with the time, its box overlaps no other button, and a
    tap on it sends the stop; home and the hot water page show their large ring as before; with
    the run over no ring is shown.
59. **Picker graph (test).** In the picker's preview a 0 s step adds no width; default-dark's
    pour starts at 2 ml/s and ends at 1 ml/s, where the A-Flow editor's line ends, and a flow-up
    default's pour starts at its pour flow; the 9 bar pressure limit of default-dark's Pouring
    step is drawn as a dotted pressure line across that step; a step without a limit draws none.
60. **Picker delete (test).** A swipe from right to left on a stored profile's row shows
    'delete'; a tap on it sends `DELETE /api/v1/profiles/{id}` and the profile is no longer
    listed; the rows of the skin's five defaults and of the loaded profile do not show 'delete';
    a vertical drag on the list still scrolls it and a tap on a row still selects it.
61. **Picker delete on the tablet (founder).** Swiping a row to the left with a finger shows
    'delete', and the deleted profile is gone from the picker.
62. **Overlay frame (test).** After a shot the per-phase table's frame has the same corner
    radius as the graph's (computed `border-radius` and `border-collapse: separate`).
63. **Shot values off (test).** With the setting 'Shot values' off, the overlay shows no
    per-phase table after a shot and the live values stay; it is on by default.
64. **Editor swipe (test).** In the A-Flow editor and in the step editor, a swipe from left to
    right that starts off the graph and the cards returns to home; with changed values it loads
    them once (one `PUT /api/v1/workflow`), as 'back' does, and without changes it loads
    nothing; a drag on the A-Flow graph moves its line and not the editor; a drag to the left
    stays in the editor.
65. **Editor swipe on the tablet (founder).** A swipe to the right in the editor goes home as
    home's swipes move between pages, and the edited values are on the machine afterwards.
66. **Hand-over (founder).** The 0.4.0 ZIP carries 3.10 with 3.9; the checks of
    [install.md](install.md) for items 56-65 are asked with item 55's.
67. **One home (test).** A shot starts on home without any overlay: the graph's frame keeps its
    width, the right column shows time, weight, pressure, flow and temperature and **stop**; after
    the shot the graph stays with the phase table and the column's values, the stop button gone,
    and no 'dismiss' or 'tap to close' is shown; the next shot replaces it; a recalled history
    entry shows its caption and 'dismiss'; hot water and flush still show the water view.
68. **Pickers in the column (test).** Home's header holds the state line and the menu button only;
    the profile button (with its pen) and the bean button are at the top of the right column while
    idle and after a shot, and open the profile picker, the editor and the bean pick as before;
    while a shot runs they are not in the DOM and the stop button keeps the overlay's size; the
    state line's scale text is not cut at 1280 x 800 with a long profile name and bean.
69. **One header (test).** On home, steam and hot water the state line starts at the same x
    position with the same values; steam and hot water show their title at the right end, home
    shows the menu button there.
70. **No tabs (test).** Home has no edge tabs; a swipe reaches steam, hot water and the history
    as in acceptance 32; the page dots show the current page and a tap on one moves to its page;
    the history's handle opens the history. Acceptance 36's tabs are replaced by this.
71. **Home on the tablet (founder).** Home reads as one screen across a shot, nothing jumps at
    its start, the header is not full, and the dots and the handle are found without being told.
72. **Date picker (test).** The bean form's roast date is a button, not a native date input;
    it opens the skin's own picker (the number pad's backdrop and radius); a tap on a day sets
    the ISO date and closes it, 'clear' leaves no roast date, 'cancel' changes nothing, the month
    arrows and the year step work, and the stored `roastDate` has the shape it had.
73. **Hot water state line (test).** On the hot water page the state line says 'Heating' for an
    idle machine under its target, 'Hot water' while it pours, and 'Idle' once it is heated and
    idle, the same words as home's for the same frames.
74. **Stop at volume (test).** On the hot water page with no scale the row reads 'stop at volume'
    in ml; with a connected scale 'stop at weight' in g; the value written is the same field in
    both; the ratio chips are not offered when the last shot has no weight.
75. **Sleep after use (test, rig).** With `sleepTimeoutMinutes` at 1 and presence on, a machine
    whose skin is touched every 30 s for three minutes does not sleep and `heartbeat`'s `timeout`
    returns to 60 after each touch; left alone it sleeps after the minute; the skin sends at most
    one `POST /api/v1/machine/heartbeat` every 30 s, none while the machine sleeps, and ignores a
    failed one. The skin never writes the setting's value.
76. **Steam clock (test).** Fed the frames of the export's steam record of 2026-10-21 07:51
    (timer 24 s), the run starts at the first `pouring` frame, its last point is the last frame at
    0.5 ml/s or more (about 24.5 s), 'last steam' shows that, the countdown reaches 0 within half
    a second of the flow ending and not before; a record without `preparingForShot` starts at its
    first steam frame; a run whose machine leaves `steam` before the flow falls ends there.
77. **Steam clock on the tablet (founder).** The countdown reaches 0 as the steam stops, the
    graph shows no ramp before it and no tail after it, and 'last steam' is about the timer.
78. **Rings everywhere (test).** For each of home, steam, hot water, profiles, the A-Flow
    editor, the step editor, settings, beans and the history over home, a flush shows a ring that
    stops it by a tap, and a hot water pour shows one, large where 3.6 says and small elsewhere;
    the ring goes when the run ends.
79. **Hand-over (founder).** The 0.5.0 ZIP carries 3.11 and 3.12; the checks of
    [install.md](install.md) for items 67-78, 88-91 and 92-100 are asked with the open ones.

80. **Licence files (test).** `LICENSE` is the GPL-3.0 text, `package.json`, `manifest.json`,
    README and `NOTICE` name the same licence, every ported file's header names its origin and
    Streamline's licence as `LICENSE` of its tag states it, and `NOTICE` names D-Flow.
81. **Publish check (test).** `scripts/publish-check.mjs` passes on the product repository and
    fails on a planted Windows path, e-mail address, foreign MAC address and the messenger's name; the
    product repository holds no `stint/`, `.claude/`, `stint.toml`, review note or founder's
    export; `git log --format='%ae%n%ce'` of its whole history shows the noreply address
    only, and no commit message names a chat message or a token budget.
82. **The public ZIP (test).** `npm run zip` writes `index.html`, `manifest.json` and the
    assets only (no `camera.html`, no source map), under 200 kB, and its `manifest.json` names the
    public repository.
83. **User documentation (test).** Every link and image of `docs/user/` and README resolves
    (`scripts/docs-check.mjs`); `npm run screenshots` runs on the mock gateway and writes every
    image the pages use (eight at most); each page names the version it was checked against and
    there are three pages.
84. **User documentation on the tablet (founder).** The founder reads `install.md`,
    `guide.md` and `troubleshooting.md` with the skin in front of them and marks every line
    that is wrong, missing or unclear, and every line that says what Decent already documents.
85. **A new user (founder).** A person who has not seen the skin installs the ZIP in Decaid and
    pulls a first shot with the documentation alone, and says what stopped them.
86. **Two repositories (test and founder).** From the team repository, with the product
    checkout beside it, the runner, the plan prompt and the roadmap check run as they did in
    one (a day plan task starts in the product tree and its commit lands there); the team
    repository's history still holds every file it held before.
87. **Release (founder).** The GitHub release's ZIP installs in Decaid by its URL, and by
    download, on the tablet; the CI of the tagged commit is green.

88. **Steam header (test).** With the steam heater off, the steam page's header holds the **Steam on**
    button (a tap sends the request and the heater state follows) and no sentence block is in the
    right column; the steam timer is at the same position with the heater on and off.
89. **State words (test).** For an idle machine: home and the hot water page say 'Heating' while
    the group temperature is more than 3 °C under its target and 'Idle' from there; the steam page
    says 'Heating' while the steam is more than 3 °C under `targetSteamTemp`, 'Idle' from there
    (also above target + 3 °C), and 'Off' when `targetSteamTemp` is 0 (steam at 32 °C, as in the
    screenshot); a value at the border does not flip the word within 1 °C; while the machine runs,
    sleeps or steams the word is its own state.
90. **Temperature filter (test).** `smooth` of a series of frames at 4 per second with a noise of
    0.3 °C stays within 0.1 °C of the mean after 3 s, follows a step of 10 °C within 5 s, restarts
    on a 4 s gap and on a jump of more than 5 °C; the state line shows the group to one decimal and
    the steam as a whole number and does not change more than once a second on a steady
    machine; the graph's data are the raw frames.

91. **Steam flow (test).** The steam graph draws a blue flow curve with the pressure and the
    temperature from the first `pouring` frame to the end of the run, on the scale of 0 to 4 with the
    unit line 'bar ml/s'; the legend names flow, pressure and temperature when `showGraphLegend` is
    on; fed the 2026-10-21 record, the flow's last point is at about 24.5 s and the curve is not
    drawn before the first `pouring` frame.

92. **Bean photo reading (test; dropped in 3.17, Z19: the bag is no longer read).** `bagText` fed the recorded lines of the founder's bag (the
    probe's output, fixture) gives the roaster 'aniko' and the name 'Tropic Candy'; a line that
    matches a roaster of the catalogue within the edit distance is the roaster; a line of
    'Coffee Roasters' alone is dropped and the line above it is the roaster; a line such as '2 ame'
    gives no name; the form shows up to six lines as chips and a tap puts one into the focused
    field; the photo is read twice, normal and inverted, and the better lines are kept.
93. **Corner menu (test).** On home, hot water and steam the menu button is at the same position
    (top left, 56 px square) and opens the same menu; no left column or back arrow is on those three
    pages; the state line starts at the same x on all three; the editors, settings, beans and picker show no left column or back arrow
    either; a swipe from left to right leaves each of them for where it was opened from, and on the
    hot water page a swipe from right to left goes home; a swipe that starts on a slider or a row
    swipe does not leave.
94. **No strip, the step in the header (test).** No element of the strip is rendered on home; the
    graph's height grows by its height; during a shot the header shows the step's name to the right of the scale's weight and follows the step,
    the state word stays 'Espresso', and nothing is shown for hot water, flush or steam; a finished shot's right column reads 'time, finished' with its
    time and weight, the state line 'Idle'; the right column starts at the page's top.
95. **Type roles (test).** On the mock gateway the profile button and the bean button have equal
    computed `font-size` and `font-weight`, and so do the rows of the profile, bean and grinder
    lists; no `.svelte` file outside the graph's SVG has a literal `font-size`
    (a lint check on the files).
96. **Unit line (test).** The graph's unit line reads 'bar · ml/s' (steam) and 'bar · ml/s · g/s'
    (shot with a scale), one dot between every two labels and none for one.
97. **Tank (test).** `tankMl` gives 0, 537, 1104, 1808 and 2058 ml for 0, 20, 40, 60 and 69 mm,
    1130 ml for 41.8 mm after the interpolation rounded to 10, 2058 over 69 mm; the state line says
    ml by default and mm when the setting says so; the warning compares millimetres.
98. **Ring frame (test).** While a flush runs, every screen (home, steam, hot water, an editor, the
    settings, beans, the picker, the history) shows the one large ring over its main frame with the
    stop button in it and the header and right column visible; no small ring and no `SmallRing`
    exist; the frame's content is back when the run ends.
99. **The review on the tablet (founder).** The founder looks at home, steam and hot water in the
    next hand-over (H5) and at the bean photo with two or three bags, and marks what is wrong.
100. **Fixed weight (test).** `settleWeight` fed a shot that ended at t, the readings 18.0 at
     t+3 s, 36.4 at t+9 s, then 52.0 at t+20 s and 640 at t+40 s: the finished shot's weight is
     36.4 and stays; the weight read after hot water starts does not change it either; a new
     shot starts from its own readings; a recalled entry shows its own weight and dismissing it
     brings back 36.4.

101. **Turn-on chip lane (test).** With pressurize, with fill, and with both collapsed, and with
     infuse's 'infuse to' chip shown, no two chips of the editor's graph overlap (their boxes are
     disjoint) at 1280 and at 600 px; the '+ pressurize' chip is in the phase-name row and a tap
     on it turns the step on with 5 s.

102. **Menu lines (test).** The home menu's 'Beans and grinders' and 'Clean' entries have no
     second line; the steam entry has its line in all three states.
103. **Months by finger (test).** In the date picker, a vertical drag of one grid height up shows
     the next month, down the previous one; a drag of 10 px on a day does not pick it, a tap does;
     the buttons still work; the year rolls over in December and January.

104. **The founder's bag photos (test, probe; dropped in 3.17, Z19).** `bagText` fed the recorded lines of the four
     photos in `docs/product/bags/` gives maldaner / Elisabeth, maldaner / Abdul, aniko / Feel
     The Sun, aniko / Honey Dream; 'KAFFEEHAUS ESPRESSO', 'OMNI ROAST' and the tasting lines are
     neither roaster nor name; for the turned bag the upright reading gives no roaster of the
     catalogue and the turned ones do, and the 90-degree pass is kept; the recorded lines come
     from `scripts/ocr-probe.mjs`, not from a hand.

105. **The cut (test, founder).** In the clone: `scripts/publish-check.mjs --history` passes over
     every revision; no commit has the personal address; the eight messages of
     3.15 step 6 are rewritten and the founder has read them; the tags `v0.1.0` to `v0.6.0` are
     on the commits that raised the version; `.git-blame-ignore-revs` lists only hashes that
     exist; the ZIP built in the clone has the same files, byte for byte, as the one built in the
     team repository at the same commit, except `camera.html`; `docs/product/` is not there.
106. **Both repositories work together (test).** With `stint.toml` pointing at the product
     checkout, the runner, the plan prompt and the roadmap check run; `roadmap.json` and the
     day records are written in the team repository, the code in the product repository.
107. **Release script, pure parts (test).** Fed commits with trailers: `added` gives a minor
     bump, `fixed` only a patch, all `internal` 'nothing to release', `Breaking: yes` stops and
     asks, a commit with no `Changelog:` trailer stops and is named, `.release-notes.json`
     resolves it; a `package.json` ahead of the last tag is kept; the CHANGELOG section is
     grouped Added, Changed, Fixed with the `Task` refs.
108. **Release script, run (test).** In a temporary repository with a bare 'origin', `--dry-run`
     changes nothing; `--local` writes the three versions equal, the CHANGELOG section, the ZIP
     and `SHA256SUMS.txt`, one commit and one tag, and pushes nothing; a failing check or a
     missing rig stops before any file is written; without the second yes nothing is pushed.
109. **First release (founder).** `npm run release` for 0.7.0 on the product repository: the
     founder reads the entries and the version and answers both yes, and the draft release
     holds the ZIP and the SHA-256 that the script checked by downloading (3.15 step 7); `gh`
     is installed and logged in by the founder first.

110. **The picker's graph keeps its size (test, Z13).** Mocked gateway, 1280 x 800: the graph
     box has the same width and height for a profile with no description, with a long one (80's
     Espresso) and with an A-Flow default, the **load** button and the title row do not move, the
     long description scrolls inside its own field (its scroll height over its client height,
     the panel's not), and paging through ten profiles by tap leaves the box's top at one value.
111. **The shot model and its fit (test and script, Z14).** `scripts/shot-model-fit.mjs` run on
     the export of 2026-10-21 writes `src/steps/puck.ts` and the fixture; on the held-out
     profiles the flow and pressure errors are at least 40 percent below the targets' and the
     length of the shot is within 20 percent for four shots in five (the numbers in
     `docs/research.md`); unit tests of `predictShot`: a flow step's pressure is capped by its
     limiter, an exit ends its step before its `seconds`, the model never gives a negative or
     non-finite value for any of the 73 bundled profiles, the five A-Flow defaults and the
     fixture's profiles, and its answer is the same twice.
112. **The estimate in the picker (test, Z15).** The picker's graph draws the model's three
     curves with the targets dotted under them and the caption line; a profile with no steps
     draws nothing and no error; the editor's curve is unchanged (the existing editor tests
     pass). Rig: the picker for the rig's 75 profiles draws without a console error.
113. **The generated description (test, Z16).** `describeAFlow` is pinned for the five defaults
     and for six hand-made parameter sets (no infuse, no 2nd fill, flow down, no stop weight,
     a temperature of its own, an infuse weight); for every A-Flow profile of the export that
     `readSteps` reads it is non-empty, has no `undefined`, `NaN` or `null`, and is under 450
     characters; the picker shows the user's own notes first and the generated text after, and
     only the generated text where the notes are the stock sentence or empty.
114. **The picker on the tablet (founder).** The founder pages through the list and sees the
     graph stay put, reads the estimate of three profiles he knows against his shots of them
     and says whether it gives the idea (a 'no' goes back into the model's fit, not into the
     picture), and reads the generated text of three A-Flow profiles.

115. **The swipe back, whole screen (test, Z17).** `onControl` is false for a box with `overflow-y:
     auto` whose `scrollWidth` equals its `clientWidth`, true for one that overflows sideways. Mocked
     gateway, 1280 x 800, a swipe to the right goes back from: the settings page's category column
     and its content; the picker's detail panel and a swipe from its left edge over a row; the
     beans page's list, its form and the left column; the A-Flow editor's header, cards and
     step row, from its left edge over the graph and from the graph's empty space (points more than
     1.8 rem from every line and 1.4 rem from every border); a drag that starts on a level line, a
     border or a chip moves the value, not the page; home keeps its history swipe.
116. **The tank unit in Quick Adjustments (test, Z18).** 'Tank unit' is listed under Quick
     Adjustments > Water Tank and no longer under Skin > Display; choosing mm changes the state line
     as before; the stored setting and the KV backup keep their key; the settings search finds it
     in the new place.
117. **No photo reading (test, Z19).** `package.json` has no `tesseract` entry and the ZIP no
     `ocr/` entry; `npm run zip` writes a ZIP under 1 MB; the bean form's Photo, Capture, Take a
     picture, New photo and Remove photo work as before (the camera specs pass) and show no
     progress line, Cancel or chips; photos stored under `bean-photo-<id>` are still shown;
     `publish-check` and the licence check pass; no file under `src/` or `scripts/` names
     Tesseract or `ocr`.
118. **Rename (test, Z20).** A move of a stored profile's row to the right shows **rename** and not
     a default's; the dialog starts with the title; Rename sends `PUT /api/v1/profiles/{id}` with the
     new title and no `metadata`, the id is the same, the list shows the new name in its sorted
     place, selected; an empty title, a title of another profile and an unchanged title send
     nothing (the first two say why); the loaded profile renamed is loaded again under the new
     name and shows 'loaded'; Decaid's refusal shows in the error line and keeps the old name; a
     vertical drag on the row still scrolls; the swipe from the edge still goes back. Rig: a rename of
     a stored profile and its read-back, then purged.
119. **Edit beside load (test, Z21).** The detail panel has `edit` and `load` side by side, equal
     width and height, in the place of the old button; the box of the graph and the description do
     not move between profiles; Edit loads the selected profile and opens the A-Flow editor on an
     A-Flow 3.0 one and the step editor on another; unsaved edits are asked about first; a
     default opens too; both are off with nothing selected.
120. **The review on the tablet (founder, H6).** The founder swipes back on the four screens he
     named, renames a profile and sees it loaded again, opens the editor with the new button, finds
     the tank unit under Water Tank, takes a bean photo without the reading, and sees the target in
     the hot water ring and the smaller state word.
121. **The target in the ring (test, Z22).** `waterValues` gives 'target 50 g' with a scale and
     'target 50 ml' without one for a hot water run whose target is 50, nothing for a flush and
     nothing for a target of 0; the mock gateway's hot water ring shows the line inside its frame,
     the other values stay where they were.
122. **The state word and the page header (test, Z23).** The state word's and the page header's
     computed `font-size` and `font-weight` equal those of home's profile name; their values keep
     the value size; no new size or token is added; `npm run type-sizes` lists no text off the scale.
123. **Steam chips mid-steam (test, Z24).** While steam runs a tap on an adjust chip writes the
     steam timer by the change the tap makes to the selection (none to chip, chip to chip,
     chip to none); 'steam left' follows; with no steam running a tap writes nothing, as in 3.7.
     The answer of the rig and the machine to a timer written mid-steam is in the commit.
124. **Pouring (test, Z25).** The state line says 'Pouring' while the machine is in the
     state espresso, on the mock gateway and in the unit test of `stateLabel`.
125. **The home column holds still (test, Z25).** The profile and bean buttons are in home's
     right column before, during and after a shot, disabled during it; the time, the weight and
     the stop button keep their place from the idle screen to the running one.
126. **Words (test, Z29).** No `<button>` text in a `.svelte` file outside the corner menu starts
     with a capital letter; the e2e texts use the lower case words.
127. **Warning, danger, disabled (test, Z30).** `--warn` is #ff8a3d; the picker's delete dialog
     marks 'delete' as danger (outline, not filled), as 'discard and load' and 'delete step'; a
     disabled 'set', 'save' (bean, grinder) and 'set timer' have one look; `.tag.loaded` is the accent
     colour.
128. **Weight display (test, Z31).** `gramsOf` gives '0.0 g' for -0.1, -0.05, 0 and 0.1, '0.1 g' for
     0.11, '-0.2 g' for -0.2 and '-0.6 g' for -0.6; the header, the steam and hot water pages, the
     ring and home use it (no `toFixed` on a scale weight outside it).
129. **Picker (test, Z32).** On opening, the loaded profile is selected and in view and its detail is
     shown; a description longer than its box has the accent lower border until scrolled to its end,
     a short one never has it.
130. **Selected look (test, Z33).** The selected chip, mode and tab have the white fill; the
     selected row of the picker, the lists and the bean pick has the white outline; history's 'all'
     has the chip look.
131. **Steam and hot water rows (test, Z34).** The three steam rows end on one right edge with
     their units in one column; the scale row is a button of at least 3.5 rem, off while steam runs,
     on while idle, with no 'tap to tare' text; the hot water page has the same row, off while water
     runs; without a scale the steam page shows the one 'no scale' line and 'set timer' says it
     needs the scale; the header's elapsed time is not shown while steam runs and is after.
132. **Home names (test, Z35).** Each of the profile and bean buttons has a name line and a caption
     line; with the long names of the review neither overflows the column, at 1280 x 800 and at the
     largest display size; the stop button stays in view during a shot.
133. **Touch (test, Z36).** Every `button` on the mock gateway's screens is at least 3 rem on its
     short side, the history handle excepted.
134. **Settings, titles, menu (test, Z37).** The adjust fields read '−8 s', '−4 s', '+5 s'; the page
     titles 'Settings' and 'Beans and grinders' have the name role's size and weight; the menu says
     'Steam heater' with 'on' or 'off' and a tap switches.
135. **Grinder step (test, Z38).** The grinder form's 'step' is a row with a value chip, its - and +
     change it, and it is not beside the choice of the two modes.
136. **Editor captions (test, Z39).** In the detail view the fill and flow columns have a caption
     with `fillTime` and `pourTime`; the simple view has none; a narrow or off phase has none.
137. **History (test, Z40).** The three filter chips have one size; the time and weight line is
     there if and only if the summary has them (the check's answer is in the commit).
138. **Spacing (test, Z41).** `scripts/spacing.mjs` finds no `gap` outside the four tokens; the
     founder has the before and after pictures of every screen.
139. **Two ZIPs (test, Z42).** `npm run zip` writes `<id>-<version>.zip` and
     `<id>-<version>-ocr.zip`; the base ZIP has no `ocr/` folder, no `.onnx` or `.wasm` file and no
     `paddleocr` or `onnxruntime` string in its scripts and is under 1 MB; the ocr ZIP has the models
     and the WASM and is under 16 MB; both manifests have the same id and version; a fixture tree
     with a wrong content fails the check; the models' SHA-256 are checked before the ocr build.
140. **Release with two ZIPs (test, Z42).** The release script's dry run lists both files and both
     SHA-256 lines in `SHA256SUMS.txt`; `publish-check` and the licence check pass on both flavours;
     `NOTICE` names the reading's licences in the ocr ZIP only.
141. **The reading (test, Z43).** In the ocr flavour the four bags' photos give the roaster and the
     name of the research (chips and the two rules, three of four by themselves, the fourth by a
     tap); the base flavour's bean form has no chips, no progress line and no Cancel; the reading
     makes no network request (the e2e fails on any request outside the skin's origin and Decaid).
142. **The reading on the tablet (founder, H7).** The founder reads his own bags with the ocr ZIP on
     the tablet, says how long it takes and what it got wrong, and which ZIP the public release carries.
143. **The CI's browser tests (test, Z44).** The `e2e` job is green on `main` in two runs in a row; a
     failing test uploads its trace and error context (the artifact has files); no test has a retry,
     a skip or a loosened check without a reason in its comment; the local `npm run e2e` is green.

## 6. Constraints
- **Budget:** one Claude Pro plan. This product may use all of it up to 90% of the weekly
  limit; the team plans by capacity.
- **Needs the founder's approval:** anything that costs money, every push to GitHub, making
  the repository public, and any change to sections 3 and 5 of this spec.
- **External services:** GitHub (the repository), Decaid's local gateway, and Gemini for
  Stint's daily blog phase, which publishes a post (allowed by the founder, 2026-10-11). No
  others.
- **Needs the founder's hands:** the real DE1, the Android tablet (installing the ZIP), and
  the GitHub account.
- Tests run without a machine. Anything that needs the real DE1 is a founder task, asked for
  through the owner channel, batched, never a blocker for the rest of the day.
- New external services need founder approval; free open-source packages without registration
  do not.

## 7. First roadmap (by capacity, not dates)
The data form is `stint/roadmap.json`. D1 (research) is done: [research.md](research.md).
The weeks are a capacity guess on one Pro plan.

| Week | Ref | Milestone | Needs |
|---|---|---|---|
| 1 (Oct 11-18) | D2 | repo scaffold: TypeScript + Vite, stack decision (Svelte or none), Vitest, a script that builds the ZIP | - |
| 1 | D2b | test rig: prebuilt Decaid on Windows with device simulation; confirms a full simulated shot, the steam-timer field and the `ShotRecord` schema | - |
| 1 | D3 | A-Flow 3.0 generator + fixture and regression tests | D2 |
| 1 | D4 | API client + snapshot streams with reconnect | D2 |
| 2 (Oct 19-25) | D5 | editor prototype, both modes, on fixture data, for founder review | D2, D3 |
| 2 | D6 | home, profile picker and espresso screen + live graph | D4, D5 |
| 2 | D7 | A-Flow editor with live curve, wired to the generator and the machine | D3, D5 |
| 3 (Oct 26-Nov 1) | D8a | steam page with the timer from milk weight | D6 |
| 3 | D8b | shot history overlay: list, graph, restore profile, beans and grinder setting | D6 |
| 3 | D8c | scale, settings, sleep / wake | D6 |
| 3 | D9 | local ZIP + install on the tablet; profile check on the real machine | D7, D8a-c, founder |
| 1 (Oct 16-18) | V1 | version 1.1: water view for hot water and flush (3.6) | D9 |
| 1 | E1 | version 1.1: read Streamline's editor and write the port plan into research.md (files, data model, save path, what maps to which Svelte component) | D9 |
| 1 | E2 | version 1.1: step editor for non-A-Flow profiles: step cards, add, delete, move, save | E1 |
| 2 (Oct 19-25) | E3 | version 1.1: the step editor's curve preview and profile settings | E2 |
| 1 | F1 | version 1.1: steam mug midpoints, maximum flow setting, default dose, reconnect retry for 30 s | D9 |
| 1 | M1 | version 1.1: rig check of `metadata` (`PUT`, profile export, data export and import) | D9 |
| 2 | M2 | version 1.1: A-Flow values in `metadata`, moving old profiles from `notes`; the time-0 fallback only if M1 fails | M1 |
| 2 | E4 | version 1.1: the step editor's SCRIPT tab | E2 |
| 1 (Oct 17-18) | R1 | review 2026-10-16: steam page (graph and time bugs, timer in the centre, countdown, adjust buttons, tare button, 140-170 °C, right-edge swipe) (3.7) | D9 |
| 1 | R2 | review: remove the scale page; tare by a tap on the weight | D9 |
| 1 | R3 | review: water view without the group head, values in the stop button | V1 |
| 1 | A1 | review: A-Flow editor detail mode ("end flow", split last flow line, no buttons above the graph) | D9 |
| 1 | A2 | review: A-Flow editor infuse drawn by weight, drag the infuse-to weight, collapse a phase at 0 s with a re-enable button | A1 |
| 2 (Oct 19-25) | R4 | review: home menu shortcuts steam off and machine off (rig check of the requests first) | R2 |
| 2 | R5 | review: hot water page with stop at weight, ratio favourites and tare, opened from the split steam tab | R3 |
| 2 | S1 | review: read Streamline's settings page, write the port plan into research.md | D9 |
| 2 | S2a | review: the settings page ported from Streamline: the page, its fields and the Skin category (research.md 20.10) | S1, R1, R2, R5 |
| 2 | S2b | review: settings port, connections, maintenance, machine information | S2a |
| 2 | S2c | review: settings port, plugins, presence, firmware status, sensor calibration | S2b |
| 3 (Oct 26-Nov 1) | E5 | review, low priority: step editor cards without arrows, the selected card centred | E2 |
| 3 | E6 | review, low priority: SCRIPT as in Streamline, toggles and value pickers instead of text | E4 |
| 2 | H1 | review: hand-over ZIP, install.md with the new checks and the open ones of 2026-10-16 | R1-R5, S2a-S2c, A2 |
| 2 (Oct 19-25) | T1 | review 2026-10-17: espresso graph to 10 bar (12 above), no tail after the shot, time axis from the expected duration (3.8) | D6 |
| 2 | T2 | review 2026-10-17: the shot as an overlay over home that stays after the shot, per-phase values (3.8) | T1 |
| 2 | T3 | review 2026-10-17: heating state on home and steam, thinner tabs with larger labels, one type scale (3.8) | R2, R4 |
| 2 | T4 | review 2026-10-17: profile picker filter, description and preview, a load button (3.8) | D6 |
| 2 | T5 | review 2026-10-17: A-Flow defaults kept in the skin, no 'not in Decaid' offer (3.8) | T4 |
| 2 | T6 | review 2026-10-17: swipe between hot water, home and steam with a slide (3.8) | R1, R5 |
| 2 | T7 | review 2026-10-17: A-Flow editor steps panel without 'shot stops at', save feedback in the status line under the start row (3.8, as 3.9 item 8 changes it) | A2 |
| 2 | T8 | review 2026-10-17: shot history, newest 20 first, shots kept in memory (3.8) | D8b |
| 2 | T9 | review 2026-10-17: menu shortcut clean (water level, drip tray); no exit, replaced by 3.9 items 1 and 2 (U1, U4) (3.8, 3.9) | S2b, R4 |
| 2 | H2 | review 2026-10-17: hand-over ZIP 0.3.0, install.md with the new checks and the open ones | T1-T9 |
| 2 (Oct 19-25) | U1 | review 2026-10-18: the bugs: machine sleep label, scale reconnect, the keyboard over the app, hot water flow to 8 ml/s (3.9 items 1, 3, 10, 16) | R4 |
| 2 | U2 | review 2026-10-18: every A-Flow profile opens in the A-Flow 3.0 editor, read from the plugin's steps, converted on save (3.9 items 4, 5) | T5 |
| 2 | U3 | review 2026-10-18: hot water rows with sliders and the ring while it pours, no state dot, smaller flush ring, steam heater off message (3.9 items 11-14, 18) | U1, T6 |
| 2 | U4 | review 2026-10-18: menu entry machine and app sleep, in place of T9's exit (3.9 item 2) | U1, T9 |
| 2 | U5 | review 2026-10-18: A-Flow editor status line under the start row, more space between the profile buttons (3.9 items 8, 9) | T7 |
| 2 | U6 | review 2026-10-18: step editor: 0 s steps not drawn, SCRIPT offers off for exit, limit and maximum (3.9 items 7, 17) | E6 |
| 2 | U7 | review 2026-10-18: settings button importing all old A-Flow profiles to 3.0 (3.9 item 6) | U2, S2a |
| 3 (Oct 26-Nov 1) | U8 | review 2026-10-18: read Streamline's bean and grinder pages, write the port plan into research.md (3.9 item 19) | D8b |
| 3 | U9 | review 2026-10-18: bean and grinder catalogue (list, add, edit, archive) and the pick for the next shot (3.9 item 19) | U8 |
| 3 | U10 | review 2026-10-18: the history filtered by bean and grinder, its entries with the catalogue's beans (3.9 item 19) | U9, T8 |
| 3 | U11 | review 2026-10-18, low priority: settings: Streamline's skin switch and display options (3.9 item 15) | U2-U7, U10 |
| 3 | U12 | review 2026-10-18, low priority: settings: Bengle pages, manual, feedback, firmware upload from a file (3.9 item 15) | U11 |
| 3 | H3 | review 2026-10-18 and 2026-10-20: hand-over ZIP 0.4.0 (still a minor bump), carrying 3.10 too since the founder is testing now; install.md with the new checks, the open ones and the camera test page | U1-U12, W1-W6, H2 |
| 3 | U13 | review 2026-10-18, low priority: a bean from a photo of its bag, Tesseract.js pre-fills name and roaster; only if the founder's camera check passes (3.9 item 20) | U9, founder |
| 3 (Oct 26-Nov 1) | W1 | review 2026-10-20: menu 'Machine sleep' keeps the app awake, 'Machine and app sleep' shows the Asleep screen, no explanation lines; U4's brightness 0 and wake lock release go (3.10 'Home menu: two sleeps') | U4 |
| 3 | W2 | review 2026-10-20: the hot water / flush countdown ring on every screen, small in the left column (3.10 'Countdown ring on every screen') | U3 |
| 3 | W3 | review 2026-10-20: picker graph: 0 s steps hidden, step limits drawn, the pour starting from Ramp Up's exit and drawn as far as the editor's (3.10 'Profile picker: graphs') | T4, U6 |
| 3 | W4 | review 2026-10-20: picker: swipe a row left for delete, `DELETE /api/v1/profiles/{id}`; not the skin's defaults nor the loaded profile (3.10 'Profile picker: delete a profile') | T4, T5 |
| 3 | W5 | review 2026-10-20: shot overlay's table with rounded corners, setting 'Shot values' (3.10 'Shot overlay: rounded frame, values off') | T2 |
| 3 | W6 | review 2026-10-20: a swipe to the right in the editor goes home through the leaving rules (3.10 'Profile editor: swipe back to home') | T6 |
| 3 | X1 | review 2026-10-21: home and the shot overlay become one screen, the fixed right column, the finished shot stays until the next (3.11 'Home and the shot overlay become one screen') | T2, W5 |
| 3 | X2 | review 2026-10-21: the profile and bean buttons move to the right column, the header keeps the state line and the menu (3.11 'Profile and bean pick in the right column') | X1 |
| 3 | X3 | review 2026-10-21: the state line first and the page title at the right end on home, steam and hot water (3.11 'One header on home, steam and hot water') | T3 |
| 3 | X4 | review 2026-10-21: the edge tabs go, page dots and a history handle show the swipes (3.11 'Swipe only: the tabs go') | X1, T6 |
| 3 | Y1 | review 2026-10-22: the bean form's roast date gets a date picker of the skin's own (3.12 'Beans: the date picker') | U9 |
| 3 | Y2 | review 2026-10-22: the hot water page's state line says Heating, Hot water and Idle as home's (3.12 'Hot water: the state line') | T3, U3 |
| 3 | Y3 | review 2026-10-22: hot water 'stop at volume' in ml without a scale (3.12 'Hot water: stop at volume without a scale') | U3 |
| 3 | Y4 | review 2026-10-22: the machine does not sleep after use: find how Decaid decides presence, then send it on a touch (3.12 'Sleep: the machine sleeps after use') | S2c |
| 3 | Y5 | review 2026-10-22: the steam clock, graph and 'last steam' from `pouring` to the end of the flow, tested with the export's steam records (3.12 'Steam: the clock starts and ends with the steam') | R1 |
| 3 | Y6 | review 2026-10-22: the hot water and flush ring on every screen: reproduce it on the rig for every screen and both kinds, fix the cause, one test over the matrix (3.12 'Hot water and flush ring: on every screen') | W2 |
| 3 | Y8 | review 2026-10-22: the steam page's heater-off warning and **Steam on** button move to the header row (3.12 'Steam page: the heater-off warning goes to the header') | U3, X3 |
| 3 | Y9 | review 2026-10-22: idle, heating and off follow the group temperature on home and hot water and the steam heater on the steam page (3.12 'State words') | T3, Y2 |
| 3 | Y10 | review 2026-10-22: the state line's group and steam temperatures filtered, group to one decimal and steam to a whole degree (3.12 'Temperatures: filtered and rounded') | T3 |
| 3 | Y11 | review 2026-10-22: the flow in the steam graph, blue on the scale of pressure, with the legend (3.12 'Steam graph: the flow') | Y5 |
| 3 | H4 | review 2026-10-21 and 2026-10-22: hand-over ZIP 0.5.0 (minor bump), carrying 3.11 and 3.12 and their checks in install.md | X1-X4, Y1-Y6, Y8-Y11, H3 |
| 3 | Z1 | review 2026-10-23: the bean photo's reading: `scripts/ocr-probe.mjs`, recorded lines as fixtures, a known roaster of the catalogue wins, a descriptor line is not the roaster, a stricter name (3.14 item 1) | U13 |
| 3 | Z2 | review 2026-10-23: the photo prepared (grey, contrast, scale) and read normal and inverted, the lines as tap-to-fill chips (3.14 item 1) | Z1 |
| 3 | Z3 | review 2026-10-23: the menu button in the top left corner of home, hot water and steam, no left column on any screen, the way back a swipe (right to left on hot water), the right column to the page's top (3.14 'Home: the top left corner') | X3 |
| 3 | Z4 | review 2026-10-23: the strip above home's graph removed, the step name in the state line during a shot, 'time, finished' in the right column (3.14) | Z3 |
| 3 | Z5 | review 2026-10-23: one size per kind of text: the roles table, literals replaced by tokens, the size listing script, the profile and bean names equal (3.14 item 5) | Z3, Z4 |
| 3 | Z6 | review 2026-10-23: a dot between every two labels of the graph's unit line (3.14 item 6) | |
| 3 | Z7 | review 2026-10-23: the tank in ml by Streamline's mm table, interpolated, setting 'Tank unit' (3.14 item 7) | |
| 3 | Z8 | review 2026-10-23: one large hot water and flush ring on every screen, over its main frame, the small ring removed (3.14 item 8) | Z3 |
| 3 | Z9 | review 2026-10-23: the finished shot's weight settles for 15 s after the shot and is then fixed; it also stops on hot water, flush or steam (3.14 item 9) | |
| 3 | Z10 | review 2026-10-23: the editor's turn-on chip of a collapsed step in its own lane under the axis, no overlap with the weight chips (3.14 item 10) | |
| 3 | Z11 | review 2026-10-23: the home menu without the descriptions of Beans and grinders and Clean; the steam line stays (3.14 item 11) | |
| 3 | Z12 | review 2026-10-23: the date picker scrolls through the months by a vertical finger drag, the buttons stay (3.14 item 12) | |
| 3 | Z13 | review 2026-10-24: the picker's graph has one size for every profile (aspect ratio about 1:1), the description is the buffer under it and scrolls (3.16 item 1) |  |
| 3 | Z14 | review 2026-10-24: the shot model: `scripts/shot-model-fit.mjs` fits flow, pressure and temperature to the export, `predictShot`, the constants and a thinned fixture, the numbers in research.md (3.16 item 2) |  |
| 3 | Z15 | review 2026-10-24: the picker's graph draws the modelled flow, pressure and temperature, the targets dotted, a caption 'estimate' (3.16 item 2) | Z13, Z14 |
| 3 | Z16 | review 2026-10-24: a generated description for A-Flow 3.0 profiles from their values, the user's notes first (3.16 item 3) |  |
| 3 | H5 | review 2026-10-23: hand-over ZIP for 3.14 and 3.16 and their checks in install.md; version 0.6.0 (minor bump) | Z1-Z16 |
| 4 (Nov 2-8) | P1 | publish (3.13): `LICENSE`, `NOTICE`, one licence statement everywhere, D-Flow's and DSx2's credit, Damian's approval in writing (A-Flow's old repository needs no licence); the founder asks Damian | H4 |
| 4 | P2 | publish: the two repositories, in the twelve steps of 3.15: try the team's tools across them first, cut the product repository in a fresh clone (history with the noreply address, no records), turn this one into the team repository, scrub paths in `spec.md` and `research.md`, `scripts/publish-check.mjs`, `camera.html` and the probes; pushing and renaming are the founder's | P1 |
| 4 | P3 | publish: CI and release workflows, `CONTRIBUTING.md`, `CHANGELOG.md`, issue templates, `SECURITY.md`, README as a front page, the name check, `npm audit` and the dependency licences | P2 |
| 4 | P4 | publish: `npm run screenshots`, the eight generated pictures of the user documentation from the mock gateway, and `scripts/docs-check.mjs` | H4 |
| 5 (Nov 9-15) | P5 | publish: the user documentation, three short pages (`install.md`, `guide.md`, `troubleshooting.md`) in `docs/user/`, with the pictures | P4 |
| 5 | P7 | publish (3.15): `scripts/release.mjs` and `npm run release`: the checks, the change history from the tasks' `Task:` and `Changelog:` trailers, the version bump if needed, the ZIP and its SHA-256, the commit and tag, then the GitHub release; `--dry-run` and `--local` (the hand-overs use it); `npm run verify` shared with CI; the work prompt gets the trailers; pushing and publishing are the founder's | P3 |
| 5 | Z44 | the CI's `e2e` job fails on GitHub and says nothing: make the failure readable (artifact with hidden files, reporter), find each failing test's cause (font or time), fix the skin or the test, a green run twice (3.20); the first task of the next working day | P2 |
| 5 | Z17 | review 2026-10-25: the swipe back on the whole screen: `onControl` takes a drag only from a box that really scrolls sideways, the left edge (24 px) always goes back (3.17 item 1) | P2 |
| 5 | Z18 | review 2026-10-25: the tank unit setting moves from Skin > Display to Quick Adjustments > Water Tank (3.17 item 2) | P2 |
| 5 | Z19 | review 2026-10-25: the bean photo's reading dropped, the photo kept: `ocr.ts`, the probe, the `ocr/` folder, the three Tesseract packages, the credits and Z1/Z2's tests removed (3.17 item 3) | P2 |
| 5 | Z20 | review 2026-10-25: rename in the picker: a row moved to the right shows a rename button, a dialog, a `PUT` with the new title, the loaded profile loaded again (3.17 item 5) | Z17 |
| 5 | Z21 | review 2026-10-25: `edit` and `load` side by side in the detail panel; edit loads the profile and opens its editor (3.17 item 6) | Z20 |
| 5 | Z22 | review 2026-10-25: the hot water ring shows the target weight (scale) or volume (no scale) of the pour (3.17 item 4) | P2 |
| 5 | Z23 | review 2026-10-25: the state word and the page header (Steam, Hot water) take the name role's size, 1.1 rem, no new size (3.17 item 7) | P2 |
| 5 | Z24 | review 2026-10-25: while steam runs the adjust chips change the running timer (3.17 item 8) | P2 |
| 5 | Z25 | review 2026-10-25: the state says Pouring, and home keeps the profile and bean buttons while a shot runs (3.17 items 9, 10) | P2 |
| 5 | Z29 | design review 2026-10-27 DR11: one case for button words (3.18 item 1) | P2 |
| 5 | Z30 | DR7, DR8, DR10, DR15: warning colour, danger buttons, disabled main button, loaded tag (3.18 item 2) | Z29 |
| 5 | Z31 | DR2: one weight formatter, 0.0 for -0.1 to 0.1 g (3.18 item 3) | P2 |
| 5 | Z32 | DR14, DR16: the picker opens on the loaded profile, the description's lower border hints at more text (3.18 item 6) | Z30 |
| 5 | Z33 | DR9: one selected look (3.18 item 7) | Z30, Z32 |
| 5 | Z34 | DR1, DR3, DR4, DR25: the scale row of the steam and hot water pages (3.18 item 4) | Z30, Z31 |
| 5 | Z35 | DR5: home's profile and bean buttons, name first (3.18 item 5) | P2 |
| 5 | Z36 | DR12: touch targets of 3 rem (3.18 item 8) | Z34 |
| 5 | Z37 | DR20, DR21, DR26: settings fields, page titles, the menu's steam heater (3.18 item 9) | Z29 |
| 5 | Z38 | DR24: the grinder's step as a value row (3.18 item 10) | Z30 |
| 5 | Z39 | DR18: fill and flow show their time in the editor's detail view (3.18 item 11) | P2 |
| 5 | Z40 | DR22: equal filter chips, time and weight on the history entries if the list has them (3.18 item 12) | Z33 |
| 5 | Z41 | DR13: four spacing tokens and a lint rule, after the local release (3.18 item 13) | H6 |
| 5 | H6 | review 2026-10-25: a local release for the tablet, `npm run release -- --local` (3.15), the founder's checks of 3.17 in install.md; the public release P6 resumes it | Z17-Z25, Z29-Z40, Z44, P7 |
| 5 | P6 | publish: the release 0.7.0: tag, GitHub release with the ZIP and its SHA-256, the URL install checked in Decaid, the founder's cold read and a new user's install (3.13 acceptance 84-87); pushing and announcing are the founder's | P3, P5, P7, H5, H6 |
| 5 | Z42 | the build feature: base and ocr flavours of one source, `npm run zip` writes two ZIPs, the models fetched by hash, the release script, CI and the licence check handle both (3.19 items 1, 2) | P2 |
| 5 | Z43 | the bag's reading in the ocr flavour: PP-OCRv6 tiny through PaddleOCR.js, the field rules, the chips in the bean form (3.19 item 3) | Z42 |
| 5 | H7 | a local release for the tablet with both ZIPs, `npm run release -- --local`, the founder reads his bags (3.19 item 4) | P6, Z42, Z43 |

| 2 (Oct 19-25) | Q1 | code quality review 2026-10-19: Prettier and ESLint, the tree formatted in one commit (in `.git-blame-ignore-revs`), lint errors fixed, both in the check ([review-code-quality-10-19-26.md](review-code-quality-10-19-26.md), steps 1-3) | - |
| 2 | Q2 | code quality review 2026-10-19: split `src/shell/skin.svelte.ts` along its seams; `Skin` stays the one object the screens read ([review-code-quality-10-19-26.md](review-code-quality-10-19-26.md), step 4) | Q1 |
| 2 | Q3 | code quality review 2026-10-19: one `errorMessage` helper in place of the repeated error idiom ([review-code-quality-10-19-26.md](review-code-quality-10-19-26.md), step 5) | Q2 |
| 3 (Oct 26-Nov 1) | Q4 | code quality review 2026-10-19: split `Editor.svelte` and `Graph.svelte` ([review-code-quality-10-19-26.md](review-code-quality-10-19-26.md), step 6) | Q2 |

## 8. Open questions
Answered by the first research task ([research.md](research.md)) and no longer open: Decaid
has prebuilt Windows and Linux releases; the profile v2 enumerations; how Streamline is built;
a shot record carries profile, bean and grinder and the skin writes them back with
`PUT /api/v1/workflow`; the live scale weight is on `/ws/v1/scale/snapshot`.

Answered by the test rig (D2b, research.md section 8), by running Decaid v0.8.8 on Windows:
the prebuilt release's simulation runs a full shot and feeds `/ws/v1/machine/snapshot`; the
steam timer is `steamSettings.duration`, in whole seconds (`stopAtTemperature` is for a milk
probe and does not reach the machine); the `ShotRecord` schema, whose measurements come only
with `GET /api/v1/shots/{id}`; the scale weight is streamed outside a shot too; the values of
all five default A-Flow profiles as Decaid ships them.

Answered by the API client's rig check (D4, research.md section 9): the skin's port (4.1);
a tare during a shot answers 400 `block_tare_during_shot` only with Decaid's setting
`blockTareDuringShot` on; the state for sleep is `sleeping`.

Answered by the founder on 2026-10-12, in the channel and in the review of the editor
prototype ([review-a-flow-editor-10-12-26.md](review-a-flow-editor-10-12-26.md)): the tablet
(3.1); the steam defaults (3.4); the values of detail mode, the ranges, the default profiles
and the points of the first mapping document (3.2, [a-flow-3.0.md](a-flow-3.0.md)). Answered
in D3: Decaid's five default A-Flow profiles equal the plugin's `.tcl` files except for the
Pause step, which has 0 s in the plugin and 15 s in Decaid.

Answered in D6 (research.md section 10), on the rig: Decaid stops a shot at the workflow's
`targetYield` and tares the scale at its start by itself, so the skin does neither; without a
machine the snapshot stream stays open and silent; a page on another origin may call the
gateway.

Answered in D8b (research.md section 14), on the rig: the bean and the grinder setting are
fields of the workflow's `context`, in the workflow and in a shot record; a `null` in a
`PUT /api/v1/workflow` clears one; a shot record holds a copy of the profile and no id.

Answered in D7 (research.md section 11), on the rig: a profile's id is a hash of its steps
and its target weight, not of its title, notes or author; an edit is recorded in Decaid's
lineage by `POST /api/v1/profiles` with `parentId`, and
`GET /api/v1/profiles/{id}/lineage` returns the versions, hidden ones too; a bundled
default's content cannot be changed with `PUT` (400).

Answered in D9 (research.md section 15), on the rig: the ZIP installs in Decaid 0.8.8 on
Windows by URL and is served on port 28881; the REST API has no upload of a ZIP, and a
`file:///` URL fails although `doc/Skins.md` shows one.

Answered in M1 (research.md section 18), on the rig: a profile record's `metadata` holds, as
sent, through `GET`, `PUT` (kept when left out, replaced whole when supplied), a `PUT` that
gives a new id, the hidden versions of the lineage, `/api/v1/profiles/export` and import, and
`/api/v1/data/export` and import; a child posted with `parentId` does not inherit it, and a
`metadata` that is not an object is refused with 500. So M2 takes the `metadata` path of 3.6.

Answered by the founder on 2026-10-13, in the channel: the A-Flow parameters live in the
profile's notes (request 166; moved to the record's `metadata` in version 1.1, 3.6, built in
M2); a profile is loaded with `PUT /api/v1/workflow` (request 167,
3.1); the pause ends at a flow under an editable value (request 169, 3.2); the ghost curve of
the last shot is for version 2 (request 171, 3.3).

Answered on the rig after the founder's steam test of 2026-10-13, 25 s chosen and 30 s of
steam (research.md section 16): the workflow's `steamSettings.duration` is not the machine's
timer. The machine's own value is `targetSteamDuration` on `/ws/v1/machine/shotSettings`;
Decaid writes the workflow's duration to the machine only when it differs from the workflow's
old value; and Streamline 0.2.13, Decaid's default skin, writes the steam time it remembers
(KV `streamline-app/last-steam-duration`) back over every other one while a page of it is
open. With Streamline remembering 30 s the rig shows the founder's result exactly.

- The ZIP and its install (D9), not seen on the tablet: which of the two ZIP installs of
  `doc/Skins.md` the tablet's Decaid shows (Launcher → Skins → +, or the skin selector in
  Settings); whether the skin's port is the same there and stays over a restart, which the
  settings in `localStorage` depend on. The founder's checks are in
  [install.md](install.md). (owner)
- The version is `0.6.1`, a beta (founder, 2026-10-13; 0.1.x for fix rounds); it is in
  `package.json` and `public/manifest.json`. Versions are semantic (founder, 2026-10-16): a
  hand-over raises the minor version, so H1 built `0.2.0` (2026-10-18), H2 built `0.3.0`
  (2026-10-20), H3 (the reviews of 2026-10-18 and 2026-10-20) `0.4.0` (2026-10-21), and H4 (the
  reviews of 2026-10-21 and 2026-10-22) `0.5.0` (2026-10-23), and H5 (the review of 2026-10-23
  and inbox #45) `0.6.0` (2026-10-24), and its completion with the review of 2026-10-24
  `0.6.1` (2026-10-25; not 0.7.0, which is the public release); a major version (such as the
  reverted 1.1.0, commit `ad378f9`) only after asking the founder. (answered)
- Other profiles (founder's question of 2026-10-14, [answers-2026-10-14.md](answers-2026-10-14.md)):
  answered by version 1.1: they open in the skin's own step editor, ported from Streamline
  (3.6; built in E2, [research.md](research.md) 17), so no switch of skins is needed. (answered)
- Where Decaid keeps its database (`streamline_bridge.sqlite`) on Android was not seen; the
  app's private folder is likely, out of reach of a file manager. The founder's view is the
  API in a browser on the tablet or `GET /api/v1/data/export`. (owner)
- What are the skin and the repository called? The skin is `pureflow` (a minimal design
  and A-Flow, the A for adaptive), its manifest id and name `pureflow`; the repository is
  `decaid-pureflow` (the pattern `decaid-<name>`), `github.com/Jan3kJ/decaid-pureflow`
  (founder, 2026-10-18). Until then both were `decaid-skin`. The new id makes Decaid treat it
  as a new skin, so the old one is deleted by hand once ([install.md](install.md)). A start
  moves the settings kept under the former name: the localStorage keys `decaid-skin.*` to
  `pureflow.*` (`src/former-keys.ts`), and without a backup in the namespace `pureflow` the
  one in `decaid-skin` is read and copied (`src/settings-backup.ts`); profiles stored with
  `source: 'decaid-skin'` count as the skin's own. (decided)
- Steam test (acceptance 4), as built in D8a; the founder agreed to it on 2026-10-13
  (request 168). `npm run e2e` runs the steam page against a mocked gateway: Playwright
  answers `/ws/v1/scale/snapshot` with fake weight frames for a small, a medium and a large
  mug with milk, and the test checks the detected size, the milk and the seconds on screen
  and that 'set timer' and a favourite chip send those seconds as `steamSettings.duration`.
  `npm run e2e:rig` checks on the running gateway that the written duration is read back and
  that steam, started through the gateway's API as at the machine, is stopped by the skin's
  stop button; there only the scale's frames are fake. Not tested anywhere: a timer that runs out (next question). (answered)
- Mug detection: the midpoint rule of 3.4 (founder, 2026-10-15), built in F1
  (`mugSteps` in `src/steam/timer.ts`); with the defaults the medium mug starts above
  412.5 g and the large one above 625 g. (answered, built)
- Does the real DE1 stop steaming when the timer is over, and after the seconds the steam
  page shows? The simulation cannot show it. Since the fix of 2026-10-14 the page shows the
  machine's own timer (`targetSteamDuration`), sets it so that Streamline does not write its
  own back, and says so when another app changes it afterwards. Proven on the rig: the
  machine's settings hold the chosen seconds, with a Streamline page open too. Not proven:
  that Streamline on the tablet was the cause on 2026-10-13 (it is the one cause the rig
  reproduces), and that the DE1 ends steam at `targetSteamDuration`. The founder's check:
  tap 25 s, read 25 s on the steam page, steam, and time it. (owner)
- The steam timer and Streamline, choices of the fix the founder has not seen: the skin
  changes Streamline's remembered steam time (a key of Streamline's own KV namespace) to the
  seconds it sets, and only when Streamline has one; when the workflow already has the seconds
  and the machine another, the skin writes the machine's settings directly
  (`POST /api/v1/machine/shotSettings`), after waiting 2 s for them (`MACHINE_WAIT_MS` in
  `src/steam/apply.ts`); a timer changed in another app shows a notice on the steam page
  until it is set again. Whether Decaid's own steam screen on the tablet, which opens when
  steam starts and offers +10 s, played a part was not seen. (owner)
- The maximum flow the editor allows: a setting, 8 ml/s by default (founder, 2026-10-15),
  built in F1 with a range of 4 to 20 ml/s (3.6). (answered, built)
- The choices made while building the review's changes, which the founder has not seen:
  [a-flow-3.0.md](a-flow-3.0.md), section 5. (owner)
- The byte format of a v2 profile file only matters for an export: the API takes and
  returns JSON numbers, the bundled files hold strings. Does v1 export files at all?
  (research)
- One profile for each set of steps (research.md 11.1): Decaid cannot hold the same steps and
  stop weight under two names. 'Save as' with values that a visible profile already has,
  for example a default with only another dose, saves nothing and says which profile has
  them. Is that enough, or should such a profile be renamed instead? (owner)
- 'Save' of an edited profile stores a new record with the old one as its parent and hides
  the old one (`PUT /api/v1/profiles/{id}/visibility`), so the list shows a profile once and
  the lineage keeps every version. Hidden, soft-deleted or left visible: which should an
  older version be? A default has no 'save': it is saved under a new name. (owner)
- Loading from the editor (founder, 2026-10-13, built in `fb-editor-flow`): there is no 'load to
  machine'. 'Save' and 'save as' load the saved profile after saving. Leaving the editor,
  by the swipe back or by the profile's name (the shortcut to the picker), loads the values
  on screen when they differ from those it opened with, under the name of the profile they
  started from, and loads nothing when nothing changed. Such unsaved edits are on the machine
  but not stored as a profile: the editor opens on them again while they are the workflow's
  profile, and they are gone once another profile is loaded. Before the skin loads another
  profile while they are on the machine ('load' in the picker, a restore from the history,
  another profile of the editor's start row), it asks (founder, 2026-10-14): a dark dialog
  names the profile, 'has unsaved changes on the machine', with 'Save as…' (the editor's save
  as on those values), 'Discard and load' and 'Cancel'; nothing is loaded before the answer.
  The skin reads it from Decaid alone, in one place (`unsavedOnMachine` in
  `src/editor/unsaved.ts`): the workflow's profile is an A-Flow 3.0 profile and neither the
  default of its title nor a stored record of its title, hidden ones too, has its values. So
  it holds after a page reload, and an older version restored from the history counts as
  saved. A load started outside the skin (Decaid's own screens, the machine) cannot be warned
  about: the edits are then lost without a word. A failed load is shown and the
  editor stays open; 'back' a second time with the same values leaves without loading them.
  The editor is not asked when the machine itself opens the espresso screen or the page is
  reloaded: those leave without loading. A tap in the picker selects a profile and its
  **load** button loads it (founder, 2026-10-17, spec 3.8, overriding 'a tap loads at once'
  of 2026-10-13). (owner)
- The setting "first-step workaround" is `firstStepWorkaround` in `src/settings.ts`, off by
  default, and acts where the editor generates a profile (save, save as, leaving with changes).
  Profiles stored before it was switched on, and the defaults the picker adds, do not get
  the Pre Fill step until they are saved or loaded from the editor. Its switch is on the
  settings page (D8c). (owner)
- Scale, settings, sleep (D8c, research.md section 13), choices the founder has not seen:
  - The skin's settings are the category Skin of the ported settings page (S2a), one
    subcategory under the other in a panel that scrolls. Grams take one decimal and go up to
    1000 g; seconds are whole, 1 to 255. There is no 'back to defaults' action for them. (owner)
  - The switch on the settings page is the one place to set 'profile steps'; the editor's
    button only opens and closes the panel, which is not stored (founder, 2026-10-13).
    (answered)
  - Settings stay in `localStorage` (`pureflow.settings`) (founder, 2026-10-14), backed
    up to the KV store (`pureflow/settings-backup`, `src/settings-backup.ts`): every save
    writes it 1.5 s after the last change, a start without settings takes it back. The
    screen the skin opens with is not a setting, has its own key (`pureflow.screen`) and
    is not backed up. The keys of the former name are moved at the start (the naming
    question above). (answered)
  - While the machine sleeps the skin is a dark screen, 'Asleep, touch to wake', over every
    page, whoever put the machine to sleep; a touch asks for `idle`. Where
    `platformSupported.brightness` is true the brightness goes to 5 (`SLEEP_BRIGHTNESS` in
    `src/shell/skin.svelte.ts`) and back to 100, the system's own, at the wake. Is 5 right,
    and should the skin dim at all, or leave that to Decaid? (answered: keep 5 for now;
    founder 2026-10-15) Since 3.10: not after the menu's 'Machine sleep', which keeps the app
    awake (founder, 2026-10-20).
  - Sleep is offered whenever the machine is awake and runs nothing, also while it heats.
    (owner)
  - A shot started in the seconds after a wake, before the scale is back, did not stop at
    its weight on the rig (research.md section 13). The skin has no start button any more
    (founder, 2026-10-13), so it cannot hold one back; the state line warns while the scale is
    not connected. Does the real scale behave so? (owner)
  - A stream the gateway closed with an error is tried again by the skin for 30 s, then it
    says 'Decaid closed the connection' with a 'reconnect' button on every screen (founder,
    2026-10-15; built in F1, 3.6). (answered, built)
- Shot history (D8b, research.md section 14), choices the founder has not seen:
  - A profile is taken by its title, not by its id: a shot record holds a copy of the
    profile and no id, and the id changes with every edit. A renamed profile starts a new
    entry; an edited one stays in its entry (`entryKey` in `src/history/entries.ts`). (owner)
  - A bean is its name and roaster (`coffeeName`, `coffeeRoaster`); Decaid's batch id counts
    only for a bean without both. Shots without a bean share one entry per profile, shown as
    'no bean'. A bean of Decaid's catalogue (U10, 3.9 item 19) is the catalogue's bean: found
    by the shot's batch, else by its name and roaster, one entry across a rename and its bags,
    shown by its current name. (owner)
  - Restoring writes the stop weight and the dose of the profile, as the picker does, not
    those of the shot. An entry without a bean or a grinder setting clears the current
    ones. (owner)
  - The swipe opens the overlay only when it starts in the left fifth of the screen
    (`SWIPE_EDGE` in `src/shell/swipe.ts`), so it cannot pass over a button of home. The
    graph of the entry's last shot is shown on home, in the place of the last shot, until
    it is dismissed or a shot starts. The skin holds the newest 500 shots for the session
    (`HISTORY_SHOTS` in `src/history/shots.svelte.ts`). (owner)
  - After a very fast flick the first tap outside may not close the overlay (seen with
    synthetic touch events only, research.md section 14): a check on the tablet with
    item 8. (owner)
- Loading a profile also writes its `target_weight` as the workflow's `targetYield`, and the
  dose of an A-Flow 3.0 default as `targetDoseWeight`: Decaid stops at the workflow's yield,
  not at the profile's weight. Is that wanted, or does a yield set by hand survive a profile
  change? (owner)
- The editor's start row (founder, 2026-10-13, request 175: the editor's row, not the picker's
  list; built in `fb-editor-defaults`), choices the founder has not seen: a slot holds a
  profile's title, not its id, because the id changes with every save (research.md 11), as
  the shot history does; so a renamed profile is a new one. A slot offers the five defaults,
  which the editor always has, and every A-Flow 3.0 profile the gateway lists. The slots keep
  their place: an emptied slot stays empty and the row closes up. A chosen profile that is
  gone is left out of the row and marked 'missing' on the settings page until its slot is
  changed. The slots are a block of their own under Steam, Profile and Shot graph, since five
  do not fit beside Steam. A tap on the row opens the profile in the editor without loading
  it; leaving the editor loads it, as any change. (owner)
- The flow-down defaults (dark, 46mm) pour nothing in their last step on the simulated
  machine (research.md 10.4). A check on the real DE1 with item 7. (owner)
- The review of 2026-10-16 (3.7), choices the team will make unless the founder says
  otherwise (owner):
  - Adjust buttons, built in R1 as planned: one is selected at a time; a tap on the selected
    one clears it; the selection is cleared after steam. Selecting one writes nothing; the
    next tap on a chip or 'set timer' sends the seconds with it.
  - Right-edge swipe, built in R1: it opens the steam page as it is (a page), not an overlay.
  - Hot water page, built in R5: Decaid stops hot water at the weight by itself, so the skin
    stops nothing; without a scale the DE1 stops at as many ml or at the time (research.md
    21: the real DE1 not seen). "The last measured shot" is the newest shot record's
    `actualYield`.
  - Infuse width, built in A2 as planned: the estimated time is 4 s per gram plus 1 s (the
    founder's 1 g ≈ 5 s and 6 g ≈ 25 s), never longer than the phase's time. The infuse-to
    chip is dragged left and right, not up and down.
- The review of 2026-10-17 (3.8), choices only the founder could make. Answered on
  2026-10-18 (message 41): the font sizes as below, and 'rest of the question, agree to your
  proposal', so every default stands as written, except where 3.9 overrides it: the per-phase
  values (the resent screenshot), the save feedback (3.9 item 8) and the exit (3.9 items 1 and
  2). (answered)
  - A-Flow defaults in the skin: the picker lists the five from the skin, first, marked
    'default'; the 'not in Decaid' offer and its add button go; copies already stored in
    Decaid under `A-Flow / default-…` stay in Decaid but are not listed (the skin's default of
    that title is shown); Decaid's bundled de1app A-Flow profiles are listed as before. The
    'light' / 'test-light' clash is Decaid's id being a hash of the steps (research.md 11.1),
    and goes with the defaults out of Decaid. Built in T5 (research.md 25): the stored copies
    are not listed and not deleted.
  - The shot overlay: built in T2 (research.md 24), replaced in X1 by home as the shot screen
    (3.11): the finished shot stays on home with the per-phase table until the next shot.
  - The per-phase values: per phase (preinfusion, extraction, total) with start and end
    values, as Streamline shows them (the screenshot resent on 2026-10-18, 3.9), computed as
    its `shotData.js` does (research.md 24). Built in T2.
  - The expected shot duration: the last shot with that profile, else the profile's estimate,
    else 30 s, rounded up to 10 s. Built in T1 (research.md 23).
  - Exit: Decaid cannot switch the DE1 off (research.md 22) and a skin cannot close Decaid;
    the host offers `window.decentApp.exitToDashboard()` (research.md 20.3), which goes to
    Decaid's dashboard. **Exit** puts the machine to sleep and goes to the dashboard; without
    the host's function it is not shown. Agreed, then replaced by the review of 2026-10-18:
    no Exit; 'Machine sleep' and 'Machine and app sleep' (3.9 items 1, 2).
  - Swipe and the history: a swipe that starts in home's left fifth still opens the history;
    any other swipe moves between hot water, home and steam, so from home hot water needs a
    swipe that starts right of that fifth, or its tab.
  - Font sizes: the note breaks off at "labels like". One type scale, with the state line as
    large as the profile's name. Answered (founder, 2026-10-18): labels such as 'steam' and
    'group' in the state line may be smaller than their values; not everything gets the same
    size (3.8, T3).
- The tablet's Streamline version (question 8 of the hand-over 0.2.0, request 189): the
  founder has 0.2.14 (2026-10-18, message 41: 'I do have that version'). What depended on it:
  Streamline 0.2.13 wrote the steam time it remembers back over every other one while a page of
  it was open (research.md 16), the one cause of the founder's 25 s that ran 30 s on 2026-10-13
  the rig reproduces; 0.2.14 takes an outside value over instead (`decideResync`'s adopt,
  research.md 18, seen on the rig in R1). So on the tablet the write-back cannot recur, the
  skin's change of Streamline's key (`src/steam/apply.ts`) stays only for a tablet on 0.2.13
  and is harmless on 0.2.14, and research.md 20.9's warning that Streamline may put machine
  values back is weaker. The founder's steam check (timing 25 s on the real DE1, above) is
  still open; no question is left. (answered)
- The review of 2026-10-18 (3.9), choices only the founder can make; the default is built
  unless the founder says otherwise (founder):
  - Machine and app sleep (item 2): the machine sleeps, the skin's sleep screen goes to
    brightness 0, and Decaid's wake lock is released so that Android switches the screen off by
    its own timeout; a touch wakes both and puts the wake lock back. It replaces T9's Exit to
    Decaid's dashboard, which is not built. Built in U4: the lock is released by switching
    Decaid's `keepAwake` off for the sleep (research.md 13.1). Is that what 'the app sleeps'
    means, and does the tablet's screen go off and wake with one touch? Answered (founder,
    2026-10-20, message 42): 'app sleep: means it shows the black screen with "Asleep" message as
    of today', the Asleep screen of 0.3.0, not a released wake lock; with message 43's item 4
    there are two entries, 'Machine sleep' (the app stays awake, no Asleep screen) and 'Machine
    and app sleep' (the Asleep screen), without lines; U4's brightness 0 and wake lock release go
    (3.10, W1). (answered)
  - Old A-Flow profiles (items 4-6): converting drops ramp down, which 3.0 removed, without
    asking; the old version stays in Decaid's lineage, hidden. The import button skips Decaid's
    bundled de1app A-Flow profiles, since the skin's defaults stand for them (built in U7).
  - Feedback (item 15): Send Feedback goes to Decent through Decaid (`POST /api/v1/feedback`),
    an outside service spec 6 asks the founder to approve; item 15 is taken as that approval.
  - The camera (item 20): the founder's check passed (both ways work, the live camera without
    asking); U13 is built (3.9). (answered)
- The review of 2026-10-18 (3.9), choices the team will make unless the founder says otherwise
  (owner): the scale retry as Streamline's (every 5 s, three times, not while the machine
  sleeps); the hot water sliders write when let go, the value still opens the number pad; the
  state dot goes from every page; the flush ring is 85 % of its panel; the steam page's heater
  message stands in the place of the favourites; SCRIPT keeps a muted line for an exit, limit
  or maximum that is off.
- The review of 2026-10-20 (3.10), choices only the founder can make; the default is built
  unless the founder says otherwise (founder):
  - Sleep (item 4): after 'Machine sleep' home's menu offers 'Wake machine' while the machine
    sleeps; a sleep the skin did not ask for (Decaid's timeout, presence, the machine's button)
    shows the Asleep screen as today; neither sleep touches Decaid's wake lock, so the tablet's
    screen follows Decaid's own `keepAwake`.
  - Ring (item 6): settled by the review of 2026-10-23 (3.14 item 8, Z8): one large ring over
    each screen's main frame, no small ring.
  - Picker graph (item 1): limits are dotted, muted lines of their quantity; an A-Flow profile's
    pour is drawn as far as the editor draws it (30 s), so default-dark ends at 1 ml/s as in the
    editor; the steps keep their own widths (the editor's infuse by weight is not copied).
  - Delete (item 2): a stored profile is soft-deleted by Decaid (`DELETE /api/v1/profiles/{id}`),
    a bundled one hidden, after one confirm and with no undo; the skin's five defaults and the
    profile on the machine cannot be deleted.
  - Shot values (item 3): the setting 'Shot values', on by default, hides only the per-phase
    table; the live numbers beside the graph stay.
  - Editor swipe (item 5): from left to right only, from anywhere in the editor that is not a
    control (a line, a border or a chip of the A-Flow graph, the step cards' row while it
    overflows; the left edge goes back over anything, 3.17 item 1); home is not drawn beside it while it moves;
    unsaved edits are loaded on leaving as with 'back', nothing is asked.
- The review of 2026-10-22 (3.12), hot water and flush ring (item 6; Y6), for the founder: on
  the rig every screen shows the ring for both kinds, so what failed on the tablet is not known.
  Since Z8 every screen shows the one large ring over its main frame (3.14 item 8). Does the
  founder see it now, on which screen did a ring not show, and was the hot water started at the
  machine?
- Reading the bean bag's photo again (3.17 item 3 dropped it; research.md 36), which way:
  - **(a) PP-OCRv6 tiny on the tablet** (PaddleOCR.js, Apache-2.0), bundled: the lines as chips
    plus a roaster and a name rule, offline, free, no key; the ZIP grows to about 13 MB
    (acceptance 82 asks for under 200 kB). **Recommended.**
  - (b) The same, fetched once and cached: the ZIP stays small; a new outside service and a
    network for the first use.
  - (c) Gemini 3.5 Flash-Lite with the user's own key: the fields directly, about $0.0005 a photo
    or the free tier; the photo goes to Google, no reading offline. The recommended fallback, or an
    option beside (a).
  - (d) Leave the reading dropped; the photo stays as it is. (founder)
  - **Decided, 2026-10-27:** (a) as a second build: the base ZIP stays small and without the reading, an ocr ZIP carries it (3.19, Z42, Z43). (c) and (b) are not planned.
- The team's design review of 2026-10-27 (Z27): 23 proposals (DR1 to DR26, three dropped) wait
  for the founder's picks; none is built until picked. The review takes 48 CSS px as the
  minimum touch target, while 3.8 names 3.5rem (56 px) only for home's edge tabs: which minimum
  does the skin hold for every control? (founder)
