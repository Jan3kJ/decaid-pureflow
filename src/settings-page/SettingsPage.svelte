<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/settings.html, settings-shell.js and settings-location.js.
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The settings page (spec 3.7 'Settings', research.md 20): Streamline's categories in a
  // left column with the chosen one's subcategories under it, and the chosen category in a
  // panel that scrolls. A change is written at once and read back (20.11); the skin's own
  // settings are the category Skin.
  import { onMount } from 'svelte';
  import { PRODUCT_NAME, PRODUCT_VERSION } from '../product';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import Devices from './Devices.svelte';
  import FieldRow from './FieldRow.svelte';
  import Firmware from './Firmware.svelte';
  import MachineInfo from './MachineInfo.svelte';
  import Maintenance from './Maintenance.svelte';
  import Plugins from './Plugins.svelte';
  import Presence from './Presence.svelte';
  import SensorCalibration from './SensorCalibration.svelte';
  import SkinCategory from './SkinCategory.svelte';
  import { PREFERRED_DEVICES, STEAM_TEMPERATURE, type Field } from './fields';
  import {
    NO_VALUES,
    applyFastStart,
    partOf,
    rawValue,
    readAll,
    readPart,
    resetMachine,
    sourceObject,
    writeField,
    type Part,
    type Values,
  } from './gateway';
  import { SETTINGS_TREE, loadLocation, saveLocation, type Action, type Subcategory } from './tree';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  let chosen = $state(loadLocation());
  const category = $derived(SETTINGS_TREE.find((entry) => entry.id === chosen) ?? SETTINGS_TREE[0]);
  let panel: HTMLElement | undefined = $state();

  function open(id: string) {
    chosen = id;
    saveLocation(id);
    panel?.scrollTo({ top: 0 });
  }

  function jump(sub: Subcategory) {
    document.getElementById(`sub-${sub.id}`)?.scrollIntoView({ block: 'start' });
  }

  let read: Values = $state.raw(NO_VALUES);
  /** the water levels come from the skin's stream, as home's tank level does */
  const values: Values = $derived({ ...read, waterLevels: skin.water });
  let readErrors: Partial<Record<Part, string>> = $state({});
  let reading = $state(true);

  async function readValues() {
    reading = true;
    const result = await readAll(skin.client, read);
    read = result.values;
    readErrors = result.errors;
    reading = false;
  }

  onMount(readValues);

  /** One source read again, after a change that is not a field's (a wake schedule). */
  async function readAgain(part: Part) {
    try {
      read = { ...read, [part]: await readPart(skin.client, part) };
      delete readErrors[part];
    } catch (cause) {
      readErrors[part] = cause instanceof Error ? cause.message : String(cause);
    }
  }

  const isRead = (field: Field) => {
    const part = partOf(field.source);
    return part ? read[part] !== null : skin.water !== null;
  };

  /** the field ids with a write in flight */
  let busy: Record<string, boolean> = $state({});
  /** the message of a field's failed write */
  let failed: Record<string, string> = $state({});
  /** a write that waits for its confirm (research.md 20.9) */
  let confirming: { title: string; text: string; run: () => void } | null = $state(null);
  /** what the last action of a subcategory did */
  let done: Record<string, string> = $state({});

  function write(field: Field, value: unknown) {
    if (field.confirm) {
      const label = field.kind === 'choice' ? field.options.find((option) => option.value === value)?.label : value;
      confirming = { title: `${field.label}: ${label}?`, text: field.confirm, run: () => void store(field, value) };
    } else void store(field, value);
  }

  async function store(field: Field, value: unknown) {
    confirming = null;
    busy[field.id] = true;
    delete failed[field.id];
    // The steam heater switched off here is switched on again by the menu with the temperature it had (spec 3.7).
    const before = rawValue(values, field);
    if (field === STEAM_TEMPERATURE && value === 0 && typeof before === 'number' && before >= STEAM_TEMPERATURE.min) {
      skin.setSettings({ steam: { ...skin.settings.steam, heaterTemperature: before } });
    }
    try {
      read = await writeField(skin.client, values, field, value);
      if (field.source.startsWith('workflow.')) skin.workflow = read.workflow;
    } catch (cause) {
      failed[field.id] = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy[field.id] = false;
    }
  }

  /** A device list's preferred switch: one write, read back, as every field; a failure goes to the list. */
  async function prefer(key: string, id: string | null) {
    const field = PREFERRED_DEVICES.find((entry) => entry.key === key)!;
    read = await writeField(skin.client, values, field, id);
  }

  const ACTIONS: Record<Action, { label: string; hint: string; confirm?: string }> = {
    'fast-start': {
      label: 'Fast Start Defaults',
      hint: 'Idle temperature 99 °C, warmup flow 2 ml/s, test flow 4 ml/s, time-out 1 s.',
    },
    reset: {
      label: 'Reset to defaults',
      hint: "The machine's settings above come back as the factory set them. The profile and the workflow are not touched.",
      confirm: "Fan, idle temperature, heater flows and time-out, refill kit, flow estimation and steam purge go back to the factory's.",
    },
    dashboard: { label: 'Go to dashboard', hint: "Leaves the skin for Decaid's own screens." },
  };

  /** Decaid's host function; only inside Decaid's own window */
  const host = (globalThis as { decentApp?: { exitToDashboard?: () => void } }).decentApp;
  const offered = (action: Action) => action !== 'dashboard' || typeof host?.exitToDashboard === 'function';

  function act(sub: Subcategory, action: Action) {
    const run = () => void perform(sub, action);
    const confirm = ACTIONS[action].confirm;
    if (confirm) confirming = { title: `${ACTIONS[action].label}?`, text: confirm, run };
    else run();
  }

  async function perform(sub: Subcategory, action: Action) {
    confirming = null;
    if (action === 'dashboard') return host?.exitToDashboard?.();
    busy[action] = true;
    delete done[sub.id];
    try {
      read = action === 'reset' ? await resetMachine(skin.client, values) : await applyFastStart(skin.client, values);
      done[sub.id] = action === 'reset' ? 'Reset; the values read back are shown.' : 'Set; the values read back are shown.';
    } catch (cause) {
      done[sub.id] = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy[action] = false;
    }
  }

  /** the parts a subcategory reads that failed */
  const unreadOf = (sub: Subcategory) => {
    if (sub.content.kind !== 'fields') return [];
    const parts = new Set(sub.content.fields.map((field) => partOf(field.source)).filter((part) => part !== null));
    return [...parts].filter((part) => readErrors[part]).map((part) => readErrors[part]!);
  };
