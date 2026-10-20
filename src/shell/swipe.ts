// The skin's one horizontal gesture (spec 3.1, 3.7, 3.8): hot water, home and steam are one
// row of pages, and a swipe moves to the neighbour; on home a swipe to the right that starts in
// the left fifth opens the shot history instead. A drag that starts on a control is the
// control's. Pure: positions in, decisions out; `onControl` only reads the DOM it is given.
import type { Screen } from './nav';

export interface Point {
  x: number;
  y: number;
}

/** The pages a swipe moves between, from left to right. */
export const PAGES = ['hot-water', 'home', 'steam'] as const satisfies readonly Screen[];

export type Page = (typeof PAGES)[number];

/** The history's swipe starts in this share of home's width from the left: home has no button there but the tab. */
export const SWIPE_EDGE = 0.2;
/** It opens the history after this share of the width. */
export const SWIPE_DISTANCE = 0.06;
/** A page follows the finger once it moved this far, in CSS pixels, more along than across. */
export const SWIPE_SLOP = 10;
/** Let go, a page moves on after this share of the width, or after a flick of `SWIPE_FLICK`. */
export const SWIPE_COMMIT = 0.25;
/** A flick, in CSS pixels per millisecond. */
export const SWIPE_FLICK = 0.5;

export function isPage(screen: Screen): screen is Page {
  return (PAGES as readonly Screen[]).includes(screen);
}

/** The page beside `page` that a finger moving by `dx` brings in: to the left brings the right one. */
export function neighbour(page: Page, dx: number): Page | null {
  const index = PAGES.indexOf(page) + (dx < 0 ? 1 : -1);
  return dx === 0 ? null : (PAGES[index] ?? null);
}

/**
 * What a touch that went down at `start` on `screen` and is now at `now` is: the history's
 * swipe, a page's drag, a vertical move (not ours, for good), or not decided yet.
 */
export type Gesture = 'history' | 'page' | 'across' | null;

export function decide(start: Point, now: Point, width: number, screen: Screen): Gesture {
  if (!isPage(screen)) return 'across';
  const dx = now.x - start.x;
  const dy = Math.abs(now.y - start.y);
  const along = Math.abs(dx);
  if (screen === 'home' && start.x <= width * SWIPE_EDGE && dx > 0) {
    // The history's swipe: decided at its own distance, so a slow start is no page's drag.
    if (along < width * SWIPE_DISTANCE) return dy > SWIPE_SLOP && dy >= along ? 'across' : null;
    return dy < along / 2 ? 'history' : 'across';
  }
  if (Math.max(along, dy) < SWIPE_SLOP) return null;
  return dy < along / 2 ? 'page' : 'across';
}

/**
 * Whether a page's drag of `dx` that ended at `velocity` (CSS pixels per millisecond, signed
 * like `dx`) moves on to the neighbour, rather than springing back.
 */
export function commits(dx: number, velocity: number, width: number): boolean {
  if (dx === 0) return false;
  const along = Math.sign(dx) === Math.sign(velocity) ? Math.abs(velocity) : 0;
  return Math.abs(dx) >= width * SWIPE_COMMIT || along >= SWIPE_FLICK;
}

/**
 * The drag's offset as drawn: the finger's, but held to a fifth of it where there is no
 * neighbour, so the edge gives a little and springs back.
 */
export function offset(page: Page, dx: number): number {
  return neighbour(page, dx) ? dx : dx / 5;
}

/**
 * What a drag on it belongs to rather than to the pages: the fields, a dialog (the number
 * pad), a backdrop marked `data-no-swipe` (home's menu), and anything that takes drags itself
 * (`touch-action: none`, the editor's graph and chips).
 */
const CONTROLS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"], [data-no-swipe]';

/** The DOM `onControl` reads; an `Element` has it. */
export interface Box {
  closest(selectors: string): unknown;
  parentElement: Box | null;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

type Style = (node: Box) => Pick<CSSStyleDeclaration, 'overflowX' | 'overflowY' | 'touchAction'>;

const scrolls = (overflow: string) => overflow === 'auto' || overflow === 'scroll';

/**
 * Whether a drag that starts on `target` is a control's: one of `CONTROLS`, or inside
 * something that takes drags or scrolls (a list longer than its place), up to `root`.
 */
export function onControl(
  target: Box | null,
  root: Box,
  style: Style = (node) => getComputedStyle(node as unknown as Element),
): boolean {
  if (!target || target.closest(CONTROLS)) return true;
  for (let node: Box | null = target; node && node !== root; node = node.parentElement) {
    const css = style(node);
    if (css.touchAction === 'none') return true;
    if (scrolls(css.overflowY) && node.scrollHeight > node.clientHeight) return true;
    if (scrolls(css.overflowX) && node.scrollWidth > node.clientWidth) return true;
  }
  return false;
}
