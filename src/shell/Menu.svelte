<script lang="ts">
  import { saveLocation } from '../settings-page/tree';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  /**
   * The menu of the top left corner, the same button and the same menu on home, hot water and
   * steam (spec 3.14): what is rarely used. A list, so that an entry is one more line here. The
   * steam heater and machine sleep are the shortcuts of spec 3.7; machine sleep puts only the
   * machine to sleep and keeps the app awake, machine and app sleep shows the Asleep screen too;
   * while the machine sleeps, wake machine stands in their place (spec 3.10). Beans and grinders
   * opens the catalogue (spec 3.9 item 19). Clean opens the settings page on Maintenance, whose
   * first procedure is the clean (spec 3.8 'Menu: clean').
   */
  interface Entry {
    id: string;
    label: () => string;
    /** the state the entry is in, as a setting's value at the line's right end; only the steam
     *  heater has one, and a tap switches it */
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
      choose: () => skin.go('beans'),
    },
    {
      id: 'open-clean',
      label: () => 'Clean',
      choose: () => {
        saveLocation('maintenance');
        skin.go('settings');
      },
    },
    {
      id: 'steam-heater',
      label: () => 'Steam heater',
      detail: () => skin.steamHeater ?? 'not known',
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

<!-- 56 CSS pixels square, where the back arrow was: the state line begins right of it. -->
<button class="corner" data-testid="menu" aria-label="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16 M4 12h16 M4 17h16" />
  </svg>
</button>

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
            <span class="state" data-testid="{entry.id}-detail" class:off={entry.id === 'steam-heater' && skin.steamHeater === 'off'}
              >{entry.detail()}</span
            >
          {/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  .corner {
    flex: none;
    width: 3.5rem;
    height: 3.5rem;
    display: grid;
    place-items: center;
    padding: 0;
  }

  .corner svg {
    width: 1.6rem;
    height: 1.6rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
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
    /* under the corner button, at the pages' left padding */
    top: 4.6rem;
    left: 1.2rem;
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

  /* an entry with a state reads as a setting: the name, and its value at the right end */
  .menu button:has(.state) {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1.2rem;
  }

  .menu .state {
    color: var(--dim);
  }

  /* the heater is off: said in the colour of temperature */
  .menu .state.off {
    color: var(--temperature);
  }
</style>
