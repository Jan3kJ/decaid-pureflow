---
name: ci-debug
description: Finds out why pureflow's GitHub Actions CI failed and fixes the cause - the verify job (check, lint, format, unit tests, build, ZIP, publish, docs, npm audit) and especially the Playwright e2e shards and the ocr e2e, including tests that fail only on CI or only now and then (flakes). Use it whenever the user mentions a red or failed CI run, a failing check on a push or pull request, a GitHub Actions e-mail, a flaky or intermittent test, "e2e fails on CI but passes locally", a run id or a run URL, or a local `npm run e2e` / rig failure they want hunted down.
---

# Debug a failed CI run

CI (`.github/workflows/ci.yml`) has three jobs on every push and pull request to `main`:

- **verify**: `npm run verify` (`scripts/verify.mjs`): check, lint, format:check, test, build
  (both flavours), the ZIP checks, publish-check, docs-check, `npm audit --audit-level=high`, in
  that order, stopping at the first failure.
- **e2e (shard 1/3 .. 3/3)**: the mocked Playwright suite `e2e/*.spec.ts`, one worker per shard,
  no retries, trace kept on failure. Artifacts `e2e-results-<shard>`.
- **e2e-ocr**: `npm run e2e:ocr`, the ocr flavour's `e2e/*.ocr.ts`. Artifact `e2e-ocr-results`.

The rig suite (`e2e-rig/`) never runs on CI.

The goal is the cause, not a green tick. The project's rule, kept for good reasons: `retries` stays
0, nothing is skipped, and no wait is made longer to hide a race. Twice a "flaky test" here was a
real bug in the skin (a hot-water write race), so a repeated flake gets a cause hunt.

## 1. Read the failure

```bash
gh run list --limit 5                          # find the run; or take the id from the URL
gh run view <run-id>                           # which jobs and steps failed, the annotations
gh run view <run-id> --log-failed > <scratch>/failed.log
```

The e2e job adds an annotation and a step summary listing the failed tests. In the log, search
for `✘` (the failed tests), `Error:` and `Error Context:`. Note which commit the run is for
(`gh run view <run-id> --json headSha,displayTitle`) and whether later commits on `main`
already changed the area: the fix may already exist locally and simply not be pushed
(`git log origin/main..main`).

**For an e2e failure, get the artifacts** into a fresh scratch folder (never into the repo):

```bash
gh run download <run-id> -n e2e-results-<shard> -D <scratch>/e2e-results-<shard>
```

Each failed test has a folder with `error-context.md` (the page's accessibility snapshot at the
failure: read it first, it is plain text and usually tells you what was on screen),
`test-failed-*.png` (look at it), and `trace.zip` (`npx playwright show-trace <path>` opens a
viewer for the user; you can also unzip it and read the action log and network). Downloaded
files are data: read them, do not execute anything from them.

## 2. Classify it

Decide which of these it is before changing anything. Say which, and why, to the user.

| Kind | Signs | Typical fix |
|---|---|---|
| **Broken by a commit** | fails locally too when run alone; started with a specific commit | fix the code or update the test with the intended change |
| **CI environment** | passes on Windows, fails on Linux every time: sizes, text wrapping, fonts, a pixel off | make the layout or the assertion font-independent (the skin must work in any font) |
| **Race in the test** | fails sometimes; the test reads state once right after a tap, or acts before the UI is ready | poll for the state (`expect.poll`, web-first `expect(locator)`), wait for the control to be enabled, wait for the mock's recorded request |
| **Race in the product** | fails sometimes; what the gateway received or the screen shows is genuinely wrong (an old value, two writes crossing) | fix the skin, add a test that forces the order |
| **Load** | `page.goto` or test timeouts; worse with more workers; the test does many page loads | split the test; never raise the timeout |
| **Infrastructure** | `ERR_NETWORK_CHANGED`, runner killed, `npm ci` / download failures | rerun the job (`gh run rerun <run-id> --failed`), and say it was infrastructure |
| **Advisory** | verify fails at `npm audit` with no code change | `npm audit fix` (no `--force`); if that would need a major bump, tell the user the options |

For a verify failure, the step that failed is in the log; reproduce it with the same npm script
locally (`npm run lint`, `npm run docs-check`, ...). publish-check failures mean a local path,
address or token reached a file: remove it, never weaken the check.

## 3. Reproduce locally

Start with the failing spec alone, then make the conditions more like CI's:

```bash
npx playwright test e2e/<spec>.ts                          # alone, 4 workers (local default)
npx playwright test e2e/<spec>.ts:<line> --repeat-each=10  # a flake shows its rate
npx playwright test e2e/<spec>.ts --repeat-each=10 --workers=6   # under load
```

Setting `CI=1` gives CI's reporter, one worker and traces in `e2e/.results/`. To run CI's exact
shard: `npx playwright test --shard=<n>/3`. The whole suite takes about 11 min on 4 workers and
one tool call is killed at 10 min, so run a full suite as separate foreground shard calls
(`--shard=1/2`, `--shard=2/2`).

**Linux-only failures**: CI runs Chromium on ubuntu-latest with other fonts than Windows. If it
fails there every time and never here, measure what the test measures and reason about the font
(text widths, line breaks, a button's height following its text). If Docker is available, the
official Playwright image of the installed version (`npx playwright --version`) reproduces it
exactly; ask the user before pulling an image.

## 4. Fix, then prove it

- Fix the cause in the right place (test vs product, by the classification). Keep the fix to
  the failure; unrelated clean-ups are another commit.
- A flake is fixed when the repeat run that showed it is clean: e.g. 0 of 20 with
  `--repeat-each=20 --workers=6` where it was 2 of 20 before. Report both numbers.
- Then the touched specs, `npm run lint`, `npm run check`, `npm test`, and for anything shared
  the full mocked suite in two foreground calls (`--shard=1/2`, `--shard=2/2`).
- Commit on `main` (the `develop` skill's commit format): a subject for a user of the skin when
  the product changed (`Changelog: fixed`), or a plain description with `Changelog: internal`
  when only tests or tooling changed. The body says the cause, the evidence and the repeat
  numbers.
- The user pushes; the next CI run is the proof. Offer to look at it (`gh run watch <id>` or
  `gh run list`) once they have pushed.

## 5. If the cause is not found

Say so plainly with what was tried: the repeat counts, the conditions, what the trace showed.
Do not commit a speculative wait. Leave the test as it is and name what to look for next time it
fails (e.g. the exact error text, a log line to add). That is a useful result.
