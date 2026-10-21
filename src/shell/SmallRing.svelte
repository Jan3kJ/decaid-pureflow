<script lang="ts">
  // Hot water or flush on a screen without the large ring (spec 3.10): a small countdown ring at
  // the bottom of the left column, the time inside, and one tap stops what runs. The numbers are
  // the large ring's, from water.ts.
  import type { Skin } from './skin.svelte';
  import { ringOf, smallTime, WATER_LABEL, waterDuration, waterSeconds, type WaterRun } from './water';

  interface Props {
    skin: Skin;
    run: WaterRun;
  }

  let { skin, run }: Props = $props();

  const ring = $derived(ringOf(waterSeconds(run), waterDuration(run.kind, skin.workflow)));
  const time = $derived(smallTime(ring));
</script>

<button
  class="small-ring"
  data-testid="small-ring"
  data-kind={run.kind}
  data-share={ring.share.toFixed(3)}
  aria-label="stop {WATER_LABEL[run.kind].toLowerCase()}"
  onclick={() => skin.stop()}
>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <circle class="track" cx="50" cy="50" r="44" />
    <circle class="done" cx="50" cy="50" r="44" pathLength="100" stroke-dasharray="{ring.share * 100} 100" />
  </svg>
  <span class="time" data-testid="small-ring-time"><strong>{time[0]}</strong> <span>{time[1]}</span></span>
</button>

<style>
  /* In the left column (4rem on every screen but home), under the back arrow: its width less its padding. */
  .small-ring {
    position: absolute;
    left: 0.3rem;
    bottom: 1rem;
    z-index: 12;
    width: 3.4rem;
    aspect-ratio: 1;
    padding: 0;
    display: grid;
    place-items: center;
    font: inherit;
    color: var(--fg);
    background: var(--raised);
    border: 0;
    border-radius: 50%;
    touch-action: manipulation;
    user-select: none;
    font-variant-numeric: tabular-nums;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
    pointer-events: none;
    fill: none;
    stroke-width: 8;
  }

  .track {
    stroke: var(--line);
  }

  .done {
    stroke: var(--fg);
    transition: stroke-dasharray 0.5s linear;
  }

  .time {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1;
  }

  .time strong {
    font-size: 1.15rem;
    font-weight: 600;
  }

  .time span {
    font-size: 0.6rem;
    color: var(--dim);
    white-space: nowrap;
  }
</style>
