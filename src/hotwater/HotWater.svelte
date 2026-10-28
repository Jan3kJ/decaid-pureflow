<script lang="ts">
  import { onMount } from 'svelte';
  import { gramsOf } from '../display';
  import NumberPad from '../editor/NumberPad.svelte';
  import PageHeader from '../shell/PageHeader.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import { shownRun } from '../shell/water';
  import {
    fieldStep,
    heldValue,
    hotWaterFields,
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
  /** stop at weight in g with a connected scale, stop at volume in ml without one (spec 3.12) */
  const fields = $derived(hotWaterFields(skin.scaleLink));
  const stopField = $derived(fields.find((field) => field.key === 'volume')!);
  /** Hot water or flush: the shell's ring covers the rows, with stop in it (spec 3.14). */
  const water = $derived(shownRun(skin.waterRun, skin.canStop));
  const pouring = $derived(skin.waterRun !== null && !skin.waterRun.ended);

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

  <!-- A row per value with a slider under it (spec 3.9); a tap on the value opens the number pad.
       The page's main frame, which hot water and flush cover (App.svelte). -->
  <div class="values" data-main-frame>
    {#each fields as field (field.id)}
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

  <aside>
    <!-- label, number, unit as on the steam page: 'last shot' and 'scale' share the number column (spec 3.18 item 4) -->
    <div class="line">
      <span class="key">last shot</span>
      <span class="reading" data-testid="hot-water-last-shot">
        {#if lastShot === null}<b>–</b> <i></i>{:else}<b>{gramsOf(lastShot, '')}</b> <i>g</i>{/if}
      </span>
    </div>

    <!-- The ratio favourites of the settings: the last shot times the ratio is the stop; only with a weighed last shot. -->
    {#if lastShot !== null}
      {@const shot = lastShot}
      <div class="ratios">
        {#each skin.settings.hotWater.ratios as ratio, i (i)}
          {@const amount = ratioWeight(shot, ratio)}
          <button
            class="chip select-fill"
            aria-pressed={amount === values?.volume}
            data-testid="hot-water-ratio"
            disabled={!values}
            onclick={() => skin.setHotWater(stopField, amount)}
          >
            {ratioLabel(ratio)}
            <small>{amount} {stopField.unit}</small>
          </button>
        {/each}
      </div>
    {/if}

    <!-- The scale's row is the one tare of the skin (Skin.tare, spec 3.7), live for an empty cup and
         off while water runs; without a scale it looks for the scale (spec 3.9). -->
    <button class="line" data-testid="hot-water-tare" disabled={pouring} onclick={() => skin.tare()}>
      <span class="key">scale</span>
      <span class="reading" data-testid="hot-water-scale">
        {#if skin.weight === null}<b>–</b> <i></i>{:else}<b>{gramsOf(skin.weight, '')}</b> <i>g</i>{/if}
      </span>
    </button>

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

    <!-- The ring holds stop while hot water or flush runs; this one stops anything else that runs. -->
    {#if skin.canStop && !water}
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

  .values {
    grid-area: values;
    min-height: 0;
    display: flex;
    flex-direction: column;
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
    font-size: var(--text-body);
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

  /* label, number, unit: the unit column has one width, so the numbers end on one edge */
  .line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 1.6rem;
    align-items: baseline;
    column-gap: 0.4rem;
    padding: 0 0.6rem 0 1rem;
    border: 1px solid transparent;
    text-align: left;
  }

  /* the tare: the whole row a button, a finger's target */
  button.line {
    min-height: 3.5rem;
    align-content: center;
    border-color: var(--line);
  }

  .key {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .reading {
    display: contents;
  }

  .reading b {
    justify-self: end;
    font-size: var(--text-title);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--weight);
  }

  button.line:disabled .reading b {
    color: var(--dim);
  }

  .reading i {
    font-size: var(--text-label);
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
