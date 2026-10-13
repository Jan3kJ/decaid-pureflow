# D1 research: Decaid, Streamline, Profile v2, A-Flow

Status: answers the "For the team (D1)" questions in `spec.md`'s Open questions, plus the
A-Flow generator detail D3 needs. Dispatched to three `web-researcher` agents (one per group of
questions below); this document is the synthesis. All agents used an AI-mediated fetch tool
(WebFetch) with no raw shell/`curl`/`git clone` access, and all three independently flagged that
tool as unreliable on long files: it truncates before reaching deep schema sections, and in one
case fabricated plausible content for a URL that returns 404. Every claim below is marked
**verified** (corroborated across 2+ independent fetches, or cross-checked against raw GitHub
API JSON / decoded file contents) or **unverified / single-source**, per source instruction. Date
of all fetches: 2026-10-11.

## 1. Decaid on Windows and Linux

**Prebuilt releases exist for both**, verified against the raw GitHub Releases API
(`api.github.com/repos/decentespresso/decaid/releases/latest`), tag `v0.8.8`: Windows x64 ZIP,
Linux x86_64 (AppImage + tar.gz) and Linux aarch64/arm64 (AppImage + tar.gz), plus macOS,
Android, iOS and a `SHA256SUMS.txt`. So the team's Windows/Linux x64 test rig needs no build
from source.

**If a build is needed anyway** (e.g. a specific commit, or ARM64), requirements corroborated
across two independent fetches of `README.md` and `doc/AI_BUILD_NOTES.md`:
- Flutter SDK "3.7.0 or later" (quoted from README); the exact CI-pinned version string was not
  found — **unverified**.
- Platform toolchains, quoted: "Android: Android Studio / SDK", "macOS: Xcode", "**Linux:
  Standard build tools**", "**Windows: Visual Studio**". End-user Windows binaries bundle the VC++
  runtime, but a *build* machine still needs Visual Studio.
- Linux builds run containerized via Docker/Colima: `make colima-arm` / `make build-arm`
  (ARM64) vs `make colima-amd` / `make build-amd` (x86_64), `make dual-build` for both.

