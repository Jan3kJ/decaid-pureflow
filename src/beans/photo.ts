// A bean's photo of its bag: Decaid's bean has no field
// for an image, so the photo is a JPEG data URL in the skin's KV namespace under the bean's id.
// A bean deleted anywhere (the skin only archives) leaves its key behind; the catalogue's read
// deletes the keys of beans that are gone.

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

/** A clockwise turn of the camera's overlay and of the frame taken in it, in degrees. */
export type Angle = 0 | 90 | 180 | 270;

/** The angle after 'turn right': a quarter turn clockwise, 270 back to 0. */
export function nextAngle(angle: Angle): Angle {
  return ((angle + 90) % 360) as Angle;
}

/** The angle after 'turn left': a quarter turn counter-clockwise, 0 back to 270. */
export function previousAngle(angle: Angle): Angle {
  return ((angle + 270) % 360) as Angle;
}

/** A picture's size once turned by `angle`: width and height swap at 90 and 270. */
export function turnedSize(width: number, height: number, angle: Angle): { width: number; height: number } {
  return angle === 90 || angle === 270 ? { width: height, height: width } : { width, height };
}

/** Draws a video frame or a picture, turned clockwise by `angle` and scaled down, into a JPEG data URL. */
export function toPhoto(source: CanvasImageSource, width: number, height: number, angle: Angle = 0): string {
  const turned = turnedSize(width, height, angle);
  const size = photoSize(turned.width, turned.height);
  const scale = size.width / turned.width;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.translate(size.width / 2, size.height / 2);
  context.rotate((angle * Math.PI) / 180);
  context.drawImage(source, (-width * scale) / 2, (-height * scale) / 2, width * scale, height * scale);
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

/** A picture file (the file input's) as a photo. */
export async function fileToPhoto(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    return toPhoto(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** The thumbnail's frame for a photo of this size: its own shape, so the whole photo shows. A square one is landscape. */
export function photoFrame(width: number, height: number): { portrait: boolean; ratio: number } {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return { portrait: h > w, ratio: w / h };
}
