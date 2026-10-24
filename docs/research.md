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
**https://github.com/decentespresso/streamline-js**, version 0.2.12, licence `ISC` (the
`package.json` field only; the repository itself is GPL-3.0-or-later since 2026-09-17, see
17.9). Its own
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

### 13.1 The wake lock in sleep (U4, 2026-10-20)

Checked against Decaid 0.8.8 with the simulated DE1, Streamline 0.2.17 served, for the menu's
'Machine and app sleep' (spec 3.9 item 2); the probe's output is in the rig's
`log\u4-app-sleep-probe.txt`.

| Claim | Status |
|---|---|
| Decaid holds the wake lock (`wakeLockEnabled`) while the machine is awake, whatever `keepAwake` and the override say | seen running |
| While the machine sleeps it holds it only for its setting `keepAwake` (`POST /api/v1/settings`, on by default on the rig) or the override (`POST`/`DELETE /api/v1/display/wakelock`): with both off `wakeLockEnabled` is `false` while asleep and stays so (seen for 15 s); `DELETE /api/v1/display/wakelock` alone releases nothing while `keepAwake` is on | seen running |
| At a wake (`PUT /api/v1/machine/state/idle`) Decaid takes the lock back by itself, and sets the brightness from 0 back to 100 | seen running |
| `PUT /api/v1/display/brightness` with 0 answers 200, and `GET /api/v1/display` reports `brightness` and `requestedBrightness` 0 | seen running |
| **Streamline 0.2.17's page switches the override on** (`wakeLockOverride` false → true while `e2e-rig/steam.spec.ts` had it open) and leaves it so; that spec now puts it back | seen running |

So the skin releases the lock for the app's sleep by switching `keepAwake` and the override
off, where they are on, and puts them back at the wake (`src/shell/dimmer.ts`). Whether the
tablet's screen then goes off by Android's timeout, and whether the touch that switches it on
again also reaches the skin, can only be seen on the tablet.

## 14. Shot history overlay (D8b)

Done on 2026-10-13, against Decaid v0.8.8 started as in 8.8 step 2 (the gateway answered
`GET /api/v1/machine/state` with 200 when it was first asked).
The probe's output is in the rig's `log\d8b-probe.txt`.

| Claim | Status |
|---|---|
| **A shot record holds a copy of the profile and no profile id** (`workflow.profile`: `version`, `title`, `notes`, `author`, `beverage_type`, `steps`, `target_volume`, `target_weight`, `target_volume_count_start`, `tank_temperature`). The id of a stored profile is a hash of the steps and the target weight (11.1), so it changes with every edit. The history therefore takes a profile by its **title**: an edited profile stays in its entry, and the title is what the user chose and reads | seen running (the record); the rule is the skin's (`entryKey` in `src/history/entries.ts`) |
| **The bean and the grinder are fields of the workflow's `context`, in the workflow and in a shot alike**: `coffeeName`, `coffeeRoaster`, `beanBatchId` (a link to Decaid's bean catalogue) and `grinderSetting`, `grinderModel`, `grinderId` (a link to its grinder catalogue). All are strings and may be absent. The skin reads and writes these six and manages no catalogue (spec 3.3) | seen running for name, roaster, setting and model; the two ids read (`rest_v1.yml`, `WorkflowContext`) |
| `PUT /api/v1/workflow` with these fields in `context` sets them and leaves dose and yield as they were | seen running |
| **A `null` for one of them clears it**: the answer's context no longer has the key (200, also for `beanBatchId` and `grinderId`). So restoring an entry without a bean removes the current bean | seen running |
| A profile of a few flow steps with `targetYield` 3 gives a simulated shot of 2.5 s (Rao Allongé: 18 measurements, `stopReason: "targetWeight"`, `actualYield` 2.4); its record was in `GET /api/v1/shots/latest` 6.5 s after the start | seen running |
| `GET /api/v1/shots` returns the newest shot first; `limit` is at most 100, `offset` pages | seen running for the order; the limit read (`rest_v1.yml`) |
| The skin's one `PUT /api/v1/workflow` for an entry (profile, bean, grinder setting) is read back with `GET /api/v1/workflow`: the profile equals the shot's copy | seen running (`e2e-rig/history.spec.ts`) |
| A swipe whose touch events come with no time between them is a fling so fast that Chromium drops the tap that follows it (no `click` on the first tap, on the second it comes). With 30 ms between the events the tap works. Whether a very fast flick on the tablet does the same was not seen | seen running in Playwright's Chromium with synthetic touch events; not seen on a device |

What the skin does with it: the list is `GET /api/v1/shots` without measurements, at most
500 shots (`HISTORY_SHOTS`), grouped by `groupShots`; a tap sends one
`PUT /api/v1/workflow` through `loadProfile` (the picker's function, with the bean and the
grinder as further context fields), then `GET /api/v1/shots/{id}` for the measurements of the
entry's latest shot. The stop weight and the dose after a restore are the profile's, as after
a load from the picker, not the shot's.

Tests: `npm run e2e` has `e2e/history.spec.ts` (seven tests, mocked gateway; the swipe is
sent as touch events); `npm run e2e:rig` has `e2e-rig/history.spec.ts` (one test, four
simulated shots, 46 s). The rig suite passed on 2026-10-13 (eight tests, 3.3 min); its output
is in the rig's `log\d8b-e2e-rig.txt`.

What the run left in the rig: nothing. The shots of the probe and of the test were deleted
(one shot as before), the workflow equals `log\d8b-workflow-before.json` byte for byte, the
settings equal `log\d8b-settings-before.json`, 73 profiles as before, no KV key was written.
Decaid was ended with `Stop-Process -Force`; port 8080 was free afterwards.

## 15. The ZIP and its install (D9)

Done on 2026-10-13, against Decaid v0.8.8 started as in 8.8 step 2 (the gateway answered
`GET /api/v1/machine/state` with 200 after 3 s). The requests and answers are in the rig's
`log\d9-install.txt`, the check of the opened skin in `log\d9-installed-check.txt`, and
`doc/Skins.md` at tag `v0.8.8` is in `log\Skins-v0.8.8.md`.

| Claim | Status |
|---|---|
| The ZIP is `release/decaid-skin-1.0.0-rc.1.zip` (the version of D9; the release is now `0.1.0`, founder, 2026-10-13): 51 133 bytes, four files (`index.html` 445 bytes and `manifest.json` at the root, one CSS and one JavaScript file in `assets/`), both asset paths in `index.html` start with `./`, no source map, no test file. `scripts/zip.mjs` checks this before it writes the ZIP | seen running |
| On a device a ZIP is installed in Decaid's own screens: "open **Launcher → Skins**, tap the **+** (Install skin) button and choose **ZIP file**", and in another place "Open **Settings** → tap the skin selector dropdown", "Select **"Install from .zip..."**"; "The skin is extracted to app storage, set as default, and served immediately". Install from ZIP is listed for Android | read (`doc/Skins.md`); not seen: Decaid's window cannot be driven on the rig |
| **The REST API has no upload of a ZIP.** `rest_v1.yml` has three installs: `install/github-release`, `install/github-branch` and `install/url` | read |
| **`POST /api/v1/webui/skins/install/url` with a `file:///` URL fails**, although `doc/Skins.md` shows one ("Install from a local or remote URL"): `500 {"error":"Invalid argument(s): No host specified in URI file:///..."}` | seen running |
| With the ZIP served on `http://127.0.0.1:24810/` for the one request, the same call answers `200 {"success":true,"message":"Skin installed successfully from URL",...}`. The skin is then in `GET /api/v1/webui/skins` with the manifest's id, name, description and version, `isBundled: false`, and its four files are in `%APPDATA%\net.tadel\Decaid\web-ui\decaid-skin\` | seen running |
| An install by URL does not select the skin: the default stayed `streamline.js`. `PUT /api/v1/webui/skins/default` with `{"skinId":"decaid-skin"}` answers 200 and the server still serves the old skin; `POST /api/v1/webui/server/stop` and `.../start` switch it | seen running |
| **Decaid gives this skin port 28881**: `GET /api/v1/webui/server/status` → `{"serving":true,"path":"...\web-ui\decaid-skin","port":28881,"ip":"localhost"}`. `http://localhost:3000/` answers 307 to `http://localhost:28881/` | seen running, one install; whether the tablet gives the same port was not seen |
| Decaid adds two tags to the served `index.html`: a `meta name="reaprime-proxy-token"` and a script `/__decent/skin-api.js` from the skin's own origin. The skin uses neither | seen running |
| Opened from that port at 1280 x 800, scale factor 2, dark: home shows 'Idle' from the machine's stream, the workflow's profile and the scale's weight; no console error, no page error, no failed request; the page is 1280 x 800 without scrolling. Screenshot: product/installed.png (screenshot in the team repository). `node scripts/rig-installed.mjs` is the check | seen running |
| The gateway is called across origins from port 28881 as from the dev server's 24800 (10.5) | seen running |
| `DELETE /api/v1/webui/skins/decaid-skin` answers `200 {"success":true,...}`; the skin's folder is gone and the id answers 404 | seen running |
| Whether the port stays the same over a restart of Decaid and over a second install of the skin | not seen: not tried. `doc/Skins.md` says it is "derived from the skin's identity and remembered across restarts" |

What the run left in the rig: nothing. The default skin is `streamline.js` on port 27906
again, the skin is removed, and the settings equal `log\d9-before-settings.json` byte for
byte. The run of all suites before it ([acceptance.md](acceptance.md)) left the workflow, the
73 profiles and the one shot as they were. Decaid was ended with `Stop-Process -Force`; ports
8080, 27906 and 28881 were free afterwards.

## 16. The steam timer that did not arrive (2026-10-14)

The founder's note of 2026-10-13, from the real DE1 with Decaid on the tablet and the skin in
Chrome on a PC: "selecting a favorite steam time, did not set the steam timer. I selected 25s
and it was running 30s." Done against Decaid v0.8.8 started as in 8.8 step 2 (the gateway
answered `GET /api/v1/machine/state` with 200 after 5 s). `node scripts/rig-steam-probe.mjs
--streamline` is the probe; its output is in the rig's `log\t1-steam-probe.txt`.

