// Where the editor's graph lands on the screen: the plot's box, the scales and the drawn
// paths, in pixels. Pure: sizes and the curve in, numbers and strings out.
import type { MachineLimits, NumberField } from '../aflow';
import { GRAPH_WIDTH, type Curve, type LineId, type PhaseId, type Point, type Projection, type TemperatureAxis } from './curve';

/**
 * The plot in pixels: a band for the temperature on top, a gap that holds the weight chips,
 * and the band of pressure and flow.
 */
export interface PlotBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  plotW: number;
  tempBottom: number;
  tempH: number;
  /** the middle of the gap between the two bands, where the chips sit */
  gapMiddle: number;
  mainTop: number;
  mainH: number;
}

/** The box for a graph `width` x `height` pixels, with `rem` pixels to the root font size. */
export function plotBox(width: number, height: number, rem: number): PlotBox {
  const left = 2.8 * rem;
  const right = Math.max(left + 1, width - 1.2 * rem);
  const top = 1.8 * rem;
  const bottom = Math.max(top + 3, height - 3.4 * rem);
  const gap = 3.4 * rem;
  const tempH = Math.max(1, Math.min(bottom - top - gap, Math.max((bottom - top - gap) * 0.22, 3.2 * rem)));
  const mainTop = top + tempH + gap;
  return {
    left,
    right,
    top,
    bottom,
    plotW: right - left,
    tempBottom: top + tempH,
    tempH,
    gapMiddle: top + tempH + gap / 2,
    mainTop,
    mainH: Math.max(1, bottom - mainTop),
  };
}

/**
 * Pressure and flow share one scale: 1 bar is as high as 1 ml/s. It reaches the maxima, and
 * a saved flow above a lowered maximum flow, so that one is drawn where it is.
 */
export function sharedMax(limits: Pick<MachineLimits, 'maxPressure' | 'maxFlow'>, curve: Pick<Curve, 'pressure' | 'flow'>): number {
  return Math.max(limits.maxPressure, limits.maxFlow, ...curve.pressure.map((pt) => pt.y), ...curve.flow.flat().map((pt) => pt.y));
}

/** A grid line every 3 bar (and ml/s) from 0 up to the shared maximum. */
export function mainTicks(yMax: number): number[] {
  return Array.from({ length: Math.floor(yMax / 3) + 1 }, (_, i) => i * 3);
}

export function plotProjection(box: PlotBox, temperature: TemperatureAxis, yMax: number): Projection {
  return {
    x: (units) => box.left + (units / GRAPH_WIDTH) * box.plotW,
    y: (line, value) =>
      line === 'temperature'
        ? box.tempBottom - ((value - temperature.min) / (temperature.max - temperature.min)) * box.tempH
        : box.bottom - (value / yMax) * box.mainH,
  };
}

/** How much of a line's value one pixel up is. */
export function valuePerPixel(line: LineId, box: PlotBox, temperature: TemperatureAxis, yMax: number): number {
  return line === 'temperature' ? (temperature.max - temperature.min) / box.tempH : yMax / box.mainH;
}

/** Seconds per pixel to the right, for a border that adds `secondsPerUnit` per graph unit. */
export function secondsPerPixel(secondsPerUnit: number, box: Pick<PlotBox, 'plotW'>): number {
  return secondsPerUnit / (box.plotW / GRAPH_WIDTH);
}

/** An SVG polyline's points. */
export function polylinePoints(points: readonly Point[], line: LineId, projection: Projection): string {
  return points.map((pt) => `${projection.x(pt.x).toFixed(1)},${projection.y(line, pt.y).toFixed(1)}`).join(' ');
}

/** The flow line has a gap (the infuse phase): one path, one stretch per subpath. */
export function flowPath(stretches: readonly (readonly Point[])[], projection: Projection): string {
  return stretches
    .map(
      (stretch) => 'M' + stretch.map((pt) => `${projection.x(pt.x).toFixed(1)} ${projection.y('flow', pt.y).toFixed(1)}`).join(' L'),
    )
    .join(' ');
}

/** The duration each border changes, by the phase on its left. */
export function durationFields(curve: Pick<Curve, 'borders'>): Partial<Record<PhaseId, NumberField>> {
  return Object.fromEntries(curve.borders.map((b) => [b.phase, b.field]));
}

/** The phases that are off, by where they collapsed: two may collapse at one place. */
export function offGroups(curve: Pick<Curve, 'off' | 'phases'>): [number, PhaseId[]][] {
  const groups: [number, PhaseId[]][] = [];
  for (const id of curve.off) {
    const x = curve.phases.find((c) => c.id === id)!.x0;
    const group = groups.find(([at]) => at === x);
    if (group) group[1].push(id);
    else groups.push([x, [id]]);
  }
  return groups;
}

/** The drag's pop-up stays on the graph and above the finger at (x, y). */
export function popupAt(x: number, y: number, width: number, rem: number): { left: number; top: number } {
  return {
    left: Math.min(Math.max(x, 7 * rem), width - 7 * rem),
    top: Math.max(y - 4.2 * rem, 0.2 * rem),
  };
}
