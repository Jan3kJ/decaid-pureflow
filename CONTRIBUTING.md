# Contributing to pureflow

Thank you for helping. pureflow is a skin for Decaid, a static web app in TypeScript and Svelte;
the [README](README.md) says what it does, and [docs/architecture.md](docs/architecture.md) says how it
is built. Bugs and ideas go into an issue first (the templates ask what is
needed); a change comes as a pull request against `main`.

## Build and test

Needs Node.js 22 or newer.

```sh
npm ci              # install exactly what package-lock.json says
npm run dev         # the skin on port 24800, against a Decaid on this machine
npm run verify      # every check CI runs, in its order
npm run e2e         # the browser tests on a mocked gateway (Playwright)
```

The skin has two flavours of one source ([Two builds](docs/architecture.md#two-builds)): base, and
ocr, which also reads the bean bag. `npm run build` builds both (`dist/`, `dist-ocr/`),
`npm run build:base` and `npm run build:ocr` one; `npm run dev:ocr` serves the ocr flavour;
`npm run zip` writes both ZIPs into `release/`; `npm run e2e:ocr` runs the ocr flavour's browser
tests. The ocr build downloads its two models once (`npm run fetch-ocr-models`,
`scripts/fetch-ocr-models.mjs`) into `.cache/ocr/` and checks their SHA-256; no model is committed.
Code only the ocr flavour needs goes behind `if (__OCR__)` with a dynamic `import()`, so that the
base build leaves it out.

`npm run verify` runs `check` (TypeScript and Svelte), `lint` (ESLint and the font sizes),
`format:check` (Prettier), `test` (Vitest), `build` (both flavours), the checks of both ZIPs, the publish check (no local path, personal
address or token in a file), the documentation's links and pictures, and `npm audit
--audit-level=high`. CI runs the same list on every push and pull request to `main`, and beside it
the browser tests on the mocked gateway, `npm run e2e` (about 11 minutes on one machine; CI runs it in 3 shards); run them before you send
a change to the screens. When CI's browser tests fail, `gh run view <run id> --log-failed` shows
each failed test's error; the run's artifacts `e2e-results-1` to `-3` (one for each shard) have its trace (`npx playwright
show-trace trace.zip`) and picture.
`npm run e2e:rig` runs the tests that need a running Decaid with its simulated machine and scale
([the rig](docs/architecture.md#the-rig)); they stay local. `npm run format` writes Prettier's formatting.

The design target is a tablet in landscape, 1280 x 800 CSS pixels at device scale factor 2, dark,
every layout relative to the viewport. Blue is flow, green pressure, red temperature, yellow
weight. Every font size is one of the six type-role tokens; the lint fails on any other.

## Testing a build on the tablet

A build can be installed on the tablet from the PC before it is published; Decaid's GitHub install
reads only published releases.

1. `npm run release -- --local` (or `npm run zip`) writes the two ZIPs into `release/`.
2. `npm run serve-release` (`scripts/serve-release.mjs`, Node only) serves `release/` read only
   on port 24810 of every network interface (`--port`, `--dir` choose others) and prints the
   PC's addresses. Windows asks once whether Node may accept connections on the network: allow
   it for private networks, or port 24810 stays closed to the tablet.
3. On the tablet, in the same Wi-Fi: Settings > 6. Skin > Backup and version > **developer
   options** on. Skin > **Developer** shows; type the PC's address (the port is 24810 unless
   you type another), tap **list**, tap a ZIP and **install**. Decaid downloads and installs it;
   when it is the skin Decaid serves, the page opens it again at the new version.

Python's server works too, `python -m http.server 24810 --directory release`, but it sends no
CORS header, so the page cannot read its list: the skin then offers the file's name to type,
filled with this version's ZIP, and Decaid downloads it as before.

Decaid keeps the server's address as the skin's source, so its update check looks there (and
skips the skin while the server is stopped). Install from GitHub Release to go back. App Store
builds of Decaid refuse an install from a URL.

## The rules of a change

- **One pull request, one change.** A fix and an unrelated clean-up are two pull requests.
- **A change comes with its test.** A unit test next to the code (`*.test.ts`) for logic, a
  Playwright test in `e2e/` for what a screen shows or does. A bug fix gets a test that failed
  before it.
- **No new runtime dependency** without asking first in an issue: the skin ships only Svelte's
  runtime. Only free, open-source packages that need no account.
- **Nothing private in a file**: no local path, e-mail address, real device address or token
  (`npm run publish-check`).

## Commit messages

The release notes are made from the commits (`scripts/release.mjs`), so each commit's subject is
written **for a user of the skin**: what changed for them, not how. The message ends with one
paragraph of trailers, with no blank line inside it:

```text
The steam timer keeps its time when the milk's weight changes during a countdown

Why and how, for the reviewer.

Changelog: fixed
```

- `Changelog: added | changed | fixed | internal` is required. `internal` (tests, tooling,
  refactoring) is left out of the release notes.
- `Breaking: yes` marks a change that needs a major version; the release asks before it makes one.
- `Task: <ref>` names the roadmap task. The maintainers' team writes it; a pull request leaves
  it out.

## Code from other projects

pureflow is licensed under GPL-3.0-only ([LICENSE](LICENSE)). Code may be taken from a work under
a compatible licence, such as Streamline.js (GPL-3.0-or-later). A file that takes code,
constants, wording or layout from another work starts with its notice: the project and its URL,
the tag, the files it comes from, the copyright line and the licence, for example

```ts
// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
// src/modules/waterTank.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
```

(in a `.svelte` file as an HTML comment above `<script>`), and the file is listed in
[NOTICE](NOTICE). A test (`src/licence.test.ts`) checks that the headers and NOTICE agree. By
sending a pull request you agree that your change is licensed under GPL-3.0-only.
