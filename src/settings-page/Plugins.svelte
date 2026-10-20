<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/settings.js (renderPluginManagerSettings, renderPluginCard,
  renderPluginSettingControl, bindPluginSettingControls) and src/settings/plugin-view.js.
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // Extensions > Plugins (research.md 20.3, 20.10 S2c): a card per plugin Decaid lists, with
  // its version and state, Enabled, an update held back for permissions to approve, and one
  // control per setting its manifest declares. Every change is written at once and read back:
  // the card shows what the gateway holds. A secure value is never shown, only 'Saved' or 'Not
  // set'; typing one writes it and the field is emptied.
  import { onMount } from 'svelte';
  import type { PluginManifest, PluginSettings } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import { textOf } from './text';
  import {
    STATUS_LABEL,
    isStored,
    pluginControls,
    pluginStatus,
    shownValue,
    sortedPlugins,
    written,
    type PluginControl,
  } from './plugins';
  import { errorMessage } from '../error-message';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  let plugins: PluginManifest[] | null = $state.raw(null);
  /** each plugin's stored values, by id; absent while not read */
  let stored: Record<string, PluginSettings> = $state({});
  let readError: string | null = $state(null);
  /** `id` or `id/key` with a write in flight */
  let busy: Record<string, boolean> = $state({});
  /** the message of a failed write, by `id` or `id/key` */
  let failed: Record<string, string> = $state({});
  /** a secure value being typed, by `id/key`; emptied after a write */
  let secret: Record<string, string> = $state({});
  let typing: { plugin: PluginManifest; control: PluginControl; current: string } | null = $state(null);
  let confirming: { title: string; text: string; ok: string; run: () => void } | null = $state(null);
  let checking = $state(false);
  let checked: string | null = $state(null);

  async function readSettings(plugin: PluginManifest) {
    try {
      stored[plugin.id] = await skin.client.getPluginSettings(plugin.id);
      delete failed[plugin.id];
    } catch (cause) {
      failed[plugin.id] = `Settings not read: ${errorMessage(cause)}`;
    }
  }

  async function readPlugins() {
    try {
      plugins = sortedPlugins(await skin.client.listPlugins());
      readError = null;
    } catch (cause) {
      readError = errorMessage(cause);
      return;
    }
    await Promise.all(plugins.filter((plugin) => pluginControls(plugin).length).map(readSettings));
  }

  onMount(() => void readPlugins());

  async function write(plugin: PluginManifest, control: PluginControl, input: unknown) {
    const value = written(control, input);
    if (value === null) return;
    const at = `${plugin.id}/${control.key}`;
    busy[at] = true;
    delete failed[at];
    try {
      await skin.client.updatePluginSettings(plugin.id, { [control.key]: value });
      if (control.kind === 'secure') secret[at] = '';
      // The answer is redacted too, but a read is what the gateway holds (acceptance 22).
      stored[plugin.id] = await skin.client.getPluginSettings(plugin.id);
    } catch (cause) {
      failed[at] = `${control.label} was not set: ${errorMessage(cause)}`;
    } finally {
      busy[at] = false;
    }
  }

  async function enable(plugin: PluginManifest, on: boolean) {
    busy[plugin.id] = true;
    delete failed[plugin.id];
    try {
      await skin.client.setPluginEnabled(plugin.id, on);
      plugins = sortedPlugins(await skin.client.listPlugins());
    } catch (cause) {
      failed[plugin.id] = `${on ? 'Not enabled' : 'Not disabled'}: ${errorMessage(cause)}`;
    } finally {
      busy[plugin.id] = false;
    }
  }

  function approve(plugin: PluginManifest) {
    const added = plugin.pendingUpdate?.addedPermissions ?? [];
    confirming = {
      title: `Update ${plugin.name || plugin.id} to ${plugin.pendingUpdate?.version ?? 'the new version'}?`,
      text: `The update asks for permissions the installed version does not have${added.length ? `: ${added.join(', ')}` : ''}.`,
      ok: 'Update',
      run: () => void runApprove(plugin),
    };
  }

  async function runApprove(plugin: PluginManifest) {
    confirming = null;
    busy[plugin.id] = true;
    delete failed[plugin.id];
    try {
      await skin.client.approvePluginUpdate(plugin.id);
      plugins = sortedPlugins(await skin.client.listPlugins());
    } catch (cause) {
      failed[plugin.id] = `Not updated: ${errorMessage(cause)}`;
    } finally {
      busy[plugin.id] = false;
    }
  }

  async function checkUpdates() {
    checking = true;
    checked = null;
    try {
      await skin.client.checkPluginUpdates();
      plugins = sortedPlugins(await skin.client.listPlugins());
      checked = 'Checked; the states below are what Decaid reports now.';
    } catch (cause) {
      checked = `The check did not run: ${errorMessage(cause)}`;
    } finally {
      checking = false;
    }
  }

  const schemaOf = (plugin: PluginManifest, control: PluginControl) => plugin.settings![control.key];
  const valueOf = (plugin: PluginManifest, control: PluginControl) =>
    shownValue(control, schemaOf(plugin, control), stored[plugin.id] ?? {});
