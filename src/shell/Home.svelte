<script lang="ts">
  import { saveLocation } from '../settings-page/tree';
  import type { Skin } from './skin.svelte';
  import ShotView from './ShotView.svelte';
  import StateLine from './StateLine.svelte';
  import Water from './Water.svelte';
  import { shownRun } from './water';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // Hot water or flush runs: home shows it in place of the graph, with stop in its ring (spec 3.6).
  const water = $derived(shownRun(skin.waterRun, skin.canStop));

  /**
   * The menu of the top right corner (founder, 2026-10-13): what is rarely used. A list, so
   * that an entry is one more line here. The steam switch and machine sleep are the shortcuts of
   * spec 3.7; machine sleep puts only the machine to sleep and keeps the app awake, machine and
   * app sleep shows the Asleep screen too; while the machine sleeps, wake machine stands in their
   * place (spec 3.10). Beans and grinders opens the catalogue (spec 3.9 item 19). Clean opens the settings page on Maintenance, whose
   * first procedure is the clean (spec 3.8 'Menu: clean').
   */
  interface Entry {
    id: string;
    label: () => string;
    /** a second, smaller line: the state the entry is in, or what it really does */
    detail?: () => string;
    disabled?: () => boolean;
    /** the entry is in the menu; always when left out */
    shown?: () => boolean;
    choose: () => void;
  }
  const MENU: Entry[] = [
    { id: 'open-settings', label: () => 'Settings', choose: () => skin.go('settings') },
    {
      id: 'open-beans',
      label: () => 'Beans and grinders',
      detail: () => 'add, edit and archive them; the pick for the next shot is on home',
      choose: () => skin.go('beans'),
    },
    {
      id: 'open-clean',
      label: () => 'Clean',
      detail: () => 'the cleaning cycle of the settings page',
      choose: () => {
        saveLocation('maintenance');
        skin.go('settings');
      },
    },
    {
      id: 'steam-heater',
      label: () => (skin.steamHeater === 'off' ? 'Steam on' : 'Steam off'),
      detail: () => (skin.steamHeater === null ? 'steam heater: not known' : `steam heater is ${skin.steamHeater}`),
      disabled: () => skin.steamHeater === null,
      choose: () => void skin.toggleSteamHeater(),
    },
    {
      id: 'machine-sleep',
      label: () => 'Machine sleep',
      shown: () => !skin.machineAsleep,
      disabled: () => !skin.canSleep,
      choose: () => void skin.sleep(),
    },
    {
      id: 'app-sleep',
      label: () => 'Machine and app sleep',
      shown: () => !skin.machineAsleep,
      disabled: () => !skin.canSleep,
      choose: () => void skin.sleepApp(),
    },
    {
      id: 'wake-machine',
      label: () => 'Wake machine',
      shown: () => skin.machineAsleep,
      choose: () => void skin.wake(),
    },
  ];
  let menuOpen = $state(false);

  function choose(entry: Entry) {
    menuOpen = false;
    entry.choose();
  }
</script>

<div class="home">
  <!-- The state line and the menu only: the profile and bean are in the right column (spec 3.11). -->
  <header>
    <StateLine {skin} heat="group" />

    <button class="icon" data-testid="menu" aria-label="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16 M4 12h16 M4 17h16" />
      </svg>
    </button>
  </header>

  {#if water}
    <Water {skin} run={water} />
    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {:else if skin.info}
      <p class="notice info" data-testid="tare-notice">{skin.info}</p>
    {/if}
  {:else}
    <!-- Home is the shot screen: the graph and the right column, live while a shot runs (spec 3.11). -->
    <ShotView {skin} />
  {/if}
</div>

{#if menuOpen}
  <!-- A tap outside the menu closes it and does nothing else. -->
  <button class="backdrop" data-no-swipe data-testid="menu-backdrop" aria-label="close the menu" onclick={() => (menuOpen = false)}
  ></button>
  <ul class="menu" data-testid="menu-list" role="menu">
    {#each MENU.filter((entry) => entry.shown?.() ?? true) as entry (entry.id)}
      <li>
        <button role="menuitem" data-testid={entry.id} disabled={entry.disabled?.()} onclick={() => choose(entry)}>
          <span class="label">{entry.label()}</span>
          {#if entry.detail}
            <small data-testid="{entry.id}-detail" class:off={entry.id === 'steam-heater' && skin.steamHeater === 'off'}
              >{entry.detail()}</small
            >
          {/if}
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

  .notice {
    margin: 0;
    color: var(--warn);
    font-size: var(--text-label);
  }

  .info {
    color: var(--fg);
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
    /* under the menu button, at home's right padding: home has no edge tab */
    top: 4.6rem;
    right: 1.2rem;
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
    font-size: var(--text-value);
    border: 0;
    background: none;
  }

  .menu button:disabled {
    color: var(--dim);
  }

  .menu .label {
    display: block;
  }

  .menu small {
    display: block;
    font-size: var(--text-label);
    color: var(--dim);
  }

  /* the heater is off: said in the colour of temperature */
  .menu small.off {
    color: var(--temperature);
  }
</style>
