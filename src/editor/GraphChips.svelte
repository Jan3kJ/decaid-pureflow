<script lang="ts">
  import type { AFlowParams } from '../aflow';
  import { PHASE_LABEL, REENABLE_SECONDS, type Curve, type EditField, type PhaseId, type Projection } from './curve';
  import { formatValue } from './fields';
  import { offGroups, type PlotBox } from './plot';
  import ValueChip from './ValueChip.svelte';

  // What sits on the editor's graph between its two bands: the infuse-to and stop-at weights,
  // and a button for each phase that is off.
  interface Props {
    curve: Curve;
    params: AFlowParams;
    box: PlotBox;
    projection: Projection;
    onstep: (field: EditField, direction: 1 | -1) => void;
    /** the infuse-to chip dragged `dx` pixels left or right, and let go */
    onweightdrag: (dx: number, event: PointerEvent) => void;
    onweightdrop: () => void;
    onreenable: (phase: PhaseId) => void;
  }

  let { curve, params, box, projection, onstep, onweightdrag, onweightdrop, onreenable }: Props = $props();

  const infuseEnd = $derived(curve.phases.find((c) => c.id === 'infuse')!.x1);
  const infuseOff = $derived(curve.off.includes('infuse'));
  const offAt = $derived(offGroups(curve));
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
{#each offAt as [x, ids] (x)}
  <div class="on-graph off" style:left="{projection.x(x)}px" style:top="{box.gapMiddle}px">
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

  .on-graph.off {
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
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .enable .plus {
    color: var(--fg);
    font-size: 1.2rem;
    line-height: 1;
  }
</style>
