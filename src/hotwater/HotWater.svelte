<script lang="ts">
  import { onMount } from 'svelte';
  import NumberPad from '../editor/NumberPad.svelte';
  import PageHeader from '../shell/PageHeader.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import Water from '../shell/Water.svelte';
  import { shownRun } from '../shell/water';
  import {
    HOT_WATER_FIELDS,
    WEIGHT_FIELD,
    fieldStep,
    heldValue,
    lastShotGrams,
    ratioLabel,
    ratioWeight,
    shownValue,
    type HotWaterField,
  } from './hot-water';
  import { errorMessage } from '../error-message';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // The values are the workflow's: what Decaid sends to the machine when hot water starts.
  const values = $derived(skin.workflow?.hotWaterData ?? null);
  /** While hot water pours the page shows the ring in place of the rows (spec 3.9). */
  const pouring = $derived(shownRun(skin.waterRun, skin.canStop, 'hotWater'));

  /** The value a slider is dragged to: shown while it moves, written once when it is let go. */
  let dragged: { id: string; value: number } | null = $state.raw(null);
  const valueOf = (field: HotWaterField) => (dragged?.id === field.id ? dragged.value : (values?.[field.key] ?? null));
  const shown = (field: HotWaterField) => shownValue(field, valueOf(field));

  function drag(field: HotWaterField, event: Event) {
    dragged = { id: field.id, value: heldValue(field, Number((event.currentTarget as HTMLInputElement).value)) };
  }

  async function release(field: HotWaterField, event: Event) {
    const value = heldValue(field, Number((event.currentTarget as HTMLInputElement).value));
    dragged = { id: field.id, value };
    // The dragged value stays shown until Decaid answers, so the row does not jump back.
    await skin.setHotWater(field, value);
    if (dragged?.id === field.id) dragged = null;
  }

  /** the value the number pad is open for */
  let typing: HotWaterField | null = $state.raw(null);

  function confirm(value: number) {
    if (typing) void skin.setHotWater(typing, heldValue(typing, value));
    typing = null;
  }

  // The last measured espresso shot (spec 3.7): read when the page opens.
  let lastShot: number | null = $state(null);
  let unread: string | null = $state(null);

  onMount(async () => {
    try {
      lastShot = await lastShotGrams(skin.client);
    } catch (cause) {
      unread = `The last shot could not be read: ${errorMessage(cause)}`;
    }
  });
</script>

