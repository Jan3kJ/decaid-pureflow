<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
  src/settings/settings.js (renderSkinSettings, setActiveSkin, updateSkin).
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // Skin > Active Skin (spec 3.9 item 15): Decaid's installed skins, the default one marked. A tap
  // on another asks, since the switch leaves this skin, then makes it Decaid's default, starts
  // Decaid's skin server again and opens the port it serves on (src/settings-page/skins.ts).
  // 'Check for skin updates' has Decaid look for newer versions; the skin asks no outside service.
  import { onMount } from 'svelte';
  import type { WebUiSkin } from '../api';
  import { PRODUCT_NAME } from '../product';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import { orderSkins, skinAddress, switchSkin } from './skins';
  import { errorMessage } from '../error-message';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  /** ms, how long the page waits for the new skin before it says it did not open */
  const OPEN_WAIT_MS = 6000;

  let skins: WebUiSkin[] | null = $state.raw(null);
  let defaultId: string | null = $state(null);
  let unread: string | null = $state(null);
  let asking: WebUiSkin | null = $state.raw(null);
  /** the switch or the update check in flight */
  let busy = $state(false);
  /** what the last switch or update check did */
  let said: string | null = $state(null);

  const ordered = $derived(orderSkins(skins ?? [], defaultId));

  async function read() {
    unread = null;
    try {
      const [list, chosen] = await Promise.all([skin.client.listSkins(), skin.client.getDefaultSkin()]);
      skins = list;
      defaultId = chosen.id;
    } catch (cause) {
      unread = errorMessage(cause);
    }
  }

  onMount(() => void read());

  async function choose(target: WebUiSkin) {
    asking = null;
    busy = true;
    said = `Switching to ${target.name} …`;
    try {
      const port = await switchSkin(skin.client, target.id);
      defaultId = target.id;
      said = `${target.name} is Decaid's default skin. Opening it …`;
      location.assign(skinAddress(port, location));
      setTimeout(() => {
        said = `${target.name} is Decaid's default skin, but this screen did not open it. Decaid's back gesture reaches its dashboard.`;
        busy = false;
      }, OPEN_WAIT_MS);
    } catch (cause) {
      said = errorMessage(cause);
      busy = false;
      void read();
    }
  }

  async function checkUpdates() {
    busy = true;
    said = 'Decaid looks for newer skins …';
    try {
      await skin.client.updateSkins();
      await read();
      said = 'Checked: the versions above are what Decaid holds now.';
    } catch (cause) {
      said = errorMessage(cause);
    } finally {
      busy = false;
    }
  }
</script>

{#if unread}
  <p class="warn" data-testid="skins-error">
    Not read: {unread}
    <button class="action" onclick={read}>read again</button>
  </p>
{:else if !skins}
  <p class="dim">Reading Decaid's skins …</p>
{:else}
  <div class="skins" data-testid="skins">
    {#each ordered as entry (entry.id)}
      {@const chosen = entry.id === defaultId}
      <button
        class="skin select-fill"
        aria-pressed={chosen}
        disabled={chosen || busy}
        data-testid="skin-{entry.id}"
        onclick={() => (asking = entry)}
      >
        <span class="name">
          <b>{entry.name}</b>
          {#if chosen}<span class="badge" data-testid="skin-default">Default</span>{/if}
        </span>
        <small>
          {#if entry.version}v{entry.version.replace(/^v/i, '')} ·{/if}
          {entry.isBundled ? 'Bundled' : 'Installed'}
        </small>
      </button>
    {/each}
  </div>
{/if}
{#if said}<p class="said" data-testid="skins-said">{said}</p>{/if}

<div class="row">
  <span class="about">
    <strong>Check for skin updates</strong>
    <small>Decaid looks for a newer version of every skin where it was installed from, and installs it.</small>
  </span>
  <button class="action" data-testid="skins-update" disabled={busy || !skins} onclick={checkUpdates}>check</button>
</div>

{#if asking}
  {@const target = asking}
  <Confirm
    title="Switch to {target.name}?"
    text="Decaid makes {target.name} its default skin and this screen opens it. {PRODUCT_NAME} stays installed and can be chosen again among the skins of {target.name} or of Decaid."
    ok="switch"
    onok={() => void choose(target)}
    oncancel={() => (asking = null)}
  />
{/if}

<style>
  .skins {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
    padding: 0.4rem 0 0.8rem;
  }

  button {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  .skin {
    min-height: 4.4rem;
    padding: 0.6rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 0.25rem;
    text-align: left;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .skin[aria-pressed='true'] small {
    color: var(--bg);
    opacity: 0.75;
  }

  .skin:disabled:not([aria-pressed='true']) {
    opacity: 0.5;
  }

  .name {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .name b {
    font-size: var(--text-body);
    font-weight: 600;
  }

  .badge {
    padding: 0.1rem 0.6rem;
    font-size: var(--text-label);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid currentColor;
    border-radius: 1rem;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .said {
    margin: 0 0 0.6rem;
  }

  .warn {
    color: var(--temperature);
  }

  .dim {
    color: var(--dim);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.8rem 0;
    border-top: 1px solid var(--line);
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  strong {
    font-size: var(--text-body);
    font-weight: 600;
  }

  .action {
    flex: none;
    min-height: 3rem;
    padding: 0 1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .action:disabled {
    opacity: 0.5;
  }
</style>
