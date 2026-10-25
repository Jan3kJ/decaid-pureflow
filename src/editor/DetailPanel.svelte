<script lang="ts">
  import type { AFlowParams, ResolvedParams } from '../aflow';
  import { PHASE_LABEL, type EditField, type PhaseId } from './curve';
  import { FIELD_TONE, PANEL_LABEL, PHASE_FIELDS, formatValue } from './fields';
  import ValueChip from './ValueChip.svelte';

  // Detail mode's panel: the selected phase's values, then the dose.
  interface Props {
    selected: PhaseId;
    params: AFlowParams;
    resolved: ResolvedParams;
    onstep: (field: EditField, direction: 1 | -1) => void;
    /** a value was tapped: the number pad opens for it */
    ontype: (field: EditField) => void;
  }

  let { selected, params, resolved, onstep, ontype }: Props = $props();
</script>

<aside data-testid="detail-panel">
  <h2>{PHASE_LABEL[selected]}</h2>
  {#each PHASE_FIELDS[selected] as field (field)}
    <ValueChip
      label={PANEL_LABEL[field]}
      value={formatValue(field, resolved[field])}
      tone={FIELD_TONE[field] ?? 'none'}
      testid={field}
      onstep={(d: 1 | -1) => onstep(field, d)}
      onedit={() => ontype(field)}
    />
  {/each}
  <h2 class="shot">shot</h2>
  <ValueChip
    label={PANEL_LABEL.dose}
    value={formatValue('dose', params.dose)}
    testid="dose"
    onstep={(d: 1 | -1) => onstep('dose', d)}
    onedit={() => ontype('dose')}
  />
</aside>

<style>
  /* The panel runs down to the bottom edge: a phase has up to six values and the dose. */
  aside {
    grid-area: panel;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    min-height: 3rem;
    display: flex;
    align-items: center;
    font-size: var(--text-body);
    font-weight: 600;
  }

  h2.shot {
    min-height: 0;
    margin-top: auto;
    padding-top: 0.5rem;
    font-size: var(--text-label);
    font-weight: 400;
    color: var(--dim);
  }
</style>
