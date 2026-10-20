<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DEFAULT_AUTHOR,
    DEFAULT_PROFILES,
    hasSecondFill,
    machineLimits,
    paramRanges,
    resolveParams,
    serializeParams,
    type AFlowParams,
  } from '../aflow';
  import type { ProfileRecord } from '../api';
  import { defaultProfile, sameProfile } from '../shell/profiles';
  import type { Skin } from '../shell/skin.svelte';
  import { PHASE_LABEL, type EditField, type PhaseId } from './curve';
  import { dragValue, setValue, toggleFlow, toggleSecondFill } from './edit';
  import { FIELD_LABEL, FIELD_STEP, FIELD_TONE, PANEL_LABEL, PHASE_FIELDS, formatValue, snap, typedStep } from './fields';
  import Graph from './Graph.svelte';
  import NameDialog from './NameDialog.svelte';
  import NumberPad from './NumberPad.svelte';
  import { TITLE_PREFIX, changed, loadOnLeave, nameOf, saveAs, saveEdit, storeAndLoad, titleOf, type Stored } from './save';
  import { startRow } from './start';
  import { DEFAULT_SAVE_HINT, noticeLasts, type Notice } from './status';
  import StepList from './StepList.svelte';
  import { readParams, readRecord } from './storage';
  import ValueChip from './ValueChip.svelte';
  import { errorMessage } from '../error-message';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  /** A profile the editor can open: a default, a saved A-Flow 3.0 profile, or the loaded one. */
  interface Entry {
    key: string;
    name: string;
    title: string;
    author: string;
    params: AFlowParams;
    /** the gateway's record of it, where it has one */
    record: ProfileRecord | null;
    isDefault: boolean;
  }

  /** the key of the loaded profile when the gateway has no record under its title */
  const LOADED = 'loaded';

  let records: ProfileRecord[] = $state.raw([]);
  /** the workflow's profile, when it is an A-Flow 3.0 profile */
  let loaded: { title: string; author: string; params: AFlowParams } | null = $state.raw(null);
  let originKey = $state(DEFAULT_PROFILES[0].id);
  let params: AFlowParams = $state({ ...DEFAULT_PROFILES[0].params });
  /** the values on the machine as far as the editor knows: leaving loads what differs from them */
  let openedWith: AFlowParams = DEFAULT_PROFILES[0].params;
  /** the values a load on leaving failed for: a second 'back' with them leaves without loading */
  let refused: string | null = null;
  /** the user picked or changed something: what is read later does not replace it */
  let touched = false;
  let mode: 'simple' | 'detail' = $state('simple');
  let selected: PhaseId = $state('fill');
  let naming = $state(false);
  let busy = $state(false);
  /** the status line under the start row: a result goes after 4 s, a failure stays (spec 3.8, 3.9) */
  let notice: Notice | null = $state(null);
  /** the value the number pad is open for */
  let typing: EditField | null = $state(null);
  /** the profile steps are shown; closed whenever the editor opens (founder, 2026-10-13) */
  let stepsOpen = $state(false);
  // The skin's one copy of the settings, set on the settings page only.
  const settings = $derived(skin.settings);

  const entries: Entry[] = $derived.by(() => {
    const defaults: Entry[] = DEFAULT_PROFILES.map((entry) => {
      const profile = defaultProfile(entry);
      return {
        key: entry.id,
        name: entry.id.replace('default-', ''),
        title: entry.title,
        author: DEFAULT_AUTHOR,
        params: entry.params,
        record: records.find((record) => sameProfile(record.profile, profile)) ?? null,
        isDefault: true,
      };
    });
    const saved: Entry[] = [];
    for (const record of records) {
      const read = readRecord(record);
      if (!read || defaults.some((entry) => entry.title === record.profile.title)) continue;
      saved.push({
        key: record.id,
        name: nameOf(record.profile.title),
        title: record.profile.title,
        author: record.profile.author ?? '',
        params: read,
        record,
        isDefault: false,
      });
    }
    const all = [...defaults, ...saved];
    if (loaded && !all.some((entry) => entry.title === loaded!.title)) {
      all.push({ key: LOADED, name: nameOf(loaded.title), ...loaded, record: null, isDefault: false });
    }
    return all;
  });
  /** the row to start from: the profiles chosen in the settings, in their order (founder, 2026-10-13) */
  const row = $derived(startRow(settings.startProfiles, entries));
  const origin = $derived(entries.find((entry) => entry.key === originKey) ?? entries[0]);
  const dirty = $derived(serializeParams(params) !== serializeParams(origin.params));
  /**
   * 'save' writes a new version of a saved profile; a default is saved under a new name, so
   * there 'save' only says so (founder, 2026-10-17).
   */
  const canSave = $derived(origin.isDefault || (!!origin.record && dirty));
  const taken = $derived([
    ...entries.map((entry) => entry.name),
    ...records
      .map((record) => record.profile.title)
      .filter((title) => title.startsWith(TITLE_PREFIX))
      .map(nameOf),
  ]);
  const resolved = $derived(resolveParams(params));
  // The maximum flow is a setting (founder, 2026-10-15). A saved value above it is shown as it
  // is and kept until it is edited: ±, the number pad and a drag bring it into the range.
  const limits = $derived(machineLimits(settings.maxFlow));
  const ranges = $derived(paramRanges(limits));

  function open(key: string, values: AFlowParams) {
    originKey = key;
    params = { ...values };
    if (selected === 'secondFill' && !hasSecondFill(params)) selected = 'infuse';
  }

  /**
   * Opens the editor on the current profile, the workflow's, when it is an A-Flow 3.0 profile
   * (spec 3.2); without one it stays on a default.
   */
  async function init() {
    // The warning before a load asked for 'save as' on the machine's values (founder, 2026-10-14).
    const saveAsNext = skin.saveAsNext;
    skin.saveAsNext = false;
    try {
      if (!skin.workflow) await skin.refreshWorkflow();
      records = await skin.client.listProfiles();
    } catch (cause) {
      notice = {
        tone: 'warn',
        text: `Decaid did not answer, so nothing can be saved or loaded now: ${errorMessage(cause)}`,
      };
      return;
    }
    const profile = skin.workflow?.profile;
    if (!profile) return;
    // Any other profile opens in the step editor (App.svelte, route.ts).
    const read = readParams(profile);
    if (!read || touched) return;
    // The record under its title is what 'save' continues; values that were loaded without
    // being saved are open again as they were.
    loaded = { title: profile.title, author: profile.author ?? '', params: read };
    open(entries.find((entry) => entry.title === profile.title)?.key ?? LOADED, read);
    openedWith = read;
    if (saveAsNext) naming = true;
  }

  /**
   * Leaving the editor, by the back arrow or the shortcut to the picker (founder, 2026-10-13):
   * changed values are loaded to the machine first. A failed load keeps the editor open and
   * says so; 'back' again with the same values leaves without loading them.
   */
  async function leave(): Promise<boolean> {
    if (busy) return false;
    const now = serializeParams(params);
    if (!changed(params, openedWith) || refused === now) return true;
    busy = true;
    notice = null;
    try {
      const workflow = await loadOnLeave(skin.client, params, openedWith, origin, settings.firstStepWorkaround);
      if (workflow) skin.workflow = workflow;
      return true;
    } catch (cause) {
      refused = now;
      notice = {
        tone: 'warn',
        text: `The changes were not loaded: ${errorMessage(cause)}. Back again leaves without them.`,
      };
      return false;
    } finally {
      busy = false;
    }
  }

  /**
   * A profile of the row opens in the editor; leaving loads it, as any change (founder,
   * 2026-10-13). Unsaved edits on the machine are asked about first (founder, 2026-10-14):
   * 'Save as…' opens the editor on them again and asks for a name.
   */
  async function pick(key: string) {
    busy = true;
    const answer = await skin.mayLoad();
    busy = false;
    if (answer === 'save-as') {
      skin.saveAsNext = true;
      touched = false;
      await init();
    }
    if (answer !== 'load') return;
    touched = true;
    notice = null;
    open(key, entries.find((entry) => entry.key === key)!.params);
  }

  // Each notice is timed from when it is shown; the next action replaces it.
  $effect(() => {
    const shown = notice;
    const lasts = shown && noticeLasts(shown);
    if (!lasts) return;
    const timer = setTimeout(() => {
      if (notice === shown) notice = null;
    }, lasts);
    return () => clearTimeout(timer);
  });

  onMount(() => {
    void init();
    skin.leaving = leave;
    return () => {
      if (skin.leaving === leave) skin.leaving = null;
    };
  });

  async function act(failure: string, run: () => Promise<void>) {
    busy = true;
    notice = null;
    try {
      await run();
    } catch (cause) {
      notice = { tone: 'warn', text: `${failure}: ${errorMessage(cause)}` };
    } finally {
      busy = false;
    }
  }

  /** The saved record is what the editor is on now, and on the machine unless its load failed. */
  async function adopt(stored: Stored, text: string) {
    records = await skin.client.listProfiles();
    open(stored.record.id, readRecord(stored.record) ?? params);
    if ('workflow' in stored) {
      skin.workflow = stored.workflow;
      openedWith = { ...params };
      notice = { tone: 'info', text: `${text} and loaded.` };
    } else {
      notice = { tone: 'warn', text: `${text}, but not loaded: ${errorMessage(stored.error)}` };
    }
  }

  // 'save' and 'save as' load what they stored (founder, 2026-10-13).
  const saveUnder = (name: string) =>
    act('The profile was not saved', async () => {
      const about = { title: titleOf(name), author: origin.author };
      const stored = await storeAndLoad(skin.client, () => saveAs(skin.client, params, about, settings.firstStepWorkaround));
      await adopt(stored, `Saved as “${name}”`);
    });

  const save = () => {
    if (origin.isDefault) {
      notice = { tone: 'info', text: DEFAULT_SAVE_HINT };
      return;
    }
    return act('The profile was not saved', async () => {
      const name = origin.name;
      const parent = origin.record!;
      const stored = await storeAndLoad(skin.client, () => saveEdit(skin.client, params, parent, settings.firstStepWorkaround));
      await adopt(stored, `Saved “${name}”`);
    });
  };

  function edit(field: EditField, value: number) {
    touched = true;
    params = setValue(params, field, value);
    if (selected === 'secondFill' && !hasSecondFill(params)) selected = 'infuse';
  }

  function drag(field: EditField, value: number) {
    touched = true;
    params = dragValue(params, field, value);
  }

  function step(field: EditField, direction: 1 | -1) {
    edit(field, snap(field, resolved[field] + direction * FIELD_STEP[field], limits));
  }

  function switchSecondFill() {
    touched = true;
    params = toggleSecondFill(params);
    if (hasSecondFill(params)) selected = mode === 'detail' ? 'secondFill' : selected;
    else if (selected === 'secondFill') selected = 'infuse';
  }

  function switchFlow() {
    touched = true;
    params = toggleFlow(params);
  }
