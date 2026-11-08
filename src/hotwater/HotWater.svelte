<script lang="ts">
  import { onMount } from 'svelte';
  import { gramsOf } from '../display';
  import NumberPad from '../editor/NumberPad.svelte';
  import PageHeader from '../shell/PageHeader.svelte';
  import SidePage from '../ui/SidePage.svelte';
  import LineSlider from '../ui/LineSlider.svelte';
  import ValueLine from '../ui/ValueLine.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import { shotWeightText } from '../shell/shot';
  import { ringRun, shownRun, waterSeconds } from '../shell/water';
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
  /** stop at weight in g with a connected scale, stop at volume in ml without one */
  const fields = $derived(hotWaterFields(skin.scaleLink));
  const stopField = $derived(fields.find((field) => field.key === 'volume')!);
  /** A flush, or hot water seen from another page: the shell's ring covers the rows, with stop in it. */
  const water = $derived(ringRun(shownRun(skin.waterRun, skin.canStop), 'hot-water'));
  /** Hot water runs: the time and weight lines fill with the live values. */
  const pouring = $derived(skin.waterRun?.kind === 'hotWater' && !skin.waterRun.ended && skin.canStop ? skin.waterRun : null);
  const weighed = $derived(skin.scaleLink === 'connected');

  /** The live value of a line while hot water runs: the seconds, and the grams on the scale or the ml so far without one. */
  function liveOf(field: HotWaterField): { value: number; text: string } | null {
    if (!pouring) return null;
    if (field.id === 'time') {
      const seconds = waterSeconds(pouring);
      return { value: seconds, text: `${Math.floor(seconds)} s` };
    }
    if (field.id !== 'weight') return null;
    if (weighed && skin.weight !== null) return { value: Math.max(0, skin.weight), text: gramsOf(Math.max(0, skin.weight)) };
    return weighed ? null : { value: pouring.volume, text: `${Math.round(pouring.volume)} ml` };
  }

  /** The value a slider is dragged to: shown while it moves, written once when it is let go. */
  let dragged: { id: string; value: number } | null = $state.raw(null);
  const valueOf = (field: HotWaterField) => (dragged?.id === field.id ? dragged.value : (values?.[field.key] ?? null));
  const shown = (field: HotWaterField) => shownValue(field, valueOf(field));

  /** the line that is lit: a tap lights one, a tap elsewhere puts it out */
  let lit: string | null = $state(null);
  let frame: HTMLElement | undefined = $state();

  function elsewhere(event: PointerEvent) {
    if (!frame?.contains(event.target as Node)) lit = null;
  }

  async function release(field: HotWaterField, value: number) {
    const held = heldValue(field, value);
    dragged = { id: field.id, value: held };
    // The dragged value stays shown until Decaid answers, so the line does not jump back.
    await skin.setHotWater(field, held);
    if (dragged?.id === field.id) dragged = null;
  }

  /** the value the number pad is open for */
  let typing: HotWaterField | null = $state.raw(null);

  function confirm(value: number) {
    if (typing) void skin.setHotWater(typing, heldValue(typing, value));
    typing = null;
  }

  // The last measured espresso shot: read when the page opens.
  let lastShot: number | null = $state(null);
  let unread: string | null = $state(null);

  onMount(async () => {
    try {
      lastShot = await lastShotGrams(skin.shot, skin.shots);
    } catch (cause) {
      unread = `The last shot could not be read: ${errorMessage(cause)}`;
    }
  });
</script>

<svelte:window onpointerdown={elsewhere} />

