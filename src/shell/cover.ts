// Where hot water and flush cover a screen: a screen marks its main
// frame with `data-main-frame` (on one element or on several, which are covered as one box), and
// the shell draws the one large ring over it; a screen without a mark is covered under its header.
// Boxes are in CSS pixels from the top left of the shell's `main`, by layout offsets, so neither a
// page's slide nor the portrait turn moves them.

/** The attribute a screen puts on its main frame. */
export const MAIN_FRAME = 'data-main-frame';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The smallest box holding every one of `rects`; null for none. */
export function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** The part of `screen` under `header` (its bottom edge), or all of it without a header. */
export function under(screen: Rect, header: Rect | null): Rect {
  if (!header) return screen;
  const top = Math.min(screen.top + screen.height, Math.max(screen.top, header.top + header.height));
  return { left: screen.left, top, width: screen.width, height: screen.top + screen.height - top };
}

/** The DOM `boxOf` reads; an `HTMLElement` has it. */
export interface Laid {
  offsetLeft: number;
  offsetTop: number;
  offsetWidth: number;
  offsetHeight: number;
  offsetParent: unknown;
  parentElement: Laid | null;
  scrollLeft: number;
  scrollTop: number;
}

/** `node`'s box from the top left of `root`, an ancestor that is positioned; null if it is not one. */
export function boxOf(node: Laid, root: Laid): Rect | null {
  let left = 0;
  let top = 0;
  let at: Laid | null = node;
  while (at && at !== root) {
    left += at.offsetLeft;
    top += at.offsetTop;
    at = at.offsetParent as Laid | null;
  }
  if (at !== root) return null;
  // What the frame's scrolling ancestors have scrolled away.
  for (let parent = node.parentElement; parent && parent !== root; parent = parent.parentElement) {
    left -= parent.scrollLeft;
    top -= parent.scrollTop;
  }
  return { left, top, width: node.offsetWidth, height: node.offsetHeight };
}

/**
 * The box the ring covers on the screen `scope`, inside `root`: its marked main frames as one box,
 * else the screen under its first header, else the whole screen.
 */
export function coverOf(scope: HTMLElement, root: HTMLElement): Rect | null {
  const frames = [...scope.querySelectorAll<HTMLElement>(`[${MAIN_FRAME}]`)].filter((frame) => frame.offsetParent !== null);
  const marked = union(frames.map((frame) => boxOf(frame, root)).filter((box) => box !== null));
  if (marked) return marked;
  const screen = boxOf(scope, root);
  if (!screen) return null;
  const header = scope.querySelector<HTMLElement>('header');
  return under(screen, header ? boxOf(header, root) : null);
}
