<script lang="ts">
  // Hot water and flush on home, and hot water on its page (spec 3.6, 3.7, 3.9): the countdown ring around the stop button, and
  // inside the button what runs: temperature, flow, time and, for hot water with a scale, the
  // weight. The numbers come from water.ts.
  import type { Skin } from './skin.svelte';
  import { ringOf, WATER_LABEL, waterDuration, waterSeconds, waterValues, type WaterRun } from './water';

  interface Props {
    skin: Skin;
    run: WaterRun;
  }

  let { skin, run }: Props = $props();

  const ring = $derived(ringOf(waterSeconds(run), waterDuration(run.kind, skin.workflow)));
  const values = $derived(waterValues(run, ring, skin.weight));
</script>

<section class="water" data-testid="water-view" data-kind={run.kind}>
  <div class="ring" data-testid="water-ring" data-share={ring.share.toFixed(3)}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="track" cx="50" cy="50" r="46" />
      <circle class="done" cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="{ring.share * 100} 100" />
    </svg>
    <!-- Nothing is started here: the DE1 is started at the machine. What runs can be stopped. -->
    <button class="stop" data-testid="stop" onclick={() => skin.stop()}>
      <span class="kind" data-testid="water-label">{WATER_LABEL[run.kind]}</span>
      <span class="time" data-testid="water-time">{values.time}</span>
      <span class="values">
        <span class="temperature" data-testid="water-temperature">{values.temperature}</span>
        <span class="flow" data-testid="water-flow">{values.flow}</span>
        {#if values.weight !== null}
          <span class="weight" data-testid="water-weight">{values.weight}</span>
        {/if}
      </span>
      <strong>stop</strong>
    </button>
  </div>
</section>

<style>
  .water {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
    justify-content: center;
    padding: 1rem 2rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  /* 85 % of the panel's height, centred, with stop and its values scaled with it (spec 3.9). */
  .ring {
    position: relative;
    height: 100%;
    aspect-ratio: 1;
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
    gap: 0.7rem;
    font: inherit;
    color: var(--fg);
    background: var(--raised);
    border: 0.35rem solid var(--temperature);
    touch-action: manipulation;
    user-select: none;
    font-variant-numeric: tabular-nums;
  }

  .kind {
    font-size: var(--text-title);
  }

  .time {
    font-size: var(--text-big);
    font-weight: 600;
  }

  .values {
    display: flex;
    gap: 1.6rem;
    font-size: var(--text-large);
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
    font-size: var(--text-large);
    font-weight: 600;
    color: var(--temperature);
  }
</style>