</script>

<div class="plugins" data-testid="plugins">
  <div class="row">
    <div class="about">
      <strong>Check for plugin updates</strong>
      <small>Decaid checks every plugin installed from GitHub; one that asks for more permissions waits for approval.</small>
      {#if checked}<small data-testid="plugins-checked">{checked}</small>{/if}
    </div>
    <button class="action" data-testid="plugins-check" disabled={checking || !plugins} onclick={checkUpdates}
      >{checking ? 'Checking…' : 'Check'}</button
    >
  </div>

  {#if readError}
    <p class="warn" data-testid="plugins-error">
      Not read: {readError}
      <button class="action" onclick={readPlugins}>Read again</button>
    </p>
  {:else if !plugins}
    <p class="dim">Reading the plugins…</p>
  {:else if !plugins.length}
    <p class="dim">No plugins installed.</p>
  {/if}

  {#each plugins ?? [] as plugin (plugin.id)}
    {@const status = pluginStatus(plugin)}
    {@const controls = pluginControls(plugin)}
    <article class="card" data-testid="plugin-{plugin.id}" data-loaded={plugin.loaded === true}>
      <div class="head">
        <h3>{plugin.name || plugin.id}</h3>
        {#if plugin.version}<span class="dim">{plugin.version}</span>{/if}
        <span class="pill" data-testid="plugin-status-{plugin.id}">{STATUS_LABEL[status]}</span>
      </div>
      {#if plugin.description}<p class="description">{plugin.description}</p>{/if}
      {#if plugin.source?.lastError}<p class="warn">{plugin.source.lastError}</p>{/if}

      <div class="row">
        <div class="about">
          <strong>Enabled</strong>
          {#if failed[plugin.id]}<small class="warn" data-testid="plugin-error-{plugin.id}">{failed[plugin.id]}</small>{/if}
        </div>
        <button
          class="lever-button"
          role="switch"
          aria-label="{plugin.name || plugin.id} enabled"
          aria-checked={plugin.loaded === true}
          disabled={!!busy[plugin.id]}
          data-testid="plugin-enabled-{plugin.id}"
          onclick={() => enable(plugin, plugin.loaded !== true)}><span class="lever"><span></span></span></button
        >
      </div>

      {#if plugin.pendingUpdate}
        <div class="row">
          <div class="about">
            <strong>Update {plugin.pendingUpdate.version ?? ''}</strong>
            <small>Asks for: {(plugin.pendingUpdate.addedPermissions ?? []).join(', ') || 'more permissions'}</small>
          </div>
          <button class="action" data-testid="plugin-approve-{plugin.id}" disabled={!!busy[plugin.id]} onclick={() => approve(plugin)}
            >Approve</button
          >
        </div>
      {/if}

      {#each controls as control (control.key)}
        {@const at = `${plugin.id}/${control.key}`}
        {@const value = valueOf(plugin, control)}
        {@const read = stored[plugin.id] !== undefined}
        <div class="row" class:busy={busy[at]} data-testid="plugin-row-{plugin.id}-{control.key}">
          <div class="about">
            <strong>{control.label}</strong>
            {#if control.description}<small>{control.description}</small>{/if}
            {#if read && !isStored(control, stored[plugin.id]) && control.kind !== 'secure'}<small>default</small>{/if}
            {#if failed[at]}<small class="warn" data-testid="plugin-error-{plugin.id}-{control.key}">{failed[at]}</small>{/if}
          </div>
          {#if control.kind === 'boolean'}
            <button
              class="lever-button"
              role="switch"
              aria-label={control.label}
              aria-checked={value === true}
              disabled={!read || !!busy[at]}
              data-testid="plugin-setting-{plugin.id}-{control.key}"
              onclick={() => write(plugin, control, value !== true)}><span class="lever"><span></span></span></button
            >
          {:else if control.kind === 'number'}
            <button
              class="value"
              disabled={!read || !!busy[at]}
              data-testid="plugin-setting-{plugin.id}-{control.key}"
              onclick={() => (typing = { plugin, control, current: value === null ? '' : textOf(value) })}
              ><b>{value === null ? '–' : textOf(value)}</b></button
            >
          {:else if control.kind === 'enum'}
            <div class="choices" data-testid="plugin-setting-{plugin.id}-{control.key}">
              {#each control.values as option (option)}
                <button
                  class="chip"
                  aria-pressed={value === option}
                  disabled={!read || !!busy[at]}
                  data-testid="plugin-setting-{plugin.id}-{control.key}-{option}"
                  onclick={() => value !== option && write(plugin, control, option)}>{option}</button
                >
              {/each}
            </div>
          {:else if control.kind === 'secure'}
            <!-- Never filled from the gateway: it reports only whether one is stored. -->
            <input
              type="password"
              autocomplete="off"
              placeholder={String(value)}
              disabled={!read || !!busy[at]}
              data-testid="plugin-setting-{plugin.id}-{control.key}"
              bind:value={secret[at]}
              onchange={() => write(plugin, control, secret[at] ?? '')}
            />
          {:else}
            <input
              type="text"
              autocomplete="off"
              disabled={!read || !!busy[at]}
              data-testid="plugin-setting-{plugin.id}-{control.key}"
              value={value === null ? '' : textOf(value)}
              onchange={(event) => write(plugin, control, event.currentTarget.value)}
            />
          {/if}
        </div>
      {/each}
    </article>
  {/each}
</div>

{#if typing}
  {@const { plugin, control, current } = typing}
  <NumberPad
    label={control.label}
    unit=""
    min={0}
    max={99999}
    decimals={true}
    places={2}
    {current}
    onconfirm={(entered) => {
      // the consts follow `typing`: write before it is cleared
      void write(plugin, control, entered);
      typing = null;
    }}
    oncancel={() => (typing = null)}
  />
{/if}

{#if confirming}
  <Confirm
    title={confirming.title}
    text={confirming.text}
    ok={confirming.ok}
    onok={confirming.run}
    oncancel={() => (confirming = null)}
  />
{/if}

<style>
  .plugins {
    display: flex;
    flex-direction: column;
  }

  .card {
    margin: 0.6rem 0 0.2rem;
    padding: 0.4rem 1rem 0.2rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--bg);
  }

  .head {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.4rem 0.8rem;
    padding: 0.3rem 0;
  }

  h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
  }

  .pill {
    margin-left: auto;
    padding: 0.15rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 1rem;
    color: var(--dim);
    font-size: 0.85rem;
  }

  .description {
    margin: 0 0 0.4rem;
    color: var(--dim);
    font-size: 0.95rem;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0;
    border-top: 1px solid var(--line);
  }

  .busy {
    opacity: 0.6;
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  strong {
    font-size: 1.15rem;
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: 0.85rem;
  }

  .dim {
    color: var(--dim);
  }

  .warn,
  small.warn {
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

  button:disabled,
  input:disabled {
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

  .value {
    flex: none;
    min-width: 8rem;
    min-height: 3.6rem;
    padding: 0 0.8rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .value b {
    font-size: 1.4rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  input {
    flex: none;
    width: 16rem;
    min-height: 3.2rem;
    box-sizing: border-box;
    padding: 0 0.8rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .choices {
    flex: 0 1 auto;
    max-width: 65%;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.4rem;
  }

  .chip {
    min-height: 3rem;
    padding: 0 0.9rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 1.5rem;
  }

  .chip[aria-pressed='true'] {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }

  .lever-button {
    flex: none;
    min-height: 3.6rem;
    padding: 0;
    background: none;
    border: 0;
  }

  .lever {
    display: block;
    width: 4.4rem;
    height: 2.4rem;
    padding: 0.25rem;
    box-sizing: border-box;
    border-radius: 1.2rem;
    background: var(--raised);
    border: 1px solid var(--line);
  }

  .lever span {
    display: block;
    width: 1.8rem;
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
    transform: translateX(2rem);
  }
</style>