**Device simulation** is switched on with a Flutter compile flag, also exposed as a UI toggle;
corroborated across three doc fetches (`AI_TESTING_NOTES.md`, `DeviceManagement.md`,
`AI_BUILD_NOTES.md`):
- `--dart-define=simulate=<value>` (quoted), or **Settings → Simulated Devices** in the app.
- Values: `1` = all mocks (MockDe1, MockScale, MockBengle, MockSensor); `machine`, `scale`,
  `bengle`, `sensor` = individual simulators; `replay` = `MockReplayDe1` ("replays recorded shots
  matched to profiles"); `0` = real hardware.
- Implementation at `lib/src/models/device/impl/mock_de1/` and
  `lib/src/services/simulated_device_service.dart`.

**A simulated shot runs to completion with a working snapshot stream** — read directly from
`mock_de1.dart`: the state machine moves `preparingForShot` → `preinfusion` → `pouring` →
`pouringDone` (3-tick countdown) → `idle`, with a 30 s fallback for shots without a loaded
profile — a real, if simplified, progression, not a stub. The mock pushes into a
`StreamController<MachineSnapshot>` exposed as `currentSnapshot`, the same snapshot type the real
driver uses. **Caveat, not fully verified:** the agent read the mock device and the docs'
description of the `/ws/v1/machine/snapshot` route, but did not read the webserver route-handler
source itself to directly confirm it forwards the mock's stream over that WS route — this last
link is architecturally inferred, not read. Treat "the simulator produces a snapshot stream" as
verified, and "the live WS route is wired to it" as **unverified**; worth a direct check (connect
a WS client to a simulated Decaid instance) before D4/D6 rely on it.

Sources: https://api.github.com/repos/decentespresso/decaid/releases/latest ·
https://github.com/decentespresso/decaid/releases/tag/v0.8.8 ·
https://raw.githubusercontent.com/decentespresso/decaid/main/README.md ·
https://raw.githubusercontent.com/decentespresso/decaid/main/doc/AI_BUILD_NOTES.md ·
https://raw.githubusercontent.com/decentespresso/decaid/main/doc/AI_TESTING_NOTES.md ·
https://raw.githubusercontent.com/decentespresso/decaid/main/doc/DeviceManagement.md ·
https://raw.githubusercontent.com/decentespresso/decaid/main/lib/src/models/device/impl/mock_de1/mock_de1.dart

## 2. Profile v2 format

**Important finding: `doc/Profiles.md` does not itself define the step-level JSON schema.** It
documents Decaid's storage/REST layer around profiles (hashing, versioning, de1app-legacy
import) and explicitly defers the format, quoted verbatim: "The JSON profile format is based on
[Jeff Kletsky's v2 specification](https://pyde1.readthedocs.io/en/latest/profile_json.html)." The
tables below combine that external spec (prose, AI-extracted — **treat wording as high-confidence
but not guaranteed byte-exact**, per the method note) with Decaid's own bundled default-profile
JSON files (`assets/defaultProfiles/*.json`, real data, higher confidence since there is little
room for an LLM fetch tool to paraphrase literal JSON).

### Step fields

| Field | Type | Notes |
|---|---|---|
| `name` | string | label for UI |
| `transition` | `TransitionType` enum | how the target moves over the frame |
| `exit` | object, optional | `{type, condition, value}` — exit condition on flow or pressure |
| `volume` | number | mL dispensed that would exit the frame |
| `seconds` | number | frame duration that would exit the frame |
| `weight` | number, optional | grams that would exit the frame |
| `temperature` | number | target °C for the frame |
| `sensor` | `TemperatureSensor` enum | which sensor measures temperature |
| `pump` | `"pressure"` \| `"flow"` | which variable this step controls |
| `pressure` | number | target bar (set even on flow steps, as `""` when inactive — seen only in real data) |
| `flow` | number | target mL/s (same `""`-when-inactive convention) |
| `limiter` | object | `{value, range}` — "Pressure steps model flow limiters and flow steps model pressure limiters with a progressive response across each limiter's range of action" (quoted from `Profiles.md`) |

Top-level `Profile` fields seen in both the doc and real files: `title`, `author`, `notes`,
`beverage_type`, `steps`, `tank_temperature`, `target_weight`, `target_volume`,
`target_volume_count_start`, `version`; legacy-import-only fields seen in real files:
`legacy_profile_type`, `type`, `lang`, `hidden`, `reference_file`, `changes_since_last_espresso`.
Real bundled files ship every numeric value **as a JSON string**, not a JSON number.

### Enumerations (literal values)

| Enum | Values | Confidence |
|---|---|---|
| `pump` | `"pressure"`, `"flow"` | verified (real data + pyde1 spec agree) |
| `sensor` | `"coffee"` seen in real data; pyde1 spec also claims `"water"` | `"coffee"` verified; `"water"` **unverified** — not seen in any of the 3 real profile files checked |
| `transition` | `"fast"`, `"smooth"` | verified (both appear in real data and the spec) |
| `exit.type` | `"pressure"`, `"flow"` | verified — both appear in `best_practice.json` |
| `exit.condition` | `"over"`, `"under"` | verified — same file |
| `legacy_profile_type` (top-level) | `` `settings_2c` `` (advanced/frame-based, supported), `` `settings_2a` `` / `` `settings_2b` `` (basic pressure/flow, rejected on import), with aliases `` `settings_profile_advanced` ``, `` `settings_2c2` `` → `settings_2c`; `` `settings_2` ``, `` `settings_profile_pressure` `` → `settings_2a`; `` `settings_profile_flow` `` → `settings_2b` | verified from `Profiles.md`'s own backtick-quoted literals, and `"settings_2c"`/`"settings_2b"` confirmed present in real files |
| `beverage_type` (top-level) | de1app's `tea`, `filter`, `tea_portafilter` map to `pourover`; `descale` maps to `cleaning`; real files use `"espresso"` and `"manual"` directly | verified |

### Minimal example profile (verbatim from `assets/defaultProfiles/manual_flow.json`)

`doc/Profiles.md` contains no example profile, so this is the smallest of the three default
files actually checked (a smaller one may exist among the others, not enumerated):

```json
{
  "title": "GHC/manual flow control",
  "author": "Decent",
  "notes": "For use with machines that have a group head controller (GHC).  Hold your finger on the GHC for the flow you want.",
  "beverage_type": "manual",
  "steps": [
    {
      "name": "hold",
      "temperature": "88.0",
      "sensor": "coffee",
      "pump": "flow",
      "transition": "fast",
      "pressure": "",
      "flow": "0.0",
      "seconds": "60",
      "volume": "0",
      "weight": "0",
      "limiter": { "value": "9.0", "range": "0.9" }
    },
    {
      "name": "decline",
      "temperature": "88.0",
      "sensor": "coffee",
      "pump": "flow",
      "transition": "smooth",
      "pressure": "",
      "flow": "0.0",
      "seconds": "60",
      "volume": "0",
      "weight": "0",
      "limiter": { "value": "9.0", "range": "0.9" }
    }
  ],
  "tank_temperature": "0",
  "target_weight": "0",
  "target_volume": "0",
  "target_volume_count_start": "0",
  "legacy_profile_type": "settings_2b",
  "type": "flow",
  "lang": "en",
  "hidden": "0",
  "reference_file": "manual_flow",
  "changes_since_last_espresso": "",
  "version": "2"
}
```

Before D3 bakes this into the generator: confirm byte-exact whitespace/key order with a direct
raw fetch (the agent had no shell access), and confirm whether `sensor: "water"` is genuinely
accepted by Decaid (only the external spec claims it).

Sources: https://github.com/decentespresso/decaid/blob/main/doc/Profiles.md ·
https://pyde1.readthedocs.io/en/latest/profile_json.html ·
https://raw.githubusercontent.com/decentespresso/decaid/main/assets/defaultProfiles/best_practice.json ·
https://raw.githubusercontent.com/decentespresso/decaid/main/assets/defaultProfiles/cremina.json ·
https://raw.githubusercontent.com/decentespresso/decaid/main/assets/defaultProfiles/manual_flow.json

## 3. How Streamline is built

**Decaid's own `README.md` and `doc/Skins.md` link to a repository that no longer exists**:
both quote `https://github.com/allofmeng/streamline_project` as "Streamline.js" / "the Streamline
Project … reference implementation." A direct listing of that GitHub account's 10 public repos
(`api.github.com/users/allofmeng/repos`) contains no `streamline_project` — the link is dead.
(One query of `api.github.com/repos/allofmeng/streamline_project` twice returned data about an
unrelated repo instead of a 404 — a tool artifact, not a GitHub fact; the full-listing check is
the reliable evidence.)

**The actual, live Streamline repository**, found via the `decentespresso` org's repo list and
confirmed directly (not summarized — decoded raw base64 `package.json` content):
**https://github.com/decentespresso/streamline-js**, version 0.2.12, licence `ISC`. Its own
description: "A modern web UI skin for the Decent Espresso DE1, built on top of
[Streamline-Bridge (reaprime)](https://github.com/tadelv/reaprime). This is a full rewrite of the
original TCL-based Streamline skin into a browser-native web application — **no framework, no
bundler, just HTML/CSS/JS** served as static files."

- **Framework:** none (quoted above). Styling via Tailwind CSS + daisyUI.
- **Build tool:** `esbuild` (bundles the ECharts entry point to a minified ESM module) and the
  Tailwind CLI, run via `npm run build` = `build:css && build:echarts` (quoted from
  `package.json.scripts`).
- **Charting:** Apache **ECharts** `^6.1.0` — verified three independent ways: the
  `package.json` devDependency, the `src/modules/` file listing (`echarts-loader.js`,
  `echarts-renderer.js`, `echarts-streamline.min.js`), and `chart.js`'s source importing
  `loadECharts` from `echarts-loader.js`. (One single-source fetch of `docs/DEVELOPMENT.md`
  claimed "Plotly.js" — contradicted by all three corroborating sources above and treated as a
  fetch error, likely confused by a legacy `#plotly-chart` DOM id/comment left in `chart.js`.)
- **Gateway access:** ships `src/modules/api.js` with roughly 37 literal REST paths (e.g.
  `/api/v1/devices`, `/api/v1/machine/state`, `/api/v1/profiles`, `/api/v1/shots`,
  `/api/v1/beans`, `/api/v1/grinders`) and WebSocket paths including
  `/ws/v1/machine/snapshot`, `/ws/v1/machine/shotSettings`, `/ws/v1/machine/shotState`,
  `/ws/v1/scale/snapshot`, `/ws/v1/display`, plus a dedicated `reconnecting-websocket.js` module
  — consistent with Decaid's own skin rule to reconnect with backoff (`doc/Skins.md`, already
  quoted in `spec.md` §4.1).

**Comparison with the spec's proposal (TypeScript + Vite, Svelte):** Streamline-js took the
opposite route — no framework, no bundler-based dev loop, hand-written modules, with esbuild used
only for one third-party library (ECharts) and Tailwind for CSS. That fits a skin with few
screens and lets it ship pre-built vendor files so there is "no build step" for local dev (per
one single-source, unverified `DEVELOPMENT.md` claim). The spec's TS + Vite + Svelte stack is
heavier at the tooling layer but gets compile-time type checking of the API client and profile
generator, and Svelte's small-component model matches the spec's screen-per-phase editor better
than hand-rolled DOM code would. Streamline-js's own `api.js` is useful either way: its ~37
endpoint paths double as a worked example of the REST surface a skin actually uses day to day.

Sources: https://raw.githubusercontent.com/decentespresso/decaid/main/README.md ·
https://raw.githubusercontent.com/decentespresso/decaid/main/doc/Skins.md ·
https://api.github.com/users/allofmeng/repos ·
https://api.github.com/orgs/decentespresso/repos ·
https://api.github.com/repos/decentespresso/streamline-js ·
https://api.github.com/repos/decentespresso/streamline-js/contents/package.json ·
https://raw.githubusercontent.com/decentespresso/streamline-js/main/src/modules/api.js ·
https://raw.githubusercontent.com/decentespresso/streamline-js/main/src/modules/chart.js

## 4. What a shot record carries

**Yes, a shot record carries the profile, the bean and the grinder setting** — corroborated
across three independently-fetched sources, though the formal schema block itself could not be
retrieved in full (see caveat below):
- `doc/Skins.md`, quoted (paraphrase-quality single fetch): "When a shot is pulled, the current
  workflow context is saved with the shot record, creating a permanent record of which beans,
  grinder, and settings were used," preserving `grinderId`, `beanBatchId`, and display strings
  `grinderModel`, `coffeeName`, `coffeeRoaster`.
- `GET /api/v1/shots` (in `assets/api/rest_v1.yml`) exposes query filters `beanBatchId` and
  `profileTitle`, which only make sense if the underlying shot schema stores them.
- The mirrored `Workflow` object's `context` sub-object carries `grinderId`, `grinderModel`,
  `grinderSetting`, `beanBatchId`, `coffeeName`, `coffeeRoaster`, `targetDoseWeight`,
  `targetYield`, alongside a top-level `profile` object (the full profile, not just an ID).

**Caveat:** the formal `ShotRecord` component schema in `assets/api/rest_v1.yml` could not be
retrieved — the fetch tool truncated the file before reaching `components/schemas` on two
attempts. So the storage shape above is corroborated from three angles but the literal schema
block is **not independently quoted** — worth a direct raw fetch before relying on exact field
names in code.

**Can a skin write these back as "the current workflow"?** Yes: **`PUT /api/v1/workflow`**,
confirmed consistently across four independent fetches (`doc/Skins.md`, `doc/Api.md`,
`doc/Profiles.md`, and the OpenAPI spec itself). Quoted from the spec:
```yaml
/api/v1/workflow:
  get:
    summary: Get current workflow
  put:
    summary: Update current workflow
    description: |
      Updates the current workflow. This is the recommended method for applying
      changes to the machine and brewing parameters in one ordered mutation.
```
There is **no separate per-field endpoint** ("set current profile", "set current bean") —
`doc/Profiles.md`, quoted: "The Workflow API approach updates the entire workflow context
(profile + dose + grinder + coffee data)." This is distinct from the shot-record endpoints
(`GET/PUT/DELETE /api/v1/shots/{id}`), which only read/annotate a shot after it happened.

Sources: https://github.com/decentespresso/decaid/blob/main/doc/Skins.md ·
https://github.com/decentespresso/decaid/blob/main/doc/Api.md ·
https://github.com/decentespresso/decaid/blob/main/doc/Profiles.md ·
https://github.com/decentespresso/decaid/blob/main/assets/api/rest_v1.yml

## 5. Steam and scale

**Steam timer via `steamSettings`:** likely yes, field `duration`, set through
`PUT /api/v1/workflow` — but confidence is lower here because two independent fetches of the same
OpenAPI spec disagreed. Consistent evidence (seen in two separately-fetched example payloads,
with different example values each time, suggesting a real field sampled differently rather than
a fabricated one): `"steamSettings": {"targetTemperature": 155, "duration": 60, "flow": 0.9}` and
`{"targetTemperature": 150, "duration": 50, "flow": 0.8}`. `doc/Skins.md`, quoted: "The `duration`
field controls the maximum duration of a steaming operation and does not control steam-heater
preheating," and "Set `targetTemperature` to `0` to disable steam-heater preheating." `doc/Api.md`,
quoted: "The `steamSettings` object and all of its fields are non-nullable; explicit `null`
returns `400`." **Contradiction found:** a separate fetch of `doc/Api.md` searching the same
term came back saying duration was not mentioned and surfaced a different field,
`SteamSettings.stopAtTemperature`, instead. The formal `SteamSettings` schema could not be
retrieved in full (same truncation issue as §4) to resolve this. **Mark `duration` as unverified
at the schema level** — confirmed only in example payloads, not a quoted formal definition. The
endpoint (`PUT /api/v1/workflow`) is solid.

**Does the snapshot stream carry scale weight outside a shot?** **No — not on
`/ws/v1/machine/snapshot`.** Verified across three converging sources. The `MachineSnapshot`
schema (`assets/api/websocket_v1.yml`), quoted:
```yaml
MachineSnapshot:
  properties:
    timestamp: {...}
    state: {...}
    flow: {type: number}
    pressure: {type: number}
    targetFlow: {type: number}
    targetPressure: {type: number}
    mixTemperature: {...}
    groupTemperature: {type: number}
    targetMixTemperature: {...}
    targetGroupTemperature: {type: number}
    profileFrame: {type: integer}
    steamTemperature: {type: number}
```
No `weight` field. A case-insensitive search of the whole file for "weight" found it only under
two *other* schemas: `ScaleSnapshot` (`weight: number`, `weightFlow`) on channel
`/ws/v1/scale/snapshot`, and `AddressedScaleSnapshot` on `/ws/v1/scales/{id}/snapshot`.
`doc/Skins.md` independently corroborates the split: "Scale weight arrives via
`/ws/v1/scale/snapshot` with variable frequency … The snapshot WebSocket at
`/ws/v1/machine/snapshot` broadcasts complete machine state at ~10Hz … primary real-time data
feed for UI updates" (listing only machine telemetry, no weight). So: live scale weight, in or
out of a shot, requires subscribing to `/ws/v1/scale/snapshot` separately — this is good news for
3.4's steam-page weight/mug-size detection, which needs scale weight outside a shot.

Sources: https://github.com/decentespresso/decaid/blob/main/assets/api/rest_v1.yml ·
https://github.com/decentespresso/decaid/blob/main/assets/api/websocket_v1.yml ·
https://github.com/decentespresso/decaid/blob/main/doc/Api.md ·
https://github.com/decentespresso/decaid/blob/main/doc/Skins.md

## 6. The A-Flow plugin's generator (`code.tcl`)

Source: proc `update_A-Flow` in `code.tcl`, which always `lappend`s 9 steps, in this exact
order. **Toggles do not remove steps from the generated list** — a "disabled" step is a
0-duration/0-flow no-op step, not an absent one. This is a nuance for D3: the spec's own generator
(3.2, items 0-7) *does* omit steps outright (e.g. no "Ramp Down" step at all, since the founder
removed that phase) — so the new A-Flow 3.0 generator should not copy the plugin's
"always-append, zero-out-if-disabled" pattern for the phases the spec has already dropped.

| # | Step (plugin name) | Fields & values | Fixed vs. parameter | Included when |
|---|---|---|---|---|
| 1 | `pre_filling` ("Pre Fill") | `temperature` | parameter `$::Aflow_filling_temperature` | always (new-format profiles inherit other fields; old-format fallback uses fixed constants `flow 8.0`, `pressure 3.0`, `exit_pressure_over 3.00`, `seconds 1.00`) |
| 2 | `filling` ("Fill") | `temperature` | parameter (same variable) | always; other fields come from the loaded profile, not this proc |
| 3 | `soaking` ("Infuse") | `temperature`, `pressure`, `seconds`, `volume`, `weight` | all parameters (`$::Aflow_soaking_*`) | always |
| 4 | `2nd_fill` ("2nd Fill") | `seconds` = 15 (fixed) or 0 (fixed); `temperature` = parameter `$::Aflow_pouring_temperature` when on | fixed `seconds`, parameter `temperature` | `seconds`/`temperature` set only if `$::2nd_fill_step` toggle is on, else `seconds`=0 |
| 5 | `pause` ("Pause") | same condition/values as step 4 | fixed `seconds`, parameter `temperature` | same `$::2nd_fill_step` toggle |
| 6 | `ramp_up` ("Pressure Up") | `temperature`, `pressure` = parameters, unconditional; `seconds`, `exit_flow_over` = parameter formulas that halve/double depending on toggle | parameters with fixed /2 or ×2 multiplier | `seconds`/`exit_flow_over` formula branches on `$::ramp_down_enabled` |
| 7 | `ramp_down` ("Pressure Decline") | `temperature` = parameter; `exit_flow_under` = parameter + fixed 0.1; `seconds` = parameter formula (+1 if odd) when enabled, else 0 (fixed) | mixed | `seconds` only nonzero if `$::ramp_down_enabled` is on — this is the phase the spec's 3.0 removes entirely |
| 8 | `pouring_start` ("Flow Start") | `temperature`, `flow` = parameters, unconditional; `seconds`=10 (fixed), `exit_type`="flow_over" (fixed literal), `exit_if`=1 (fixed), `exit_flow_over` = parameter − fixed 0.1 | mixed | only active when the just-computed `ramp_up(seconds) < 1` — exactly spec item 6's "only if ramp time < 1 s" condition; else `seconds`=0 |
| 9 | `pouring` ("Flow Extraction") | `temperature`, `max_flow_or_pressure` = parameters, unconditional; `flow` = parameter × fixed 2 when `$::flow_extraction_up` is on, else 0 (fixed) | mixed | flow-ramp toggle `$::flow_extraction_up` |

Toggle defaults, found by direct search (all default to `false` if unset):
`$::ramp_down_enabled`, `$::flow_extraction_up`, `$::2nd_fill_step`. No hardcoded default numeric
values for the `Aflow_*` parameters themselves were found in `code.tcl` — the `prep` proc
populates them from whatever profile is currently loaded, so the effective defaults live in the
shipped profile files, not in the generator code; this was checked by direct search, not a full
read of `prep` — **moderately, not fully, verified**.

**Default profiles** (`profiles/` folder): `A-Flow____default-light.tcl`,
`-default-medium.tcl`, `-default-dark.tcl`, `-default-like-dflow.tcl`, `-default-very-dark.tcl`.
From the repo's `readme.md` (quoted): "default-light: profile for light roasts"; "default-medium:
profile for medium roasts"; "default-dark: profile for dark roasts"; "default-like-dflow: similar
to D-Flow, but with an increasing or decreasing flow"; "default-very-dark: profile with `Ramp
down` enabled, which works best with dark roasts." Only `default-medium` was extracted field-by-
field (budget-limited; the other four are qualitative only):

| Phase | flow | pressure | temperature | seconds | other |
|---|---|---|---|---|---|
| Pre Fill | 8.0 | 3.0 | 93 | 1.00 | exit pressure_over 3.00 |
| Fill | 8.0 | 3.0 | 93 | 15 | exit pressure_over 3.00 |
| Infuse | 0.0 | 3.0 | 93 | 60.0 | weight 3.6 |
| 2nd Fill | 8.0 | 0 | 95 | 0 | exit pressure_over 2.50 |
| Pause | 6.0 | 1.0 | 95 | 0 | exit flow_under 1.00 |
| Pressure Up | 8 | 10.0 | 93 | 10 | exit flow_over 2.0 |
| Pressure Decline | 8 | 1.0 | 93 | 0 | exit flow_under 2.1 |
| Flow Start | 2.0 | 3.0 | 93 | 0 | exit pressure_under |
| Flow Extraction | 4.0 | 3.0 | 93 | 60 | exit pressure_under |

Final target weight 36.0 g (standard) / 42.0 g (advanced), target volume 100 ml, type
`settings_2c`. These numbers came from a step-by-step extraction, not a single raw dump —
**reasonably but not fully verified**; worth a spot-check before use as fixture data.

**Licence: the `Jan3kJ/A_Flow` repository has no explicit licence.** No `LICENSE` file in the
root listing; `readme.md` was checked and does not contain the words "license"/"licence"
anywhere; `code.tcl`'s first line reads: "`### A-Flow profile editor by Janek, forked from Damian
Brakel's D-Flow profile ###`" — no licence statement there either. Absent an explicit licence,
default copyright applies (all rights reserved to the author). This is relevant to spec §4.4's
claim that "A-Flow is the founder's own code, so there is no inherited licence constraint" — see
§7 below.

Sources: https://raw.githubusercontent.com/Jan3kJ/A_Flow/main/code.tcl ·
https://raw.githubusercontent.com/Jan3kJ/A_Flow/main/readme.md ·
https://github.com/Jan3kJ/A_Flow/tree/main/profiles ·
https://raw.githubusercontent.com/Jan3kJ/A_Flow/main/profiles/A-Flow____default-medium.tcl

## 7. Open or contradicted

For the founder's attention; the spec itself is not edited here.

1. **A-Flow's licence status is less clear than §4.4 assumed.** `code.tcl` identifies the plugin
   as "forked from Damian Brakel's D-Flow profile." The founder's own additions may be freely
   licensable, but if meaningful code is inherited from D-Flow, that upstream work's licence
   (not checked by this research) could still apply to the shared parts. Worth a direct check of
   the D-Flow repository's licence before settling the skin's own public licence (open question
   5 in the spec).
2. **`doc/Profiles.md` does not itself contain the profile v2 enumerations the roadmap (§7, D1)
   expected to find there.** It defers to an external spec (pyde1) for the step schema; one
   enum value (`sensor: "water"`) is asserted only by that external page and was not observed in
   any of Decaid's own shipped profile files. Recommend confirming directly against a running
   Decaid instance (or a broader scan of its real profile library) before D3 treats `"water"` as
   a supported value.
3. **Decaid's own docs link to a dead "Streamline" repository** (`allofmeng/streamline_project`)
   — stale, not currently reachable. The actual live skin, `decentespresso/streamline-js`, is a
   full rewrite and not what the dead link implies ("Streamline.js" suggests the old
   Tcl-based skin might still be JS-wrapped; it is a from-scratch static HTML/CSS/JS app). Not a
   contradiction of the local spec, but worth flagging since the spec names Streamline as "the
   reference implementation" without knowing this history.
4. **Two unresolved internal contradictions in Decaid's own docs**, not resolvable without a
   raw/complete fetch of `assets/api/rest_v1.yml`'s `components/schemas` section: whether the
   steam timer field is `steamSettings.duration` or `SteamSettings.stopAtTemperature` (§5), and
   the exact `ShotRecord` schema shape (§4). Both are corroborated well enough to proceed, but
   should be re-checked with direct file access (not an AI-summarizing fetch tool) before D4's
   API client locks in field names.
5. **The simulated-shot-to-WebSocket wiring (§1) is inferred, not read directly.** Before D2/D4
   build against it, connect a WebSocket client to a Decaid instance running
   `--dart-define=simulate=1` and confirm `/ws/v1/machine/snapshot` actually streams simulated
   data end to end.

Sources: see §§1-6 above (no new sources for this section; it synthesizes contradictions already
cited).

## 8. Test rig (D2b)

Done on 2026-10-11 on the team's Windows 10 x64 machine, by running the prebuilt Decaid
v0.8.8 (build `aab5f938`). Every claim is marked **seen running** (a request was sent to the
running gateway and the response is quoted), **read** (taken from a file in the release ZIP or
from the source at the release commit, not exercised) or **not seen**.

**Result: the prebuilt release runs with device simulation. No source build is needed.** A
full simulated shot runs and feeds both snapshot streams. The limits are in 8.7: simulated
steam never ends by itself, and the simulated scale's weight cannot be set from outside.

### 8.1 What the release offers for simulation

| Claim | Status |
|---|---|
| The release has a runtime setting `simulatedDevices` (a list of `machine`, `scale`, `sensor`, `bengle`) in `GET` / `POST /api/v1/settings`. No `--dart-define` is needed | seen running |
| It is the same setting as **Settings → Simulated Devices** in the app | read (source); the app's window was not seen |
| With `["machine","scale"]` a scan finds and connects `MockDe1` (machine, model `DE1Pro`, serial `mock-de1`) and `MockScale` ("Mock Scale") | seen running |
| The setting is stored (`%APPDATA%\net.tadel\Decaid\shared_preferences.json`), and Decaid remembers the two devices as preferred. After a restart the machine was connected again without any API call | seen running |
| **First start: the device services are only initialised after the onboarding screens.** Until someone clicks through them, a scan finds nothing (and stays at `"scanning":true`) even with the setting on. The command-line flag `--bypass-onboarding` skips them and marks onboarding as done for later starts | seen running; the cause was read in `onboarding_feature/steps/initialization_step.dart` |
| Other flags of the release: `--serial` (no Bluetooth scan), `--direct`, `--skin <id>`, **`--skin-path <folder>`** (serve a skin straight from a folder), `--no-account`, `--print-storage-paths` | read (`lib/src/cli/cli_args.dart`); only `--bypass-onboarding` and `--serial` were run |
| The `debug` endpoints (`/api/v1/debug/scale/{command}`, `/debug/machine/{command}`, `/debug/replay/...`) need a build with `--dart-define=simulate=...`. In the release `GET /api/v1/debug/flow-smoothing` answers `404 Route not found` | seen running for that one endpoint; read (`rest_v1.yml`) for the others |
| The `replay` simulator (`MockReplayDe1`) is not in the setting's list of allowed values, so it needs a source build | read (`rest_v1.yml`), not tried |
| The app also has a "Try Demo Mode" button for a start without devices | read (string in the binary), not tried |
| The gateway listens on `0.0.0.0:8080`, the API docs on `:4001` | seen running |
| The gateway answers CORS requests from another origin: `access-control-allow-origin` echoes the `Origin` header, the preflight answers `200`. A skin on the Vite dev server can call it directly | seen running with `Origin: http://localhost:5173` |
| The bundled Streamline skin was served on `localhost:27906`, not on a port "from 24800" as `spec.md` 4.1 says. `GET /api/v1/webui/server/status` gives the real port | seen running |
| The release ZIP holds the full API description: `data/flutter_assets/assets/api/rest_v1.yml` (8916 lines) and `websocket_v1.yml` (1110 lines), and the default profiles as JSON. Use these instead of fetched web pages | read |

Request and response that switch simulation on:

```
POST /api/v1/settings   {"simulatedDevices":["machine","scale"]}      -> 200 null
GET  /api/v1/devices/scan                                          -> 200 (after 15 s)
[{"name":"Mock Scale","id":"MockScale","state":"connected","type":"scale","available":true,"connectionRole":"primary"},
 {"name":"MockDe1","id":"MockDe1","state":"connected","type":"machine","available":true}]
GET  /api/v1/machine/state                                         -> 200
{"timestamp":"2026-10-11T12:23:05.107650","state":{"state":"idle","substate":"idle"},"flow":0.0,"pressure":0.0,
 "targetFlow":0.0,"targetPressure":0.0,"mixTemperature":13.0,"groupTemperature":13.0,"targetMixTemperature":90.0,
 "targetGroupTemperature":90.0,"profileFrame":0,"steamTemperature":26}
```

Without a machine, `GET /api/v1/machine/state` answers
`500 {"error":"DeviceNotConnectedException: machine not connected"}` (seen running).
Posting a value the setting already has changes nothing (read in `settings_controller.dart`).

### 8.2 Does a simulated shot run from start to end and feed the snapshot stream? Yes

**Seen running.** Profile "A-Flow / default-medium" (`profile:6c8161b8fe267a5be64e`), target
yield 36 g, both WebSockets open:

```
PUT /api/v1/workflow  {"profile":{...},"context":{"targetDoseWeight":18,"targetYield":36,"coffeeName":"Rig Bean A",
                       "coffeeRoaster":"Rig","grinderModel":"Rig Grinder","grinderSetting":"5.2"}}   -> 200 (the whole workflow)
PUT /api/v1/scale/tare                                                                              -> 200 null
PUT /api/v1/machine/state/espresso                                                                  -> 200 null
```

`/ws/v1/machine/snapshot`, state / substate / profile frame as they changed (seconds after
the script started; the shot was requested at 3.1; `weight` is from `/ws/v1/scale/snapshot`):

```
 0.2 idle/idle/frame0                 pressure=0.00  flow=0.00 weight=0
 3.1 espresso/preparingForShot/frame0 pressure=0.11  flow=2.80 weight=0
 3.6 espresso/preinfusion/frame0      pressure=0.68  flow=7.40 weight=0
 4.0 espresso/preinfusion/frame1      pressure=0.84  flow=7.89 weight=0
 8.0 espresso/pouring/frame2          pressure=3.22  flow=8.00 weight=0
12.1 espresso/preparingForShot/frame4 pressure=3.43  flow=1.66 weight=2.19
12.3 espresso/preparingForShot/frame5 pressure=1.00  flow=0.45 weight=2.53
12.7 espresso/pouring/frame5          pressure=1.27  flow=0.53 weight=2.67
20.3 espresso/pouring/frame6          pressure=10.00 flow=2.50 weight=11.25
20.4 espresso/pouring/frame7          pressure=1.00  flow=0.25 weight=11.46
20.5 espresso/pouring/frame8          pressure=1.85  flow=0.86 weight=11.46
31.1 idle/idle/frame0                 pressure=0.00  flow=0.00 weight=34.07
```

- The shot took 28 s and ended by itself: Decaid stopped it at the target weight. The stored
  record says `"stopReason":"targetWeight"` and `"actualYield":34.3` for a target of 36, so
  the cup ended 1.7 g under the target. A test for "stops at the target weight" needs a
  tolerance.
- The mock follows the profile's steps: frames 0, 1, 2, 4, 5, 6, 7, 8 were seen (frame 3, the
  2nd fill with 0 s, was skipped), pressure reached 10.0 bar and flow 8.0 ml/s. The substate
  is not monotonic (`preparingForShot` came back at frame 4), so the UI must not derive the
  phase from the substate alone; `profileFrame` says which step runs.
