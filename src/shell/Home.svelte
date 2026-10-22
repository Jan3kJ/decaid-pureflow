<script lang="ts">
  import Pick from '../beans/Pick.svelte';
  import { beanLabel, contextBean } from '../history/entries';
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
  // The bean and grinder setting for the next shot, as the workflow holds them; a tap picks others (spec 3.9 item 19).
  const nextBean = $derived(beanLabel(contextBean(skin.workflow?.context)));
  const nextSetting = $derived(skin.workflow?.context?.grinderSetting?.trim() || null);
  let picking = $state(false);

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
  <header>
    <StateLine {skin} heat="group" />

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

    <button class="pick" data-testid="open-pick" aria-label="bean and grinder for the next shot" onclick={() => (picking = true)}>
      <span data-testid="next-bean">{nextBean}</span>
      {#if nextSetting}<small data-testid="next-setting">{nextSetting}</small>{/if}
    </button>

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

{#if picking}
  <Pick {skin} onclose={() => (picking = false)} />
{/if}

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

  /* The bean and the grinder setting for the next shot: shortened, so the header stays one row. */
  .pick {
    flex: 0 1 auto;
    min-width: 0;
    max-width: 16rem;
    min-height: 3.5rem;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: var(--text-body);
  }

  .pick span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pick small {
    flex: none;
    color: var(--dim);
    font-size: var(--text-body);
    font-variant-numeric: tabular-nums;
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
    font-size: var(--text-value);
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
    top: 4.6rem;
    /* under the menu button: the steam tab's 3.5rem and home's padding */
    right: 4.7rem;
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