<div class="hot-water">
  <div class="header">
    <PageHeader {skin} heat="group" title="Hot water" />
  </div>

  {#if pouring}
    <div class="pouring">
      <Water {skin} run={pouring} />
    </div>
  {:else}
    <!-- A row per value with a slider under it (spec 3.9); a tap on the value opens the number pad. -->
    <div class="values">
      {#each HOT_WATER_FIELDS as field (field.id)}
        <div class="row {field.id}">
          <span class="label">{field.label}</span>
          <button class="value" data-testid="hot-water-{field.id}" disabled={!values} onclick={() => (typing = field)}>
            <b>{shown(field)}<i>{field.unit}</i></b>
          </button>
          <input
            type="range"
            aria-label={field.label}
            data-testid="hot-water-slider-{field.id}"
            min={field.min}
            max={field.max}
            step={fieldStep(field)}
            value={valueOf(field) ?? field.min}
            disabled={!values}
            oninput={(event) => drag(field, event)}
            onchange={(event) => release(field, event)}
          />
        </div>
      {/each}
    </div>
  {/if}

  <aside>
    <div class="shot">
      <small>last shot</small>
      <b data-testid="hot-water-last-shot">{lastShot === null ? '–' : `${lastShot.toFixed(1)} g`}</b>
    </div>

    <!-- The ratio favourites of the settings: the last shot times the ratio is the stop at weight. -->
    <div class="ratios">
      {#each skin.settings.hotWater.ratios as ratio, i (i)}
        {@const grams = lastShot === null ? null : ratioWeight(lastShot, ratio)}
        <button
          class="chip"
          class:on={grams !== null && grams === values?.volume}
          data-testid="hot-water-ratio"
          disabled={grams === null || !values}
          onclick={() => grams !== null && skin.setHotWater(WEIGHT_FIELD, grams)}
        >
          {ratioLabel(ratio)}
          <small>{grams === null ? '–' : `${grams} g`}</small>
        </button>
      {/each}
    </div>

    <div class="scale">
      <small>scale</small>
      <span data-testid="hot-water-scale">{skin.weight === null ? '–' : `${skin.weight.toFixed(1)} g`}</span>
      <!-- The one tare of the skin (Skin.tare, spec 3.7); without a scale it looks for the scale (spec 3.9). -->
      <button class="tare" data-testid="hot-water-tare" onclick={() => skin.tare()}>tare</button>
    </div>

    <p class="hint" data-testid="hot-water-hint">
      Start hot water at the machine. With a scale Decaid tares it and stops at the weight; without one the machine stops at as many
      ml, or at the time.
    </p>

    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {:else if skin.info}
      <p class="notice info" data-testid="tare-notice">{skin.info}</p>
    {:else if unread}
      <p class="notice" data-testid="hot-water-unread">{unread}</p>
    {/if}

    <!-- The ring holds stop while hot water pours; this one stops anything else that runs. -->
    {#if skin.canStop && !pouring}
      <button class="stop" data-testid="hot-water-stop" onclick={() => skin.stop()}>stop</button>
    {/if}
  </aside>
</div>

{#if typing}
  <NumberPad
    label={typing.label}
    unit={typing.unit}
    min={typing.min}
    max={typing.max}
    decimals={typing.decimals}
    current={shown(typing)}
    onconfirm={confirm}
    oncancel={() => (typing = null)}
  />
{/if}

<style>
  .hot-water {
    height: 100%;
    box-sizing: border-box;
    /* home's padding, so the header is in the same place (spec 3.11) */
    padding: 0.8rem 1.2rem 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 21rem;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'header header' 'values side';
    gap: 0.8rem 1.2rem;
  }

  .header {
    grid-area: header;
    min-width: 0;
  }

  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  button:disabled {
    color: var(--dim);
  }

  .values,
  .pouring {
    grid-area: values;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .values {
    gap: 0.6rem;
  }

  .row {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    align-content: center;
    column-gap: 1rem;
    padding: 0.4rem 1.4rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  .label {
    align-self: center;
    color: var(--dim);
    font-size: var(--text-value);
  }

  .value {
    min-width: 9rem;
    min-height: 3.5rem;
    padding: 0 0.8rem;
    border-color: transparent;
    background: none;
    text-align: right;
  }

  .value b {
    font-size: var(--text-large);
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  /* The slider: the whole row wide, its thumb a finger's target, in the value's colour. */
  input[type='range'] {
    --tint: var(--fg);
    grid-column: 1 / -1;
    width: 100%;
    height: 3rem;
    margin: 0;
    background: none;
    appearance: none;
    touch-action: none;
    cursor: pointer;
  }

  input[type='range']:disabled {
    --tint: var(--dim);
  }

  input[type='range']::-webkit-slider-runnable-track {
    height: 0.5rem;
    border-radius: 0.25rem;
    background: var(--line);
  }

  input[type='range']::-moz-range-track {
    height: 0.5rem;
    border-radius: 0.25rem;
    background: var(--line);
  }

  input[type='range']::-webkit-slider-thumb {
    appearance: none;
    width: 2.4rem;
    height: 2.4rem;
    margin-top: -0.95rem;
    border: 0;
    border-radius: 50%;
    background: var(--tint);
  }

  input[type='range']::-moz-range-thumb {
    width: 2.4rem;
    height: 2.4rem;
    border: 0;
    border-radius: 50%;
    background: var(--tint);
  }

  /* The skin's colours: temperature red, flow blue, weight yellow. */
  .temperature b {
    color: var(--temperature);
  }

  .temperature input {
    --tint: var(--temperature);
  }

  .flow b {
    color: var(--flow);
  }

  .flow input {
    --tint: var(--flow);
  }

  .weight b {
    color: var(--weight);
  }

  .weight input {
    --tint: var(--weight);
  }

  i {
    margin-left: 0.2em;
    font-style: normal;
    font-size: 0.5em;
    font-weight: 400;
    color: var(--dim);
  }

  aside {
    grid-area: side;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .shot,
  .scale {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .shot b,
  .scale span {
    font-size: var(--text-title);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--weight);
  }

  .scale span {
    margin-left: auto;
  }

  .ratios {
    display: flex;
    gap: 0.6rem;
  }

  .chip {
    flex: 1;
    min-height: 4.4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    font-size: var(--text-value);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .chip small {
    font-weight: 400;
    color: var(--weight);
  }

  .chip:disabled small {
    color: var(--dim);
  }

  .chip.on {
    border-color: var(--fg);
    background: var(--raised);
  }

  .tare {
    align-self: center;
    min-height: 2.6rem;
    padding: 0 1rem;
    font-size: var(--text-body);
    font-weight: 600;
  }

  .hint {
    margin: 0;
    color: var(--dim);
    font-size: var(--text-label);
  }

  .notice {
    margin: 0;
    color: var(--warn);
    font-size: var(--text-label);
  }

  .info {
    color: var(--fg);
  }

  .stop {
    margin-top: auto;
    min-height: 6rem;
    font-size: var(--text-large);
    font-weight: 600;
    color: var(--bg);
    background: var(--temperature);
    border-color: var(--temperature);
  }
</style>
