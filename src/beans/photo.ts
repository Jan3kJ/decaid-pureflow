// A bean's photo of its bag (spec 3.9 item 20, research.md 29.14): Decaid's bean has no field
// for an image, so the photo is a JPEG data URL in the skin's KV namespace under the bean's id.
// A bean deleted anywhere (the skin only archives) leaves its key behind; the catalogue's read
// deletes the keys of beans that are gone. The bag is read from the camera's picture, which is
// larger than the stored photo.
import { LONG_MAX } from './ocr';
import { readingCanvas } from './prepare';

/** The photo's longest side, in pixels. */
export const PHOTO_LONG_SIDE = 1024;
/** The JPEG quality of the stored photo. */
export const PHOTO_QUALITY = 0.85;

const PREFIX = 'bean-photo-';

/** The KV key of a bean's photo, in the skin's namespace. */
export function photoKey(beanId: string): string {
  return PREFIX + beanId;
}

/** The KV keys of photos whose bean is not in the catalogue (archived ones are). */
export function orphanPhotoKeys(keys: readonly string[], beanIds: readonly string[]): string[] {
  const ids = new Set(beanIds);
  return keys.filter((key) => key.startsWith(PREFIX) && !ids.has(key.slice(PREFIX.length)));
}

/** A picture's size scaled down to `PHOTO_LONG_SIDE` on its longest side; a smaller one keeps its size. */
export function photoSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, PHOTO_LONG_SIDE / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A stored value is a photo when it is a JPEG data URL. */
export function isPhoto(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/jpeg;base64,');
}

/** Draws a video frame or a picture scaled down into a JPEG data URL. */
export function toPhoto(source: CanvasImageSource, width: number, height: number): string {
  const size = photoSize(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.drawImage(source, 0, 0, size.width, size.height);
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

/** A capture: the photo to store and the picture to read the bag from. */
export interface Capture {
  photo: string;
  /** at most `LONG_MAX` pixels on its long side */
  source: HTMLCanvasElement;
}

/** A video frame or a picture as a capture. */
export function toCapture(source: CanvasImageSource, width: number, height: number): Capture {
  return { photo: toPhoto(source, width, height), source: readingCanvas(source, width, height, LONG_MAX) };
}

/** A picture file (the file input's) as a capture. */
export async function fileToCapture(file: Blob): Promise<Capture> {
  const bitmap = await createImageBitmap(file);
  try {
    return toCapture(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
