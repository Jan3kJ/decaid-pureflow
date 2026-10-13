<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DEFAULT_AUTHOR,
    DEFAULT_PROFILES,
    hasSecondFill,
    paramRanges,
    resolveParams,
    serializeParams,
    type AFlowParams,
    type NumberField,
  } from '../aflow';
  import type { ProfileRecord } from '../api';
  import { loadSettings, saveSettings } from '../settings';
  import { defaultProfile, loadProfile, sameProfile } from '../shell/profiles';
  import type { Skin } from '../shell/skin.svelte';
  import { PHASE_LABEL, type EditField, type PhaseId } from './curve';
  import { dragValue, setValue, toggleFlow, toggleSecondFill } from './edit';
  import {
    FIELD_LABEL,
    FIELD_STEP,
    FIELD_TONE,
    PANEL_LABEL,
    PHASE_FIELDS,
    formatValue,
    snap,
    typedStep,
  } from './fields';
  import Graph from './Graph.svelte';
  import NameDialog from './NameDialog.svelte';
  import NumberPad from './NumberPad.svelte';
  import { TITLE_PREFIX, buildProfile, nameOf, saveAs, saveEdit, titleOf } from './save';
  import StepList from './StepList.svelte';
  import { readParams } from './storage';
  import ValueChip from './ValueChip.svelte';

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
  /** the user picked or changed something: what is read later does not replace it */
  let touched = false;
  let mode: 'simple' | 'detail' = $state('simple');
  let selected: PhaseId = $state('fill');
  let naming = $state(false);
  let busy = $state(false);
  let notice: { tone: 'info' | 'warn'; text: string } | null = $state(null);
  /** the value the number pad is open for */
  let typing: EditField | null = $state(null);
  // The settings page (D8c) will own these values; until then the button in the footer sets
  // the one that shows the steps.
  let settings = $state(loadSettings());

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
      const read = readParams(record.profile);
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
  const origin = $derived(entries.find((entry) => entry.key === originKey) ?? entries[0]);
  const dirty = $derived(serializeParams(params) !== serializeParams(origin.params));
  /** 'save' writes a new version of a saved profile; a default is saved under a new name. */
  const canSave = $derived(!!origin.record && !origin.isDefault && dirty);
  const taken = $derived([
    ...entries.map((entry) => entry.name),
    ...records
      .map((record) => record.profile.title)
      .filter((title) => title.startsWith(TITLE_PREFIX))
      .map(nameOf),
  ]);
  const resolved = $derived(resolveParams(params));
  const ranges = paramRanges();
  const phases = $derived(
    (Object.keys(PHASE_LABEL) as PhaseId[]).filter((id) => id !== 'secondFill' || hasSecondFill(params)),
  );
  const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

  function open(key: string, values: AFlowParams) {
    originKey = key;
    params = { ...values };
    if (selected === 'secondFill' && !hasSecondFill(params)) selected = 'infuse';
  }

  /**
   * Opens the editor on the current profile, the workflow's, when it is an A-Flow 3.0 profile
   * (spec 3.2). Any other profile is not edited: the editor says so and stays on a default.
   */
  async function init() {
    try {
      if (!skin.workflow) await skin.refreshWorkflow();
      records = await skin.client.listProfiles();
    } catch (cause) {
      notice = {
        tone: 'warn',
        text: `Decaid did not answer, so nothing can be saved or loaded now: ${message(cause)}`,
      };
      return;
    }
    const profile = skin.workflow?.profile;
    if (!profile) return;
    const read = readParams(profile);
    if (!read) {
      notice = {
        tone: 'info',
        text: `The loaded profile “${profile.title}” is not an A-Flow 3.0 profile: it can be loaded, but not edited. This is a default to start a new one from.`,
      };
      return;
    }
    if (touched) return;
    // The record under its title is what 'save' continues; values that were loaded without
    // being saved are open again as they were.
    loaded = { title: profile.title, author: profile.author ?? '', params: read };
    open(entries.find((entry) => entry.title === profile.title)?.key ?? LOADED, read);
  }

  onMount(() => void init());

  function pick(key: string) {
    touched = true;
    notice = null;
    open(key, entries.find((entry) => entry.key === key)!.params);
  }

  async function act(failure: string, run: () => Promise<void>) {
    busy = true;
    notice = null;
    try {
      await run();
    } catch (cause) {
      notice = { tone: 'warn', text: `${failure}: ${message(cause)}` };
    } finally {
      busy = false;
    }
  }

  /** The saved record is what the editor is on now. */
  async function adopt(record: ProfileRecord, text: string) {
    records = await skin.client.listProfiles();
    open(record.id, readParams(record.profile) ?? params);
    notice = { tone: 'info', text };
  }

  const saveUnder = (name: string) =>
    act('The profile was not saved', async () => {
      const about = { title: titleOf(name), author: origin.author };
      const record = await saveAs(skin.client, params, about, settings.firstStepWorkaround);
      await adopt(record, `Saved as “${name}”.`);
    });

  const save = () =>
    act('The profile was not saved', async () => {
      const name = origin.name;
      const record = await saveEdit(skin.client, params, origin.record!, settings.firstStepWorkaround);
      await adopt(record, `Saved “${name}”.`);
    });

  /** The values as they are now, saved or not, with the picker's loading function. */
  const load = () =>
    act('The profile was not loaded', async () => {
      const profile = buildProfile(params, origin, settings.firstStepWorkaround);
      skin.workflow = await loadProfile(skin.client, profile);
      skin.go('home');
    });

  function edit(field: EditField, value: number) {
    touched = true;
    params = setValue(params, field, value);
    if (selected === 'secondFill' && !hasSecondFill(params)) selected = 'infuse';
  }

  function drag(field: NumberField, value: number) {
    touched = true;
    params = dragValue(params, field, value);
  }

  function step(field: EditField, direction: 1 | -1) {
    edit(field, snap(field, resolved[field] + direction * FIELD_STEP[field]));
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

  function showSteps(show: boolean) {
    settings.showProfileSteps = show;
    saveSettings(settings);
  }
</script>

<div class="editor" class:detail={mode === 'detail'}>
  <header>
    <div class="group picker" role="group" aria-label="profile" data-testid="picker">
      {#each entries as entry (entry.key)}
        <button
          class="seg"
          aria-pressed={entry.key === origin.key}
          data-testid="profile-{entry.key}"
          onclick={() => pick(entry.key)}
        >
          {entry.name}
        </button>
      {/each}
    </div>
    <div class="group">
      <div class="group" role="group" aria-label="profile actions">
        <button class="seg action" data-testid="save" disabled={busy || !canSave} onclick={save}>save</button>
        <button class="seg action" data-testid="save-as" disabled={busy} onclick={() => (naming = true)}>
          save as
        </button>
        <button class="seg action load" data-testid="load-to-machine" disabled={busy} onclick={load}>
          load to machine
        </button>
      </div>
      <div class="group" role="group" aria-label="editor mode">
        <button
          class="seg"
          aria-pressed={mode === 'simple'}
          data-testid="mode-simple"
          onclick={() => (mode = 'simple')}>simple</button
        >
        <button
          class="seg"
          aria-pressed={mode === 'detail'}
          data-testid="mode-detail"
          onclick={() => (mode = 'detail')}>detail</button
        >
      </div>
    </div>
  </header>

  <section class="stage">
    {#if notice}
      <p class="notice {notice.tone}" data-testid="editor-notice">{notice.text}</p>
    {/if}
    {#if mode === 'detail'}
      <div class="phases" role="group" aria-label="phase">
        {#each phases as id (id)}
          <button
            class="seg"
            aria-pressed={id === selected}
            data-testid="phase-{id}"
            onclick={() => (selected = id)}
          >
            {PHASE_LABEL[id]}
          </button>
        {/each}
      </div>
    {/if}
    <div class="plot">
      <Graph
        {params}
        {mode}
        {selected}
        ondrag={drag}
        onedit={edit}
        onselect={(id) => (selected = id)}
      />
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
          onstep={(d) => step(field, d)}
          onedit={() => (typing = field)}
        />
      {/each}
      <h2 class="shot">shot</h2>
      <ValueChip
        label={PANEL_LABEL.dose}
        value={formatValue('dose', params.dose)}
        testid="dose"
        onstep={(d) => step('dose', d)}
        onedit={() => (typing = 'dose')}
      />
    </aside>
  {/if}

  <footer>
    <button
      class="toggle"
      aria-pressed={hasSecondFill(params)}
      data-testid="toggle-second-fill"
      onclick={switchSecondFill}
    >
      <span class="lamp"></span>2nd fill
    </button>
    <button
      class="toggle"
      data-testid="toggle-flow"
      aria-label="flow direction"
      onclick={switchFlow}
    >
      <span class="arrow" class:down={!params.flowUp}>↗</span>{params.flowUp
        ? 'flow up'
        : 'flow down'}
    </button>
    <div class="legend">
      <span class="flow">flow ml/s</span>
      <span class="pressure">pressure bar</span>
      <span class="temperature">temperature °C</span>
    </div>
    <button
      class="toggle setting"
      aria-pressed={settings.showProfileSteps}
      data-testid="toggle-steps"
      onclick={() => showSteps(!settings.showProfileSteps)}
    >
      <span class="lamp"></span>profile steps
    </button>
  </footer>

  {#if settings.showProfileSteps}
    <section class="steps">
      <StepList {params} title={origin.title} firstStepWorkaround={settings.firstStepWorkaround} />
    </section>
  {/if}
</div>

{#if naming}
  <NameDialog
    {taken}
    onconfirm={(name) => {
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
    onconfirm={(value) => {
      edit(field, snap(field, value, undefined, typedStep(field)));
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
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    grid-template-areas: 'header' 'stage' 'footer' 'steps';
    gap: 0.6rem 1rem;
  }

  /* The panel runs down to the bottom edge: a phase has up to six values and the dose. */
  .editor.detail {
    grid-template-columns: minmax(0, 1fr) 19rem;
    grid-template-areas: 'header header' 'stage panel' 'footer panel' 'steps panel';
  }

  header {
    grid-area: header;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .group,
  .phases {
    display: flex;
    gap: 0.4rem;
  }

  header > .group:last-child {
    gap: 1rem;
  }

  /* Saved profiles are added on the right: the picker scrolls when they no longer fit. */
  .picker {
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .picker .seg {
    flex: none;
    max-width: 14rem;
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

  .seg.load {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }

  .seg:disabled {
    background: var(--panel);
    border-color: var(--line);
    color: var(--dim);
    font-weight: 400;
  }

  /* One line: what the editor is on, and what a save or a load answered. */
  .notice {
    margin: 0;
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--raised);
    color: var(--dim);
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

  .phases .seg {
    flex: 1;
    min-width: 0;
    padding: 0 0.4rem;
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
