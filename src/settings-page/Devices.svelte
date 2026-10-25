<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/settings.js (renderBluetoothMachineSettings, renderBluetoothScaleSettings,
  renderDeviceList and their handlers).
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The machine or scale list of Connections (research.md 20.3, 20.10 S2b): the devices of
  // `/ws/v1/devices` as they change, Search, Connect / Disconnect, Forget for a remembered one
  // that is absent, and the preferred switch Decaid connects by itself. The scale list also
  // has the Wi-Fi scales added by address. Commands go as REST requests; the stream shows
  // what they did.
  import { onDestroy, onMount } from 'svelte';
  import { DecaidApiError, devicesStream, type DevicesState, type DeviceInfo, type SnapshotStream } from '../api';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import { PREFERRED_KEY, connectMessage, deviceRows, type DeviceKind, type DeviceRow } from './devices';
  import { errorMessage } from '../error-message';

  interface Props {
    skin: Skin;
    kind: DeviceKind;
    /** the preferred device's id, as Decaid's settings were read; undefined while they are not */
    preferred: string | null | undefined;
    /** writes the preferred device (a device id, or null for none) and reads it back */
    onpreferred: (key: 'preferredMachineId' | 'preferredScaleId', id: string | null) => Promise<void>;
  }

  let { skin, kind, preferred, onpreferred }: Props = $props();

  let frame = $state.raw<DevicesState | null>(null);
  let stream: SnapshotStream<DevicesState> | undefined;
  /** the message of a row's last action, by device id */
  let messages: Record<string, string> = $state({});
  let busy: Record<string, boolean> = $state({});
  let message: string | null = $state(null);
  let forgetting: DeviceInfo | null = $state(null);

  const rows = $derived(frame ? deviceRows(frame.devices, kind, preferred) : []);
  const name = $derived(kind === 'machine' ? 'machine' : 'scale');

  onMount(() => {
    stream = devicesStream({ baseUrl: skin.baseUrl, onFrame: (next) => (frame = next) }).connect();
    if (kind === 'scale') void readWifi();
  });

  onDestroy(() => stream?.close());

  async function scan(connect = true) {
    message = null;
    try {
      // `quick`: the answer comes at once; the stream says while the scan runs and what it found.
      await skin.client.scanDevices({ connect, quick: true });
    } catch (cause) {
      message = `The search did not start: ${errorMessage(cause)}`;
    }
  }

  async function act(row: DeviceRow, action: DeviceRow['actions'][number]) {
    const id = row.device.id;
    if (action === 'forget') return void (forgetting = row.device);
    if (action === 'rescan') return scan(true);
    delete messages[id];
    busy[id] = true;
    try {
      if (action === 'disconnect') await skin.client.disconnectDevice(id);
      else {
        const result = await skin.client.connectDevice(id);
        const said = connectMessage(result);
        if (said) messages[id] = said;
      }
    } catch (cause) {
      // A conflict, an absent transport or a time-out answers with the connect's result.
      const body = cause instanceof DecaidApiError ? (cause.body as { outcome?: string } | undefined) : undefined;
      messages[id] = body?.outcome ? (connectMessage(body as { outcome: string }) ?? errorMessage(cause)) : errorMessage(cause);
    } finally {
      busy[id] = false;
    }
  }

  async function forget(device: DeviceInfo) {
    forgetting = null;
    try {
      await skin.client.forgetDevice(device.id);
      // Decaid sends the list again; until then it is gone here (Streamline).
      if (frame) frame = { ...frame, devices: frame.devices.filter((entry) => entry.id !== device.id) };
    } catch (cause) {
      messages[device.id] = `Not forgotten: ${errorMessage(cause)}`;
    }
  }

  async function prefer(row: DeviceRow) {
    const id = row.device.id;
    busy[`preferred-${id}`] = true;
    delete messages[id];
    try {
      await onpreferred(PREFERRED_KEY[kind], row.preferred ? null : id);
    } catch (cause) {
      messages[id] = errorMessage(cause);
    } finally {
      busy[`preferred-${id}`] = false;
    }
  }

  // --- Wi-Fi scales added by address ---

  let hosts: string[] | null = $state(null);
  let host = $state('');
  let wifiMessage: string | null = $state(null);

  async function readWifi() {
    try {
      hosts = await skin.client.listWifiScales();
      wifiMessage = null;
    } catch (cause) {
      // "Not read" must not look like "none added".
      wifiMessage = `The Wi-Fi scales were not read: ${errorMessage(cause)}`;
    }
  }

  async function addWifi() {
    const added = host.trim();
    if (!added) return void (wifiMessage = 'Enter an IP address or a host name.');
    try {
      hosts = await skin.client.addWifiScale(added);
      host = '';
      wifiMessage = null;
    } catch (cause) {
      wifiMessage = `Not added: ${errorMessage(cause)}`;
    }
  }

  async function removeWifi(entry: string) {
    try {
      hosts = await skin.client.removeWifiScale(entry);
      wifiMessage = null;
    } catch (cause) {
      wifiMessage = `Not removed: ${errorMessage(cause)}`;
    }
  }

  const ACTION_LABEL = { connect: 'Connect', disconnect: 'Disconnect', rescan: 'Reconnect', forget: 'Forget' } as const;
</script>

