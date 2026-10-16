# decaid-skin: product spec

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
| Home | no start: the DE1 is started at the machine; a stop button while something runs. The machine's state in one line: the state, group and steam temperature, the tank's water level and the scale's weight, or a warning without a scale; the same line is on the steam page. Top right a menu with scale, settings and sleep, and left of it the current profile's name, which opens the **profile picker**, with a pen that opens the editor. **Steam** is a tab on the right edge, the mirror of the history's. Dose and target weight are not shown on home. The graph takes the rest of the screen (founder, 2026-10-13) |
| Espresso | live graph (pressure, flow, weight flow, temperature) from `/ws/v1/machine/snapshot`, with the live weight from `/ws/v1/scale/snapshot`, timer, stop at weight. The graph and the timer start when water moves, not while the machine heats; the profile's targets are dashed lines with their quantity; an optional legend sits under the graph, on by default (founder, 2026-10-13). The graph, live and in the history, draws the weight flow in g/s (the scale frame's `weightFlow`) in yellow instead of the weight, on the scale of flow and pressure ('ml/s · g/s'), with no target weight line; the screen keeps the weight in g as a number (founder, 2026-10-14) |
| Steam | stop (steam is started at the machine) (founder, 2026-10-13), a steam graph, and **the steam timer set from the milk's weight**: see 3.4 |
| Scale | connect state, tare (a 400 `block_tare_during_shot` is a notice, not an error). The page is removed in 3.7 (founder, 2026-10-16) |
| Profiles | list, select, load to the machine (`PUT /api/v1/workflow`) (founder, 2026-10-13) |
| Shot history | **an overlay, not a page:** a tab on the left edge of the screen (or a swipe from left to right) opens it; it closes when an item is selected or on a tap outside it. It holds **a list of previous shots; tapping one loads its profile, beans and grinder setting and shows its graph**: see 3.5 |
| Settings | a settings page with categories. **Steam** is one (3.4), and **Profile** holds the first-step workaround (3.2) and the editor's row of profiles to start from, up to five (founder, 2026-10-13); the others hold the few settings the founder needs. Everything else stays in Decaid's own settings. The settings stay in the tablet's localStorage; every change is backed up to Decaid's KV store (`decaid-skin/settings-backup`, with its time and the skin's version), a start without settings takes them from the backup and says so, and the page shows the backup's time with 'Restore from backup' (founder, 2026-10-14). The page names the skin's version, from its manifest, small in its top right corner (founder, 2026-10-14) |
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
- Import of de1app A-Flow `.tcl` profiles.
- Editing non-A-Flow profiles: moved to version 1.1 (3.6).
- Managing a bean and grinder catalogue (Decaid has APIs; candidates for v2). v1 only records
  the bean and the grinder setting with a shot and restores them from history (3.5).
- Hot water and flush / rinse: they stay in Decaid's default skin (candidates for v2). A view
  of them while they run is in version 1.1 (3.6); hot water gets its own page in 3.7.
- Rating a shot (Decaid's 0-10 enjoyment scale).
- Portrait layout and a light theme.
- Plugins, sensors, camera.
- The ghost curve of the profile's last shot in the editor: version 2 (founder, 2026-10-13).
- iOS.

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
| Step editor: SCRIPT tab | Streamline's SCRIPT tab, ported with the step editor: the profile's steps as text, editable, with a graph preview; a text that does not parse is shown as an error and is not saved |
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
`{ source: 'decaid-skin', aflow: '3.0', params }`, `params` the 26 values as the codec writes
them (the 2nd fill's too while it is off), and its `notes` hold only what a user wrote there.
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
| Steam page | **Bugs:** the steam graph stops when steam stops, and the last steam time (top right) is the steam's own time, not longer. **Layout:** the steam timer sits in the centre of the right column, in line with **set timer**. **Countdown:** while steam runs the timer counts down from the set seconds. **Adjust buttons:** above **set timer**, three buttons, by default −8 s, −4 s and +5 s, configurable in the settings (Steam); a selected one adds its amount to the calculated timer or to the selected favourite (use case: the milk's temperature changes what the calculation needs). **Graph:** the temperature scale is 140 to 170 °C. **Swipe:** a swipe from the right edge opens the steam page, as the swipe from the left edge opens the history |
| Home menu | two shortcuts in the menu: **steam off** (the steam heater off, and on again) and **machine off** (sleep if the DE1 cannot be switched off through Decaid) |
| Water view | the animated group head and stream go, for flush and hot water; the countdown ring stays, and the values sit inside the stop button: temperature, flow, time, and for hot water the weight in g |
| Hot water page | a page of its own, opened from home by a button of its own: the steam tab is split, steam keeps most of it and hot water takes the rest, at the bottom. Its settings are temperature, flow, time and **stop at weight**. Stop at weight can be set from the last measured espresso shot by a ratio: a shot of 40 g and 1:2 give 80 g. Three ratio favourites, configurable, by default 1:2, 1:2.5 and 1:3. A **tare** button. Starting stays at the machine |
| Scale page | removed completely. **Tare** moves: a tap on the weight in the state line tares the scale when one is connected, and the steam and hot water pages have a tare button |
| Settings | Streamline's settings page is ported, so that almost everything in it can be set without switching the skin; the skin's own settings go into its skin category, as Streamline has one |
| A-Flow editor, detail mode | "flow gradient to" is called **end flow**. The flow line of the last step is split: dragging its left half changes the start flow, its right half the end flow. The buttons above the graph go: a tap on a step is enough |
| A-Flow editor, infuse | the infuse phase is drawn by its move-on weight, not its time, because the weight ends it long before a time of 60 s; the founder's estimate is 1 g ≈ 5 s, 6 g ≈ 25 s. The **infuse to** weight can be dragged; a tap still shows the +/− buttons |
| A-Flow editor, disabled phase | a phase dragged to 0 s is off: it collapses (today it stays as wide as the fill phase), and a button re-enables it with 5 s |

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
  2026-10-13), fix rounds 0.1.x; now 0.1.1 (2026-10-15): `npm run zip` writes
  `release/decaid-skin-0.1.1.zip`; the steps and the
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
    the stored steps; a text that does not parse shows an error and saves nothing.
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

The founder's review of 2026-10-16 (3.7); items 17 to 23 are tests, 24 and 25 the founder's:

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
| 2 | S2 | review: the settings page ported from Streamline, the skin's settings in its skin category | S1, R1, R2, R5 |
| 2 | H1 | review: hand-over ZIP, install.md with the new checks and the open ones of 2026-10-16 | R1-R5, S2, A2 |

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
- The version is `0.1.1`, a beta (founder, 2026-10-13; 0.1.x for fix rounds); it is in
  `package.json` and `public/manifest.json`. Versions are semantic (founder, 2026-10-16): a
  hand-over raises the minor version, so H1 builds `0.2.0`; a major version (such as the
  reverted 1.1.0, commit `ad378f9`) only after asking the founder. (answered)
- Other profiles (founder's question of 2026-10-14, [answers-2026-10-14.md](answers-2026-10-14.md)):
  answered by version 1.1: they open in the skin's own step editor, ported from Streamline
  (3.6; built in E2, [research.md](research.md) 17), so no switch of skins is needed. (answered)
- Where Decaid keeps its database (`streamline_bridge.sqlite`) on Android was not seen; the
  app's private folder is likely, out of reach of a file manager. The founder's view is the
  API in a browser on the tablet or `GET /api/v1/data/export`. (owner)
- What are the skin and the repository called? `decaid-skin` is provisional; decided before
  the first public release. (owner)
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
  profile while they are on the machine (a tap in the picker, a restore from the history,
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
  reloaded: those leave without loading. A tap in the picker loads the profile at once; the
  picker's 'load' button is gone. (owner)
- The setting "first-step workaround" is `firstStepWorkaround` in `src/settings.ts`, off by
  default, and acts where the editor generates a profile (save, save as, leaving with changes).
  Profiles stored before it was switched on, and the defaults the picker adds, do not get
  the Pre Fill step until they are saved or loaded from the editor. Its switch is on the
  settings page (D8c). (owner)
- Scale, settings, sleep (D8c, research.md section 13), choices the founder has not seen:
  - The settings page shows its two categories, Steam and Profile, side by side on one
    screen, without tabs. Grams take one decimal and go up to 1000 g; seconds are whole,
    1 to 255. There is no 'back to defaults' action. (owner)
  - The switch on the settings page is the one place to set 'profile steps'; the editor's
    button only opens and closes the panel, which is not stored (founder, 2026-10-13).
    (answered)
  - Settings stay in `localStorage` (`decaid-skin.settings`) (founder, 2026-10-14), backed
    up to the KV store (`decaid-skin/settings-backup`, `src/settings-backup.ts`): every save
    writes it 1.5 s after the last change, a start without settings takes it back. The
    screen the skin opens with is not a setting, has its own key (`decaid-skin.screen`) and
    is not backed up. (answered)
  - While the machine sleeps the skin is a dark screen, 'Asleep, touch to wake', over every
    page, whoever put the machine to sleep; a touch asks for `idle`. Where
    `platformSupported.brightness` is true the brightness goes to 5 (`SLEEP_BRIGHTNESS` in
    `src/shell/skin.svelte.ts`) and back to 100, the system's own, at the wake. Is 5 right,
    and should the skin dim at all, or leave that to Decaid? (answered: keep 5 for now;
    founder 2026-10-15)
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
    (`SWIPE_EDGE` in `src/history/swipe.ts`), so it cannot pass over a button of home. The
    graph of the entry's last shot is shown on home, in the place of the last shot, until
    it is dismissed or a shot starts. The list reads the newest 500 shots
    (`HISTORY_SHOTS`). (owner)
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
  - Adjust buttons: one is selected at a time; a tap on the selected one clears it; the
    selection is cleared after steam.
  - Right-edge swipe: it opens the steam page as it is today (a page), not an overlay.
  - Steam off: the steam heater off until it is turned on again from the same menu entry;
    machine off: the DE1's own off, if the gateway has one, else sleep (founder,
    2026-10-16).
  - Hot water page: stop at weight is stopped by the skin from the
    scale's weight if Decaid does not stop hot water at a weight itself; "the last measured
    shot" is the newest shot record's final weight.
  - Infuse width: the estimated time is 4 s per gram plus 1 s (the founder's 1 g ≈ 5 s and
    6 g ≈ 25 s), never longer than the phase's time.
