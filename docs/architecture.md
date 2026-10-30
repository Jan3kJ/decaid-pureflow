# pureflow: architecture

How the skin is built, for a contributor. What it does for a user is in the [README](../README.md)
and the [guide](user/guide.md); how to send a change is in [CONTRIBUTING](../CONTRIBUTING.md).

## What the skin is

pureflow is a full skin for [Decaid](https://github.com/decentespresso/decaid), Decent's app for
the DE1 espresso machine. A skin is a static web app with `index.html` at its root. Decaid serves
it from localhost, on a port of its own that Decaid assigns from 24800 upward. The skin replaces
Decaid's default skin, Streamline, and runs on an Android tablet in landscape.

Four principles shape it:

1. **Minimal.** Every control on screen earns its place; what is rarely used goes one level down.
2. **A-Flow first.** The editor speaks A-Flow's terms (fill, infuse, pour), not raw profile steps.
3. **The machine is the truth.** A screen shows the machine's state from the snapshot streams and
   never assumes a state it did not read.
4. **Works without the machine.** Everything except a real shot runs against a mocked gateway or
   Decaid's device simulation.

## How it talks to Decaid

The skin talks to Decaid's gateway on **port 8080** of its page's own host
(`src/shell/gateway.ts`). For development against a Decaid on another machine,
`?gateway=http://host:8080` in the page's address names another gateway. The skin does not need
its own port.

- **REST** (`src/api/client.ts`): profiles, the workflow, shots, beans and grinders, settings,
  devices and the KV store, all under `/api/v1/`. A profile is loaded with `PUT /api/v1/workflow`,
  which also sets what a shot record copies. The client takes the base URL and `fetch` as
  parameters, so it runs in the browser, in Node and in tests.
- **WebSocket streams** (`src/api/stream.ts`): `/ws/v1/machine/snapshot` (about 10 frames a second
  in a shot, 2 while idle), `/ws/v1/scale/snapshot` (about 5 a second), and
  `/ws/v1/machine/shotSettings`, `/ws/v1/machine/waterLevels` and `/ws/v1/devices`. One class
  serves them all. It keeps the latest frame and reconnects after a close with a delay that
  doubles from 1 s to at most 30 s. A frame never makes it reconnect: when the gateway sends an
  error frame and closes the socket, the stream stops in the state `failed`.

Rules every skin keeps (from Decaid's `doc/Skins.md`):

- state is kept in `localStorage` or Decaid's KV store, never `sessionStorage`, which is cleared
  when the WebView unloads;
- the skin never uses ports 3000, 4001 or 8080;
- `public/manifest.json` holds the id (`pureflow`, one safe path component), the name, the
  description, the version, the author and the repository.

## Stack

- TypeScript and Vite, with a static build to `dist/` and relative asset paths (`base: './'` in
  `vite.config.ts`).
- Svelte 5. Its compiled components keep the bundle small, and a value in the markup follows its
  state by itself, which suits a screen driven by live streams.
- The graphs are SVG drawn by the skin's own components; there is no chart library.
- Vitest for unit tests, Playwright for the browser tests.
- Prettier (with `prettier-plugin-svelte`) and ESLint (`typescript-eslint`'s type-checked
  recommended rules, `eslint-plugin-svelte`, `eslint-config-prettier`).
- The only runtime dependency is Svelte. Every package is free, open source and needs no account.

## The source tree

`src/main.ts` runs `src/migrate.ts` first, then mounts `src/App.svelte`, which shows one screen at
a time. One folder per part:

| Folder | What it holds |
|---|---|
| `src/aflow/` | A-Flow 3.0: the parameters, the generator, its inverse (the reader), the codec, the validation and the default profiles. Pure, no UI and no network |
| `src/api/` | The gateway's REST client, its snapshot streams and their types. Plain TypeScript, no Svelte |
| `src/beans/` | The bean and grinder catalogue, their forms, the pick for the next shot, and a bean's photo of its bag in the KV store |
| `src/editor/` | The A-Flow editor: the graph that is the editor, its chips and number pad, the step list, routing to the right editor, save, and the unsaved-edits warning |
| `src/graph/` | The shot graph and its axes |
| `src/history/` | The shot history overlay and the shots read from Decaid for the session |
| `src/hotwater/` | The hot water page; its values are the workflow's `hotWaterData` |
| `src/settings-page/` | The settings page: Decaid's and the machine's settings, ported from Streamline, and the skin's own category |
| `src/shell/` | The skin's live state (`skin.svelte.ts`) and its parts: the streams, home and the shot view, the profile picker, the corner menu, the pages and swipes, sleep and wake |
| `src/steam/` | The steam page, its graph, and the steam timer set from the milk's weight |
| `src/steps/` | The step editor for profiles that are not A-Flow, ported from Streamline, and the modelled shot behind the picker's estimate |

The files at the top of `src/` hold the skin's settings (`settings.ts`) and their backup
(`settings-backup.ts`), the font and line sizes (`display.ts`), the keyboard's effect on the
viewport (`viewport.ts`), the move of keys from the skin's former name (`former-name.ts`,
`former-keys.ts`, `migrate.ts`) and the repository's own tests (licence headers, manifest, docs,
publish and release checks).