<div class="devices" data-testid="devices-{kind}">
  <div class="head">
    <small>
      {#if !frame}Waiting for Decaid's device list…{:else if frame.scanning}Searching…{:else}Search finds nearby machines and scales
        and connects a missing one.{/if}
    </small>
    <button class="action" data-testid="devices-scan-{kind}" disabled={!frame || frame.scanning} onclick={() => scan()}>Search</button>
  </div>
  {#if message}<p class="warn">{message}</p>{/if}

  {#if frame && rows.length === 0}
    <p class="empty" data-testid="devices-none-{kind}">No {name} found: tap Search to find nearby devices.</p>
  {/if}
  {#each rows as row (row.device.id)}
    <div class="device {row.state}" data-testid="device-{row.device.id}" data-state={row.state}>
      <span class="dot"></span>
      <div class="about">
        <strong>{row.device.name}</strong>
        <small class="id">{row.device.id}</small>
        {#if messages[row.device.id]}<small class="warn" data-testid="device-message-{row.device.id}">{messages[row.device.id]}</small
          >{/if}
      </div>
      <button
        class="lever-button"
        role="switch"
        aria-label="preferred {name}"
        aria-checked={row.preferred}
        disabled={preferred === undefined || !!busy[`preferred-${row.device.id}`]}
        data-testid="device-preferred-{row.device.id}"
        onclick={() => prefer(row)}><small>Preferred</small><span class="lever"><span></span></span></button
      >
      <span class="badge" data-testid="device-state-{row.device.id}">{row.label}</span>
      {#each row.actions as action (action)}
        <button
          class="action"
          class:danger={action === 'forget'}
          data-testid="device-{action}-{row.device.id}"
          disabled={!!busy[row.device.id]}
          onclick={() => act(row, action)}>{ACTION_LABEL[action]}</button
        >
      {/each}
    </div>
  {/each}

  {#if kind === 'scale'}
    <div class="wifi">
      <div class="about">
        <strong>Wi-Fi scale by address</strong>
        <small>Most Wi-Fi scales are found by Search. Add one by its IP address or host name only if it is not.</small>
      </div>
      <div class="add">
        <input
          type="text"
          inputmode="url"
          autocomplete="off"
          placeholder="192.168.1.42 or hds.local"
          aria-label="Wi-Fi scale address"
          data-testid="wifi-host"
          bind:value={host}
          onkeydown={(e) => e.key === 'Enter' && addWifi()}
        />
        <button class="action" data-testid="wifi-add" onclick={addWifi}>Add</button>
      </div>
    </div>
    {#each hosts ?? [] as entry (entry)}
      <div class="device">
        <div class="about"><strong>{entry}</strong></div>
        <button class="action" data-testid="wifi-remove-{entry}" onclick={() => removeWifi(entry)}>Remove</button>
      </div>
    {/each}
    {#if wifiMessage}<p class="warn" data-testid="wifi-message">{wifiMessage}</p>{/if}
  {/if}
</div>

{#if forgetting}
  {@const device = forgetting}
  <Confirm
    title="Forget {device.name}?"
    text="Decaid no longer remembers it; it is listed again when a search finds it."
    ok="Forget"
    onok={() => forget(device)}
    oncancel={() => (forgetting = null)}
  />
{/if}

<style>
  .head,
  .device,
  .wifi {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.7rem 0;
    border-top: 1px solid var(--line);
  }

  .head {
    justify-content: space-between;
  }

  .about {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  strong {
    font-size: var(--text-body);
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .id {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, monospace;
  }

  .dot {
    flex: none;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: var(--line);
  }

  .connected .dot {
    background: var(--fg);
  }

  .unavailable {
    opacity: 0.6;
  }

  .badge {
    flex: none;
    min-width: 6.5rem;
    text-align: center;
    color: var(--dim);
  }

  .connected .badge {
    color: var(--fg);
    font-weight: 600;
  }

  .empty {
    color: var(--dim);
  }

  .warn {
    color: var(--temperature);
  }

  button,
  input {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
  }

  button {
    user-select: none;
  }

  button:disabled {
    opacity: 0.5;
  }

  .action {
    flex: none;
    min-width: 7.5rem;
    min-height: 3.2rem;
    padding: 0 0.9rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .action.danger {
    border-color: var(--temperature);
    color: var(--temperature);
  }

  .lever-button {
    flex: none;
    min-height: 3.2rem;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    background: none;
    border: 0;
  }

  .lever {
    display: block;
    width: 3.6rem;
    height: 1.9rem;
    padding: 0.2rem;
    box-sizing: border-box;
    border-radius: 1rem;
    background: var(--raised);
    border: 1px solid var(--line);
  }

  .lever span {
    display: block;
    width: 1.4rem;
    height: 100%;
    border-radius: 50%;
    background: var(--dim);
    transition: transform 0.12s;
  }

  [aria-checked='true'] .lever {
    background: var(--pressure);
    border-color: var(--pressure);
  }

  [aria-checked='true'] .lever span {
    background: var(--bg);
    transform: translateX(1.7rem);
  }

  .add {
    flex: none;
    display: flex;
    gap: 0.5rem;
  }

  input {
    width: 16rem;
    min-height: 3.2rem;
    box-sizing: border-box;
    padding: 0 0.8rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }
</style>