- Frame rate of `/ws/v1/machine/snapshot`: about 10 per second during the shot (287 frames
  in 31 s), about 2 per second while idle (6 frames in 3 s). The first frame arrives right
  after connecting.
- A frame, verbatim: `{"timestamp":"2026-10-11T12:23:39.408036","state":{"state":"idle","substate":"idle"},"flow":0.0,"pressure":0.0,"targetFlow":0.0,"targetPressure":0.0,"mixTemperature":44.0,"groupTemperature":44.0,"targetMixTemperature":93.0,"targetGroupTemperature":93.0,"profileFrame":0,"steamTemperature":88}`.
  There is no weight in it.
- `/ws/v1/machine/shotState` also works: `state` went `idle` → `preheating` → `pouring` →
  `stopping` → `finished` → `idle`, with one `shotId` for the whole shot and a `decision`
  event at every frame change and at the stop.
- The simulated machine starts cold (13 °C) and heats up; the shot above was started at
  44 °C and ran.

### 8.3 Which field sets the steam timer? `steamSettings.duration`

**Seen running.**

```
PUT /api/v1/workflow  {"steamSettings":{"duration":8}}
  -> 200, "steamSettings":{"targetTemperature":150,"duration":8,"flow":0.8,"stopAtTemperature":0}
/ws/v1/machine/shotSettings, first frame after it:
  {"steamSetting":0,"targetSteamTemp":150,"targetSteamDuration":8,"targetHotWaterTemp":75,"targetHotWaterVolume":50,
   "targetHotWaterDuration":30,"targetShotVolume":36,"groupTemp":94.0}

PUT /api/v1/workflow  {"steamSettings":{"stopAtTemperature":40,"duration":50}}
  -> 200, "steamSettings":{"targetTemperature":150,"duration":50,"flow":0.8,"stopAtTemperature":40}
/ws/v1/machine/shotSettings: "targetSteamDuration":50, and no field for the stop temperature

PUT /api/v1/workflow  {"steamSettings":{"duration":null}}
  -> 400 {"error":"Invalid request","message":"FormatException: Field \"duration\" cannot be null"}
```

