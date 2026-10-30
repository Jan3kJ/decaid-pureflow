<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
  src/settings/settings.js (renderCupWarmerSettings, renderLedSettings, the load-cell wizard).
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The Bengle-only pages: Machine > Cup Warmer and Lighting, Calibration >
  // Load Cells. SettingsPage shows them only when the machine's model names a Bengle. Each value
  // is written alone and the page reads the machine again afterwards, so it shows what the
  // machine took.
  import { onMount } from 'svelte';
  import type { CupWarmerPreheat, CupWarmerState, LedStripState, ScaleCalibrationState } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import { errorMessage } from '../error-message';
  import type { Skin } from '../shell/skin.svelte';
  import {
    CUP_WARMER_DEFAULT,
    CUP_WARMER_MAX,
    PREHEAT_LEAD_MAX,
    RESULT_TEXT,
    STEP_TEXT,
    calibrationBusy,
    clampWhole,
    fromInputColour,
    matReading,
    toInputColour,
    validGrams,
  } from './bengle';

  interface Props {
    skin: Skin;
    part: 'cup-warmer' | 'lighting' | 'load-cells';
  }

  let { skin, part }: Props = $props();

  let error: string | null = $state(null);
  let failed: string | null = $state(null);
  let busy = $state(false);
  let typing: 'temperature' | 'lead' | 'grams' | null = $state(null);

  let warmer = $state.raw(null as CupWarmerState | null);
  let preheat = $state.raw(null as CupWarmerPreheat | null);
  let strip = $state.raw(null as LedStripState | null);
  let calibration = $state.raw(null as ScaleCalibrationState | null);
  /** the strip as edited, written with Save */
  let draft = $state(null as Pick<LedStripState, 'frontStrip' | 'backStrip'> | null);
  let grams = $state(500);
  let polling: ReturnType<typeof setInterval> | undefined;

  async function read() {
    try {
      if (part === 'cup-warmer') {
        warmer = await skin.client.getCupWarmer();
        // A firmware without the pre-warm answers 404: the page then leaves it out.
        preheat = await skin.client.getCupWarmerPreheat().catch(() => null);
      } else if (part === 'lighting') {
        strip = await skin.client.getLedStrip();
        draft = { frontStrip: { ...strip.frontStrip }, backStrip: { ...strip.backStrip } };
      } else {
        calibration = await skin.client.getScaleCalibration();
      }
      error = null;
    } catch (cause) {
      error = errorMessage(cause);
    }
  }

  onMount(() => {
    void read();
    // the mat's reading and the calibration's countdown change by themselves
    if (part !== 'lighting') polling = setInterval(() => void (busy || typing ? null : read()), 3000);
    return () => clearInterval(polling);
  });

  /** One write, then a read of what the machine holds. */
  async function run(write: () => Promise<void>) {
    busy = true;
    failed = null;
    try {
      await write();
      await read();
    } catch (cause) {
      failed = errorMessage(cause);
    } finally {
      busy = false;
    }
  }

  const heating = $derived(warmer !== null && warmer.enabled && warmer.temperature > 0);
  const target = $derived(warmer && warmer.temperature > 0 ? warmer.temperature : CUP_WARMER_DEFAULT);

  const setMat = (update: { temperature?: number; enabled?: boolean }) => run(() => skin.client.setCupWarmer(update));
  const setPreheat = (update: { enabled?: boolean; leadMinutes?: number }) => run(() => skin.client.setCupWarmerPreheat(update));

  function confirmTyped(value: number) {
    const kind = typing;
    typing = null;
    if (kind === 'temperature') void setMat({ temperature: clampWhole(value, CUP_WARMER_MAX) });
    else if (kind === 'lead') void setPreheat({ leadMinutes: clampWhole(value, PREHEAT_LEAD_MAX) });
    else if (kind === 'grams') grams = value;
  }

  const ZONES = [
    { id: 'frontStrip', label: 'Front strip' },
    { id: 'backStrip', label: 'Back strip' },
  ] as const;
  const MOMENTS = [
    { id: 'awake', label: 'awake' },
    { id: 'sleeping', label: 'asleep' },
  ] as const;

  const changed = $derived(
    strip !== null &&
      draft !== null &&
      ZONES.some((zone) => MOMENTS.some((moment) => draft![zone.id][moment.id] !== strip![zone.id][moment.id])),
  );
  const saveStrip = () => run(() => skin.client.setLedStrip(draft!));

  const running = $derived(calibrationBusy(calibration));
  const sendCalibration = (command: 'zero' | 'abort' | { latch: number }) => run(() => skin.client.commandScaleCalibration(command));
</script>