**Cause found on the rig: another client writes its own steam time back.** Streamline, the
skin Decaid opens by default, keeps the steam time its user set last in the KV store
(`streamline-app/last-steam-duration`). Its version 0.2.13, the one Decaid 0.8.8 installed on
the rig, compares every frame of `/ws/v1/machine/shotSettings` with that value and, when they
differ, sends `PUT /api/v1/workflow {"steamSettings":{"duration":<remembered>}}`
(`resyncDriftedShotSettings` in its `app.js`, `resyncIfDrifted` in its `api.js`: "the
remembered value wins"). With Streamline open in a browser and remembering 30 s, the skin's
25 s lasted under 0.1 s. The skin showed 25 s all the time: it showed what it had written.

| Claim | Status |
|---|---|
| Where the machine's own steam timer can be read: `targetSteamDuration` in the frames of `/ws/v1/machine/shotSettings`, one frame when the socket opens and one after every change. `GET /api/v1/machine/shotSettings` answers 404 (the path has only `POST`), and `GET /api/v1/machine/settings` has `steamFlow` and `steamPurgeMode` but no duration | seen running |
| `PUT /api/v1/workflow {"steamSettings":{"duration":25}}`, the skin's call, with nothing else running: the workflow and the machine have 25 at once and keep it (read again 8 s later); the other steam fields keep their values. So a partial `steamSettings` resets nothing | seen running |
| The favourite chip and 'set timer' take the same path: both call `setSteamTimer` in `src/shell/skin.svelte.ts`, one function, one request | read |
| Decaid writes a workflow's steam settings to the machine in the same request, and only when temperature, duration or flow differ from the **workflow's** old values (`updateWorkflowSettings` in `lib/src/controllers/de1_controller.dart`, tag `v0.8.8`) | read |
| So a machine whose timer was changed past the workflow keeps it: after `POST /api/v1/machine/shotSettings` with `targetSteamDuration` 30 (200; the workflow stays at 25), `PUT /api/v1/workflow` with duration 25 answers 200 and the machine still has 30 | seen running |
| Decaid sends the workflow's steam settings to the machine again on every connect (`_setDe1DefaultsFor`; `defaultWorkflow` follows the current workflow, `lib/main.dart`), so a reconnect does not bring an old timer back | read, not tried |
| Decaid's own steam screen, which it opens when steam starts where its window is in the foreground, has a +10 s action that writes the machine only (`extendSteamDuration`) | read, not tried |
| With `streamline-app/last-steam-duration` set to 30 and no Streamline page open, the skin's 25 stays | seen running |
| With that key at 30 and Streamline open in a headless browser (`http://localhost:27906/`): on opening it sends `PUT /api/v1/workflow {"steamSettings":{"duration":30}}` over the workflow's 25; 40 s later the probe's `PUT` of 25 is followed in the same 0.1 s by Streamline's `PUT` of 30. Workflow and machine have 30 and keep it | seen running |
| Streamline at its newest commit (`564614e`, 2026-10-14) takes over a value another client wrote instead of writing its own back (`decideResync` in `resync-policy.js`: "adopt") | read; which version the founder's tablet has was not seen |
| The real DE1 ending steam at `targetSteamDuration` | not seen: the simulated machine does not end steam (8.7) |

Ruled out on the rig: a workflow that is written but not passed on (it is passed on at once
when the value changes), a partial `steamSettings` that resets another field, and two code
paths. Confirmed as possible: 30 s was a value another client held and wrote back.

What the skin does now (`src/steam/apply.ts`, called by `setSteamTimer`):

1. It reads Streamline's remembered steam time and, when there is one and it differs, changes
   it to the seconds it is about to set, so both skins agree. It never creates the key.
2. It writes the workflow as before.
3. It reads the machine's own timer from `/ws/v1/machine/shotSettings`, a third stream the
   skin now keeps open. If the machine does not show the seconds within 2 s, it writes the
   machine's settings directly: the whole latest frame with the new `targetSteamDuration`.
4. The steam page shows the machine's timer, not the workflow's, and a notice when the
   machine's timer is no longer the one set there.

Tests: `src/steam/apply.test.ts` (ten), three more in `e2e/steam.spec.ts` (the mocked gateway
now has the settings' stream, Decaid's rule of item 4 of the table and Streamline's resync),
and `e2e-rig/steam.spec.ts`, which runs with the real Streamline page open and remembering
30 s, reads the workflow and the machine after each write, and ends with a control: a timer
written into the workflow alone is replaced by Streamline within seconds.

What the runs left in the rig: nothing. `steamSettings` is `{"targetTemperature":150,
"duration":50,"flow":0.8,"stopAtTemperature":0}` and the machine has 50; the key
`streamline-app/last-steam-duration` does not exist again; two steam records as before.

## 17. Step editor port plan (E1)

Written on 2026-10-16 for the milestones E2 to E4 (spec 3.6, acceptance items 10 to 13). No
product code was written. "Read" means read in Streamline's source; "seen" means checked in a
file or in the rig's data. Every choice made here is the simplest one that meets 3.6 and
section 5; those the founder has not seen are collected in 17.13.

### 17.1 What was read

- **Streamline:** `git clone https://github.com/decentespresso/streamline-js ../streamline-js`,
  head `3a4bd23` (2026-10-15, "chore(release): v0.2.14"), version **0.2.14**. The rig serves
  0.2.13 (tag `v0.2.13`, `072e525`). Between the two, the editor's files
  (`profile_editor.js`, `profile-field-limits.js`, `profile_editor.html`, `notes-modal.js`,
  `echarts-renderer.js`) and its tests are identical; `api.js` and `numpad-modal.js` changed,
  but not in the profile functions this plan uses (seen with `git diff v0.2.13 HEAD`). So the
  plan holds for the rig's version too. The clone is a reference only: not a dependency, not
  in this repository.
- **The rig's profiles:** Decaid was not started. The rig's 73 profiles are Decaid's bundled
  files, `../decaid-rig/decaid-0.8.8/data/flutter_assets/assets/defaultProfiles/*.json`
  (73 files besides `manifest.json`), read with a short Node script; 17.4 has what they hold.
- **This skin:** `src/editor/*` (start, save, storage, unsaved, curve, Graph, NumberPad,
  ValueChip, StepList, NameDialog), `src/shell/{profiles.ts,nav.ts,skin.svelte.ts,Profiles.svelte,UnsavedDialog.svelte}`,
  `src/App.svelte`, `src/graph/*`, `src/api/types.ts` and sections 2, 9 and 11 above.

### 17.2 Streamline's editor: files and what each does

| File (0.2.14) | Lines | What it does for the editor | In the port |
|---|---|---|---|
| `src/modules/profile_editor.js` | 3646 | The whole editor: state (`editorState`), the CARDS tab (`renderStepCards`, l. 867-1547), the SETTINGS tab (`renderSettingsTab`, l. 1920-2320), the SCRIPT tab (`buildStepScript`, `renderScriptLine`, `renderScriptTab`, l. 2329-2806), the graph preview (`pushChannel`, `renderScriptGraph`, l. 2640-2754), save routing (`saveProfile` and its pure helpers, l. 2881-3334), closing with the unsaved warning (`cancelEditor`), version history (`openVersionHistory`), `normalizeLegacySteps` | the step model, the cards, the curve, the script's wording |
| `src/modules/profile-field-limits.js` | 50 | `FIELD_LIMITS` (every range and step of a step field), the exit types, units and maxima, `DEFAULT_LIMITER_RANGE` = 0.6 | ported whole |
| `src/profiles/profile_editor.html` | 121 | the page: title and CLOSE / SAVE AS NEW / SAVE on top, the tab switch CARDS / SCRIPT / SETTINGS, card paging arrows, three panels (SCRIPT: "Steps Overview" left, "Graph Preview" right) | the layout |
| `src/modules/api.js` | 3201 | `sanitizeProfileForRea` (l. 1286: drops legacy top-level fields, folds a `weight` exit into the step's `weight`, any other exit type to `null`), `uploadProfileWithParent` (`POST /api/v1/profiles` with `{profile, parentId}`), `updateProfile` (`PUT /api/v1/profiles/{id}`), `updateProfileVisibility`, `getProfileLineage`, `deleteProfile` | the skin's client has all of them (`src/api/client.ts`) |
| `src/modules/numpad-modal.js` | 571 | full-screen number pad with recent values per field | not ported: `NumberPad.svelte` |
| `src/modules/notes-modal.js` | 273 | the notes in a full-screen Markdown editor (EasyMDE) | not ported: a plain text field |
| `src/modules/echarts-renderer.js` | 372 | draws the preview with ECharts | not ported: `ShotGraph.svelte` (no chart library, spec 6) |
| `src/modules/profileManager.js` | 1484 | profile list, drafts, favourites, `validateProfileStructure` (used only for an uploaded file), the selector's way into the editor (`window.__pendingEditProfile`) | not ported |
| `src/modules/tcl-profile.js` | 298 | de1app `.tcl` import | out (spec 3.6: "Still out in 1.1") |
| `src/modules/profile-overrides.js`, `flow-calibration.js` | 161, 183 | per-profile dose, yield, grind and flow calibration in the KV store | not ported (17.12) |
| `test/profile-editor.test.mjs` | 432 | `pushChannel`, `readExitDef`, limiter ranges, `buildStepScript` wording | tests ported with the functions |
| `test/profile-editor-cards.test.mjs` | 284 | pump and exit cycles, chevrons, `resolveSaveTarget`, `resolveFinalTitle` | cycle tests ported |
| `test/step-index-bookkeeping.test.mjs` | 133 | `target_volume_count_start` through insert, delete, move | ported |
| `test/profile-save-routing.test.mjs` | 350 | Streamline's save routing | not ported: the skin's own save path |

How the editor works (read):

- **CARDS.** A horizontal row of cards, one per step, with a sticky label column (Temp, Pump,
  Maximum, Move on if). One card is open at a time; the others are read-only and open on a
  tap. An open card has a header with the step number, its name as a text field and two
  chevrons that move the step left or right; **Temp**: a chip that cycles Coffee / Water
  (`sensor`) and a ± stepper for the temperature; **Pump**: a chip that cycles Flow quickly /
  Flow slowly / Pressure quickly / Pressure slowly (`pump` and `transition` in one) with a ±
  stepper for the target, and "Limit to" with a ± stepper for the limiter (0 reads "Off");
  **Maximum**: weight (g), time (s) and volume (ml), each a ± stepper, 0 is off; **Move on
  if**: a chip that cycles pressure over / pressure under / flow over / flow under / off,
  with a ± stepper for the value. Every card's footer has a trash button (asks "Delete Step
  n?") and a plus that inserts a copy of this step after it, named "New Step". A profile
  without steps shows one plus. A tap on a stepper's value opens the number pad.
- **Pump switch.** Flow to pressure seeds 6.0 bar when the step had none and deletes `flow`;
  the other way seeds 6.0 ml/s and deletes `pressure`.
- **Exit memory.** Switching the exit off and on again, or between pressure and flow,
  restores the step's last value of that type (a `WeakMap` per step), else 9.0 bar or
  6.0 ml/s. A live "pressure over 0" would end the step at once, so 0 is never seeded.
- **Limiter range.** A new limiter takes the range of the first live limiter of the same
  pump type in the profile, else 0.6. SETTINGS edits the ranges ("Flow Range", "Pressure
  Range") of every limited step of a pump type at once.
- **`target_volume_count_start`** ("pre-infusion ends after step N", 1-based, 0 = none)
  moves with the steps on insert, delete and move (`insertStepAfter`, `removeStepAt`,
  `moveStep`).
- **SETTINGS.** Tank preheat (0-110 °C), "Pre-infusion ends at" (a step cycler), Flow and
  Pressure Range, Stop At weight (0-1000 g in 0.1) and volume (0-500 ml), beverage type
  tiles, a file upload (JSON or `.tcl`), an import by Visualizer share code, flow
  calibration, the notes (Markdown modal) and the author. The title is edited in the top bar.
- **SCRIPT.** Not a text editor: each step is its name and a list of sentences ("Set Coffee
  temperature to 93.0 °C", "Flow Quickly at a rate of 4.0 mL/s", "Limit to 8.6 bar", "For a
  maximum of 2.0 sec or 500.0 ml", "Move on if Pressure is over 4.0 bar") whose numbers are
  tappable pills (number pad) and whose state words are chips that cycle. Nothing is typed,
  so nothing can fail to parse; no version of the file has a text parser (`git log -G` over
  the editor's history). The preview on the right draws the targets: each step lasts its
  `seconds` (10 s when 0), `fast` jumps to the target and holds, `smooth` ramps from the
  previous step's target over the whole step, the pump a step does not control is drawn at
  0, the temperature is scaled to the 0-10 axis (°C / 10), step borders are dashed lines.
- **Save.** SAVE and SAVE AS NEW (`saveProfile`, l. 3094): no title or no step is refused; an
  untouched profile saves nothing; a change of title, author or notes alone is a `PUT` (the
  id is a hash of the execution fields); a default with changed steps is forked with `POST
  {profile, parentId}`; SAVE AS NEW posts with `parentId` and leaves the source; SAVE of a
  user profile posts with `parentId`, makes the answer visible and hides the source. A
  `POST` that answers with another record (the same content exists) is reported as "matches
  an existing profile" and nothing else is done. A colliding title gets " (2)".
- **Close.** "Undo changes?" when the profile differs from the one it opened with; nothing
  is loaded to the machine.

### 17.3 The data model and `src/api/types.ts`

Streamline edits the v2 profile as the gateway returns it, and the skin's types
(`ProfileStep`, `Profile`, `ProfileRecord`, section 2) already hold every field it touches:
no new profile type is needed. Field by field:

| Streamline (card / setting) | v2 field | `src/api/types.ts` | Note |
|---|---|---|---|
| step name | `name` | `ProfileStep.name: string` | |
| Coffee / Water chip | `sensor` | `'coffee' \| 'water'` | 42 bundled steps use `water` (seen), which settles section 2's "unverified" |
| pump chip | `pump`, `transition` | `'pressure' \| 'flow'`, `'fast' \| 'smooth'` | |
| pump target | `flow` or `pressure` | `flow?`, `pressure?` | the other one is deleted, as `normalizeLegacySteps` does |
| Temp | `temperature` | `number` | |
| Limit to | `limiter.value`, `limiter.range` | `limiter?: {value, range} \| null` | value 0 is stored as `null` |
| Maximum weight / time / volume | `weight`, `seconds`, `volume` | `weight?: number \| null`, `seconds`, `volume` | 0 is off; `weight: null` reads as 0 |
| Move on if | `exit` | `exit?: StepExit \| null` (`'pressure' \| 'flow'`) | off is `null`; Decaid takes no other type |
| title (top bar) | `title` | `Profile.title` | |
| notes | `notes` | `notes?` | |
| Stop At weight / volume | `target_weight`, `target_volume` | `target_weight?`, `target_volume?` | |
| Preheat Water Tank | `tank_temperature` | `tank_temperature: number` | |
| Pre-infusion ends at | `target_volume_count_start` | `number` | kept right by the step operations; set only in SCRIPT (17.8) |
| Beverage type | `beverage_type` | `'espresso' \| 'calibrate' \| 'cleaning' \| 'manual' \| 'pourover'` | Streamline also offers `filter`, `tea`, `tea_portafilter`; not edited here (17.12) |
| author | `author` | `author?` | kept, not edited |

The profile is kept whole: every field the editor does not show (author, beverage type,
`version`) goes back as it came.

### 17.4 The non-A-Flow profiles on the rig (seen, 73 bundled files)

- 481 steps, up to 20 in one profile (`adaptive_allonge`); 47 espresso, 22 pourover, 2
  cleaning and 2 manual profiles. Every number is a JSON string in the files; the API
  returns numbers (section 8.6).
- 176 exits (105 pressure, 71 flow, no other type); 72 live limiters, whose range is the
  same within each pump type of a profile in all 73 (0.6 in 47); 15 steps with a weight, 373
  with a volume (often 500 ml as "no limit"), 62 smooth, 42 on the water sensor, 19 with
  0 s; 57 profiles with `target_volume_count_start` > 0, 4 with a tank temperature.
- Every value fits Streamline's `FIELD_LIMITS` (17.6): flow up to 12 ml/s, pressure 11 bar,
  temperatures 10 to 105 °C, seconds up to 127, volume 500, step weight 150; target weight
  up to 225 g, target volume 295 ml, tank 35 °C. One value has two decimals (a limiter of
  0.75 bar in `baseline_hc`), all others at most one.
- Five are A-Flow by title: `A-Flow / default-dark`, `-light`, `-like-dflow`, `-medium` and
  `-very-dark`, the de1app plugin's. Their notes do not hold this skin's values, so they are
  **not** A-Flow 3.0 profiles (17.5).

### 17.5 Which editor opens: the routing

The rule, in one place: **a profile opens in the A-Flow editor exactly when the A-Flow editor
can read its A-Flow 3.0 values** (`readParams` in `src/editor/storage.ts` answers non-null);
every other profile opens in the step editor (spec 3.6). Concretely:

| Profile | Opens in |
|---|---|
| the five A-Flow 3.0 defaults (floral, light, medium, dark, 46mm) and every A-Flow 3.0 profile the skin saved whose steps are still the generator's for its values | A-Flow editor |
| unsaved A-Flow edits on the machine (the workflow's profile with readable values) | A-Flow editor, as today |
| Decaid's bundled de1app A-Flow profiles (`A-Flow / default-medium` and the four others): A-Flow by name, not by values the skin can read; importing them is out of scope (3.2) | step editor |
| an A-Flow 3.0 profile whose steps were changed in another app (Streamline): `readParams` already refuses it, because its steps no longer match its values | step editor |
| every other profile (the other 68 bundled ones, the user's own) | step editor |
| no profile in the workflow, or Decaid does not answer | A-Flow editor on a default, as today |

A title starting with "A-Flow" (used only for the picker's order in `sortProfiles`) and the
metadata tag (`isAFlow3`) do **not** decide: a title says nothing about the values, and a
profile saved by another app has no tag. Spec 3.6's "A-Flow profiles keep opening the A-Flow
editor" is met: these are the profiles that open it today.

How it is wired (E2):

- `src/editor/route.ts`, new: `editorFor(profile: Profile | null | undefined): 'aflow' | 'steps'`,
  `'steps'` when there is a profile and `readParams(profile)` is null. M2 (today) moves the
  values to `metadata` and may change `readParams`; `editorFor` calls whatever reads them, so
  that change stays in `storage.ts`. If M2's reader needs the record (the workflow's profile
  carries no `metadata`), `editorFor` takes `(profile, records)` and finds the record as
  `unsavedOnMachine` already does (same title, same steps).
- The screen stays one: `Screen` keeps `'editor'` (`src/shell/nav.ts` unchanged), so the
  stored screen and every `skin.go('editor')` (home's pen, the picker, the warning's "Save
  as…") work for both editors. `App.svelte` shows `StepEditor` for `'editor'` when
  `editorFor(skin.workflow?.profile)` is `'steps'`, `Editor` otherwise.
- Both editors open on the workflow's profile, as the A-Flow editor does: home's pen edits
  what is loaded. The picker opened from the editor returns to the editor for **every**
  profile (`Profiles.svelte`, `load`): its notice "not an A-Flow 3.0 profile: it can be
  loaded, but not edited" goes, and so does the same notice in `Editor.svelte`'s `init`.
- The routing follows the workflow while the screen is shown, so a profile loaded by another
  app while an editor is open switches the editor and drops its edits, as such a load
  already drops the A-Flow editor's (spec 8: "a load started outside the skin cannot be
  warned about").

### 17.6 Ranges (the step editor's, in one place)

Streamline's `FIELD_LIMITS` and settings ranges, unchanged, in `src/steps/limits.ts`:

| Field | Range | Step of ± |
|---|---|---|
| temperature | 0-105 °C | 0.5 |
| flow (target) | 0-15 ml/s | 0.1 |
| pressure (target) | 0-12 bar | 0.1 |
| flow limit (on a pressure step) | 0-8 ml/s | 0.1 |
| pressure limit (on a flow step) | 0-12 bar | 0.1 |
| exit on pressure / on flow | 0-12 bar / 0-8 ml/s | 0.1 |
| step weight, step volume | 0-500 g, 0-500 ml | 1 |
| seconds | 0-127 s (the protocol's limit) | 1 |
| target weight | 0-1000 g | 0.1 |
| target volume | 0-500 ml | 1 |
| tank temperature | 0-110 °C | 1 |

The maximum-flow setting of spec 3.6 (F1, 8 ml/s by default) is the A-Flow editor's: spec 8
asked it about the A-Flow editor's 8 ml/s, and a bundled profile drives 12 ml/s, which a
step editor capped at 8 could not keep. A value outside its range that a profile brings is
shown and kept; ± and the number pad move only inside the range.

### 17.7 Save path, lineage and the unsaved warning

The step editor saves as the A-Flow editor does (spec 3.6: "through the skin's existing save
path"), with the profile in place of the values:

- **One writer.** `writeParams` (`src/editor/storage.ts`) becomes `writeProfile(client,
  profile, options)`: `POST /api/v1/profiles`; an answer with the wanted title that differs
  in anything outside the hash (notes, author, and whatever else Decaid does not hash; compared
  in `sameSteps`' canonical form over the whole profile) gets a `PUT` with the wanted profile;
  a hidden answer is taken over and made visible; a visible answer with another title throws
  `StepsTakenError` (the same message). `writeParams` becomes `writeProfile` with its notes.
  M2 changes `writeParams` today too: whichever of M2 and E2 lands second merges the two.
- **'save'** (`saveStepEdit(client, profile, parent)`, `src/steps/save.ts`): `writeProfile`
  with `parentId: parent.id`, then the parent is hidden when the answer has another id, as
  `saveEdit` does; Decaid's lineage then holds both (acceptance 10). Not offered for a
  bundled default (`record.isDefault`: Decaid refuses to change its content, 400) nor while
  nothing changed, as in the A-Flow editor.
- **'save as'** (`saveStepAs`): asks a name with `NameDialog` (taken: every visible title);
  the title is the name as typed, without the "A-Flow / " prefix; `writeProfile` with
  `parentId` of the profile it came from (so a default's copy is in the lineage too, as in
  Streamline); the source stays visible.
- **metadata.** Both send `metadata: { ...parent.metadata, source: 'decaid-skin' }` without
  the A-Flow keys (`aflow`, and M2's values): a profile that was A-Flow 3.0 and is saved from
  the step editor loses the picker's tag 'A-Flow 3.0'. The notes are saved as shown.
- **Loading.** 'save' and 'save as' load what they stored with `storeAndLoad` (already generic
  over its `store` callback) and `loadProfile`. Leaving the editor (the back arrow, the name
  to the picker) loads the profile on screen when it differs from the one the editor opened
  with, saved or not, and loads nothing otherwise, as the A-Flow editor does (spec 3.2,
  'Editor behaviour'; `skin.leaving`). "Differs" is the same canonical comparison.
- **The unsaved warning.** `unsavedOnMachine` (`src/editor/unsaved.ts`) stays the one place.
  It gains the step case: the workflow's profile is not A-Flow 3.0, and no record of its
  title, hidden ones too, has its content (the same comparison). `Unsaved` gets
  `profile: Profile` beside `params` (null for a step profile). `UnsavedDialog` names the
  title as before; its "Save as…" goes to the editor, which the routing makes the step
  editor, and that opens its 'save as' on the machine's profile (`skin.saveAsNext`, as
  `Editor.svelte` does). A profile whose record was deleted after it was loaded is unsaved
  too: those steps are in no stored profile.

### 17.8 The SCRIPT tab

Spec 3.6 and acceptance 13 ask for the steps **as text, editable**, with a text that does not
parse shown as an error and not saved. Streamline has no such text (17.2): its SCRIPT tab is
sentences with tappable values. The port keeps Streamline's sentences, word for word, and
makes them a text the user types, with a parser of the skin's own. The pills and chips are
not ported (17.12).

The tab: the text in a text field on the left ("Steps"), the preview on the right (17.10's
curve in `ShotGraph`), the errors under the text. Every change of the text is parsed at once.
A text that parses replaces the editor's steps (and the start of the volume count), which the
preview and the other tabs then show. A text that does not parse lists its errors with their
line numbers, the preview keeps the last text that parsed, and 'save', 'save as' and leaving
with changes are refused while it is so ("The script has errors: nothing is saved").
Opening the tab writes the text from the editor's profile, so the tabs never disagree, and a
text that was not changed is never parsed back into the profile.

**Grammar.** Keywords are case-insensitive; words may be separated by one or more spaces;
blank lines are ignored; a leading `-` or `•` on a sentence is optional.

```
script      = step { step } ;                        (at least one step)
step        = header NL { sentence NL } ;
header      = integer ":" [ name ] ;                 (the number is not read: steps take the order of the text)
name        = any text to the end of the line, trimmed ;
sentence    = [ "-" | "•" ] ( marker | temperature | pump | limit | maximum | exit ) ;
marker      = "Start tracking water volume" ;
temperature = verb sensor "temperature" ( "to" | "at" ) number "°C" ;
verb        = "Set" | "Maintain" | "Increase" | "Decrease" ;
sensor      = "coffee" | "water" ;
pump        = ( "Flow" | "Pressure" ) ( "quickly" | "slowly" ) ( "at a rate of" | "to" ) number unit ;
limit       = "Limit to" number unit ;
maximum     = "For a maximum of" amount { "or" amount } ;
amount      = number ( "g" | "sec" | "ml" ) ;
exit        = "Move on if" ( "pressure" | "flow" ) ( "is over" | "is under" ) number unit ;
number      = digit { digit } [ "." digit { digit } ] ;
unit        = "mL/s" | "bar" ;
```

Rules the grammar does not say:

1. A step has exactly one temperature and one pump sentence, and at most one each of limit,
   maximum and exit, in any order; weight, sec and ml at most once each in a maximum.
2. Units follow the pump: a flow step's target is "Flow … at a rate of … mL/s" and its
   limit is in bar; a pressure step's target is "Pressure … to … bar" and its limit is in
   mL/s. An exit on pressure is in bar, on flow in mL/s. `ml/s` is read as `mL/s`, `s` as
   `sec`.
3. Every number is in its range of 17.6.
4. The marker is at most once in the text and not in the first step: on the step numbered
   *m* (by order, from 1) it sets `target_volume_count_start` = *m* − 1; no marker sets 0.
5. The verb is not read: the stored temperature is absolute. The writer chooses it as
   Streamline does (`temperatureVerb`: Set on step 1, then Increase, Decrease or Maintain
   against the previous step; "at" after Maintain, "to" otherwise).
6. What a step leaves out is off: no limit is `limiter: null`, no maximum sets weight,
   seconds and volume to 0, an amount left out is 0, no exit is `exit: null`.
7. What the text does not hold comes from the editor's profile: every top-level field, and a
   limiter's range, which is the range of the first live limiter of the same pump type in
   that profile, else 0.6 (Streamline's `newLimiterRange`; all 73 bundled profiles have one
   range per pump type, 17.4, so this loses nothing there).
8. The writer prints the sentences in Streamline's order (marker, temperature, pump, limit,
   maximum, exit) and a maximum's amounts as weight, sec, ml; it leaves out a limit, an
   amount and an exit that is 0 or off, and prints a number with one decimal, or two when it
   has a second (0.75). So `parseScript(writeScript(p), p)` gives `p`'s steps back.
9. An error names the line and what is wrong: "line 3: flow is 0 to 15 mL/s",
   "line 7: not understood: 'Flow fast at 4 mL/s'", "step 2 has no pump sentence",
   "line 1: a step starts with 'number: name'", "the script has no step".

**Worked example 1: "Trendy 6 bar low pressure shot"** (bundled
`Trendy_6_bar_low_pressure_shot.json`, `target_volume_count_start` 2, no limiter):

```
1: preinfusion temp boost
- Set coffee temperature to 92.0 °C
- Flow quickly at a rate of 8.0 mL/s
- For a maximum of 2.0 sec
- Move on if pressure is over 4.0 bar
2: preinfusion
- Maintain coffee temperature at 92.0 °C
- Flow quickly at a rate of 8.0 mL/s
- For a maximum of 18.0 sec
- Move on if pressure is over 4.0 bar
3: forced rise without limit
- Start tracking water volume
- Maintain coffee temperature at 92.0 °C
- Pressure quickly to 6.0 bar
- For a maximum of 3.0 sec
4: rise and hold
- Maintain coffee temperature at 92.0 °C
- Pressure quickly to 6.0 bar
- For a maximum of 32.0 sec
```

Parsed, step 1 is `{name: "preinfusion temp boost", temperature: 92, sensor: "coffee",
pump: "flow", transition: "fast", flow: 8, limiter: null, seconds: 2, volume: 0, weight: 0,
exit: {type: "pressure", condition: "over", value: 4}}`, and the marker on step 3 gives
`target_volume_count_start: 2`, as in the file. Typing `6.5` for the `6.0` on line 18 sets
step 4's `pressure` to 6.5 and moves the preview's last level; typing `13.0` there gives
"line 18: pressure is 0 to 12 bar" and changes nothing.

**Worked example 2: "Blooming Espresso"** (bundled `Blooming_espresso.json`, count start 2,
a smooth ramp, a pressure limit, 500 ml volume limits, a flow of 0 for the bloom):

```
1: preinfusion start
- Set coffee temperature to 97.5 °C
- Flow quickly at a rate of 4.0 mL/s
- For a maximum of 2.0 sec or 500.0 ml
2: preinfusion
- Maintain coffee temperature at 97.5 °C
- Flow quickly at a rate of 4.0 mL/s
- For a maximum of 23.0 sec or 500.0 ml
- Move on if pressure is over 4.0 bar
3: pause
- Start tracking water volume
- Decrease coffee temperature to 90.0 °C
- Flow quickly at a rate of 0.0 mL/s
- For a maximum of 30.0 sec or 500.0 ml
4: ramp
- Increase coffee temperature to 92.0 °C
- Flow slowly at a rate of 2.2 mL/s
- For a maximum of 5.0 sec or 500.0 ml
5: flat flow
- Maintain coffee temperature at 92.0 °C
- Flow quickly at a rate of 2.2 mL/s
- Limit to 8.6 bar
- For a maximum of 20.0 sec or 500.0 ml
6: reset temperature
- Increase coffee temperature to 98.0 °C
- Flow quickly at a rate of 0.0 mL/s
- For a maximum of 1.0 sec or 500.0 ml
```

Step 1's limiter `{value: 0, range: 0.6}` is off and has no sentence (stored as `null` on
opening, as `normalizeLegacySteps` does); step 5's limiter comes back as `{value: 8.6,
range: 0.6}`, its range by rule 7. The flow steps' `pressure` fields in the file ("1.0",
"6.0", "4.0") are the unused pump's leftovers and are dropped on opening, as in Streamline.

### 17.9 Licence

**Streamline is not ISC.** Its `package.json` says `"license": "ISC"` (npm's default), but
the repository is licensed **GPL-3.0-or-later** since commit `54bf1d7` (2026-09-17, "docs:
add license, contributing guide and codeowners", which says "Adopt Decaid's GPL-3.0-or-later
terms"): see `LICENSE.txt` and `CONTRIBUTING.md` ("Streamline.js is licensed under the GNU
General Public License v3.0 or later, the same terms as Decaid"). There is no ISC notice
anywhere in the repository, and no source file has a header of its own. GPL-3.0-or-later
code may be used in this skin, which is GPL-3.0 (`package.json`: `GPL-3.0-only`; spec 4.4),
and Streamline's `CONTRIBUTING.md` asks derived code to credit the source in the file. Spec
3.6 and acceptance 12 say "ISC copyright notice"; the notice there is to keep is this one,
the opening lines of `LICENSE.txt`, exactly:

```
Streamline.js - A browser-native skin for Decent Espresso machines
Copyright (C) 2025-2026 Decent Espresso
```

Where it goes: at the top of every file that takes code, constants, wording or layout from
Streamline (marked "ported" in 17.10), before anything else; in a `.ts` file as `//` lines,
in a `.svelte` file as the same lines in an HTML comment above `<script>`:

```
// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/<file>.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
```

E2 adds a line to the README's credits naming Streamline and its licence. Item 12 is the
founder's check; `grep -L "Copyright (C) 2025-2026 Decent Espresso"` over the ported files
must list none.

P1 (2026-10-24) read `LICENSE.txt` again at v0.2.14 (`3a4bd23`) and v0.2.17 (`ec1fe2e`): the
same 721 bytes, the GPL-3.0-or-later notice above, and no full licence text in the
repository; `package.json` still says ISC at both. So the one statement is: **Streamline is
GPL-3.0-or-later, this skin is GPL-3.0-only**. `LICENSE` is the GPL-3.0 text as the FSF
publishes it (35147 bytes, SHA-256 `8ceb4b9e...b903`), copied from GCC's `COPYING3` in a local
toolchain (`share/licenses/gcc/COPYING3`; the same bytes as xz's `COPYING.GPLv3` and
libunistring's `LICENSE` in a local Git for Windows), kept LF by `.gitattributes`. `NOTICE`
lists the 43 ported files (35 from v0.2.14, 8 from v0.2.17), Decaid's 73 profiles as test
data, D-Flow and DSx2 (no DSx2 code or asset is in the skin). `src/licence.test.ts` checks
the hash, that `package.json`, README and `NOTICE` say `GPL-3.0-only`, that every file with a
'Ported from Streamline.js' header carries the copyright and licence lines and that `NOTICE`
lists exactly those files. `public/manifest.json` has no licence field: the fields Decaid
reads are `id`, `name`, `description`, `version`, `author` and `repository`, and none of the
seven skins installed with Decaid carries one; the test accepts one only if it says
`GPL-3.0-only`.

### 17.10 Files: what is reused, what is new

Reused as they are: `NumberPad.svelte` (every number, with its unit and range),
`ValueChip.svelte` (the ± stepper with its value; a tap opens the pad; tones flow, pressure,
temperature, none), `NameDialog.svelte` ('save as'), `ShotGraph.svelte` (the preview: it
takes target series with `null` gaps and draws flow blue, pressure green and temperature red
in its own band; `fit` ends the axis at the last point), `UnsavedDialog.svelte`,
`loadProfile`, `storeAndLoad`, `StepsTakenError`, `sameSteps` and the client's profile calls.
Not reused: `Graph.svelte`, `curve.ts`, `edit.ts`, `fields.ts` and `StepList.svelte`, which
are about A-Flow phases, not steps.

New files, all under `src/steps/` (the step editor) except the route:

| File | Job | Ported? | Milestone |
|---|---|---|---|
| `src/editor/route.ts` (+ test) | `editorFor`: which editor a profile opens in (17.5) | new | E2 |
| `src/steps/limits.ts` | the ranges and steps of 17.6, the exit maps, `DEFAULT_LIMITER_RANGE` | ported (`profile-field-limits.js`) | E2 |
| `src/steps/model.ts` (+ test) | pure step operations, each returning a new profile: `openProfile` (`normalizeLegacySteps`), `newStep`, `insertStepAfter`, `removeStepAt`, `moveStep` (each with the count start), `setPump` (the seeds), `setExit` with the remembered values (a map per step object, as in Streamline), `setLimiter` (`newLimiterRange`), `setValue`; `readExitDef`; the pump and exit cycles | ported (`profile_editor.js` l. 138-248, 404-421, 555-607, 784-814, 3418-3430) | E2 |
| `src/steps/save.ts` (+ test) | `saveStepEdit`, `saveStepAs`, `stepMetadata`, `profileChanged`, the load on leaving (17.7); `writeProfile` itself goes into `src/editor/storage.ts` | new | E2 |
| `src/steps/StepEditor.svelte` | the screen: top bar (title, tab switch, 'save', 'save as'), the tabs, the editor's state (the profile, the one it opened with, the open card), saving, leaving (`skin.leaving`), notices, the question before a delete | ported (layout of `profile_editor.html`) | E2; tabs added in E3 and E4 |
| `src/steps/StepCard.svelte` | one card, closed (read-only lines) or open (name field, chevrons, the five rows, trash and plus) | ported (`renderStepCards`) | E2 |
| `src/steps/CycleChip.svelte` | a chip that cycles its states on a tap: sensor, pump, exit | ported (`createCycleChip`) | E2 |
| `src/steps/curve.ts` (+ test) | the preview's series from the steps: times, and target pressure, flow and temperature with `null` where a step does not control that pump; `fast` and `smooth` as in `pushChannel` | ported (`pushChannel`, `renderScriptGraph`) | E3 |
| `src/steps/ProfileSettings.svelte` | the SETTINGS tab: title, notes (a text field), target weight, target volume, tank temperature | ported (part of `renderSettingsTab`) | E3 |
| `src/steps/script.ts` (+ test) | `writeScript(profile)` and `parseScript(text, profile)` of 17.8 | ported wording (`buildStepScript`, `temperatureVerb`, `scriptValueFormat`); the parser is new | E4 |
| `src/steps/ScriptTab.svelte` | the SCRIPT tab: text field, errors, preview | ported (layout of the SCRIPT panel) | E4 |

Changed: `src/App.svelte` (the routing), `src/shell/Profiles.svelte` (back to the editor for
every profile), `src/editor/Editor.svelte` (the non-A-Flow notice goes),
`src/editor/storage.ts` (`writeProfile`), `src/editor/unsaved.ts` and
`src/shell/UnsavedDialog.svelte` (17.7). There is no new setting, so `src/settings.ts` and
its KV backup stay as they are.

Layout at 1280 x 800, every size relative to the viewport as in the rest of the skin: the top
bar as the A-Flow editor's; CARDS a row of cards that scrolls sideways with snap, about three
and a half cards wide, one open at a time; E3 puts the preview as a band above the cards
(about a third of the height), so that a step edit and the preview's change are seen on one
screen (acceptance 11); SETTINGS and SCRIPT fill the panel.

### 17.11 The milestones and their tests

Each builds on the one before, and none changes what an earlier one tested.

**E2: step cards, add, delete, move, save** (acceptance 10). Builds `route.ts`, `limits.ts`,
`model.ts`, `save.ts`, `writeProfile`, `StepEditor.svelte` with the CARDS tab only,
`StepCard.svelte`, `CycleChip.svelte`, the licence headers and the README line, and the
changes of 17.10. Tests:
- Vitest: `route.test.ts` (an A-Flow 3.0 default and a saved 3.0 profile → A-Flow; Decaid's
  `A-Flow / default-medium`, a 3.0 profile with one step changed and "Blooming Espresso" →
  steps; no profile → A-Flow); `model.test.ts` (Streamline's `step-index-bookkeeping` and
  cycle tests ported; the pump seeds; an exit switched off and on gets its value back; a new
  limiter's range; no operation changes its input); `save.test.ts` with `gateway.fake.ts`
  ('save' posts with `parentId` and hides the parent; a change of title or notes alone is a
  `PUT`; a default has 'save as' only; the metadata loses `aflow`; `StepsTakenError`);
  `unsaved.test.ts` (an edited step profile on the machine is unsaved, a stored one is not,
  hidden versions count).
- Playwright, mocked gateway, `e2e/step-editor.spec.ts`: a non-A-Flow profile opens the step
  editor and an A-Flow 3.0 profile the A-Flow editor; change a value with ± and with the
  pad, add a step, delete one, move one, save: the `POST` body's steps equal the edit and it
  carries `parentId`; leaving with changes loads them; the warning comes before another load.
- Rig, `e2e-rig/step-editor.spec.ts`: the same edits on a copy ('save as' of a bundled
  profile), then 'save'; `GET /api/v1/profiles/{id}/lineage` holds both versions; the test
  deletes what it made and restores the workflow.

**E3: curve preview and profile settings** (acceptance 11). Builds `curve.ts`, the preview
band in `StepEditor.svelte` and the SETTINGS tab. Tests: Vitest `curve.test.ts` (Streamline's
four `pushChannel` tests; a pressure step leaves the flow series `null`; durations add up;
0 s steps); Playwright: each kind of step edit (a value, add, delete, move, a pump switch)
changes the preview's paths; title, notes, target weight, target volume and tank
temperature edited in SETTINGS are in the stored profile (the `POST` or `PUT` body), also
when only the title or the notes changed.

**E4: SCRIPT tab** (acceptance 13). Builds `script.ts` and `ScriptTab.svelte` and uses E3's
`curve.ts` for the preview (if E3 is not in yet, E4 writes `curve.ts` as 17.10 says). Tests:
Vitest `script.test.ts` with the two worked examples of 17.8 as fixtures (the profile JSON
and the exact text): `writeScript` gives the text and `parseScript` the steps; every rule of
17.8 and every error message with its line number; `parseScript(writeScript(p), p)` equals
`p`'s steps. Playwright: editing a number in the text changes the preview and, saved, the
stored step; a text that does not parse shows its error and 'save' sends nothing. Rig
(read-only): the round trip of every profile `GET /api/v1/profiles` lists.

### 17.12 Risks, and what Streamline does that 3.6 leaves out

Risks:
- **The SCRIPT tab is not Streamline's.** Spec 3.6 says "ported", but the typed text and its
  parser are new (17.8), and typing on the tablet's keyboard is slower than Streamline's
  taps. The text is written in Streamline's words, so it reads the same.
- **The licence** of spec 3.6 and item 12 (ISC) is not what Streamline's repository says
  (17.9). Spec 5 is not changed here.
- **What Decaid hashes.** Section 11.1 proved steps and target weight; tank temperature and
  target volume are hashed too (seen in E3, 17.15); beverage type was not tried. `writeProfile` is right either way, but if
  they are not hashed, a change of only those is a `PUT` and leaves no new version in the
  lineage (as a change of notes does today).
- **M2 changes the same functions today** (`readParams`, `writeParams`); 17.5 and 17.7 say
  how E2 meets it.
- **Values out of range** that a profile brings from another app are kept, but cannot be
  typed: a SCRIPT text holding one does not parse until it is brought into range.
- **0 s steps** (19 bundled) are drawn 10 s long by Streamline, and so by the preview here
  (built in E3, 17.15).
- **A load by another app** while an editor is open switches the editor (17.5).

In Streamline, not in spec 3.6, so not in the port (listed, not added to the scope): the
SCRIPT tab's tappable pills and cycling words; the limiter ranges (SETTINGS "Flow Range",
"Pressure Range"; they are kept as they are); "Pre-infusion ends at" in SETTINGS (the count
start is kept by every step operation and set by the SCRIPT marker); beverage type tiles;
the author field; notes as Markdown; upload of a JSON or `.tcl` file; import by Visualizer
share code; flow calibration per profile; dose, yield and grind overrides in the KV store;
local drafts and favourites; version history and revert from the lineage; a new profile
from a blank template; renaming on 'save' with a " (2)" suffix (the skin's `NameDialog`
refuses a taken name instead); the number pad's recent values; translations.

### 17.13 Choices the founder has not seen

1. A profile is A-Flow when the A-Flow editor can read its 3.0 values; Decaid's five bundled
   de1app A-Flow profiles open in the step editor (17.5).
2. The SCRIPT tab is a typed text in Streamline's sentences with a parser of the skin's own,
   since Streamline's tab has no text (17.8).
3. Streamline is GPL-3.0-or-later, not ISC; the notice kept is its `LICENSE.txt` header
   (17.9).
4. The step editor keeps Streamline's ranges (flow up to 15 ml/s); the maximum-flow setting
   is the A-Flow editor's (17.6).
5. 'Save as' in the step editor records its source as parent, unlike the A-Flow editor's;
   'save' of a bundled default is not offered; leaving loads changed steps, as in the A-Flow
   editor (17.7).
6. The preview draws a step without a time 10 s long, as Streamline does, and shades it; volume
   and weight do not change a step's drawn length (17.15).
7. 'save' stores the title the SETTINGS tab shows, so it renames the profile; it is off while
   another visible profile has that title (17.15).
8. The SCRIPT parser keeps every field the text does not hold and prints an exit of 0; a broken
   text turns saving off, refuses leaving, and is dropped when another tab opens (17.16).

### 17.14 Built (E2)

Built on 2026-10-16 (acceptance 10, 12's headers). Files as 17.10 lists them for E2:
`src/editor/route.ts`, `src/steps/{limits,model,save}.ts`, `src/steps/{StepEditor,StepCard,CycleChip}.svelte`,
`writeProfile` in `src/editor/storage.ts` (`writeParams` is now `writeProfile` with the
parameters in the notes; its PUT is sent when the answer differs from the wanted profile in
anything, not only in the notes), the step case of `unsavedOnMachine` (`Unsaved` has
`profile`, and `params` is null for a step profile), and the routing in `App.svelte` and
`Profiles.svelte` (the picker opened from the editor returns to the editor for every
profile; both "not an A-Flow 3.0 profile" notices are gone). The README has a Credits section.
`grep -L "Copyright (C) 2025-2026 Decent Espresso"` over the six ported files lists none.

**Layout.** Top bar: the title (the way to the picker), the tab group with `cards` alone (E3
and E4 add theirs there), the number of steps, 'save', 'save as'. Below, a row of cards that
scrolls sideways: closed cards (13.5 rem) list a step's values in their colours, the open one
(46 rem) has the sensor and pump chips that cycle, temperature, target, limit, exit and the
three maxima as the A-Flow editor's `ValueChip` (± and the `NumberPad`), the name as a text
field, arrows to move it, 'delete step' (asks "Delete step n?") and '+ step after' (a copy
named "New Step", as in Streamline). The row is as high as the open card, about 45 % of the
screen at 1280 x 800: the room above it is E3's preview band. The only step of a profile cannot
be deleted, so no profile is saved without steps. Screenshot: `docs/product/step-editor.png`.

**Nothing is lost on save.** The model does not normalise: `openProfile` is a copy, every
operation returns a new profile in which the steps it did not touch are the same objects and
an edited step is the old one with only the edited fields changed (`{...old, field}`), and
every top-level field is spread through. So a field the editor does not show (the bundled
files' `legacy_profile_type`, `lang`, `reference_file`, …; the unused pump's value; a limiter
of 0 with its range; an exit type Decaid does not take) goes back as it came. Unlike 17.2 and
17.8 say for Streamline, the unused pump's value is not dropped on opening, and a pump switch
keeps it (switching back gives it again); a limiter set to 0 keeps its range. Tests:
`src/steps/model.test.ts` ('nothing is lost': all 73 bundled profiles open unchanged; one
edited value changes that value alone and setting it back gives the profile as it came; add,
move and delete back give it unchanged; a profile with unknown top-level and step fields and a
`weight` exit keeps them through edits) and `src/steps/save.test.ts` (the body sent for such a
profile holds them). The fixture is `src/steps/fixtures/bundled-profiles.json`: the rig's 73
bundled files with their numbers as numbers, as the API returns them.

**Validation.** `stepProblems` checks a step against 17.6's ranges (and an unknown pump or exit
type); ± and the pad cannot leave a range. A value a profile brings outside its range is shown
on its card in the warning colour with "Kept as the profile has it: …" and saved unchanged
unless edited. 17.4 is not quite right: three steps of "Cleaning/Forward Flush x5" hold a
pressure of -4e-16 bar (float noise in the file); values within 1e-6 of a bound count as
inside, and such a value reads 0.0.

**Unsaved warning.** A profile that is not A-Flow 3.0 is unsaved when no record of its title,
hidden ones too, has its steps and target weight (what Decaid hashes); notes or author of the
workflow's copy do not count.

**Metadata.** `stepMetadata`: the parent's metadata, `source: 'decaid-skin'`, without any key
starting with `aflow` (M2's key was not known yet). A copy of a bundled profile so keeps the
bundled record's `metadata.filename` (seen on the rig).

**Tests.** Vitest: `route.test.ts` (4), `steps/model.test.ts` (18), `steps/save.test.ts` (10),
5 new in `unsaved.test.ts`; 486 in all. `e2e/step-editor.spec.ts` (4): routing both ways, a
value by ± and by pad, add, delete, move, 'save' (POST body equals the model's edit, `parentId`,
parent hidden, loaded), leaving loads, the warning and its 'Save as…', a bundled default by
'save as' only. Five older e2e tests changed: three that test the A-Flow editor now load an
A-Flow 3.0 profile first (the mock's workflow profile is not A-Flow 3.0), two expect the step
editor where the notice was. Rig: `e2e-rig/step-editor.spec.ts` (edits of Blooming Espresso
saved as a copy, parent the bundled record; one more edit and 'save': the stored steps equal the
model's edit, the lineage holds the copy hidden and the edit visible, the bundled record is
unchanged; everything made is purged and the workflow restored). `e2e-rig/editor.spec.ts`'s
unsaved test now expects the step editor after the picker. Full `npm run e2e:rig`: 14 passed,
1 failed: the known steam control step (Streamline 0.2.14, 18.4), as before E2.

### 17.15 Built (E3)

Built on 2026-10-16 (acceptance 11). Files: `src/steps/curve.ts` (+ `curve.test.ts`),
`src/steps/ProfileSettings.svelte`, the settings' ranges (`SETTING_LIMITS` in
`src/steps/limits.ts`) and operations (`settingOf`, `formatSetting`, `setSetting`,
`stepSetting`, `setText` in `src/steps/model.ts`), the preview band and the SETTINGS tab in
`StepEditor.svelte`, a preview mode of `src/graph/ShotGraph.svelte`, and a rename in the save
path. Screenshots: `docs/product/step-editor.png` (cards with the preview),
`docs/product/step-settings.png`.

**The preview.** `stepCurve(profile)` gives two points per step (its start and end) for the
target pressure, flow and temperature, with `null` where a step does not drive that pump; the
graph is the skin's one chart, `ShotGraph`, so pressure is green, flow blue and temperature red
in its own band on top, on the same scales as the shot graph (the main scale grows past 12 in
steps of 4 for a higher target). `preview` draws the targets as solid lines without measured
values; `borders` draws a dashed line where each step starts; `shaded` greys a stretch.
`fast` jumps to the target and holds, `smooth` ramps from the previous step's target over the
whole step, and a pump the previous step did not drive counts as 0 for the ramp
(Streamline's `pushChannel`, ported with its four tests). `Graph.svelte` and `editor/curve.ts`
were not reused: they draw and drag A-Flow phases, not steps (17.10). The preview is a band
between the top bar and the cards and takes the height the open card leaves (at least 20 % of
the screen; about 43 % at 1280 x 800); it is redrawn from the profile on screen, so every edit
of a card (a value, a pump or exit switch, add, delete, move) changes it.

**Drawn length of a step: Streamline's rule.** A step is drawn as long as its `seconds`; a step
with 0 s is drawn 10 s long (`UNTIMED_STEP_SECONDS`). Its volume, weight and exit do not change
the length: how soon they end a step depends on the coffee, which a preview of targets cannot
know. So a step that ends on volume or weight is drawn as long as its time, or 10 s when it has
none; such a 0 s step is shaded, with the line "shaded: a step without a time, drawn 10 s long".
This replaces 17.12's plan to draw 0 s steps 0 s wide (the task asked for Streamline's rule).

**SETTINGS.** A tab beside `cards` (the cards and the preview make way for it): the title (a
text field; an empty field is not taken, the profile keeps its title and the field says so),
the notes (a plain text area), and target weight (0-1000 g in 0.1), target volume (0-500 ml in
1) and tank temperature (0-110 °C in 1) as `ValueChip`s with ± and the `NumberPad`, 0 is off,
Streamline's ranges. Every other field of the profile goes back as it came.

**Saving the settings.** They are fields of the profile and go through `saveStepEdit` and
`saveStepAs` unchanged. One change was needed: 'save' used to store the profile under its
parent's title; it now stores the title on screen, so a new title in SETTINGS renames the
profile. `writeProfile` takes the id of the record a 'save' continues (`renaming`): when Decaid
answers a `POST` with that very record (the same steps and target weight), its title may change
and it gets the `PUT`; any other visible record with the same content still throws
`StepsTakenError`. 'save' is off while the title is that of another visible profile ("Another
profile is called …: choose another title, or use save as."). 'save as' asks a name as before.

**What Decaid hashes (17.12, settled on the rig).** A `POST` of a stored profile with only the
tank temperature changed, or only the target volume, gave a new id: both are in the id, beside
the steps and the target weight. Title and notes are not. So a change of any number of SETTINGS
is a new version in the lineage (parent hidden); a change of the title or notes alone is a `PUT`
of the same record.

**Tests.** Vitest: `steps/curve.test.ts` (13: Streamline's four, the other pump a gap, smooth
from 0 after the other pump, durations add up, 0 s steps 10 s whatever their volume, weight or
exit, no steps, string numbers, Blooming Espresso, all 73 bundled profiles, every kind of edit
changes the curve), 3 in `model.test.ts` (the settings), 3 in `save.test.ts` (a rename is a
`PUT` of the same record; the five settings in the body; another profile's steps under a new
title still refused). Playwright, mocked gateway, `e2e/step-preview.spec.ts` (3): the preview's
paths change with a value by ± and by pad, a time, two pump switches, add, move and delete; a
0 s step is shaded; the five settings in the `POST` body and the stored record; the title alone
and the notes alone are saved (a `PUT`); a title in use turns 'save' off; an empty title is not
taken. Rig, `e2e-rig/step-editor.spec.ts`, a second test: the preview follows a time edit; a
copy of Blooming Espresso, then all five settings and 'save': `GET` reads them back, a new
version with the copy hidden, the workflow holds them; the title alone, then the notes alone:
the same record; the hash probe above; all made is purged.

### 17.16 Built (E4)

Built on 2026-10-16 (acceptance 13). Files: `src/steps/script.ts` (+ `script.test.ts`, 24
tests), `src/steps/ScriptTab.svelte`, `src/steps/StepPreview.svelte` (E3's preview moved out of
`StepEditor.svelte` unchanged, so that the cards and the script draw it alike), the tab and the
error state in `StepEditor.svelte`. All carry Streamline's notice (17.9). Screenshot:
`docs/product/step-script.png`.

**The text.** `writeScript(profile)` prints 17.8's format exactly; both worked examples are
fixtures and come out word for word. `parseScript(text, profile)` reads it by 17.8's grammar and
rules 1 to 9, with the error messages 17.8 gives ("line 18: pressure is 0 to 12 bar", "line 3:
not understood: '…'", "step 2 has no pump sentence", "line 1: a step starts with 'number: name'",
"the script has no step") and a few more of the same shape (a second sentence of a kind, units
that do not follow the pump, the marker on step 1 or twice, an amount it cannot read). All errors
of a text are listed at once.

**Nothing is lost, unlike 17.8 planned.** 17.8 had the parser build each step from its text, which
would drop what the text does not hold (E2's rule, 17.14, is that the editor drops nothing). So the
parser compares: a parsed step whose sentences say what a step of the profile says *is* that step,
unchanged (at its own place first, else the first unused one, so moving or deleting a block keeps
the steps' own fields); a step that differs is the profile's step at that place with only the
changed values set, as a card edit does: the unused pump's value, a limiter's range or a limiter of
0, a `weight: null`, an exit type Decaid does not take, and fields of other apps stay. A new limit
takes `newLimiterRange` (rule 7). Numbers are compared as printed (two decimals), so float noise in
the files (9.999999999999993, -4e-16) comes back as it was. Tests: the round trip
`parseScript(writeScript(p), p)` equals `p` for all 73 bundled profiles, and on the rig for every
profile `GET /api/v1/profiles` lists; the text alone (on a profile without steps) prints the same
text again.

Where it differs from 17.8: an exit of 0 is printed (rule 8 left it out): Streamline prints it, and
"pressure is over 0 bar" ends a step at once, so leaving it out would hide what the step does (5
bundled steps have one). A value out of its range is an error (rule 3) unless the profile's step at
that place already has that value, as a card keeps it (17.12's risk "cannot be typed" is so gone).
The temperature also reads without "°" ("92 C"), and a number may be written without decimals.

**The tab.** SCRIPT sits between cards and settings. The text is written from the profile when the
tab opens; every input is parsed at once (a text that was not changed is never parsed back). A text
that parses is the editor's profile, so the preview beside it moves, the step count changes, and
cards and 'save' have it. A text that does not parse: the errors under the text ("The script has
errors: nothing is saved."), the preview on the last text that parsed, 'save' and 'save as' off,
and leaving the editor (back, the picker) refused with a notice. Opening cards or settings drops the
broken text: they show the steps that last parsed, and SCRIPT writes its text from them again.

**Tests.** Vitest `script.test.ts` (24): both worked examples both ways, number printing, every
sentence kind, the 73-profile round trip, a one-value change touches that value only, fields kept,
the new limiter's range, reorder and delete, loose spelling, the verb not read, left-out sentences,
a pump switch, every error with its line. Playwright `e2e/step-script.spec.ts` (2): a flow changed in
the text moves the preview, 'save' posts exactly that step changed (parent hidden, loaded), the cards
show it; a broken text lists its errors with lines, the preview stays, save and save as are off,
back is refused, no POST, PUT or workflow write, the cards show the steps that last parsed. Rig,
`e2e-rig/step-editor.spec.ts`, a third test: the round trip of all listed profiles; Blooming
Espresso's flat flow changed in the text, a range error turns 'save as' off, then 'save as' from
the tab: `GET` reads exactly that change back, the workflow holds it; all made is purged. Full
`npm run e2e:rig`: 19 passed, 1 failed, the known steam control step (18.4); log
`..\decaid-rig\log\e4-e2e-rig.txt`.

### 17.17 Built (E5)

Built on 2026-10-18 (spec 3.7, the step cards; acceptance 26, first half). The founder's review
of 2026-10-16 says the arrow buttons go and the selected card always moves to the centre. The
arrows were the two chevrons in the open card's header that moved the step (Streamline has them
there too, 17.2); they are gone, and the header is the step's number and name. Moving a step is
kept in the simplest place: two text buttons, **move left** and **move right**, in the open
card's footer between **delete step** and **+ step after**; they keep the test ids
`step-move-left-n` and `step-move-right-n`, so `e2e-rig/step-editor.spec.ts` is unchanged.
Drag to reorder was not built: it would fight the row's sideways swipe.

**Centring.** `centredScroll` (`src/steps/centre.ts`) gives the row's scroll position that puts
the open card's centre on the row's centre, held between 0 and what the row can scroll. At
1280 x 800 a profile of six steps is 1872 px of cards in a row of 1248 px, so the first card
stays at the left end (its centre 256 px left of the row's) and the last at the right end; the
middle ones centre exactly. `StepEditor.svelte` centres in an effect on the open card's index,
the number of steps and the row: `scrollTo` with `behavior: 'smooth'`, or at once when the row
is new (the cards tab opened again). The cards snap to their centre (`scroll-snap-align:
center`, was `start`), so a swipe of the row ends on a centred card too, and a centring scroll
is not pulled back to a card's start. The previous `scrollIntoView({ inline: 'nearest' })`
after a move or an insert went.

**Tests.** Vitest: `src/steps/centre.test.ts` (4). `e2e/step-editor.spec.ts`: a new test (no
button and no icon in the card's header, a tap on cards 3 and 4 centres them to 1 px, the last
card at the row's right end, the first at the left, a step moved right and twice left stays
open and centred); the acceptance-10 test waits for the centring before its screenshot
(`docs/product/step-editor.png`). Rig: full `npm run e2e:rig` 31 of 31, Streamline 0.2.14.

### 17.18 Built (E6)

Built on 2026-10-18 (spec 3.7, SCRIPT; acceptance 26, second half). Streamline's SCRIPT view
(`buildStepScript`, `renderScriptLine`, `createScriptChip`, `renderScriptTab` in
`src/modules/profile_editor.js`, l. 2329-2806 at `3a4bd23`) is ported, and E4's typed text with
its parser (17.8, 17.16: `src/steps/script.ts`, 24 tests) is removed. Files:
`src/steps/sentences.ts` (+ `sentences.test.ts`, 10 tests) and `src/steps/ScriptTab.svelte`, both
with the notice of 20.8; `StepEditor.svelte` lost the error state (nothing can fail to parse).

**The sentences.** `stepSentences(profile, i)` gives a step's lines as words, chips and pills in
Streamline's order and wording: "Start tracking water volume" on the step after
`target_volume_count_start`; "Set|Increase|Decrease|Maintain [Coffee|Water] temperature to|at
{93.0 °C}"; "[Flow quickly…] at a rate of {4.0 mL/s}" or "[Pressure …] to {9.0 bar}"; "Limit to
{8.6 bar}"; "For a maximum of {36.0 g} or {2.0 sec} or {500.0 ml}"; "Move on if [Pressure is
over] {4.0 bar}". A limit, a maximum or an exit that is off has no sentence, as in Streamline
(the cards add one). Numbers print with one decimal, two where they have a second (0.75).

**Chips and pills.** The sensor and pump chips are the cards' cycles (`cycleSensor`, `cyclePump`);
the exit chip cycles the four exits without off (`cycleScriptExit`), as Streamline does, keeping
the step's last value of a type. A pill opens `NumberPad` through the editor's `typing` state with
`limitOf`'s range, the same pad and ranges as the cards; 0 on a limit or maximum removes the
sentence. The preview beside it redraws on every change; save and save as store the edit.

**On the rig.** Decaid stores a pressure step without its unused `flow` (and the other way round):
a pump cycled from flow to pressure is read back without the old flow, which the editor keeps
for switching back. Not a change the skin makes; the rig spec expects it.

**Tests.** Vitest `sentences.test.ts`: the wording of Blooming Espresso's steps, a pressure step's
units, the verb, number printing, every bundled step has a temperature and a pump sentence, each
chip kind's cycle, the pills' values and ranges, 0 removing a sentence. Playwright
`e2e/step-script.spec.ts` (2): no text field; the ramp's pump cycled to pressure quickly and the
exit cycled round move the preview; step 5's flow typed 3.0 on the pad moves it; 'save' posts
exactly those steps, the cards show them; the sensor cycles and a limit typed 0 leaves its
sentence. Screenshot `docs/product/step-script.png`. Rig `e2e-rig/step-editor.spec.ts`, third
test: the same edits on Blooming Espresso, 'save as', the steps read back, purged. Full
`npm run e2e:rig` 31 of 31 with Streamline 0.2.14 served (log `..\decaid-rig\log\e6-e2e-rig.txt`).

## 18. Profile metadata on the rig (M1)

**Verdict: metadata holds.**

Done on 2026-10-16 against Decaid v0.8.8 on the rig, started as in 8.8 step 2 (the machine
state answered 200 within a minute) and ended with `Stop-Process -Force`. Every claim is
**seen running**: by `node scripts/rig-metadata-probe.mjs <backup folder>` (output in the
rig's `log\m1-metadata-probe.txt`) and again by `e2e-rig/metadata.spec.ts`. The API text is
Decaid's `assets/api/rest_v1.yml`.

### 18.1 What was sent

A `POST /api/v1/profiles` with `{ profile, metadata }`, the way `saveProfile` in
`src/api/client.ts` sends it. The profile had steps of its own (a default's steps at a
temperature no stored profile has), since the id is a hash of the steps (11.1). The
`metadata` was shaped like the A-Flow values: `source` and `aflow` as the skin writes them
today, `params` with all 26 values of `AFlowParams` (decimals, `null` for the values that
follow another one, `flowUp: false`) and the 2nd fill off (`pauseDuration: 0`) with its own
values set (`secondFillFlow: 6.5`, `secondFillTemperature: 91.25`, `secondFillTime: 12`), plus
a boolean, a nested object, an array of mixed values, a string with umlaut, quotes, emoji and
a line break, 0, a negative number, 0.000123 and 123456789012.

### 18.2 What came back

| Step | Endpoint | Result |
|---|---|---|
| Create | `POST /api/v1/profiles` | 201; the answer's `metadata` equals what was sent (deep, every type and `null`, key order kept) |
| Read | `GET /api/v1/profiles/{id}` | equal |
| Title and notes | `PUT /api/v1/profiles/{id}` with `profile` and no `metadata` field | same id, metadata **kept** |
| Other steps | `PUT /api/v1/profiles/{id}` with `profile` and no `metadata` field | new id, the old id answers 404, metadata **kept** in the new record |
| Metadata alone | `PUT /api/v1/profiles/{id}` with `{ metadata }` only | supplied metadata **replaces** the stored one, no merge (as `rest_v1.yml` says); `metadata: null` clears it (doc) |
| Lineage | `POST /api/v1/profiles` with `parentId` | the child has only the metadata it is sent: without one it is `null`, **not inherited** from the parent. With one, equal |
| Hidden | `PUT .../visibility` hidden, then `GET` and `GET .../lineage` | the hidden parent keeps its metadata, in the lineage too |
| Profile export | `GET /api/v1/profiles/export?includeHidden=true` | every record carries `metadata`, equal; without `includeHidden` the hidden ones are left out |
| Profile import | purge, then `POST /api/v1/profiles/import` with the exported record | `{"imported":1,...}`; metadata, `parentId` equal |
| Data export | `GET /api/v1/data/export` (ZIP: `metadata.json`, `profiles.json`, `shots.json`, `steams.json`, `workflow.json`, `settings.json`, `store.json`, `beans.json`, `grinders.json`) | `profiles.json` holds every record, hidden and deleted too, with `metadata` equal |
| Data import | purge, then `POST /api/v1/data/import` (`Content-Type: application/zip`) with the export's `metadata.json` and a `profiles.json` holding this profile alone | 200 `{"profiles":{"imported":1,"skipped":0,"status":"complete"}}`; metadata equal |
| Data import over a stored record | the stored record changed to `{ other: 1 }` | `onConflict=skip` (the default) keeps `{ other: 1 }`; `onConflict=overwrite` takes the archive's, equal |
| Large | `metadata` with a 100 KB and a 1 MB string | 201, read back equal |
| Not an object | an array, a string, a number | **500** `type 'List<dynamic>' is not a subtype of type 'Map<String, dynamic>?'`, nothing stored |
| Empty | `{}` and `null` | 201, read back `{}` and `null` |

What the import did not touch: the data import sent only one profile, so the rig's other
sections were never imported. Before it, the rig's whole data export was written outside the
repository (`..\decaid-rig\log\m1-backup\m1-data-export-before-2026-10-16T04-21-55-795Z.zip`,
53 025 bytes, 73 profiles) so that a restore would have been possible; it was not needed.
Every bundled profile already carries metadata (`{"source":"bundled","filename":...}`).

### 18.3 What M2 has to mind

- `metadata` is not part of the id: the id hashes the steps and the target weight (11.1),
  and `metadataHash` is documented to cover title, author and notes only. So a `POST` of steps
  a record already has returns that record with **its old metadata** (11.1): when the save
  path takes over an existing record (`writeParams` in `src/editor/storage.ts`), it has to
  `PUT` the new metadata, as it does the notes today.
- A `PUT` with supplied metadata replaces it whole: send the full object every time.
- A child posted with `parentId` gets no metadata from its parent: the skin's `POST` must
  carry it (`saveEdit` in `src/editor/save.ts` does today).
- The skin must only ever send an object (or `null`): anything else is a 500.

### 18.4 Tests

`npm run e2e:rig`: `e2e-rig/metadata.spec.ts`, four tests (GET, PUT and the lineage; the
profile export and import; the data export and an import of an archive with the test's own
profile alone; large and non-object metadata). M2 can swap its `METADATA` for the shape it
stores. Each test purges what it created and checks that the rig holds the profiles it
started with.

The full rig run of 2026-10-16 (`log\m1-e2e-rig.txt`): 13 passed, 1 failed, not in this
work's spec: the last 'control' step of `e2e-rig/steam.spec.ts` ("a timer written into the
workflow alone is replaced by the seconds Streamline remembers") waits in vain, twice. Decaid
updated Streamline itself at today's start (`automaticUpdateCheck`, `.rea_metadata.json`:
0.2.13 → **0.2.14**, released 2026-10-15). 0.2.14 reworked the write-back of its
remembered values (`resyncIfDrifted` and `decideResync` in `src/modules/api.js`, which can now
**adopt** an outside value into its KV key instead of pushing its own back), so the write-back
of section 16 that the control step relies on was not seen. Read, not run further: outside M1.
The skin's own steam checks before that step pass.

What the run left in the rig: nothing. 73 profiles as before, hidden and deleted ones counted;
the skin's KV namespace empty; Streamline is the default skin; no setting written. Decaid is
stopped.

**Confirmed on 2026-10-17 (R1), with Streamline 0.2.14 served by the rig** (`.rea_metadata.json`:
`github_release:allofmeng/streamline_project@v0.2.14`, installed 2026-10-16, checked again at
this start). With a Streamline page open and remembering 43 s, `PUT /api/v1/workflow
{"steamSettings":{"duration":26}}` is not answered by a push: within 15 s Streamline writes 26
into `streamline-app/last-steam-duration`, and 5 s later the workflow and the machine
(`targetSteamDuration`) still have 26. That is `decideResync`'s `adopt` (`resync-policy.js`
at `3a4bd23`): the remembered value wins only for Streamline's own pushes not yet seen in the
workflow (and within 10 s of them, `ECHO_WINDOW_MS`); a value someone else wrote is taken over.
So the write-back of section 16 no longer happens with 0.2.14. The control step of
`e2e-rig/steam.spec.ts` now checks the adoption (KV key 26, workflow and machine 26) instead of
the write-back. The skin's own steps are unchanged and still needed for a tablet on 0.2.13:
the skin changes Streamline's key before it writes the workflow, so either version agrees.
Full rig run: 21 passed (`log
1-e2e-rig.txt`). The rig was left as found: 73 profiles, the
skin's KV namespace empty, `last-steam-duration` absent, steam settings as before (50 s),
Streamline the default skin.

**Steam's substates (R1, spec 3.7).** The simulated steam is `steam`/`idle` from its first
frame to its last and goes straight to `idle`/`idle` (seen running, `PUT .../state/steam`, 6 s,
`PUT .../state/idle`; the steam record it wrote was deleted). The real DE1 stays in state
`steam` after the steam itself: Decaid's `MachineSubstate` (rest_v1.yml) has `pouringDone`,
`puffing` and `pausedSteam` for the end, the purge and the pause of the two-tap purge. The
skin ended its steam run only on a frame of another state, so on the real machine the graph
went on and the last steam time took in the purge or the pause: the founder's bug of
2026-10-16. The run now ends on those substates too (`steams` in `src/steam/run.ts`); proven
with Vitest and the mocked gateway, not on the rig, whose simulation has no such tail.

### 18.5 Built (M2)

The A-Flow values moved from the profile's `notes` to the record's `metadata` (spec 3.6,
acceptance 14), all in `src/editor/storage.ts`; done on 2026-10-16.

- **Stored record.** `writeParams` sends `metadata: { source: 'decaid-skin', aflow: '3.0', params }`
  (`paramsMetadata`, the codec's object: `encodeParams` in `src/aflow/codec.ts`, the same 26
  values as the string of version 1, the 2nd fill's kept while it is off) and the `notes`
  without the values (`notesText`). `isAFlow3` reads `source` and `aflow` as before.
  `writeProfile` now also `PUT`s when only the metadata differs (18.3: a `POST` of stored steps
  answers with the old metadata), e.g. a dose edit or a 2nd fill value while it is off. The
  A-Flow defaults the picker adds are stored the same way. The step editor drops `params` with
  `aflow` from a parent's metadata (`stepMetadata`).
- **Reading.** `readParams(profile, metadata?)` decodes `metadata` first (`decodeParams`), then
  a line of the `notes` that is the codec's string (`splitNotes`), then checks the ranges and
  that the steps are the generator's, as before. `readRecord(record)` is the short form; the
  editor's list, the start row and the unsaved check read records with it.
- **Moving version 1.** A record with the values in its `notes` opens as before. 'save' keeps
  the parent's notes text (`About.notes`) and drops the values' line, so the new version, or
  the same record by a `PUT` when the steps are unchanged, has them in `metadata` and only the
  user's text in `notes`. A hidden older version keeps its old notes.
- **The workflow.** `PUT /api/v1/workflow` takes a profile, not a record, and a shot copies
  the workflow's profile (14). So `loadProfile` (and `loadRecord`, which passes the record's
  metadata) sends a copy whose `notes` start with the codec's string (`workflowProfile`). This
  keeps the editor's opening on the machine's profile, the unsaved-edits warning (17.5, the
  values loaded on leaving are stored nowhere else) and the history's A-Flow entries working
  from Decaid alone, across reloads and devices. The cost: another app that shows the loaded
  profile's notes shows the values' line, as in version 1.
- **The picker** shows the dose from the metadata and a user's notes text, never the values.

Tests: Vitest (`codec.test.ts` encode and decode; `storage.test.ts` metadata before notes, the
2nd fill while off, the notes split, the move by `PUT`; `save.test.ts` a version-1 parent moved
on save; `profiles.test.ts` the loads), 504 tests. `npm run e2e`: 91, with a new mock test of a
version-1 profile opened and moved. Rig, **seen running** in `e2e-rig/metadata.spec.ts`:

| Test | Result |
|---|---|
| The skin saves an edit of default-light (2nd fill on, its flow 6.5 and time 12, off again; pour pressure, ramp time, dose) with 'save as' | the record's `metadata` equals `{ source, ...paramsMetadata(values) }`, `notes` empty; the workflow's copy holds the values in its notes |
| Reload | the editor opens on it with every value, the 2nd fill off with its own values |
| Data export, cut to this profile, purge, data import | `metadata` equal; loaded from the picker, the editor shows every value as saved |
| A profile as version 1 stored it (values in `notes` beside "rig note", metadata `{source, aflow}`) loaded into the workflow | the editor opens on it with its values |
| A dose edit and 'save' | the same id; `notes` "rig note"; `metadata` has the values; re-opened from the picker as saved |

The full rig run (`..\decaid-rig\log\m2-e2e-rig.txt`): 16 passed, 1 failed, the same
`steam.spec.ts` control step as in 18.4 (Streamline 0.2.14), not touched here. The rig ended
with 73 profiles (none deleted), the skin's KV namespace empty, Streamline the default skin,
the workflow as before; Decaid stopped, port 8080 free.

## 19. Hot water and flush on the rig (V1)

Done on 2026-10-16 against Decaid v0.8.8 with device simulation (8.8; the gateway answered at
once). Asked through the API with `PUT /api/v1/machine/state/hotWater` and `.../flush`, as
the DE1's own buttons would start them; the skin starts neither (spec 3.6). Frames from
`/ws/v1/machine/snapshot` and `/ws/v1/scale/snapshot` are in the rig's
`log\v1-hotwater-probe.txt`, `v1-hotwater-scale.txt` and `v1-flush-probe.txt`.

| Claim | Status |
|---|---|
| Hot water is state `hotWater`, substate `pouring`, from its first frame to its last | seen running |
| Simulated hot water pours: flow 5.8, 9.5, then 10.0 ml/s (the workflow's `hotWaterData.flow`), pressure 2.5 bar, a frame every 0.5 s | seen running |
| It ends by itself after about 5.5 s, near the 50 ml of `hotWaterData.volume`, long before its `duration` of 30 s; the machine is `idle` again | seen running |
| The mock scale is tared when hot water starts (47.6 g to 3.9 g within 0.8 s) and weighs the water: 47.6 g at the end, `weightFlow` about 8 g/s | seen running |
| `targetMixTemperature` is the hot-water temperature (75) while it runs; `mixTemperature` stays at the cold machine's 16 °C. `rest_v1.yml` says `mixTemperature` is not a reliable outlet temperature during `hotWater` on a classic DE1 | seen running; the real DE1 not seen |
| Flush is state `flush`, substate `idle`; the simulated flush has flow 0 and pressure 0 throughout and does not end by itself (still running after 20 s against `rinseData.duration` 10 s), as simulated steam (8.7); `PUT .../state/idle` ends it | seen running |
| Neither leaves a shot or steam record (`/api/v1/shots/ids` and `/steams/ids` unchanged) | seen running |
| A real flush's flow and the real machine ending flush at its duration | not seen: the founder's check on the real DE1 |

### 19.1 Built (V1)

Home shows a running hot water or flush in place of the graph (`src/shell/Water.svelte`):
on the left an SVG group head whose stream falls into a cup (hot water) or onto the drip
tray (flush); on the right the countdown ring with the stop button inside it, which carries
the label, e.g. 'Flush 6 / 10 s'. The numbers are in `src/shell/water.ts`:

- **The run** (`recordWaterFrame`) starts at the first frame in `hotWater` or `flush` and ends
  at the first frame of another state; time is the frames' own timestamps, as for a shot.
- **The ring** (`ringOf`): whole seconds since the run's first frame against the workflow's
  `hotWaterData.duration` or `rinseData.duration`; full at the duration, the seconds go on
  past it; without a duration only the seconds and an empty ring.
- **The volume** adds the mean flow of two frames times the time between them; the cup
  (`cupOf`) fills to it against `hotWaterData.volume`, or to the scale's weight (g as ml)
  when a scale is connected, as the skin's scale line says. The weight is taken as the scale
  sends it: Decaid tares the mock scale at the start (above).
- **The stream** (`streamOf`): stroke width and the speed of its running dashes grow with the
  measured flow, full at 10 ml/s; at 0.05 ml/s and below it stands still, drawn thin and pale.
  A CSS animation of `stroke-dashoffset`, no library.
- **The colour** (`waterColour`): the mix temperature on a cold-to-hot scale from the skin's
  flow blue (`#4da3ff`) at 20 °C and below to its temperature red (`#ff6b6b`) at 90 °C and
  above, linear in RGB between. The flow, the amount (blue in ml, yellow in g) and the
  temperature are written under the picture in the skin's colours.

Tests: Vitest `src/shell/water.test.ts` (18). `npm run e2e`: `e2e/water.spec.ts`, three tests
with mocked frames (flush with flow and at 0, past its duration, stop; hot water without a
scale at 8, 2 and 0 ml/s; hot water with a scale); screenshots `docs/product/water-flush.png`
and `water-hot.png`. Rig: `e2e-rig/water.spec.ts`, seen running: hot water shows the ring
against 30 s, a moving stream and a cup following the mock scale in g, and leaves home when
the machine ends it; flush shows a still stream (flow 0) and 'Flush 2 / 10 s', and the skin's
stop ends it. The full rig run (`log\v1-e2e-rig.txt`): 18 passed, 1 failed, the same
`steam.spec.ts` control step as in 18.4 and 18.5; it fails on the commit before this task as
well (`log\v1-e2e-rig-steam-baseline.txt`), not touched here.

### 19.2 Built (R3)

Built on 2026-10-17 (spec 3.7, acceptance 19). The picture is gone: the group head, the
stream, the cup and their numbers (`cupOf`, `streamOf`, `waterColour`, the run's volume and
the target volume) are removed with their tests. The view is the countdown ring alone, centred
in the panel, as V1 drew it (whole seconds against the duration, full past it). The stop button
inside it is dark, edged and labelled in the temperature red, and shows the kind ('Flush'), the
time ('6 / 10 s'), the mix temperature ('90 °C', red), the flow ('6.0 ml/s', blue) and, for hot
water with a scale, the scale's weight ('31.4 g', yellow) as the scale stream sends it; flush
shows no weight, hot water without a scale none. The strings come from `waterValues` in
`src/shell/water.ts`; the duration from `waterDuration`.

Tests: Vitest `src/shell/water.test.ts` (15). `npm run e2e`: `e2e/water.spec.ts`, three tests
(no picture in either state, the ring's share and time, the values inside stop, the weight only
for hot water with a scale); screenshots `docs/product/water-flush.png` and `water-hot.png`.
Rig (Streamline 0.2.14 served): `e2e-rig/water.spec.ts` checks the same against the simulation;
the full run (`log\r3-e2e-rig.txt`): 21 passed.

## 20. Settings page port plan (S1)

Written on 2026-10-17 for the milestone S2 (spec 3.7 'Settings', acceptance 22). No product
code was written. "Read" means read in Streamline's source; "seen" means run on the rig. The
founder's goal: "almost all of this should be accessible without switching the skin, except
skin specific things" ([review-10-16-26.md](review-10-16-26.md)). Every choice made here is the
simplest one that meets it; those the founder has not seen are collected in 20.11.

### 20.1 What was read

- **Streamline:** the clone of E1, `../streamline-js`, head **`3a4bd23`** (tag `v0.2.14`,
  "chore(release): v0.2.14"). The rig serves **0.2.14** (`web-ui/.rea_metadata.json`:
  `github_release:allofmeng/streamline_project@v0.2.14`, installed 2026-10-16, checked again
  at this start; `GET /api/v1/webui/skins/default` says `0.2.14`), so the clone is not behind
  what the rig serves and was read as it is. `git fetch` shows `origin/main` 7 commits ahead
  (`c006dac`, not released): among them **Settings > Connections > Grinder**
  (`src/settings/categories/connections.js`, 208 new lines, Decaid's `preferredGrinderDeviceId`)
  and small changes to `settings.js`, `settings-tree.js` and `settings-shell.js`. Not in this
  plan; S2 may add the grinder page if a release carries it by then (20.9).
- **Streamline's settings files** (0.2.14): `src/settings/settings-tree.js` (107 lines, the
  navigation), `settings.html` (62, the page), `settings-shell.js` (381, renders the navigation
  before the big module loads), `settings.js` (11 000, every category), `settings-data.js` (148),
  `settings-restore.js` (118), `settings-location.js` (18), `plugin-view.js` (214),
  `categories/maintenance.js` (371), `categories/quick-adjustments.js` (104),
  `categories/legacy-category.js` (12); and the setters they call in `src/modules/api.js`,
  `eco-steam.js`, `steam-mode.js`, `sensor-cal.js`, `units.js`, `i18n.js`.
- **Decaid's API:** the rig's `assets/api/rest_v1.yml` and `websocket_v1.yml` (schemas
  `ReaSettings`, `De1SettingsRequest`, `De1AdvancedSettingsRequest`, `WaterLevels`) and the
  rig's answers (20.4).
- **This skin:** `src/settings.ts`, `src/settings-backup.ts`, `src/shell/Settings.svelte`,
  `src/api/client.ts`, `src/api/types.ts`, and section 16 (Streamline's remembered values).

### 20.2 Streamline's page: layout and how it saves

`settings.html` at 1920 px: a header ('Settings', **CANCEL**, **SAVE**), a search field, and
three columns: the 11 numbered main categories, the chosen category's subcategories, and the
content of one subcategory. The tree (`SETTINGS_TREE`) is the one source of the navigation;
the last place opened is kept (`streamline.settings.location`). Every control is a ± stepper
around a text field (a tap opens Streamline's number pad), a segmented row of buttons, a
switch or a `<select>`.

Saving is staged: a change goes into `pendingChanges` (`rea`, `de1`, `de1Advanced`,
`workflow`) and only **SAVE** writes them (`flushPendingChanges`): `POST /api/v1/settings`,
`POST /api/v1/machine/settings`, `POST /api/v1/machine/settings/advanced`, `PUT
/api/v1/workflow` for `steamSettings` and `hotWaterData`, and with them Streamline's own
remembered values in KV `streamline-app` (`last-steam-duration`, `last-steam-flow`,
`last-steam-temp`, `last-milk-stop`, `last-hot-water-volume`, `last-hot-water-temp`; section
16). Some controls write at once instead (presence, devices, plugins, brightness, wake lock,
night mode, water alert, maintenance, firmware). After a machine write Streamline re-reads the
machine and records what it holds (`userMachineSettings` in its IndexedDB); on the next visit
of its settings page it **puts the recorded values back** where the machine reports others
(`checkMachineSettingsDrift`, `settings-restore.js`: "what the user chose in this skin takes
priority over a value changed in Decaid, in another skin, or on the machine itself";
`heaterVoltage` excluded). That is a risk for the port (20.9).

### 20.3 Every setting, grouped as Streamline groups them

Columns: what Streamline shows (its label, range, step); where it is read and written; **G** =
a gateway setting any skin can read and write; **S** = Streamline's own (its `localStorage` or
IndexedDB, on its own origin, so another skin cannot reach it, and it only steers Streamline);
**B** = Bengle only (the rig's DE1 answers 404); **X** = an outside service. The last column
says what S2 does: **port**, **skin** (the skin category has its own), or **out**.

**1. Quick Adjustments**

| Subcategory | Setting (Streamline's range) | Read / write | | S2 |
|---|---|---|---|---|
| Flow calibration | Weight flow multiplier (step 0.1, from 0; default 1.0) | `GET`/`POST /api/v1/settings` `weightFlowMultiplier` | G, seen | port |
| | Volume flow multiplier (s, step 0.05, from 0; default 0.3) | same, `volumeFlowMultiplier` | G | port |
| Steam | Steam temperature (0, or 135-165 °C, step 1; "the lowest setting turns the steam heater off") | `PUT /api/v1/workflow` `steamSettings.targetTemperature`; KV `last-steam-temp` when > 0 | G, seen (0 kept) | port |
| | Eco steam (switch) | `localStorage` `streamline.ecoSteam`; Streamline's own idle timer lowers the boiler | S | out |
| | Flow (0.4-2.5 ml/s, step 0.1) | workflow `steamSettings.flow`; KV `last-steam-flow` | G | port |
| | Steam stop: Off / Time / Milk temp | `localStorage` `streamline.steamStopMode`; milk temp writes `steamSettings.stopAtTemperature` (B, milk probe) | S / B | out |
| | Duration (10-120 s, step 5, under 'Time') | workflow `steamSettings.duration`; KV `last-steam-duration` | G | skin: the steam page owns it (3.4) |
| | Steam purge mode: Normal / Two Tap Stop | `GET`/`POST /api/v1/machine/settings` `steamPurgeMode` 0/1 | G, seen | port |
| Hot Water | Target temperature (50-95 °C) | workflow `hotWaterData.targetTemperature`; KV `last-hot-water-temp` | G | port (with R5) |
| | Volume (10-500 ml, step 10) | `hotWaterData.volume`; KV `last-hot-water-volume` | G | port (with R5) |
| | Duration (5-120 s, step 5) | `hotWaterData.duration` | G | port (with R5) |
| | Flow (0.1-8.0 ml/s, step 0.1) | `hotWaterData.flow` | G | port (with R5) |
| | Stop at weight (switch, needs a scale) | `/api/v1/settings` `stopHotWaterAtWeight` | G, seen | port (with R5) |
| | Flow multiplier, "lookahead for stop-at-weight" (s, step 0.05) | `/api/v1/settings` `hotWaterFlowMultiplier` | G | port (with R5) |
| Water Tank | Tank temperature (10-40 °C) | `/api/v1/machine/settings` `tankTemp` | G, not kept by the simulation | port |
| | Water level alert (0-30 mm in steps of 5; default 15) | `POST /api/v1/machine/waterLevels` `{refillLevel}`; read on `ws/v1/machine/waterLevels`; Streamline also keeps `localStorage` `waterRefillLevel` | G, not kept by the simulation | port |
| | Measurement units mm / mL (home's tank level) | `localStorage` `waterTankUnit` | S | out (the skin shows mm) |
| Flush | Flush temperature (5-95 °C, step 5) | `/api/v1/machine/settings` `flushTemp` | G, not kept by the simulation | port |
| | Flush flow (1-8 ml/s, step 1) | same, `flushFlow` | G, seen | port |
| Machine Advanced Settings ("Before espresso starts") | Idle temperature (0-99 °C) | `GET`/`POST /api/v1/machine/settings/advanced` `heaterIdleTemp` | G, seen | port |
| | Heater warmup flow (0-10 ml/s, 0.1) | same, `heaterPh1Flow` | G | port |
| | Heater test flow (0-10 ml/s, 0.1) | same, `heaterPh2Flow` | G | port |
| | Heater test time-out (0-60 s) | same, `heaterPh2Timeout` | G | port |
| | Fast Start Defaults (Apply: 99 °C, 2, 4 ml/s, 1 s; insight-js's cafe preset) | the four above in one `POST` | G | port |

Streamline's flush page has no duration: the flush time is the workflow's `rinseData.duration`
(KV `last-flush-duration`), set on its home page. `rinseData` also has `targetTemperature` and
`flow` (seen: 90 °C, 10 s, 6 ml/s, next to the machine's `flushTemp` 25 and `flushFlow` 6).
`renderQuickAdjustmentsSettings` (fixed numbers, no handlers) is dead code and not ported.

**2. Connections**

| Subcategory | Setting | Read / write | | S2 |
|---|---|---|---|---|
| 1. Machine | the machine list (name, state, battery), scan, connect / disconnect, forget, "connect automatically" (preferred) | `GET /api/v1/devices` and `ws/v1/devices`; `GET /api/v1/devices/scan[?connect=true]`; `PUT /api/v1/devices/connect?deviceId=`; `PUT /api/v1/devices/forget {deviceId}`; `/api/v1/settings` `preferredMachineId` | G | port |
| 2. Scale | the scale list, scan, connect, forget, preferred | the same; `preferredScaleId` | G | port |
| | Scale power mode: Disabled / Display off / Disconnect (when the machine sleeps) | `/api/v1/settings` `scalePowerMode` | G, seen | port |
| | Scale required (block a shot without a scale) | `/api/v1/settings` `blockOnNoScale` | G | port |
| | Wi-Fi scales: add by host, remove | `GET`/`POST`/`DELETE /api/v1/devices/wifi` | G | port |

**3. Calibration**

| Subcategory | Setting | Read / write | | S2 |
|---|---|---|---|---|
| Default load settings | Reset: fan, idle temperature, heater flows and time-out, refill kit, flow multiplier, steam purge to the factory's | `DELETE /api/v1/machine/settings/reset` | G | port, behind a confirm |
| Refill Kit | Auto-detect / Force on / Force off | advanced `refillKitSetting` 2 / 1 / 0 | G, seen | port |
| Voltage | 110 V / 220 V ("restart the machine after changing") | advanced `heaterVoltage` 120 / 230 (a value above 1000 is read minus 1000) | G | port, behind a confirm |
| Fan | Fan threshold (0-50 °C) | `/api/v1/machine/settings` `fan` | G, seen | port |
| Steam | Steam temperature (135-170 °C) | workflow `steamSettings.targetTemperature`, as Quick Adjustments | G | one field, shown once (Quick Adjustments) |
| Sensor Calibration | temperature (offset), pressure and flow (ratio): the machine's reading, a measured value, a correction; the previous one remembered | `GET /api/v1/machine/calibration[/{target}]`, `POST /api/v1/machine/calibration/{target}`; previous value in Streamline's IndexedDB | G (the previous value S) | port, last part |
| Load Cells | four-step wizard with a reference weight | `GET`/`POST /api/v1/machine/scaleCalibration` | B | out |

**4. Machine**

| Subcategory | Setting | Read / write | | S2 |
|---|---|---|---|---|
| USB | USB charger on / off | `/api/v1/machine/settings` `usb`: write `'enable'` / `'disable'`, read back as a boolean | G, seen | port |
| | Charging mode (disabled and Decaid's smart modes) | `/api/v1/settings` `chargingMode` | G | port |
| | Night mode on / off, sleep and morning time (minutes since midnight) | `nightModeEnabled`, `nightModeSleepTime`, `nightModeMorningTime` | G, seen | port |
| | Dim the screen on low battery | `lowBatteryBrightnessLimit` | G | port |
| | Charging status (battery, phase, USB) | `/api/v1/settings` `chargingState`, read only (absent on the rig) | G | port, read only |
| Cup Warmer, Lighting | temperature, schedules, pre-warm; LED colours and sequences | `/api/v1/machine/cupWarmer`, `/api/v1/machine/ledStrip` (404 on the rig) | B | out |
| Machine Information | model, firmware version, serial (copy), GHC, extras | `GET /api/v1/machine/info` | G, read only | port |

**5. Maintenance**

| Subcategory | Action | Request | | S2 |
|---|---|---|---|---|
| Clean | instructions, Start, Cancel | `PUT /api/v1/machine/state/cleaning`, back with `.../idle` | G | port |
| Machine Descaling | instructions and a link to Decent's descaling page, Start, Cancel | `.../state/descaling` | G | port |
| Transport Mode | air purge (empties the machine for transport), Start | `.../state/airPurge` | G | port |

**6. Skin**

| Subcategory | Setting | Read / write | | S2 |
|---|---|---|---|---|
| Theme | light / dark | `localStorage` `theme` | S | out (the skin is dark only, 3.1) |
| Active Skin | the installed skins, switch, update | `GET /api/v1/webui/skins`, `PUT /api/v1/webui/skins/default`, `POST .../update` | G, switches the skin | out; **this category becomes the skin's own (20.6)** |

**7. Language:** Streamline's translations (`setLanguage`, its own `i18n`). S, out: the skin is
in English.

**8. Extensions**

| Subcategory | Setting | Read / write | | S2 |
|---|---|---|---|---|
| Visualizer | user name, password, auto upload, length threshold, back sync and its interval; verify; Streamline's own server form | `GET`/`POST /api/v1/plugins/visualizer.reaplugin/settings`, `POST .../verifyCredentials` | G (the account is X) | port through the plugin card |
| Shot Uploader | auto upload, length threshold; upload the latest shot | `/api/v1/plugins/shot-upload.reaplugin/settings` | G | port through the plugin card |
| Plugins | every plugin Decaid reports: enable / disable, version and update, its manifest settings (a generic control per type: string, number, boolean, secure) | `GET /api/v1/plugins`, `PUT /api/v1/plugins/{id}/enable` / `disable`, `GET`/`POST /api/v1/plugins/{id}/settings`, `POST /api/v1/plugins/update`, `.../update/approve` | G, seen | port |

The rig has 7 plugins: dcamp, decent-profile (12 settings), dye2, settings (1), shot-upload
(2), time-to-ready (1), visualizer (6).

**9. Miscellaneous**

| Subcategory | Setting | Read / write | | S2 |
|---|---|---|---|---|
| Decaid Settings | Gateway mode: Disabled / Tracking / Full | `/api/v1/settings` `gatewayMode` | G | port, behind a confirm |
| | Log level (ALL ... OFF) | `logLevel` | G | port |
| | Automatic update checks | `automaticUpdateCheck` | G | port |
| | Decaid's version and build; update check and install | `GET /api/v1/info`; `GET`/`POST /api/v1/update` (seen: `phase idle`, `installable false`) | G | port |
| | Web UI path (read only) | `webUiPath` | G | port, read only |
| | Go to dashboard | `window.decentApp.exitToDashboard()` (the host, not the gateway) | host | port |
| Brightness | screen brightness slider, auto | `ws/v1/display` command `setBrightness` (the skin uses `PUT /api/v1/display/brightness`); KV `last-brightness` | G | port |
| Wake Lock | keep the screen on | `POST` / `DELETE /api/v1/display/wakelock` (`wakeLockOverride`); Decaid's `keepAwake` setting | G, seen | port |
| | Load a profile on wake | `localStorage` `wakeProfileEnabled`, `wakeProfileId` | S | out |
| Presence Detection | presence on / off, sleep after (1-120 min), wake schedules (time, days, keep awake for) | `GET`/`POST /api/v1/presence/settings`; `GET`/`POST /api/v1/presence/schedules`, `PUT`/`DELETE .../{id}` | G, seen | port |
| Display Size, Temperature unit, Screen Saver, Keyboard Shortcuts | zoom and line width, °C / °F, images, clock, black saver, keys | `localStorage` (`uiZoom`, `chartLineWidth`, the temperature unit, `screensaver*`, `keyboardBindings`) | S | out |
| Home Assistant | YAML snippets for a host | `localStorage` | S | out |

**10. Updates:** Firmware Update: the machine's version, the bundled firmware with its
eligibility (`GET /api/v1/machine/firmware`, seen: builds 1352 and 1358, `applicable` for the
mock DE1Pro), apply a bundled one (`POST /api/v1/machine/firmware/apply`), upload a file
(`POST /api/v1/machine/firmware`, NDJSON progress), cancel (`DELETE`). G; S2 ports the status
and the apply of a bundled build behind a confirm, not the file upload.

**11. User Manual:** Quick Start Guide (Streamline's own text), Talk to Decent (a Decent account,
`/api/v1/account/...`), Send Feedback (`POST /api/v1/feedback`). S and X; out (spec 6: no new
outside services).

Decaid settings no page of Streamline shows, so not ported either: `blockTareDuringShot`
(the skin reads it, section 9), `keepAwake`, `themeMode` (Decaid's own screens), `defaultSkinId`,
`simulatedDevices`, `preferredGrinderDeviceId` (until the grinder page is released).

### 20.4 Checked on the rig

Decaid 0.8.8 with the simulated DE1 and scale, Streamline 0.2.14 served, 2026-10-17. Each
setting was read, changed, read again 1.5 to 2 s later, set back and read once more
(`log\s1-settings-probe.txt`; the probe was a script outside the repository):

| Request | Changed | Read back | Restored |
|---|---|---|---|
| `POST /api/v1/settings` (200) | `weightFlowMultiplier` 1 → 1.1, `stopHotWaterAtWeight` true → false, `scalePowerMode` disconnect → displayOff, `nightModeSleepTime` 1320 → 1300, `themeMode` system → dark | each as written | yes |
| `POST /api/v1/machine/settings` (202) | `fan` 55 → 50, `steamPurgeMode` 0 → 1, `flushFlow` 6 → 5, `hotWaterFlow` 10 → 8 | each as written | yes |
| | `usb` `"enable"` | `true` | yes (`"disable"` → `false`) |
| | `usb` `true` (a boolean) | still `false`: accepted (202), not applied | - |
| | `flushTemp` 25 → 30 and → 80, `flushTimeout` 10 → 12, `tankTemp` 20 → 25 | unchanged: the simulated DE1 does not keep them | - |
| `POST /api/v1/machine/settings/advanced` (202) | `heaterIdleTemp` 98 → 97, `refillKitSetting` 2 → 0 | as written | yes |
| `POST /api/v1/presence/settings` (200) | `sleepTimeoutMinutes` 30 → 31 | 31 | yes |
| `POST /api/v1/plugins/time-to-ready.reaplugin/settings` (200) | `Stabilisation` (unset) → 7 | 7 | `{"Stabilisation": null}` → `{}` as before |
| `POST` / `DELETE /api/v1/display/wakelock` (200) | `wakeLockOverride` false → true | true, then false | yes |
| `PUT /api/v1/workflow` (200) | `rinseData.duration` 10 → 12; `steamSettings.targetTemperature` 150 → 0 | as written (0 is kept: the heater off) | yes |
| `POST /api/v1/machine/waterLevels` (202) | `refillLevel` 5 → 10 | still 5 on `ws/v1/machine/waterLevels` (the simulation) | - |

So every gateway setting of 20.3 can be set from this skin without switching skins, and the
simulation proves most of them; `flushTemp`, `flushTimeout`, `tankTemp` and `refillLevel` are
accepted but not kept by the simulated DE1, so S2's rig test reads them back only where the
simulation keeps them, and the founder checks those four on the real DE1 (20.10). A `202` is
not a proof: S2 always reads back after a write (acceptance 22). The rig was left as found:
every value above as before, `streamline-app` KV holding only `favorite-profiles`, the skin's KV
namespace empty, Streamline the default skin. The full `npm run e2e:rig` after the probe: 21
passed (`log\s1-e2e-rig.txt`).

Seen in `rest_v1.yml`, for R5: Decaid stops hot water at a weight itself. With
`stopHotWaterAtWeight` on (the default) and a scale connected, "hot water dispensing tares the
scale and stops at the configured hot-water volume target treated as grams", with
`hotWaterFlowMultiplier` as lookahead. R5's stop at weight can be the workflow's
`hotWaterData.volume` in grams rather than a stop by the skin; not run here.

### 20.5 What a skin can set without switching skins

Everything marked G: Decaid's settings, the machine's settings and advanced settings, the
workflow's steam, hot water and flush values, devices, presence, display, plugins, maintenance
states, calibration and firmware are all gateway requests, and Decaid takes them from any
origin (section 10). What is S lives in Streamline's own storage and only changes how
Streamline itself behaves (its theme, language, screen saver, eco steam timer, keys, zoom, tank
unit, steam stop mode, wake profile); that is the founder's "skin specific things", and the skin
has its own where it needs one. B needs a Bengle. Of Streamline's 41 subcategories, S2 ports 27
in full or part (all of Quick Adjustments, Connections, Maintenance, the Decaid settings,
brightness, wake lock, presence, plugins, machine info, firmware status, and 6 of the 7
calibration pages), leaves 14 out (Bengle 3, Streamline's own 7, the user manual 3, the skin
switch 1), and adds its own Skin category.

### 20.6 The Skin category: the skin's own settings

Streamline's category 6 'Skin' holds its theme and the skin switch. In the port it holds the
skin's own settings, everything in `src/settings.ts`, in that one object, so the KV backup
(`src/settings-backup.ts`) carries them as before. Subcategories, from today's page
(`src/shell/Settings.svelte`) and the review:

| Subcategory | Settings (`Settings` field) |
|---|---|
| Steam | the mugs (`steam.mugSmall`, `mugMedium`, `mugLarge`), the calibration and one drink (`referenceSeconds`, `referenceMilk`, `milkPerDrink`), the favourite timers (`steam.favourites`), **the adjust amounts of R1** (`steam.adjustments`, −60 to 60 s) |
| Hot water | **the ratio favourites R5 adds** (three ratios, by default 1:2, 1:2.5, 1:3; R5 names the field, a group `hotWater` beside `steam` is the simplest) |
| Profile | `maxFlow`, `defaultDose`, `firstStepWorkaround`, `showProfileSteps`, the start row (`startProfiles`) |
| Shot graph | `showGraphLegend` |
| Backup and version | the backup's time and 'Restore from backup'; the skin's name and version (also kept small in the page's top right corner, 3.1) |

Streamline's Steam and Hot Water pages (category 1) hold the machine's steam and hot water
values; the skin's Steam and Hot water subcategories hold what the skin's pages calculate with.
Each subcategory names the other in its hint, so the two steam pages are not taken for one.
The settings page shows Streamline's numbering and order; the skin's category stays at
Streamline's place (6), with the name **Skin**.

### 20.7 Files: what is ported, what maps to what

The page replaces `src/shell/Settings.svelte`. New files under `src/settings-page/` (not
`src/settings/`, which would sit beside `src/settings.ts`):

| File | Job | Ported from | Part |
|---|---|---|---|
| `tree.ts` (+ test) | the categories and subcategories shown, in Streamline's order and numbering, each with the component or field list that renders it; the left-out ones are absent | `settings-tree.js` | S2a |
| `fields.ts` (+ test) | every numeric, choice and switch field of 20.3: id, label, hint, source (`decaid`, `machine`, `advanced`, `workflow.steamSettings`, `workflow.hotWaterData`, `workflow.rinseData`, `presence`), key, unit, range, step, decimals, options; the `usb` mapping; the Fast Start preset | the ranges and wording of `settings.js` | S2a (S2b, S2c add theirs) |
| `gateway.ts` (+ test) | read every source once when the page opens; `writeField(field, value)`: one request, then a read of that source, and the value the gateway holds is shown; the Streamline KV keys of 20.2 for a workflow field, written only when Streamline already holds one (as `src/steam/apply.ts` does for `last-steam-duration`) | `flushPendingChanges`, `api.js` setters | S2a |
| `SettingsPage.svelte` | the page: header ('Settings', the version), the category column and the subcategory list, the content panel; the last place opened kept in `localStorage` `decaid-skin.settings-location` (not a setting, not backed up, as `decaid-skin.screen`) | `settings.html`, `settings-shell.js`, `settings-location.js` | S2a |
| `FieldRow.svelte` | one row: label, hint, and a value button (opens `NumberPad.svelte`), a row of choice chips, or a switch; a write in flight, a failed write's message, and "not supported by this machine" | the row markup of `settings.js` (`settings_ui.md`) | S2a |
| `SkinCategory.svelte` | 20.6: the skin's settings moved from `Settings.svelte`, with their `data-testid`s | today's `Settings.svelte` | S2a |
| `Devices.svelte` | Connections: machine and scale lists from `ws/v1/devices`, scan, connect, forget, preferred, scale power mode, scale required, Wi-Fi scales | `renderBluetoothMachineSettings`, `renderBluetoothScaleSettings`, `renderDeviceList` | S2b |
| `Maintenance.svelte` | clean, descale, transport mode: the instructions, Start with a confirm, Cancel | `categories/maintenance.js` | S2b |
| `MachineInfo.svelte` | machine info and the USB page's charging status, read only | `renderMachineInformationSettings`, `renderUsbChargerModeSettings` | S2b |
| `Plugins.svelte` | the plugin cards: enable / disable, version and update, settings from each manifest's schema (string, number, boolean, secure) | `renderPluginManagerSettings`, `renderPluginCard`, `renderPluginSettingControl`, `bindPluginSettingControls`, `plugin-view.js` | S2c |
| `Presence.svelte` | presence, sleep after, the wake schedules (add, edit, delete) | `renderPresenceSettings`, the schedule handlers | S2c |
| `Firmware.svelte` | the firmware status and the apply of a bundled build; Decaid's own update | `renderFirmwareUpdateSettings`, `renderAppUpdateBlock` | S2c |
| `SensorCalibration.svelte` | the three sensors' readings and corrections | `renderSensorCalSettings`, `sensor-cal.js` | S2c |

Changed: `src/api/client.ts` and `src/api/types.ts` (the requests of 20.3 that the client lacks:
machine settings and advanced settings, reset, water levels, presence and schedules, wake
lock, devices, Wi-Fi scales, plugins, machine info, calibration, firmware, Decaid's update;
`DecaidSettings` names the fields of 20.3), `src/App.svelte` (the screen `settings` renders
`SettingsPage`), `e2e/mock-gateway.ts` (answers for the new requests). Reused as they are:
`NumberPad.svelte`, the client's KV calls, `Skin.setSettings`, `SettingsBackup`. Not ported:
Streamline's search field (the page is small enough to see), the resizable columns, the
fullscreen button, the translations, the staging with CANCEL / SAVE (20.11), the drift restore.

Layout at 1280 x 800, every size relative to the viewport: a header line; under it a left
column of about a fifth of the width with the numbered categories and, under the chosen one,
its subcategories (Streamline's second column folded into the first, since three columns do
not fit 1280 px); the content panel takes the rest and scrolls. Fields as today's settings
page draws them: a row with name and hint on the left, the value buttons on the right.

### 20.8 Licence

As 17.9: Streamline is GPL-3.0-or-later (its `LICENSE.txt` at `3a4bd23` starts with the two
lines below, unchanged since E1), this skin is GPL-3.0. Every file of 20.7 that takes code,
constants, wording or layout from Streamline (all of them except `SkinCategory.svelte`, which is
the skin's own page moved) starts with:

```
// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/settings/<file>.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
```

in a `.svelte` file as an HTML comment above `<script>`. The README's credit line of E2
already names Streamline; S2 adds "and its settings page". `grep -L "Copyright (C) 2025-2026
Decent Espresso" src/settings-page/*` lists only `SkinCategory.svelte`.

### 20.9 Risks

- **Streamline puts its values back.** A value of the machine's settings that the user set
  in Streamline once and later in this skin is set back by Streamline at its next settings
  page visit (20.2). Nothing in this skin can stop it; S2 says it in the hint of the machine
  categories, and the founder knows it from 20.11.
- **Streamline's remembered workflow values** (section 16): Streamline 0.2.13 writes its
  remembered steam and hot water values back over others while a page of it is open; 0.2.14
  adopts an outside value (18.4). The settings page writes Streamline's keys too, as the steam
  page does, so either version agrees.
- **The simulation does not keep** `flushTemp`, `flushTimeout`, `tankTemp` and `refillLevel`
  (20.4): unproven until the founder's check on the real DE1. A value that does not stick shows
  the machine's value after the read-back, not the typed one.
- **Settings that can do harm:** the heater voltage (a wrong one affects heating; takes effect
  after a restart), the factory reset, the gateway mode (Disabled stops Decaid's stop at weight,
  Full hands the shot to a skin that does not run one), firmware apply, transport mode (empties
  the machine). Each has a confirm that says what it does; S2 tests the confirm, not the effect,
  except where the simulation shows it.
- **Overlap with other pages:** steam temperature and flow are also the steam page's machine
  values, hot water's are R5's page. One field definition each (`fields.ts`), used by both, so a
  range lives in one place. S2 needs R5 merged first (roadmap: S2 needs R5).
- **Unreleased Streamline changes:** `origin/main` adds a Grinder page and changes
  `settings.js`; if 0.2.15 is out when S2 starts, S2 diffs its settings files against
  `3a4bd23` first.
- **Size:** `settings.js` is 11 000 lines of string templates; the port takes its fields and
  wording, not its code. The e2e specs that use today's settings page
  (`e2e/scale-settings-sleep.spec.ts`, `settings-backup.spec.ts`, `start-row.spec.ts`,
  `steam.spec.ts`; `e2e-rig/scale-sleep.spec.ts`, `settings-backup.spec.ts`, `steam.spec.ts`,
  `step-editor.spec.ts`) keep working when `SkinCategory.svelte` keeps the `data-testid`s
  (`setting-*`, `start-slot-*`, `backup-*`, `skin-version`) and the tests first open the
  Skin category; S2 greps `e2e/` and `e2e-rig/` before it renames one.

### 20.10 What S2 builds, in three parts

E2, a ported multi-file UI, took 2.54M tokens on 2026-10-16; this page is larger, so S2 is
three tasks, each one committable and tested on its own:

**S2a: the page, its fields and the Skin category** (about 2.5M tokens). `tree.ts`,
`fields.ts`, `gateway.ts`, `SettingsPage.svelte`, `FieldRow.svelte`, `SkinCategory.svelte`, the
client's machine-settings requests; categories 1 (Quick Adjustments, all six subcategories),
3 without sensor calibration (default load, refill kit, voltage, fan), 4's USB, 6 (the skin's
own) and 9's Decaid settings, brightness and wake lock. Tests:
- Vitest: `fields.test.ts` (every field's range, step and source as 20.3; the `usb` mapping;
  the Fast Start preset; no field is in two places), `gateway.test.ts` with a fake gateway (one
  request per write with only that key; the read-back's value is the one shown; a failed write
  keeps the read value and gives the message; a workflow field writes Streamline's key only
  when it exists), `tree.test.ts` (Streamline's order; the left-out subcategories are absent).
- Playwright, mocked gateway, `e2e/settings-page.spec.ts`: each category opens; a number typed
  on the pad is `POST`ed to its endpoint with that key alone and the page shows the value the
  next `GET` returns; a confirm comes before voltage, reset and gateway mode; the skin's own
  settings are in Skin and still saved and backed up (the existing specs pass, opening Skin
  first); the page fits 1280 x 800 without a horizontal scroll.
- Rig, `e2e-rig/settings-page.spec.ts` (acceptance 22): through the page, change
  `weightFlowMultiplier`, `steamPurgeMode`, `heaterIdleTemp`, `stopHotWaterAtWeight` and the
  steam flow, read each back with the client, restore each; the test records the values before
  and checks them after.

**S2b: connections, maintenance, machine information** (about 1.8M tokens). `Devices.svelte`
(category 2), `Maintenance.svelte` (5), `MachineInfo.svelte` (4); the device, Wi-Fi scale and
machine-info requests. Tests: Vitest for the device list's order and states; Playwright with
fake `ws/v1/devices` frames (scan, connect, preferred, forget, scale power mode, scale
required); maintenance's confirm sends `PUT .../state/cleaning` and Cancel `.../idle`. Rig:
the device list shows `MockDe1` and `MockScale` connected; `scalePowerMode` and
`blockOnNoScale` read back and restored; clean started and cancelled on the simulation, the
state read back (if the simulation refuses it, the test records that and checks the request).
No forget or disconnect on the rig: the rig's preferred devices stay.

**S2c: plugins, presence, firmware status, sensor calibration** (about 2.0M tokens).
`Plugins.svelte` (8), `Presence.svelte` (9), `Firmware.svelte` (10, status and apply of a
bundled build behind a confirm, Decaid's own update status), `SensorCalibration.svelte` (3).
Tests: Vitest for the plugin schema controls (each type, a secure value never shown);
Playwright for a plugin setting written and read back, enable / disable, a schedule added,
edited and deleted, the firmware confirm; rig: a plugin setting changed and restored (as 20.4),
`sleepTimeoutMinutes` changed and restored, a schedule created and deleted, the firmware
catalog shown; no firmware is applied on the rig.

Together about 6.3M tokens. If only one task can be planned, S2a alone meets acceptance 22's
words (Streamline's settings, the skin's in its category, a changed Decaid setting read back);
S2b and S2c bring the rest of "almost everything". The founder's checks on the real DE1 (for
H1's install.md): tank temperature, flush temperature, water level alert and USB charger take
effect; Streamline's settings page, opened afterwards, does not set them back unexpectedly
(20.9).

### 20.11 Choices the founder has not seen

1. **What is left out:** Streamline's own settings (theme, language, screen saver, eco steam,
   steam stop mode, display size, temperature unit, keyboard, Home Assistant, wake profile,
   tank unit), the Bengle pages (cup warmer, lighting, load cells), the skin switch, the user
   manual, Talk to Decent and feedback (outside services), firmware upload from a file (20.3).
2. **One save model:** every change is written at once and read back, as the skin's own
   settings save at once; Streamline's CANCEL / SAVE staging is not ported.
3. **The Skin category** is Streamline's category 6 renamed, holding the skin's settings in
   five subcategories (20.6); R5's ratio favourites go under Hot water.
4. **The steam duration** stays on the steam page; the settings page has no second place for it.
5. **Two columns, not three:** subcategories are listed under their category (20.7).
6. **Confirms** before voltage, factory reset, gateway mode, firmware apply and the maintenance
   procedures.
7. **Three tasks** (S2a, S2b, S2c) instead of one S2 (20.10).

### 20.12 The flush: which values Decaid uses (S2a)

The founder, 2026-10-17 (inbox 37): "flush: I noticed that in streamline settings I cannot set
the flush duration. add that to the quick settings. I want to configure flow and time for
flush." Checked on 2026-10-18 against Decaid 0.8.8 with device simulation; the rig served
Streamline **0.2.14** (`GET /api/v1/webui/skins/default`: `0.2.14`, `commitHash` `v0.2.14`,
installed 2026-10-16), so there was no newer release to diff against `3a4bd23`. The probe is
the rig's `log\s2a-flush-probe.mjs`, its output `log\s2a-flush-probe.txt`.

| Claim | Status |
|---|---|
| `updateWorkflowSettings` (`lib/src/controllers/de1_controller.dart`, tag `v0.8.8`) compares the workflow's old and new `rinseData`; when it changed it writes all three to the machine: `duration` → `setFlushTimeout`, `flow` → `setFlushFlow`, `targetTemperature` → `setFlushTemperature`. A direct `POST /api/v1/machine/settings` writes `flushTemp`, `flushFlow`, `flushTimeout` past the workflow | read |
| `PUT /api/v1/workflow {"rinseData":{"targetTemperature":85,"duration":14,"flow":4}}` (200): the workflow reads it back, and the machine's `flushFlow` is 4 within 2.5 s; `flushTemp` (25) and `flushTimeout` (10) stay, as the simulated DE1 keeps neither (20.4) | seen running |
| `POST /api/v1/machine/settings {"flushFlow":5,...}` (202): the machine has 5, the workflow's `rinseData.flow` stays 4; the next `rinseData` with flow 3 sets the machine to 3 | seen running |
| Streamline's settings page writes the machine's `flushFlow` and `flushTemp`; its home page writes `rinseData.duration` alone (`updateFlushValue` in `src/modules/ui.js`, KV `last-flush-duration`); a changed `rinseData` therefore puts the machine's flow and temperature back to the workflow's | read |
| A simulated flush has flow 0 and does not end by itself (19), so the flow and the time-out taking effect in a real flush | not seen: the founder's check on the real DE1 |

So **the values that take effect are the workflow's `rinseData`**: Decaid passes them on with
every change, and a direct machine write is overwritten by the next one. The page's flush has
three fields, temperature, flow and duration, each one definition in `fields.ts` (`FLUSH`,
source `workflow.rinseData`), written with the whole `rinseData` as Decaid's schema requires.
The duration is also the one the home's ring counts (`waterDuration` in `src/shell/water.ts`).
Ranges: Streamline's 5-95 °C and 1-8 ml/s (here in steps of 0.1, as `rinseData.flow` is a
double), and 1-120 s for the duration, which Streamline does not limit.

### 20.13 Built (S2a)

The settings page is `src/settings-page/SettingsPage.svelte` (App's screen `settings`): a
header with the version in the top right corner; on the left Streamline's categories with
their numbers (1 Quick Adjustments, 3 Calibration, 4 Machine, 6 Skin, 9 Miscellaneous), the
chosen one's subcategories under it, a tap on one scrolls to it; on the right the chosen
category, all its subcategories one under the other, in a panel that scrolls vertically. The
page opens on the category opened last (`decaid-skin.settings-location`, not a setting, not
backed up), on Quick Adjustments without one. Screenshots: `docs/product/settings-quick-adjustments.png`,
`settings-flush.png`, `settings-skin.png`.

- `tree.ts`: the navigation (Streamline's ids, names and order); `fields.ts`: 37 fields of
  20.3 (number, choice, switch, hh:mm time, read only), Fast Start; `gateway.ts`: `readAll`
  (six requests when the page opens; the water level comes from the skin's stream),
  `writeField` (one request with the key alone, then that source read again; the page shows
  the read value), Streamline's KV keys moved when they exist, `applyFastStart`,
  `resetMachine`; `FieldRow.svelte`: a row; `SkinCategory.svelte`: the old settings page in
  five subcategories, Steam, Hot water, Profile (with the start row), Shot graph, Backup and
  version, with every `data-testid` kept.
- The client gained the machine settings and advanced settings (read and write), the reset,
  the water level, the wake lock and `GET /api/v1/info`; `NumberPad.svelte` takes two places
  for the 0.05 steps of the flow multipliers.
- The hot water fields take the hot water page's ranges (`HOT_WATER_FIELDS`), so 0.1-10 ml/s
  as R5 set, not Streamline's 8; the steam temperature is 135-165 °C or 0 (under 135 is
  written as 0, the heater off); set to 0 here, the menu's steam on brings the temperature it
  had back (`steam.heaterTemperature`).
- Confirms before the voltage, the factory reset and the gateway mode; Fast Start writes at
  once. A source that cannot be read (no machine) says so with 'Read again', its rows are
  disabled; a failed write shows its message under the row and the read value stays.
- A read-back right after a write was seen to hold the new value at once on the rig (13 to 90
  ms, `log\s2a-readback-probe.txt`), so the page reads once and does not wait.
- Choices of S2a: the flow multipliers' upper ends (Streamline has none): 5 for the weight flow
  multiplier, 2 s for the volume and hot water ones. The night mode's times are typed as hhmm
  on the number pad. 'Go to dashboard' shows only inside Decaid's window
  (`window.decentApp.exitToDashboard`). The charging status shows only where Decaid reports one.

Tests: Vitest `src/settings-page/fields.test.ts`, `gateway.test.ts` (a fake gateway as the
rig answers), `tree.test.ts`: 56. `npm run e2e`: `e2e/settings-page.spec.ts`, seven tests
(each category opens and fits 1280 x 800 without a horizontal scroll; typed values written
with their key alone and the read value shown, the tank temperature the mock does not keep
included; the flush; the confirms; the steam heater off; no machine and a failed write; the
skin's settings in Skin, saved and backed up); the specs that opened the old page now open
Skin first; the full run: 123 passed. Rig: `e2e-rig/settings-page.spec.ts` (acceptance 22):
`weightFlowMultiplier`, `steamPurgeMode`, `heaterIdleTemp`, `stopHotWaterAtWeight`, the steam
flow and the flush's duration and flow changed through the page and read back with the API
(the machine's `flushFlow` follows), then restored, with everything recorded before and
compared after. The full rig run: 25 passed (`log\s2a-e2e-rig.txt`). The rig was left as
found: Decaid's, the machine's and the advanced settings equal to those recorded at the start
(`log\s2a-before-*.json`), the workflow's steam (150 °C, 50 s), hot water and rinse values as
before, 73 profiles and one shot, the skin's KV namespace empty, `streamline-app` holding only
`favorite-profiles`, Streamline 0.2.14 the default skin; Decaid ended with `Stop-Process
-Force`, port 8080 free.

For the founder's check on the real DE1 (H1's install.md): the flush runs at the set flow and
ends at the set duration.

### 20.14 Built (S2b)

Built on 2026-10-18 against Decaid 0.8.8 with device simulation; the rig served Streamline
**0.2.14** (`GET /api/v1/webui/skins/default`, `commitHash` `v0.2.14`), so there was no newer
release to diff against `3a4bd23`.

- **Connections** (category 2, `Devices.svelte`, `devices.ts`): one list each for machines and
  scales, from `/ws/v1/devices` (the whole list at connect and at every change; the skin's new
  `devicesStream`). Order: connected, then connecting or disconnecting, then present, then
  remembered and absent (`available: false`); Decaid's order within each. A row has the
  preferred switch (`preferredMachineId` / `preferredScaleId`, written and read back as every
  field), its state and Streamline's actions: Disconnect, Connect, or for an absent one
  Reconnect (a scan) and Forget behind a confirm. Commands are REST requests, not the
  channel's commands: `GET /api/v1/devices/scan?connect=true&quick=true` (Streamline's Search
  with Decaid's default `connect`), `PUT .../connect`, `.../disconnect`, `.../forget` with the
  id in the body. Under the scale list: scale power mode, scale required, Wi-Fi scales by
  address (`GET`/`POST`/`DELETE /api/v1/devices/wifi`), shown inline rather than in
  Streamline's dialog.
- **Machine Information** (category 4, `MachineInfo.svelte`): `GET /api/v1/machine/info`
  (model, firmware, serial with Copy, group head controller, every `extra` entry); the USB
  page's charging status moved from a field to this component, shown only where Decaid
  reports one.
- **Maintenance** (category 5, `Maintenance.svelte`, `maintenance.ts`, from Streamline's
  `maintenance.js` and `maintenance-progress.js`): clean, descale, transport mode; Start asks
  first, Cancel (`PUT .../state/idle`) while it runs; the steps from the machine's substate,
  a start timeout of 20 s, "lost contact" without frames, a procedure already running joined.
  Out of water Start says so and asks nothing; a sleeping machine is woken first. The descale
  switches the steam heater off (the menu's switch, now `Skin.setSteamHeater`), waits for the
  boiler to be at 60 °C or under (20 min at most) and switches it on again when the cycle ends,
  is cancelled or the page is left. The component takes only the skin and the procedure
  (`titled` adds its own title), so T9's menu shortcut can open the clean on its own.
- **On the rig** (`log\s2b-clean-probe.mjs`, `.txt`): `PUT /api/v1/machine/state/cleaning`
  answered 200, the simulated DE1 was in `cleaning` (substate `idle`) 0.5 s later and stayed
  there; `PUT .../idle` brought it back. So the simulation shows the first step only. A real DE1
  nearby (`DE1`, a Bluetooth MAC) was listed as discovered beside `MockDe1`; the rig tests
  search, connect, disconnect and forget nothing.

Tests: Vitest `devices.test.ts` (each list's devices, order, labels, actions, the connect's
answers), `maintenance.test.ts` (steps, done, timeout, stale, joined, the boiler's
temperature), the tree, the scale fields, the client's new requests. `npm run e2e`:
`e2e/settings-connections.spec.ts`, 11 tests with fake `/ws/v1/devices` frames (lists, Search,
Connect and a time-out, preferred, Forget, power mode and scale required, Wi-Fi, the clean's
confirm and Cancel, a clean joined, out of water, machine information). Rig:
`e2e-rig/settings-connections.spec.ts`, three tests: `MockDe1` and `MockScale` connected,
`scalePowerMode` and `blockOnNoScale` changed through the page, read back and restored; a clean
started and cancelled with the state read back; the machine's information. Full rig run 28 of
28 (`log\s2b-e2e-rig.txt`); Decaid's settings and the workflow's steam, hot water and rinse
values equal to those recorded at the start (`log\s2b-before-*.json`, `s2b-after-*.json`), 73
profiles, one shot, the skin's KV empty, Streamline the default skin. Screenshots:
`docs/product/settings-connections.png`, `settings-maintenance.png`.

### 20.15 Built (S2c)

Built on 2026-10-18 against Decaid 0.8.8 with device simulation; the rig served Streamline
**0.2.14** (`GET /api/v1/webui/skins/default`), so there was no newer release to diff against
`3a4bd23`. With S2a and S2b this completes S2: categories 1 to 6, 8, 9 and 10 of Streamline,
without what 20.11 leaves out.

- **Sensor Calibration** (category 3, `SensorCalibration.svelte`, `sensor-calibration.ts`, from
  `sensor-cal.js`): per sensor the stored correction (`GET /api/v1/machine/calibration/{target}`,
  `measuredValue`: a ratio for flow and pressure, an offset for temperature), the one before
  this page's last write, and the live reading of the sensor itself (`groupTemperature`,
  `pressure`, `flow`; not the frame's target). Capture takes the mean of the last 5 s, the
  measured value is typed on the number pad, the outcome is shown, and Apply writes the
  correction (`PUT`, a correction, not a value) after a confirm and reads it back; an idle
  capture (0), a measured 0 and a ratio outside 0.75-1.33 are refused. Restore lands on the
  previous value exactly. The previous value is in `localStorage`
  (`decaid-skin.sensor-calibration-previous`, not a setting, not backed up), where Streamline
  keeps it in its IndexedDB. Not written on the rig: the simulation reports pressure 9.0 and
  temperature 93.0 as its stored values, which no real calibration has.
- **Extensions > Plugins** (category 8, `Plugins.svelte`, `plugins.ts`, from `plugin-view.js`
  and the plugin controls of `settings.js`): one card per plugin of `GET /api/v1/plugins`, by
  name, with its version, a state as Streamline words it (only "Checked, no update held back"
  where Streamline says "Up to date", since a held update is only one that asks for more
  permissions), Enabled (`POST .../enable` / `disable`, the list read again), Approve for a held
  update after a confirm that names the added permissions, 'Check for plugin updates'
  (`POST /api/v1/plugins/update`), and one control per manifest setting: a switch, a number on
  the pad (finite, not negative), a text field (trimmed), chips for an enum, and for a secure
  one a password field that is never filled: it shows 'Saved' or 'Not set' from `{ isSet }`, a
  typed value is written as typed and the field emptied. A value not stored shows the
  manifest's default, marked 'default'. Every write is the one key, then the settings are read
  again. Visualizer and Shot Uploader are their plugin cards, not subcategories of their own,
  and Streamline's own Visualizer server form is not ported.
- **Presence Detection** (category 9): presence and the sleep timeout are fields of the source
  `presence` (`/api/v1/presence/settings`, read with the page; 1-120 min as Streamline, Decaid
  takes 0-240); the wake schedules are `Presence.svelte` (`presence.ts`): each as one line, a
  switch, Edit, Delete after a confirm; Add and Edit share a form (time typed as hhmm, days as
  chips, none for every day, keep awake 0-720 min, 0 wakes only). Streamline cannot edit a
  schedule's time; this page can (`PUT .../schedules/{id}` with the whole schedule,
  `keepAwakeFor: null` clearing one, seen on the rig: `log\s2c-schedule-probe.txt`).
- **Updates** (category 10, `Firmware.svelte`, `firmware.ts`, from `firmware-progress.js` and
  `renderFirmwareUpdateSettings`): the machine and its build, the status from
  `updateAvailable` (null is 'Could not check', never 'Up to date'; a machine newer than every
  bundled build is 'Newer'), every bundled build with its eligibility and release notes, and
  Install of the recommended build behind a confirm that says it takes 50 minutes: `POST
  /api/v1/machine/firmware/apply`, its NDJSON progress (`DecaidClient.applyFirmware`, done only
  with `done`), Cancel (`DELETE /api/v1/machine/firmware`). No file upload (20.11). A second
  subcategory **Decaid** shows Decaid's own update from `GET /api/v1/update` (version, phase,
  the release page as text); Streamline asks GitHub's API for the latest release, which this
  skin does not (spec 6).
- On the rig: `GET /api/v1/machine/firmware` lists builds 1352 and 1358, both applicable to the
  simulated DE1Pro at 1337, 1358 recommended, so Install is offered; it was opened and
  cancelled, nothing applied. dye2 0.1.4 has an update held back (0.2.0); it was not approved.

Tests: Vitest `plugins.test.ts` (each control type, label and default, a secure value never
shown, what each type writes, the states), `sensor-calibration.test.ts`, `firmware.test.ts`,
`presence.test.ts`, the client's new requests and its NDJSON stream; `npm test` 739 passed.
`npm run e2e`: `e2e/settings-extensions.spec.ts`, 8 tests (a plugin setting of each type
written alone and read back; a secure value written and never shown; disable, enable and an
approved update; the sleep timeout and a schedule added, edited, switched and deleted; the
firmware's status and its confirm, a failed stream; a sensor corrected and restored, an idle
capture refused; no machine); the full run 142 passed. Rig: `e2e-rig/settings-extensions.spec.ts`,
three tests: time-to-ready's `Stabilisation` set to 7 through the page, read back and restored
(the first restore held this time; the test reads back and writes once more if not); the sleep
timeout 30 → 31 and back; a schedule created and deleted through the page; the firmware catalog
shown and Install cancelled. Full rig run 31 of 31 (`log\s2c-e2e-rig.txt`). Decaid's, the
machine's and the advanced settings, the workflow's steam, hot water and rinse values,
presence, every plugin's version, loaded state and settings equal to those recorded at the
start (`log\s2c-before-state.json`, `s2c-after-state.json`), 73 profiles, one shot, the skin's
KV empty, `streamline-app` holding only `favorite-profiles`, Streamline the default skin, steam
150 °C; Decaid ended with `Stop-Process -Force`, port 8080 free. Screenshots:
`docs/product/settings-plugins.png`, `settings-presence.png`.

## 21. Hot water page and stop at weight on the rig (R5)

Done on 2026-10-17 against Decaid v0.8.8 with device simulation (8.8); the rig served
Streamline **0.2.14** (`GET /api/v1/webui/skins/default`, `reaMetadata.commitHash` `v0.2.14`,
installed 2026-10-16). The probe frames are in the rig's `log\r5-hotwater-weight-on.txt` and
`r5-hotwater-weight-off.txt`, the full rig run in `log\r5-e2e-rig.txt`.

### 21.1 The fields

`hotWaterData` of the workflow (`rest_v1.yml`, schema `HotWaterData`, all four required):

| Field | Type | Unit | The page's value | Range on the page |
|---|---|---|---|---|
| `targetTemperature` | integer | °C | temperature | 50-95 (Streamline's) |
| `flow` | number | ml/s | flow | 0.1-10 (Streamline's 8 raised to the rig's own 10) |
| `duration` | integer | s | time | 5-120 (Streamline's) |
| `volume` | integer | ml, or g with a scale (below) | stop at weight | 10-500 (Streamline's) |

`PUT /api/v1/workflow` with `{"hotWaterData": {...}}` answered 200 and the same values on the
next `GET` (seen running). The skin sends all four, the three it does not change as it read them.
Streamline's ranges are from `src/settings/settings.js` lines 64-67 (v0.2.14); numbers only, no
code was ported.

### 21.2 Does Decaid stop hot water at a weight? Yes, by itself

| Claim | Status |
|---|---|
| Decaid's setting `stopHotWaterAtWeight` (`rest_v1.yml`): "When true (default) and a scale is connected, hot water dispensing tares the scale and stops at the configured hot-water volume target treated as grams. The machine's own volume/time stop remains a backstop. Ignored in full gateway mode." Its look-ahead is `hotWaterFlowMultiplier` (default 0.3 s) | read |
| The rig has `stopHotWaterAtWeight: true`, `hotWaterFlowMultiplier: 0.3`, `gatewayMode: "tracking"` | seen running |
| With it on, volume 30 and flow 4: the scale is tared at the start (0 g), hot water ends after 7.5 s at 29.4 g, far before its duration of 60 s | seen running |
| With it off, the same values: the scale is not tared (it starts at 29.4 g) and hot water runs 63 s, to its duration; the simulated machine has no volume stop of its own. So the stop at 30 g above, and the one near 50 g in 19, are Decaid's weight stop | seen running |
| Through the skin (`e2e-rig/hot-water.spec.ts`): volume 80 from 1:2 of a 40 g shot, flow 4, duration 60: stopped after 20.1 s at 79.1 g | seen running |
| A real DE1 with a scale stops the same way; without a scale it stops at `volume` ml by its own flow meter, or at `duration` | not seen: the founder's check on the real DE1 |

So **stop at weight is `hotWaterData.volume`**, and the skin needs no stop of its own. The
team's choice in spec section 8 (the skin stops from the scale's weight if Decaid does not) is
not needed. In full gateway mode Decaid ignores the setting: the skin never sets that mode.

### 21.3 The last measured shot

The newest shot record (`GET /api/v1/shots?limit=1&order=desc`) carries the final weight as
`annotations.actualYield` (8.4; seen on the rig: 34.3 g for a simulated shot that stopped at
36 g). The page reads it once when it opens; a record without it (a shot without a scale) gives
no ratio. A shot that has just ended is in the list a few seconds later (10.1).

### 21.4 Built (R5)

Home's right tab is split (spec 3.7): steam keeps three quarters of it, **hot water** the
bottom quarter, under a line (`App.svelte`); the right-edge swipe still opens steam. The page
(`src/hotwater/HotWater.svelte`): on the left four large values, temperature (red), flow (blue),
time and stop at weight (yellow), each a tap that opens the number pad and writes the value
(`Skin.setHotWater`, `writeHotWater` in `src/hotwater/hot-water.ts`). On the right the last
shot's weight, three ratio chips ('1:2' over '80 g'; the one equal to the current stop at
weight is marked), the scale's weight with a **tare** button (`Skin.tare`, R2), a line saying
that hot water is started at the machine and who stops it, notices, and stop while something
runs (as on the steam page). There is no start button. The ratio is held to whole grams in
10-500 (`ratioWeight`). The favourites are the setting `hotWater.ratios` (default 2, 2.5, 3;
0.5-10, one decimal), in the settings object and so in its KV backup; the settings page shows
them as the category **Hot water** on its last line, left of the backup, the one place left
without scrolling. S2 moves them into the Skin category (20.11).

Tests: Vitest `src/hotwater/hot-water.test.ts` (11: the ratios, the last shot, the write) and
four more in `src/settings.test.ts`. `npm run e2e`: `e2e/hot-water.spec.ts`, four tests (the
split tab, the four values written, 1:2 of 40 g is 80 g and tare, the favourites from the
settings and their backup); screenshots `docs/product/hot-water.png` and `home-tabs.png`.
Rig: `e2e-rig/hot-water.spec.ts` (above); the full run: 22 passed, the steam control step too.

## 22. Steam heater off and machine off on the rig (R4)

Done on 2026-10-17 against Decaid v0.8.8 with device simulation (8.8; the gateway answered
`GET /api/v1/machine/state` with 200 about a minute after the start); the rig served
Streamline **0.2.14** (`GET /api/v1/webui/skins/default`, `reaMetadata.commitHash` `v0.2.14`).
The probe is the rig's `log\r4-steam-power-probe.mjs`, its output `log\r4-steam-power-probe.txt`,
the full rig run `log\r4-e2e-rig.txt`.

### 22.1 The steam heater

| Claim | Status |
|---|---|
| Decaid has no request of its own for the steam heater. `SteamSettings.targetTemperature` (`rest_v1.yml`): "Set to 0 to disable steam-heater preheating. Decaid writes 0 to the machine when steam is disabled and treats temperatures below the supported range as disabled. Supported enabled ranges are 135–160 °C for DE1 and 135–165 °C for Bengle." `duration` "does not control steam-heater preheating" | read |
| Streamline 0.2.14 does the same: `setSteamHeaterEnabled` and `steamHeaterFor` in `src/modules/api.js` write `steamSettings.targetTemperature` 0, remember the temperature before in its KV key `streamline-app/last-steam-temp`, and write it back to switch on (it sends no temperature when it remembers none) | read (no code ported) |
| `PUT /api/v1/workflow` with `{"steamSettings":{"targetTemperature":0}}`: 200; the workflow reads 0, duration and flow unchanged, and the machine's own settings (`/ws/v1/machine/shotSettings`) read `targetSteamTemp: 0` | seen running |
| The same with 150: the workflow and the machine read 150 again | seen running |
| With 100 (under the range): the workflow keeps 100, the machine reads 0 | seen running |
| The snapshot's `steamTemperature` stays at about 150 °C on the simulated machine after the heater is off: the simulation does not cool. A real DE1's boiler cools | seen running; the real DE1 not seen |

So the heater's state is the machine's `targetSteamTemp` (0 is off), and the workflow's
`targetTemperature` while the machine's settings are not known (below 135 is off).

### 22.2 Machine off

| Claim | Status |
|---|---|
| `MachineState` (`rest_v1.yml`) has no off state; `PUT /api/v1/machine/state/{newState}` takes only its values. No other request of the REST or WebSocket API switches the machine off | read |
| `PUT /api/v1/machine/state/off`, `.../shutdown`, `.../poweroff`: 500, `No enum value with that name` | seen running |
| `PUT /api/v1/machine/state/sleeping`: 200, the state is `sleeping`; `.../idle` wakes it (as in 13) | seen running |

So **machine off is sleep** through Decaid 0.8.8, and the menu says so.

### 22.3 Built (R4)

Home's menu (`src/shell/Home.svelte`) has three entries: **Settings**, the steam switch and
**Machine off**. The steam switch reads 'Steam off' with the line 'steam heater is on', or
'Steam on' with 'steam heater is off' (in red); it is disabled while neither the machine's
settings nor the workflow is known (`heaterState` in `src/shell/steam-heater.ts`). Off writes
0; on writes the temperature the heater had when it was switched off, kept in the setting
`steam.heaterTemperature` (135-165, default 150; in the settings object and so in its KV
backup, not shown on the settings page). As with the steam timer (16), Decaid passes a value
on only when the workflow's changes, so when the machine's settings do not show the new value
after 2 s they are written directly (`switchHeater`). **Machine off** replaces the menu's
'Sleep' entry, which did the same: its line says 'sleeps: Decaid cannot switch the DE1 off';
it is `Skin.machineOff`, which sends `sleeping`, and is disabled when sleep is
(`canSleep`). The skin does not use Streamline's KV key for the temperature.

Tests: Vitest `src/shell/steam-heater.test.ts` (10). `npm run e2e`:
`e2e/menu-shortcuts.spec.ts`, five tests (off and on with the state shown, the remembered
temperature after a reload and in the backup, the direct machine write, machine off as sleep,
no machine); screenshot `docs/product/home-menu-steam-off.png`. Rig:
`e2e-rig/menu-shortcuts.spec.ts` (steam off read back from the workflow and the machine, on
again, machine off to `sleeping`, a touch wakes; it restores the temperature, the state, the
brightness and the skin's KV backup). The full rig run: 24 passed, the steam control step of
`e2e-rig/steam.spec.ts` too. The rig was left with 73 profiles, Streamline as the default skin,
steam at 150 °C and the machine `idle`; Decaid was ended with `Stop-Process -Force`, port 8080
was free.

## 23. The end of a shot on the rig (T1)

Spec 3.8 'Espresso graph: scale and the end'. Run on 2026-10-19 against Decaid 0.8.8 with
device simulation, Streamline 0.2.14 served as the default skin, with
`scripts/rig-shot-end-probe.mjs` (log `..\decaid-rig\log\t1-shot-end-probe.txt`):
A-Flow / default-medium, target 36 g, every machine frame logged with its substate.

### 23.1 What the simulated machine sends after the pour: nothing in espresso

```
30.00 06:52:09.109533 espresso/pouring/frame8   p=6.48 f=2.34 w=33.57
30.11 06:52:09.209927 espresso/pouring/frame8   p=6.47 f=2.34 w=34.03   shotState 'stopping' (decision)
30.20 06:52:09.309102 idle/idle/frame0          p=0.00 f=0.00 w=34.03
30.70 06:52:09.809889 idle/idle/frame0          p=0.00 f=0.00 w=34.31
...                                                                      shotState 'finished' at 34.2 s
```

- The espresso substates, in order of first appearance: `preparingForShot`, `preinfusion`,
  `pouring` (and `preparingForShot` again between two steps, 8.2). After the stop at the
  target weight the next frame is `idle/idle`: **the simulated machine has no tail**. The
  live graph's tail (the founder's screenshot `docs/product/review-10-17-espresso-tail.png`,
  pressure down at about 54 s and the flow rising to a 4 ml/s target for 5 s) comes from the
  real DE1.
- Decaid's record of the shot (278 measurements) ends at `06:52:09.109533`, the frame before
  the `stopping` decision on `/ws/v1/machine/shotState`; the live series has that one frame
  more (0.1 s).
- `MachineSubstate` in the release's `rest_v1.yml` has no `ending`: the DE1 firmware's Ending
  substate is Decaid's `pouringDone`, the substate a real DE1 sends in state espresso after the
  stop (and in steam after the steam, 16 and `src/steam/run.ts`).
- `GET /api/v1/shots?profileTitle=…` matches the whole title, case-sensitively: `A-Flow /
  default-medium` finds the rig's shot, `default-med` and `a-flow / default-medium` find none.

### 23.2 Built (T1)

- **The end:** `shotOver` in `src/shell/shot.ts`: another state, or state espresso with
  substate `pouringDone` (or `ending`, should a gateway use the firmware's name). `recordFrame`
  ends the live shot at that frame without a point, so the graph and the timer stop there;
  the espresso frames after it until the machine leaves espresso are ignored (`Shot.left`),
  and the next espresso is a new shot. `seriesOf` (`src/history/entries.ts`) cuts a record at
  the same frame, so a record with a tail draws as the live graph does.
- **The scale:** `shotScale` in `src/graph/axis.ts`: 0 to 10 with ticks 0, 2, 4, 6, 8, 10, and
  0 to 12 (ticks every 2) when a drawn value (pressure, flow, weight flow, or a target of a
  drawn curve) is over 10; higher values are held at 12. `ShotGraph.svelte` uses it unless a
  page passes a fixed `yMax` (steam 4, the step preview), so the live graph, home's last shot
  and the history draw with the same rule. The SVG carries `data-scale`.
- **The time axis:** `Skin.expectedSeconds` (`src/shell/skin.svelte.ts`), from
  `expectedShotSeconds` in `src/shell/expected.ts`: the newest shot with the workflow's profile
  title (`GET /api/v1/shots?profileTitle=…&limit=1`, then its measurements, measured by
  `seriesOf`; read again when another profile is loaded, and set from the live shot when one
  ends), else the profile's estimate, else 30 s, rounded up to 10 s by `startSeconds`
  (`src/graph/axis.ts`); `timeAxis` grows it in steps of 10 s past that. The estimate is
  `drawnShotSeconds` (`src/editor/curve.ts`) for an A-Flow 3.0 profile: the expected seconds
  of the phases before the pour plus the 30 s of pour the editor draws; for any other profile
  the step editor's curve length (`stepCurve`, a step without time counted 10 s).

Tests: Vitest `src/shell/shot.test.ts` (the tail cut), `src/history/entries.test.ts` (the
record's cut), `src/graph/axis.test.ts` (`shotScale`, `startSeconds`),
`src/shell/expected.test.ts` (estimate, last shot). `npm run e2e`: `e2e/shot-graph.spec.ts`
(a shot at or under 10 bar, one over it with the recording's pressure times 1.15, a 5 s
`pouringDone` tail added to the recording, the time axis from the last shot and from the
profile's estimate); the mock gateway's replay takes `tail` and `pressure`
(`shotEvents`), and its shot list filters by `profileTitle`. Screenshots
`docs/product/espresso-during.png` and `docs/product/espresso-after.png` (the shot ended,
5 s into the tail: the graph stands at 27.4 s while the values show the tail's 0.5 bar and
4 ml/s). Rig: `e2e-rig/shot-end.spec.ts`: running axis 30 s from the rig's earlier shot of the
profile, scale 10, the live graph 27.4 s and 275 points against the record's 27.30 s and 274
measurements from the water.

## 24. Streamline's per-phase shot table, and the shot overlay (T2)

Spec 3.8 'Espresso shot: an overlay that stays', with 3.9's answer from the founder's screenshot
review-10-17-streamline-phase-values.png (screenshot in the team repository).
Read on 2026-10-19 in the clone `../streamline-js` at `3a4bd23` (v0.2.14), the version the
rig serves as its default skin (`GET /api/v1/webui/skins`: `streamline.js 0.2.14`).

### 24.1 Where Streamline computes the table

Not in `shotSummary.js`, which 3.9 names: that file writes a Markdown summary per profile
*frame* (`profileFrame`) for sharing, with peak values and `actual(target)` pairs; it is not the
table of the screenshot. The table is `src/modules/shotData.js` (cells `shot-data-pi-*`,
`shot-data-ex-*`, `shot-data-total-*` in `index.html`), fed from `app.js`:

- **Which frames.** Only machine frames in substate `preinfusion` or `pouring`
  (`espressoStates`); `preparingForShot` (before the shot and, on the simulated machine,
  between steps) and `pouringDone` after it are left out. Live (`updateShotData`) each frame
  carries the scale's latest weight; a record (`renderPastShot`) the measurement's
  `scale.weight`. The table is cleared when a new shot's first preinfusion or pouring frame
  arrives (`clearShotData`, `app.js` 1001).
- **Where preinfusion ends.** At the sample before the first sample in `pouring`
  (`preinfusionEndIndex`); a first sample already in `pouring` does not count, the next one
  does. Without a `pouring` sample the whole shot is preinfusion and the extraction row stays
  empty. So the split is the machine's own substate, not the profile's steps.
- **Seconds.** Preinfusion: last preinfusion sample − first sample; extraction: last sample −
  first extraction sample; total: last − first; each rounded to whole seconds.
- **Weight.** Preinfusion: the weight at its last sample. Total: `finalWeight`, which follows
  the scale on every scale frame even after the shot (drip-down, `setFinalWeight`), and for a
  record Decaid's `annotations.actualYield`, else the record's last scale weight; without it
  the last sample's. Extraction: total − preinfusion, so the two add up.
- **Volume.** The flow summed over the samples: each sample adds the previous sample's flow
  times the time since it (ml); extraction is total − preinfusion.
- **Temperature.** `groupTemperature` (as the chart), written lowest → highest
  (`formatRange`, 0 decimals), one value when both round alike.
- **Flow and pressure.** start → peak → end (`formatStartPeakEnd`, 1 decimal); the peak only
  when it is neither the start nor the end; one value when start and end are equal. The
  founder's 3.3→9.5→8.3 is that.

### 24.2 Ported, and checked against Streamline itself

`src/shell/phases.ts` is a port of that computation (GPL notice as 20.8): `phaseSample` (a
frame, or null when not counted), `recordSamples` (a shot record, with `actualYield`),
`phaseTable` (the cells as Streamline writes them). Streamline's own `renderPastShot` was run
under Node with a stub `document` on two inputs, and its cells are the tests' expected values:

| input | Preinfusion | Extraction | Total |
|---|---|---|---|
| the rig's shot record `ee7495ea…` (2026-10-11, fixture `src/shell/fixtures/rig-shot.json`) | 4 s, 0.0 g, 34 ml, 78→89, 7.4→8.0, 0.7→3.1 | 23 s, 34.3 g, 40 ml, 89→93, 8.0→2.3, 3.2→10.0→6.5 | 27 s, 34.3 g, 74 ml |
| the e2e recording `e2e/fixtures/shot.json` as frames | 4 s, 0.0 g, 34 ml, 78→89, 7.4→8.0, 0.7→3.1 | 23 s, 33.8 g, 40 ml, 89→93, 8.0→2.3, 3.3→10.0→6.6 | 27 s, 33.8 g, 74 ml |

The skin differs in two small things. A missing weight is '–', where Streamline writes '0.0'
without a unit. The weight in the cup after the shot (`settleWeight` in `src/shell/shot.ts`) is
the highest scale weight since the shot ended, not the latest one: the drops after the stop
count, a cup taken away while the summary is open does not (Streamline's total falls to 0 g
then).

### 24.3 Built (T2)

- **The overlay.** The screen `espresso` is gone (`SCREENS`, `src/shell/nav.ts`); a stored
  'espresso' opens home. `followMachine` opens home when the machine enters espresso (also at a
  load in the middle of a shot) and leaves the screen alone when it leaves espresso;
  `shotOverlay` opens `Skin.shotOpen` on entering espresso and keeps it open otherwise.
  `Skin.closeShot` closes it once the shot is over (`Shot.ended`); while it runs it stays.
  Opening it closes the history overlay.
- **Where.** `src/shell/ShotOverlay.svelte` (the former `Espresso.svelte`) takes home's graph
  area under home's header, so the state line, the profile and the menu stay visible; home's
  own stop button and notice are not shown under it. A running hot water or flush still shows
  home's water ring with its stop in its place (the overlay comes back after it).
- **After the shot.** The header says 'shot finished', the big weight is the weight in the
  cup, the stop button gives way to 'tap anywhere to close', and the per-phase table
  (`shot-phases`, rows `phase-preinfusion`, `phase-extraction`, `phase-total`, cells
  `phase-<row>-<column>`) stands under the graph. A transparent button over the whole app
  (`shot-close`, under the stream banner and the sleep screen) takes the tap and does nothing
  else; home then shows the shot as its 'last shot'. The left- and right-edge swipes are off
  while the overlay is open.

Tests: Vitest `src/shell/phases.test.ts` (the formats; the rig record and the e2e recording
against Streamline's cells; the split, no scale), `src/shell/overlay.test.ts` (`Skin` fed the
recording: opens from another screen, stays while running and after the shot, closes on the
tap, the next shot replaces it), `src/shell/shell.test.ts` (`followMachine`, `shotOverlay`).
`npm run e2e`: `e2e/shot-overlay.spec.ts` (the overlay under the state line, the table's cells,
a tap on the menu's place closes it and opens no menu, the next shot replaces it open or
closed, a shot from the steam page opens home); the espresso specs close the overlay before
they look at home's last shot. Screenshots `docs/product/shot-overlay-during.png`,
`docs/product/shot-overlay-after.png`. Rig (2026-10-19, log
`..\decaid-rig\log\t2-rig-suite.txt`, 33 of 33 passed): `e2e-rig/shot.spec.ts` reads the
overlay's table after the simulated A-Flow / default-medium shot to 42 g (live: preinfusion
64 s, total 102 s, 139 ml) and finds the same in `phaseTable` of Decaid's record of the shot
(64 s, 102 s, 139 ml; extraction 38 s, 40.2 g, pressure 3.0→7.8→6.3).

## 25. The A-Flow defaults kept in the skin, on the rig (T5)

Spec 3.8 'A-Flow defaults kept in the app'. Rig: Decaid 0.8.8 with device simulation, serving
Streamline 0.2.14 (`GET /api/v1/webui/skins/default`, 2026-10-19), 73 profiles, one shot.

### 25.1 What the workflow holds after a default is loaded without a record

`e2e-rig/aflow-defaults.spec.ts` loads `A-Flow / default-light` from the picker; nothing is
posted to `/api/v1/profiles` and the list of profile ids is the same before and after.
`GET /api/v1/workflow` then holds (seen running):

- the same workflow (`id` unchanged, `name` "Workflow"), with the keys `id`, `name`,
  `description`, `profile`, `context`, `steamSettings`, `hotWaterData`, `rinseData`: no
  profile id, no record, no `metadata`, as for any loaded profile (research.md 9.3, 11);
- `profile`: the generator's v2 profile (`version`, `title`, `notes`, `author`,
  `beverage_type`, `steps`, `target_volume`, `target_weight`, `target_volume_count_start`,
  `tank_temperature`), 4 steps, `target_weight` 48, and the parameters as the codec's JSON in
  `notes` (`{"aflow":"3.0","params":{...}}`, `workflowProfile`), so the editor and the
  unsaved-edits warning read it from Decaid alone;
- `context`: `targetYield` 48 and `targetDoseWeight` 16 from the default, the rest
  (`grinderSetting`, `extras`) as it was.

### 25.2 A shot with a default records the profile

`e2e-rig/shot.spec.ts` now loads `A-Flow / default-medium` the same way (the skin's default,
no record; before T5 it posted the defaults first) and pulls the simulated shot to 42 g. The
shot record's `workflow.profile` has the title, the steps and the notes (with the parameters)
of the workflow's copy, and `workflow.context.targetYield` 42 (seen running). So the history
names and restores a default's shot without the default being stored in Decaid.

### 25.3 Built (T5)

- `pickerEntries` (`src/shell/profiles.ts`) builds the picker's list: the five
  `DEFAULT_PROFILES` first, in their order, as `PickerEntry`s with `isDefault` and their
  parameters as `metadata` (`paramsMetadata`), then the stored profiles as `sortProfiles`
  orders them (the skin's A-Flow 3.0, other A-Flow, the rest, each by title). A stored profile
  whose title is a default's (`isDefaultTitle`) is not listed: the copies the former **add**
  stored and Decaid's bundled plugin `A-Flow / default-light`, `-medium` and `-dark`. They
  stay in Decaid. `default-very-dark`, `default-like-dflow` and the other bundled profiles are
  listed as before; a stored profile with a default's steps under another title (the founder's
  `test-light`) is listed under its own title.
- `loadEntry` loads an entry with `loadProfile(client, entry.profile, {}, entry.metadata)`: for
  a default that is `defaultProfile(entry)` with its parameters, no record.
- `Profiles.svelte` lists the defaults while the gateway's list is read (and when it cannot
  be), marks them with the tag 'A-Flow 3.0 default' (`default-tag`, `data-default` on
  `profile-item`). `missingDefaults`, `saveDefaults` and the offer (`offer-defaults`,
  `add-defaults`) are gone.

Tests: Vitest `src/shell/profiles.test.ts` (`pickerEntries`: defaults first, stored copies
hidden whatever their steps, bundled A-Flow profiles and `test-light` kept; `loadEntry`).
`npm run e2e`: `e2e/shell.spec.ts` (the list, no add offer, selecting and loading a default:
one `PUT /api/v1/workflow`, no `POST /api/v1/profiles`; `test-light` under its own title).
Rig (2026-10-19, log `..\decaid-rig\log\t5-rig-suite.txt`): full `npm run e2e:rig` 34 of
34 passed; afterwards 73 profiles, one shot, the KV namespaces `pureflow` and `decaid-skin`
empty, steam 150 °C, Streamline the default skin.

## 26. The shot history's reads on the rig (T8)

Spec 3.8 'Shot history: faster'. Run on 2026-10-20 against Decaid 0.8.8 with device
simulation, Streamline 0.2.15 served as the default skin (0.2.14 on 2026-10-19).

### 26.1 What the history read before T8

Every opening of the overlay mounted `History.svelte`, which called `readShots`: pages of
`GET /api/v1/shots?limit=100&offset=…&order=desc` until all shots or 500, then grouped them;
nothing was shown before the last page. `scripts/rig-history-probe.mjs` (log
`..\decaid-rig\log\t8-history-probe.txt`, 10 runs each, rig with one shot of 278
measurements):

| Request | Median | Size |
|---|---|---|
| `GET /api/v1/shots?limit=100&offset=0&order=desc` (the one page of the rig) | 18.6 ms (max 184 ms, the first) | 3 189 bytes |
| `GET /api/v1/shots?limit=20&offset=0&order=desc` | 17.3 ms | 3 188 bytes |
| `GET /api/v1/shots/ids` | 1.6 ms | 40 bytes |
| `GET /api/v1/shots/{id}` (278 measurements) | 23.1 ms | 150 174 bytes |
| `GET /api/v1/shots?profileTitle=…&limit=1` (the expected duration) | 17.4 ms | 3 187 bytes |

A summary is about 3 000 bytes (the workflow with the profile's copy). The list costs about
1 ms more per stored shot: `scripts/rig-history-scale-probe.mjs` pulled 12 short simulated
shots (Rao Allongé to 3 g, 18 measurements each) and timed the list after every four (log
`t8-history-scale-probe.txt`): 18.6, 21.8, 25.6 and 29.4 ms for 1, 5, 9 and 13 shots, with
`limit` 20 and 100 alike; the shots were deleted afterwards. So a tablet with 500 shots read
five pages, about 1.5 MB of JSON, at every opening, and the time of each page grows with the
shots stored; the rig's PC cannot show the tablet's time, which the founder saw as the delay.
The gateway has no 'newer than' filter: `limit` (1 to 100) and `offset` page the list, newest
first; `/api/v1/shots/latest` gives the newest summary, `/api/v1/shots/ids` all ids unordered,
and the list answers an `ETag` (`If-None-Match` gives 304; not used).

### 26.2 Built (T8)

`ShotCache` (`src/history/shots.svelte.ts`; its plain parts `merge`, `newerThan` and `Records`
in `src/history/shot-list.ts`), held by the skin as `Skin.shots`:

- `sync()`: the first time, `limit=20&offset=0`, shown at once (`read` 'first'), then
  `limit=100` pages from offset 20 up to 500 shots (`read` 'all'). Later: one
  `GET /api/v1/shots/latest`; only when that shot is not held, pages of 20 from the newest until
  one that is held (an empty history reads the newest page instead, as it has no latest). The
  skin calls it when the machine stream opens (the start, and after a lost connection), the
  overlay when it opens.
- `shotEnded()`: called when the live shot ends; looks every 2 s, up to 15 times, as Decaid
  writes the record a few seconds after the end (10.1).
- `record(id)`: `GET /api/v1/shots/{id}` once, kept for the 20 shots read last; the restore and
  the expected duration read it.
- `latestWithTitle(title)`: the expected duration's last shot (spec 3.8, T1) from the held
  shots, waiting for the older ones when the newest 20 lack the title. It replaces the query
  `profileTitle=…&limit=1`.

Tests: Vitest `src/history/shots.test.ts` (the paging, the first 20 before the rest, the most,
a second read, new shots, a shot that ends, the record and the title). `npm run e2e`:
`e2e/history.spec.ts` 'a slow, long history' (150 shots, the mock gateway holds the pages after
the first until the test releases them: 20 entries and 'Reading the older shots …', then 40
with the first 20 and the scroll unchanged; a second opening asks only `/shots/latest`; a
replayed shot's record read with one page of 20). Rig: `e2e-rig/history.spec.ts` checks that
a second opening reads no shot list and that a shot pulled while the skin is open is a new
entry on top, read with offset 0 only. Full `npm run e2e:rig` 35 of 35 passed (log
`t8-rig-suite.txt`); afterwards one shot, 73 profiles, the KV namespaces `pureflow` and
`decaid-skin` empty, steam 150 °C, the workflow and the settings equal to
`t8-workflow-before.json` and `t8-settings-before.json`, Streamline the default skin. Decaid
was ended with `Stop-Process -Force`; port 8080 was free afterwards.

## 27. The A-Flow plugin's steps by version, read back (U2, 2026-10-20)

Read in `Jan3kJ/A_Flow` on GitHub (the commit list, `plugin.tcl` before 2025-11 and `code.tcl`
after, and `profiles/` at each version), and on the rig.

| Plugin | Commit | Steps the plugin writes (`update_A-Flow`) |
|---|---|---|
| before 1.0 (2024-01 to 2024-12) | `d9bf9b72` … `988083ec` | D-Flow's three steps under the D-Flow plugin: not A-Flow |
| 1.0 to 1.3 | `6997cc70` (1.0), `5cbdbd59` (1.2) | Fill, Infuse, Pressure Up, Pressure Decline, Flow Start, Flow Extraction |
| 1.4 on | `9749e20a`, `841f8094` (1.4), `e1a4d871` (newest) | Pre Fill, Fill, Infuse, 2nd Fill, Pause, Pressure Up, Pressure Decline, Flow Start, Flow Extraction |

- The plugin always writes every step and switches one off with 0 s. Its own reader (`prep`)
  takes the pour flow from Flow Start's flow, the ramp time as Pressure Up + Pressure Decline
  seconds, flow up when Flow Extraction's flow is over the pour flow, ramp down when Pressure
  Decline lasts, and the 2nd fill when Pause lasts. It sets 2nd Fill and Pause to 15 s or 0 s
  together. With ramp down on, Pressure Up gets `round(T/2)` s and moves on at 2 × pour flow,
  Pressure Decline the rest of T and moves on under pour flow + 0.1.
- 1.4 converts a six-step profile when it is next written: it adds Pre Fill (8 ml/s, 1 s), and
  2nd Fill (flow 1.5 ml/s at `841f8094`, 8 ml/s from `8fb4fbc1`) and Pause, both 0 s.
- In 1.0 to 1.3 the infuse temperature is the fill's and the ramp's the pour's; 1.4 also gives
  2nd Fill and Pause the pour temperature when on. 3.0 can hold each.
- The names spec 3.9 lists (Filling, Ramp Up, Pouring start, Pouring, Ramp down) are the
  plugin's array names (`filling`, `ramp_up`, …); the steps carry the names above in every
  version.
- On the rig (Decaid 0.8.8): 73 profiles, five of them A-Flow, all of 1.4 (nine steps):
  `A-Flow / default-light`, `-medium`, `-dark`, `-like-dflow`, `-very-dark` (very-dark with
  ramp down, like-dflow with ramp 0 s and Flow Start on). They equal the plugin's newest files,
  converted to the API's form, except the Pause, 15 s in Decaid and 0 s in the files
  (a-flow-3.0.md, 3). No profile of 1.0 to 1.3 is on the rig; the fixture
  `src/aflow/fixtures/plugin-1.2.json` is the plugin's 1.2 files put into the form Decaid gives
  the 1.4 ones (checked: that conversion of the newest files equals the rig's copies but for
  the Pause). `src/aflow/fixtures/rig-plugin-1.4.json` is the rig's five as
  `GET /api/v1/profiles` returned them.

### 27.1 Built (U2)

`readSteps` in `src/aflow/reader.ts`, the generator's inverse: the steps must be A-Flow's names
in their order (Fill, Infuse, Pressure Up and Flow Extraction present, the others optional), the
values are read as `prep` reads them, held to 3.0's ranges, and the generator's steps for the
read values must equal the profile's after the drops (Pre Fill, ramp down merged into the ramp
up, a Pause without its 2nd Fill in the plugin's form, an infuse volume other than 100 ml);
otherwise it says which step differs. A value equal to what it follows reads as null, so the
defaults read back exactly. `openParams` (`src/editor/storage.ts`) is what the A-Flow editor
and `editorFor` open; `stepEditorReason` is the step editor's line.

Tests: Vitest `src/aflow/reader.test.ts` (both fixture files, the regression fixtures giving
back the generator's input, the round trip over every default and its toggles and 400 sets of
values across the ranges, what cannot be read), `src/editor/storage.test.ts`,
`route.test.ts`, `status.test.ts`. `npm run e2e`: `e2e/aflow-open.spec.ts` (an old profile with
ramp down opens, says so and is saved as 3.0 with its parent hidden; leaving it unedited loads
nothing; Decaid's default-medium opens as the skin's medium; changed steps open in the step
editor with the reason). Rig: `e2e-rig/aflow-open.spec.ts` loads Decaid's
`A-Flow / default-very-dark` from the picker and opens it in the A-Flow editor (ramp 6 s, the
status line names ramp down) without saving.
Full `npm run e2e:rig` 37 of 37 passed (log `u2-rig-suite.txt`); afterwards 73 profiles (none
hidden), one shot, the KV namespaces `pureflow` and `decaid-skin` empty, steam 150 °C, the
workflow on `A-Flow / default-medium` as before, Streamline the default skin. The rig now serves
Streamline 0.2.17 (0.2.14 on 2026-10-19). Decaid was ended with `Stop-Process -Force`; port 8080
was free afterwards.

## 28. The steam heater off, read again for the steam page (U3, 2026-10-20)

Against Decaid 0.8.8 with device simulation (8.8); the rig served Streamline 0.2.17. The probe
is the rig's `log\u3-steam-heater-probe.mjs`, its output `log\u3-steam-heater-probe.txt`. It
confirms 22.1 unchanged:

| Claim | Status |
|---|---|
| `PUT /api/v1/workflow` `{"steamSettings":{"targetTemperature":0}}`: 200; 2 s later the workflow reads 0 and the machine's `/ws/v1/machine/shotSettings` `targetSteamTemp: 0` | seen running |
| The same with 150: both read 150 again; duration 50 s and flow 0.8 unchanged | seen running |

So the steam page reads the heater as home's menu does (`heaterState`: the machine's
`targetSteamTemp`, 0 is off), and its **Steam on** is the menu's request (`Skin.setSteamHeater`,
the workflow's temperature, with the machine's settings written directly if they lag).
`e2e-rig/steam.spec.ts` switches the heater off through the API, sees the page's message, taps
**Steam on** and reads 150 back from the workflow and the machine. Full `npm run e2e:rig`: 39 of
39 passed; afterwards 73 profiles, one shot, both KV namespaces empty, steam 150 °C, Streamline
the default skin. Decaid was ended with `Stop-Process -Force`; port 8080 was free.

## 29. Bean and grinder catalogue port plan (U8, 2026-10-20)

Written on 2026-10-20 for the milestones U9 and U10 (spec 3.9 'Beans and grinders', item 19;
acceptance 52). No product code was written. "Read" means read in the source; "seen" means
answered by the rig. The rig was only read: every request below that writes is read in
`rest_v1.yml` and is for U9's rig test to see. Every choice made here is the simplest one that
meets 3.9 and acceptance 52; those the founder has not seen are collected in 29.11.

### 29.1 What was read

- **The rig serves Streamline 0.2.17**, not 0.2.14: Decaid updated it by itself on 2026-10-20
  at 11:01 (`web-ui/.rea_metadata.json`: `github_release:allofmeng/streamline_project@v0.2.17`;
  `GET /api/v1/webui/skins/default` says `0.2.17`). The clone of E1, `../streamline-js`,
  was fetched and read at tag **`v0.2.17`** (`ec1fe2e`). From 0.2.14 to 0.2.17 the bean files
  changed little (`bean-selection-modal.js` 3 lines, `dye-context.js` 28) and the grinder got a
  runtime part (`grinder-runtime.js`, `grinder-sync.js`, Settings > Connections > Grinder: the
  device, not the catalogue; 20.1 saw it coming).
- **Streamline's bean and grinder code:** `src/modules/api.js` (l. 2360-2520 at 0.2.17: shots
  with filters, beans, batches, grinders), `bean-selection.js` (17 lines),
  `bean-selection-modal.js` (82), `dye-context.js` (62), `dye-selection.js` (230), `dyeStrip.js`
  (the context clean-up, l. 1130-1250), and where `history.js`, `profileManager.js`,
  `profile_selector.js`, `ui.js` and `app.js` touch the context's grinder setting.
- **DYE2**, the plugin that has the catalogue pages (29.2): `decentespresso/dye2`, cloned to
  `../dye2` as a reference only, read at **`v0.1.4`** (`637dd09`), the version installed on
  the rig (`plugins/dye2.reaplugin/.rea_source.json`; 0.1.21 waits there as `pendingUpdate`
  with the new permissions `events.shots` and `events.workflow`), and compared with `v0.1.21`:
  `src/api/client.ts`, `src/pages/bean-picker.ts`, `add-bean.ts`, `roasters.ts`, `grinders.ts`,
  `grinder-picker.ts`, `dashboard.ts` (its bean card and 'same beans'), `edit-shot.ts`.
- **Decaid's API:** the rig's `assets/api/rest_v1.yml` (paths `/api/v1/beans`, `/beans/{id}`,
  `/beans/{beanId}/batches`, `/bean-batches`, `/bean-batches/{id}`, `/grinders`,
  `/grinders/{id}`, `/shots`; schemas `Bean`, `BeanBatch`, `Grinder`, `WorkflowContext`,
  `WorkflowContextPatch`) and the rig's answers (29.4).
- **This skin:** `src/history/{entries.ts,shots.svelte.ts,shot-list.ts,History.svelte}`,
  `src/shell/{Home.svelte,nav.ts,profiles.ts,recall.svelte.ts}`, `src/api/{client.ts,types.ts}`,
  `src/settings-page/*`, `src/editor/{NameDialog.svelte,NumberPad.svelte}`, and sections 4, 14
  and 26 above.

### 29.2 Streamline has no catalogue pages: DYE2 has them

Spec 3.9 calls them Streamline's bean and grinder pages. Read, they are not Streamline's.
**Streamline 0.2.17 has one dialog that picks a bean, and nothing that adds, edits or archives
one**: its `createBean`, `updateBean`, `deleteBean`, `createBeanBatch`, `updateBeanBatch`,
`createGrinder`, `updateGrinder`, `deleteGrinder` and `getGrinders` in `api.js` have no caller
(`grep` over `src/`). Adding and editing beans and grinders is the DYE2 plugin's ("Bean,
grinder, and equipment management for Decent Espresso", its manifest), and Streamline sends the
user there: the DYE button of its header (`dyeStrip.js`, off by default behind
`streamline.dye2Enabled`) navigates the page to `/api/v1/plugins/dye2.reaplugin/dashboard`, a
plugin page on another origin, and back with `?dyeReturn=1`. So the port takes the requests and
the data from Streamline and Decaid, the behaviour of the pages from DYE2, and the code of
neither page (29.9).

What each part shows and does:

| Where | What it shows | What it does | Requests |
|---|---|---|---|
| Streamline, history's long press, **'Select coffee batch for next shot'** (`bean-selection-modal.js`) | a `<dialog>`: a `<select>` of the beans that are not archived ('name · roaster · species'), then one of that bean's batches ('name · roast level · roast date'), **Cancel** and **Use for next shot** | writes `beanBatchId`, `coffeeName`, `coffeeRoaster` and the flag `extras.streamlineBean: true` into the workflow's context; after the next shot Streamline's clean-up clears the three again (`skinBeanClearContext`): **its pick is for one shot** | `GET /beans?includeArchived=false`, `GET /beans/{id}/batches?includeArchived=false`, `PUT /workflow` |
| Streamline, home's **Grind** value with − and + | `context.grinderSetting` | the step is the connected grinder's (0.2.17), else Streamline's own; the value is remembered per profile in Streamline's storage (`profileManager.js`, `lastGrinderSetting`) and written with every profile load | `PUT /workflow` |
| Streamline, after each shot and at its start (`clearDyeWorkflowContext`) | — | while DYE2 is on and loaded, clears the bean and grinder fields DYE2 set (scoped by DYE2's marker `extras.dye` from DYE2 0.1.20 on); `grinderId` and `grinderModel` survive from Streamline 0.2.15 on | `GET /workflow`, `PUT /workflow` |
| DYE2 **dashboard** | a bean card ('Roaster • Name', or '— Select Beans') and 'Grinder Model • Setting'; the last shots with **All shots / Same beans** | a tap on the bean card opens the bean picker; 'Same beans' keeps the shots whose `coffeeName` equals the shown one's (on the page, not a request) | `GET /workflow`, `GET /shots` |
| DYE2 **Select Beans** (`bean-picker`) | a search field and sort buttons (recent, oldest, A-Z, Z-A; 'most used' and 'least used' fall back to A-Z) on the left, a grid of cards in three columns: 'ADD NEW BEANS +', then one card per bean (name, harvest, country, processing, variety; the roaster; the newest batch's roast date with its days off roast); 0.1.21 adds a pencil on each card and 'IMPORT FROM BEANCONQUEROR' | a tap selects; **CONFIRM** writes `coffeeName`, `coffeeRoaster` and the newest batch's `beanBatchId` (the batches are read one bean at a time) and goes back; a bean without a roaster goes to **Select Roaster** first | `GET /beans` (with `?archived=true` for archived ones, a parameter Decaid does not have, 29.4), `GET /beans/{id}/batches` per bean, `PUT /workflow` |
| DYE2 **Add New Beans** (`add-bean`) | Beans (a text field with the known names as suggestions), Roaster (the known roasters), Roast Date (a date picker), Bean Notes; 0.1.21 adds processing, country, decaf and its process, roast level, weight and weight remaining, and the same page as **Edit Beans** with `?id=` | name and roaster are required (a red border); **CONFIRM** creates the bean, then a batch only if a roast date was given | `POST /beans`, `POST /beans/{id}/batches`; 0.1.21 also `PUT /beans/{id}`, `PUT /bean-batches/{id}` |
| DYE2 **Select Roaster** (`roasters`) | the roasters of all beans as cards | the roaster chosen is written with the bean's name | `GET /beans`, `PUT /workflow` |
| DYE2 **Grinders** | the same rail and grid: 'ADD NEW GRINDER +', one card per grinder (model; burrs · type · size; setting type · notes) | a tap opens a form: Model (required), Burrs, Burr Type, Burr Size (mm), Setting Type (numeric or preset), Small and Big Step or the preset values, RPM Small and Big Step, Notes; 0.1.21 adds **DELETE** | `GET /grinders`, `POST /grinders`, `PUT /grinders/{id}`; 0.1.21 `DELETE /grinders/{id}` |
| DYE2 **Select Grinder** (`grinder-picker`) | the grinders as cards, a form to add one | writes `grinderId` and `grinderModel` | `GET /grinders`, `POST /grinders`, `PUT /workflow` |

**Archiving is in neither.** Decaid has it (`archived` in `PUT /beans/{id}`,
`/bean-batches/{id}` and `/grinders/{id}`, and `includeArchived` on the lists); DYE2 only
writes it in its Beanconqueror import (0.1.21), and Streamline only hides archived beans and
batches (`selectableBeans`, `selectableBatches`). Nor does either filter the history by a
grinder: Streamline's history has no filter, DYE2's 'Same beans' compares names on the page.

### 29.3 The data model: bean, batch, grinder, and what a shot holds of them

Decaid (`rest_v1.yml`) keeps three kinds, each with `id` (UUID), `createdAt`, `updatedAt`,
`archived` and a free `extras`:

- **Bean** (an origin or blend): `roaster` and `name` required; `species`, `decaf` (default
  false), `decafProcess`, `country`, `region`, `producer`, `variety` (strings), `altitude`
  ([min, max] m), `processing`, `notes`.
- **BeanBatch** (one bag of a bean): `beanId` required; `roastDate`, `roastLevel`,
  `harvestDate`, `qualityScore`, `price`, `currency`, `weight` and `weightRemaining` (g; the
  POST sets the remaining to the weight), `buyDate`, `openDate`, `bestBeforeDate`,
  `freezeDate`, `unfreezeDate`, `frozen`, `notes`. Nothing in Decaid lowers `weightRemaining`
  after a shot (read: no request or event names it).
- **Grinder**: `model` required; `burrs`, `burrSize` (mm), `burrType`, `notes`, `settingType`
  (`numeric`, the default, or `preset`), `settingValues` (the preset's positions),
  `settingSmallStep`, `settingBigStep`, `rpmSmallStep`, `rpmBigStep`.

Writes: `POST` creates (201 with the object); **`PUT` changes only the fields it carries**
("Omitted fields preserve their current values, explicit `null` clears nullable fields"), so a
skin that edits name, roaster and notes leaves DYE2's other fields as they are; `DELETE` removes
for good, a bean with all its batches. The lists leave archived ones out unless
`includeArchived=true`.

**A shot refers to them only through the workflow's `context`**, copied into the record at the
shot (14): `beanBatchId` (a batch, not a bean) with `coffeeName` and `coffeeRoaster` as display
strings, and `grinderId` with `grinderModel` and `grinderSetting` (a string). There is no
`beanId` in the context. `GET /shots` filters by `beanBatchId`, by **`beanId`** ("every batch
currently associated with the bean, including archived batches, so bean renames do not break
batch-backed shot history"), `grinderId`, `grinderModel`, `coffeeName`, `coffeeRoaster`,
`profileTitle` and a free `search`. So a shot is tied to its bean only if the pick wrote a
batch id: a bean without a batch can be named in a shot, but not found again by its id.

### 29.4 On the rig (read only)

The probe is a list of `GET`s; its output is the rig's `log\u8-beans-probe.txt`. Nothing was
written.

| Claim | Status |
|---|---|
| `GET /beans`, `/beans?includeArchived=true`, `/bean-batches?includeArchived=true`, `/grinders`, `/grinders?includeArchived=true`: 200, `[]` each, with an `ETag`: **the rig's catalogue is empty**, although DYE2 0.1.4 is installed and loaded | seen running |
| `GET /beans/{unknown}`: 404 `{"error":"Bean not found"}`; the same for `/grinders/{unknown}` ('Grinder not found') and `/bean-batches/{unknown}` ('Batch not found'); `GET /beans/{unknown}/batches`: 200 `[]`, not 404 | seen running |
| `GET /shots?beanId=x`, `?grinderId=x`, `?coffeeName=x`, `?search=x`: 200 `{"items":[],"total":0,...}`; the parameters are taken | seen running; that they match a real bean is for U9's test |
| The rig's one shot (`ee7495ea`, 2026-10-11) has `coffeeName: "Rig Bean A"`, `coffeeRoaster: "Rig"`, `grinderModel: "Rig Grinder"`, `grinderSetting: "5.2"` and no ids: the strings of D8b's probe, from no catalogue | seen running |
| The workflow's context now: `targetDoseWeight` 16, `targetYield` 42, `grinderSetting` "5.2", `extras` with DYE2's four null keys (`basketId`, `basketName`, `rpm`, `note`); no bean | seen running |
| `GET /grinder/info`: 503 `{"error":"No grinder connected"}`; `/devices` lists only `MockScale` and `MockDe1` | seen running |
| DYE2 asks for archived ones with `?archived=true` (`client.ts`, 0.1.4 and 0.1.21); Decaid's parameter is `includeArchived`, so DYE2 never lists them. With an empty catalogue the rig cannot show the difference | read |

To be seen by U9's rig test, since the rig was not to be written now: a bean, a batch and a
grinder created, read, changed and archived; an archived one absent from the list and present
with `includeArchived`; a picked bean and grinder in the next shot's record; `GET /shots?beanId=`
and `?grinderId=` finding that shot. Everything is deleted afterwards (29.8).

### 29.5 What the skin has today

- **The context's six fields** are typed in `WorkflowContext` (`src/api/types.ts`); the client
  has `getWorkflow`, `updateWorkflow` and `listShots` with every filter of 29.3
  (`ListShotsQuery` already has `beanId`, `grinderId`, `search`). It has **no bean, batch or
  grinder request.**
- **The history** (`src/history/entries.ts`, spec 3.5) groups the held shots (`ShotCache`, the
  newest 500, T8) into one entry per profile title and bean; `entryKey`'s bean is roaster and
  name, the batch id only for a bean without both; an entry shows 'Roaster · Name', 'no bean'
  or 'bean from Decaid'; a tap restores profile, bean and grinder fields with one
  `PUT /workflow` (`beanAndGrinder`, `null` for what the shot lacked).
- **Nothing lets the user type or pick a bean or a grinder setting**, and nothing shows the
  current bean outside a restored entry (home's 'last shot with …'). `loadProfile` sends only
  the keys it is given, so loading a profile from the picker keeps the current bean.
- **For the forms:** `NameDialog.svelte` (a text field on the tablet's own keyboard, checked
  names, Escape and a tap outside cancel), `NumberPad.svelte` (numbers), the settings page's
  `Confirm.svelte` and its two-column layout (list left, the chosen one right;
  `SettingsPage.svelte`), and `errorMessage` for a failed request.

### 29.6 The plan: one 'Beans' screen, a pick on home, the history's filter

**Where it opens.** The catalogue is a seventh screen, `beans` (`SCREENS` in
`src/shell/nav.ts`), opened by a new entry **Beans and grinders** in home's menu: one tap from
home and back, as every screen. The **pick for the next shot** is a chip in home's header after
the profile name, showing the current bean as the history labels it ('Roaster · Name', or 'no
bean') and the grinder setting; a tap opens the pick as a dialog over home. Both places were
candidates in 3.9; the menu is for what is rarely done (adding a bag), the chip for what is
done before a shot. The header must stay on one row at 1280 x 800 (spec 3.9 item 9); if the
chip does not fit there, it goes under the profile name.

**The screen** (U9), laid out as the settings page: on the left **Beans** and **Grinders**, in
the middle the list of the chosen kind, newest first, with a search field and **show
archived**; on the right the chosen one's form, or **add a bean** / **add a grinder**.
- A bean's form: **name** and **roaster** (required, as Decaid and DYE2 require them; the
  roaster field suggests the roasters already in the catalogue), **roast date** and **notes**.
  The roast date is the bean's current batch's. Saving a new bean is `POST /beans`, then
  `POST /beans/{id}/batches` always (with the roast date, or empty), so that every bean of the
  skin has a batch and its shots can be found by `beanId` (29.3). Saving an edit is
  `PUT /beans/{id}` with the fields that changed, and `PUT /bean-batches/{id}` for the roast
  date. **New bag** archives the current batch and creates the next one (a new roast date of
  the same bean, which is what Decaid's batches are).
- A grinder's form: **model** (required), **burrs**, **setting type** (numbers or named
  positions), the **small step** (the pick's − and + use it; default 1) or the **positions**,
  **notes**. `POST /grinders`, `PUT /grinders/{id}`.
- **Archive** on both forms (`PUT … {"archived": true}`), behind `Confirm` ('Archive Red Brick?
  It is no longer offered for the next shot; its shots stay in the history'), and **restore**
  on an archived one. No delete: Decaid's delete takes a bean's batches with it, its shots then
  name a batch that no longer exists, and archiving is what 3.9 asks for.
- Fields that DYE2 or another skin wrote and the skin does not show are kept, since `PUT` sends
  only what changed.

**The pick** (U9): a dialog with the beans that are not archived (with search when there are
more than fit; the current one marked), the grinders that are not archived, and the **grinder
setting** with − and + by the grinder's small step and its value on the number pad (or its
named positions). **Use for the next shot** sends one `PUT /api/v1/workflow` with
`coffeeName`, `coffeeRoaster`, `beanBatchId` (the bean's current batch: the newest that is not
archived), `grinderId`, `grinderModel` and `grinderSetting`; **no bean** sends `null` for the
three bean fields. **The pick stays for every next shot until it is changed**, unlike
Streamline's one-shot pick: the founder pulls the same beans many times, and 3.5's entries are
built for that. With one grinder in the catalogue it is chosen by itself (the founder has one
grinder). The chip reads the workflow the skin already holds (Decaid pushes its changes), so a
pick made in DYE2 or Streamline shows too.

**The history** (U10):
- **Its filter:** above the list, **all**, a **bean** and a **grinder** choice (the
  catalogue's, archived ones included, since their shots are in the history). The shots are
  filtered first, then grouped (`groupShots` as it is): a bean matches a shot whose
  `beanBatchId` is one of the bean's batches (`GET /bean-batches?includeArchived=true`, one
  request for all), or, for a shot from before the catalogue or from a skin that wrote no
  batch, whose name and roaster equal the bean's; a grinder matches by `grinderId`, or by
  `grinderModel` for a shot without one. This runs on the held 500 shots, not as
  `GET /shots?beanId=`: the overlay already holds them (T8), the answer needs no request, and
  the name match finds shots the server's filter cannot. The choice lasts for the session.
- **The entries with the catalogue's beans:** a shot whose `beanBatchId` is in the catalogue is
  labelled with the bean's current roaster and name (a renamed bean shows its new name), and
  `entryKey` takes the bean's id for it, so the shots of one bean stay one entry across a
  rename and across bags. A shot without a known batch keeps 3.5's rule (name and roaster).
  This changes the answered rule in spec 8 'Shot history' for catalogue beans only.
- **A tap on an entry's bean** sets the filter to that bean. Restoring an entry stays as it is;
  its `beanAndGrinder` already carries `beanBatchId` and `grinderId`.

### 29.7 Files: what is reused, what is new

| File | U | What |
|---|---|---|
| `src/api/types.ts` | U9 | `Bean`, `BeanBatch`, `Grinder` and their create and update bodies, from `rest_v1.yml` (29.3) |
| `src/api/client.ts` | U9 | `listBeans(includeArchived)`, `createBean`, `updateBean`, `listBatches(beanId, includeArchived)`, `listAllBatches(includeArchived)`, `createBatch`, `updateBatch`, `listGrinders(includeArchived)`, `createGrinder`, `updateGrinder`; no delete (the rig test deletes with `fetch`) |
| `src/beans/catalogue.ts` (new) | U9 | pure: a bean's current batch, the pick's context patch (`null`s for 'no bean'), what changed in a form (the `PUT` body), the roasters for the suggestions, sort and search; `selectableBeans` and `currentBeanContext` ported from Streamline's `bean-selection.js` with its notice (29.9) |
| `src/beans/catalogue.svelte.ts` (new) | U9 | the catalogue as the screens read it: read on opening, written and read back, the last error; one more part of `Skin`, as Q2 split it |
| `src/beans/Beans.svelte` (new) | U9 | the screen: kinds, list, form (29.6) |
| `src/beans/BeanForm.svelte`, `GrinderForm.svelte` (new) | U9 | the two forms; a `TextField` for name, roaster, model, burrs and notes, as `NameDialog`'s field; the date as `<input type="date">` (Android's own picker in the WebView) |
| `src/beans/Pick.svelte` (new) | U9 | the pick for the next shot, the grinder setting on `NumberPad` |
| `src/shell/Home.svelte` | U9 | the chip in the header, the menu entry |
| `src/shell/nav.ts`, `src/App.svelte` | U9 | the screen `beans` |
| `src/settings-page/Confirm.svelte` | U9 | reused as it is, for archive |
| `src/history/entries.ts` | U10 | `entryKey` and `beanLabel` with the catalogue (29.6); `matchesBean`, `matchesGrinder` |
| `src/history/History.svelte` | U10 | the filter row; the tap on a bean |
| `e2e/mock-gateway.ts` | U9, U10 | the three kinds in memory, answering as Decaid does (201, `PUT` keeps omitted fields, `includeArchived`) |

The settings page's `FieldRow` and `fields.ts` are not reused for the forms: those rows are
tied to gateway settings with ranges (`Field`), and a bean's fields are text. What is shared is
the layout, `Confirm`, `NumberPad` and the error line.

### 29.8 The milestones and their tests

**U9: the catalogue and the pick** (about 2.0M tokens; E2, a ported screen of several files,
took 2.54M; this one is new code on parts the skin has). Tests:
- Vitest: `catalogue.test.ts` (the current batch is the newest not archived; the pick's patch,
  'no bean' as three `null`s; an edit's body holds only what changed; a new bean is two
  requests, bean then batch; search and sort; the grinder setting's − and + by the step and
  through named positions); the client's new requests against a fake `fetch` (paths,
  `includeArchived`, bodies).
- Playwright, mocked gateway, `e2e/beans.spec.ts`: the menu opens the screen; a bean is added
  with name and roaster typed, edited, archived (the confirm first), absent from the list and
  back with 'show archived', restored; the same for a grinder; the chip opens the pick, and a
  bean, a grinder and a setting go out in one `PUT /workflow` and show on the chip; 'no bean'
  clears; the header stays one row at 1280 x 800; the screen has no horizontal scroll.
- Rig, `e2e-rig/beans.spec.ts` (acceptance 52, first half): through the screen, add a bean and
  a grinder named with the test's own prefix (`pureflow-rig-…`), edit and archive them, read
  each step back with the client; pick them, run one simulated shot (as `shot.spec.ts`) and read
  its record: `beanBatchId`, `coffeeName`, `coffeeRoaster`, `grinderId`, `grinderModel`,
  `grinderSetting` as picked; `GET /shots?beanId=` and `?grinderId=` find it. Then delete the
  shot, the bean (with its batches) and the grinder, put the six context fields back as
  recorded before, and check: the catalogue empty again, one shot, 73 profiles.

**U10: the history filtered by bean and grinder** (about 1.3M tokens). Tests:
- Vitest: `entries.test.ts` extended (a catalogue bean is one entry across a rename and two
  batches; its label is the current name; a shot without a batch keeps 3.5's key; the filters
  by batch, by name and roaster, by grinder id and by model; filtered, then grouped).
- Playwright, mocked gateway, `e2e/history.spec.ts` extended: two beans, shots of each and one
  without; the filter by one bean shows only its entries, by the grinder only its; a tap on an
  entry's bean filters by it; 'all' brings every entry back; the existing tests pass.
- Rig, `e2e-rig/history.spec.ts` extended (acceptance 52's last sentence): two beans of the
  test's own, a simulated shot with each, the overlay filtered by one shows one entry; shots,
  beans and context cleaned up as in U9.

U9 and U10 stay two tasks: U10 needs U9's requests, types and catalogue, and each is
committable on its own (U9 without U10 is the catalogue and a pick that the history already
restores). U10 is the smaller one.

### 29.9 Licence

**Streamline** is GPL-3.0-or-later (20.8). The one piece of its code the skin takes is
`bean-selection.js`'s two filters and `currentBeanContext` (in `src/beans/catalogue.ts`), with
20.8's notice naming v0.2.17 and `src/modules/bean-selection.js`. The requests are Decaid's
API, not Streamline's code.

**DYE2 has no licence** (no `LICENSE` at `v0.1.4`, `v0.1.21` or its head `be4768d`, and its
`package.json` names none), so all rights are its authors': **no code, wording or style of DYE2
is copied.** The plan takes from it only what using it shows (which fields a bean form has,
that a picked bean writes three context fields), and the skin's screen is laid out as the
skin's own settings page, not as DYE2's grid of cards.

### 29.10 Risks

1. **Another writer of the context.** Streamline, when it is the skin, clears after each shot
   the bean that DYE2 set (DYE2 on and loaded) and the one its own picker flagged; the skin
   flags nothing, so Streamline leaves the skin's pick alone unless DYE2 is on in Streamline.
   DYE2 0.1.21, once approved, holds `events.workflow` and may write the context itself. The
   chip reads the workflow, so it shows what is really there; U9 tests the pick against a
   context holding DYE2's `extras` keys, as the rig's does.
2. **The catalogue lives in Decaid, not in the skin:** beans added in DYE2 show in the skin and
   the other way round. A bean DYE2 added without a batch has none to pick; the pick then sends
   no `beanBatchId` (name and roaster only) and does not create a batch by itself.
3. **`GET /shots?beanId=` and the shot's ids were not seen** with a real bean (29.4); U9's rig
   test is the first to. If a record lacked the ids, U10 would still filter by name and
   roaster.
4. **The keyboard:** typing is the tablet's soft keyboard over the form. The editor's 'save as'
   already uses it (`NameDialog`); the form keeps its fields in the upper half so the keyboard
   does not cover the one being typed.
5. **Bean from a photo (U13)** adds a photo to the bean later; Decaid's `extras` can hold a
   reference, so nothing in U9's model has to change for it.

### 29.11 Choices the founder has not seen

1. **The pages are DYE2's, not Streamline's** (29.2): the skin builds its own screen on
   Decaid's requests, and nothing of DYE2's code or look is taken (29.9).
2. **Where it opens:** a 'Beans and grinders' screen from home's menu, and the pick from a chip
   in home's header with the current bean and grinder setting (29.6).
3. **The pick stays** for every next shot until it is changed; Streamline's is for one shot.
4. **The bean form has name, roaster, roast date and notes;** the other fields of Decaid's bean
   and batch (origin, process, variety, weights, prices, dates) are left out, and kept when
   DYE2 wrote them. Every new bean gets a batch; **new bag** starts the next one.
5. **Archive, no delete,** for beans and grinders.
6. **The grinder setting is set in the pick** with − and + by the grinder's step; Streamline's
   per-profile memory of the setting is not ported (3.5: it belongs to the entry).
7. **The history's filter works on the held shots** and matches by batch or by name and
   roaster; a catalogue bean is one entry across renames and bags (29.6).

### 29.12 Seen on the rig while building U9 (2026-10-20)

Decaid 0.8.8 with Streamline 0.2.17 as its default skin; the probe's output is the rig's
`log\u9-probe.txt`, the state before the tests `log\u9-before.txt`.

| Claim | Status |
|---|---|
| `POST /beans/{id}/batches` takes a date alone (`"2026-10-01"`) and stores `2026-10-01T00:00:00.000`; an empty body makes a batch without a roast date | seen running |
| `GET /beans/{id}/batches` lists the newest roast date first; the skin orders by `createdAt` itself | seen running |
| `PUT /beans/{id}` and `/grinders/{id}` change only the fields they carry, and `{"archived": true}` takes the item out of the list without `includeArchived` | seen running |
| **`DELETE /beans/{id}` of a bean that has batches answers 500** (`SqliteException(787) … FOREIGN KEY constraint failed`), against `rest_v1.yml`'s "with all its batches"; deleting the batches first (`DELETE /bean-batches/{id}`, 200), then the bean, works. The skin deletes nothing; the rig test cleans up in that order | seen running |
| A shot pulled after the pick holds `beanBatchId`, `coffeeName`, `coffeeRoaster`, `grinderId`, `grinderModel` and `grinderSetting` as picked, and `GET /shots?beanId=` and `?grinderId=` find exactly that shot (`e2e-rig/beans.spec.ts`; 29.10 risk 3 settled) | seen running |

### 29.13 Built (U10, 2026-10-21)

The rig served Streamline 0.2.17 (unchanged since 29.1).

- **The matching** is in `src/history/entries.ts`: `shotBean` (U9's `pickedBean`: the batch's
  bean, else the bean with the shot's name and roaster), `shotGrinder` (by `grinderId`, else by
  `grinderModel` for a shot without an id; unlike the pick, one grinder in the catalogue is not
  taken for a shot that names none), `filterShots` (filtered first, then `groupShots` as
  before), `entryKey` with the catalogue bean's id, `grinderLabel`.
- **Old shots.** A shot from before the catalogue whose name and roaster equal a catalogue
  bean's joins that bean's entry and its filter; 29.6 kept such a shot on 3.5's key. The labels
  are the same, so two entries would look like one doubled; one entry is the simpler reading.
  A shot whose batch the catalogue does not know (deleted) falls back to name and roaster.
- **The overlay** (`History.svelte`): the filter row (`filter-all`, `filter-bean`,
  `filter-grinder`), the choice list (`filter-options`, `filter-any`, `filter-option`) in the
  list's place; the filter is `Recall.historyFilter`, for the session. The catalogue is read
  (three requests) each time the overlay opens; the shots are not read again.
- **Left out:** 29.6's tap on an entry's bean to filter by it. An entry is one button that
  restores it; a second tap target inside it needs a new layout of the entry. The filter row
  does the same in two taps.
- **Tests:** `entries.test.ts` (8 new), `e2e/history.spec.ts` (the filter, its reset, the old
  shot by name, bean and grinder together, the older shots filtered as they arrive, no shot
  list read twice), `e2e-rig/history.spec.ts` (two beans of the test's own with a bag each, a
  shot with each, the filter by one shows one entry; shots, bags, beans and the context put
  back and checked). Full rig suite 46 of 46.

### 29.14 A bean's photo: where it is stored (U13, 2026-10-23)

The rig served Streamline 0.2.18.

| Claim | Status |
|---|---|
| Decaid's `Bean` has no field for an image: `roaster`, `name`, `species`, `decaf`, `decafProcess`, `country`, `region`, `producer`, `variety`, `altitude`, `processing`, `notes`, and the free `extras` (`rest_v1.yml` of 0.8.8, 29.3). No endpoint of `rest_v1.yml` takes a bean's image | read |
| A 400 kB JSON string came back unchanged from `POST` then `GET /api/v1/store/pureflow/{key}` (24 ms), and `DELETE` removed it | seen running |
| A photo stored by the beans screen is in the namespace's key list, and is gone after the bean is deleted in Decaid and the screen is opened again (`e2e-rig/bean-photo.spec.ts`) | seen running |

**The choice:** the photo is a JPEG data URL (1024 px on its long side, quality 0.85; about
100 to 250 kB for a photo of a bag) under `bean-photo-<bean id>` in the skin's KV namespace
(`pureflow`), not in the bean's `extras`: the extras come with every `GET /beans`, which the
pick, the history's filter and the beans screen read, and DYE2 writes there too. The key has
no `/`, so it needs no encoded slash in the path. The skin does not delete beans (it archives
them); a bean deleted elsewhere (DYE2, a test) leaves its key, so the catalogue's read on the
beans screen lists the namespace's keys and deletes the `bean-photo-` keys whose bean is not in
Decaid's list, archived ones included (`src/beans/photo.ts`, `catalogue.svelte.ts`). The KV
settings backup (one key, `settings-backup`) is not touched.

**The reader:** Tesseract.js 7.0.0 (Apache-2.0) with tesseract.js-core 7.0.0 (Apache-2.0) and
`@tesseract.js-data/eng` 1.0.0 (MIT; the `4.0.0_best_int` data, 2.9 MB gzipped). Only the LSTM
cores are bundled (the worker picks relaxed SIMD, SIMD or plain by the device), each with its
WebAssembly inlined (`.wasm.js`); `vite.config.ts` serves them from `ocr/` in development and
copies them there in the build with their licences. Page segmentation is 'sparse text': with
the default one the 84 px title of the test bag was not read at all. Tesseract.js 7 reports a
failed language load only to its `errorHandler` and its worker promise never settles, so each
step is raced against that handler (`src/beans/ocr.ts`).

## 30. Skin switch and display options (U11, 2026-10-21)

Ported from Streamline **0.2.17**, the version the rig served at the start
(`GET /api/v1/webui/skins/default`: `0.2.17`, `reaMetadata.commitHash` `v0.2.17`); the clone
`../streamline-js` was read at that tag. Spec 3.9 item 15, roadmap U11.

- **Where.** Two subcategories of 6. Skin, the skin's own category (20.6), after Shot graph:
  **Display Size** and **Active Skin** (Streamline's names). Streamline keeps Display Size under
  9. Miscellaneous; here it is the skin's own setting, so it sits with the others.
- **Display Size** (`src/display.ts`, Streamline's `UI_ZOOM_MAP` and `CHART_LINE_WIDTH_MAP`):
  display size Small 0.85, Medium 1, Large 1.15, Extra Large 1.3, a factor on the root font
  (`--display-size` in `app.css`), so every size in rem follows; chart line width Thin 0.6,
  Normal 1, Thick 1.5, Extra Thick 2, a factor (`--line-width`) on the curves of `ShotGraph`
  (home, the overlay, the history, the picker's and the step editor's previews) and of the
  A-Flow editor's graph. Both are in the settings object (`displaySize`, `lineWidth`), so the
  KV backup carries them; a stored factor that is no choice reads as 1. Home still fits
  1280 x 800 at Extra Large; Streamline lets its page scroll when zoomed, this skin does not
  (spec 3.1), so a page with more content may be cut at Large and above.
- **Left out of Streamline's display options:** Temperature (°C / °F) would have to convert
  every temperature the skin shows and every one it is typed in (the number pads, the editor,
  steam, the settings fields), not one display option; Screen Saver is Streamline's own (the
  skin has its Asleep screen, W1); Keyboard Shortcuts and Home Assistant do not apply.
- **Active Skin** (`Skins.svelte`, `skins.ts`): `GET /api/v1/webui/skins` with the default
  (`GET .../default`) first and marked, the others by name, each with version and Bundled /
  Installed; Streamline's 'Update available' badge asks GitHub's API for each skin's latest
  release, an outside service, and is left out. A tap on another skin asks (Confirm) and then
  does what Streamline's `setActiveSkin` does: `PUT /api/v1/webui/skins/default`, a read of the
  default to check it, `POST /api/v1/webui/server/stop` and `.../start` (a new default is served
  only after a restart, section 15), then `GET /api/v1/webui/server/status` every 500 ms
  for up to 20 s until it serves. **The page then opens `http://<host>:<port>/` with the port
  the status names**; Streamline opens port 3000, Decaid's redirector to the served port, which
  this skin does not use (spec 6). Whether Decaid's WebView on the tablet lets the skin open
  the served port directly is not seen (the rig has no WebView to drive); if it does not, the
  page says after 6 s that the default is set but the screen did not switch. 'Check for skin
  updates' is `POST /api/v1/webui/skins/update` and a read of the list.
- **Rig** (`e2e-rig/settings-skin.spec.ts`): the list matches the rig's seven skins with
  `streamline.js` first; the switch to `insight` set it as default and Decaid served it on
  another port, which the page opened (the other skin's page is answered by the test, so it
  never ran). The test then set `streamline.js` back, stopped and started the server and
  checked the default, the served path (port 27906 as before), Decaid's settings, the
  workflow's profile and the KV backup. Full rig suite 47 of 47; afterwards 73 profiles, one
  shot, the `pureflow` and `decaid-skin` namespaces empty, steam 150 °C, Streamline the default.

## 31. The rest of Streamline's settings (U12, 2026-10-21)

Ported from Streamline **0.2.17**, the version the rig served at the start (`GET
/api/v1/webui/skins/default`: `0.2.17`); the clone `../streamline-js` was read at that tag.
Spec 3.9 item 15, roadmap U12. GPL notice as 20.8 in every file that takes from Streamline.

- **Bengle pages** (`Bengle.svelte`, `bengle.ts`). `SettingsPage` reads `GET /api/v1/machine/info`
  once and shows three subcategories only when the model names a Bengle (`isBengle`, Streamline's
  `isBengleModel`): 3. Calibration > **Load Cells**, 4. Machine > **Cup Warmer** and
  **Lighting**. The rig simulates a DE1, so they are absent there and the gateway answers 404
  for `machine/cupWarmer`, `cupWarmer/preheat`, `ledStrip` and `scaleCalibration` (checked by
  `e2e-rig/settings-help.spec.ts`); everything else about them is tested against the mocked
  gateway, which follows `rest_v1.yml` of the tag.
  - Cup Warmer: the mat's reading (`currentTemperature`, null reads 'No reading', never 0), a
    switch, the target 0-80 °C on the number pad, and the firmware's scheduled pre-warm
    (`GET/PUT cupWarmer/preheat`: switch and lead 0-120 min) when the firmware has it. The switch
    on sends the target alone (which also enables the mat, `rest_v1.yml`), off sends
    `{enabled:false}` so the setpoint stays. The page reads again after each write and every 3 s.
    Streamline's warnings about an empty wake schedule are left out.
  - Lighting: the front and back strip, awake and asleep, as four colour inputs; Save writes the
    whole palette with `PUT machine/ledStrip` (the machine stores it at once, there is no
    staging), Discard reads it again. A strip colour is 12 hex digits `RRRRGGGGBBBB`; the input's
    `#rrggbb` becomes each byte twice. Streamline's colour sequences and preview are left out.
  - Load Cells: `GET/PUT machine/scaleCalibration`: the step and seconds left, the last latch's
    result, Find zero (platform empty), a known mass 1-10000 g on the pad and Latch (once per
    load cell, the platform off), Abort. No command is sent while a step runs; a 409 is shown.
- **User Manual** (11, `Help.svelte`): Streamline's Quick Start Guide (`decentespresso.com/doc/
  quickstart/`) and this skin's README, as links that open outside the skin; they need the
  internet. Streamline's 'Show help button' belongs to its overlay and does not apply, and 'Talk
  to Decent' (a Decent account) stays out.
- **Send Feedback** (`Help.svelte`): type (bug, feature, general), title, description and one
  switch for the logs and system information, as `POST /api/v1/feedback`
  (`{description: '**title**\n\ntext', type, includeLogs, includeSystemInfo}`). It becomes a
  public GitHub issue, so Send asks first. No test sends it: the mocked gateway answers, the rig
  spec only opens the confirm and cancels it.
- **Firmware from a file** (`Firmware.svelte`, Updates > Firmware Update): 'Install from a file'
  chooses a file on the device, a confirm names the file and its size and says the update takes
  at least 50 minutes and the machine must stay on, and `POST /api/v1/machine/firmware` takes
  the raw file as its body. The NDJSON answer (`erasing`, `uploading`, `done` or `error`) is read
  by `readNdjson` (`src/api/ndjson.ts`, Streamline's `splitNdjson`) and shown as the bundled
  build's progress is, with Cancel. Refusals (400 empty, 409 running, 413 over 16 MB, 503 no
  machine) show as the gateway's error. No firmware is uploaded on the rig or in a test.
- **Tests.** Vitest: the NDJSON framing, the upload and the other calls, the helpers, the tree.
  Playwright (mocked gateway): `e2e/settings-help.spec.ts`. Rig: `e2e-rig/settings-help.spec.ts`
  (read only).

## 32. The heartbeat and Decaid's sleep timer, on the rig (Y4, 2026-10-22)

Spec 3.12 'Sleep: the machine sleeps after use'. Decaid 0.8.8 (build `aab5f938`) with device
simulation; the rig serves Streamline.js **0.2.18** (Decaid updated it from 0.2.17 by itself on
2026-10-22). The rig's presence settings before: `userPresenceEnabled` true,
`sleepTimeoutMinutes` **30** (the founder's export has 15). Each probe set the timeout to 1 min
and put both values back, read back equal. Scripts and logs: `..\decaid-rig\log\y4\`
(`probe1.mjs`, `probe2.mjs` and their `.txt`). All **seen running**.

| Question | Answer on 0.8.8 |
|---|---|
| Does `POST /api/v1/machine/heartbeat` exist? | Yes: 200 `{"timeout":1800}` with 30 min, `{"timeout":60}` with 1 min |
| Does `timeout` fall between heartbeats? | Not seen: every heartbeat answered 60, also 5 s, 10 s and 2 s after the one before. The answer is the timeout after its own reset, so it cannot meter the fall; the sleep itself was timed instead |
| Does each heartbeat reset the timer? | Yes, also one 2 s after another: the machine slept 60.3 s after the last heartbeat (the 30 s Decaid waits between forwards to the DE1 does not hold back its own timer) |
| Presence off | `{"timeout":-1}`; on again, 60 |
| A heartbeat to a sleeping machine | Answers 60 and does **not** wake it (still `sleeping` 5 s and 40 s later, two heartbeats) |
| Left alone | `sleeping` 60 s after the last reset |

What starts the timer again without a heartbeat (the machine woken, one thing done 30 s later,
the sleep timed from the wake):

| Done 30 s after the wake | Slept after the wake | So |
|---|---|---|
| nothing | 59.3 s | the wake (sleeping to idle) starts the timer |
| reads: `GET` workflow, machine state, presence settings | 59.6 s | no reset |
| a workflow write (`PUT /api/v1/workflow`, the same steam values) | 59.6 s | no reset |
| `PUT /api/v1/machine/state/idle` to an idle machine | 59.5 s | no reset |
| a flush of 4 s | 94.4 s (60.4 s after its end) | reset, counted from the end |
| steam for 4 s | 94.3 s (60.3 s after its end) | reset, counted from the end |
| a shot of 6 s | 96.2 s (60.2 s after its end) | reset, counted from the end |

So Decaid counts the machine's runs and the wake, not a skin's requests: a skin that only shows
pages, edits profiles or changes settings leaves the timer running from the last shot, steam or
flush. That is what the founder saw. The probe's shot and steam records were deleted (shots 1,
steams 2 again).

**Built.** `DecaidClient.heartbeat()` (`src/api/client.ts`) returns the answer's `timeout`.
`Heartbeat` (`src/shell/heartbeat.ts`), a part of `Skin` as `Dimmer` is, takes each touch from
`App.svelte`'s one pointer handler through `Skin.touched()`: it sends at once, then nothing until
30 s after the one it sent, and nothing while `machineAsleep` (the Asleep screen and 'Machine
sleep' alike). A failure is caught and counts for the 30 s; no notice. The skin never writes the
presence settings. The heartbeat behaves as Decaid's documentation says, so section 8 has no new
question; with a timeout of 1 min the 30 s spacing can let the machine sleep up to 30 s before a
minute has passed since the last touch, which a setting of 15 min makes immaterial.

**Tests.** Vitest: `src/shell/heartbeat.test.ts` (the 30 s with fake timers, none while asleep, a
failure ignored) and the request in `src/api/client.test.ts`. Playwright (mocked gateway, which
answers the heartbeat as the rig does): `e2e/heartbeat.spec.ts`; the mock's `writes()` and the rig
helper `isWrite` (`e2e-rig/gateway.ts`) leave the heartbeat out of the tests that check a page
changed nothing. Rig: `e2e-rig/heartbeat.spec.ts` (acceptance 75: 60 and -1, three minutes of
touches every 10 s without a sleep and with heartbeats at least 29 s apart, then the sleep 50-75 s
after the last one, no heartbeat while asleep, no presence write; it skips itself when the
gateway has no heartbeat). The full rig suite: 50 of 50 (`hot-water.spec.ts` failed once on its
flow slider, 8 for 4, and passed on its own rerun; that spec is not changed by Y4).

## 33. The hot water page wrote flow 8 where 4 was typed (r22-hot-water-flake, 2026-10-23)

`e2e-rig/hot-water.spec.ts` failed once in four rig runs on 2026-10-22: hotWaterData read
flow 8 where the test typed 4, and the spec passed alone every time. Rig: Decaid 0.8.8,
Streamline 0.2.18.

The cause was the skin. Every write of a hot water value sends all four values of
`hotWaterData` (Decaid's schema requires them), built from `Skin.workflow`, the workflow Decaid
answered last. The test types the flow and lets the time slider go right after; the number
pad's confirm does not wait for its write. When the time write started before the flow
write's answer had come back, it carried the flow of the workflow before, and Decaid kept the
last write: duration 60, flow 8. The 8 is the rig's stored flow of 10, held to the DE1's 8 by
the first write (`heldHotWater`). Rig group 1 is long and loads the machine, so the answer was
slow there more often; alone it passed (4 of 4 with `--repeat-each 4` on 2026-10-23, and the
whole group passed once too). A tablet that is slow to answer, or a quick finger, meets the same.

A second race of the same kind: the workflow read on opening the page (`refreshWorkflow`), if
answered after a write, put the old values back into `Skin.workflow`, and the next write sent them.

The fix (`src/shell/skin.svelte.ts`): `setHotWater` queues its writes, so each one is built on
the answer to the one before, and `refreshWorkflow` drops a read that was answered after a hot
water write had started. `src/shell/hot-water-writes.test.ts` holds Decaid's answers back and
fails without the fix: the second write sent flow 8, just as on the rig. The test was not
changed; no wait or retry was added. The three rig groups then passed: 28, 12 and 12 of 52.
Group 1 took 9.2 minutes, close to a foreground call's 10: split it next time it grows.
