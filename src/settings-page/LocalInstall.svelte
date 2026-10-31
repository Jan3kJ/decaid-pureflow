<script lang="ts">
  // Skin > Developer, 'Install from a local server': the server's address, its ZIPs, and the
  // install of one through Decaid (src/settings-page/local-install.ts). When the page cannot read
  // the listing the file's name is typed, since Decaid, not the page, downloads the ZIP. After the
  // install the skin reads Decaid's skins again; when Decaid serves the installed skin, its skin
  // server is started again and the page opens it, as the skin switch does.
  import { PRODUCT_ID, PRODUCT_NAME, PRODUCT_VERSION } from '../product';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import { errorMessage } from '../error-message';
  import {
    LOCAL_PORT,
    installError,
    installQuestion,
    loadServer,
    readListing,
    saveServer,
    serverBase,
    sizeText,
    timeText,
    zipNames,
    zipUrl,
    type Listing,
  } from './local-install';
  import { OPEN_WAIT_MS, skinAddress, switchSkin } from './skins';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  /** the ZIP of the version and flavour now running, and the other flavour's */
  const names = zipNames(PRODUCT_ID, PRODUCT_VERSION, __OCR__);

  let address = $state(loadServer());
  /** the server the list was read from */
  let base: string | null = $state(null);
  let listing: Listing | null = $state.raw(null);
  let reading = $state(false);
  /** the file name typed when the list cannot be read */
  let typed = $state(names[0]);
  let asking: string | null = $state(null);
  let busy = $state(false);
  /** what the last list or install did */
  let said: string | null = $state(null);

  async function list() {
    said = null;
    listing = null;
    base = serverBase(address);
    if (!base) {
      said = `Type the PC's address, for example 192.168.1.20 or 192.168.1.20:${LOCAL_PORT}.`;
      return;
    }
    saveServer(address.trim());
    reading = true;
    listing = await readListing(base);
    reading = false;
  }

  async function install(file: string) {
    asking = null;
    const url = zipUrl(base!, file);
    busy = true;
    said = `Decaid downloads and installs ${file} …`;
    try {
      await skin.client.installSkinFromUrl(url);
    } catch (cause) {
      said = installError(cause);
      busy = false;
      return;
    }
    try {
      const [skins, served] = await Promise.all([skin.client.listSkins(), skin.client.getDefaultSkin()]);
      const installed = skins.find((entry) => entry.reaMetadata?.sourceUrl === url);
      const what = installed ? `${installed.name} ${installed.version ?? ''}`.trim() : file;
      if (!installed || installed.id !== served.id) {
        said = `Installed ${what}.`;
        busy = false;
        return;
      }
      said = `Installed ${what}. Opening it …`;
      const port = await switchSkin(skin.client, installed.id);
      location.assign(skinAddress(port, location));
      setTimeout(() => {
        said = `Installed ${what}, but this screen did not open it. Decaid's back gesture reaches its dashboard.`;
        busy = false;
      }, OPEN_WAIT_MS);
    } catch (cause) {
      said = `Installed ${file}. ${errorMessage(cause)}`;
      busy = false;
    }
  }
</script>

<div class="row">
  <span class="about">
    <strong>install from a local server</strong>
    <small>the ZIPs of a server on your PC, for example <code>npm run serve-release</code>; Decaid downloads the one you tap.</small>
  </span>
</div>
<div class="server">
  <input
    class="field"
    type="text"
    inputmode="url"
    aria-label="the server's address"
    placeholder="192.168.1.20:{LOCAL_PORT}"
    autocomplete="off"
    spellcheck="false"
    enterkeyhint="go"
    data-testid="local-server"
    bind:value={address}
    onkeydown={(event) => event.key === 'Enter' && void list()}
  />
  <button class="action" data-testid="local-list" disabled={busy || reading} onclick={list}>list</button>
</div>

{#if reading}
  <p class="dim">Reading the server's list …</p>
{:else if listing && 'zips' in listing}
  {#if listing.zips.length}
    <div class="zips" data-testid="local-zips">
      {#each listing.zips as zip (zip.name)}
        <button class="zip" disabled={busy} data-testid="local-zip" data-name={zip.name} onclick={() => (asking = zip.name)}>
          <span class="name">
            <b>{zip.name}</b>
            {#if zip.name === names[0]}<span class="badge" data-testid="local-running">running</span>{/if}
          </span>
          {#if zip.size !== undefined || zip.modified}
            <small>
              {zip.size !== undefined ? sizeText(zip.size) : ''}{zip.size !== undefined && zip.modified ? ' · ' : ''}{zip.modified
                ? timeText(zip.modified)
                : ''}
            </small>
          {/if}
        </button>
      {/each}
    </div>
  {:else}
    <p class="dim" data-testid="local-empty">The server lists no ZIP.</p>
  {/if}
{:else if listing}
  <p class="dim" data-testid="local-unread">
    The list could not be read ({listing.unread}); a server without CORS, as Python's, does not allow it. Type the file's name:
  </p>
  <div class="server">
    <input
      class="field"
      type="text"
      aria-label="the ZIP's file name"
      autocomplete="off"
      spellcheck="false"
      enterkeyhint="done"
      data-testid="local-name"
      bind:value={typed}
    />
    <button class="action" data-testid="local-install" disabled={busy || !typed.trim()} onclick={() => (asking = typed.trim())}
      >install</button
    >
  </div>
  <div class="chips">
    {#each names as name (name)}
      <button class="chip select-fill" aria-pressed={typed === name} data-testid="local-name-chip" onclick={() => (typed = name)}
        >{name}</button
      >
    {/each}
  </div>
{/if}
{#if said}<p class="said" data-testid="local-said">{said}</p>{/if}

{#if asking}
  {@const file = asking}
  <Confirm
    title="Install {file}?"
    text={installQuestion(PRODUCT_NAME, PRODUCT_VERSION)}
    ok="install"
    onok={() => void install(file)}
    oncancel={() => (asking = null)}
  />
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0.8rem 0 var(--space-1);
    border-top: 1px solid var(--line);
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  strong {
    font-size: var(--text-body);
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  code {
    font-size: var(--text-label);
  }

  .server {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-1) 0;
  }

  .field {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    min-height: 3rem;
    padding: 0 1rem;
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  button {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  .action {
    flex: none;
    min-height: 3rem;
    padding: 0 1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .action:disabled,
  .zip:disabled {
    opacity: 0.5;
  }

  .zips {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    padding: var(--space-1) 0;
  }

  .zip {
    min-height: 4.4rem;
    padding: 0.6rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: var(--space-1);
    text-align: left;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .name {
    max-width: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .name b {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-body);
    font-weight: 600;
  }

  .badge {
    flex: none;
    padding: 0.1rem var(--space-2);
    font-size: var(--text-label);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid currentColor;
    border-radius: 1rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding-bottom: var(--space-1);
  }

  .chip {
    min-height: 3rem;
    padding: 0 0.9rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 1.5rem;
  }

  p {
    margin: var(--space-1) 0;
  }

  .dim {
    color: var(--dim);
  }

  .said {
    margin: var(--space-1) 0 var(--space-2);
  }
</style>
