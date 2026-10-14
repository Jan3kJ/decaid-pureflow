# decaid-skin

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
| Zip | `npm run zip` | builds, then writes `release/decaid-skin-<version>.zip` with `index.html` at the ZIP's root |

`npm run dev` starts the Vite dev server on port 24800, and `npm run check` type-checks the
TypeScript and Svelte sources.

`npm run e2e` runs the Playwright tests on fixture data and a mocked gateway; `npm run e2e:rig`
runs those that need a running Decaid with device simulation (docs/research.md 8.8). The
result of the last full run is in [docs/acceptance.md](docs/acceptance.md), and how the ZIP is
installed in Decaid in [docs/install.md](docs/install.md).

The skin's version, 0.1.0 (a beta), is set in two places that a test keeps equal:
`package.json` and `public/manifest.json`. The ZIP is `release/decaid-skin-0.1.0.zip`.