## The A-Flow generator

`src/aflow/generator.ts` turns A-Flow 3.0 parameters into a Decaid v2 profile (`generateProfile`).
The steps, in order, are Pre Fill (only with the first-step workaround on), Fill, Infuse, 2nd Fill
and Pause (only when the pause lasts longer than 0 s), Pressure Up, Flow Start (only when the ramp
is shorter than 1 s) and Flow Extraction. A step that is off is left out. It does not validate:
`validate.ts` does. `reader.ts` is its inverse: it reads A-Flow parameters back from a profile's
steps, both those the generator writes and those of the older de1app plugin. The format, the
phases and the ranges are in [A-Flow 3.0](a-flow-3.0.md).

A profile's A-Flow parameters are stored in its record's `metadata` (`src/editor/storage.ts`, the
one place that knows it). The workflow's copy of a profile carries them in its `notes`, so the
profile on the machine can be read from Decaid alone.

## The editors

`src/editor/route.ts` decides which editor a profile opens in. A profile is A-Flow when the reader
can read its steps; a title or a tag does not decide. Every other profile opens in the step editor.

- **The A-Flow editor** (`src/editor/`): the graph is the editor. A dragged line changes a flow,
  pressure or temperature, a dragged border a time, and a tapped chip opens the number pad. Save
  sends the generator's profile with its parameters.
- **The step editor** (`src/steps/`): the profile's steps as cards. `model.ts` holds pure
  operations on a v2 profile that keep every field the editor does not show.

## Settings and their backup

The skin's own settings are one object under one `localStorage` key, `pureflow.settings`
(`src/settings.ts`). The skin holds one copy, the settings page changes it, and every screen
reads it there. A copy goes to Decaid's KV store as `pureflow/settings-backup`, 1.5 s after the
last change (`src/settings-backup.ts`). A start without settings reads the backup back, so the
settings survive a new port or a cleared app.

## Build and ZIP

`npm run build` writes the static skin to `dist/`, with `index.html` and `manifest.json` at its
root, and the ocr flavour to `dist-ocr/` (below). `npm run zip` builds, checks what Decaid needs of
a skin's ZIP (`index.html` at the root, relative asset paths, a safe id) and writes
`release/pureflow-<version>.zip` and `release/pureflow-<version>-ocr.zip`. The version is set in
`package.json` and `public/manifest.json`, and `src/manifest.test.ts` keeps the two equal. The
same ZIP runs in Decaid on Android, Windows, Linux and macOS. How a user installs it is in
[Install](user/install.md).

### Two builds

