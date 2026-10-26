// The skin's one horizontal gesture (spec 3.1, 3.7, 3.8, 3.10, 3.14): hot water, home and steam
// are one row of pages, and a swipe moves to the neighbour; on home a swipe to the right that
// starts in the left fifth opens the shot history instead, and one to the left closes it; on every
// other screen a swipe to the right is the way back, to where it was opened from: no screen has a
// back arrow. A drag that starts on a control is the control's. Pure: positions in, decisions out; `onControl` only reads the DOM it is given.
import type { Screen } from './nav';
import { overflowsAlong } from './sideways';

export interface Point {
  x: number;
  y: number;
}

/** The pages a swipe moves between, from left to right. */
export const PAGES = ['hot-water', 'home', 'steam'] as const satisfies readonly Screen[];

export type Page = (typeof PAGES)[number];

/** The history's swipe starts in this share of home's width from the left: home has no button there but the history's handle. */
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
 * Where a finger moving by `dx` on `screen` goes: the page's neighbour, or from any other screen
 * `back`, where it was opened from, to the right and nowhere to the left.
 */
export function destination(screen: Screen, dx: number, back: Screen = 'home'): Screen | null {
  if (isPage(screen)) return neighbour(screen, dx);
  return dx > 0 ? back : null;
}

/**
 * What a touch that went down at `start` on `screen` and is now at `now` is: the history's
 * swipe, a page's drag, a vertical move (not ours, for good), or not decided yet.
 */
export type Gesture = 'history' | 'page' | 'across' | null;

export function decide(start: Point, now: Point, width: number, screen: Screen): Gesture {
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
 * What a touch on the open shot history is: its closing swipe, to the left, the reverse of the
 * one that opened it and decided at the same distance; a vertical move (the list's scroll); or not
 * decided yet.
 */
export function closing(start: Point, now: Point, width: number): 'close' | 'across' | null {
  const dx = now.x - start.x;
  const dy = Math.abs(now.y - start.y);
  const along = Math.abs(dx);
  if (along < width * SWIPE_DISTANCE) return dy > SWIPE_SLOP && dy >= along ? 'across' : null;
  return dx < 0 && dy < along / 2 ? 'close' : 'across';
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
 * place to go, so the edge gives a little and springs back.
 */
export function offset(screen: Screen, dx: number): number {
  return destination(screen, dx) ? dx : dx / 5;
}

/** A swipe to the right that starts this far, in CSS pixels, from the screen's left edge goes back on every screen but home, whatever is under the finger: a finger's width at the display's edge. */
export const BACK_EDGE = 24;

/**
 * Whether a touch that went down at `x` (from the left of the screen) on `screen` is the edge's:
 * there it is decided as the way back only, to the right, before any control (`edgeWay`). Home
 * keeps its history swipe; hot water has nothing to its left.
 */
export function atBackEdge(x: number, screen: Screen): boolean {
  return x <= BACK_EDGE && screen !== 'home' && destination(screen, 1) !== null;
}

/** What the edge's touch is once decided: the way back, to the right and along; anything else is not ours. */
export function edgeWay(gesture: Gesture, dx: number): Gesture {
  return gesture === 'page' && dx > 0 ? 'page' : gesture === null ? null : 'across';
}

/**
 * What a drag on it belongs to rather than to the pages: the fields, a dialog (the number
 * pad), a backdrop marked `data-no-swipe` (home's menu), a row with a swipe of its own
 * (`data-own-swipe`, the picker's rows), and anything that takes drags itself
 * (`touch-action: none`, the chips).
 */
const CONTROLS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"], [data-no-swipe], [data-own-swipe]';

/** What even the edge does not go back over: a dialog and its backdrop. */
const DIALOGS = '[role="dialog"], [data-no-swipe]';

/**
 * An element that drags only some of its area (the editor's graph) answers, for a point on the
 * screen, whether the finger lies on something it drags; elsewhere a drag on it is the page's.
 */
export type Drags = (point: Point) => boolean;

/** The DOM `onControl` reads; an `Element` has it. */
export interface Box {
  closest(selectors: string): unknown;
  parentElement: Box | null;
  scrollWidth: number;
  clientWidth: number;
  drags?: Drags;
}

/** Gives `element` its answer to `onControl`: the drags are its own only where `drags` says so. */
export function dragsOnly(element: Element, drags: Drags): () => void {
  const box = element as unknown as Box;
  box.drags = drags;
  return () => delete box.drags;
}

type Style = (node: Box) => Pick<CSSStyleDeclaration, 'overflowX' | 'touchAction'>;

/**
 * Whether the box scrolls sideways: `overflow-x` is `auto` or `scroll` and its content is wider.
 * A box that scrolls only down computes `overflow-x: auto` too (CSS makes the other axis `auto`
 * when one is not `visible`), and is no row that scrolls sideways.
 */
const scrollsAlong = (node: Box, overflow: string) => (overflow === 'auto' || overflow === 'scroll') && overflowsAlong(node);

/**
 * Whether a drag that starts on `target` at `point` is a control's: one of `CONTROLS`, or inside
 * something that takes drags (`touch-action: none`, or where an element's `drags` says so) or
 * that really scrolls sideways (a row of buttons wider than its box), up to `root`. A list that
 * scrolls down is not: the browser's pan is vertical only there (app.css), so a move along it is
 * the swipe.
 */
export function onControl(
  target: Box | null,
  root: Box,
  style: Style = (node) => getComputedStyle(node as unknown as Element),
  point: Point = { x: 0, y: 0 },
): boolean {
  if (!target || target.closest(CONTROLS)) return true;
  for (let node: Box | null = target; node && node !== root; node = node.parentElement) {
    if (node.drags) {
      if (node.drags(point)) return true;
      continue;
    }
    const css = style(node);
    if (css.touchAction === 'none') return true;
    if (scrollsAlong(node, css.overflowX)) return true;
  }
  return false;
}

/** Whether the edge may go back from `target`: anywhere but in a dialog or over its backdrop. */
export function inDialog(target: Box | null): boolean {
  return Boolean(target?.closest(DIALOGS));
}
