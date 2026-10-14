<script lang="ts">
  import ShotGraph from '../graph/ShotGraph.svelte';
  import { beanLabel } from '../history/entries';
  import { emptySeries, shotSeconds, shotWeight } from './shot';
  import type { Skin } from './skin.svelte';
  import StateLine from './StateLine.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  const context = $derived(skin.workflow?.context);
  // The finished shot stays here until it is dismissed or the next one starts.
  const last = $derived(skin.shot?.ended ? skin.shot : null);
  const lastWeight = $derived(shotWeight(last));
  // An entry restored from the shot history, with the graph of its latest shot (spec 3.5).
  const recalled = $derived(skin.recalled);

  /**
   * The menu of the top right corner (founder, 2026-10-13): what is rarely used. A list, so
   * that an entry is one more line here.
   */
  const MENU: { id: string; label: string; disabled?: () => boolean; choose: () => void }[] = [
    { id: 'open-scale', label: 'Scale', choose: () => skin.go('scale') },
    { id: 'open-settings', label: 'Settings', choose: () => skin.go('settings') },
    { id: 'sleep', label: 'Sleep', disabled: () => !skin.canSleep, choose: () => void skin.sleep() },
  ];
  let menuOpen = $state(false);

  function choose(entry: (typeof MENU)[number]) {
    menuOpen = false;
    entry.choose();
  }
</script>

<div class="home">
  <header>
    <StateLine {skin} />

    <div class="profile">
      <button class="name" data-testid="open-profiles" aria-label="choose a profile" onclick={() => skin.go('profiles')}>
        <strong data-testid="profile-name">{skin.workflow?.profile?.title ?? '–'}</strong>
      </button>
      <button class="icon" data-testid="open-editor" aria-label="edit the profile" onclick={() => skin.go('editor')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4" />
        </svg>
      </button>
    </div>

    <button class="icon" data-testid="menu" aria-label="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16 M4 12h16 M4 17h16" />
      </svg>
    </button>
  </header>

  <section class="last">
    {#if recalled}
      {@const entry = recalled.entry}
      <header>
        <span class="recalled" data-testid="recalled">
          last shot with
          <strong data-testid="recalled-profile">{entry.profileTitle}</strong>
          <strong data-testid="recalled-bean">{beanLabel(entry.bean)}</strong>
          {#if entry.grinderSetting}
            <strong data-testid="recalled-grinder">grinder {entry.grinderSetting}</strong>
          {/if}
        </span>
        <button class="chip" data-testid="dismiss-recalled" onclick={() => skin.dismissRecalled()}>dismiss</button>
      </header>
      <div class="plot" data-testid="history-graph">
        <ShotGraph
          {...recalled.series}
          targetWeight={entry.latest.workflow?.context?.targetYield}
          fit
          legend={skin.settings.showGraphLegend}
          label="last shot of the history entry"
        />
      </div>
    {:else if last}
      <header>
        <span>
          last shot
          <strong data-testid="last-shot-time">{shotSeconds(last).toFixed(1)} s</strong>
          {#if lastWeight !== null}
            <strong class="weight" data-testid="last-shot-weight">{lastWeight.toFixed(1)} g</strong>
          {/if}
        </span>
        <button class="chip" data-testid="dismiss-shot" onclick={() => skin.dismissShot()}>dismiss</button>
      </header>
      <div class="plot" data-testid="last-shot">
        <ShotGraph
          {...last.series}
          targetWeight={context?.targetYield}
          fit
          legend={skin.settings.showGraphLegend}
          label="last shot"
        />
      </div>
    {:else}
      <!-- No shot yet: the graph keeps its place, empty. -->
      <div class="plot" data-testid="empty-graph">
        <ShotGraph {...emptySeries()} targetWeight={context?.targetYield} legend={skin.settings.showGraphLegend} label="no shot yet" />
      </div>
    {/if}
  </section>

  {#if skin.notice}
    <p class="notice" data-testid="notice">{skin.notice}</p>
  {/if}
  <!-- Nothing is started here: the DE1 is started at the machine. What runs can be stopped. -->
  {#if skin.canStop}
    <button class="stop" data-testid="stop" onclick={() => skin.stop()}>stop</button>
  {/if}
</div>

{#if menuOpen}
  <!-- A tap outside the menu closes it and does nothing else. -->
  <button class="backdrop" data-testid="menu-backdrop" aria-label="close the menu" onclick={() => (menuOpen = false)}></button>
  <ul class="menu" data-testid="menu-list" role="menu">
    {#each MENU as entry (entry.id)}
      <li>
        <button role="menuitem" data-testid={entry.id} disabled={entry.disabled?.()} onclick={() => choose(entry)}>
          {entry.label}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .home {
    height: 100%;
    box-sizing: border-box;
    padding: 0.8rem 1.2rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .home > header {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .home > header > :global(.state) {
    flex: 1;
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

  .profile {
    flex: none;
    max-width: 22rem;
    display: flex;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  .profile button {
    border: 0;
    background: none;
  }

  .name {
    min-width: 0;
    min-height: 3.5rem;
    padding: 0 0.4rem 0 1rem;
    text-align: left;
  }

  .name strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .icon {
    flex: none;
    width: 3.5rem;
    height: 3.5rem;
    display: grid;
    place-items: center;
    padding: 0;
  }

  .icon svg {
    width: 1.6rem;
    height: 1.6rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .profile .icon {
    color: var(--dim);
  }

  .chip {
    flex: none;
    min-width: 7rem;
    min-height: 3.2rem;
    padding: 0 1rem;
    font-size: 1rem;
  }

  .last {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .last header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    color: var(--dim);
  }

  .last header strong {
    margin-left: 0.8rem;
    color: var(--fg);
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
  }

  .last header strong.weight {
    color: var(--weight);
  }

  .last header .recalled {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .last header .recalled strong {
    font-size: 1.1rem;
  }

  .plot {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  .notice {
    margin: 0;
    color: var(--warn);
    font-size: 0.95rem;
  }

  .stop {
    flex: none;
    min-height: 5rem;
    font-size: 2rem;
    font-weight: 600;
    color: var(--bg);
    background: var(--temperature);
    border-color: var(--temperature);
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    border: 0;
    border-radius: 0;
    background: rgb(0 0 0 / 35%);
  }

  .menu {
    position: fixed;
    top: 4.6rem;
    /* under the menu button: the steam tab's 4rem and home's padding */
    right: 5.2rem;
    z-index: 11;
    min-width: 14rem;
    margin: 0;
    padding: 0.4rem;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    box-shadow: 0 0.6rem 2.4rem rgb(0 0 0 / 70%);
  }

  .menu button {
    width: 100%;
    min-height: 3.8rem;
    padding: 0 1.2rem;
    text-align: left;
    font-size: 1.2rem;
    border: 0;
    background: none;
  }

  .menu button:disabled {
    color: var(--dim);
  }
</style>
