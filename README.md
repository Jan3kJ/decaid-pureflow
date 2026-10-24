# decaid-pureflow

A minimal skin for [Decaid](https://github.com/decentespresso/decaid), Decent's companion app
for the DE1 espresso machine, built around an editor for A-Flow profiles. The product spec is
in [docs/spec.md](docs/spec.md).

## Development

Needs Node.js 22 or newer. The stack is TypeScript, Vite, Svelte and Vitest.

| Step | Command | Result |
|---|---|---|
| Install | `npm install` | the packages in `node_modules/` |
| Test | `npm test` | runs the Vitest tests once |
| Build | `npm run build` | the static skin in `dist/`, with `index.html` and `manifest.json` at its root |
| Zip | `npm run zip` | builds, then writes `release/pureflow-<version>.zip` with `index.html` at the ZIP's root |

`npm run dev` starts the Vite dev server on port 24800, and `npm run check` type-checks the
TypeScript and Svelte sources.

`npm run e2e` runs the Playwright tests on fixture data and a mocked gateway; `npm run e2e:rig`
runs those that need a running Decaid with device simulation (docs/research.md 8.8). The
result of the last full run is in [docs/acceptance.md](docs/acceptance.md), and how the ZIP is
installed in Decaid in [docs/install.md](docs/install.md).

The skin's version, 0.6.0 (a beta), is set in two places that a test keeps equal:
`package.json` and `public/manifest.json`. The ZIP is `release/pureflow-0.6.0.zip`.

## Credits

The step editor (`src/steps/`), the settings page (`src/settings-page/`) and the shot's
per-phase table (`src/shell/phases.ts`) are ported from
[Streamline.js](https://github.com/decentespresso/streamline-js) v0.2.14, "A browser-native
skin for Decent Espresso machines", Copyright (C) 2025-2026 Decent Espresso, licensed under
the GNU General Public License v3.0 or later; it is used here under GPL-3.0. Each ported file
carries that notice. `src/steps/fixtures/bundled-profiles.json` holds the 73 profiles Decaid
0.8.8 bundles (GPL-3.0), with their numbers as numbers, as test data.
