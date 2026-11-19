---
name: develop
description: Builds one change to the pureflow skin (a feature, a fix, a look or wording change, a refactor) from request to a finished commit on main, with its test, the project's checks and a commit message the release notes are built from. Use it whenever the user asks to add, change, fix, move, rename, restyle or remove anything in the skin, even a small one ("make the stop button bigger", "the steam timer forgets its time", "add a reset to the editor"), and for test-only or tooling changes in this repository.
---

# Develop a change

pureflow is a skin for Decaid (a static web app: TypeScript, Vite, Svelte 5, Vitest, Playwright).
It is mature: most requests are small and should stay small. One request is one commit on `main`;
the user pushes. Never push, tag or touch a release yourself.

## 1. Understand before editing

- Read `git status --short` and `git log --oneline -10`. If the tree is not clean, ask what the
  changes are before mixing them into yours (and never `git stash`: the user keeps work there).
- Read the part of `docs/architecture.md` that covers the area, then the code. It is the current
  state of the design and is kept true, so it is cheaper than reverse-engineering the code.
- If the request leaves a real choice open (what a word says, where a control sits, whether a
  behaviour changes elsewhere too), ask once, briefly, with your proposed default. For anything
  the user would not care about, take the simplest option that fits the existing design and
  mention it at the end.

## 2. Build it the project's way

The lint enforces most of the design rules, and fighting it costs more than following them:

- Design target: 1280 x 800 CSS px at device scale factor 2, landscape, dark glass, every layout
  relative to the viewport. Blue is flow, green pressure, red temperature, yellow weight.
- Every font size is one of the six type-role tokens, every gap one of the four spacing tokens,
  and every corner, shadow, layer, colour, motion and control height a token of `src/app.css`.
  Need a new value? Add a token with a meaning, not a literal.
- One design everywhere: fix the shared component or rule rather than giving one page its own
  look. Reuse the shared parts (Dialog, the controls' classes, the settings row, the glass tokens).
- Button words are lower case. `backdrop-filter` only on overlays (it doubles the frame time on
  panels).
- Code only the ocr flavour needs goes behind `if (__OCR__)` with a dynamic `import()`.
- No new runtime dependency (ask first); dev tools only if free, open source and account-free.
- The repository is public: no local path, e-mail address, device address or token in any file.
  Code comments state the rule or the reason, not who asked or when.
- The skin never uses ports 3000, 4001 or 8080.
- When a file, word or selector changes, change the tests, docs and strings that name it in the
  same commit (`grep` for the old name). If a screen's behaviour changes in a way the user guide
  (`docs/user/`) or `docs/architecture.md` describes, update that text too.

## 3. The test comes with the change

- Logic: a Vitest test beside the code (`*.test.ts`).
- What a screen shows or does: a Playwright spec in `e2e/` on the mocked gateway
  (`e2e/mock-gateway.ts`). Look at a neighbouring spec first and copy its setup.
- A bug fix gets a test that fails without the fix: run it before the fix to see it fail.
- Write waits that cannot race: poll for the state you read (`expect.poll`, `toHaveText`, the
  mock's recorded requests) rather than reading once right after a tap; wait for controls to be
  enabled before driving the machine. Never add retries, skips or longer fixed timeouts.
- Rig specs (`e2e-rig/`, against a real Decaid with simulated machine and scale) only need
  changing if your change touches a control, selector or text one of them drives
  (`grep -rn "<selector or text>" e2e-rig`). If so, update them and tell the user they need a rig
  run; offer to run it if a Decaid answers on `http://localhost:8080/api/v1/machine/state`.

## 4. Check

Run in the foreground, cheapest first, and fix before moving on:

```bash
npm run format          # writes Prettier's formatting
npm run lint
npm run check
npm test
npx playwright test e2e/<the specs you touched or that cover the area>
```

Then the full gate. A single tool call is killed at 10 minutes and the mocked suite takes about
11, so split it:

```bash
npm run verify
npx playwright test --shard=1/2
npx playwright test --shard=2/2
```

A failure in a spec you did not touch: run that spec alone once. If it passes alone, it is a
flake; say so in the commit and to the user, do not retry it into green. If it fails alone,
your change probably broke it: find out why. (The `ci-debug` skill has the flake playbook.)

If the change is visible, take a screenshot of the affected screen in the touched spec or a
quick Playwright script in a scratch folder, look at it, and show it to the user. The e2e run
may rewrite pictures under `docs/`; restore any that your change did not mean to change
(`git checkout -- docs/user/img` etc.).

## 5. Commit

`git status --short` must show only your change. Stage explicitly (no `git add -A` of stray
files), then commit on `main`. The release script turns commit messages into the CHANGELOG, so:

```text
The steam timer keeps its time when the milk's weight changes during a countdown

What changed and why, for a reviewer: the cause, the choice made where something was open,
what was checked (unit, which e2e, full shards, rig or not and why).

Changelog: fixed
Co-Authored-By: <the attribution line this session uses>
```

- Subject: written for someone using the skin on the tablet, what they will notice, not how it
  was done. No task id or prefix needed. It becomes the CHANGELOG line, so it is a sentence.
- The last paragraph holds the trailers with no blank line inside: `Changelog: added | changed |
  fixed | internal` (internal = tests, tooling, refactoring; left out of the release notes),
  `Breaking: yes` only when the change needs a major version (ask the user first), and the
  co-author line directly after. Leave out `Task:`.
- Pick the kind honestly: `added` a new capability, `changed` a different behaviour or look,
  `fixed` something that was wrong. Kind decides the next version (added/changed bump the minor).

## 6. Report

Tell the user in a few lines: what changed for them, what was checked and its result, anything
not run (rig, a real tablet), choices you made that they may want to revisit. Mention that `main`
is ahead of `origin/main` and is theirs to push; offer the `release` skill if they want to ship.
