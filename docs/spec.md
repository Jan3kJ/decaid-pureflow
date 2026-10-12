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

| Area | v1 content |
|---|---|
| Home | machine state, start/stop, and one tap away: the **profile picker** and **steam**. Dose and target weight are shown; editing them sits one level down |
| Espresso | live graph (pressure, flow, weight, temperature) from `/ws/v1/machine/snapshot`, with the live weight from `/ws/v1/scale/snapshot`, timer, stop at weight |
| Steam | start/stop, a steam graph, and **the steam timer set from the milk's weight**: see 3.4 |
| Scale | connect state, tare (a 400 `block_tare_during_shot` is a notice, not an error) |
| Profiles | list, select, load to the machine (`POST /api/v1/machine/profile`) |
| Shot history | **an overlay, not a page:** a tab on the left edge of the screen (or a swipe from left to right) opens it; it closes when an item is selected or on a tap outside it. It holds **a list of previous shots; tapping one loads its profile, beans and grinder setting and shows its graph**: see 3.5 |
| Settings | a settings page with categories. **Steam** is one (3.4), and **Profile** holds the first-step workaround (3.2); the others hold the few settings the founder needs. Everything else stays in Decaid's own settings |
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
| (shot) | dose | g |
| Fill | flow, temperature | ml/s, °C |
| Infuse | pressure, time, weight (volume is not shown) | bar, s, g |
| 2nd fill (optional, one phase with its pause) | fill flow, pause duration | ml/s, s |
| Pressurize | pour pressure, ramp time | bar, s |
| Flow | pour flow, pour temperature, stop at weight | ml/s, °C, g |
| Options | 2nd fill; flow up or flow down | toggles |

Ranges follow the plugin (`code.tcl`): temperatures 80-105 °C, pressures and flows up to the
machine's maximum, times 0-1000 s, weights 0-1000 g, dose 0-30 g in 0.1 steps.

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
  border left or right changes a duration (infuse time, pause duration, ramp time). While a
  line is dragged, a small pop-up shows the current value. The infuse weight and the stop
  weight are value chips where they act (sketch: 6 g and 36 g). Two toggles sit under the
  graph: **2nd fill**, and one that reads **flow up** or **flow down** depending on its state.
- **Detail mode.** The same graph. A row of phase buttons selects a phase, which is
  highlighted in the graph. A panel on the right lists every value that can be changed in that
  phase as an editable chip. Volume is left out. Which other values are left out is decided on
  a prototype.

Editor behaviour:
- Edit the values, see the resulting curve update live, save as a named A-Flow profile, load
  it to the machine.
- Start from the plugin's default A-Flow profiles, converted to 3.0 (supplied as JSON
  fixtures).
- A saved profile is a normal Decaid v2 profile (`POST /api/v1/profiles`). The A-Flow
  parameters and the version (3.0) travel with it so it re-opens in the editor (in the
  profile's `notes`, or the KV store; decided in the design task), and Decaid's profile
  lineage records edits.
- Other profiles can be selected and loaded, but only A-Flow profiles are editable in v1.

### 3.3 Out of scope for v1
- Import of de1app A-Flow `.tcl` profiles.
- Editing non-A-Flow profiles.
- Managing a bean and grinder catalogue (Decaid has APIs; candidates for v2). v1 only records
  the bean and the grinder setting with a shot and restores them from history (3.5).
- Hot water and flush / rinse: they stay in Decaid's default skin (candidates for v2).
- Rating a shot (Decaid's 0-10 enjoyment scale).
- Portrait layout and a light theme.
- Plugins, sensors, camera.
- iOS.

### 3.4 Steam page
From the founder's sketch and daily use of this feature in DSx2:
- **Left:** a steam graph with pressure and temperature.
- **Right, top:** optional favourites, three timer chips for a quick setting without a scale
  (sketch: 25 s, 50 s, 30 s).
- **Right, below:** the current steam timer, the live scale weight, **the detected mug size
  (s, m or l)** with its weight, and the milk (weight minus mug), then a **set timer** button.
- **Three mug sizes, detected automatically** from the scale weight. Auto-detection is a must.
  DSx2's rule is the starting point: the size steps up when the weight is above that mug's
  weight plus a share of one drink's milk.
- **The calculation, as DSx2 does it:** `timer = reference seconds / reference milk grams x
  (scale weight - mug weight)`, rounded to whole seconds. The timer is written to the
  machine's steam settings.
- **Settings, category Steam:** the three mug weights, the calibration (reference seconds and
  grams of milk), the milk of one drink, and the favourite timers.

### 3.5 Shot history
What the founder likes in DSx2: a list of previous shots, and one tap on an entry
- loads its **profile**, **beans** and **grinder setting** as the current ones, and
- shows the **graph of the last shot** made with it.

**An entry is one combination of profile and bean.** A shot with another bean or another
profile creates a new entry. The grinder setting is optional and belongs to the entry: changing
it updates the entry and does not create a new one (the founder has one grinder). So the list
is as long as the number of combinations in use, not the number of shots, and it is the
quickest way to repeat a good shot.

## 4. Technical approach

### 4.1 What a Decaid skin is
A static web app (`index.html` at the root) served by Decaid's gateway from localhost (ports
from 24800), talking to the gateway's REST and WebSocket API on port 8080. Decent prescribes
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
  tablet. No GitHub release.
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
6. **Scale, settings, sleep.** Tare works and a 400 during a shot shows a notice; settings
   survive a reload; the sleep button puts the machine to sleep.
7. **Real machine (founder, by eye).** With a profile made in the editor loaded on the real
   DE1, all phases are set correctly and the target values are as expected.
8. **Install (founder).** A local ZIP of the build installs on the Android tablet and opens in
   landscape, dark. Version 1 has no GitHub release.

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

- Which tablet model and screen size is the design target? (owner)
- What are the skin and the repository called? `decaid-skin` is provisional; decided before
  the first public release. (owner)
- Steam page numbers: the three mug weights, the reference seconds and grams, and the milk of
  one drink, as defaults. (owner)
- Which values does the detail panel leave out besides volume? Decided on the editor
  prototype (D5). (owner)
- Steam test (acceptance 4) against the simulation: the simulated scale's weight cannot be
  set, and simulated steam does not end when the duration is over. Where do the mug weights
  come from in the test (for example WebSocket routing in Playwright), and is "the skin
  sends the computed seconds as `steamSettings.duration`" enough for the automated part?
  (owner)
- Does the real DE1 stop steaming when `steamSettings.duration` is over? The simulation
  cannot show it; a check for the founder with item 7. (owner)
- Answered in D3 ([a-flow-3.0.md](a-flow-3.0.md)): Decaid's five default A-Flow profiles
  equal the plugin's `.tcl` files except for the Pause step, which has 0 s in the plugin and
  15 s in Decaid, in all five. The 3.0 fixtures start from the plugin. What is left: the
  choices and the points on 3.2 listed in that document, sections 5 and 6, for the founder's
  review. (owner)
- The byte format of a v2 profile file only matters for an export: the API takes and
  returns JSON numbers, the bundled files hold strings. Does v1 export files at all?
  (research)
- Decaid served the bundled skin on port 27906, not on a port from 24800 as 4.1 says. How
  the port is chosen is not known; read it from `GET /api/v1/webui/server/status`.
  (research)
- Where is a profile's A-Flow lineage stored: the profile notes or the KV store? (research)
