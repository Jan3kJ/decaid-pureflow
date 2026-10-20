// Which phase the editor's detail panel shows. Pure: the selection and the parameters in,
// the selection out.
import { hasSecondFill, type AFlowParams } from '../aflow';
import { GRAPH_WIDTH, type Curve, type Hit, type PhaseId } from './curve';

/** The 2nd fill cannot stay selected once it is gone: the infuse is selected instead. */
export function keepSelection(selected: PhaseId, params: AFlowParams): PhaseId {
  return selected === 'secondFill' && !hasSecondFill(params) ? 'infuse' : selected;
}

/** After the 2nd fill's toggle: a new 2nd fill is selected in detail mode. */
export function afterSecondFillToggle(selected: PhaseId, params: AFlowParams, mode: 'simple' | 'detail'): PhaseId {
  if (hasSecondFill(params)) return mode === 'detail' ? 'secondFill' : selected;
  return keepSelection(selected, params);
}

/**
 * The phase a tap on the graph selects: the phase of the line or border it took hold of, or
 * the phase whose column it is in. `units` is the tap's x in graph units (0 to GRAPH_WIDTH).
 */
export function phaseAt(hit: Hit | null, curve: Pick<Curve, 'phases'>, units: number): PhaseId | undefined {
  if (hit) return hit.kind === 'level' ? hit.level.phase : hit.border.phase;
  return curve.phases.find((c) => units >= c.x0 && units <= c.x1)?.id;
}

/** The tap's x in graph units, for a plot from `left` that is `plotW` pixels wide. */
export function graphUnits(x: number, left: number, plotW: number): number {
  return ((x - left) / plotW) * GRAPH_WIDTH;
}
