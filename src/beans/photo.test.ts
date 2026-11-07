import { describe, expect, it } from 'vitest';
import { isPhoto, nextAngle, orphanPhotoKeys, photoFrame, photoKey, photoSize, turnedSize, type Angle } from './photo';

describe('the turn', () => {
  it('cycles 0, 90, 180, 270 and back to 0', () => {
    const seen: Angle[] = [0];
    for (let i = 0; i < 4; i++) seen.push(nextAngle(seen[i]));
    expect(seen).toEqual([0, 90, 180, 270, 0]);
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
