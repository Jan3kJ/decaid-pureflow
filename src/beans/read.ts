// The bag's reader of the ocr flavour, loaded only through readPhoto in ./reading. PaddleOCR.js
// runs the PP-OCRv6 tiny detector and recogniser on ONNX Runtime's WASM build, on the device: the
// models come from the skin's own `ocr/` folder and ONNX Runtime's WASM from its assets, so a
// reading fetches nothing from any other host and works offline.
import { PaddleOCR, type OcrResultItem } from '@paddleocr/paddleocr-js';
import type { BagLine } from './reading';

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

/** The photo (a data URL) drawn on a canvas, turned clockwise by `degrees` (0 or 270). */
async function canvasOf(photo: string, degrees: 0 | 270): Promise<HTMLCanvasElement> {
  const image = new Image();
  image.src = photo;
  await image.decode();
  const { naturalWidth: width, naturalHeight: height } = image;
  const canvas = document.createElement('canvas');
  canvas.width = degrees ? height : width;
  canvas.height = degrees ? width : height;
  const context = canvas.getContext('2d')!;
  if (degrees) {
    context.translate(0, width);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(image, 0, 0);
  return canvas;
}

function line(item: OcrResultItem): BagLine {
  const xs = item.poly.map(([x]) => x);
  const ys = item.poly.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    text: item.text.trim(),
    score: item.score,
    box: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
  };
}

async function readTurned(ocr: Reader, photo: string, degrees: 0 | 270): Promise<BagLine[]> {
  const [result] = await ocr.predict(await canvasOf(photo, degrees));
  return (result?.items ?? []).map(line).filter((read) => read.text !== '');
}

/**
 * The lines read on a stored photo (a data URL), in the detector's order. The photo is read upright;
 * when nothing is read there, it is turned by 270 degrees and read again.
 */
export async function readBag(photo: string): Promise<BagLine[]> {
  const ocr = await made();
  const upright = await readTurned(ocr, photo, 0);
  return upright.length > 0 ? upright : readTurned(ocr, photo, 270);
}
