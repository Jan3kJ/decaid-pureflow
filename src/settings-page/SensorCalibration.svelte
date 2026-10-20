<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/settings.js (renderSensorCalSettings, sensorCalRow and the sensorCal handlers)
  and src/modules/sensor-cal.js.
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // Calibration > Sensor Calibration (research.md 20.3, 20.10 S2c): for temperature, pressure
  // and flow the stored calibration, the one before this page's last write, and the machine's
  // live reading. Capture takes the reading while the machine runs (the mean of 5 s), the
  // measured value is typed, the outcome is shown, and Apply writes the correction after a
  // confirm and reads the calibration back. Restore puts the previous one back exactly.
  import { onDestroy, onMount } from 'svelte';
  import type { SensorTarget } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import Confirm from './Confirm.svelte';
  import {
    SAMPLE_WINDOW_MS,
    SENSORS,
    absolute,
    average,
    blocked,
    calibrationText,
    loadPrevious,
    measuredOf,
    preview,
    reading,
    readingText,
    savePrevious,
    type Sample,
    type Sensor,
  } from './sensor-calibration';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  interface Entry {
    current: number | null;
    captured: number | null;
    measured: number | null;
    busy: boolean;
    error: string;
  }

  const blank = (): Entry => ({ current: null, captured: null, measured: null, busy: false, error: '' });
  let entries: Record<SensorTarget, Entry> = $state({ temperature: blank(), pressure: blank(), flow: blank() });
  let previous = $state(loadPrevious());
  let loading = $state(true);
  let loadError: string | null = $state(null);
  let typing: Sensor | null = $state(null);
  let confirming: { sensor: Sensor; from: number; to: number } | null = $state(null);
  const samples: Record<SensorTarget, Sample[]> = { temperature: [], pressure: [], flow: [] };

  const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

  async function readOne(sensor: Sensor) {
    entries[sensor.id].current = (await skin.client.getSensorCalibration(sensor.id)).measuredValue;
  }

  async function load() {
    loading = true;
    loadError = null;
    try {
      // One after the other: the machine answers one calibration request at a time.
      for (const sensor of SENSORS) await readOne(sensor);
    } catch (cause) {
      loadError = message(cause);
    } finally {
      loading = false;
    }
  }

  // The live readings, one a second, kept for the capture's window.
  let timer: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    void load();
    timer = setInterval(() => {
      const now = Date.now();
      for (const sensor of SENSORS) {
        const value = reading(sensor, skin.snapshot);
        if (value !== null) samples[sensor.id].push({ value, at: now });
        samples[sensor.id] = samples[sensor.id].filter((sample) => now - sample.at <= SAMPLE_WINDOW_MS);
      }
    }, 1000);
  });
  onDestroy(() => clearInterval(timer));

  function capture(sensor: Sensor) {
    const entry = entries[sensor.id];
    const value = average(samples[sensor.id], Date.now()) ?? reading(sensor, skin.snapshot);
    if (value === null) entry.error = 'No reading from the machine yet.';
    else {
      entry.captured = value;
      entry.error = '';
    }
  }

  /** What Apply would write, or why it cannot. */
  function plan(sensor: Sensor, entry: Entry): { from: number; to: number } | { why: string } | null {
    if (entry.current === null || entry.captured === null || entry.measured === null) return null;
    const why = blocked(sensor.kind, entry.captured, entry.measured);
    if (why) return { why };
    const to = preview(sensor.kind, entry.current, entry.captured, entry.measured);
    return to === null ? null : { from: entry.current, to };
  }

  async function apply(sensor: Sensor) {
    confirming = null;
    const entry = entries[sensor.id];
    if (entry.current === null || entry.captured === null || entry.measured === null) return;
    const before = entry.current;
    entry.busy = true;
    entry.error = '';
    try {
      await skin.client.correctSensorCalibration(sensor.id, entry.captured, entry.measured);
      // The 202 is the machine's acknowledgement, not the value: read it back.
      await readOne(sensor);
      previous = { ...previous, [sensor.id]: before };
      savePrevious(previous);
      // One observation, spent: a second Apply would correct a second time.
      entry.captured = null;
      entry.measured = null;
    } catch (cause) {
      entry.error = `Not written: ${message(cause)}`;
    } finally {
      entry.busy = false;
    }
  }

  async function restore(sensor: Sensor) {
    const entry = entries[sensor.id];
    const wanted = previous[sensor.id];
    if (wanted === undefined) return;
    entry.busy = true;
    entry.error = '';
    try {
      const current = (await skin.client.getSensorCalibration(sensor.id)).measuredValue;
      if (sensor.kind === 'ratio' && current === 0) throw new Error('the stored ratio is 0 and cannot be corrected from');
      const { reported, measured } = absolute(current, wanted);
      await skin.client.correctSensorCalibration(sensor.id, reported, measured);
      await readOne(sensor);
      const rest = { ...previous };
      delete rest[sensor.id];
      previous = rest;
      savePrevious(previous);
      entry.captured = null;
      entry.measured = null;
    } catch (cause) {
      entry.error = `Not restored: ${message(cause)}`;
    } finally {
      entry.busy = false;
    }
  }

  // Floats do not come back bit for bit: Restore is offered only for a real difference.
  const canRestore = (sensor: Sensor, entry: Entry) =>
    previous[sensor.id] !== undefined && entry.current !== null && Math.abs(entry.current - previous[sensor.id]!) > 1e-6;