</script>

<div class="settings">
  <header>
    <h1>Settings</h1>
    <p>Decaid's and the machine's settings, written at once and read back; the skin's own under Skin.</p>
    <!-- The skin's version, top right (founder, 2026-10-14); from the manifest, like the build. -->
    <small class="version" data-testid="skin-version">{PRODUCT_NAME} {PRODUCT_VERSION}</small>
  </header>

  <nav class="tree" aria-label="settings categories">
    {#each SETTINGS_TREE as entry (entry.id)}
      <button
        class="category"
        aria-current={entry.id === category.id}
        data-testid="settings-category-{entry.id}"
        onclick={() => open(entry.id)}><span class="number">{entry.number}.</span> {entry.name}</button
      >
      {#if entry.id === category.id}
        {#each entry.subcategories as sub (sub.id)}
          <button class="sub" data-testid="settings-sub-{sub.id}" onclick={() => jump(sub)}>{sub.name}</button>
        {/each}
      {/if}
    {/each}
  </nav>

  <div class="panel" bind:this={panel} data-testid="settings-content" data-category={category.id}>
    {#if category.id === 'skin'}
      <SkinCategory {skin} />
    {:else}
      {#each category.subcategories as sub (sub.id)}
        <section id="sub-{sub.id}" data-testid="settings-section-{sub.id}">
          <h2>{sub.name}</h2>
          {#if sub.hint}<p class="hint">{sub.hint}</p>{/if}
          {#if sub.content.kind === 'fields'}
            {@const view = sub.content.view}
            {#snippet shown()}
              {#if view?.kind === 'devices'}
                <Devices
                  {skin}
                  kind={view.devices}
                  preferred={read.decaid ? (read.decaid[view.devices === 'machine' ? 'preferredMachineId' : 'preferredScaleId'] ?? null) : undefined}
                  onpreferred={prefer}
                />
              {:else if view?.kind === 'maintenance'}
                <Maintenance {skin} procedure={view.procedure} titled={false} />
              {:else if view?.kind === 'machine-info' || view?.kind === 'charging'}
                <MachineInfo {skin} part={view.kind} decaid={read.decaid} />
              {:else if view?.kind === 'plugins'}
                <Plugins {skin} />
              {:else if view?.kind === 'presence'}
                <Presence {skin} schedules={read.presence ? (read.presence.schedules ?? []) : null} onchanged={() => readAgain('presence')} />
              {:else if view?.kind === 'firmware' || view?.kind === 'app-update'}
                <Firmware {skin} part={view.kind === 'firmware' ? 'firmware' : 'app'} />
              {:else if view?.kind === 'sensors'}
                <SensorCalibration {skin} />
              {/if}
            {/snippet}
            {#each unreadOf(sub) as error (error)}
              <p class="warn" data-testid="settings-unread">
                Not read: {error}
                <button class="action" onclick={readValues} disabled={reading}>Read again</button>
              </p>
            {/each}
            {#if !sub.content.below}{@render shown()}{/if}
            {#each sub.content.fields as field (field.id)}
              <FieldRow
                {field}
                raw={rawValue(values, field)}
                all={sourceObject(values, field.source)}
                read={isRead(field)}
                busy={!!busy[field.id]}
                error={failed[field.id] ?? null}
                onwrite={(value) => write(field, value)}
              />
            {/each}
            {#if sub.content.below}{@render shown()}{/if}
            {#each (sub.content.actions ?? []).filter(offered) as action (action)}
              <div class="row">
                <div class="about">
                  <strong>{ACTIONS[action].label}</strong>
                  <small>{ACTIONS[action].hint}</small>
                  {#if done[sub.id]}<small data-testid="settings-done-{action}">{done[sub.id]}</small>{/if}
                </div>
                <button class="action" data-testid="settings-action-{action}" disabled={!!busy[action]} onclick={() => act(sub, action)}
                  >{ACTIONS[action].label}</button
                >
              </div>
            {/each}
          {/if}
        </section>
      {/each}
    {/if}
  </div>
</div>

{#if confirming}
  <Confirm title={confirming.title} text={confirming.text} onok={confirming.run} oncancel={() => (confirming = null)} />
{/if}

<style>
  .settings {
    height: 100%;
    box-sizing: border-box;
    padding: 1rem 1.2rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 4fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0.8rem 1.2rem;
  }

  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: 1.2rem;
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: 2.2rem;
    font-weight: 600;
    line-height: 1.15;
  }

  header p {
    margin: 0;
    min-width: 0;
    color: var(--dim);
  }

  .version {
    margin-left: auto;
    flex: none;
    opacity: 0.7;
  }

  .tree {
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  button {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  .category {
    min-height: 3.2rem;
    padding: 0 0.9rem;
    text-align: left;
    font-size: 1.1rem;
    font-weight: 600;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .category[aria-current='true'] {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }

  .number {
    opacity: 0.6;
  }

  .sub {
    min-height: 2.8rem;
    margin-left: 1rem;
    padding: 0 0.8rem;
    text-align: left;
    color: var(--dim);
    background: none;
    border: 0;
    border-left: 2px solid var(--line);
  }

  .panel {
    min-height: 0;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    padding-bottom: 30vh;
  }

  section {
    padding: 0.2rem 1.2rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
    scroll-margin-top: 0.6rem;
  }

  h2 {
    margin: 0.6rem 0 0.1rem;
    font-size: 1.4rem;
    font-weight: 600;
  }

  .hint {
    margin: 0 0 0.2rem;
    color: var(--dim);
    font-size: 0.9rem;
  }

  .warn {
    color: var(--temperature);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.7rem 0;
    border-top: 1px solid var(--line);
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
