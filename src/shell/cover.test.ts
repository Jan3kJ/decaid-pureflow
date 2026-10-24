import { describe, expect, it } from 'vitest';
import { boxOf, under, union, type Laid, type Rect } from './cover';

function laid(offset: Partial<Laid>, parent: Laid | null = null, offsetParent: Laid | null = parent): Laid {
  return {
    offsetLeft: 0,
    offsetTop: 0,
    offsetWidth: 0,
    offsetHeight: 0,
    scrollLeft: 0,
    scrollTop: 0,
    ...offset,
    parentElement: parent,
    offsetParent,
  };
}

describe("the ring's frame", () => {
  const graph: Rect = { left: 20, top: 70, width: 900, height: 650 };
  const list: Rect = { left: 20, top: 90, width: 400, height: 600 };
  const form: Rect = { left: 440, top: 90, width: 800, height: 680 };

  it('covers several marked frames as one box', () => {
    expect(union([graph])).toEqual(graph);
    expect(union([list, form])).toEqual({ left: 20, top: 90, width: 1220, height: 680 });
    expect(union([])).toBeNull();
  });

  it('covers a screen without a frame under its header, or whole without one', () => {
    const screen: Rect = { left: 0, top: 0, width: 1280, height: 800 };
    expect(under(screen, { left: 20, top: 12, width: 1240, height: 56 })).toEqual({ left: 0, top: 68, width: 1280, height: 732 });
    expect(under(screen, null)).toEqual(screen);
  });

  it('measures a frame by layout offsets from the root, less what its ancestors scrolled', () => {
    const root = laid({ offsetWidth: 1280, offsetHeight: 800 });
    const page = laid({ offsetWidth: 1280, offsetHeight: 800 }, root);
    const panel = laid({ offsetLeft: 300, offsetTop: 80, offsetWidth: 960, offsetHeight: 700, scrollTop: 40 }, page);
    const frame = laid({ offsetLeft: 16, offsetTop: 120, offsetWidth: 900, offsetHeight: 300 }, panel);
    expect(boxOf(frame, root)).toEqual({ left: 316, top: 160, width: 900, height: 300 });
  });

  it('measures nothing outside the root', () => {
    const root = laid({});
    const elsewhere = laid({ offsetLeft: 5 }, laid({}));
    expect(boxOf(elsewhere, root)).toBeNull();
  });
});
