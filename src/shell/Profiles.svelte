<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ProfileRecord } from '../api';
  import Confirm from '../settings-page/Confirm.svelte';
  import StepPreview from '../steps/StepPreview.svelte';
  import {
    LOADED_REFUSAL,
    deleteEntry,
    deleteRefusal,
    doseOf,
    filterProfiles,
    isAFlow3,
    loadEntry,
    pickerEntries,
    previewLastStepSeconds,
    profileDescription,
    sameProfile,
    type PickerEntry,
  } from './profiles';
  import type { Skin } from './skin.svelte';
  import { errorMessage } from '../error-message';
  import { rowGesture, rowOffset, settlesOpen, type RowGesture } from './row-swipe';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  /** the gateway's list; until it is read, and when it cannot be, the defaults are listed alone */
  let records: ProfileRecord[] | null = $state.raw(null);
  let selectedId: string | null = $state(null);
  let busy = $state(false);
  let error: string | null = $state(null);
  /** The filter is not kept: the picker opens with the whole list. */
  let filter = $state('');

  // The skin's defaults first, marked; stored copies under their titles are not listed (spec 3.8, T5).
  const entries = $derived(pickerEntries(records ?? []));
  const shown = $derived(filterProfiles(entries, filter));
  // A selected profile the filter hides is not shown, nor loaded; it is again once the filter lets it through.
  const selected = $derived(shown.find((entry) => entry.id === selectedId) ?? null);
  const current = $derived(skin.workflow?.profile);
  const isLoaded = (entry: PickerEntry) => !!current && sameProfile(entry.profile, current);

  /** rem, the width of a row's delete button, and so how far an open row is moved */
  const DELETE_REM = 7;
  /** the row whose delete button shows, one at a time */
  let openId: string | null = $state(null);
  /** the loaded row, swiped: it says why it does not open */
  let refusedId: string | null = $state(null);
  let asking: PickerEntry | null = $state(null);
  let drag: { id: string; pointer: number; x: number; y: number; dx: number; width: number; gesture: RowGesture } | null =
    $state(null);
  /** A drag of a row ends in a click on it, which must not select. */
  let dragged = false;
  let listEl: HTMLUListElement | undefined = $state();

  async function read() {
    error = null;
    try {
      records = await skin.client.listProfiles();
      selectedId ??= pickerEntries(records).find(isLoaded)?.id ?? null;
    } catch (cause) {
      error = `The profiles could not be read: ${errorMessage(cause)}`;
    }
  }

  /** The picker opens on the loaded profile, in the middle of the list, not at its top (founder, 2026-10-24). */
  async function showLoaded() {
    await tick();
    listEl?.querySelector('[data-loaded="true"]')?.scrollIntoView({ block: 'center' });
  }

  async function act(what: string, run: () => Promise<void>) {
    busy = true;
    error = null;
    try {
      await run();
    } catch (cause) {
      error = `${what}: ${errorMessage(cause)}`;
    } finally {
      busy = false;
    }
  }

  /**
   * A tap selects a profile and shows it; 'load' loads it (founder, 2026-10-17, overriding the
   * tap that loaded of 2026-10-13) and goes back: to the editor when it opened the picker,
   * which opens the profile in its editor (spec 3.6), to home otherwise. A default loads as
   * the skin holds it, without a record (spec 3.8, T5).
   */
  const load = (entry: PickerEntry) =>
    act('The profile could not be loaded', async () => {
      // Unsaved edits on the machine are asked about first (founder, 2026-10-14).
      const answer = await skin.mayLoad();
      if (answer === 'save-as') skin.openSaveAs();
      if (answer !== 'load') return;
      skin.workflow = await loadEntry(skin.client, entry);
      skin.go(skin.back());
    });

  /**
   * A row's swipe (spec 3.10): to the left opens its delete button, back to the right closes
   * it; a vertical drag is the list's (`touch-action: pan-y`). The skin's defaults do not move;
   * the loaded profile does not either, and says why.
   */
  function down(event: PointerEvent, entry: PickerEntry) {
    if (busy || !event.isPrimary) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    drag = {
      id: entry.id,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      width: DELETE_REM * rem,
      gesture: null,
    };
    dragged = false;
  }

  function move(event: PointerEvent, entry: PickerEntry) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    if (!drag.gesture) {
      drag.gesture = rowGesture(dx, event.clientY - drag.y);
      if (drag.gesture !== 'row') {
        if (drag.gesture === 'scroll') drag = null;
        return;
      }
      dragged = true;
      const refusal = deleteRefusal(entry, current);
      if (refusal) {
        if (refusal === 'loaded' && dx < 0) refusedId = entry.id;
        drag = null;
        return;
      }
      if (openId !== entry.id) openId = null;
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    }
    drag.dx = dx;
  }

  function up(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (drag.gesture === 'row') openId = settlesOpen(openId === drag.id, drag.dx, drag.width) ? drag.id : null;
    drag = null;
  }

  /** How far a row's right end is moved, in px, while it is dragged; null while it rests. */
  function dragOffset(entry: PickerEntry): number | null {
    if (drag?.id !== entry.id || drag.gesture !== 'row') return null;
    return rowOffset(openId === entry.id, drag.dx, drag.width);
  }

  /** A tap anywhere but the open row closes it; the loaded row's reason goes with the next tap. */
  function outside(event: PointerEvent) {
    refusedId = null;
    if (openId && !(event.target as Element).closest('[data-open="true"]')) openId = null;
  }

  /** A tap on a row selects it and closes an open row; a drag that ended on it does not select. */
  function tap(entry: PickerEntry) {
    if (dragged) {
      dragged = false;
      return;
    }
    openId = null;
    selectedId = entry.id;
  }

  /** 'delete' asks once, then Decaid deletes the record and the list is read again. */
  const remove = (entry: PickerEntry) =>
    act('The profile could not be deleted', async () => {
      asking = null;
      openId = null;
      records = await deleteEntry(skin.client, entry);
      if (selectedId === entry.id) selectedId = null;
    });

  onMount(async () => {
    await read();
    await showLoaded();
  });