</script>

<div data-testid="sensor-calibration">
  <p class="hint">
    A wrong calibration can make the machine unusable. Run the machine, capture its reading, type what your own instrument measured at
    the same time, and apply.
  </p>
  {#if loading}
    <p class="dim">Reading the calibration from the machine…</p>
  {:else if loadError}
    <p class="warn" data-testid="sensor-error">
      Not read: {loadError}
      <button class="action" onclick={load}>Read again</button>
    </p>
  {:else}
    {#each SENSORS as sensor (sensor.id)}
      {@const entry = entries[sensor.id]}
      {@const live = reading(sensor, skin.snapshot)}
      {@const planned = plan(sensor, entry)}
      <div class="sensor" data-testid="sensor-{sensor.id}">
        <div class="row">
          <strong>{sensor.label}</strong>
          <span class="cell">stored <b data-testid="sensor-stored-{sensor.id}">{calibrationText(sensor.kind, entry.current)}</b></span>
          <span class="cell"
            >previous <b data-testid="sensor-previous-{sensor.id}">{calibrationText(sensor.kind, previous[sensor.id] ?? null)}</b
            ></span
          >
          <button
            class="action"
            data-testid="sensor-restore-{sensor.id}"
            disabled={entry.busy || !canRestore(sensor, entry)}
            onclick={() => restore(sensor)}>Restore</button
          >
        </div>
        <div class="row">
          <span class="cell">machine reads <b data-testid="sensor-reading-{sensor.id}">{readingText(sensor, live)}</b></span>
          <button
            class="action"
            data-testid="sensor-capture-{sensor.id}"
            disabled={entry.busy || live === null}
            onclick={() => capture(sensor)}
            >{entry.captured === null ? 'Capture' : `Captured ${readingText(sensor, entry.captured)}`}</button
          >
          <button class="value" data-testid="sensor-measured-{sensor.id}" disabled={entry.busy} onclick={() => (typing = sensor)}
            ><small>measured</small> <b>{entry.measured === null ? '–' : entry.measured}</b><i>{sensor.unit}</i></button
          >
          <button
            class="action primary"
            data-testid="sensor-apply-{sensor.id}"
            disabled={entry.busy || !planned || 'why' in planned}
            onclick={() => planned && 'to' in planned && (confirming = { sensor, ...planned })}>Apply</button
          >
        </div>
        <p class="status" data-testid="sensor-status-{sensor.id}">
          {#if entry.error}<span class="warn">{entry.error}</span>
          {:else if entry.busy}Writing…
          {:else if planned && 'why' in planned}<span class="warn">{planned.why}</span>
          {:else if planned}{calibrationText(sensor.kind, planned.from)} → {calibrationText(sensor.kind, planned.to)}
          {:else if entry.captured !== null}Captured; now type what your instrument measured.
          {:else if live === null}Waiting for a reading from the machine…{/if}
        </p>
      </div>
    {/each}
  {/if}
</div>

{#if typing}
  {@const sensor = typing}
  <NumberPad
    label="{sensor.label} measured"
    unit={sensor.unit}
    min={0}
    max={200}
    decimals={true}
    places={2}
    current={entries[sensor.id].measured === null ? '' : String(entries[sensor.id].measured)}
    onconfirm={(typed: number) => {
      // `sensor` follows `typing`: set the value before it is cleared
      entries[sensor.id].measured = measuredOf(typed);
      entries[sensor.id].error = '';
      typing = null;
    }}
    oncancel={() => (typing = null)}
  />
{/if}

{#if confirming}
  {@const { sensor, from, to } = confirming}
  <Confirm
    title="Correct the {sensor.label.toLowerCase()} calibration?"
    text="{calibrationText(sensor.kind, from)} becomes {calibrationText(
      sensor.kind,
      to,
    )}. A wrong calibration can make the machine unusable; Restore puts the one before back."
    ok="Apply"
    onok={() => void apply(sensor)}
    oncancel={() => (confirming = null)}
  />
{/if}

<style>
  .hint {
    margin: 0 0 0.2rem;
    color: var(--dim);
    font-size: 0.9rem;
  }

  .sensor {
    border-top: 1px solid var(--line);
    padding: 0.3rem 0;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 3.4rem;
    padding: 0.2rem 0;
  }

  strong {
    min-width: 8rem;
    font-size: 1.15rem;
    font-weight: 600;
  }

  .cell {
    flex: 1;
    min-width: 0;
    color: var(--dim);
  }

  .cell b {
    margin-left: 0.3rem;
    color: var(--fg);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .status {
    min-height: 1.3rem;
    margin: 0;
    color: var(--dim);
    font-size: 0.9rem;
  }

  .dim {
    color: var(--dim);
  }

  .warn {
    color: var(--temperature);
  }

  button {
    font: inherit;
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

  .primary {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }

  .value {
    flex: none;
    min-width: 9rem;
    min-height: 3rem;
    padding: 0 0.8rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .value small {
    color: var(--dim);
    font-size: 0.8rem;
  }

  .value b {
    font-size: 1.2rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  i {
    margin-left: 0.25em;
    font-style: normal;
    font-size: 0.75em;
    color: var(--dim);
  }
</style>