</script>

<div class="editor" class:detail={mode === 'detail'}>
  <header>
    <!-- The shortcut to the profile picker (founder, 2026-10-13): a profile chosen there is loaded. -->
    <button
      class="seg name"
      data-testid="editor-profile"
      aria-label="choose another profile"
      disabled={busy}
      onclick={() => skin.leave('profiles')}
    >
      <span>{origin.name}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
    </button>
    <!-- The profiles to start from, chosen in the settings; 'save as' does not add to them. -->
    <div class="group start" role="group" aria-label="start from" data-testid="start-row">
      {#each row as entry (entry.key)}
        <button
          class="seg"
          aria-pressed={entry.key === origin.key}
          data-testid="start-{entry.name}"
          disabled={busy}
          onclick={() => pick(entry.key)}
        >
          {entry.name}
        </button>
      {/each}
    </div>
    <div class="group">
      <div class="group" role="group" aria-label="profile actions">
        <button class="seg action" data-testid="save" disabled={busy || !canSave} onclick={save}>save</button>
        <button class="seg action" data-testid="save-as" disabled={busy} onclick={() => (naming = true)}> save as </button>
      </div>
      <div class="group" role="group" aria-label="editor mode">
        <button class="seg" aria-pressed={mode === 'simple'} data-testid="mode-simple" onclick={() => (mode = 'simple')}>simple</button
        >
        <button class="seg" aria-pressed={mode === 'detail'} data-testid="mode-detail" onclick={() => (mode = 'detail')}>detail</button
        >
      </div>
    </div>
  </header>

  <!-- One line under the start row for what a save or a load answered; it keeps its height
       while it is empty, so the graph does not move (founder, 2026-10-18). -->
  <div class="status" role="status" data-testid="editor-status">
    {#if notice}
      <p class="notice {notice.tone}" data-testid="editor-notice" title={notice.text}>{notice.text}</p>
    {/if}
  </div>

  <section class="stage">
    <!-- No phase buttons: in detail mode a tap on a step of the graph selects it (founder, 2026-10-16). -->
    <div class="plot">
      <Graph {params} {limits} {mode} {selected} ondrag={drag} onedit={edit} onselect={(id: PhaseId) => (selected = id)} />
    </div>
  </section>

  {#if mode === 'detail'}
    <aside data-testid="detail-panel">
      <h2>{PHASE_LABEL[selected]}</h2>
      {#each PHASE_FIELDS[selected] as field (field)}
        <ValueChip
          label={PANEL_LABEL[field]}
          value={formatValue(field, resolved[field])}
          tone={FIELD_TONE[field] ?? 'none'}
          testid={field}
          onstep={(d: 1 | -1) => step(field, d)}
          onedit={() => (typing = field)}
        />
      {/each}
      <h2 class="shot">shot</h2>
      <ValueChip
        label={PANEL_LABEL.dose}
        value={formatValue('dose', params.dose)}
        testid="dose"
        onstep={(d: 1 | -1) => step('dose', d)}
        onedit={() => (typing = 'dose')}
      />
    </aside>
  {/if}

  <footer>
    <button class="toggle" aria-pressed={hasSecondFill(params)} data-testid="toggle-second-fill" onclick={switchSecondFill}>
      <span class="lamp"></span>2nd fill
    </button>
    <button class="toggle" data-testid="toggle-flow" aria-label="flow direction" onclick={switchFlow}>
      <span class="arrow" class:down={!params.flowUp}>↗</span>{params.flowUp ? 'flow up' : 'flow down'}
    </button>
    <div class="legend">
      <span class="flow">flow ml/s</span>
      <span class="pressure">pressure bar</span>
      <span class="temperature">temperature °C</span>
    </div>
    <!-- Hidden by the setting 'profile steps'; shown, it opens and closes the panel. -->
    {#if settings.showProfileSteps}
      <button class="toggle setting" aria-pressed={stepsOpen} data-testid="toggle-steps" onclick={() => (stepsOpen = !stepsOpen)}>
        <span class="lamp"></span>profile steps
      </button>
    {/if}
  </footer>

  {#if settings.showProfileSteps && stepsOpen}
    <section class="steps">
      <StepList {params} title={origin.title} firstStepWorkaround={settings.firstStepWorkaround} />
    </section>
  {/if}
</div>

{#if naming}
  <NameDialog
    {taken}
    onconfirm={(name: string) => {
      naming = false;
      void saveUnder(name);
    }}
    oncancel={() => (naming = false)}
  />
{/if}

{#if typing}
  {@const field = typing}
  <NumberPad
    label={FIELD_LABEL[field]}
    unit={ranges[field].unit}
    min={ranges[field].min}
    max={ranges[field].max}
    decimals={typedStep(field) < 1}
    current={formatValue(field, resolved[field]).replace(/ .*$/, '')}
    onconfirm={(value: number) => {
      edit(field, snap(field, value, limits, typedStep(field)));
      typing = null;
    }}
    oncancel={() => (typing = null)}
  />
{/if}

<style>
  .editor {
    height: 100%;
    box-sizing: border-box;
    padding: 0.7rem 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto minmax(0, 1fr) auto auto;
    grid-template-areas: 'header' 'status' 'stage' 'footer' 'steps';
    gap: 0.6rem 1rem;
  }

  /* The panel runs down to the bottom edge: a phase has up to six values and the dose. */
  .editor.detail {
    grid-template-columns: minmax(0, 1fr) 19rem;
    grid-template-areas: 'header header' 'status panel' 'stage panel' 'footer panel' 'steps panel';
  }

  header {
    grid-area: header;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .group,
  header > .group:last-child {
    gap: 1rem;
  }

  /* The profile's name, and the way to the picker. */
  .name {
    flex: none;
    min-width: 0;
    max-width: 16rem;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name svg {
    flex: none;
    width: 1.3rem;
    height: 1.3rem;
    fill: none;
    stroke: var(--dim);
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  /* The row takes the room between the name and the actions and scrolls when it has no more. */
  .start {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .start .seg {
    flex: none;
    min-width: 4.5rem;
    max-width: 11rem;
    padding: 0 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    touch-action: manipulation;
    user-select: none;
  }

  .seg {
    min-height: 3rem;
    min-width: 6rem;
    padding: 0 1.1rem;
    border-radius: 0.9rem;
    font-size: 1rem;
  }

  .seg[aria-pressed='true'] {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }

  .seg.action {
    min-width: 0;
    background: var(--raised);
    white-space: nowrap;
  }

  .seg:disabled {
    background: var(--panel);
    border-color: var(--line);
    color: var(--dim);
    font-weight: 400;
  }

  /* One line: what the editor is on, and what a save or a load answered. */
  .status {
    grid-area: status;
    height: 1.5rem;
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .notice {
    margin: 0;
    padding: 0 0.3rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg);
    font-size: 0.95rem;
  }

  .notice.warn {
    color: var(--warn);
  }

  .stage {
    grid-area: stage;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .plot {
    flex: 1;
    min-height: 0;
    background: var(--panel);
    border-radius: 1rem;
  }

  aside {
    grid-area: panel;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    min-height: 3rem;
    display: flex;
    align-items: center;
    font-size: 1.3rem;
    font-weight: 600;
  }

  h2.shot {
    min-height: 0;
    margin-top: auto;
    padding-top: 0.5rem;
    font-size: 0.9rem;
    font-weight: 400;
    color: var(--dim);
  }

  footer {
    grid-area: footer;
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .toggle {
    min-height: 3rem;
    min-width: 9rem;
    padding: 0 1.2rem;
    border-radius: 1.5rem;
    font-size: 1.05rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    white-space: nowrap;
  }

  .lamp {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    border: 2px solid var(--dim);
  }

  .toggle[aria-pressed='true'] {
    border-color: var(--flow);
  }

  .toggle[aria-pressed='true'] .lamp {
    background: var(--flow);
    border-color: var(--flow);
  }

  .arrow {
    display: inline-block;
    color: var(--flow);
    font-size: 1.2rem;
    line-height: 1;
  }

  .arrow.down {
    transform: scaleY(-1);
  }

  /* A setting, not a part of the profile: it is quieter than the two toggles. */
  .setting {
    margin-left: auto;
    min-width: 0;
    color: var(--dim);
  }

  .setting[aria-pressed='true'] {
    border-color: var(--line);
  }

  .setting[aria-pressed='true'] .lamp {
    background: var(--dim);
    border-color: var(--dim);
  }

  .legend {
    margin-left: 0.6rem;
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    color: var(--dim);
    white-space: nowrap;
  }

  .legend span::before {
    content: '';
    display: inline-block;
    width: 1.1rem;
    height: 0.24rem;
    margin-right: 0.4rem;
    border-radius: 0.12rem;
    vertical-align: middle;
    background: var(--tone);
  }

  .legend .flow {
    --tone: var(--flow);
  }
  .legend .pressure {
    --tone: var(--pressure);
  }
  .legend .temperature {
    --tone: var(--temperature);
  }

  .steps {
    grid-area: steps;
    background: var(--panel);
    border-radius: 1rem;
    padding: 0.4rem 0.4rem;
  }
</style>
