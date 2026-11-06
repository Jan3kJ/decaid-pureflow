<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/categories/maintenance.js.
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // One maintenance procedure: its instructions, Start with a
  // confirm, and Cancel while it runs; the steps the machine reports. It needs only the skin
  // and the procedure, so it can be opened on its own as well as in the settings page.
  import { onDestroy, onMount } from 'svelte';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import ProcedureSteps from './ProcedureSteps.svelte';
  import SettingsRow from './SettingsRow.svelte';
  import {
    IDLE,
    NEEDS_WATER,
    PROCEDURES,
    STEAM_COOLDOWN_TIMEOUT_MS,
    WAKE_TIMEOUT_MS,
    DESCALE_STEAM_MAX,
    advance,
    caption,
    isActive,
    joined,
    started,
    steamCoolEnough,
    type ProcedureId,
    type Progress,
  } from './maintenance';
  import { CLEAN_WATER_MIN_ML, cleanWater } from './water-tank';
  import { errorMessage } from '../error-message';

  interface Props {
    skin: Skin;
    procedure: ProcedureId;
    /** false where a heading above already names it, as in the settings page */
    titled?: boolean;
  }

  let { skin, procedure: id, titled = true }: Props = $props();

  const procedure = $derived(PROCEDURES[id]);
  const TICK_MS = 1000;

  /** the machine's state, null while no fresh frame is known */
  const machineState = () => (skin.link === 'machine' ? (skin.snapshot?.state.state ?? null) : null);

  let progress: Progress = $state(IDLE);
  let asking = $state(false);
  let message: string | null = $state(null);
  /** °C, the steam boiler while it cools before a descale; null while it does not */
  let cooling: number | null = $state(null);
  /** this page switched the steam heater off for a descale */
  let heaterOff = false;
  /** a start in flight: a Cancel or leaving the page makes it stale */
  let token = 0;
  let mounted = true;
  let timer: ReturnType<typeof setInterval> | undefined;

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  function tick() {
    // While the boiler cools nothing has been asked yet: no timeout.
    if (cooling !== null) return;
    const before = progress;
    progress = advance(
      progress,
      { state: machineState(), substate: skin.snapshot?.state.substate ?? null, now: Date.now() },
      procedure,
    );
    if (progress.phase === 'done' && before.phase !== 'done') void restoreHeater();
  }

  onMount(() => {
    // A procedure started on the machine itself, or before the page was opened, is shown too.
    progress = joined(machineState(), procedure, Date.now());
    timer = setInterval(tick, TICK_MS);
  });

  onDestroy(() => {
    mounted = false;
    clearInterval(timer);
    void restoreHeater();
  });

  async function restoreHeater() {
    if (!heaterOff) return;
    heaterOff = false;
    await skin.setSteamHeater(true);
  }

  function ask() {
    message = null;
    if (machineState() === 'needsWater') message = NEEDS_WATER;
    else asking = true;
  }

  async function start() {
    asking = false;
    const mine = ++token;
    const current = () => mounted && mine === token;
    // "Starting" at once: a wake or a cool-down takes a while.
    progress = started(Date.now());
    try {
      // A sleeping DE1 drops the request: wake it first and wait, then ask anyway.
      if (machineState() === 'sleeping') {
        await skin.client.requestMachineState('idle');
        for (let waited = 0; waited < WAKE_TIMEOUT_MS && current() && machineState() === 'sleeping'; waited += 250) await wait(250);
      }
      if (procedure.state === 'descaling') await coolSteamBoiler(current);
      if (!current()) return;
      await skin.client.requestMachineState(procedure.state);
      progress = started(Date.now());
    } catch (cause) {
      if (!current()) return;
      cooling = null;
      void restoreHeater();
      progress = IDLE;
      message = `${procedure.title} did not start: ${errorMessage(cause)}`;
    }
  }

  /** Descaling runs through the steam path: the heater off and the boiler down to 60 °C first. */
  async function coolSteamBoiler(current: () => boolean) {
    if (skin.steamHeater === 'on') {
      if (!(await skin.setSteamHeater(false))) throw new Error(skin.notice ?? 'the steam heater was not switched off');
      heaterOff = true;
    }
    const deadline = Date.now() + STEAM_COOLDOWN_TIMEOUT_MS;
    while (current() && !steamCoolEnough(skin.snapshot?.steamTemperature)) {
      if (Date.now() > deadline) throw new Error('the steam boiler did not cool down. Try again once it is cold');
      cooling = skin.snapshot?.steamTemperature ?? null;
      await wait(1000);
    }
    cooling = null;
  }

  async function cancel() {
    // A start still waiting for the wake or the cool-down does not go out afterwards.
    token++;
    cooling = null;
    message = null;
    void restoreHeater();
    try {
      await skin.client.requestMachineState('idle');
      if (mounted) progress = IDLE;
    } catch (cause) {
      message = `${procedure.title} was not stopped: ${errorMessage(cause)}`;
    }
  }

  const line = $derived(
    cooling !== null
      ? { text: `Cool down ${Math.round(cooling)} °C → ${DESCALE_STEAM_MAX} °C`, tone: 'progress' as const }
      : caption(progress, procedure),
  );
  const active = $derived(isActive(progress) || cooling !== null);
  // A clean uses about 300 ml and flushes it into the drip tray; the
  // warning does not stop Start.
  const water = $derived(procedure.id === 'clean' ? cleanWater(skin.link === 'machine' ? skin.water : null) : null);
</script>

<div class="procedure" data-testid="maintenance-{procedure.id}">
  <SettingsRow label={titled ? procedure.title : undefined} hint={procedure.description}>
    {#snippet about()}
      {#if procedure.link}
        <small><a href={procedure.link.href} target="_blank" rel="noreferrer">{procedure.link.label}</a></small>
      {/if}
      {#if water}
        <small data-testid="maintenance-water-{procedure.id}">water tank: {water.ml === null ? '–' : `${water.ml} ml`}</small>
        {#if water.low}
          <small class="low" data-testid="maintenance-water-low-{procedure.id}">
            Under {CLEAN_WATER_MIN_ML} ml: a clean uses about 300 ml. Fill the tank first.
          </small>
        {/if}
        <small data-testid="maintenance-drip-tray-{procedure.id}">empty the drip tray before starting.</small>
      {/if}
    {/snippet}
    {#if active}
      <button class="action" data-testid="maintenance-cancel-{procedure.id}" onclick={cancel}>cancel</button>
    {:else}
      <button class="action primary" data-testid="maintenance-start-{procedure.id}" onclick={ask}>start</button>
    {/if}
  </SettingsRow>

  {#if line}
    <ProcedureSteps id={procedure.id} milestones={procedure.milestones} milestone={progress.milestone} {line} />
  {/if}
  {#if message}<p class="warn" data-testid="maintenance-message-{procedure.id}">{message}</p>{/if}
</div>

{#if asking}
  <Confirm title="{procedure.title}?" text={procedure.confirm} ok="start" onok={start} oncancel={() => (asking = false)} />
{/if}

<style>
  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  a {
    color: var(--fg);
  }

  .action {
    min-width: 8rem;
    min-height: var(--control-big);
  }

  .warn,
  small.low {
    color: var(--temperature);
  }

  .warn {
    margin: 0 0 var(--space-2);
  }
</style>
