<script lang="ts">
  import { onMount } from 'svelte';
  import {
    DEFAULT_PROFILES,
    hasSecondFill,
    machineLimits,
    paramRanges,
    resolveParams,
    serializeParams,
    type AFlowParams,
  } from '../aflow';
  import type { ProfileRecord } from '../api';
  import type { Skin } from '../shell/skin.svelte';
  import type { EditField, PhaseId } from './curve';
  import DetailPanel from './DetailPanel.svelte';
  import { dragValue, setValue, toggleFlow, toggleSecondFill } from './edit';
  import EditorFooter from './EditorFooter.svelte';
  import EditorHeader from './EditorHeader.svelte';
  import { LOADED, canSave as mayBeSaved, editorEntries, takenNames, type Loaded } from './entries';
  import { FIELD_LABEL, FIELD_STEP, formatValue, snap, typedStep } from './fields';
  import Graph from './Graph.svelte';
  import NameDialog from './NameDialog.svelte';
  import NumberPad from './NumberPad.svelte';
  import { changed, loadOnLeave, saveAs, saveEdit, storeAndLoad, titleOf, type Stored } from './save';
  import { afterSecondFillToggle, keepSelection } from './selection';
  import { startRow } from './start';
  import { DEFAULT_SAVE_HINT, convertedNotice, noticeLasts, type Notice } from './status';
  import StepList from './StepList.svelte';
  import { openParams, readRecord } from './storage';
  import { errorMessage } from '../error-message';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  let records: ProfileRecord[] = $state.raw([]);
  /** the workflow's profile, when the editor can open it */
  let loaded: Loaded | null = $state.raw(null);
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
  /** the status line under the start row: a result goes after 4 s, a failure stays */
  let notice: Notice | null = $state(null);
  /** the value the number pad is open for */
  let typing: EditField | null = $state(null);
  /** the profile steps are shown; closed whenever the editor opens */
  let stepsOpen = $state(false);
  // The skin's one copy of the settings, set on the settings page only.
  const settings = $derived(skin.settings);

  const entries = $derived(editorEntries(records, loaded));
  /** the row to start from: the profiles chosen in the settings, in their order */
  const row = $derived(startRow(settings.startProfiles, entries));
  const origin = $derived(entries.find((entry) => entry.key === originKey) ?? entries[0]);
  const dirty = $derived(serializeParams(params) !== serializeParams(origin.params));
  const canSave = $derived(mayBeSaved(origin, dirty));
  const taken = $derived(takenNames(entries, records));
  const resolved = $derived(resolveParams(params));
  // The maximum flow is a setting. A saved value above it is shown as it is and kept until it
  // is edited: ±, the number pad and a drag bring it into the range.
  const limits = $derived(machineLimits(settings.maxFlow));
  const ranges = $derived(paramRanges(limits));

  function open(key: string, values: AFlowParams) {
    originKey = key;
    params = { ...values };
    selected = keepSelection(selected, params);
  }

  /**
   * Opens the editor on the current profile, the workflow's, when it is an A-Flow profile;
   * without one it stays on a default. An older A-Flow profile, read from its
   * steps, says so and what was dropped.
   */
  async function init() {
    // The warning before a load asked for 'save as' on the machine's values.
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
    const read = openParams(profile);
    if (!read || touched) return;
    // The record under its title is what 'save' continues; values that were loaded without
    // being saved are open again as they were.
    loaded = { title: profile.title, author: profile.author ?? '', params: read.params, converted: read.dropped !== null };
    open(entries.find((entry) => entry.title === profile.title)?.key ?? LOADED, read.params);
    openedWith = read.params;
    if (read.dropped) notice = convertedNotice(read.dropped, settings.firstStepWorkaround);
    if (saveAsNext) naming = true;
  }

  /**
   * Leaving the editor, by the swipe back or the shortcut to the picker:
   * changed values are loaded to the machine first. A failed load keeps the editor open and
   * says so; a swipe back again with the same values leaves without loading them.
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
   * A profile of the row opens in the editor; leaving loads it, as any change. Unsaved edits
   * on the machine are asked about first: 'Save as…' opens the editor on them again and asks
   * for a name.
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

  // 'save' and 'save as' load what they stored.
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
    selected = keepSelection(selected, params);
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
    selected = afterSecondFillToggle(selected, params, mode);
  }

  function switchFlow() {
    touched = true;
    params = toggleFlow(params);
  }
</script>

<div class="editor" class:detail={mode === 'detail'}>
  <EditorHeader
    {origin}
    {row}
    {busy}
    {canSave}
    {mode}
    onprofile={() => skin.leave('profiles')}
    onpick={pick}
    onsave={save}
    onsaveas={() => (naming = true)}
    onmode={(next: 'simple' | 'detail') => (mode = next)}
  />

  <!-- One line under the start row for what a save or a load answered; it keeps its height
       while it is empty, so the graph does not move. -->
  <div class="status" role="status" data-testid="editor-status">
    {#if notice}
      <p class="notice {notice.tone}" class:warning={notice.tone === 'warn'} data-testid="editor-notice" title={notice.text}>
        {notice.text}
      </p>
    {/if}
  </div>

  <section class="stage" data-main-frame>
    <!-- No phase buttons: in detail mode a tap on a step of the graph selects it. -->
    <div class="plot">
      <Graph {params} {limits} {mode} {selected} ondrag={drag} onedit={edit} onselect={(id: PhaseId) => (selected = id)} />
    </div>
  </section>

  {#if mode === 'detail'}
    <DetailPanel {selected} {params} {resolved} onstep={step} ontype={(field: EditField) => (typing = field)} />
  {/if}

  <EditorFooter
    secondFill={hasSecondFill(params)}
    flowUp={params.flowUp}
    showSteps={settings.showProfileSteps}
    {stepsOpen}
    onsecondfill={switchSecondFill}
    onflow={switchFlow}
    onsteps={() => (stepsOpen = !stepsOpen)}
  />

  {#if settings.showProfileSteps && stepsOpen}
    <section class="steps" data-main-frame>
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
    font-size: var(--text-label);
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

  .steps {
    grid-area: steps;
    background: var(--panel);
    border-radius: 1rem;
    padding: 0.4rem 0.4rem;
  }
</style>