</script>

<svelte:window onpointerdown={outside} />

<div class="profiles">
  <section class="list" data-main-frame>
    {#if error}
      <div class="offer error" data-testid="profiles-error">
        <span>{error}</span>
        <button data-testid="profiles-retry" onclick={read}>try again</button>
      </div>
    {/if}
    <input
      class="filter"
      type="search"
      placeholder="filter by name"
      aria-label="filter by name"
      autocomplete="off"
      spellcheck="false"
      data-testid="profile-filter"
      bind:value={filter}
    />
    <ul data-testid="profile-list" bind:this={listEl}>
      {#each shown as entry (entry.id)}
        {@const offset = dragOffset(entry)}
        {@const open = openId === entry.id}
        <!-- The row's drags are its own, never the shell's page swipe (data-no-swipe). -->
        <li
          class="row"
          class:open
          style:--delete-width={`${DELETE_REM}rem`}
          data-open={open}
          data-no-swipe
          onpointerdown={(event) => down(event, entry)}
          onpointermove={(event) => move(event, entry)}
          onpointerup={up}
          onpointercancel={() => (drag = null)}
        >
          {#if open || offset !== null}
            <button class="delete" data-testid="profile-delete" disabled={busy} onclick={() => (asking = entry)}>delete</button>
          {/if}
          <button
            class="item"
            class:dragging={offset !== null}
            style:width={offset === null ? undefined : `calc(100% + ${offset}px)`}
            aria-pressed={entry.id === selectedId}
            data-testid="profile-item"
            data-id={entry.id}
            data-default={entry.isDefault}
            data-loaded={isLoaded(entry)}
            disabled={busy}
            onclick={() => tap(entry)}
          >
            <span class="title">{entry.profile.title}</span>
            {#if refusedId === entry.id}<span class="refusal" data-testid="profile-refusal">{LOADED_REFUSAL}</span>
            {:else}
              {#if isLoaded(entry)}<span class="tag loaded">loaded</span>{/if}
              {#if entry.isDefault}<span class="tag" data-testid="default-tag">A-Flow 3.0 default</span>
              {:else if isAFlow3(entry)}<span class="tag">A-Flow 3.0</span>{/if}
            {/if}
          </button>
        </li>
      {:else}
        <li class="empty" data-testid="profiles-empty">
          {`No profile name holds “${filter.trim()}”.`}
        </li>
      {/each}
    </ul>
  </section>

  <aside data-testid="profile-detail" data-main-frame>
    {#if selected}
      {@const profile = selected.profile}
      {@const dose = doseOf(profile, selected.metadata)}
      {@const description = profileDescription(profile)}
      <!-- Every line of the panel but the description holds its place for every profile: the title
           is one line, the author's and the A-Flow note's lines are there when empty. -->
      <h1>{profile.title}</h1>
      <p class="author" data-testid="profile-author">{profile.author ? `by ${profile.author}` : ''}</p>
      <dl>
        <div>
          <dt>steps</dt>
          <dd>{profile.steps.length}</dd>
        </div>
        <div>
          <dt>stop at</dt>
          <dd>{profile.target_weight ? `${profile.target_weight} g` : '–'}</dd>
        </div>
        <div>
          <dt>dose</dt>
          <dd>{dose === undefined ? '–' : `${dose} g`}</dd>
        </div>
      </dl>
      <!-- The modelled shot of its steps, without labels, its targets dotted under it (spec 3.16); an A-Flow pour's targets as far as its editor draws them. -->
      <div class="preview" data-testid="profile-preview">
        <StepPreview {profile} bare estimate lastStepSeconds={previewLastStepSeconds(selected)} />
      </div>
      <p class="caption" data-testid="profile-caption">estimate from the steps, a real shot differs with the coffee</p>
      <!-- Notes of version 1 hold the A-Flow parameters (editor/storage.ts): only the text shows. -->
      <p class="notes" data-testid="profile-description">{description}</p>
      <p class="aflow">{dose === undefined ? '' : 'A-Flow 3.0: once it is loaded, the editor opens on it.'}</p>
      <button class="load" data-testid="load-profile" disabled={busy} onclick={() => load(selected)}>load</button>
    {:else}
      <p class="hint">Tap a profile to see it; load sends it to the machine.</p>
    {/if}
  </aside>
</div>

{#if asking}
  {@const entry = asking}
  <Confirm
    title={`Delete ${entry.profile.title}?`}
    text="The picker no longer lists it. Decaid keeps the record, marked deleted, with its versions."
    ok="Delete"
    onok={() => remove(entry)}
    oncancel={() => (asking = null)}
  />
{/if}

<style>
  .profiles {
    height: 100%;
    box-sizing: border-box;
    padding: 1rem 1.2rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 24rem;
    gap: 1.2rem;
  }

  .list {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  .offer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0.6rem 0.6rem 1rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--raised);
    color: var(--dim);
  }

  .offer.error span {
    color: var(--warn);
  }

  .offer button {
    flex: none;
    min-height: 3rem;
    min-width: 7rem;
    padding: 0 1rem;
    font-size: var(--text-body);
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }

  .filter {
    flex: none;
    min-height: 3rem;
    padding: 0 1rem;
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    box-sizing: border-box;
    width: 100%;
  }

  .filter::placeholder {
    color: var(--dim);
  }

  ul {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    scrollbar-width: thin;
  }

  /* The delete button rests under the row's right end; the row narrows to show it, its title kept. */
  .row {
    position: relative;
    flex: none;
    touch-action: pan-y;
  }

  .delete {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: calc(var(--delete-width) - 0.4rem);
    font-size: var(--text-body);
    font-weight: 600;
    background: var(--warn);
    border-color: var(--warn);
    color: var(--bg);
  }

  .item {
    position: relative;
    touch-action: pan-y;
    transition: width 0.2s ease;
    width: 100%;
    min-height: 3.4rem;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: var(--text-body);
    text-align: left;
  }

  .item.dragging {
    transition: none;
  }

  .open .item {
    width: calc(100% - var(--delete-width));
  }

  .refusal {
    flex: none;
    color: var(--warn);
    font-size: var(--text-label);
  }

  .item[aria-pressed='true'] .refusal {
    color: inherit;
  }

  .item[aria-pressed='true'] {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .tag {
    flex: none;
    padding: 0.15rem 0.6rem;
    border: 1px solid currentColor;
    border-radius: 1rem;
    font-size: var(--text-label);
    font-weight: 400;
    opacity: 0.75;
  }

  .tag.loaded {
    color: var(--pressure);
    opacity: 1;
  }

  .item[aria-pressed='true'] .tag.loaded {
    color: inherit;
  }

  .empty,
  .hint {
    color: var(--dim);
    padding: 1rem;
  }

  aside {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.1rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  h1 {
    margin: 0;
    font-size: var(--text-title);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  p {
    margin: 0;
  }

  h1,
  .author,
  dl {
    flex: none;
  }

  .author {
    min-height: 1lh;
    color: var(--dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  dl {
    margin: 0;
    display: flex;
    gap: 1.6rem;
  }

  dt {
    color: var(--dim);
    font-size: var(--text-label);
  }

  dd {
    margin: 0;
    font-size: var(--text-value);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /*
   * The graph is one square box at the panel's width for every profile; the description is the
   * buffer under it and scrolls. On a display too low for the square the graph gives way first,
   * down to 6 rem (the description's shrink is a thousandth of the graph's), then the description.
   */
  .preview {
    flex: 0 1 auto;
    width: 100%;
    aspect-ratio: 1 / 1;
    min-height: 6rem;
    display: flex;
  }

  .caption,
  .aflow {
    flex: none;
    min-height: 1lh;
    color: var(--dim);
    font-size: var(--text-label);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .notes {
    flex: 1 0.001 3lh;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    color: var(--dim);
    font-size: var(--text-body);
    white-space: pre-line;
    scrollbar-width: thin;
  }

  .load {
    flex: none;
    min-height: 3.4rem;
    font-size: var(--text-body);
    font-weight: 600;
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }

  .load:disabled {
    opacity: 0.5;
  }
</style>
