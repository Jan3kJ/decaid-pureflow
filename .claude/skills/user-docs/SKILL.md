---
name: user-docs
description: Brings pureflow's user documentation (docs/user/guide.md, install.md, troubleshooting.md, the README's pictures) up to date with the skin - finds what changed since the docs were last checked, rewrites the affected text in the docs' plain style, retakes only the pictures whose screens changed with `npm run screenshots`, and checks the links. Use it whenever the user asks to update, refresh, check or proofread the user guide, docs, README or screenshots, to document a change for users, before a release when visible things changed, or says "the pictures are out of date" or "does the guide still match".
---

# Update the user documentation

The user docs are three pages for people using the skin on their tablet, linked from the README:

- `docs/user/install.md`: getting the skin into Decaid, updates, settings kept.
- `docs/user/guide.md`: only what is the skin's own and not obvious (the swipe back, the hidden
  history, the editor, the steam timer, ...). It deliberately does not explain the DE1 or
  Decaid; it links Decent's documentation for those.
- `docs/user/troubleshooting.md`: one section per thing that goes wrong, what you see and what
  to do.

Pictures live in `docs/user/img/` (eight of them, also used by the README). They are made, not
taken by hand: `e2e/user-docs.shots.ts` sets up the mocked gateway with invented beans and
roasters and two real recorded curves, and `npm run screenshots` runs it and checks that exactly
the planned eight exist. `docs/architecture.md` is for contributors, not users: keep it true when
behaviour changes (the `develop` skill does), but it is not this skill's audience.

## 1. Find what is out of date

Each page says which version it was checked against ("Checked against pureflow X.Y.Z."). Start
from there:

```bash
git log --no-merges --format='%h %s' v<that version>..HEAD
```

The commits whose trailer is `Changelog: added`, `changed` or `fixed` are what a user can notice;
`internal` ones rarely matter here. For each, decide: does any page describe this screen or
behaviour (`grep -n` the page for the screen's words), and is it now wrong, incomplete, or new
and not obvious enough to need a line? Also check the opposite direction: read each page and
look for statements about controls, words or steps that no longer exist (`grep` the UI word in
`src/`). Button words in the docs match the skin's exactly (the skin's are lower case).

Write up the list for the user before editing: per page, what is wrong and what you would write;
per picture, whether its screen changed. Ask about anything where you are unsure the change is
visible enough to document. A small list is a fine result.

## 2. Write in the docs' style

Read a whole page before changing it, and match it:

- Short, concrete sentences in plain English, addressed to the user ("Swipe from left to right").
  What they see and do, not how it is built: no component names, tokens or API paths.
- Only what is the skin's own and not obvious. If something works the way anyone would expect,
  leave it out; the docs are short on purpose.
- Names of buttons and screens in **bold** where the page already does so, and spelled as the
  skin shows them.
- Each picture has alt text that says what is on it, as a sentence ("Home during a shot: flow,
  pressure, ... drawn").
- Change the "Checked against pureflow X.Y.Z." line only on pages you actually checked whole,
  to the version that is about to ship (`package.json`'s, or the next one the release would
  make: `node .claude/skills/release/scripts/preview.mjs`). Ask if unsure.

## 3. Retake only the pictures that changed

```bash
npm run screenshots
```

It takes a minute or two and rewrites all eight. Every retake differs by a few pixels even when
nothing changed, so look at each picture whose screen your list says did not change and put it
back (`git checkout -- docs/user/img/<name>.png`): an unchanged screen keeps its old file, which
keeps the history and the repository small. Look at every picture you keep (open it with the
Read tool) to check it shows what its alt text says.

If a picture needs a different state (a new screen, a different moment), change its test in
`e2e/user-docs.shots.ts` and keep its rule: every name in a picture is invented (no real bean,
roaster, device or address). A new picture also goes into `PLANNED` in `scripts/screenshots.mjs`;
adding one is a choice to ask the user about, since the set is kept small on purpose.

## 4. Check and commit

```bash
npm run docs-check      # every link and picture of README, CONTRIBUTING, docs/user resolves
npm run format          # Prettier formats the Markdown too
npm run publish-check
```

`git status --short` should show only the pages and the pictures you meant to change. Commit on
`main`, with `Changelog: internal` (doc changes stay out of the release notes) and a body saying
which pictures were retaken, which kept, and what text changed. Show the user the retaken
pictures and the gist of the text changes; they push.
