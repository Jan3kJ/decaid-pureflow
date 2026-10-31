<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/settings.js (renderMachineInformationSettings, renderUsbChargerModeSettings).
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // Read only: the connected machine's information
  // (`GET /api/v1/machine/info`: model, firmware, serial number to copy, group head controller,
  // what the machine reports besides), or the USB page's charging status from Decaid's
  // settings, shown only where Decaid reports one.
  import { onMount } from 'svelte';
  import type { DecaidSettings, MachineInfo } from '../api';
  import type { Skin } from '../shell/skin.svelte';
  import { errorMessage } from '../error-message';

  interface Props {
    skin: Skin;
    part: 'machine-info' | 'charging';
    /** Decaid's settings as the page read them, for the charging status */
    decaid?: DecaidSettings | null;
  }

  let { skin, part, decaid = null }: Props = $props();

  let info: MachineInfo | null = $state.raw(null);
  let error: string | null = $state(null);
  let reading = $state(false);
  let copied: string | null = $state(null);

  async function read() {
    reading = true;
    try {
      info = await skin.client.getMachineInfo();
      error = null;
    } catch (cause) {
      error = errorMessage(cause);
    } finally {
      reading = false;
    }
  }

  onMount(() => {
    if (part === 'machine-info') void read();
  });

  async function copy(serial: string) {
    try {
      await navigator.clipboard.writeText(serial);
      copied = 'Copied';
    } catch {
      copied = 'Not copied';
    }
    setTimeout(() => (copied = null), 1500);
  }

  /** `refillKit` → 'refill kit' */
  const labelOf = (key: string) => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .toLowerCase()
      .trim();
  };
  const valueOf = (value: unknown) => (typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value));

  const PHASES: Record<string, string> = {
    inactive: 'Inactive',
    normal: 'Normal',
    hovering: 'Hovering',
    chargingToMax: 'Charging to max',
    sleeping: 'Sleeping',
  };
  const charging = $derived(part === 'charging' ? (decaid?.chargingState ?? null) : null);
</script>

{#if part === 'machine-info'}
  <div class="info" data-testid="machine-info">
    {#if info}
      <div class="row"><span>model</span><b data-testid="machine-info-model">{info.model ?? '–'}</b></div>
      <div class="row"><span>firmware version</span><b data-testid="machine-info-firmware">{info.version ?? '–'}</b></div>
      <div class="row">
        <span>serial number</span>
        <span class="serial">
          {#if info.serialNumber}
            <button class="action" data-testid="machine-info-copy" onclick={() => copy(info!.serialNumber!)}>{copied ?? 'copy'}</button
            >
          {/if}
          <b data-testid="machine-info-serial">{info.serialNumber ?? '–'}</b>
        </span>
      </div>
      <div class="row"><span>group head controller</span><b>{info.GHC ? 'Present' : 'None'}</b></div>
      {#each Object.entries(info.extra ?? {}) as [key, value] (key)}
        <div class="row"><span>{labelOf(key)}</span><b>{valueOf(value)}</b></div>
      {/each}
    {:else if error}
      <p class="warn" data-testid="machine-info-error">
        Not read: {error}
        <button class="action" onclick={read} disabled={reading}>read again</button>
      </p>
    {:else}
      <p class="dim">Reading the machine's information…</p>
    {/if}
  </div>
{:else if charging}
  <div class="info" data-testid="charging-status">
    <div class="row">
      <span>battery</span><b>{charging.batteryPercent ?? '--'}%{charging.isEmergency ? ' (emergency)' : ''}</b>
    </div>
    <div class="row">
      <span>phase</span><b>{PHASES[charging.currentPhase ?? ''] ?? charging.currentPhase ?? '--'}</b>
    </div>
    <div class="row"><span>USB charger</span><b>{charging.usbChargerOn ? 'On' : 'Off'}</b></div>
  </div>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: var(--control-tall);
    padding: var(--space-1) 0;
    border-top: 1px solid var(--line);
  }

  span {
    font-size: var(--text-body);
    font-weight: 600;
  }

  b {
    font-weight: 400;
    color: var(--dim);
    overflow-wrap: anywhere;
    text-align: right;
  }

  .serial {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .dim {
    color: var(--dim);
  }

  .warn {
    color: var(--temperature);
  }

  button {
    font-weight: 400;
  }
</style>
