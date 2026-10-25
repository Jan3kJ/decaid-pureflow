<script lang="ts">
  import type { AFlowParams } from '../aflow';
  import { PHASE_LABEL, REENABLE_SECONDS, type Curve, type EditField, type PhaseId, type Projection } from './curve';
  import { formatValue } from './fields';
  import { durationFields, laneLefts, offGroups, type PlotBox } from './plot';
  import ValueChip from './ValueChip.svelte';

  // What sits on the editor's graph: the infuse-to and stop-at weights between its two bands,
  // and a button for each phase that is off in the phase-name row under the axis.
  interface Props {
    curve: Curve;
    params: AFlowParams;
    box: PlotBox;
    projection: Projection;
    /** the root font size in pixels */
    rem: number;
    onstep: (field: EditField, direction: 1 | -1) => void;
    /** the infuse-to chip dragged `dx` pixels left or right, and let go */
    onweightdrag: (dx: number, event: PointerEvent) => void;
    onweightdrop: () => void;
    onreenable: (phase: PhaseId) => void;
  }

  let { curve, params, box, projection, rem, onstep, onweightdrag, onweightdrop, onreenable }: Props = $props();

  const infuseEnd = $derived(curve.phases.find((c) => c.id === 'infuse')!.x1);
  const infuseOff = $derived(curve.off.includes('infuse'));
  const offAt = $derived(offGroups(curve));

  // The names and durations printed under the phases that have a width (GraphGrid), by an
  // estimate of their text's width; a turn-on button keeps clear of them.
  const durationOf = $derived(durationFields(curve));
  const names = $derived(
    curve.phases
      .filter((phase) => phase.x1 > phase.x0)
      .map((phase) => {
        const duration = durationOf[phase.id];
        const durationText = duration ? (phase.id === 'secondFill' ? 'pause ' : '') + formatValue(duration, params[duration]) : '';
        const half = Math.max(PHASE_LABEL[phase.id].length, durationText.length) * 0.3 * rem;
        const middle = (projection.x(phase.x0) + projection.x(phase.x1)) / 2;
        return { from: middle - half, to: middle + half };
      }),
  );
  let widths = $state<number[]>([]);
  const lefts = $derived(
    laneLefts(
      offAt.map(([x], i) => ({ x: projection.x(x), width: widths[i] ?? 0 })),
      names,
      box.left,
      box.right,
      0.5 * rem,
    ),
  );
</script>

<!-- The infuse-to chip is dragged left or right; a tap still opens its plus and minus. -->
{#if !infuseOff}
  <div class="on-graph" style:left="{projection.x(infuseEnd)}px" style:top="{box.gapMiddle}px">
    <ValueChip
      compact
      label="infuse to"
      value={formatValue('infuseWeight', params.infuseWeight)}
      testid="graph-infuseWeight"
      onstep={(d: 1 | -1) => onstep('infuseWeight', d)}
      ondrag={onweightdrag}
      ondrop={onweightdrop}
    />
  </div>
{/if}
<!-- A phase that is off has no width; its button turns it on again with 5 s. -->
{#each offAt as [x, ids], i (x)}
  <div class="lane" style:left="{lefts[i]}px" style:top="{box.bottom + 0.2 * rem}px" bind:offsetWidth={widths[i]}>
    {#each ids as id (id)}
      <button
        class="enable"
        data-testid="enable-{id}"
        aria-label="turn {PHASE_LABEL[id]} on with {REENABLE_SECONDS} s"
        onclick={() => onreenable(id)}
      >
        <span class="plus">+</span>{PHASE_LABEL[id]}
      </button>
    {/each}
  </div>
{/each}
<div class="on-graph end" style:left="{box.right}px" style:top="{box.gapMiddle}px">
  <ValueChip
    compact
    label="stop at"
    value={formatValue('stopWeight', params.stopWeight)}
    testid="graph-stopWeight"
    onstep={(d: 1 | -1) => onstep('stopWeight', d)}
  />
</div>

<style>
  .on-graph {
    position: absolute;
    transform: translate(-50%, -50%);
  }

  .on-graph.end {
    transform: translate(-100%, -50%);
  }

  .lane {
    position: absolute;
    display: flex;
    gap: 0.5rem;
  }

  .enable {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0 0.9rem;
    background: var(--panel);
    border: 1px dashed var(--dim);
    border-radius: 1.4rem;
    color: var(--dim);
    font: inherit;
    font-size: var(--text-label);
    white-space: nowrap;
  }

  .enable .plus {
    color: var(--fg);
    font-size: var(--text-body);
    line-height: 1;
  }
</style>
