import { describe, expect, it } from 'vitest';
import {
  BACK_EDGE,
  SWIPE_COMMIT,
  SWIPE_DISTANCE,
  SWIPE_EDGE,
  SWIPE_FLICK,
  SWIPE_SLOP,
  atBackEdge,
  closing,
  commits,
  decide,
  dragsOnly,
  destination,
  edgeWay,
  inDialog,
  neighbour,
  offset,
  onControl,
  type Box,
  type Drags,
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

  it('is one on every screen outside the row too: the way back', () => {
    for (const screen of ['profiles', 'settings', 'beans'] as const) {
      expect(decide({ x: 600, y: 400 }, { x: 300, y: 400 }, width, screen)).toBe('page');
      expect(decide({ x: 20, y: 400 }, { x: 20 + SWIPE_SLOP, y: 400 }, width, screen)).toBe('page');
    }
  });

  it("is one in the editor, with no history's edge there", () => {
    expect(decide({ x: 20, y: 400 }, { x: 20 + SWIPE_SLOP, y: 400 }, width, 'editor')).toBe('page');
    expect(decide({ x: 600, y: 400 }, { x: 300, y: 400 }, width, 'editor')).toBe('page');
    expect(decide({ x: 600, y: 400 }, { x: 604, y: 400 + SWIPE_SLOP }, width, 'editor')).toBe('across');
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

describe('the way back', () => {
  it('goes from a screen outside the row to where it was opened from, to the right, and nowhere to the left', () => {
    expect(destination('editor', 1)).toBe('home');
    expect(destination('profiles', 1, 'editor')).toBe('editor');
    expect(destination('settings', 1, 'home')).toBe('home');
    expect(destination('beans', 1)).toBe('home');
    expect(destination('editor', -1)).toBeNull();
    expect(destination('editor', 0)).toBeNull();
    expect(destination('home', -1)).toBe('steam');
  });

  it('from hot water, the leftmost page, is to the left: home lies to its right', () => {
    expect(destination('hot-water', -1)).toBe('home');
    expect(destination('hot-water', 1)).toBeNull();
    expect(destination('steam', 1)).toBe('home');
    expect(destination('home', 1)).toBe('hot-water');
  });

  it('follows the finger to the right and gives a little to the left', () => {
    expect(offset('editor', 300)).toBe(300);
    expect(offset('editor', -300)).toBe(-60);
  });
});

describe("the open history's swipe", () => {
  it('closes it to the left, at the distance that opens it', () => {
    expect(closing({ x: 300, y: 400 }, { x: 300 - far, y: 400 }, width)).toBe('close');
    expect(closing({ x: 300, y: 400 }, { x: 300 - far + 1, y: 400 }, width)).toBeNull();
  });

  it('is not a move to the right or down', () => {
    expect(closing({ x: 300, y: 400 }, { x: 300 + far, y: 400 }, width)).toBe('across');
    expect(closing({ x: 300, y: 400 }, { x: 300, y: 400 + SWIPE_SLOP + 1 }, width)).toBe('across');
    expect(closing({ x: 300, y: 400 }, { x: 300 - far, y: 400 + far }, width)).toBe('across');
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
    scrollWidth: number;
    clientWidth: number;
    scrollHeight?: number;
    clientHeight?: number;
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

  it('is not a drag on a plain part of the page, a graph to look at or a list, which scrolls down only', () => {
    expect(onControl(node({}, root), root, style)).toBe(false);
    expect(onControl(node({ css: { overflowY: 'auto' } }, root), root, style)).toBe(false);
    const list = node({ css: { overflowY: 'auto' }, scrollHeight: 400 }, root);
    expect(onControl(node({}, list), root, style)).toBe(false);
  });

  it('is one on a field, a slider or a dialog, and on anything inside them', () => {
    const slider = node({ selector: true }, root);
    expect(onControl(slider, root, style)).toBe(true);
    expect(onControl(node({}, slider), root, style)).toBe(true);
  });

  it('is one on something that takes drags itself or a row that scrolls sideways', () => {
    const graph = node({ css: { touchAction: 'none' } }, root);
    expect(onControl(node({}, graph), root, style)).toBe(true);
    // A row that scrolls sideways, also while it fits: the browser pans it.
    expect(onControl(node({ css: { overflowX: 'scroll' }, scrollWidth: 400 }, root), root, style)).toBe(true);
    expect(onControl(node({ css: { overflowX: 'auto' }, scrollWidth: 140 }, root), root, style)).toBe(true);
  });

  it('is not one on a box that scrolls only down, whose overflow-x computes to auto too, nor on a row that fits', () => {
    const column = node({ css: { overflowX: 'auto', overflowY: 'auto' }, scrollHeight: 900 }, root);
    expect(onControl(node({}, column), root, style)).toBe(false);
    expect(onControl(node({ css: { overflowX: 'auto' } }, root), root, style)).toBe(false);
    expect(onControl(node({ css: { overflowX: 'scroll' } }, root), root, style)).toBe(false);
  });

  it('is one on the graph only where it drags: it answers for the point, in place of its touch-action', () => {
    const graph = node({ css: { touchAction: 'none' }, drags: ({ x }) => x < 50 }, root);
    expect(onControl(node({}, graph), root, style, { x: 20, y: 0 })).toBe(true);
    expect(onControl(node({}, graph), root, style, { x: 80, y: 0 })).toBe(false);
    // A chip on it keeps its own touch-action.
    expect(onControl(node({ css: { touchAction: 'none' } }, graph), root, style, { x: 80, y: 0 })).toBe(true);
  });

  it('looks no further than the root', () => {
    const outside = node({ css: { touchAction: 'none' } }, null);
    const inner = node({}, outside);
    expect(onControl(node({}, inner), inner, style)).toBe(false);
  });
});

describe('the left edge', () => {
  it('is the left 24 px of every screen with a way back to the right but home', () => {
    expect(atBackEdge(BACK_EDGE, 'settings')).toBe(true);
    expect(atBackEdge(0, 'editor')).toBe(true);
    expect(atBackEdge(0, 'steam')).toBe(true);
    expect(atBackEdge(BACK_EDGE + 1, 'profiles')).toBe(false);
    expect(atBackEdge(0, 'home')).toBe(false);
    expect(atBackEdge(0, 'hot-water')).toBe(false);
  });

  it('decides a move to the right and along only; a tap or a move left or down is not its', () => {
    expect(edgeWay('page', 30)).toBe('page');
    expect(edgeWay('page', -30)).toBe('across');
    expect(edgeWay('across', 5)).toBe('across');
    expect(edgeWay(null, 2)).toBeNull();
  });

  it('does not go back over a dialog or its backdrop', () => {
    const at = (selector: string) => ({
      closest: (s: string) => (s.includes(selector) ? {} : null),
      parentElement: null,
      scrollWidth: 0,
      clientWidth: 0,
    });
    expect(inDialog(at('[data-no-swipe]'))).toBe(true);
    expect(inDialog(at('[role="dialog"]'))).toBe(true);
    expect(inDialog(at('[data-own-swipe]'))).toBe(false);
  });
});

describe("a touch on the graph's lines", () => {
  type Listener = (event: TouchEvent) => void;
  const element = () => {
    const made = {
      drags: undefined as Drags | undefined,
      listener: null as Listener | null,
      passive: undefined as boolean | undefined,
      addEventListener(_type: 'touchstart', listener: Listener, options: AddEventListenerOptions) {
        made.listener = listener;
        made.passive = options.passive;
      },
      removeEventListener(_type: 'touchstart', listener: Listener) {
        if (made.listener === listener) made.listener = null;
      },
    };
    return made;
  };
  const touch = (x: number, y: number) => {
    const event = {
      cancelable: true,
      defaultPrevented: false,
      changedTouches: [{ clientX: x, clientY: y }],
      preventDefault: () => (event.defaultPrevented = true),
    };
    return event;
  };
  // A fake hit test: the line lies at y 100, a finger reaches 20 px around it.
  const hitAt: Drags = ({ y }) => Math.abs(y - 100) <= 20;

  it('is kept from the browser on a line, and left to it off the lines', () => {
    const graph = element();
    dragsOnly(graph, hitAt);
    expect(graph.passive).toBe(false);
    const on = touch(300, 110);
    graph.listener!(on as unknown as TouchEvent);
    expect(on.defaultPrevented).toBe(true);
    const off = touch(300, 200);
    graph.listener!(off as unknown as TouchEvent);
    expect(off.defaultPrevented).toBe(false);
  });

  it('is left to the browser again once the graph is gone', () => {
    const graph = element();
    const remove = dragsOnly(graph, hitAt);
    expect(graph.drags).toBe(hitAt);
    remove();
    expect(graph.listener).toBeNull();
    expect(graph.drags).toBeUndefined();
  });
});
