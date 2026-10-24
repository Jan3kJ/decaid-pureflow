// Reads a bag's photo the way the skin does (src/beans/ocr.ts: Tesseract.js, the bundled English
// data, OEM.LSTM_ONLY, PSM.SPARSE_TEXT) and prints every line with its text, height, confidence
// and box, so that the rules of `bagText` are tuned on real output. A dev script: it is not in
// the build or the ZIP.
//
//   node scripts/ocr-probe.mjs <photo> [--rotate 90|270] [--scale <factor>] [--prepare] [--invert] [--json]
//
// --rotate turns the photo clockwise before it is read, --scale scales it, --prepare makes it grey with its
// contrast stretched, --invert turns light on dark into dark on light. These are done here only,
// on a canvas of Playwright's Chromium (a dev dependency), not by the skin.
// --json prints the photo's file name, the options and the lines as one entry of the fixture
// `src/beans/ocr-bags.json`.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { createWorker, OEM, PSM } from 'tesseract.js';

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));
const valueOf = (flag, fallback) => (args.includes(flag) ? Number(args[args.indexOf(flag) + 1]) : fallback);
const degrees = valueOf('--rotate', 0);
const scale = valueOf('--scale', 1);
const values = new Set(['--rotate', '--scale'].map((flag) => args.indexOf(flag) + 1).filter((index) => index > 0));
const photo = args.find((arg, index) => !arg.startsWith('--') && !values.has(index));
if (!photo || ![0, 90, 270].includes(degrees) || !(scale > 0)) {
  console.error('usage: node scripts/ocr-probe.mjs <photo> [--rotate 90|270] [--scale <factor>] [--prepare] [--invert] [--json]');
  process.exit(2);
}

/** The photo turned, greyed, stretched or inverted on a canvas, as a PNG. */
async function canvasPhoto(file, options) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const dataUrl = `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`;
    const png = await page.evaluate(
      async ({ dataUrl, degrees, scale, prepare, invert }) => {
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        const turned = degrees % 180 !== 0;
        const canvas = document.createElement('canvas');
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        canvas.width = turned ? height : width;
        canvas.height = turned ? width : height;
        const context = canvas.getContext('2d');
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate((degrees * Math.PI) / 180);
        context.drawImage(image, -width / 2, -height / 2, width, height);
        if (prepare || invert) {
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
          const data = pixels.data;
          const grey = new Uint8Array(data.length / 4);
          for (let i = 0; i < grey.length; i++)
            grey[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
          let low = 0;
          let high = 255;
          if (prepare) {
            const sorted = Uint8Array.from(grey).sort();
            low = sorted[Math.floor(sorted.length * 0.01)];
            high = Math.max(low + 1, sorted[Math.floor(sorted.length * 0.99)]);
          }
          for (let i = 0; i < grey.length; i++) {
            let value = prepare ? Math.min(255, Math.max(0, ((grey[i] - low) * 255) / (high - low))) : grey[i];
            if (invert) value = 255 - value;
            data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = value;
          }
          context.putImageData(pixels, 0, 0);
        }
        return canvas.toDataURL('image/png');
      },
      { dataUrl, degrees, scale, ...options },
    );
    return Buffer.from(png.slice(png.indexOf(',') + 1), 'base64');
  } finally {
    await browser.close();
  }
}

const prepare = flags.has('--prepare');
const invert = flags.has('--invert');
const input = degrees || scale !== 1 || prepare || invert ? await canvasPhoto(photo, { prepare, invert }) : photo;

const require = createRequire(import.meta.url);
const langPath = join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: 'none' });
try {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, debug_file: '/dev/null' });
  const { data } = await worker.recognize(input, {}, { blocks: true });
  const lines = (data.blocks ?? []).flatMap((block) =>
    block.paragraphs.flatMap((paragraph) =>
      paragraph.lines.map((line) => ({
        text: line.text.trim(),
        height: line.bbox.y1 - line.bbox.y0,
        confidence: Math.round(line.confidence),
        box: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 },
      })),
    ),
  );
  if (flags.has('--json')) {
    const recipe = args.filter((arg) => arg !== photo && arg !== '--json').join(' ');
    console.log(JSON.stringify({ photo: basename(photo), recipe, lines }));
  } else {
    for (const line of lines) {
      const { x0, y0, x1, y1 } = line.box;
      console.log(
        `${String(line.height).padStart(4)} px  ${String(line.confidence).padStart(3)}%  [${x0},${y0} ${x1},${y1}]  ${JSON.stringify(line.text)}`,
      );
    }
  }
} finally {
  await worker.terminate();
}
