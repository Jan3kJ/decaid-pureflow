// The bag's photo prepared for the reader (spec 3.14, Z2): drawn turned and scaled on a canvas,
// then grey with its contrast stretched, and inverted for the second pass. scripts/ocr-probe.mjs
// prepares the founder's photos with these same functions: it runs the source of the two canvas
// functions in Playwright's Chromium, so they use nothing outside themselves, and
// `preparePixels` in Node.

/**
 * The picture to read, on a canvas at most `longMax` pixels on its long side (a smaller one keeps
 * its size). The stored photo is smaller than this: the reading takes the camera's frame.
 */
export function readingCanvas(source: CanvasImageSource, width: number, height: number, longMax: number): HTMLCanvasElement {
  const scale = Math.min(1, longMax / Math.max(width, height, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** The picture turned clockwise by `degrees` (0, 90 or 270) and scaled so that its long side is `long` pixels. */
export function turnedCanvas(source: HTMLCanvasElement, degrees: number, long: number): HTMLCanvasElement {
  const scale = long / Math.max(source.width, source.height, 1);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const turned = degrees % 180 !== 0;
  const canvas = document.createElement('canvas');
  canvas.width = turned ? height : width;
  canvas.height = turned ? width : height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((degrees * Math.PI) / 180);
  context.drawImage(source, -width / 2, -height / 2, width, height);
  return canvas;
}

/** The share of the darkest and of the lightest pixels the contrast stretch leaves out. */
const STRETCH_CUT = 0.01;

/**
 * A canvas's pixels (RGBA) made grey, in place, with the contrast stretched between the 1st and
 * the 99th percentile of the grey, and inverted (light on dark becomes dark on light) when asked.
 */
export function preparePixels(rgba: Uint8ClampedArray, invert: boolean): void {
  const count = rgba.length / 4;
  const grey = new Uint8Array(count);
  const histogram = new Uint32Array(256);
  for (let i = 0; i < count; i++) {
    const value = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
    grey[i] = value;
    histogram[value]++;
  }
  /** the grey value at a share of the pixels sorted from dark to light */
  const percentile = (share: number) => {
    const index = Math.floor(count * share);
    let seen = 0;
    for (let value = 0; value < 256; value++) {
      seen += histogram[value];
      if (seen > index) return value;
    }
    return 255;
  };
  const low = percentile(STRETCH_CUT);
  const high = Math.max(low + 1, percentile(1 - STRETCH_CUT));
  for (let i = 0; i < count; i++) {
    const stretched = Math.min(255, Math.max(0, ((grey[i] - low) * 255) / (high - low)));
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = invert ? 255 - stretched : stretched;
  }
}
