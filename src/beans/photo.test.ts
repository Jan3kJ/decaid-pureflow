import { describe, expect, it } from 'vitest';
import { isPhoto, orphanPhotoKeys, photoKey, photoSize } from './photo';

describe('photoSize', () => {
  it('scales the longest side down to 1024 px and keeps the shape', () => {
    expect(photoSize(1920, 1080)).toEqual({ width: 1024, height: 576 });
    expect(photoSize(3000, 4000)).toEqual({ width: 768, height: 1024 });
  });

  it('leaves a smaller picture as it is', () => {
    expect(photoSize(640, 400)).toEqual({ width: 640, height: 400 });
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
