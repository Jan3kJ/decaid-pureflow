<svelte:options namespace="svg" />

<script lang="ts">
  import type { AFlowParams } from '../aflow';
  import { PHASE_LABEL, type Curve, type EditField, type PhaseId, type Projection } from './curve';
  import { formatValue } from './fields';
  import { durationFields, phaseCaption, type PlotBox } from './plot';

  // What the editor's graph draws under its lines: the phases' columns with their names and
  // durations, the grid and its ticks, the phase borders.
  interface Props {
    curve: Curve;
    params: AFlowParams;
    box: PlotBox;
    projection: Projection;
    /** the graph's height in pixels, and the root font size */
    height: number;
    rem: number;
    mode: 'simple' | 'detail';
    selected: PhaseId;
    mainTicks: number[];
    temperatureTicks: number[];
    /** the value a drag changes now, if any */
    dragging: EditField | undefined;
  }

  let { curve, params, box, projection, height, rem, mode, selected, mainTicks, temperatureTicks, dragging }: Props = $props();

  const durationOf = $derived(durationFields(curve));
</script>

{#each curve.phases as phase (phase.id)}
  {@const x0 = projection.x(phase.x0)}
  {@const x1 = projection.x(phase.x1)}
  {@const duration = durationOf[phase.id]}
  {@const caption = phaseCaption(params, phase.id)}
  <rect
    class="column"
    class:selected={mode === 'detail' && phase.id === selected}
    data-testid="column-{phase.id}"
    x={x0}
    y={box.top - 0.6 * rem}
    width={x1 - x0}
    height={Math.max(0, height - box.top)}
    rx={0.5 * rem}
  />
  {#if x1 > x0}
    <text class="phase" x={(x0 + x1) / 2} y={box.bottom + 1.35 * rem}>
      {PHASE_LABEL[phase.id]}
    </text>
  {/if}
  {#if duration && x1 > x0}
    <text
      class="duration"
      class:active={dragging === duration}
      data-testid="value-{duration}"
      x={(x0 + x1) / 2}
      y={box.bottom + 2.65 * rem}
    >
      {phase.id === 'secondFill' ? 'pause ' : ''}{formatValue(duration, params[duration])}
    </text>
  {/if}
  {#if mode === 'detail' && x1 > x0 && caption}
    <text class="duration" data-testid="caption-{phase.id}" x={(x0 + x1) / 2} y={box.bottom + 2.65 * rem}>{caption}</text>
  {/if}
{/each}

{#each mainTicks as tick (tick)}
  {@const y = projection.y('pressure', tick)}
  <line class="grid" x1={box.left} x2={box.right} y1={y} y2={y} />
  <text class="tick" x={box.left - 0.5 * rem} y={y + 0.3 * rem}>{tick}</text>
{/each}
{#each temperatureTicks as tick (tick)}
  {@const y = projection.y('temperature', tick)}
  <line class="grid" x1={box.left} x2={box.right} y1={y} y2={y} />
  <text class="tick" data-testid="temperature-tick" x={box.left - 0.5 * rem} y={y + 0.3 * rem}>{tick}</text>
{/each}

{#each curve.phases.slice(1) as phase (phase.id)}
  {@const x = projection.x(phase.x0)}
  <line class="border" x1={x} x2={x} y1={box.top} y2={box.bottom} />
{/each}
{#if curve.pauseX !== undefined}
  {@const x = projection.x(curve.pauseX)}
  <line class="border inner" x1={x} x2={x} y1={box.mainTop} y2={box.bottom} />
{/if}

<style>
  /*
   * The grid's own sizes, inside the graph's SVG: `text`, `.phase` and `.tick` fit the drawing,
   * not a text role (spec 3.14; scripts/font-sizes.mjs lets these rules through).
   */
  text {
    fill: var(--dim);
    font-size: 0.85rem;
    pointer-events: none;
    font-variant-numeric: tabular-nums;
  }

  .phase,
  .duration {
    text-anchor: middle;
  }

  .phase {
    fill: var(--fg);
    font-size: 0.9rem;
  }

  .duration.active {
    fill: var(--fg);
    font-weight: 600;
  }

  .tick {
    text-anchor: end;
    font-size: 0.75rem;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
    opacity: 0.55;
  }

  .border {
    stroke: var(--dim);
    stroke-width: 1.5;
    stroke-dasharray: 2 6;
    stroke-linecap: round;
  }

  .border.inner {
    opacity: 0.5;
  }

  .column {
    fill: none;
  }

  .column.selected {
    fill: var(--raised);
    stroke: var(--line);
  }
</style>
