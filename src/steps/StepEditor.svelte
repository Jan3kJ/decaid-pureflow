<!--
Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
src/profiles/profile_editor.html and src/modules/profile_editor.js (the layout of the editor).
Streamline.js - A browser-native skin for Decent Espresso machines
Copyright (C) 2025-2026 Decent Espresso
Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The step editor (spec 3.6, research.md 17): every profile that is not A-Flow opens here,
  // on the workflow's profile, as the A-Flow editor does. One card per step; 'save' and 'save
  // as' store through the skin's one writer and load what they stored; leaving loads a changed
  // profile. Above the cards, the curve preview draws the profile's targets and follows every
  // edit (E3); the SETTINGS tab edits the profile's own values; the SCRIPT tab shows the steps
  // as Streamline's sentences, whose words cycle and whose numbers open the number pad (E6).
  import { onMount, tick } from 'svelte';
  import type { Profile, ProfileRecord } from '../api';
  import NameDialog from '../editor/NameDialog.svelte';
  import NumberPad from '../editor/NumberPad.svelte';
  import { storeAndLoad, type Stored } from '../editor/save';
  import { sameSteps, stepEditorReason } from '../editor/storage';
  import type { Skin } from '../shell/skin.svelte';
  import {
    VALUE_LABEL,
    cycleExit,
    cyclePump,
    cycleSensor,
    formatNumber,
    insertStepAfter,
    limitOf,
    moveStep,
    openProfile,
    removeStepAt,
    setName,
    setValue,
    stepValue,
    type StepValue,
  } from './model';
  import { canSaveOver, loadStepsOnLeave, profileChanged, saveStepAs, saveStepEdit } from './save';
  import { centredScroll } from './centre';
  import ProfileSettings from './ProfileSettings.svelte';
  import ScriptTab from './ScriptTab.svelte';
  import StepCard from './StepCard.svelte';
  import StepPreview from './StepPreview.svelte';
  import { errorMessage } from '../error-message';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  /** what the editor shows before the workflow is read */
  const EMPTY: Profile = { title: '', steps: [], target_volume_count_start: 0, tank_temperature: 0 };

  let records: ProfileRecord[] = $state.raw([]);
  /** the profile on screen */
  let profile: Profile = $state.raw(EMPTY);
  /** the stored record 'save' continues: the visible one of the profile's title */
  let record: ProfileRecord | null = $state.raw(null);
  /** what 'save' compares with: the record's profile, or the machine's when it has none */
  let origin: Profile = $state.raw(EMPTY);
  /** the profile on the machine as far as the editor knows: leaving loads what differs from it */
  let openedWith: Profile = EMPTY;
  /** the profile a load on leaving failed for: a second 'back' with it leaves without loading */
  let refused: Profile | null = null;
  let openIndex = $state(0);
  let typing: { index: number; value: StepValue } | null = $state(null);
  let deleting: number | null = $state(null);
  let naming = $state(false);
  let busy = $state(false);
  let notice: { tone: 'info' | 'warn'; text: string } | null = $state(null);
  let row: HTMLDivElement | undefined = $state();
  let tab: 'cards' | 'settings' | 'script' = $state('cards');

  const taken = $derived(records.map((entry) => entry.profile.title));
  /** 'save' may rename the profile, but not to the title of another visible one. */
  const titleProblem = $derived.by(() => {
    const own: ProfileRecord | null = record;
    if (!own || profile.title === own.profile.title || !taken.includes(profile.title)) return null;
    return `Another profile is called “${profile.title}”: choose another title, or use save as.`;
  });
  const dirty = $derived(profileChanged(profile, origin));
  const canSave = $derived(canSaveOver(record) && dirty && profile.steps.length > 0 && !titleProblem);

  /** What a record's id is made of: the steps and the target weight. */
  const sameContent = (a: Profile, b: Profile) => sameSteps(a.steps, b.steps) && (a.target_weight ?? 0) === (b.target_weight ?? 0);

  /** The visible record of a title, the one with these steps first. */
  function recordOf(of: Profile): ProfileRecord | null {
    const mine = records.filter((entry) => entry.profile.title === of.title);
    return mine.find((entry) => sameContent(entry.profile, of)) ?? mine[0] ?? null;
  }

  function show(next: Profile, from: ProfileRecord | null) {
    profile = openProfile(next);
    record = from;
    origin = from?.profile ?? next;
    openIndex = Math.min(openIndex, Math.max(0, profile.steps.length - 1));
  }

  async function init() {
    // The warning before a load asked for 'save as' on the machine's profile (founder, 2026-10-14).
    const saveAsNext = skin.saveAsNext;
    skin.saveAsNext = false;
    const loaded = skin.workflow?.profile;
    if (!loaded) return;
    openedWith = loaded;
    show(loaded, null);
    // An A-Flow profile the A-Flow editor cannot open says why (spec 3.9, U2).
    const reason = stepEditorReason(loaded);
    if (reason) notice = { tone: 'info', text: reason };
    try {
      records = await skin.client.listProfiles();
    } catch (cause) {
      notice = { tone: 'warn', text: `Decaid did not answer, so nothing can be saved now: ${errorMessage(cause)}` };
      return;
    }
    // Edits the user made meanwhile stay; the record only says what 'save' continues.
    record = recordOf(loaded);
    origin = record?.profile ?? loaded;
    if (saveAsNext) naming = true;
  }

  /**
   * Leaving the editor, by the swipe back or the shortcut to the picker: a changed profile is
   * loaded to the machine first. A failed load keeps the editor open and says so; the swipe again
   * with the same profile leaves without loading it.
   */
  async function leave(): Promise<boolean> {
    if (busy) return false;
    if (!profileChanged(profile, openedWith) || (refused && !profileChanged(profile, refused))) return true;
    busy = true;
    notice = null;
    try {
      const workflow = await loadStepsOnLeave(skin.client, profile, openedWith);
      if (workflow) skin.workflow = workflow;
      return true;
    } catch (cause) {
      refused = profile;
      notice = { tone: 'warn', text: `The changes were not loaded: ${errorMessage(cause)}. Back again leaves without them.` };
      return false;
    } finally {
      busy = false;
    }
  }

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
    show(stored.record.profile, records.find((entry) => entry.id === stored.record.id) ?? stored.record);
    if ('workflow' in stored) {
      skin.workflow = stored.workflow;
      openedWith = stored.record.profile;
      notice = { tone: 'info', text: `${text} and loaded.` };
    } else {
      notice = { tone: 'warn', text: `${text}, but not loaded: ${errorMessage(stored.error)}` };
    }
  }

  const save = () =>
    act('The profile was not saved', async () => {
      const parent = record!;
      const stored = await storeAndLoad(skin.client, () => saveStepEdit(skin.client, profile, parent));
      await adopt(stored, `Saved “${stored.record.profile.title}”`);
    });

  const saveUnder = (title: string) =>
    act('The profile was not saved', async () => {
      const source = record;
      const stored = await storeAndLoad(skin.client, () => saveStepAs(skin.client, profile, title, source));
      await adopt(stored, `Saved as “${title}”`);
    });

  /** the row the open card was last centred in: a new one (the cards tab opened) is placed at once */
  let centredIn: HTMLDivElement | undefined;
  const stepCount = $derived(profile.steps.length);

  /** The open card moves to the centre of the row, the first and last as near as the row allows. */
  async function centre() {
    await tick();
    const card = row?.querySelector<HTMLElement>('[data-open="true"]');
    if (!row || !card) return;
    const left = card.getBoundingClientRect().left - row.getBoundingClientRect().left + row.scrollLeft;
    const smooth = centredIn === row;
    centredIn = row;
    row.scrollTo({
      left: centredScroll(left, card.offsetWidth, row.clientWidth, row.scrollWidth),
      behavior: smooth ? 'smooth' : 'instant',
    });
  }

  // Whenever another card opens (a tap, a step added, moved or deleted): a short animated scroll.
  $effect(() => {
    void [openIndex, stepCount, row];
    void centre();
  });

  function edit(next: Profile) {
    profile = next;
  }

  function open(next: typeof tab) {
    tab = next;
    openIndex = Math.min(openIndex, Math.max(0, profile.steps.length - 1));
  }

  function move(index: number, direction: 1 | -1) {
    edit(moveStep(profile, index, index + direction));
    openIndex = index + direction;
  }

  function insert(index: number) {
    edit(insertStepAfter(profile, index));
    openIndex = index + 1;
  }

  function remove(index: number) {
    deleting = null;
    edit(removeStepAt(profile, index));
    openIndex = Math.min(index, profile.steps.length - 1);
  }

  function cycle(index: number, what: 'sensor' | 'pump' | 'exit') {
    edit(what === 'sensor' ? cycleSensor(profile, index) : what === 'pump' ? cyclePump(profile, index) : cycleExit(profile, index));
  }
