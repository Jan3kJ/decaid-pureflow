<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProfileRecord } from '../api';
  import { readParams } from '../editor/storage';
  import {
    doseOf,
    isAFlow3,
    loadProfile,
    missingDefaults,
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

  const sorted = $derived(sortProfiles(records ?? []));
  const missing = $derived(records ? missingDefaults(records) : []);
  const selected = $derived(sorted.find((record) => record.id === selectedId) ?? null);
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
   * A tap loads the profile, as in other skins (founder, 2026-10-13), and goes back: to the
   * editor when it opened the picker and can edit the profile, to home otherwise.
   */
  const load = (record: ProfileRecord) =>
    act('The profile could not be loaded', async () => {
      selectedId = record.id;
      skin.workflow = await loadProfile(skin.client, record.profile);
      const fromEditor = skin.pickerReturn === 'editor';
      if (fromEditor && readParams(record.profile)) {
        skin.go('editor');
        return;
      }
      skin.go('home');
      if (fromEditor) {
        skin.notice = `“${record.profile.title}” is loaded. It is not an A-Flow 3.0 profile: it can be loaded, but not edited.`;
      }
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
    <ul data-testid="profile-list">
      {#each sorted as record (record.id)}
        <li>
          <button
            class="item"
            aria-pressed={record.id === selectedId}
            data-testid="profile-item"
            data-id={record.id}
            disabled={busy}
            onclick={() => load(record)}
          >
            <span class="title">{record.profile.title}</span>
            {#if isLoaded(record)}<span class="tag loaded">loaded</span>{/if}
            {#if isAFlow3(record)}<span class="tag">A-Flow 3.0</span>{/if}
          </button>
        </li>
      {:else}
        <li class="empty">{records ? 'Decaid has no profiles.' : error ? '' : 'Reading the profiles …'}</li>
      {/each}
    </ul>
  </section>

  <aside data-testid="profile-detail">
    {#if selected}
      {@const profile = selected.profile}
      {@const dose = doseOf(profile)}
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
      {#if dose !== undefined}
        <!-- Its notes hold the A-Flow parameters (editor/storage.ts), not a text to read. -->
        <p class="notes">A-Flow 3.0: once it is loaded, the editor opens on it.</p>
      {:else if profile.notes}
        <p class="notes">{profile.notes}</p>
      {/if}
    {:else}
      <p class="hint">Tap a profile to load it.</p>
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

  .notes {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    color: var(--dim);
    font-size: 0.95rem;
    white-space: pre-line;
  }
</style>
