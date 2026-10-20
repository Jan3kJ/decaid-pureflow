import { describe, expect, it } from 'vitest';
import {
  SWIPE_COMMIT,
  SWIPE_DISTANCE,
  SWIPE_EDGE,
  SWIPE_FLICK,
  SWIPE_SLOP,
  commits,
  decide,
  neighbour,
  offset,
  onControl,
  type Box,
} from './swipe';

const width = 1280;
const edge = width * SWIPE_EDGE;
const far = width * SWIPE_DISTANCE;

describe("the history's swipe on home", () => {
  it('is a move to the right that starts in the left fifth', () => {
    expect(decide({ x: 20, y: 400 }, { x: 20 + far, y: 400 }, width, 'home')).toBe('history');
    expect(decide({ x: edge, y: 400 }, { x: edge + far + 40, y: 430 }, width, 'home')).toBe('history');
  });

  it('waits for its distance, so a slow start there moves no page', () => {
    expect(decide({ x: 20, y: 400 }, { x: 20 + far - 1, y: 400 }, width, 'home')).toBeNull();
  });

  it('is not a move down, one from the middle, or one on another page', () => {
    expect(decide({ x: 20, y: 400 }, { x: 20 + far, y: 400 + far }, width, 'home')).toBe('across');
    expect(decide({ x: edge + 1, y: 400 }, { x: edge + 1 + 2 * far, y: 400 }, width, 'home')).toBe('page');
    expect(decide({ x: 20, y: 400 }, { x: 20 + far, y: 400 }, width, 'steam')).toBe('page');
    expect(decide({ x: 20, y: 400 }, { x: 20 + far, y: 400 }, width, 'hot-water')).toBe('page');
  });

  it('scales with the viewport', () => {
    expect(decide({ x: 20, y: 100 }, { x: 70, y: 100 }, 640, 'home')).toBe('history');
    expect(decide({ x: 20, y: 100 }, { x: 70, y: 100 }, 1280, 'home')).toBeNull();
  });
});

describe("a page's swipe", () => {
  it('starts once the finger moved past the slop, more along than across', () => {
    expect(decide({ x: 600, y: 400 }, { x: 600 - SWIPE_SLOP + 1, y: 400 }, width, 'home')).toBeNull();
    expect(decide({ x: 600, y: 400 }, { x: 600 - SWIPE_SLOP, y: 404 }, width, 'home')).toBe('page');
    expect(decide({ x: 600, y: 400 }, { x: 600 + SWIPE_SLOP, y: 400 }, width, 'home')).toBe('page');
    expect(decide({ x: 600, y: 400 }, { x: 600 + SWIPE_SLOP, y: 406 }, width, 'home')).toBe('across');
    expect(decide({ x: 600, y: 400 }, { x: 602, y: 400 + SWIPE_SLOP }, width, 'steam')).toBe('across');
  });

  it('from the left fifth of home to the left is a page swipe to steam', () => {
    expect(decide({ x: 100, y: 400 }, { x: 80, y: 400 }, width, 'home')).toBe('page');
  });

  it('is never one on a screen outside the row', () => {
    for (const screen of ['editor', 'profiles', 'settings'] as const) {
      expect(decide({ x: 600, y: 400 }, { x: 300, y: 400 }, width, screen)).toBe('across');
    }
  });
});

describe('the row of pages', () => {
  it('runs hot water, home, steam: a finger to the left brings the right page', () => {
    expect(neighbour('home', -1)).toBe('steam');
    expect(neighbour('home', 1)).toBe('hot-water');
    expect(neighbour('steam', 1)).toBe('home');
    expect(neighbour('hot-water', -1)).toBe('home');
    expect(neighbour('steam', -1)).toBeNull();
    expect(neighbour('hot-water', 1)).toBeNull();
    expect(neighbour('home', 0)).toBeNull();
  });

  it('gives a little at its ends and follows the finger elsewhere', () => {
    expect(offset('home', -300)).toBe(-300);
    expect(offset('steam', -300)).toBe(-60);
    expect(offset('hot-water', 300)).toBe(60);
  });
});

describe('letting go', () => {
  it('moves on past its share of the width, or after a flick the same way', () => {
    expect(commits(-width * SWIPE_COMMIT, 0, width)).toBe(true);
    expect(commits(width * SWIPE_COMMIT - 1, 0, width)).toBe(false);
    expect(commits(-40, -SWIPE_FLICK, width)).toBe(true);
    expect(commits(40, SWIPE_FLICK, width)).toBe(true);
  });

  it('springs back after a flick back, or with no move', () => {
    expect(commits(-200, SWIPE_FLICK * 2, width)).toBe(false);
    expect(commits(0, 0, width)).toBe(false);
  });
});

describe('a drag on a control', () => {
  interface Fake extends Box {
    selector?: boolean;
    css?: Partial<Record<'overflowX' | 'overflowY' | 'touchAction', string>>;
  }
  const node = (fields: Partial<Fake>, parent: Fake | null): Fake => {
    const made: Fake = {
      parentElement: parent,
      scrollWidth: 100,
      clientWidth: 100,
      scrollHeight: 100,
      clientHeight: 100,
      ...fields,
      closest: () => (made.selector || (parent && parent.closest('')) ? made : null),
    };
    return made;
  };
  const style = (box: Box) => ({ overflowX: 'visible', overflowY: 'visible', touchAction: 'auto', ...(box as Fake).css });
  const root = node({}, null);

  it('is not a drag on a plain part of the page, a graph to look at or a list that fits', () => {
    expect(onControl(node({}, root), root, style)).toBe(false);
    expect(onControl(node({ css: { overflowY: 'auto' } }, root), root, style)).toBe(false);
  });

  it('is one on a field, a slider or a dialog, and on anything inside them', () => {
    const slider = node({ selector: true }, root);
    expect(onControl(slider, root, style)).toBe(true);
    expect(onControl(node({}, slider), root, style)).toBe(true);
  });

  it('is one on something that takes drags itself or a list that scrolls', () => {
    const graph = node({ css: { touchAction: 'none' } }, root);
    expect(onControl(node({}, graph), root, style)).toBe(true);
    const list = node({ css: { overflowY: 'auto' }, scrollHeight: 400 }, root);
    expect(onControl(node({}, list), root, style)).toBe(true);
    const row = node({ css: { overflowX: 'scroll' }, scrollWidth: 400 }, root);
    expect(onControl(row, root, style)).toBe(true);
  });

  it('looks no further than the root', () => {
    const outside = node({ css: { touchAction: 'none' } }, null);
    const inner = node({}, outside);
    expect(onControl(node({}, inner), inner, style)).toBe(false);
  });
});
