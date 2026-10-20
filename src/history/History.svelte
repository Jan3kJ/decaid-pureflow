<script lang="ts">
  // The shot history (spec 3.1, 3.5): an overlay from the left edge over home. One entry per
  // profile and bean; a tap on one restores it, a tap outside closes the overlay.
  import { onMount } from 'svelte';
  import type { Skin } from '../shell/skin.svelte';
  import { beanLabel, groupShots, readShots, type HistoryEntry } from './entries';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  let entries: HistoryEntry[] | null = $state.raw(null);
  let error: string | null = $state(null);

  async function read() {
    error = null;
    try {
      entries = groupShots(await readShots(skin.client));
    } catch (cause) {
      error = `The shots could not be read: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  }

  /** A shot's start is local time without a zone. */
  function when(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${day}, ${time}`;
  }

  onMount(read);
</script>

<!-- The tap outside: everything that is not the panel. -->
<button class="outside" aria-label="close the shot history" data-testid="history-outside" onclick={() => (skin.historyOpen = false)}
></button>

<aside data-testid="history">
  <h1>Shot history</h1>
  {#if error}
    <p class="error" data-testid="history-error">{error}</p>
    <button class="retry" data-testid="history-retry" onclick={read}>try again</button>
  {/if}
  <ul data-testid="history-list">
    {#each entries ?? [] as entry (entry.key)}
      <li>
        <button class="entry" data-testid="history-entry" data-shot={entry.latest.id} onclick={() => skin.restore(entry)}>
          <strong data-testid="entry-profile">{entry.profileTitle}</strong>
          <span class="bean" class:none={!entry.bean} data-testid="entry-bean">{beanLabel(entry.bean)}</span>
          <span class="foot">
            <span data-testid="entry-grinder">{entry.grinderSetting ? `grinder ${entry.grinderSetting}` : ''}</span>
            <span data-testid="entry-when">
              {when(entry.latest.timestamp)}{entry.shots > 1 ? ` · ${entry.shots} shots` : ''}
            </span>
          </span>
        </button>
      </li>
    {:else}
      {#if !error}
        <li class="empty" data-testid="history-empty">{entries ? 'No shots yet.' : 'Reading the shots …'}</li>
      {/if}
    {/each}
  </ul>
</aside>

<style>
  .outside {
    position: absolute;
    inset: 0;
    z-index: 10;
    border: 0;
    background: rgb(0 0 0 / 55%);
  }

  aside {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 11;
    width: 34%;
    min-width: 24rem;
    max-width: 90%;
    box-sizing: border-box;
    padding: 1rem 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    background: var(--panel);
    border-right: 1px solid var(--line);
    box-shadow: 0.6rem 0 2.4rem rgb(0 0 0 / 60%);
    animation: slide 0.16s ease-out;
  }

  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
  }

  h1 {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
  }

  button {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  ul {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0 0 1rem;
    list-style: none;
    overflow-y: auto;
    overscroll-behavior: contain;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    scrollbar-width: thin;
  }

  .entry {
    width: 100%;
    min-height: 5.6rem;
    padding: 0.7rem 1rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.2rem;
    text-align: left;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--raised);
  }

  .entry strong,
  .bean {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entry strong {
    font-size: 1.15rem;
    font-weight: 600;
  }

  .bean.none,
  .foot {
    color: var(--dim);
  }

  .foot {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .foot span:first-child {
    color: var(--fg);
  }

  .empty {
    padding: 1rem 0.2rem;
    color: var(--dim);
  }

  .error {
    margin: 0;
    color: var(--warn);
  }

  .retry {
    flex: none;
    min-height: 3.2rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--raised);
  }
</style>