<!-- A flush's ring holds its stop; this one stops hot water and anything else that runs. -->
<SidePage onstop={skin.canStop && !water ? () => skin.stop() : undefined} stopTestid="hot-water-stop">
  {#snippet header()}
    <PageHeader {skin} heat="group" title="Hot water" />
  {/snippet}

  <!-- A line per value; a second tap on the lit number opens the number pad.
       The page's main frame, which a flush covers (App.svelte). -->
  {#snippet main()}
    <div class="values" data-main-frame bind:this={frame}>
      {#each fields as field (field.id)}
        <LineSlider
          label={field.label}
          unit={field.unit}
          min={field.min}
          max={field.max}
          step={fieldStep(field)}
          value={valueOf(field)}
          shown={shown(field)}
          tone={field.id as 'flow' | 'temperature' | 'time' | 'weight'}
          lit={lit === field.id}
          disabled={!values || pouring !== null}
          live={liveOf(field)}
          testid="hot-water-slider-{field.id}"
          numberTestid="hot-water-{field.id}"
          onlight={() => (lit = field.id)}
          onmove={(value: number) => (dragged = { id: field.id, value })}
          onrelease={(value: number) => release(field, value)}
          onpad={() => (typing = field)}
        />
      {/each}
    </div>
  {/snippet}

  <!-- label, number, unit as on the steam page: 'last shot' and 'scale' share the number column -->
  <ValueLine
    label="last shot"
    value={shotWeightText(lastShot)}
    unit={lastShot === null ? '' : 'g'}
    tone="weight"
    testid="hot-water-last-shot"
  />

  <!-- The ratio favourites of the settings: the last shot times the ratio is the stop; without a weighed last shot they are off, as the profile picker is while a shot pours. -->
  <div class="ratios">
    {#each skin.settings.hotWater.ratios as ratio, i (i)}
      {@const amount = lastShot === null ? null : ratioWeight(lastShot, ratio)}
      <button
        class="chip select-outline"
        aria-pressed={amount !== null && amount === values?.volume}
        data-testid="hot-water-ratio"
        disabled={!values || amount === null}
        onclick={() => amount !== null && skin.setHotWater(stopField, amount)}
      >
        {ratioLabel(ratio)}
        <small>{amount === null ? '–' : `${amount} ${stopField.unit}`}</small>
      </button>
    {/each}
  </div>

  <!-- The scale's row is the one tare of the skin (Skin.tare), live for an empty cup and
         off while water runs; without a scale it looks for the scale. -->
  <ValueLine
    label="scale"
    value={skin.weight === null ? null : gramsOf(skin.weight, '')}
    tone="weight"
    testid="hot-water-scale"
    buttonTestid="hot-water-tare"
    disabled={pouring !== null}
    thin
    onclick={() => skin.tare()}
  />

  {#if skin.notice}
    <p class="notice" data-testid="notice">{skin.notice}</p>
  {:else if skin.info}
    <p class="notice info" data-testid="tare-notice">{skin.info}</p>
  {:else if unread}
    <p class="notice" data-testid="hot-water-unread">{unread}</p>
  {/if}
</SidePage>

{#if typing}
  <NumberPad
    label={typing.label}
    unit={typing.unit}
    min={typing.min}
    max={typing.max}
    decimals={typing.decimals}
    current={shown(typing)}
    tone={typing.id as 'flow' | 'temperature' | 'time' | 'weight'}
    onconfirm={confirm}
    oncancel={() => (typing = null)}
  />
{/if}

<style>
  button {
    border: 1px solid var(--edge);
    background: none;
    border-radius: var(--radius);
  }

  button:disabled {
    color: var(--dim);
  }

  .values {
    min-height: 0;
    display: flex;
    flex-direction: column;
    /* the frame of home's graph (.plot in ShotView.svelte); the padding keeps the lines clear of the rounded corners */
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    padding: var(--space-3) var(--space-4);
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .ratios {
    display: flex;
    gap: var(--space-2);
  }

  .chip {
    --glow-rgb: var(--weight-rgb);
    flex: 1;
    min-height: 4.4rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    font-size: var(--text-value);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .chip small {
    font-weight: 400;
    color: var(--weight);
  }

  .chip:disabled {
    opacity: 0.4;
  }

  .chip:disabled small {
    color: var(--dim);
  }
</style>