- `duration` (whole seconds) is what reaches the machine, as `targetSteamDuration`. The body
  may hold only the field that changes; the other steam fields keep their values.
- Both fields exist, which explains the contradiction in the first research.
  `stopAtTemperature` is for a milk probe. It is stored and returned but does not show up in
  the machine's shot settings. `rest_v1.yml` says about it: "Scaffolding only today — no
  machine in production has an integrated probe wired, so the field round-trips but does not
  affect machine behaviour" (read).
- Not seen: a machine that stops steaming when the duration is over. The simulated machine
  does not (8.7), so this stays a check on the real DE1.

### 8.4 The `ShotRecord` schema

**Seen running** for every field with a value below (the record of the shot in 8.2); it
matches `components/schemas/ShotRecord` in the release's `rest_v1.yml`. Fields marked
"per schema" were only read.

```
GET /api/v1/shots/latest   -> 200, 3 144 bytes, no measurements (schema ShotRecordSummary)
GET /api/v1/shots?limit=5  -> 200, {"items":[ ...summaries... ], ...}
GET /api/v1/shots/{id}     -> 200, 150 174 bytes, with 278 measurements (schema ShotRecord)
```

```
id            "ee7495ea-e744-4db8-93e2-a91f706c7e52"   the shotId of /ws/v1/machine/shotState
timestamp     "2026-10-11T12:23:42.408198"             shot start, local time, no zone
createdAt     "2026-10-11T10:24:14.310637Z"            UTC
updatedAt     "2026-10-11T10:24:14.310637Z"            UTC
stopReason    "targetWeight"       per schema an open set: targetWeight, targetVolume, apiStop, appStop,
                                   machineEnded, error
annotations   {"actualDoseWeight":18,"actualYield":34.3}
              per schema also: drinkTds, drinkEy, enjoyment (0-10), espressoNotes, extras
workflow      the whole workflow as it was at the shot:
  id, name, description
  profile       the full v2 profile (title, notes, author, beverage_type, steps, target_weight, ...)
  context       {"targetDoseWeight":18,"targetYield":36,"grinderModel":"Rig Grinder","grinderSetting":"5.2",
                 "coffeeName":"Rig Bean A","coffeeRoaster":"Rig"}
                per schema also: targetWaterVolume, grinderId, beanBatchId, finalBeverageType,
                baristaName, drinkerName
  steamSettings {"targetTemperature":150,"duration":50,"flow":0.8,"stopAtTemperature":0}
  hotWaterData  {"targetTemperature":75,"duration":30,"volume":50,"flow":10}
  rinseData     {"targetTemperature":90,"duration":10,"flow":6}
  machine       {"provenanceStatus":"captured","flowCalibration":1,"serialNumber":"mock-de1","model":"DE1Pro",
                 "firmwareVersion":"1337"}
measurements  only in GET /api/v1/shots/{id}; one entry per machine frame (278 for 27.7 s):
  machine       a MachineSnapshot, the same fields as a frame of /ws/v1/machine/snapshot
  scale         {"timestamp":"...","weight":6.205,"weightFlow":0.930,"battery":100,"timerValue":13305}
  volume        10.06     ml since shot start
```