One source makes two flavours, chosen at build time (`scripts/flavours.mjs`): **base**, the skin,
and **ocr**, the same skin that also reads the bean bag's photo. The build constant `__OCR__`
(Vite's `define`, declared in `src/env.d.ts`) is true only in `vite build --mode ocr`; the code
that uses the reader sits behind `if (__OCR__) { await import('./read') }`
(`src/beans/reading.ts`), so the base build leaves out the reader and all it imports.
`npm run build:base` and `npm run build:ocr` build one; `npm run dev` serves the base flavour and
`npm run dev:ocr` the ocr one. The ocr build needs the two model archives of PP-OCRv6 tiny:
`scripts/fetch-ocr-models.mjs` downloads them once into the git-ignored `.cache/ocr/`, checks each
against the SHA-256 pinned in the script and stops the build with a message on a wrong hash or with
no network and no cache; the build copies them into `dist-ocr/ocr/`, adds ' With bag reading.' to
the manifest's description and writes a copy of `NOTICE` with the models' licence. The base build
never needs them, and no model is committed. Both ZIPs have the same id and version, so installing
one replaces the other. Besides Decaid's needs, `scripts/zip.mjs` checks that the base ZIP has no
`ocr/` folder, no `.onnx` or `.wasm` file, no reader chunk and no `paddleocr` or `onnxruntime` in
its scripts and is under 1 MB, and that the ocr ZIP has the reader, both models with their pinned
hash, ONNX Runtime's WASM and the licences and is under 16 MB; `npm run verify` runs these checks with
`node scripts/zip.mjs --check`, which writes nothing. The browser tests of `npm run e2e` run the
base flavour; `npm run e2e:ocr` (`playwright.ocr.config.ts`, the specs `e2e/*.ocr.ts`) builds and
serves the ocr flavour.

**The reading** (ocr flavour only). `src/beans/read.ts` makes the reader on the first photo and
keeps it: PaddleOCR.js (`@paddleocr/paddleocr-js`, a devDependency bundled only into the ocr
build) with the PP-OCRv6 tiny detector and recogniser from the skin's `ocr/` folder, on ONNX
Runtime's WASM build (the ocr build aliases `onnxruntime-web` to `onnxruntime-web/wasm`, one
thread, no proxy: the skin's page is not cross-origin isolated) and OpenCV.js. The SDK's own
worker is left out of the build (`noOcrWorker` in `vite.config.ts`). The stored photo is drawn
on a canvas and read upright; when nothing is read it is turned by 270 degrees and read again.
Nothing is fetched from another host. `src/beans/fields.ts` (pure) orders the lines as chips:
the guessed name first (the tallest line by its letters' height, leaving out a small line right
under a taller one, tasting lines and countries), the guessed roaster second (a roaster of the
catalogue, else the line next to a 'Coffee Roasters' line, else the line right above the name,
else right below), title case for lines in capitals or small letters. The bean form shows
'Reading the bag' with **cancel**, then the chips under the photo with the choice **name** or
**roaster**; a tap puts the chip in the chosen field and moves the choice to the other one.
Nothing is filled in by itself. `NOTICE`'s copy in the ocr ZIP names the models and the bundled
packages (Apache-2.0, MIT, Boost); `src/licence.test.ts` checks each package's licence against
that list, and `scripts/zip.mjs` that the ocr ZIP holds ONNX Runtime's `.wasm`.

## The release script

`npm run release` (`scripts/release.mjs`, its pure parts in `scripts/release-lib.mjs`) is the only
way a release is made. In order, it stops at the first gate that fails:

1. the tree is clean, the branch is `main`, a tag `vX.Y.Z` exists; without `--local` also not
   behind `origin/main` and `gh` logged in;
2. the rig answers on port 8080, unless `--no-rig` is given;
3. every commit since the last tag has a `Changelog:` trailer with a known kind, or an entry in
   `.release-notes.json`, and at least one is not `internal`;
4. the version, from the trailers (major with `Breaking: yes`, minor with an `added` or `changed`
   entry, else patch), or from `--bump` or `--version`, behind a typed yes;
5. `npm run verify`, `npm run e2e` and the rig suite in its groups;
6. the files: both versions, the `CHANGELOG.md` section, the two ZIPs and
   `release/SHA256SUMS.txt` with a line for each;
7. the local commit and the tag;
8. the push and the GitHub release with both ZIPs, behind a second yes; the release notes say which
   ZIP is which, and both are downloaded again and compared with the local files.

`--dry-run` runs the checks and prints what it would write. `--local` stops after the tag and
never calls GitHub. `--resume` continues at the publish step when the tag exists.

The trailers (`Task:`, `Changelog:`, `Breaking:`) are read from the last two paragraphs of a
commit message, so a `Co-Authored-By` line may follow them. `Changelog:` is one of `added`,
`changed`, `fixed` or `internal`; `internal` is left out of the release notes. The commit messages
are described in [CONTRIBUTING](../CONTRIBUTING.md#commit-messages).

## How to test

| Command | What it checks |
|---|---|
| `npm test` | the Vitest unit tests, `src/**/*.test.ts`; the generator, the client and every pure module have theirs |
| `npm run check` | svelte-check over the TypeScript and Svelte sources |
| `npm run lint` | ESLint, then `scripts/font-sizes.mjs`: every font size in `src` is one of the six type-role tokens (`--text-label` to `--text-big` in `src/app.css`); then `scripts/spacing.mjs`: every `gap` is one of the four spacing tokens (`--space-1` to `--space-4`, 0.3 to 2.4 rem) |
| `npm run format:check` | Prettier, without writing |
| `npm run e2e` | the Playwright tests of `e2e/` on the dev server (`npm run dev`, port 24800), with a mocked gateway (`e2e/mock-gateway.ts`) instead of Decaid; about 11 minutes on one machine, CI runs it in 3 shards |
| `npm run e2e:ocr` | the Playwright tests of `e2e/*.ocr.ts` on the ocr flavour, built and served by `vite preview --mode ocr` on port 24800, with the mocked gateway |
| `npm run e2e:rig` | the tests of `e2e-rig/` against a running Decaid with its simulated machine and scale; they skip themselves when no gateway answers |
| `npm run publish-check` | no Windows path, personal e-mail address, real MAC address or token in a tracked file or in the builds `dist/` and `dist-ocr/`; `--history` reads every commit too |
| `npm run docs-check` | every link and image of the README, CONTRIBUTING, CHANGELOG, SECURITY, this file and `docs/user/` resolves |
| `npm run verify` | check, lint, format, test, build (both flavours), the checks of both ZIPs (`node scripts/zip.mjs --check`), the publish and docs checks and `npm audit --audit-level=high`, in that order; CI runs it on every push and pull request to `main`, and the mocked e2e and the ocr flavour's e2e beside it |

The browser tests run on the design target: 1280 x 800 CSS pixels at device scale factor 2,
landscape, dark, with touch.

### The rig

The rig is Decaid's prebuilt release (0.8.8) with its device simulation; it needs no source
build. Start it with `--bypass-onboarding` on its first start. Switch the simulation on once
(it is stored), then scan:

```sh
curl -X POST -H "Content-Type: application/json" -d '{"simulatedDevices":["machine","scale"]}' http://localhost:8080/api/v1/settings
curl http://localhost:8080/api/v1/devices/scan
```

On later starts Decaid connects the simulated machine and scale by itself.
`GET /api/v1/machine/state` answering `idle` shows it is ready. A simulated shot runs from start
to end. Two limits: simulated steam does not end by itself, and the simulated scale's weight
cannot be set.

## Constraints

- Tests run without a machine. What needs a real DE1 is checked by hand on the machine and never
  blocks a change.
- Only free, open-source packages that need no account. No new runtime dependency without asking
  first in an issue.
- No external service beyond GitHub and Decaid's local gateway.
- The skin never uses ports 3000, 4001 or 8080; the dev server uses 24800.
- Nothing private in a file: no local path, e-mail address, real device address or token.
- Every layout is relative to the viewport, and every font size is one of the six type-role
  tokens. Blue is flow, green pressure, red temperature, yellow weight.
