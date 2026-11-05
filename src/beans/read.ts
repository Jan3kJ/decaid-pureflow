// The bag's reader of the ocr flavour, loaded only through readPhoto in ./reading. PaddleOCR.js
// runs the PP-OCRv6 tiny detector and recogniser on ONNX Runtime's WASM build, on the device: the
// models come from the skin's own `ocr/` folder and ONNX Runtime's WASM from its assets, so a
// reading fetches nothing from any other host and works offline.
import { PaddleOCR } from '@paddleocr/paddleocr-js';
import type { BagLine } from './reading';
import { lineOf, mergeTurns } from './turns';

const DETECTOR = 'PP-OCRv6_tiny_det';
const RECOGNISER = 'PP-OCRv6_tiny_rec';

type Reader = Awaited<ReturnType<typeof PaddleOCR.create>>;

let reader: Promise<Reader> | null = null;

/** The reader, made on the first photo and kept for the next. */
function made(): Promise<Reader> {
  reader ??= PaddleOCR.create({
    textDetectionModelName: DETECTOR,
    textDetectionModelAsset: { url: modelUrl(DETECTOR) },
    textRecognitionModelName: RECOGNISER,
    textRecognitionModelAsset: { url: modelUrl(RECOGNISER) },
    // The skin's page is not cross-origin isolated, so ONNX Runtime has one thread and no proxy.
    ortOptions: { backend: 'wasm', numThreads: 1, disableWasmProxy: true },
  }).catch((error: unknown) => {
    reader = null;
    throw error;
  });
  return reader;
}

function modelUrl(name: string): string {
  return new URL(`ocr/${name}_onnx_infer.tar`, document.baseURI).href;
}

/** The picture on a canvas, turned clockwise by `turn`. */
function turned(image: HTMLImageElement, turn: 0 | 90 | 270): HTMLCanvasElement {
  const { naturalWidth: width, naturalHeight: height } = image;
  const canvas = document.createElement('canvas');
  canvas.width = turn ? height : width;
  canvas.height = turn ? width : height;
  const context = canvas.getContext('2d')!;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turn * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2);
  return canvas;
}

async function readTurned(ocr: Reader, image: HTMLImageElement, turn: 0 | 90 | 270): Promise<BagLine[]> {
  const canvas = turned(image, turn);
  const [result] = await ocr.predict(canvas);
  return (result?.items ?? []).map((item) => lineOf(item, turn, canvas.width, canvas.height));
}

/**
 * The lines read on a stored photo (a data URL). The reader expects upright lines and turns a tall
 * one by 270 degrees itself, so a line printed bottom to top comes out as nonsense on the upright
 * photo: it is read upright and in both turns, and the best line of each place stays.
 */
export async function readBag(photo: string): Promise<BagLine[]> {
  const ocr = await made();
  const image = new Image();
  image.src = photo;
  await image.decode();
  const passes: BagLine[][] = [];
  for (const turn of [0, 90, 270] as const) passes.push(await readTurned(ocr, image, turn));
  return mergeTurns(passes);
}
