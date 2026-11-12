// How far a graph's labels reach past its grid, read from the drawn texts, so that the nearest
// drawn content on each side stands `--graph-pad` from the frame whatever the font makes of it.

export interface Reach {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const NO_REACH: Reach = { left: 0, top: 0, right: 0, bottom: 0 };

/** The gap between a graph's content and its frame, in pixels: `--graph-pad` (app.css), in rem. */
export function graphPad(rem: number): number {
  return (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--graph-pad')) || 0.6) * rem;
}

/**
 * The labels' reach past `grid`, the box of the grid in the SVG's own pixels: tick numbers to its
 * left (and above its top line), time labels or captions under it and past its right end. Zero
 * where nothing reaches, and for an SVG that is not laid out.
 */
export function labelReach(svg: SVGSVGElement, grid: { left: number; top: number; right: number; bottom: number }): Reach {
  const frame = svg.getBoundingClientRect();
  if (frame.width === 0 || frame.height === 0 || svg.clientWidth === 0 || svg.clientHeight === 0) return NO_REACH;
  // A page that slides in is scaled for a moment: the rects are read in the SVG's own pixels.
  const sx = frame.width / svg.clientWidth;
  const sy = frame.height / svg.clientHeight;
  const reach = { left: 0, top: 0, right: 0, bottom: 0 };
  for (const label of svg.querySelectorAll('text.tick, text.time, text.phase, text.duration')) {
    const rect = label.getBoundingClientRect();
    reach.left = Math.max(reach.left, grid.left - (rect.left - frame.left) / sx);
    reach.top = Math.max(reach.top, grid.top - (rect.top - frame.top) / sy);
    reach.right = Math.max(reach.right, (rect.right - frame.left) / sx - grid.right);
    reach.bottom = Math.max(reach.bottom, (rect.bottom - frame.top) / sy - grid.bottom);
  }
  return reach;
}

/** True where two reaches differ by more than a tenth of a pixel: a measure that settles stops. */
export function reachMoved(a: Reach, b: Reach): boolean {
  return (['left', 'top', 'right', 'bottom'] as const).some((side) => Math.abs(a[side] - b[side]) > 0.1);
}
