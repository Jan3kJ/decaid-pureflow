<script lang="ts">
  // The shot history (spec 3.1, 3.5): an overlay from the left edge over home. One entry per
  // profile and bean; a tap on one restores it, a tap outside closes the overlay. The shots are
  // the skin's (`ShotCache`, spec 3.8): shown at once, and what is new is read on opening.
  // Above the list, the filter by a bean and a grinder of Decaid's catalogue (spec 3.9 item 19,
  // research.md 29.6): it works on the shots held, the catalogue is read on opening.
  import { onMount } from 'svelte';
  import type { Skin } from '../shell/skin.svelte';
  import { beanTitle } from '../beans/catalogue';
  import { NO_FILTER, beanLabel, filterShots, grinderLabel, groupShots } from './entries';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  const catalogue = $derived(skin.catalogue);
  const filter = $derived(skin.historyFilter);
  const filtered = $derived(filter.beanId !== null || filter.grinderId !== null);
  // An entry's place depends on its newest shot, so the older shots arriving add entries below.
  const entries = $derived(groupShots(filterShots(skin.shots.shots, filter, catalogue), catalogue));
  const error = $derived(skin.shots.error && `The shots could not be read: ${skin.shots.error}`);

  /** The filter's choice being made: the catalogue's beans or grinders in the list's place. */
  let choosing: 'bean' | 'grinder' | null = $state(null);
  const byTitle = (a: { title: string; archived: boolean }, b: { title: string; archived: boolean }) =>
    Number(a.archived) - Number(b.archived) || a.title.localeCompare(b.title);
  const beanOptions = $derived(
    catalogue.beans.map((bean) => ({ id: bean.id, title: beanTitle(bean), archived: bean.archived })).sort(byTitle),
  );
  const grinderOptions = $derived(
    catalogue.grinders.map((grinder) => ({ id: grinder.id, title: grinder.model, archived: grinder.archived })).sort(byTitle),
  );
  const options = $derived(choosing === 'bean' ? beanOptions : grinderOptions);
  const beanChosen = $derived(beanOptions.find((option) => option.id === filter.beanId)?.title ?? 'bean');
  const grinderChosen = $derived(grinderOptions.find((option) => option.id === filter.grinderId)?.title ?? 'grinder');

  function choose(id: string | null) {
    skin.historyFilter = choosing === 'bean' ? { ...filter, beanId: id } : { ...filter, grinderId: id };
    choosing = null;
  }

  function read() {
    skin.shots.sync().catch(() => undefined);
  }

  /** A shot's start is local time without a zone. */
  function when(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${day}, ${time}`;
  }

  onMount(() => {
    read();
    void catalogue.load();
  });
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
  <div class="filter" data-testid="history-filter">
    <button class:on={!filtered} data-testid="filter-all" onclick={() => ((skin.historyFilter = NO_FILTER), (choosing = null))}
      >all</button
    >
    <button
      class:on={filter.beanId !== null}
      class:open={choosing === 'bean'}
      data-testid="filter-bean"
      onclick={() => (choosing = choosing === 'bean' ? null : 'bean')}>{beanChosen}</button
    >
    <button
      class:on={filter.grinderId !== null}
      class:open={choosing === 'grinder'}
      data-testid="filter-grinder"
      onclick={() => (choosing = choosing === 'grinder' ? null : 'grinder')}>{grinderChosen}</button
    >
  </div>
  {#if choosing}
    <ul data-testid="filter-options" data-main-frame>
      <li>
        <button
          class="option"
          class:on={(choosing === 'bean' ? filter.beanId : filter.grinderId) === null}
          data-testid="filter-any"
          onclick={() => choose(null)}>{choosing === 'bean' ? 'any bean' : 'any grinder'}</button
        >
      </li>
      {#each options as option (option.id)}
        <li>
          <button
            class="option"
            class:on={option.id === (choosing === 'bean' ? filter.beanId : filter.grinderId)}
            data-testid="filter-option"
            onclick={() => choose(option.id)}
          >
            <span>{option.title}</span>
            {#if option.archived}<small>archived</small>{/if}
          </button>
        </li>
      {:else}
        <li class="empty" data-testid="filter-none">
          {catalogue.error ?? (catalogue.loaded ? `No ${choosing}s in the catalogue.` : 'Reading the catalogue …')}
        </li>
      {/each}
    </ul>
  {:else}
    <ul data-testid="history-list" data-main-frame>
      {#each entries as entry (entry.key)}
        <li>
          <button class="entry" data-testid="history-entry" data-shot={entry.latest.id} onclick={() => skin.restore(entry)}>
            <strong data-testid="entry-profile">{entry.profileTitle}</strong>
            <span class="bean" class:none={!entry.bean} data-testid="entry-bean">{beanLabel(entry.bean)}</span>
            <span class="foot">
              <span data-testid="entry-grinder">{grinderLabel(entry)}</span>
              <span data-testid="entry-when">
                {when(entry.latest.timestamp)}{entry.shots > 1 ? ` · ${entry.shots} shots` : ''}
              </span>
            </span>
          </button>
        </li>
      {:else}
        {#if !error}
          <li class="empty" data-testid="history-empty">
            {skin.shots.read !== 'all' ? 'Reading the shots …' : filtered ? 'No shots with this bean and grinder.' : 'No shots yet.'}
          </li>
        {/if}
      {/each}
      {#if skin.shots.read === 'first' && entries.length > 0 && !error}
        <li class="empty" data-testid="history-more">Reading the older shots …</li>
      {/if}
    </ul>
  {/if}
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
    font-size: var(--text-title);
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
    font-size: var(--text-body);
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
    font-size: var(--text-label);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .foot span:first-child {
    color: var(--fg);
  }

  .filter {
    flex: none;
    display: flex;
    gap: 0.5rem;
  }

  .filter button {
    min-width: 0;
    min-height: 3rem;
    padding: 0 0.9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 1px solid var(--line);
    border-radius: 1.5rem;
    background: var(--raised);
  }

  /* 'all' keeps its width; the bean and the grinder share the rest. */
  .filter button:not(:first-child) {
    flex: 1 1 0;
  }

  .filter .open {
    border-color: var(--fg);
  }

  .filter .on,
  .option.on {
    border-color: var(--accent);
    color: var(--accent);
  }

  .option {
    width: 100%;
    min-height: 3.6rem;
    padding: 0.5rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    text-align: left;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--raised);
  }

  .option span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option small {
    color: var(--dim);
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
