# Contributing to pureflow

Thank you for helping. pureflow is a skin for Decaid, a static web app in TypeScript and Svelte;
the [README](README.md) says what it does, and [docs/spec.md](docs/spec.md) is the product spec
with the reasons behind it. Bugs and ideas go into an issue first (the templates ask what is
needed); a change comes as a pull request against `main`.

## Build and test

Needs Node.js 22 or newer.

```sh
npm ci              # install exactly what package-lock.json says
npm run dev         # the skin on port 24800, against a Decaid on this machine
npm run verify      # every check CI runs, in its order
npm run e2e         # the browser tests on a mocked gateway (Playwright)
```

`npm run verify` runs `check` (TypeScript and Svelte), `lint` (ESLint and the font sizes),
`format:check` (Prettier), `test` (Vitest), `build`, the publish check (no local path, personal
address or token in a file), the documentation's links and pictures, and `npm audit
--audit-level=high`. CI runs the same list on every push and pull request to `main`, and beside it
the browser tests on the mocked gateway, `npm run e2e` (about 11 minutes); run them before you send
a change to the screens.
`npm run e2e:rig` runs the tests that need a running Decaid with its simulated machine and scale
(docs/research.md 8.8); they stay local. `npm run format` writes Prettier's formatting.

The design target is a tablet in landscape, 1280 x 800 CSS pixels at device scale factor 2, dark,
every layout relative to the viewport. Blue is flow, green pressure, red temperature, yellow
weight. Every font size is one of the six type-role tokens; the lint fails on any other.

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
