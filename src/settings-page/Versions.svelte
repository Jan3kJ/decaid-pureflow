<script lang="ts">
  // Skin > Skin version: the flavour, the skin's releases on GitHub newest first, and the install
  // of one through Decaid (src/settings-page/releases.ts). GitHub is asked only on 'list', never
  // when the page opens. After the install, when this skin is Decaid's default, 'reload' loads the
  // page again: Decaid serves the new files on the same port at once.
  import { PRODUCT_ID, PRODUCT_NAME, PRODUCT_REPO, PRODUCT_VERSION } from '../product';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import SettingsRow from './SettingsRow.svelte';
  import { errorMessage } from '../error-message';
  import { installError } from './local-install';
  import { FLAVOURS, fetchReleases, installOf, installQuestion, releaseDate, type Flavour, type Release } from './releases';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  /** the running build's flavour first */
  let flavour: Flavour = $state(__OCR__ ? 'ocr' : 'base');
  let releases: Release[] | null = $state.raw(null);
  let reading = $state(false);
  /** why GitHub's list was not read */
  let unread: string | null = $state(null);
  let asking: Release | null = $state.raw(null);
  let busy = $state(false);
  /** what the last install did */
  let said: string | null = $state(null);
  /** the install is done and Decaid serves this skin: the page can load the new files */
  let reloadable = $state(false);

  const flavourName = (id: Flavour) => FLAVOURS.find((entry) => entry.id === id)!.name;

  async function list() {
    reading = true;
    unread = null;
    try {
      releases = await fetchReleases(PRODUCT_REPO);
    } catch (cause) {
      unread = errorMessage(cause);
    } finally {
      reading = false;
    }
  }

  async function install(release: Release) {
    asking = null;
    const how = installOf(PRODUCT_ID, PRODUCT_REPO, release, flavour);
    if (!how) return;
    const what = `${PRODUCT_NAME} ${release.version}, ${flavourName(flavour)}`;
    busy = true;
    reloadable = false;
    said = `Decaid downloads and installs ${how.asset} …`;
    try {
      if (how.kind === 'release') await skin.client.installSkinFromGitHubRelease(how.repo, how.asset);
      else await skin.client.installSkinFromUrl(how.url);
    } catch (cause) {
      said = installError(cause);
      busy = false;
      return;
    }
    try {
      const served = await skin.client.getDefaultSkin();
      reloadable = served.id === PRODUCT_ID;
      said = reloadable
        ? `Installed ${what}.`
        : `Installed ${what}. Decaid's default skin is ${served.name || served.id}; choose ${PRODUCT_NAME} under Active Skin to open it.`;
    } catch (cause) {
      said = `Installed ${what}. ${errorMessage(cause)}`;
    } finally {
      busy = false;
    }
  }
</script>

<SettingsRow label="flavour" hint="the bean bag reading makes the ZIP much larger." spacing="skin">
  <div class="chips">
    {#each FLAVOURS as entry (entry.id)}
      <button
        class="chip select-outline"
        aria-pressed={flavour === entry.id}
        disabled={busy}
        data-testid="version-flavour-{entry.id}"
        onclick={() => (flavour = entry.id)}>{entry.name}</button
      >
    {/each}
  </div>
</SettingsRow>

<SettingsRow label="releases" hint="asks GitHub for the list of releases; only when you tap." spacing="skin">
  <button class="action" data-testid="versions-list" disabled={busy || reading} onclick={list}>list</button>
</SettingsRow>

{#if reading}
  <p class="dim">Reading the releases on GitHub …</p>
{:else if unread}
  <p class="warn" data-testid="versions-error">{unread}</p>
{:else if releases && !releases.length}
  <p class="dim" data-testid="versions-empty">GitHub lists no release.</p>
{:else if releases}
  <div class="releases" data-testid="versions">
    {#each releases as release (release.tag)}
      {@const how = installOf(PRODUCT_ID, PRODUCT_REPO, release, flavour)}
      <button class="release" disabled={busy || !how} data-testid="version-{release.version}" onclick={() => (asking = release)}>
        <span class="name">
          <b>{release.version}</b>
          {#if release.latest}<span class="badge" data-testid="version-latest">latest</span>{/if}
          {#if release.version === PRODUCT_VERSION}<span class="badge" data-testid="version-running">running</span>{/if}
        </span>
        <small>{how ? `${releaseDate(release.published)} · ${how.asset}` : `no ZIP ${flavourName(flavour)}`}</small>
      </button>
    {/each}
  </div>
{/if}

{#if said}
  <SettingsRow
    label={said}
    hint={reloadable ? 'loads this screen again with the installed version.' : undefined}
    spacing="skin"
    testid="versions-said-row"
    labelTestid="versions-said"
  >
    {#if reloadable}
      <button class="action" data-testid="versions-reload" onclick={() => location.reload()}>reload</button>
    {/if}
  </SettingsRow>
{/if}

{#if asking}
  {@const release = asking}
  {@const how = installOf(PRODUCT_ID, PRODUCT_REPO, release, flavour)}
  <Confirm
    title="Install {PRODUCT_NAME} {release.version}, {flavourName(flavour)}?"
    text={how ? installQuestion(PRODUCT_NAME, PRODUCT_VERSION, how) : ''}
    ok="install"
    onok={() => void install(release)}
    oncancel={() => (asking = null)}
  />
{/if}

<style>
  .chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .releases {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    padding: var(--space-1) 0 0.8rem;
  }

  .release {
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
    border-radius: var(--radius);
  }

  .release:disabled,
  .action:disabled {
    opacity: 0.5;
  }

  .name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .name b {
    font-size: var(--text-body);
    font-weight: 600;
  }

  .badge {
    padding: 0.1rem var(--space-2);
    font-size: var(--text-label);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid currentColor;
    border-radius: var(--radius-pill);
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .warn {
    color: var(--temperature);
  }

  .dim {
    color: var(--dim);
  }
</style>
