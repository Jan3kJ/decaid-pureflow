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
  import { mayMove, rowGesture, rowOffset, settlesAt, type RowGesture, type RowRest, type RowSides } from './row-swipe';

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

  /** rem, the width of a row's delete and rename buttons, and so how far an open row is moved */
  const DELETE_REM = 7;
  /** the open row, one at a time: its delete button shows when it rests moved left, its rename button when moved right */
  let openId: string | null = $state(null);
  let openAt: RowRest = $state(0);
  /** the loaded row, swiped to the left: it says why it does not open */
  let refusedId: string | null = $state(null);
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
    sides: RowSides;
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

  /** Where a row rests: moved left, moved right or closed. */
  const restOf = (entry: PickerEntry): RowRest => (openId === entry.id ? openAt : 0);

  /**
   * A row's swipe: to the left opens its delete button, to the right
   * its rename button, a move back closes it; a vertical drag is the list's (`touch-action:
   * pan-y`). The skin's defaults do not move; the loaded profile renames but does not delete,
   * and says why when moved to the left.
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
      sides: { left: deleteRefusal(entry, current) === null, right: !entry.isDefault },
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
      if (!mayMove(restOf(entry), dx, drag.sides)) {
        if (dx < 0 && deleteRefusal(entry, current) === 'loaded') refusedId = entry.id;
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
      const rest = settlesAt(openId === id ? openAt : 0, drag.dx, drag.width, drag.sides);
      openId = rest === 0 ? null : id;
      openAt = rest;
    }
    drag = null;
  }

  /** How far a row is moved, in px, while it is dragged (negative: to the left); null while it rests. */
  function dragOffset(entry: PickerEntry): number | null {
    if (drag?.id !== entry.id || drag.gesture !== 'row') return null;
    return rowOffset(restOf(entry), drag.dx, drag.width, drag.sides);
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
        <!-- The row's drags are its own, not the shell's page swipe (data-own-swipe), but for one
             from the screen's left edge, which goes back. -->
        <li
          class="row"
          class:open
          class:renaming={open && openAt === 1}
          style:--delete-width={`${DELETE_REM}rem`}
          data-open={open}
          data-own-swipe
          onpointerdown={(event) => down(event, entry)}
          onpointermove={(event) => move(event, entry)}
          onpointerup={up}
          onpointercancel={() => (drag = null)}
          onlostpointercapture={(event) => event.target === event.currentTarget && (drag = null)}
        >
          {#if (open && openAt === -1) || (offset !== null && offset < 0)}
            <button class="delete danger" data-testid="profile-delete" disabled={busy} onclick={() => (asking = entry)}>delete</button>
          {:else if (open && openAt === 1) || (offset !== null && offset > 0)}
            <button class="rename" data-testid="profile-rename" disabled={busy} onclick={() => askRename(entry)}>rename</button>
          {/if}
          <button
            class="item select-outline"
            class:dragging={offset !== null}
            style:width={offset === null ? undefined : `calc(100% - ${Math.abs(offset)}px)`}
            style:margin-left={offset === null || offset <= 0 ? undefined : `${offset}px`}
            aria-pressed={entry.id === selectedId}
            data-testid="profile-item"
            data-id={entry.id}
            data-default={entry.isDefault}
            data-loaded={isLoaded(entry)}
            disabled={busy}
            onclick={() => tap(entry)}
          >
            <span class="title">{entry.profile.title}</span>
            {#if refusedId === entry.id}<span class="refusal warning" data-testid="profile-refusal">{LOADED_REFUSAL}</span>
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
      <!-- The modelled shot of its steps, without labels, its targets dotted under it; an A-Flow pour's targets as far as its editor draws them. -->
      <div class="preview" data-testid="profile-preview">
        <StepPreview {profile} bare estimate lastStepSeconds={previewLastStepSeconds(selected)} />
      </div>
      <p class="caption" data-testid="profile-caption">estimate from the steps, a real shot differs with the coffee</p>
      <!-- The notes without the A-Flow line the skin writes, then for an A-Flow profile the text made from its values. -->
      <p class="notes" class:more data-more={more} data-testid="profile-description" bind:this={notesEl} onscroll={checkMore}>
        {description}
      </p>
      <p class="aflow">{dose === undefined ? '' : 'A-Flow 3.0: once it is loaded, the editor opens on it.'}</p>
      <!-- Edit loads too and opens the profile's editor; load goes back to where the picker was opened from. -->
      <div class="actions">
        <button class="edit" data-testid="edit-profile" disabled={busy} onclick={() => load(selected, 'edit')}>edit</button>
        <button class="load" data-testid="load-profile" disabled={busy} onclick={() => load(selected)}>load</button>
      </div>
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
    gap: var(--space-3);
    padding: var(--space-2) var(--space-2) var(--space-2) 1rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--raised);
    color: var(--dim);
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
    gap: var(--space-1);
    scrollbar-width: thin;
  }

  /* The delete button rests under the row's right end, the rename button under its left end; the
     row narrows to show one, its title kept. */
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
  }

  .rename {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: calc(var(--delete-width) - 0.4rem);
    font-size: var(--text-body);
    font-weight: 600;
    background: var(--dim);
    border-color: var(--dim);
    color: var(--bg);
  }

  .item {
    position: relative;
    touch-action: pan-y;
    transition:
      width 0.2s ease,
      margin-left 0.2s ease;
    width: 100%;
    min-height: 3.4rem;
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
    width: calc(100% - var(--delete-width));
  }

  .open.renaming .item {
    margin-left: var(--delete-width);
  }

  .refusal {
    flex: none;
    font-size: var(--text-label);
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
    padding: 0.15rem var(--space-2);
    border: 1px solid currentColor;
    border-radius: 1rem;
    font-size: var(--text-label);
    font-weight: 400;
    opacity: 0.75;
  }

  .tag.loaded {
    color: var(--accent);
    opacity: 1;
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
    gap: var(--space-2);
    padding: var(--space-3);
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

  .caption,
  .aflow {
    flex: none;
    min-height: 1lh;
    color: var(--dim);
    font-size: var(--text-label);
  }

  /* The A-Flow line is cut at its end; the caption is one sentence and never cut: a font wider
     than the tablet's gives it a second line, the same for every profile. */
  .aflow {
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
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--line);
    border-radius: 0.6rem;
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
    min-height: 3.4rem;
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