{#if error}
  <p class="warn" data-testid="bengle-error">
    Not read: {error}
    <button class="action" onclick={read}>read again</button>
  </p>
{:else if part === 'cup-warmer'}
  {#if warmer}
    <div data-testid="cup-warmer">
      <div class="row">
        <span>Mat temperature</span><b data-testid="cup-warmer-current">{matReading(warmer.currentTemperature)}</b>
      </div>
      <div class="row">
        <span>Cup warmer</span>
        <button
          class="lever-button"
          role="switch"
          aria-label="Cup warmer"
          aria-checked={heating}
          disabled={busy}
          data-testid="cup-warmer-switch"
          onclick={() => setMat(heating ? { enabled: false } : { temperature: target })}
          ><span class="lever"><span></span></span></button
        >
      </div>
      <div class="row">
        <span>Target</span>
        <button class="value" disabled={busy} data-testid="cup-warmer-target" onclick={() => (typing = 'temperature')}
          >{target}<i>°C</i></button
        >
      </div>
      {#if preheat}
        <div class="row">
          <div class="about">
            <span>Pre-warm before a wake schedule</span>
            <small>The firmware starts the mat before a scheduled wake and holds it until the window closes.</small>
            {#if preheat.active}<small data-testid="cup-warmer-preheat-active">The wake schedule heats the mat now.</small>{/if}
          </div>
          <button
            class="lever-button"
            role="switch"
            aria-label="Pre-warm"
            aria-checked={preheat.enabled}
            disabled={busy}
            data-testid="cup-warmer-preheat"
            onclick={() => setPreheat({ enabled: !preheat!.enabled })}><span class="lever"><span></span></span></button
          >
        </div>
        <div class="row">
          <span>Pre-warm lead</span>
          <button class="value" disabled={busy} data-testid="cup-warmer-lead" onclick={() => (typing = 'lead')}
            >{preheat.leadMinutes}<i>min</i></button
          >
        </div>
      {/if}
    </div>
  {:else}
    <p class="dim">Reading the cup warmer…</p>
  {/if}
{:else if part === 'lighting'}
  {#if draft}
    <div data-testid="lighting">
      {#each ZONES as zone (zone.id)}
        {#each MOMENTS as moment (moment.id)}
          <div class="row">
            <span>{zone.label}, {moment.label}</span>
            <input
              type="color"
              aria-label="{zone.label}, {moment.label}"
              data-testid="led-{zone.id}-{moment.id}"
              value={toInputColour(draft[zone.id][moment.id])}
              disabled={busy}
              onchange={(event) => (draft![zone.id][moment.id] = fromInputColour(event.currentTarget.value))}
            />
          </div>
        {/each}
      {/each}
      <div class="row">
        <small>The strips take the colours at once and the machine keeps them.</small>
        <span class="buttons">
          <button class="action" data-testid="led-reload" disabled={busy || !changed} onclick={read}>discard</button>
          <button class="action primary" data-testid="led-save" disabled={busy || !changed} onclick={saveStrip}>save</button>
        </span>
      </div>
    </div>
  {:else}
    <p class="dim">Reading the lighting…</p>
  {/if}
{:else if calibration}
  <div data-testid="load-cells">
    <div class="row">
      <span>Calibration</span>
      <b data-testid="calibration-step">{STEP_TEXT[calibration.step]}{running ? ` (${calibration.secondsRemaining} s)` : ''}</b>
    </div>
    <div class="row">
      <span>Last latch</span>
      <b data-testid="calibration-result"
        >{RESULT_TEXT[calibration.status] ?? calibration.status}{#if calibration.detectedCell !== 'none'}, load cell {calibration.detectedCell.toUpperCase()}{/if}</b
      >
    </div>
    <div class="row">
      <div class="about">
        <span>1. Precision zero</span>
        <small>The platform stays empty.</small>
      </div>
      <button class="action" data-testid="calibration-zero" disabled={busy || running} onclick={() => sendCalibration('zero')}
        >find zero</button
      >
    </div>
    <div class="row">
      <div class="about">
        <span>2. Known mass on one load cell</span>
        <small>Take the platform off, put the mass on one load cell, once for each cell.</small>
      </div>
      <button class="value" disabled={busy || running} data-testid="calibration-grams" onclick={() => (typing = 'grams')}
        >{grams}<i>g</i></button
      >
      <button
        class="action"
        data-testid="calibration-latch"
        disabled={busy || running || !validGrams(grams)}
        onclick={() => sendCalibration({ latch: grams })}>latch</button
      >
    </div>
    <div class="row">
      <span>Stop the procedure</span>
      <button class="action" data-testid="calibration-abort" disabled={busy || !running} onclick={() => sendCalibration('abort')}
        >abort</button
      >
    </div>
  </div>
{:else}
  <p class="dim">Reading the calibration…</p>
{/if}
{#if failed}<p class="warn" data-testid="bengle-failed">{failed}</p>{/if}

{#if typing}
  <NumberPad
    label={typing === 'temperature' ? 'cup warmer target' : typing === 'lead' ? 'pre-warm lead' : 'known mass'}
    unit={typing === 'temperature' ? '°C' : typing === 'lead' ? 'min' : 'g'}
    min={typing === 'grams' ? 1 : 0}
    max={typing === 'temperature' ? CUP_WARMER_MAX : typing === 'lead' ? PREHEAT_LEAD_MAX : 10000}
    decimals={typing === 'grams'}
    current={typing === 'temperature' ? String(target) : typing === 'lead' ? String(preheat?.leadMinutes ?? 0) : String(grams)}
    onconfirm={confirmTyped}
    oncancel={() => (typing = null)}
  />
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-height: 3.2rem;
    padding: var(--space-1) 0;
    border-top: 1px solid var(--line);
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
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

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  i {
    margin-left: var(--space-1);
    font-style: normal;
    color: var(--dim);
  }

  .dim {
    color: var(--dim);
  }

  .warn {
    color: var(--temperature);
  }

  .buttons {
    display: flex;
    gap: var(--space-2);
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

  .action,
  .value {
    flex: none;
    min-height: 3rem;
    padding: 0 1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .primary {
    border-color: var(--fg);
  }

  input[type='color'] {
    width: 5rem;
    height: 3rem;
    padding: 0.2rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
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
    padding: var(--space-1);
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
