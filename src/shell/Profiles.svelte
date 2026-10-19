<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProfileRecord } from '../api';
  import StepPreview from '../steps/StepPreview.svelte';
  import {
    doseOf,
    filterProfiles,
    isAFlow3,
    loadRecord,
    missingDefaults,
    profileDescription,
    sameProfile,
    saveDefaults,
    sortProfiles,
  } from './profiles';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  let records: ProfileRecord[] | null = $state.raw(null);
  let selectedId: string | null = $state(null);
  let busy = $state(false);
  let error: string | null = $state(null);
  /** The filter is not kept: the picker opens with the whole list. */
  let filter = $state('');

  const sorted = $derived(sortProfiles(records ?? []));
  const shown = $derived(filterProfiles(sorted, filter));
  const missing = $derived(records ? missingDefaults(records) : []);
  // A selected profile the filter hides is not shown, nor loaded; it is again once the filter lets it through.
  const selected = $derived(shown.find((record) => record.id === selectedId) ?? null);
  const current = $derived(skin.workflow?.profile);
  const isLoaded = (record: ProfileRecord) => !!current && sameProfile(record.profile, current);
  const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

  async function read() {
    error = null;
    try {
      records = await skin.client.listProfiles();
      selectedId ??= sortProfiles(records).find(isLoaded)?.id ?? null;
    } catch (cause) {
      error = `The profiles could not be read: ${message(cause)}`;
    }
  }

  async function act(what: string, run: () => Promise<void>) {
    busy = true;
    error = null;
    try {
      await run();
    } catch (cause) {
      error = `${what}: ${message(cause)}`;
    } finally {
      busy = false;
    }
  }

  const addDefaults = () =>
    act('The defaults could not be saved', async () => {
      const added = await saveDefaults(skin.client, missing);
      await read();
      selectedId = added[0]?.id ?? selectedId;
    });

  /**
   * A tap selects a profile and shows it; 'load' loads it (founder, 2026-10-17, overriding the
   * tap that loaded of 2026-10-13) and goes back: to the editor when it opened the picker,
   * which opens the profile in its editor (spec 3.6), to home otherwise.
   */
  const load = (record: ProfileRecord) =>
    act('The profile could not be loaded', async () => {
      // Unsaved edits on the machine are asked about first (founder, 2026-10-14).
      const answer = await skin.mayLoad();
      if (answer === 'save-as') skin.openSaveAs();
      if (answer !== 'load') return;
      skin.workflow = await loadRecord(skin.client, record);
      skin.go(skin.pickerReturn === 'editor' ? 'editor' : 'home');
    });

  onMount(read);
</script>

<div class="profiles">
  <section class="list">
    {#if missing.length > 0}
      <div class="offer" data-testid="offer-defaults">
        <span>
          <strong>A-Flow 3.0 defaults</strong>
          {missing.map((entry) => entry.id.replace('default-', '')).join(', ')}: not in Decaid yet
        </span>
        <button data-testid="add-defaults" disabled={busy} onclick={addDefaults}>
          add {missing.length}
        </button>
      </div>
    {/if}
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
    <ul data-testid="profile-list">
      {#each shown as record (record.id)}
        <li>
          <button
            class="item"
            aria-pressed={record.id === selectedId}
            data-testid="profile-item"
            data-id={record.id}
            disabled={busy}
            onclick={() => (selectedId = record.id)}
          >
            <span class="title">{record.profile.title}</span>
            {#if isLoaded(record)}<span class="tag loaded">loaded</span>{/if}
            {#if isAFlow3(record)}<span class="tag">A-Flow 3.0</span>{/if}
          </button>
        </li>
      {:else}
        <li class="empty" data-testid="profiles-empty">
          {records
            ? records.length > 0
              ? `No profile name holds “${filter.trim()}”.`
              : 'Decaid has no profiles.'
            : error
              ? ''
              : 'Reading the profiles …'}
        </li>
      {/each}
    </ul>
  </section>

  <aside data-testid="profile-detail">
    {#if selected}
      {@const profile = selected.profile}
      {@const dose = doseOf(profile, selected.metadata)}
      {@const description = profileDescription(profile)}
      <h1>{profile.title}</h1>
      {#if profile.author}<p class="author">by {profile.author}</p>{/if}
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
      <!-- The targets of its steps, without labels: only to see the steps and their values (founder, 2026-10-17). -->
      <div class="preview" data-testid="profile-preview">
        <StepPreview {profile} bare />
      </div>
      <!-- Notes of version 1 hold the A-Flow parameters (editor/storage.ts): only the text shows. -->
      {#if description}
        <p class="notes" data-testid="profile-description">{description}</p>
      {/if}
      {#if dose !== undefined}
        <p class="aflow">A-Flow 3.0: once it is loaded, the editor opens on it.</p>
      {/if}
      <button class="load" data-testid="load-profile" disabled={busy} onclick={() => load(selected)}>load</button>
    {:else}
      <p class="hint">Tap a profile to see it; load sends it to the machine.</p>
    {/if}
  </aside>
</div>

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

  .offer strong {
    display: block;
    color: var(--fg);
    font-weight: 600;
  }

  .offer.error span {
    color: var(--warn);
  }

  .offer button {
    flex: none;
    min-height: 3rem;
    min-width: 7rem;
    padding: 0 1rem;
    font-size: 1rem;
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
    font-size: 1.1rem;
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

  .item {
    width: 100%;
    min-height: 3.4rem;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 1.1rem;
    text-align: left;
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
  }

  .tag {
    flex: none;
    padding: 0.15rem 0.6rem;
    border: 1px solid currentColor;
    border-radius: 1rem;
    font-size: 0.8rem;
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
    font-size: 1.5rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  p {
    margin: 0;
  }

  .author {
    color: var(--dim);
  }

  dl {
    margin: 0;
    display: flex;
    gap: 1.6rem;
  }

  dt {
    color: var(--dim);
    font-size: 0.85rem;
  }

  dd {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* The preview takes what the panel leaves; the description below it scrolls when long. */
  .preview {
    flex: 1 1 0;
    min-height: 6rem;
    display: flex;
  }

  .notes {
    flex: 0 1 auto;
    max-height: 30%;
    min-height: 0;
    overflow-y: auto;
    color: var(--dim);
    font-size: 0.95rem;
    white-space: pre-line;
  }

  .aflow {
    color: var(--dim);
    font-size: 0.9rem;
  }

  .load {
    flex: none;
    min-height: 3.4rem;
    font-size: 1.2rem;
    font-weight: 600;
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }

  .load:disabled {
    opacity: 0.5;
  }
</style>
