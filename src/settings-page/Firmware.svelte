<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/settings.js (renderFirmwareUpdateSettings, renderFirmwareCheckBlock,
  applyFirmwareUpdate, renderAppUpdateBlock) and src/modules/firmware-progress.js.
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // Updates (research.md 20.3, 20.10 S2c). 'firmware': the machine's build, what the bundled
  // firmware catalog says about it, every bundled build with its eligibility, and Install of
  // the recommended build after a confirm, with its progress and Cancel. No file upload (20.11).
  // 'app': Decaid's own update as the gateway reports it; the skin asks no outside service.
  import { onMount } from 'svelte';
  import type { AppUpdateState, FirmwareCatalog, FirmwareProgress } from '../api';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import { DURATION_NOTE, REASON_TEXT, STATUS_TEXT, appUpdateText, progressText, summarize } from './firmware';

  interface Props {
    skin: Skin;
    part: 'firmware' | 'app';
  }

  let { skin, part }: Props = $props();

  let catalog: FirmwareCatalog | null = $state.raw(null);
  let app: AppUpdateState | null = $state.raw(null);
  let error: string | null = $state(null);
  let reading = $state(false);
  let confirming = $state(false);
  /** an update this page started */
  let running = $state(false);
  let progress: FirmwareProgress | null = $state(null);
  let failed: string | null = $state(null);
  let cancelling = $state(false);

  const summary = $derived(catalog ? summarize(catalog) : null);
  /** an update runs, this page's or one started elsewhere */
  const busy = $derived(running || (summary !== null && summary.operation !== 'idle'));

  const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

  async function read() {
    reading = true;
    try {
      if (part === 'firmware') catalog = await skin.client.getFirmwareCatalog();
      else app = await skin.client.getAppUpdate();
      error = null;
    } catch (cause) {
      error = message(cause);
    } finally {
      reading = false;
    }
  }

  onMount(() => void read());

  async function install(artifactId: string) {
    confirming = false;
    running = true;
    failed = null;
    progress = null;
    try {
      await skin.client.applyFirmware(artifactId, (event) => (progress = event));
    } catch (cause) {
      failed = message(cause);
    } finally {
      running = false;
      cancelling = false;
      // The installed build changed, or the update stopped: the catalog says which.
      void read();
    }
  }

  async function cancel() {
    cancelling = true;
    try {
      await skin.client.cancelFirmware();
    } catch (cause) {
      failed = `Not cancelled: ${message(cause)}`;
      cancelling = false;
    }
    // the stream's error line ends the update
    if (!running) {
      cancelling = false;
      void read();
    }
  }
</script>

{#if error}
  <p class="warn" data-testid="{part}-error">
    Not read: {error}
    <button class="action" onclick={read} disabled={reading}>Read again</button>
  </p>
{:else if part === 'app'}
  {#if app}
    <div data-testid="app-update">
      <div class="row"><span>Decaid version</span><b>{app.currentVersion}</b></div>
      <div class="row"><span>Update</span><b data-testid="app-update-state">{appUpdateText(app)}</b></div>
      <div class="row"><span>Releases</span><b>{app.releaseUrl}</b></div>
    </div>
  {:else}
    <p class="dim">Reading Decaid's update state…</p>
  {/if}
{:else if summary && catalog}
  {@const latest = summary.latest}
  <div data-testid="firmware">
    <div class="row"><span>Machine</span><b>{summary.model ?? 'None connected'}</b></div>
    <div class="row"><span>Installed build</span><b data-testid="firmware-installed">{summary.installedBuild ?? '–'}</b></div>
    <div class="row">
      <span>Status</span>
      <b data-testid="firmware-status" data-status={summary.status}>
        {STATUS_TEXT[summary.status]}{#if summary.status === 'unknown' && summary.reason}: {REASON_TEXT[summary.reason] ??
            summary.reason}{/if}
      </b>
    </div>

    {#each catalog.artifacts ?? [] as artifact (artifact.id)}
      {@const reason = artifact.eligibility?.reasons?.[0]}
      <div class="row artifact" data-testid="firmware-artifact-{artifact.id}">
        <div class="about">
          <span>
            Build {artifact.versionLabel ?? artifact.build}
            {#if artifact.id === catalog.recommendedArtifactId}<em>recommended</em>{/if}
          </span>
          {#if artifact.releaseNotes}<small>{artifact.releaseNotes}</small>{/if}
        </div>
        <b>
          {artifact.eligibility?.status === 'applicable'
            ? 'Applies'
            : artifact.eligibility?.status === 'notApplicable'
              ? `Does not apply${reason ? `: ${REASON_TEXT[reason] ?? reason}` : ''}`
              : 'Not known'}{artifact.channel ? `, ${artifact.channel}` : ''}
        </b>
      </div>
    {/each}

    {#if busy}
      <div class="progress" data-testid="firmware-progress">
        <p>
          {progress ? progressText(progress) : `A firmware update is running (${summary.operation}).`}
        </p>
        {#if progress?.status === 'uploading'}
          <div class="bar"><div style="width: {Math.max(0, Math.min(1, progress.progress)) * 100}%"></div></div>
        {/if}
        <button class="action" data-testid="firmware-cancel" disabled={cancelling} onclick={cancel}
          >{cancelling ? 'Cancelling…' : 'Cancel'}</button
        >
      </div>
    {:else if summary.status === 'update-available' && latest}
      <div class="row">
        <div class="about">
          <span>Install build {latest.versionLabel ?? latest.build}</span>
          <small>{DURATION_NOTE}</small>
        </div>
        <button class="action" data-testid="firmware-install" onclick={() => (confirming = true)}>Install</button>
      </div>
    {/if}
    {#if failed}<p class="warn" data-testid="firmware-failed">{failed}</p>{/if}
    {#if progress?.status === 'done' && !running}<p data-testid="firmware-done">{progressText(progress)}</p>{/if}
  </div>
{:else}
  <p class="dim">Reading the firmware catalog…</p>
{/if}

{#if confirming && summary?.latest}
  {@const latest = summary.latest}
  <Confirm
    title="Install firmware build {latest.versionLabel ?? latest.build}?"
    text="{DURATION_NOTE} The machine's firmware {summary.installedBuild ?? ''} is replaced."
    ok="Install"
    onok={() => void install(latest.id)}
    oncancel={() => (confirming = false)}
  />
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3.2rem;
    padding: 0.35rem 0;
    border-top: 1px solid var(--line);
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  span {
    font-size: 1.15rem;
    font-weight: 600;
  }

  em {
    margin-left: 0.4rem;
    font-style: normal;
    font-weight: 400;
    font-size: 0.85rem;
    color: var(--dim);
  }

  b {
    font-weight: 400;
    color: var(--dim);
    overflow-wrap: anywhere;
    text-align: right;
  }

  .artifact b {
    flex: none;
    max-width: 40%;
  }

  small {
    color: var(--dim);
    font-size: 0.85rem;
  }

  .dim {
    color: var(--dim);
  }

  .warn {
    color: var(--temperature);
  }

  .progress {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--line);
  }

  .progress p {
    margin: 0;
    font-weight: 600;
  }

  .bar {
    width: 100%;
    height: 0.6rem;
    border-radius: 0.3rem;
    background: var(--raised);
    overflow: hidden;
  }

  .bar div {
    height: 100%;
    background: var(--fg);
  }

  button {
    font: inherit;
    font-weight: 400;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  button:disabled {
    opacity: 0.5;
  }

  .action {
    flex: none;
    min-height: 3rem;
    padding: 0 1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }
</style>