What this means for the history overlay (spec 3.5): the list comes from `GET /api/v1/shots`
(summaries carry profile, bean and grinder setting, so an entry can be built without the
measurements), and the graph of one entry needs one `GET /api/v1/shots/{id}`. The profile is
stored as a copy inside the shot, not as a profile id. `GET /api/v1/shots` has the filters
`beanBatchId` and `profileTitle` (read, not tried). Steam runs are stored separately
(`GET /api/v1/steams/latest` and `/steams/{id}`: seen running, 8.7).

### 8.5 Is the scale weight streamed on `/ws/v1/scale/snapshot` outside a shot? Yes

**Seen running**, with the machine idle after the shot had ended:

```
ws://localhost:8080/ws/v1/scale/snapshot
{"status":"connected"}
{"timestamp":"2026-10-11T12:24:26.313996","weight":34.31715970191449,"weightFlow":0.0,"battery":100,"timerValue":27499}
{"timestamp":"2026-10-11T12:24:26.514056","weight":34.31715970191449,"weightFlow":0.0,"battery":100,"timerValue":27499}
```

- About 5 frames per second: 16 frames in 3 s while idle, 156 in 31 s around the shot, 218
  in 43 s around a steam run.
- **The first frame is a status frame without a weight** (`{"status":"connected"}`). The
  client must not read `weight` from every frame.
- `PUT /api/v1/scale/tare` outside a shot answers `200 null`, and the next frames carry
  `"weight":0.0`.
- `weight` is unrounded (34.31715970191449); the skin rounds for display.

### 8.6 Profiles: answers that fell out of the run

- **The API returns and accepts numbers as JSON numbers.** `GET /api/v1/profiles` gives
  `"temperature":93`, `"seconds":1`, and `PUT /api/v1/workflow` took the same object back.
  Seen running. The bundled *files* (`assets/defaultProfiles/*.json`) hold the same values as
  strings (`"temperature": "93.0"`), indented by two spaces, with the top-level key order
  `version`, `title`, `author`, `notes`, `beverage_type`, `steps`, `tank_temperature`,
  `target_weight`, `target_volume`, `target_volume_count_start`, `type`, `hidden` (read, in
  `A-Flow____default-medium.json`). The skin talks to the API, so the generator produces
  numbers; the file format only matters for an export.
- A stored profile is wrapped in a record: `id` (`profile:<20 hex>`), `profile`,
  `metadataHash`, `compoundHash`, `parentId`, `visibility`, `isDefault`, `createdAt`,
  `updatedAt`, `metadata` (`{"source":"bundled","filename":"..."}`). Seen running;
  `GET /api/v1/profiles` returned 73 of them.
- **Decaid ships the five A-Flow default profiles** (`isDefault: true`). Their values, from
  `GET /api/v1/profiles` (seen running). Every step has `sensor: "coffee"`, `volume: 100`
  and a limiter range of 0.6; all five have `target_volume: 100`,
  `target_volume_count_start: 2`, `tank_temperature: 0`. A cell reads: the pump's target
  (ml/s for a flow step, bar for a pressure step), temperature, seconds, exit weight if any,
  limiter value (`lim`).

  | Step (pump, transition) | light | medium | dark | very-dark | like-dflow |
  |---|---|---|---|---|---|
  | `target_weight` | 48 | 42 | 36 | 32 | 36 |
  | Pre Fill (flow, fast) | 8, 95°, 1 s, lim 8 | 8, 93°, 1 s, lim 8 | 8, 93°, 1 s, lim 8 | 8, 93°, 1 s, lim 8 | 8, 93°, 1 s, lim 8 |
  | Fill (flow, fast), exit pressure over 3 | 8, 95°, 15 s, lim 8 | 8, 93°, 15 s, lim 8 | 8, 93°, 15 s, lim 8 | 8, 93°, 15 s, lim 8 | 8, 93°, 15 s, lim 8 |
  | Infuse (pressure, fast) | 3, 95°, 60 s, 6 g, lim 1 | 3, 93°, 60 s, 3.6 g, lim 1 | 3, 93°, 10 s, 2 g, lim 1 | 3, 93°, 6 s, 2 g, lim 1 | 3, 93°, 60 s, 4 g, lim 1 |
  | 2nd Fill (flow, fast), exit pressure over 2.5 | 8, 95°, 0 s, lim 3 | same | same | same | same |
  | Pause (pressure, fast), exit flow under 1 | 1, 95°, 15 s, lim 1 | same | same | same | same |
  | Pressure Up (pressure, smooth), lim 0 | 9.5, 95°, 10 s, exit flow over 3 | 10, 93°, 10 s, exit flow over 2 | 9, 88°, 5 s, exit flow over 2 | 10, 88°, 3 s, exit flow over 3.6 | 10, 93°, 0 s, exit flow over 2 |
  | Pressure Decline (pressure, smooth), lim 0 | 1, 95°, 0 s, exit flow under 3.1 | 1, 93°, 0 s, exit flow under 2.1 | 1, 88°, 0 s, exit flow under 2.1 | 1, 88°, 3 s, exit flow under 1.9 | 1, 93°, 0 s, exit flow under 2.1 |
  | Flow Start (flow, fast), lim 0 | 3, 95°, 0 s | 2, 93°, 0 s | 2, 88°, 0 s | 1.8, 88°, 0 s | 2, 93°, 10 s, exit flow over 1.9 |
  | Flow Extraction (flow, smooth) | 6, 95°, 60 s, lim 9.5 | 4, 93°, 60 s, lim 10 | 0, 88°, 60 s, lim 9 | 3.6, 88°, 60 s, lim 10 | 4, 93°, 60 s, lim 10 |

  Two differences to the table in section 6: in Decaid's `default-medium` the Pause step has
  15 s, not 0 s, and the profile's `target_weight` is 42. In all five the 2nd Fill has 0 s
  while the Pause keeps 15 s. These are Decaid's conversions; whether they equal the
  plugin's `.tcl` files was not compared. The complete steps are in the release's
  `assets/defaultProfiles/A-Flow____default-*.json`.

