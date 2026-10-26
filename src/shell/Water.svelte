<script lang="ts">
  // Hot water and flush, over the main frame of every screen (spec 3.6, 3.7, 3.14; drawn by
  // App.svelte): the countdown ring around the stop button, and inside the button what runs:
  // temperature, flow, time and, for hot water with a scale, the weight; for hot water with a stop, its
  // target under them. The numbers come from water.ts.
  import type { Skin } from './skin.svelte';
  import { ringOf, WATER_LABEL, waterDuration, waterSeconds, waterValues, type WaterRun } from './water';

  interface Props {
    skin: Skin;
    run: WaterRun;
  }

  let { skin, run }: Props = $props();

  const ring = $derived(ringOf(waterSeconds(run), waterDuration(run.kind, skin.workflow)));
  const values = $derived(waterValues(run, ring, skin.weight, skin.workflow?.hotWaterData?.volume, skin.scaleLink === 'connected'));
</script>

<section class="water" data-testid="water-view" data-kind={run.kind}>
  <div class="ring" data-testid="water-ring" data-share={ring.share.toFixed(3)}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="track" cx="50" cy="50" r="46" />
      <circle class="done" cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="{ring.share * 100} 100" />
    </svg>
    <!-- Nothing is started here: the DE1 is started at the machine. What runs can be stopped. -->
    <button class="stop" data-testid="water-stop" onclick={() => skin.stop()}>
      <span class="kind" data-testid="water-label">{WATER_LABEL[run.kind]}</span>
      <span class="time" data-testid="water-time">{values.time}</span>
      <span class="values">
        <span class="temperature" data-testid="water-temperature">{values.temperature}</span>
        <span class="flow" data-testid="water-flow">{values.flow}</span>
        {#if values.weight !== null}
          <span class="weight" data-testid="water-weight">{values.weight}</span>
        {/if}
      </span>
      {#if values.target !== null}
        <span class="target" class:weighed={skin.scaleLink === 'connected'} data-testid="water-target">{values.target}</span>
      {/if}
      <strong>stop</strong>
    </button>
  </div>
</section>

<style>
  .water {
    height: 100%;
    box-sizing: border-box;
    container-type: size;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem 2rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  /* 85 % of the frame's shorter side, centred, with stop and its values scaled with it (spec 3.9, 3.14). */
  .ring {
    position: relative;
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    container-type: size;
    flex: none;
    display: grid;
    place-items: center;
    transform: scale(0.85);
  }

  .ring svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
    /* a tap on the ring is a tap on stop */
    pointer-events: none;
    fill: none;
    stroke-width: 5;
  }

  .track {
    stroke: var(--line);
  }

  .done {
    stroke: var(--fg);
    transition: stroke-dasharray 0.5s linear;
  }

  /* Dark inside, so that the values keep their colours; stop itself is the temperature red. */
  .stop {
    width: 82%;
    aspect-ratio: 1;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: min(0.7rem, 1.4cqw);
    font: inherit;
    color: var(--fg);
    background: var(--raised);
    border: 0.35rem solid var(--temperature);
    touch-action: manipulation;
    user-select: none;
    font-variant-numeric: tabular-nums;
  }

  /*
   * The ring's figures: the role tokens of home's ring (about 550 CSS px across), smaller in a
   * smaller frame (scripts/font-sizes.mjs lets `.kind`, `.time`, `.values`, `.target` and
   * `.stop strong` through).
   */
  .kind {
    font-size: min(var(--text-title), 5cqw);
  }

  .time {
    font-size: min(var(--text-big), 10.5cqw);
    font-weight: 600;
  }

  .values {
    display: flex;
    gap: min(1.6rem, 3cqw);
    font-size: min(var(--text-large), 6.2cqw);
  }

  /* The value role, scaled as the others; yellow with a scale, as the weight it is read with. */
  .target {
    font-size: min(var(--text-value), 3.7cqw);
  }

  .target.weighed {
    color: var(--weight);
  }

  .flow {
    color: var(--flow);
  }

  .weight {
    color: var(--weight);
  }

  .temperature {
    color: var(--temperature);
  }

  .stop strong {
    font-size: min(var(--text-large), 6.2cqw);
    font-weight: 600;
    color: var(--temperature);
  }
</style>
