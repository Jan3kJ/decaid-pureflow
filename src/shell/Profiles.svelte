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
    loadRecord,
    pickerEntries,
    previewLastStepSeconds,
    profileDescription,
    renameAnswer,
    renameEntry,
    sameProfile,
    screenAfter,
    type PickerAction,
    type PickerEntry,
  } from './profiles';
  import type { Skin } from './skin.svelte';
  import { errorMessage } from '../error-message';
  import { mayMove, rowGesture, rowOffset, settlesOpen, type RowGesture } from './row-swipe';

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

  // The skin's defaults first, marked; stored copies under their titles are not listed.
  const entries = $derived(pickerEntries(records ?? []));
  const shown = $derived(filterProfiles(entries, filter));
  // A selected profile the filter hides is not shown, nor loaded; it is again once the filter lets it through.
  const selected = $derived(shown.find((entry) => entry.id === selectedId) ?? null);
  const current = $derived(skin.workflow?.profile);
  const isLoaded = (entry: PickerEntry) => !!current && sameProfile(entry.profile, current);

  /** rem, the width of one of a row's buttons; an open row is moved by the width of the buttons it has */
  const BUTTON_REM = 7;
  /** the open row, one at a time: moved to the left, its buttons under its right end */
  let openId: string | null = $state(null);
  let asking: PickerEntry | null = $state(null);
  /** the rename dialog: the row, the title as typed, the reason it was refused */
  let renaming: { entry: PickerEntry; title: string; refusal: string | null } | null = $state(null);
  let drag: {
    id: string;
    pointer: number;
    x: number;
    y: number;
    dx: number;
    width: number;
    gesture: RowGesture;
  } | null = $state(null);
  /** A drag of a row ends in a click on it, which must not select. */
  let dragged = false;
  let listEl: HTMLUListElement | undefined = $state();

  async function read() {
    error = null;
    try {
      records = await skin.client.listProfiles();
    } catch (cause) {
      error = `The profiles could not be read: ${errorMessage(cause)}`;
    }
  }

  /**
   * The picker opens on the loaded profile: selected, its detail shown, in the middle of the list,
   * not at its top. Once, when the list and the workflow are both known; the
   * defaults are listed alone while the gateway's list is not read.
   */
  let opened = false;
  $effect(() => {
    if (opened || !current) return;
    const loaded = entries.find(isLoaded);
    if (!loaded) return;
    opened = true;
    selectedId ??= loaded.id;
    void tick().then(() => listEl?.querySelector('[data-loaded="true"]')?.scrollIntoView({ block: 'center' }));
  });

  /**
   * The description's lower border is the accent while more of its text lies below the visible
   * part; checked on its scrolling, on a new text and on a new size.
   */
  let notesEl: HTMLParagraphElement | undefined = $state();
  let more = $state(false);
  function checkMore() {
    more = !!notesEl && notesEl.scrollHeight - notesEl.scrollTop - notesEl.clientHeight > 1;
  }
  $effect(() => {
    const el = notesEl;
    void selected?.id;
    void (selected && profileDescription(selected));
    if (!el) {
      more = false;
      return;
    }
    el.scrollTop = 0;
    checkMore();
    const observer = new ResizeObserver(checkMore);
    observer.observe(el);
    return () => observer.disconnect();
  });

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
   * A tap selects a profile and shows it; 'load' loads it
   * and goes back: to the editor when it opened the picker,
   * which opens the profile in its editor, to home otherwise. A default loads as
   * the skin holds it, without a record.
   */
  const load = (entry: PickerEntry, action: PickerAction = 'load') =>
    act('The profile could not be loaded', async () => {
      // Unsaved edits on the machine are asked about first.
      const answer = await skin.mayLoad();
      if (answer === 'save-as') skin.openSaveAs();
      if (answer !== 'load') return;
      skin.workflow = await loadEntry(skin.client, entry);
      skin.go(screenAfter(action, skin.back()));
    });

  /**
   * A row's buttons, rename left of delete: the skin's defaults have none, the loaded profile
   * renames but does not delete.
   */
  const buttonsOf = (entry: PickerEntry) => ({ rename: !entry.isDefault, delete: deleteRefusal(entry, current) === null });
  const buttonCount = (entry: PickerEntry) => Object.values(buttonsOf(entry)).filter(Boolean).length;

  /**
   * A row's swipe: to the left opens it, its buttons under its right end; to the right closes an
   * open row, and on a closed row it is the page's swipe back (`data-own-swipe="left"`); a vertical
   * drag is the list's (`touch-action: pan-y`).
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
      width: buttonCount(entry) * BUTTON_REM * rem,
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
      if (!mayMove(openId === entry.id, dx, drag.width > 0)) {
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
    if (drag.gesture === 'row') {
      const id = drag.id;
      openId = settlesOpen(openId === id, drag.dx, drag.width) ? id : null;
    }
    drag = null;
  }

  /** How far a row is moved, in px, while it is dragged (negative: to the left); null while it rests. */
  function dragOffset(entry: PickerEntry): number | null {
    if (drag?.id !== entry.id || drag.gesture !== 'row') return null;
    return rowOffset(openId === entry.id, drag.dx, drag.width);
  }

  /** A tap anywhere but the open row closes it. */
  function outside(event: PointerEvent) {
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

  /** 'rename' opens the dialog on the title as it is. */
  function askRename(entry: PickerEntry) {
    renaming = { entry, title: entry.profile.title, refusal: null };
  }

  /**
   * The dialog's Rename: a refused title says why and keeps the dialog, the
   * title as it was closes it; otherwise Decaid renames the record, the list is read again and the
   * renamed row is selected and shown. The loaded profile is loaded again under its new title, so
   * the workflow, the machine and the 'loaded' tag agree.
   */
  function confirmRename() {
    if (!renaming) return;
    const { entry } = renaming;
    const answer = renameAnswer(renaming.title, entry, entries);
    if (answer !== 'same' && 'refusal' in answer) {
      renaming.refusal = answer.refusal;
      return;
    }
    renaming = null;
    openId = null;
    if (answer === 'same') return;
    const wasLoaded = isLoaded(entry);
    void act('The profile could not be renamed', async () => {
      const done = await renameEntry(skin.client, entry, answer.title);
      records = done.records;
      selectedId = done.record.id;
      if (filterProfiles([done.record], filter).length === 0) filter = '';
      if (wasLoaded) skin.workflow = await loadRecord(skin.client, done.record);
      await tick();
      listEl?.querySelector(`[data-id="${CSS.escape(done.record.id)}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  onMount(read);
</script>

<svelte:window onpointerdown={outside} />

<div class="profiles">
  <section class="list" data-main-frame>
    {#if error}
      <div class="offer error" data-testid="profiles-error">
        <span class="warning">{error}</span>
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
        {@const buttons = buttonsOf(entry)}
        <!-- The open row's drags are its own, not the shell's page swipe (data-own-swipe); a closed
             row's are its own only to the left, to the right it goes back, as from the screen's
             left edge over any row. -->
        <li
          class="row"
          class:open
          style:--buttons-width={`${buttonCount(entry) * BUTTON_REM}rem`}
          data-open={open}
          data-own-swipe={open ? '' : 'left'}
          onpointerdown={(event) => down(event, entry)}
          onpointermove={(event) => move(event, entry)}
          onpointerup={up}
          onpointercancel={() => (drag = null)}
          onlostpointercapture={(event) => event.target === event.currentTarget && (drag = null)}
        >
          {#if open || (offset !== null && offset < 0)}
            <div class="buttons">
              {#if buttons.rename}
                <button class="rename" data-testid="profile-rename" disabled={busy} onclick={() => askRename(entry)}>rename</button>
              {/if}
              {#if buttons.delete}
                <button class="delete danger" data-testid="profile-delete" disabled={busy} onclick={() => (asking = entry)}
                  >delete</button
                >
              {/if}
            </div>
          {/if}
          <button
            class="item select-outline"
            class:dragging={offset !== null}
            style:width={offset === null ? undefined : `calc(100% - ${-offset}px)`}
            aria-pressed={entry.id === selectedId}
            data-testid="profile-item"
            data-id={entry.id}
            data-default={entry.isDefault}
            data-loaded={isLoaded(entry)}
            disabled={busy}
            onclick={() => tap(entry)}
          >
            <span class="title truncate">{entry.profile.title}</span>
            <!-- The loaded row, open, says why it has no delete. -->
            {#if open && deleteRefusal(entry, current) === 'loaded'}<span class="refusal warning" data-testid="profile-refusal"
                >{LOADED_REFUSAL}</span
              >
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
      {@const description = profileDescription(selected)}
      <!-- Every line of the panel but the description holds its place for every profile: the title
           is one line, the author's and the A-Flow note's lines are there when empty. -->
      <h1 class="truncate">{profile.title}</h1>
      <p class="author truncate" data-testid="profile-author">{profile.author ? `by ${profile.author}` : ''}</p>
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
      <!-- The modelled shot of its steps, without labels, its targets dotted under it; an A-Flow pour's targets as far as its editor draws them. -->
      <div class="preview" data-testid="profile-preview">
        <StepPreview {profile} bare estimate lastStepSeconds={previewLastStepSeconds(selected)} />
      </div>
      <!-- The notes without the A-Flow line the skin writes, then for an A-Flow profile the text made from its values. -->
      <p class="notes" class:more data-more={more} data-testid="profile-description" bind:this={notesEl} onscroll={checkMore}>
        {description}
      </p>
      <!-- Edit loads too and opens the profile's editor; load goes back to where the picker was opened from. -->
      <div class="actions">
        <button class="edit" data-testid="edit-profile" disabled={busy} onclick={() => load(selected, 'edit')}>edit</button>
        <button class="load" data-testid="load-profile" disabled={busy} onclick={() => load(selected)}>load</button>
      </div>
    {:else}
      <p class="empty">Tap a profile to see it; load sends it to the machine.</p>
    {/if}
  </aside>
</div>

{#if asking}
  {@const entry = asking}
  <Confirm
    title={`Delete ${entry.profile.title}?`}
    text="The picker no longer lists it. Decaid keeps the record, marked deleted, with its versions."
    ok="delete"
    danger
    onok={() => remove(entry)}
    oncancel={() => (asking = null)}
  />
{/if}

{#if renaming}
  <Confirm
    title={`Rename ${renaming.entry.profile.title}`}
    label="the profile's name"
    ok="rename"
    bind:value={renaming.title}
    error={renaming.refusal}
    onok={confirmRename}
    oncancel={() => (renaming = null)}
  />
{/if}

<style>
  .profiles {
    height: 100%;
    box-sizing: border-box;
    padding: 1rem var(--space-3);
    display: grid;
    grid-template-columns: minmax(0, 1fr) 24rem;
    gap: var(--space-3);
  }

  .list {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  button {
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: var(--radius);
  }

  .offer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-2) var(--space-2) 1rem;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--raised);
    color: var(--dim);
  }

  .offer button {
    flex: none;
    min-height: var(--control);
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
    min-height: var(--control);
    padding: 0 1rem;
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
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
    gap: var(--space-1);
    scrollbar-width: thin;
  }

  /* The buttons rest under the row's right end, rename left of delete; the row narrows to show
     them, its title kept. */
  .row {
    position: relative;
    flex: none;
    touch-action: pan-y;
  }

  .buttons {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: calc(var(--buttons-width) - var(--space-1));
    display: flex;
    gap: var(--space-1);
  }

  .delete,
  .rename {
    flex: 1 1 0;
    min-width: 0;
    font-size: var(--text-body);
    font-weight: 600;
  }

  .rename {
    background: var(--dim);
    border-color: var(--dim);
    color: var(--bg);
  }

  .item {
    position: relative;
    touch-action: pan-y;
    transition: width var(--motion) ease;
    width: 100%;
    min-height: var(--control-tall);
    padding: 0 1rem;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-body);
    text-align: left;
  }

  .item.dragging {
    transition: none;
  }

  .open .item {
    width: calc(100% - var(--buttons-width));
  }

  .refusal {
    flex: none;
    font-size: var(--text-label);
  }

  .title {
    flex: 1;
    min-width: 0;
    font-weight: 600;
  }

  .tag {
    flex: none;
    padding: 0.15rem var(--space-2);
    border: 1px solid currentColor;
    border-radius: var(--radius-pill);
    font-size: var(--text-label);
    font-weight: 400;
    opacity: 0.75;
  }

  .tag.loaded {
    color: var(--accent);
    opacity: 1;
  }

  .empty {
    color: var(--dim);
    padding: 1rem;
  }

  aside {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
  }

  h1 {
    margin: 0;
    font-size: var(--text-title);
    font-weight: 600;
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
  }

  dl {
    margin: 0;
    display: flex;
    gap: var(--space-3);
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

  .notes {
    flex: 1 0.001 3lh;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    color: var(--dim);
    font-size: var(--text-body);
    white-space: pre-line;
    scrollbar-width: thin;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-small);
  }

  .notes.more {
    border-bottom-color: var(--accent);
  }

  .actions {
    flex: none;
    display: flex;
    gap: var(--space-2);
  }

  .edit,
  .load {
    flex: 1 1 0;
    min-width: 0;
    min-height: var(--control-big);
    font-size: var(--text-body);
    font-weight: 600;
  }

  .load {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }

  .edit:disabled,
  .load:disabled {
    opacity: 0.5;
  }
</style>