### 8.7 Limits of the simulation

| Claim | Status |
|---|---|
| **Simulated steam does not end by itself.** With `duration: 8`, `PUT /api/v1/machine/state/steam` put the machine in `steam/idle`, and it was still there after 40 s. `PUT /api/v1/machine/state/idle` ended it | seen running |
| **Simulated steam has no curve.** Pressure and flow stay 0.00 and `steamTemperature` stays at 150 for the whole run. About 2 frames per second | seen running |
| A steam run is recorded: `GET /api/v1/steams/latest` → `id`, `timestamp`, `workflow`; `GET /api/v1/steams/{id}` adds `measurements` of `{"machine":{...},"milkTemperature":null}` | seen running |
| **The simulated scale's weight cannot be set.** It rose during the simulated shot and kept the last value (34.3 g) until a tare. No endpoint of the release puts a mug on the mock scale | seen running for the behaviour; that no endpoint exists was read in `rest_v1.yml` |
| `GET /api/v1/machine/capabilities` answers `{"capabilities":[]}` for the mock machine | seen running |
| Sleep and wake, hot water, flush, the `block_tare_during_shot` 400, a second shot giving a second history entry, skin install by URL or ZIP, `--skin-path`, Playwright against the gateway | not seen: not tried in this task |
| The Decaid window itself | not seen: the Windows session was disconnected, so no screenshot was possible. Everything was driven through the API. The bundled Streamline skin did load inside Decaid (log: `SkinView - Page finished loading: http://localhost:27906/`) |

What follows for the acceptance tests (spec section 5, not changed here): item 2 (shot) can
run against the simulation as written, with a tolerance on the final weight. Item 4 (steam)
cannot get the mug weights s, m and l from the mock scale, and the mock machine will not
show a timer running out. The simulation can still check that the skin sends the computed
seconds as `steamSettings.duration` and that Decaid reports them back as
`targetSteamDuration`. The scale frames would have to come from somewhere else, for example
from Playwright's WebSocket routing in front of `/ws/v1/scale/snapshot`. That is a decision
for the owner.

### 8.8 Start the rig again

The rig is in `..\decaid-rig`, outside the repository: the release ZIP (50 220 823 bytes,
SHA-256 `f78ec23fede5eedd9421301dca1c03d0ec1d9705aa5c41aab3cefe39edfc943e`, equal to the
release's `SHA256SUMS.txt`), unpacked in `decaid-0.8.8\`, three small Node scripts
(`ws.mjs`, `shot.mjs`, `steam.mjs`) and the recorded responses in `log\`. Decaid keeps its
own state in `%APPDATA%\net.tadel\Decaid` (37 MB: settings, database, installed skins).
Nothing was installed; the ZIP needs no installer.

1. Get the release, once (PowerShell):
   ```
   mkdir ..\decaid-rig; cd ..\decaid-rig
   curl.exe -sSLO https://github.com/decentespresso/decaid/releases/download/v0.8.8/decaid-windows-x64-0.8.8.zip
   Expand-Archive decaid-windows-x64-0.8.8.zip decaid-0.8.8
   ```
2. Start Decaid:
   ```
   Start-Process ..\decaid-rig\decaid-0.8.8\Decaid.exe -ArgumentList "--bypass-onboarding" -WorkingDirectory ..\decaid-rig\decaid-0.8.8
   ```
   The gateway answered 1 s later: `curl.exe http://localhost:8080/api/v1/info` →
   `{"commit":"aab5f938...","version":"0.8.8","buildNumber":"2900",...}`.
3. Switch simulation on, once per machine (it is stored), then scan:
   ```
   curl.exe -X POST -H "Content-Type: application/json" -d '{\"simulatedDevices\":[\"machine\",\"scale\"]}' http://localhost:8080/api/v1/settings
   curl.exe http://localhost:8080/api/v1/devices/scan
   ```
   The scan took 15 s (it also searches Bluetooth; `--serial` in step 2 leaves that out and
   a scan then takes under a second) and returned `MockDe1` and `MockScale` as `connected`.
   This order, on a Decaid without simulated devices, was run once more at the end and
   worked. On later starts step 2 alone is enough: Decaid connects both by itself (seen:
   both connected 25 s after one start, the machine connected 61 s after another).
4. Check: `curl.exe http://localhost:8080/api/v1/machine/state` → `200` with
   `"state":{"state":"idle","substate":"idle"}`.
5. A shot: `PUT /api/v1/workflow` with a profile and `context.targetYield`, then
   `PUT /api/v1/machine/state/espresso`; watch `ws://localhost:8080/ws/v1/machine/snapshot`
   and `/ws/v1/scale/snapshot`. `node shot.mjs profile:6c8161b8fe267a5be64e 36` does all of
   it. Node 24 has `WebSocket` and `fetch` built in, so the scripts need no package.
6. Stop: close the window, or `(Get-Process Decaid).CloseMainWindow()`. Decaid exited
   cleanly every time, and port 8080 was free afterwards.

To start from zero, delete `%APPDATA%\net.tadel\Decaid`. This run left Decaid with
`gatewayMode: "tracking"` (it started as `"disabled"`; this task never set it), with
onboarding marked as done and the two mock devices as preferred devices. Decaid is stopped.

### 8.9 If a source build is ever needed

Not needed for the rig. It would be needed for the `debug` endpoints or the `replay`
simulator (8.1), and it needs the owner's approval. What it takes, from section 1 (read, not
tried): the Flutter SDK (README: "3.7.0 or later"; the pinned version is not known), Visual
Studio with its C++ desktop tools for a Windows build, a clone of `decentespresso/decaid`,
and a build with `--dart-define=simulate=1`. A Linux build runs in Docker instead
(`make build-amd`).

Sources: the release `decaid-windows-x64-0.8.8.zip` from
https://github.com/decentespresso/decaid/releases/tag/v0.8.8 (the running app, and its files
`assets/api/rest_v1.yml`, `assets/api/websocket_v1.yml`, `assets/defaultProfiles/*.json`) ·
seven source files read on GitHub at commit `aab5f938`, to find out why the first scans
found nothing: `lib/main.dart`, `lib/src/cli/cli_args.dart`,
`lib/src/services/simulated_device_service.dart`,
`lib/src/settings/settings_controller.dart`,
`lib/src/services/webserver/settings_handler.dart`,
`lib/src/controllers/device_controller.dart`,
`lib/src/onboarding_feature/steps/initialization_step.dart`.

## 9. API client (D4)

