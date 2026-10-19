<script lang="ts">
  import { onMount } from 'svelte';
  import NumberPad from '../editor/NumberPad.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import StateLine from '../shell/StateLine.svelte';
  import {
    HOT_WATER_FIELDS,
    WEIGHT_FIELD,
    heldValue,
    lastShotGrams,
    ratioLabel,
    ratioWeight,
    type HotWaterField,
  } from './hot-water';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // The values are the workflow's: what Decaid sends to the machine when hot water starts.
  const values = $derived(skin.workflow?.hotWaterData ?? null);
  const shown = (field: HotWaterField) => (values ? `${+values[field.key].toFixed(field.decimals ? 1 : 0)}` : '–');

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
      unread = `The last shot could not be read: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
  });
</script>

<div class="hot-water">
  <header>
    <strong>Hot water</strong>
    <StateLine {skin} />
  </header>

  <div class="values">
    {#each HOT_WATER_FIELDS as field (field.id)}
      <button
        class="value {field.id}"
        data-testid="hot-water-{field.id}"
        disabled={!values}
        onclick={() => (typing = field)}
      >
        <small>{field.label}</small>
        <b>{shown(field)}<i>{field.unit}</i></b>
      </button>
    {/each}
  </div>

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
      <button
        class="tare"
        data-testid="hot-water-tare"
        onclick={() => skin.tare()}>tare</button
      >
    </div>

    <p class="hint" data-testid="hot-water-hint">
      Start hot water at the machine. With a scale Decaid tares it and stops at the weight; without one the
      machine stops at as many ml, or at the time.
    </p>

    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {:else if skin.info}
      <p class="notice info" data-testid="tare-notice">{skin.info}</p>
    {:else if unread}
      <p class="notice" data-testid="hot-water-unread">{unread}</p>
    {/if}

    {#if skin.canStop}
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
    padding: 1rem 1.2rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 21rem;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'header header' 'values side';
    gap: 0.8rem 1.2rem;
  }

  header {
    grid-area: header;
    display: flex;
    align-items: center;
    gap: 1.6rem;
    min-height: 2rem;
  }

  header > strong {
    font-size: var(--text-title);
    font-weight: 600;
  }

  header > :global(.state) {
    flex: 1;
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
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }

  .value {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .value small {
    font-size: var(--text-body);
  }

  .value b {
    font-size: var(--text-big);
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  /* The skin's colours: temperature red, flow blue, weight yellow. */
  .temperature b {
    color: var(--temperature);
  }

  .flow b {
    color: var(--flow);
  }

  .value.weight b {
    color: var(--weight);
  }

  i {
    margin-left: 0.2em;
    font-style: normal;
    font-size: 0.4em;
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
