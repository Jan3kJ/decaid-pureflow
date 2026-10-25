// Reads a bag's photo the way the skin does (src/beans/ocr.ts, src/beans/prepare.ts) and prints
// every pass with the time it took and its lines (text, height, confidence, box), then the kept
// pass, the name and roaster it gives and the chips, so that the rules are tuned on real output.
// A dev script: it is not in the build or the ZIP.
//
//   node scripts/ocr-probe.mjs <photo> [--pass <degrees>,<long>[,invert]] [--json]
//
// The skin's own code does the work: `readPasses` decides which passes are read, the source of
// `readingCanvas` and `turnedCanvas` draws the photo on a canvas of Playwright's Chromium (a dev
// dependency), `preparePixels` makes its pixels grey, stretched and inverted here in Node, and
// Tesseract.js reads them with the skin's options and the bundled English data. The photo is read
// as the camera's picture is: at most 2800 pixels on its long side. The catalogue is the founder's
// roasters (spec 3.14).
// --pass reads one pass only: turned clockwise by 0, 90 or 270 degrees, at a long side, inverted.
// --json prints the photo's file name and every pass as one entry of the fixture
// `src/beans/ocr-bags.json`, which ocr.test.ts replays.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { createWorker, OEM, PSM } from 'tesseract.js';
import { bagText, chipLines, LONG_MAX, passScore, readPasses } from '../src/beans/ocr.ts';
import { preparePixels, readingCanvas, turnedCanvas } from '../src/beans/prepare.ts';

const ROASTERS = ['aniko', 'hopplo', 'dak', 'seekind', 'kaffeekommune', 'maldaner', 'kaffeesack'];
const CATALOGUE = ROASTERS.map((roaster) => ({ roaster, name: '', country: null }));

const args = process.argv.slice(2);
const json = args.includes('--json');
const passArg = args.includes('--pass') ? args[args.indexOf('--pass') + 1] : null;
const photo = args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--pass');
const [passDegrees, passLong, passInvert] = (passArg ?? '').split(',');
const single = passArg ? { degrees: Number(passDegrees), long: Number(passLong), invert: passInvert === 'invert' } : null;
if (!photo || (single && (![0, 90, 270].includes(single.degrees) || !(single.long > 0)))) {
  console.error('usage: node scripts/ocr-probe.mjs <photo> [--pass <degrees>,<long>[,invert]] [--json]');
  process.exit(2);
}

/** A grey PNG of prepared RGBA pixels (R = G = B), as the skin's canvas gives Tesseract. */
function greyPng(rgba, width, height) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes) => {
    let c = ~0;
    for (const byte of bytes) c = table[(c ^ byte) & 255] ^ (c >>> 8);
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, check]);
  };
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = rgba[(y * width + x) * 4];
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bits, grey
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const browser = await chromium.launch();
const require = createRequire(import.meta.url);
const langPath = join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath, gzip: true, cacheMethod: 'none' });
try {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, debug_file: '/dev/null' });
  const page = await browser.newPage();
  const dataUrl = `data:image/jpeg;base64,${readFileSync(photo).toString('base64')}`;
  await page.evaluate(
    async ({ dataUrl, source, longMax }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const draw = new Function(`return ${source}`)();
      window.readingSource = draw(image, image.width, image.height, longMax);
    },
    { dataUrl, source: readingCanvas.toString(), longMax: LONG_MAX },
  );

  const times = [];
  /** The skin's pass: the photo drawn in Chromium, prepared in Node, read by Tesseract. */
  const recognize = async (plan) => {
    const started = performance.now();
    const drawn = await page.evaluate(
      ({ plan, source }) => {
        const turn = new Function(`return ${source}`)();
        const canvas = turn(window.readingSource, plan.degrees, plan.long);
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let binary = '';
        for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
        return { width: canvas.width, height: canvas.height, pixels: btoa(binary) };
      },
      { plan, source: turnedCanvas.toString() },
    );
    const rgba = new Uint8ClampedArray(Buffer.from(drawn.pixels, 'base64'));
    preparePixels(rgba, plan.invert);
    const { data } = await worker.recognize(greyPng(rgba, drawn.width, drawn.height), {}, { blocks: true });
    times.push(Math.round(performance.now() - started));
    return (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.map((line) => ({
          text: line.text,
          height: line.bbox.y1 - line.bbox.y0,
          confidence: line.confidence,
          box: { x0: line.bbox.x0, y0: line.bbox.y0, x1: line.bbox.x1, y1: line.bbox.y1 },
        })),
      ),
    );
  };

  const show = (lines) => {
    for (const line of lines) {
      const { x0, y0, x1, y1 } = line.box;
      console.log(
        `  ${String(line.height).padStart(4)} px  ${String(Math.round(line.confidence)).padStart(3)}%  [${x0},${y0} ${x1},${y1}]  ${JSON.stringify(line.text.trim())}`,
      );
    }
  };
  const name = (plan) => `${plan.degrees} deg, ${plan.long} px${plan.invert ? ', inverted' : ''}`;

  if (single) {
    const lines = await recognize(single);
    console.log(`${name(single)}: ${times[0]} ms, score ${passScore(lines)}`);
    show(lines);
  } else {
    const { kept, passes } = await readPasses(recognize, CATALOGUE);
    if (json) {
      console.log(JSON.stringify({ photo: basename(photo), passes }));
    } else {
      passes.forEach((pass, index) => {
        console.log(`${name(pass)}: ${times[index]} ms, score ${passScore(pass.lines)}`);
        show(pass.lines);
      });
      const total = times.reduce((sum, time) => sum + time, 0);
      console.log(`kept: ${name(kept)}; ${passes.length} passes, ${total} ms`);
      console.log(`guess: ${JSON.stringify(bagText(kept.lines, CATALOGUE))}`);
      console.log(`chips: ${JSON.stringify(chipLines(kept.lines))}`);
    }
  }
} finally {
  await worker.terminate();
  await browser.close();
}
