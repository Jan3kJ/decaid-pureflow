<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/settings.js (renderFirmwareUpdateSettings, renderFirmwareCheckBlock,
  applyFirmwareUpdate, renderAppUpdateBlock) and src/modules/firmware-progress.js.
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // Updates. 'firmware': the machine's build, what the bundled
  // firmware catalog says about it, every bundled build with its eligibility, and Install of
  // the recommended build after a confirm, with its progress and Cancel, and a
  // firmware file chosen on the device, flashed after a confirm that says the machine must stay on.
  // 'app': Decaid's own update as the gateway reports it; the skin asks no outside service.
  import { onMount } from 'svelte';
  import type { AppUpdateState, FirmwareCatalog, FirmwareProgress } from '../api';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import SettingsRow from './SettingsRow.svelte';
  import { DURATION_NOTE, REASON_TEXT, STATUS_TEXT, appUpdateText, progressText, summarize } from './firmware';
  import { errorMessage } from '../error-message';

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
  /** a firmware file chosen, waiting for its confirm */
  let picked: File | null = $state(null);
  let chooser: HTMLInputElement | undefined = $state();

  const summary = $derived(catalog ? summarize(catalog) : null);
  /** an update runs, this page's or one started elsewhere */
  const busy = $derived(running || (summary !== null && summary.operation !== 'idle'));

  async function read() {
    reading = true;
    try {
      if (part === 'firmware') catalog = await skin.client.getFirmwareCatalog();
      else app = await skin.client.getAppUpdate();
      error = null;
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      reading = false;
    }
  }

  onMount(() => void read());

  async function install(source: string | File) {
    confirming = false;
    picked = null;
    running = true;
    failed = null;
    progress = null;
    try {
      const onProgress = (event: FirmwareProgress) => (progress = event);
      if (typeof source === 'string') await skin.client.applyFirmware(source, onProgress);
      else await skin.client.uploadFirmware(source, onProgress);
    } catch (cause) {
      failed = errorMessage(cause);
    } finally {
      running = false;
      cancelling = false;
      // The installed build changed, or the update stopped: the catalog says which.
      void read();
    }
  }

  function choose(event: Event & { currentTarget: HTMLInputElement }) {
    picked = event.currentTarget.files?.[0] ?? null;
    // the same file can be chosen again
    event.currentTarget.value = '';
  }

  const sizeText = (bytes: number) =>
    bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  async function cancel() {
    cancelling = true;
    try {
      await skin.client.cancelFirmware();
    } catch (cause) {
      failed = `Not cancelled: ${errorMessage(cause)}`;
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
    <button class="action" onclick={read} disabled={reading}>read again</button>
  </p>
{:else if part === 'app'}
  {#if app}
    <div data-testid="app-update">
      <SettingsRow label="Decaid version" spacing="tight"><b>{app.currentVersion}</b></SettingsRow>
      <SettingsRow label="update" spacing="tight"><b data-testid="app-update-state">{appUpdateText(app)}</b></SettingsRow>
      <SettingsRow label="releases" spacing="tight"><b>{app.releaseUrl}</b></SettingsRow>
    </div>
  {:else}
    <p class="dim">Reading Decaid's update state…</p>
  {/if}
{:else if summary && catalog}
  {@const latest = summary.latest}
  <div data-testid="firmware">
    <SettingsRow label="machine" spacing="tight"><b>{summary.model ?? 'None connected'}</b></SettingsRow>
    <SettingsRow label="installed build" spacing="tight"
      ><b data-testid="firmware-installed">{summary.installedBuild ?? '–'}</b></SettingsRow
    >
    <SettingsRow label="status" spacing="tight">
      <b data-testid="firmware-status" data-status={summary.status}>
        {STATUS_TEXT[summary.status]}{#if summary.status === 'unknown' && summary.reason}: {REASON_TEXT[summary.reason] ??
            summary.reason}{/if}
      </b>
    </SettingsRow>

    {#each catalog.artifacts ?? [] as artifact (artifact.id)}
      {@const reason = artifact.eligibility?.reasons?.[0]}
      <SettingsRow spacing="tight" testid="firmware-artifact-{artifact.id}">
        {#snippet label()}
          build {artifact.versionLabel ?? artifact.build}
          {#if artifact.id === catalog?.recommendedArtifactId}<em>recommended</em>{/if}
        {/snippet}
        {#snippet about()}
          {#if artifact.releaseNotes}<small class="name">{artifact.releaseNotes}</small>{/if}
        {/snippet}
        <b class="eligibility">
          {artifact.eligibility?.status === 'applicable'
            ? 'Applies'
            : artifact.eligibility?.status === 'notApplicable'
              ? `Does not apply${reason ? `: ${REASON_TEXT[reason] ?? reason}` : ''}`
              : 'Not known'}{artifact.channel ? `, ${artifact.channel}` : ''}
        </b>
      </SettingsRow>
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
          >{cancelling ? 'cancelling…' : 'cancel'}</button
        >
      </div>
    {:else if summary.status === 'update-available' && latest}
      <SettingsRow label="install build {latest.versionLabel ?? latest.build}" hint={DURATION_NOTE} spacing="tight">
        <button class="action" data-testid="firmware-install" onclick={() => (confirming = true)}>install</button>
      </SettingsRow>
    {/if}
    {#if !busy}
      <SettingsRow
        label="install from a file"
        hint="a firmware image from this device. Only for a file you trust; the machine must stay on until it is done."
        spacing="tight"
      >
        <button class="action" data-testid="firmware-file" onclick={() => chooser?.click()}>choose file</button>
        <input type="file" hidden bind:this={chooser} data-testid="firmware-file-input" onchange={choose} />
      </SettingsRow>
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
    ok="install"
    onok={() => void install(latest.id)}
    oncancel={() => (confirming = false)}
  />
{/if}

{#if picked}
  {@const file = picked}
  <Confirm
    title="Install {file.name}?"
    text="{DURATION_NOTE} The file ({sizeText(
      file.size,
    )}) is sent to the machine as it is and replaces its firmware. Keep the machine switched on."
    ok="install"
    onok={() => void install(file)}
    oncancel={() => (picked = null)}
  />
{/if}

<style>
  em {
    margin-left: var(--space-1);
    font-style: normal;
    font-weight: 400;
    font-size: var(--text-label);
    color: var(--dim);
  }

  .eligibility {
    flex: none;
    max-width: 40%;
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
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-top: 1px solid var(--edge);
  }

  .progress p {
    margin: 0;
    font-weight: 600;
  }

  .bar {
    width: 100%;
    height: 0.6rem;
    border-radius: var(--radius-pill);
    background: var(--edge);
    overflow: hidden;
  }

  .bar div {
    height: 100%;
    background: var(--fg);
  }

  button {
    font-weight: 400;
  }

  button:disabled {
    opacity: 0.5;
  }
</style>