</script>

<div class="editor">
  <header>
    <!-- The shortcut to the profile picker: a profile chosen there is loaded and opens in its editor. -->
    <button
      class="seg name"
      data-testid="editor-profile"
      aria-label="choose another profile"
      disabled={busy}
      onclick={() => skin.leave('profiles')}
    >
      <span>{profile.title}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9" /></svg>
    </button>
    <div class="group tabs" role="group" aria-label="view">
      <button class="seg" aria-pressed={tab === 'cards'} data-testid="tab-cards" onclick={() => open('cards')}>cards</button>
      <button class="seg" aria-pressed={tab === 'script'} data-testid="tab-script" onclick={() => open('script')}>script</button>
      <button class="seg" aria-pressed={tab === 'settings'} data-testid="tab-settings" onclick={() => open('settings')}
        >settings</button
      >
    </div>
    <span class="count" data-testid="step-count">{profile.steps.length} {profile.steps.length === 1 ? 'step' : 'steps'}</span>
    <div class="group" role="group" aria-label="profile actions">
      <button class="seg action" data-testid="save" disabled={busy || !canSave} onclick={save}>save</button>
      <button class="seg action" data-testid="save-as" disabled={busy || profile.steps.length === 0} onclick={() => (naming = true)}>
        save as
      </button>
    </div>
  </header>

  {#if notice}
    <p class="notice {notice.tone}" data-testid="editor-notice">{notice.text}</p>
  {/if}

  {#if tab === 'settings'}
    <ProfileSettings {profile} {titleProblem} disabled={busy} onedit={edit} />
  {:else if tab === 'script'}
    <ScriptTab {profile} disabled={busy} onedit={edit} ontype={(index: number, value: StepValue) => (typing = { index, value })} />
  {:else}
    <!-- The curve preview: the targets of the steps, redrawn with every edit. -->
    <StepPreview {profile} mainFrame />

    <div class="cards" bind:this={row} data-testid="step-cards" data-main-frame>
      {#each profile.steps as step, index (index)}
        <StepCard
          {step}
          {index}
          count={profile.steps.length}
          open={index === openIndex}
          disabled={busy}
          onopen={() => (openIndex = index)}
          onstep={(value: StepValue, direction: 1 | -1) => edit(stepValue(profile, index, value, direction))}
          ontype={(value: StepValue) => (typing = { index, value })}
          oncycle={(what: 'sensor' | 'pump' | 'exit') => cycle(index, what)}
          onname={(name: string) => edit(setName(profile, index, name))}
          onmove={(direction: 1 | -1) => move(index, direction)}
          ondelete={() => (deleting = index)}
          oninsert={() => insert(index)}
        />
      {:else}
        <button class="add" data-testid="step-insert-first" disabled={busy || !profile.title} onclick={() => insert(-1)}>
          + add a step
        </button>
      {/each}
    </div>
  {/if}
</div>

<svelte:window onkeydown={(e: KeyboardEvent) => e.key === 'Escape' && deleting !== null && (deleting = null)} />

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
  {@const { index, value } = typing}
  {@const step = profile.steps[index]}
  {@const limit = limitOf(step, value)}
  {#if limit}
    <NumberPad
      label="step {index + 1} {VALUE_LABEL[value]}"
      unit={limit.unit}
      min={limit.min}
      max={limit.max}
      decimals={limit.step < 1}
      current={formatNumber(step, value)}
      onconfirm={(typed: number) => {
        edit(setValue(profile, index, value, typed));
        typing = null;
      }}
      oncancel={() => (typing = null)}
    />
  {/if}
{/if}

{#if deleting !== null}
  {@const index = deleting}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" data-no-swipe onclick={(e) => e.target === e.currentTarget && (deleting = null)}>
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-text" data-testid="delete-dialog">
      <p id="delete-text">Delete step {index + 1}?</p>
      <p class="hint">“{profile.steps[index].name}” and its values go; saving makes it final.</p>
      <div class="actions">
        <button class="discard" data-testid="delete-confirm" onclick={() => remove(index)}>Delete</button>
        <button data-testid="delete-cancel" onclick={() => (deleting = null)}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .editor {
    height: 100%;
    box-sizing: border-box;
    padding: 0.7rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .group {
    display: flex;
    gap: 0.4rem;
  }

  .tabs {
    flex: 1;
  }

  .count {
    color: var(--dim);
    font-size: var(--text-label);
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
    font-size: var(--text-body);
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
  }

  .name {
    flex: none;
    min-width: 0;
    max-width: 24rem;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    font-size: var(--text-body);
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

  .notice {
    margin: 0;
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--raised);
    color: var(--dim);
    font-size: var(--text-label);
  }

  .notice.warn {
    color: var(--warn);
  }

  /* A row of cards that scrolls sideways, one open at a time and centred, as high as the open card. */
  .cards {
    flex: 0 1 auto;
    min-height: 0;
    display: flex;
    align-items: stretch;
    gap: 0.7rem;
    overflow-x: auto;
    touch-action: pan-x pan-y;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }

  .add {
    min-width: 13.5rem;
    border-radius: 1rem;
    font-size: var(--text-body);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 60%);
  }

  .dialog {
    min-width: 28rem;
    padding: 1.4rem 1.6rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 1.2rem;
  }

  .dialog p {
    margin: 0 0 0.6rem;
    font-size: var(--text-title);
  }

  .dialog .hint {
    font-size: var(--text-label);
    color: var(--dim);
  }

  .actions {
    margin-top: 1.2rem;
    display: flex;
    gap: 0.8rem;
  }

  .actions button {
    flex: 1;
    min-height: 3.4rem;
    border-radius: 0.8rem;
    font-size: var(--text-body);
    background: var(--panel);
  }

  .actions .discard {
    color: var(--warn);
    border-color: var(--warn);
  }
</style>
