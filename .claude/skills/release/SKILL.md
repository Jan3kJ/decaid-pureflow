---
name: release
description: Prepares and walks the user through a pureflow release with `npm run release` - checks the tree, CI and rig, previews the version and CHANGELOG from the commit trailers, repairs missing or duplicate entries via .release-notes.json, runs the release in the user's terminal (it needs typed yeses), and checks the published result. Use it whenever the user wants to release, ship, publish, cut or tag a version, make a hand-over or test ZIP, asks "what would the next version be", "what goes into the next release", or a release run stopped and needs resuming.
---

# Release pureflow

`npm run release` (`scripts/release.mjs`, described in `docs/architecture.md` > "The release
script") is the only way a release is made. It is careful and complete: it checks the tree, reads
the commits' `Changelog:` trailers, picks the version, runs every check (npm ci, verify, the mocked
e2e, the rig suite in four groups), writes versions, CHANGELOG and ZIPs, commits and tags, and
publishes behind a second yes. Your job is to make sure it will not stop halfway, to show the user
what it will release, and to run it where the user can answer it.

Two facts shape everything below:
- **The yeses are typed** on the terminal (`there is no --yes`). A command run through your Bash
  tool has a closed stdin, which the script reads as "no". So the release itself runs in the
  user's Terminal panel (or their own terminal), not in your Bash tool.
- **It takes 30 minutes or more** (e2e about 11 min, rig about 15 min, verify, build). That is
  far past the 10-minute limit of one foreground tool call, another reason it runs in a terminal.

## 1. Preflight (you, read-only)

Run these and collect every problem before saying anything:

```bash
git status --short                 # must be empty (untracked files count)
git rev-parse --abbrev-ref HEAD    # must be main
git fetch origin && git status -sb # must not be behind origin/main
gh auth status                     # must be logged in (not needed for --local)
node .claude/skills/release/scripts/preview.mjs
```

`preview.mjs` uses the release script's own functions and prints each commit since the last tag
with its kind, any commit the release would stop on, the version and the CHANGELOG section,
without running a check. Read the section as a user of the skin would:

- **Missing or invalid trailer**: the release stops. Propose an entry for each in
  `.release-notes.json` (`{ "<short hash>": "internal" }` or `{ "<short hash>": { "kind":
  "fixed", "text": "..." } }`), based on what the commit does (`git show --stat <hash>`).
- **Duplicates**: one change committed twice with the same subject (a fix-up, a re-commit)
  shows twice. Mark the later one `"internal"` in `.release-notes.json`.
- **A subject that reads badly** (how instead of what, jargon, a typo): pushed commits are not
  rewritten; give the entry a better `text` in `.release-notes.json`.
- **The version**: the trailers decide it (Breaking -> major, added/changed -> minor, only fixed
  -> patch). Never make a major release without the user saying so; `--bump` or `--version`
  overrides when they want something else.

`.release-notes.json` is tracked, so a change to it is committed before the release starts (the
release needs a clean tree): subject "Release notes for <version>", trailer `Changelog: internal`.
Show the user the proposed entries before committing them.

**CI**: `gh run list --branch main --limit 3`. If the newest run for what is pushed failed, find
out why first (the `ci-debug` skill): the release runs the same e2e locally and would stop there
too, half an hour in. Unpushed commits have no CI yet; the release's own checks cover them.

**The rig**: `curl -s http://localhost:8080/api/v1/machine/state` (or `PUREFLOW_RIG_URL`).
If no Decaid answers, the release stops at once. Ask the user to start the rig (the simulated
Decaid, `docs/architecture.md` > "The rig"), or to release with `--no-rig` when nothing since the
last tag touches what the rig specs drive (the CHANGELOG's checks line then says the rig was not
run). Check that with `git diff v<last>..HEAD --stat` against `e2e-rig/`'s selectors if unsure.

Then tell the user in one short block: the version, the CHANGELOG section, any repairs you made or
propose, whether the rig is up, and the command you are about to start. Ask for their go.

## 2. Run it in a terminal the user can answer

The usual forms:

| Goal | Command |
|---|---|
| Draft release on GitHub (default; the user publishes it on GitHub) | `npm run release` |
| Public release at once | `npm run release -- --publish` |
| ZIPs and tag only, nothing on GitHub (a hand-over or test build) | `npm run release -- --local` |
| Everything but writing, to see that the checks pass | `npm run release -- --dry-run` |
| Continue at the publish step after a stop or a "no" there | `npm run release -- --resume` |
| No rig | add `--no-rig` |

If a Terminal-panel tool is available (`run_in_terminal`), start the command there and link the
tab; otherwise give the user the command in a `bash` block to run in their own terminal, from the
repository's root. Tell them what they will be asked: "Release X.Y.Z with these entries?" (and a
major-release question first if it is major), then after all checks "Publish X.Y.Z: push main and
vX.Y.Z ...?". Only `yes` counts.

While it runs you can follow it with `read_terminal` (with `wait_for_output_ms`) instead of
asking. Do not start other commands in this repository meanwhile: the e2e and rig runs use port
24800 and the release needs the tree unchanged.

## 3. When it stops

Every stop prints what is wrong and the one line that fixes it. Before the files are written
(steps 1-5) nothing has changed: fix the cause and start again. Typical ones:

- **A check failed** (`'npm run e2e' failed; nothing has been written`): read which test, run that
  spec alone (`npx playwright test e2e/<spec>`). Flake or real failure: see the `ci-debug` skill.
  A rig spec failing: run its group again alone first; the rig is slower and noisier.
- **After the tag, before publish** (a "no" at the publish question, a failed push or upload):
  the tag and commit are local. `npm run release -- --resume` continues at the publish step. To
  throw the release away instead: `git tag -d vX.Y.Z && git reset --hard HEAD~1` - ask the user
  first, it discards the release commit.

## 4. After it

- Check the result: `gh release view vX.Y.Z` (draft or not, three assets: `pureflow.zip`,
  `pureflow-ocr.zip`, `SHA256SUMS.txt`) and `git log --oneline -2` (the `Release X.Y.Z` commit).
- With a draft, remind the user to publish it on GitHub when they are happy.
- `.release-notes.json` entries for released commits can stay: they only match their own hashes.
- The script prints what it leaves to people (installing from the release URL in Decaid,
  reading the user pages on the tablet). Pass those on, briefly.
- To try a build on the tablet before publishing: `npm run release -- --local` (or `npm run
  zip`), then `npm run serve-release` and Settings > Skin > Developer on the tablet
  (CONTRIBUTING.md > "Testing a build on the tablet").