Done on 2026-10-12. The client is `src/api/`: `client.ts` (REST), `stream.ts` (the two
snapshot streams) and `types.ts`, plain TypeScript without Svelte. Field names are from the
release's `rest_v1.yml` and `websocket_v1.yml`. `scripts/rig-smoke.mjs` runs the same client
against the rig: Node 24 imports the TypeScript files directly, so the check needs no build.
Its output is in [d4-rig-smoke.txt](d4-rig-smoke.txt) (and in the rig's `log\`). It was run
with `node scripts/rig-smoke.mjs --tare-block --sleep` against Decaid v0.8.8, started as in
8.8 step 2; all 11 checks passed.

Every claim is marked **seen running** (the script sent the request and the answer is in its
output), **read** (from a file of the release or from `doc/Skins.md` at tag `v0.8.8`) or
**not seen**.

### 9.1 What the rig check showed

| Claim | Status |
|---|---|
| Decaid started with step 2 alone; `GET /api/v1/machine/state` answered `200` with `"state":{"state":"idle","substate":"idle"}` within 50 s of the start (not timed more closely) | seen running |
| `/ws/v1/machine/snapshot` delivers frames through the stream class: 5 frames in 3 s while idle, each a `MachineSnapshot` without a weight | seen running |
| `/ws/v1/scale/snapshot` delivers frames: 16 in 3 s. The first is `{"status":"connected"}`, the second a weight frame. With no timer running, `timerValue` is `null` | seen running |
| `PUT /api/v1/scale/tare` outside a shot answers `200 null`, and the next weight is 0 | seen running |
| **A tare during a shot answers `400 {"details":"Tare blocked: a shot is in progress","type":"block_tare_during_shot"}`**, but only with the setting `blockTareDuringShot` on (`POST /api/v1/settings`); it is off by default. The client throws a `TareBlockedError` for it. After the shot a tare answers 200 again | seen running, in gateway mode `tracking` |
| In gateway mode `full` the tare is never blocked | read (`rest_v1.yml`), not tried |
| `GET /api/v1/webui/server/status` → `{"serving":true,"path":"...\web-ui\streamline.js","port":27906,"ip":"localhost"}`, and `http://localhost:27906/` answers 200 with HTML | seen running |
| The port is the same as on 2026-10-11 (8.1), over several starts of Decaid | seen running |
| Each installed skin has its own port, "derived from the skin's identity and remembered across restarts"; "Ports are assigned from 24800 upward. 3000, 4001 and 8080 are reserved"; `localhost:3000` redirects to the skin. If the port is taken, Decaid uses a temporary port for that run, and `localStorage` written under the usual port is not visible then; the KV store is not affected | read (`doc/Skins.md`) |
| The port Decaid gives to this skin | not seen: the skin was not installed in Decaid |
| `PUT /api/v1/machine/state/sleeping` puts the machine to sleep (`sleeping/idle`), `.../idle` wakes it. The state's name is `sleeping`, not `sleep` | seen running |
| While the machine sleeps the scale stream sends `{"status":"disconnected"}` and no weights, and after the wake `{"status":"connected"}` and weights again, all on one socket: the stream stayed `open` and did not reconnect. (The rig has `scalePowerMode: "disconnect"`, so the scale is dropped when the machine sleeps) | seen running |
| `PUT /api/v1/workflow` with only `{"steamSettings":{"duration":51}}` or only `{"context":{"targetYield":37}}` changes that one value and returns the whole workflow | seen running |
| `GET /api/v1/shots?limit=5`, `/shots/latest` (no measurements) and `/shots/{id}` (278 measurements) fit the client's types | seen running |
| A reconnect after the gateway went away, and an error frame on one of the two streams | not seen on the rig; covered by the tests with a fake WebSocket |

### 9.2 Profile notes and the KV store: both hold a string

For the question where a profile's A-Flow parameters are stored (spec 3.2 and 8). These are
the facts; the decision is not made here.

| Claim | Status |
|---|---|
| A profile's `notes` is a string. 161 characters of JSON text with quotes, a line break, `°` and `ü` came back unchanged from `POST /api/v1/profiles`, from `GET /api/v1/profiles/{id}` and from the list | seen running |
| A KV value is any JSON value. A string and an object (with nested object, list, number, boolean, `null`) both came back unchanged from `POST` then `GET /api/v1/store/{namespace}/{key}` | seen running |
| **A profile's id is a hash of its steps and targets, not of its notes.** The same profile posted again with other notes returned the existing record: the same id, the old notes, `parentId: null` although a parent id was sent. No error | seen running |
| `PUT /api/v1/profiles/{id}` with the other notes changed them: the same id, a new `metadataHash` | seen running |
| So a `POST` cannot give new notes to a profile whose steps already exist, for example one that equals a bundled default; that takes a `PUT`. And a default profile's content cannot be changed with `PUT`, "only metadata" | the first part seen running; the default-profile rule read (`rest_v1.yml`), not tried |
| A KV key that does not exist answers `200 null`, not 404 as `doc/Skins.md` says. The client returns `null` for both | seen running |
| `POST /api/v1/store/...` answers `200 {}`, not 204 as `rest_v1.yml` says. `DELETE` removes the key | seen running |
| The KV store lives in the app, so it does not depend on the skin's port | read (`doc/Skins.md`) |
| The longest string `notes` or a KV value can hold | not seen: not tried beyond 161 characters |

### 9.3 Two more findings

- **`POST /api/v1/machine/profile` does not change the workflow.** It answered 200, and
  `GET /api/v1/workflow` still held the profile from before (seen running: the title was
  unchanged). A shot record copies the workflow's profile (8.4), so a profile loaded this way
  would not be the one in the history. `PUT /api/v1/workflow` with `profile` does both (8.2).
  Which of the two the skin uses to load a profile is a decision for D6; spec 3.1 names
  `POST /api/v1/machine/profile`.
- **Stopping Decaid.** `(Get-Process Decaid).CloseMainWindow()` (8.8, step 6) returned false
  this time: the process had no window handle, because the Windows session had no desktop.
  It was ended with `Stop-Process -Force`. Afterwards no Decaid process was running and
  ports 8080 and 27906 were free (seen running).

### 9.4 The reconnect rule

`doc/Skins.md` has two rules, and the stream class follows both (read; the tests cover them):
reconnect after the socket closed, with a delay that doubles from 1 s to at most 30 s and
starts again after a successful open; and "Do not reconnect the WebSocket on an error. The
socket stays open across errors". The second is written for `/ws/v1/devices`, whose frames
carry a `connectionStatus.error`, and for the scale stream, which reports a lost scale as
`{"status":"disconnected"}` on the open socket. So a frame never makes the stream reconnect.
One case goes beyond the document and is this client's own choice: when the gateway sends an
error frame (`{"error":...}` or `{"e":...}`) and then closes the socket, the stream stops in
the state `failed` and does not retry until `connect()` is called. Neither of the two
snapshot streams is documented to do that.

What the run left in the rig: nothing. The test profile, the KV keys (namespace
`decaid-skin-rig-smoke`) and the shot of the blocked-tare check were deleted again, and
`blockTareDuringShot` is back to `false`. The shot history holds the one shot of 8.2.

Sources: the running Decaid v0.8.8 on the rig · `rest_v1.yml` and `websocket_v1.yml` in the
release · https://raw.githubusercontent.com/decentespresso/decaid/v0.8.8/doc/Skins.md

## 10. Shell, home, picker and espresso screen (D6)

Done on 2026-10-13 against Decaid v0.8.8 on the rig, started as in 8.8 step 2 and ended with
`Stop-Process -Force` (9.3). The machine state answered 200 about 10 s after the start this
time. Every claim is **seen running** unless marked otherwise.

### 10.1 What the gateway does by itself

| Claim | Status |
|---|---|
| **Decaid stops a shot at the workflow's `context.targetYield`, not at the profile's `target_weight`.** With the bundled default-medium (`target_weight` 42) and `targetYield` 36 the shot ended at 34.1 g with `stopReason: "targetWeight"`; with the 3.0 default-medium and `targetYield` 42 it ended at 40.4 g. The skin sends no stop of its own | seen running, three shots |
| **`PUT /api/v1/workflow` with only a `profile` leaves `context.targetYield` as it was** (a profile with `target_weight` 48 was loaded, the yield stayed 36). So the skin writes the profile's `target_weight` as `targetYield` in the same call | seen running |
| **Decaid tares the scale when a shot starts.** 34.1 g stood on the simulated scale; the first espresso frame still came with 34.1 g, and 0.5 s later the weight was 0. The skin sends no tare, and its graph leaves out the weight of the first second (`TARE_SETTLE_S` in `src/shell/shot.ts`) | seen running |
| The simulated cup ends 1.6 to 2.2 g under the target (34.1 of 36, 40.4 of 42) | seen running |
| A shot's record is written a few seconds after the machine is back in `idle`; `GET /api/v1/shots/latest` 3 s after the end still returned the shot before | seen running |
| `DELETE /api/v1/shots/{id}` answers `200 {"success":true,"id":...}`; `DELETE /api/v1/profiles/{id}/purge` answers `200 {"success":true,"message":"Profile permanently deleted",...}` | seen running |

### 10.2 Without a machine

`PUT /api/v1/devices/disconnect` with `{"deviceId":"MockDe1"}` disconnected the simulated
machine, `PUT /api/v1/devices/connect` brought it back (`outcome: "connected"`).

| Claim | Status |
|---|---|
| **`/ws/v1/machine/snapshot` stays open and sends nothing while no machine is connected**, for a socket opened before and for one opened after the disconnect. Frames came again on both sockets right after the connect, with no reconnect | seen running |
| `GET /api/v1/machine/state` and `PUT /api/v1/machine/state/espresso` answer `500 {"error":"DeviceNotConnectedException: machine not connected"}`; `GET /api/v1/workflow` answers 200 | seen running |
| So the skin tells the two cases apart by the stream alone: the socket does not open → "Decaid is not reachable"; the socket is open and silent for 3 s (`FRAME_STALE_MS`; an idle machine sends 2 frames per second) → "No machine connected" | the rule is the skin's; both cases are covered by the mocked-gateway tests |

### 10.3 Profiles

| Claim | Status |
|---|---|
| The five generated A-Flow 3.0 defaults get new ids from `POST /api/v1/profiles` (they are not the bundled ones), `isDefault: false`, and the `metadata` sent with them comes back (`{"source":"decaid-skin","aflow":"3.0"}`) | seen running |
| Three of them have the title of a bundled profile (`A-Flow / default-light`, `-medium`, `-dark`), so Decaid then lists two profiles under each of these titles. The picker marks ours with a tag "A-Flow 3.0" and tells them apart by their steps | seen running |
| The gateway returns a step with another key order than it was sent, and `exit: null` for a step without one; the values are equal. "Decaid has this default" is therefore decided by title and steps, compared without key order and nulls (`sameProfile` in `src/shell/profiles.ts`) | seen running |

### 10.4 The simulated machine and A-Flow 3.0 profiles

| Claim | Status |
|---|---|
| **With a flow-down default (dark, 46mm) the simulated machine pours nothing in the last step.** Flow Extraction has the target flow 0 with a smooth transition; the mock's flow was 0 from the start of the step, the weight stayed at 2.2 g, and the shot ran the step's 60 s and ended with `stopReason: "machineEnded"`. Whether a real DE1 lets the flow decline slowly, as the plugin intends, is a check for the founder (acceptance item 7) | seen running with the 3.0 default-dark; 46mm not tried |
| With a flow-up default (medium) the shot stops at the target weight. It takes about 102 s, because the mock does not leave the Infuse step at its weight (3.6 g): the scale stays at 0 until the pour, so Infuse runs its full 60 s | seen running |
| The rig test of acceptance item 2 therefore uses the 3.0 default-medium | - |

### 10.5 A page on another origin

The dev server's page on `http://localhost:24800` calls the gateway on port 8080 across
origins, as the bundled skin on 27906 does. It works: the gateway answers a request with
`access-control-allow-origin: <the request's Origin>`, `access-control-allow-credentials: true`
and `access-control-allow-methods: DELETE,GET,OPTIONS,PATCH,POST,PUT`, and a preflight
`OPTIONS` with 200 (seen running, with `curl -H "Origin: http://localhost:24800"` and in
Chromium through Playwright). WebSockets are not subject to it. So `npm run e2e:rig` serves the
skin from the dev server; installing the build in Decaid was not needed.

### 10.6 Tests

- `npm run e2e` (`e2e/`): the editor on fixture data and the shell against a mocked gateway
  (`e2e/mock-gateway.ts` answers the REST calls with `page.route` and the two WebSockets with
  `page.routeWebSocket`). The replayed shot is `e2e/fixtures/shot.json`: both streams of a
  simulated shot recorded on the rig, with 34.1 g left on the scale at its start.
- `npm run e2e:rig` (`e2e-rig/`, `playwright.rig.config.ts`): acceptance item 2 against the
  running rig. It skips itself when `GET /api/v1/machine/state` does not answer. It passed on
  2026-10-13 (one test, 1.9 min).

What the run left in the rig: nothing. The profiles and shots made by the probes and by the
test were deleted (73 profiles and the one shot of 8.2 as before), the workflow's profile and
context are as they were, and no setting and no KV key was written. The workflow and the
settings from before are in the rig's `log\d6-workflow-before.json` and
`log\d6-settings-before.json`.

## 11. Editor wired to the gateway (D7)

Done on 2026-10-13 against Decaid v0.8.8 on the rig, started as in 8.8 step 2 (the machine
state answered 200 within 3 s of the first check) and ended with `Stop-Process -Force`. Every
claim is **seen running**; the probe's output is in the rig's `log\d7-profile-probe.txt`.

### 11.1 What a profile's id is made of

| Claim | Status |
|---|---|
| **The id is a hash of the steps and the target weight.** The same steps posted with another title, with other notes or with another author returned the existing record unchanged (its old title, notes and metadata), with status 201 and no error. The same steps with another `target_weight` gave a new id | seen running |
| So Decaid holds one profile for each set of steps and stop weight: two names for the same values are not possible, and neither are two doses, because the dose is not in the profile | follows |
| `PUT /api/v1/profiles/{id}` with another title and other notes changed both and kept the id; the `metadataHash` changed | seen running |
| `PUT /api/v1/profiles/{id}` with other steps gave the record a new id and kept its `parentId` and metadata: the old id is gone | seen running |
| The same `PUT` on a bundled default answers `400 {"error":"Invalid request","message":"Invalid argument(s): Cannot modify default profile content"}` | seen running |

### 11.2 Lineage and visibility

| Claim | Status |
|---|---|
| **A parent is recorded by `POST /api/v1/profiles` with `parentId`**; the new record returns it. A `PUT` does not take one | seen running; the second part read (`rest_v1.yml`) |
| `PUT /api/v1/profiles/{id}/visibility` with `{"visibility":"hidden"}` takes the profile out of `GET /api/v1/profiles`; `?includeHidden=true` lists it | seen running |
| `GET /api/v1/profiles/{id}/lineage` of the child returns the hidden parent and the child, oldest first | seen running |
| A `POST` with the steps of a hidden record returns that record, still hidden | seen running |

### 11.3 What the skin does with it

- `writeParams` (`src/editor/storage.ts`): after the `POST`, a record with the wanted title
  and other notes gets its notes by `PUT`; a hidden record is taken over (title, notes,
  metadata) and made visible; a visible record with another title is left alone and the
  save is refused with its title.
- `saveEdit` (`src/editor/save.ts`): the `POST` carries `parentId`, and the parent is hidden
  when the answer is another record. An edit of the dose alone has the same id: only its
  notes change.
- 'Load to machine' is `loadProfile` (`src/shell/profiles.ts`), the picker's function.

### 11.4 Tests

- `npm run e2e`: `e2e/editor-machine.spec.ts`, eight tests against the mocked gateway, which
  now keeps profiles by the rule of 11.1.
- `npm run e2e:rig`: `e2e-rig/editor.spec.ts`, acceptance item 3. Passed on 2026-10-13 with
  the shot test of D6 (three tests, 2.1 min). A Playwright test imports the generator from
  `src/`, so the JSON imports of the defaults carry `with { type: 'json' }`.

What the run left in the rig: nothing. 73 profiles as before, hidden and deleted ones
counted; the workflow's profile and context are as they were; no setting and no KV key was
written.

## 12. Steam page (D8a)

Done on 2026-10-13, against Decaid v0.8.8 started as in 8.8 step 2 (the gateway answered
`GET /api/v1/machine/state` with 200 within 5 s this time).

| Claim | Status |
|---|---|
| `PUT /api/v1/workflow` with only `{"steamSettings":{"duration":N}}`, sent by the skin's favourite chip and by 'set timer', is read back with `GET /api/v1/workflow`; the other steam fields keep their values | seen running |
| `PUT /api/v1/machine/state/steam` from the skin puts the simulated machine in `steam`; the skin's stop button (`PUT /api/v1/machine/state/idle`) ends it, and the machine is `idle` again | seen running |
| `GET /api/v1/steams/ids` lists the steam records; each steam adds one, and `DELETE /api/v1/steams/{id}` removes it | seen running |
| A real steam curve: the simulated machine has none (8.7), so the curve in `docs/product/steam.png` is the mocked gateway's | not seen |
| The machine stopping when the duration is over | not seen: the founder's check on the real DE1 |

Tests: `npm run e2e` has `e2e/steam.spec.ts` (seven tests, mocked gateway, fake scale frames);
`npm run e2e:rig` has `e2e-rig/steam.spec.ts` (one test; only the scale's frames are fake).
The rig suite passed on 2026-10-13 (four tests, 2.2 min); its output is in the rig's
`log\d8a-e2e-rig.txt`.

What the run left in the rig: nothing. The steam records the test made were deleted (two as
before), and `steamSettings.duration` is 50 again.

## 13. Scale, settings, sleep / wake (D8c)

Done on 2026-10-13, against Decaid v0.8.8 started as in 8.8 step 2 (the gateway answered
`GET /api/v1/machine/state` with 200 when it was first asked, about 2 minutes after the start).

| Claim | Status |
|---|---|
| `GET /api/v1/display` on the Windows rig: `{"wakeLockEnabled":true,"wakeLockOverride":false,"brightness":100,"requestedBrightness":100,"lowBatteryBrightnessActive":false,"platformSupported":{"brightness":true,"wakeLock":true}}`. The field of spec 3.1 is `platformSupported.brightness` of `DisplayState` (`rest_v1.yml`) | seen running |
| `PUT /api/v1/display/brightness` with `{"brightness":N}`: 0 to 99 is an explicit level, 100 "returns to OS-managed brightness" | read (`rest_v1.yml`); the skin's 5 and 100 were sent and answered 200 on the rig |
| The skin's tare (`PUT /api/v1/scale/tare`) answers 200 and the next weight is 0.0 g | seen running |
| With `blockTareDuringShot` on, the skin's tare during a simulated shot answers 400 `block_tare_during_shot`, and the skin shows it as a notice | seen running, in gateway mode `tracking` |
| The skin's sleep button (`PUT /api/v1/machine/state/sleeping`) puts the machine into `sleeping`; a touch (`PUT /api/v1/machine/state/idle`) wakes it | seen running |
| **After a wake the scale is away for a few seconds** (about 4 s on the rig, which has `scalePowerMode: "disconnect"`). A shot started in that time ran without a stop at weight: the next test's shot ended at 95 g instead of 42 g, and passed once the sleep test waited for the scale | seen running, once; not looked into further |
| A stream that the gateway closes with an error frame | not seen on the rig; `npm run e2e` covers it with the mocked gateway |

Tests: `npm run e2e` has `e2e/scale-settings-sleep.spec.ts` (nine tests, mocked gateway);
`npm run e2e:rig` has `e2e-rig/scale-sleep.spec.ts` (three tests). The rig suite passed on
2026-10-13 (seven tests, 2.5 min).

What the run left in the rig: nothing. The shot of the blocked-tare test was deleted (one
shot as before), `blockTareDuringShot` is `false` again, the brightness is back at 100 and
the machine is `idle`. Decaid was ended with `Stop-Process -Force`; port 8080 was free
afterwards.
