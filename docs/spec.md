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
| A-Flow editor, disabled phase | a phase dragged to 0 s is off: it collapses (today it stays as wide as the fill phase), and a button re-enables it with 5 s. *Built (A2):* the phases with a border that reaches 0 s, infuse and pressurize; the 2nd fill is off with its pause and keeps its toggle. A phase that is off has no width, no label and no border to take hold of; its button, '+ infuse' or '+ pressurize', sits where it collapsed, in the row of the weight chips, in place of the infuse-to chip; in detail mode it also selects the phase (`phaseOff`, `REENABLE_SECONDS`) |
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
feedback and the firmware upload behind S2c's confirm. Feedback goes to Decent through Decaid,
an outside service that spec 6 asks the founder to approve; item 15 asks for it, and the default
takes that as the approval (section 8). Talk to Decent (a Decent account) is not asked for and
stays out.

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
again; nothing more is asked, since the swipe and the button are two deliberate actions, and
nothing is purged: Decaid keeps the record as deleted, with its lineage and in its data export. A
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
returns it, still hidden, and `writeParams` takes a hidden record over).

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
machine, as after 'back'.

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
  - The live Streamline skin (`decentespresso/streamline-js` v0.2.12, ISC) takes the other
    route: no framework, Tailwind + daisyUI, esbuild and ECharts. Its `api.js` stays a useful
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
  2026-10-18 is 0.3.0 (H2, 2026-10-20): `npm run zip` writes
  `release/pureflow-<version>.zip`; the steps and the
  founder's checks are in
  [install.md](install.md), the result of the automated items in
  [acceptance.md](acceptance.md).
- **Later releases:** the same ZIP attached to a GitHub release, installable by URL.

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
54. **Camera (founder).** The hand-over's camera test page, opened on the tablet, says whether
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
- The version is `0.3.0`, a beta (founder, 2026-10-13; 0.1.x for fix rounds); it is in
  `package.json` and `public/manifest.json`. Versions are semantic (founder, 2026-10-16): a
  hand-over raises the minor version, so H1 built `0.2.0` (2026-10-18), H2 built `0.3.0`
  (2026-10-20), and H3 (the reviews of 2026-10-18 and 2026-10-20) `0.4.0`; a major version (such as the
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
  by the back arrow or by the profile's name (the shortcut to the picker), loads the values
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
    'no bean'. (owner)
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
  - The shot overlay: it covers home's graph area with the live graph and the values, home's
    state line stays visible; after the shot it stays with the per-phase table until a tap
    anywhere or the next shot, and then home shows the shot as its 'last shot'. Built in T2
    (research.md 24).
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
  - The camera (item 20): only the founder can check it, with the hand-over's test page on the
    tablet; until then U13 is not started.
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
  - Ring (item 6): on every screen but home and the hot water page it is a small ring at the
    bottom of the left column, with the time inside and a tap to stop.
  - Picker graph (item 1): limits are dotted, muted lines of their quantity; an A-Flow profile's
    pour is drawn as far as the editor draws it (30 s), so default-dark ends at 1 ml/s as in the
    editor; the steps keep their own widths (the editor's infuse by weight is not copied).
  - Delete (item 2): a stored profile is soft-deleted by Decaid (`DELETE /api/v1/profiles/{id}`),
    a bundled one hidden, with no further question and no undo; the skin's five defaults and the
    profile on the machine cannot be deleted.
  - Shot values (item 3): the setting 'Shot values', on by default, hides only the per-phase
    table; the live numbers beside the graph stay.
  - Editor swipe (item 5): from left to right only, from anywhere in the editor that is not a
    control (the A-Flow graph, the step cards' row); home is not drawn beside it while it moves;
    unsaved edits are loaded on leaving as with 'back', nothing is asked.
