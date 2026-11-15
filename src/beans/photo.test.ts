import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isPhoto,
  nextAngle,
  orphanPhotoKeys,
  photoFrame,
  photoKey,
  photoSize,
  previousAngle,
  toPhoto,
  turnedSize,
  type Angle,
} from './photo';

describe('the turn', () => {
  it('cycles 0, 90, 180, 270 and back to 0', () => {
    const seen: Angle[] = [0];
    for (let i = 0; i < 4; i++) seen.push(nextAngle(seen[i]));
    expect(seen).toEqual([0, 90, 180, 270, 0]);
  });

  it('turns left by a quarter, 0 back to 270, and undoes a turn right', () => {
    const seen: Angle[] = [0];
    for (let i = 0; i < 4; i++) seen.push(previousAngle(seen[i]));
    expect(seen).toEqual([0, 270, 180, 90, 0]);
    for (const angle of [0, 90, 180, 270] as Angle[]) expect(previousAngle(nextAngle(angle))).toBe(angle);
  });

  it('swaps width and height of the captured frame at 90 and 270', () => {
    expect(turnedSize(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
    expect(turnedSize(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(turnedSize(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
    expect(turnedSize(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
  });
});

describe('photoSize', () => {
  it('scales the longest side down to 1024 px and keeps the shape', () => {
    expect(photoSize(1920, 1080)).toEqual({ width: 1024, height: 576 });
    expect(photoSize(3000, 4000)).toEqual({ width: 768, height: 1024 });
  });

  it('leaves a smaller picture as it is', () => {
    expect(photoSize(640, 400)).toEqual({ width: 640, height: 400 });
  });
});

describe('photoFrame', () => {
  it('gives a portrait photo a portrait frame and a landscape one a landscape frame', () => {
    expect(photoFrame(768, 1024)).toEqual({ portrait: true, ratio: 0.75 });
    expect(photoFrame(1024, 576)).toEqual({ portrait: false, ratio: 1024 / 576 });
  });

  it('gives a square photo a landscape frame and survives a size of zero', () => {
    expect(photoFrame(500, 500)).toEqual({ portrait: false, ratio: 1 });
    expect(photoFrame(0, 0)).toEqual({ portrait: false, ratio: 1 });
  });
});

describe('orphanPhotoKeys', () => {
  it('gives the photo keys of beans that are gone, and leaves the other keys', () => {
    const keys = [photoKey('a'), photoKey('b'), 'settings-backup', 'last-steam'];
    expect(orphanPhotoKeys(keys, ['a', 'c'])).toEqual([photoKey('b')]);
    expect(orphanPhotoKeys(keys, ['a', 'b'])).toEqual([]);
  });
});

describe('isPhoto', () => {
  it('takes a JPEG data URL only', () => {
    expect(isPhoto('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isPhoto('data:image/png;base64,iVBOR')).toBe(false);
    expect(isPhoto(null)).toBe(false);
  });
});

describe('toPhoto', () => {
  /** A canvas that records the size, the turn and where the source is drawn. */
  function fakeCanvas() {
    const calls: { translate: number[]; rotate: number; draw: number[] } = { translate: [], rotate: 0, draw: [] };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        translate: (x: number, y: number) => (calls.translate = [x, y]),
        rotate: (r: number) => (calls.rotate = r),
        drawImage: (_: unknown, x: number, y: number, w: number, h: number) => (calls.draw = [x, y, w, h]),
      }),
      toDataURL: () => 'data:image/jpeg;base64,x',
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    return { canvas, calls };
  }

  afterEach(() => vi.unstubAllGlobals());

  /** Where a point of the source (0..1 of its width and height) lands in the stored photo, in 0..1 too. */
  function landing(calls: ReturnType<typeof fakeCanvas>['calls'], canvas: { width: number; height: number }, fx: number, fy: number) {
    const [x, y, w, h] = calls.draw;
    const px = x + fx * w;
    const py = y + fy * h;
    const cos = Math.cos(calls.rotate);
    const sin = Math.sin(calls.rotate);
    return {
      x: Math.round((calls.translate[0] + px * cos - py * sin) / canvas.width) + 0,
      y: Math.round((calls.translate[1] + px * sin + py * cos) / canvas.height) + 0,
    };
  }

  // A tablet turned counter-clockwise by the angle sees an upright scene turned clockwise by it; the
  // mark on the scene's upper left is where that turn puts it in the camera's frame.
  const markCorner: Record<Angle, [number, number]> = { 0: [0, 0], 90: [1, 0], 180: [1, 1], 270: [0, 1] };

  it.each([0, 90, 180, 270] as Angle[])('stores the frame upright with the mark in the upper left, turned %i', (angle) => {
    const { canvas, calls } = fakeCanvas();
    toPhoto({} as CanvasImageSource, 1920, 1080, angle);
    expect(landing(calls, canvas, ...markCorner[angle])).toEqual({ x: 0, y: 0 });
  });

  it('is portrait at 90 and 270, 576 by 1024 from a 1920 by 1080 frame, and landscape at 0 and 180', () => {
    for (const [angle, size] of [
      [0, [1024, 576]],
      [90, [576, 1024]],
      [180, [1024, 576]],
      [270, [576, 1024]],
    ] as [Angle, number[]][]) {
      const { canvas } = fakeCanvas();
      toPhoto({} as CanvasImageSource, 1920, 1080, angle);
      expect([canvas.width, canvas.height], String(angle)).toEqual(size);
    }
  });

  it('keeps the size of a frame smaller than the limit', () => {
    const { canvas } = fakeCanvas();
    toPhoto({} as CanvasImageSource, 640, 360, 90);
    expect([canvas.width, canvas.height]).toEqual([360, 640]);
  });
});
