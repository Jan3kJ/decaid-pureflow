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
  import Lever from '../ui/Lever.svelte';
  import SettingsRow from './SettingsRow.svelte';
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
      <SettingsRow label="mat temperature" spacing="tight">
        <b data-testid="cup-warmer-current">{matReading(warmer.currentTemperature)}</b>
      </SettingsRow>
      <SettingsRow label="cup warmer" spacing="tight">
        <Lever
          checked={heating}
          label="Cup warmer"
          disabled={busy}
          testid="cup-warmer-switch"
          onchange={(on: boolean) => setMat(on ? { temperature: target } : { enabled: false })}
        />
      </SettingsRow>
      <SettingsRow label="target" spacing="tight">
        <button class="action" disabled={busy} data-testid="cup-warmer-target" onclick={() => (typing = 'temperature')}
          >{target}<i>°C</i></button
        >
      </SettingsRow>
      {#if preheat}
        <SettingsRow
          label="pre-warm before a wake schedule"
          hint="the firmware starts the mat before a scheduled wake and holds it until the window closes."
          spacing="tight"
        >
          {#snippet about()}
            {#if preheat?.active}<small data-testid="cup-warmer-preheat-active">the wake schedule heats the mat now.</small>{/if}
          {/snippet}
          <Lever
            checked={preheat.enabled}
            label="Pre-warm"
            disabled={busy}
            testid="cup-warmer-preheat"
            onchange={(on: boolean) => setPreheat({ enabled: on })}
          />
        </SettingsRow>
        <SettingsRow label="pre-warm lead" spacing="tight">
          <button class="action" disabled={busy} data-testid="cup-warmer-lead" onclick={() => (typing = 'lead')}
            >{preheat.leadMinutes}<i>min</i></button
          >
        </SettingsRow>
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
          <SettingsRow label="{zone.label}, {moment.label}" spacing="tight">
            <input
              type="color"
              aria-label="{zone.label}, {moment.label}"
              data-testid="led-{zone.id}-{moment.id}"
              value={toInputColour(draft[zone.id][moment.id])}
              disabled={busy}
              onchange={(event) => (draft![zone.id][moment.id] = fromInputColour(event.currentTarget.value))}
            />
          </SettingsRow>
        {/each}
      {/each}
      <SettingsRow hint="the strips take the colours at once and the machine keeps them." spacing="tight">
        <span class="buttons">
          <button class="action" data-testid="led-reload" disabled={busy || !changed} onclick={read}>discard</button>
          <button class="action primary" data-testid="led-save" disabled={busy || !changed} onclick={saveStrip}>save</button>
        </span>
      </SettingsRow>
    </div>
  {:else}
    <p class="dim">Reading the lighting…</p>
  {/if}
{:else if calibration}
  <div data-testid="load-cells">
    <SettingsRow label="calibration" spacing="tight">
      <b data-testid="calibration-step">{STEP_TEXT[calibration.step]}{running ? ` (${calibration.secondsRemaining} s)` : ''}</b>
    </SettingsRow>
    <SettingsRow label="last latch" spacing="tight">
      <b data-testid="calibration-result"
        >{RESULT_TEXT[calibration.status] ?? calibration.status}{#if calibration.detectedCell !== 'none'}, load cell {calibration.detectedCell.toUpperCase()}{/if}</b
      >
    </SettingsRow>
    <SettingsRow label="1. precision zero" hint="the platform stays empty." spacing="tight">
      <button class="action" data-testid="calibration-zero" disabled={busy || running} onclick={() => sendCalibration('zero')}
        >find zero</button
      >
    </SettingsRow>
    <SettingsRow
      label="2. known mass on one load cell"
      hint="take the platform off, put the mass on one load cell, once for each cell."
      spacing="tight"
    >
      <span class="pair">
        <button class="action" disabled={busy || running} data-testid="calibration-grams" onclick={() => (typing = 'grams')}
          >{grams}<i>g</i></button
        >
        <button
          class="action"
          data-testid="calibration-latch"
          disabled={busy || running || !validGrams(grams)}
          onclick={() => sendCalibration({ latch: grams })}>latch</button
        >
      </span>
    </SettingsRow>
    <SettingsRow label="stop the procedure" spacing="tight">
      <button class="action" data-testid="calibration-abort" disabled={busy || !running} onclick={() => sendCalibration('abort')}
        >abort</button
      >
    </SettingsRow>
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

  /* The known mass beside its latch, both at the row's right end. */
  .pair {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  button {
    font-weight: 400;
  }

  button:disabled {
    opacity: 0.5;
  }

  /* The row's main action: the white outline, not the main button's fill; off, it is the shared off look. */
  .action.primary {
    color: var(--fg);
    background: var(--raised);
    font-weight: 400;
  }

  input[type='color'] {
    width: 5rem;
    height: var(--control);
    padding: 0.2rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
</style>
