<script lang="ts">
  // Hot water and flush on home (spec 3.6): the picture of the group head and its stream, and
  // the countdown ring around the stop button. The numbers come from water.ts.
  import type { Skin } from './skin.svelte';
  import { cupOf, ringOf, streamOf, waterColour, waterSeconds, waterTarget, type WaterRun } from './water';

  interface Props {
    skin: Skin;
    run: WaterRun;
  }

  let { skin, run }: Props = $props();

  const target = $derived(waterTarget(run.kind, skin.workflow));
  const ring = $derived(ringOf(run.kind, waterSeconds(run), target.duration));
  const stream = $derived(streamOf(run.flow));
  const colour = $derived(waterColour(run.temperature));
  const cup = $derived(run.kind === 'hotWater' ? cupOf(run.volume, skin.weight, target.volume) : null);

  // The picture's coordinates: the group head at the top, the cup or the drip tray below.
  const HEAD_Y = 52;
  const TRAY_Y = 216;
  const CUP = { top: 128, bottom: 208, left: 62, right: 138 };
  const surface = $derived(cup ? CUP.bottom - (CUP.bottom - CUP.top) * cup.level : TRAY_Y);
</script>

<section class="water" data-testid="water-view" data-kind={run.kind}>
  <div class="picture">
    <svg viewBox="0 0 200 240" role="img" aria-label={run.kind === 'hotWater' ? 'hot water into a cup' : 'flush into the drip tray'}>
      <defs>
        <clipPath id="cup-inside">
          <path d="M{CUP.left + 2} {CUP.top} L{CUP.left + 8} {CUP.bottom - 2} H{CUP.right - 8} L{CUP.right - 2} {CUP.top} Z" />
        </clipPath>
      </defs>

      <!-- the group head and its shower screen -->
      <rect class="metal" x="58" y="8" width="84" height="34" rx="6" />
      <rect class="screen" x="70" y="42" width="60" height={HEAD_Y - 42} rx="2" />

      <!-- the stream: dashes that run down, wider and faster with more flow, still at 0 -->
      <line
        class="stream"
        class:moving={stream.moving}
        data-testid="water-stream"
        data-moving={stream.moving}
        x1="100"
        y1={HEAD_Y}
        x2="100"
        y2={surface}
        stroke={colour}
        stroke-width={stream.moving ? 4 + 20 * stream.width : 2}
        style:animation-duration="{stream.period || 1}s"
      />

      {#if cup}
        <rect
          class="fill"
          data-testid="water-cup-fill"
          data-level={cup.level.toFixed(3)}
          clip-path="url(#cup-inside)"
          x={CUP.left}
          y={surface}
          width={CUP.right - CUP.left}
          height={CUP.bottom - surface}
          fill={colour}
        />
        <path
          class="cup"
          d="M{CUP.left} {CUP.top - 4} L{CUP.left + 7} {CUP.bottom} H{CUP.right - 7} L{CUP.right} {CUP.top - 4} M{CUP.right - 3} {CUP.top + 14} q22 4 14 26 q-4 12 -18 12"
        />
      {:else}
        {#if stream.moving}
          <ellipse class="splash" cx="100" cy={TRAY_Y} rx={10 + 18 * stream.width} ry="4" fill={colour} />
        {/if}
      {/if}
      <!-- the drip tray with its grate -->
      <rect class="metal" x="26" y={TRAY_Y} width="148" height="16" rx="3" />
      {#each [40, 58, 76, 94, 112, 130, 148] as x (x)}
        <rect class="slot" {x} y={TRAY_Y + 5} width="12" height="3" rx="1" />
      {/each}
    </svg>

    <p class="values">
      {#if cup}
        <span class:weight={cup.unit === 'g'} class:flow={cup.unit === 'ml'} data-testid="water-amount">
          {cup.amount.toFixed(0)}{target.volume === null ? '' : ` / ${Math.round(target.volume)}`} {cup.unit}
        </span>
      {/if}
      <span class="flow" data-testid="water-flow">{run.flow.toFixed(1)} ml/s</span>
      <span class="temperature" data-testid="water-temperature">{run.temperature.toFixed(0)} °C</span>
    </p>
  </div>

  <div class="ring" data-testid="water-ring" data-share={ring.share.toFixed(3)}>
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="track" cx="50" cy="50" r="46" />
      <circle class="done" cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="{ring.share * 100} 100" />
    </svg>
    <!-- Nothing is started here: the DE1 is started at the machine. What runs can be stopped. -->
    <button class="stop" data-testid="stop" onclick={() => skin.stop()}>
      <span data-testid="water-label">{ring.label}</span>
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
    gap: 4rem;
    padding: 1rem 2rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  .picture {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .picture svg {
    flex: 1;
    min-height: 0;
    aspect-ratio: 200 / 240;
  }

  .metal {
    fill: var(--raised);
    stroke: var(--line);
  }

  .screen {
    fill: var(--line);
  }

  .slot {
    fill: var(--bg);
  }

  .stream {
    stroke-dasharray: 18 4;
    opacity: 0.3;
  }

  .stream.moving {
    opacity: 0.9;
    animation: run linear infinite;
  }

  @keyframes run {
    to {
      stroke-dashoffset: -22;
    }
  }

  .fill {
    opacity: 0.75;
  }

  .cup {
    fill: none;
    stroke: var(--fg);
    stroke-width: 3;
    stroke-linejoin: round;
  }

  .splash {
    opacity: 0.6;
  }

  .values {
    margin: 0;
    display: flex;
    gap: 1.6rem;
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
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

  .ring {
    position: relative;
    height: 100%;
    aspect-ratio: 1;
    flex: none;
    display: grid;
    place-items: center;
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

  .stop {
    width: 78%;
    aspect-ratio: 1;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    font: inherit;
    color: var(--bg);
    background: var(--temperature);
    border: 0;
    touch-action: manipulation;
    user-select: none;
  }

  .stop span {
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
  }

  .stop strong {
    font-size: 2.6rem;
    font-weight: 600;
  }
</style>
