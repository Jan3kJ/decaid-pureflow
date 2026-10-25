<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/categories/maintenance.js.
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // One maintenance procedure (research.md 20.3, 20.10 S2b): its instructions, Start with a
  // confirm, and Cancel while it runs; the steps the machine reports. It needs only the skin
  // and the procedure, so it can be opened on its own as well as in the settings page.
  import { onDestroy, onMount } from 'svelte';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
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
  // A clean uses about 300 ml and flushes it into the drip tray (spec 3.8 'Menu: clean'); the
  // warning does not stop Start.
  const water = $derived(procedure.id === 'clean' ? cleanWater(skin.link === 'machine' ? skin.water : null) : null);
</script>

<div class="procedure" data-testid="maintenance-{procedure.id}">
  <div class="row">
    <div class="about">
      {#if titled}<strong>{procedure.title}</strong>{/if}
      <small>{procedure.description}</small>
      {#if procedure.link}
        <small><a href={procedure.link.href} target="_blank" rel="noreferrer">{procedure.link.label}</a></small>
      {/if}
      {#if water}
        <small data-testid="maintenance-water-{procedure.id}">Water tank: {water.ml === null ? '–' : `${water.ml} ml`}</small>
        {#if water.low}
          <small class="low" data-testid="maintenance-water-low-{procedure.id}">
            Under {CLEAN_WATER_MIN_ML} ml: a clean uses about 300 ml. Fill the tank first.
          </small>
        {/if}
        <small data-testid="maintenance-drip-tray-{procedure.id}">Empty the drip tray before starting.</small>
      {/if}
    </div>
    {#if active}
      <button class="action" data-testid="maintenance-cancel-{procedure.id}" onclick={cancel}>Cancel</button>
    {:else}
      <button class="action primary" data-testid="maintenance-start-{procedure.id}" onclick={ask}>Start</button>
    {/if}
  </div>

  {#if line}
    <div class="progress" role="status" aria-live="polite">
      <ol class="steps">
        {#each procedure.milestones as label, i (label)}
          <li class:done={i < progress.milestone} class:now={i === progress.milestone}>
            <span class="dot">{i < progress.milestone ? '✓' : i + 1}</span>
            <small>{label}</small>
          </li>
        {/each}
      </ol>
      <p class="caption {line.tone}" data-testid="maintenance-caption-{procedure.id}">{line.text}</p>
    </div>
  {/if}
  {#if message}<p class="warn" data-testid="maintenance-message-{procedure.id}">{message}</p>{/if}
</div>

{#if asking}
  <Confirm title="{procedure.title}?" text={procedure.confirm} ok="Start" onok={start} oncancel={() => (asking = false)} />
{/if}

<style>
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
    font-size: var(--text-body);
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  a {
    color: var(--fg);
  }

  button {
    font: inherit;
    color: var(--fg);
    touch-action: manipulation;
    user-select: none;
  }

  .action {
    flex: none;
    min-width: 8rem;
    min-height: 3.6rem;
    padding: 0 1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .action.primary {
    color: var(--bg);
    background: var(--fg);
    border-color: var(--fg);
    font-weight: 600;
  }

  .progress {
    padding: 0.4rem 0 0.6rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .steps {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    gap: 1.6rem;
  }

  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
  }

  .dot {
    width: 2.4rem;
    height: 2.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px solid var(--line);
    color: var(--dim);
    font-weight: 600;
  }

  .done .dot,
  .now .dot {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }

  .now small {
    color: var(--fg);
  }

  .caption {
    margin: 0;
    font-size: var(--text-body);
    color: var(--dim);
  }

  .caption.success {
    color: var(--fg);
    font-weight: 600;
  }

  .caption.error,
  .warn,
  small.low {
    color: var(--temperature);
  }

  .warn {
    margin: 0 0 0.6rem;
  }
</style>
