// Reads a bag's photo in the skin (spec 3.9 item 20, 3.14 Z2): Tesseract.js's worker, the LSTM
// cores and the English data from the build's `ocr/` (vite.config.ts), never from the network; the
// passes of `readPasses`, each drawn and prepared on a canvas (src/beans/prepare.ts). Apart from
// src/beans/ocr.ts so that scripts/ocr-probe.mjs can import that one in Node.
import {
  bagText,
  chipLines,
  passWords,
  readPasses,
  statusText,
  type BagText,
  type KnownBean,
  type OcrProgress,
  type Recognize,
} from './ocr';
import { preparePixels, turnedCanvas } from './prepare';

/** Where the reader's files are: the build's `ocr/`, beside index.html. */
function ocrUrl(file: string): string {
  return new URL(`./ocr/${file}`, document.baseURI).href;
}

/** What the reading of a photo gave: the guess for the fields and the lines for the chips. */
export interface BagReading extends BagText {
  /** up to six lines, from the top; none when nothing could be read */
  chips: string[];
}

/**
 * Reads a bag's photo; `source` is the camera's picture at most `LONG_MAX` pixels on its long side
 * (`readingCanvas`), and the catalogue's beans help to read it. `signal` stops it: the worker is
 * ended and the promise rejects with an `AbortError`.
 */
export async function readBag(
  source: HTMLCanvasElement,
  catalogue: readonly KnownBean[],
  onprogress: (progress: OcrProgress) => void,
  signal: AbortSignal,
): Promise<BagReading> {
  const aborted = () => new DOMException('The reading was cancelled', 'AbortError');
  if (signal.aborted) throw aborted();
  // Tesseract.js reports a failed language load only to its error handler, and the worker's
  // promise never settles: every step is raced against this one.
  let fail: (error: unknown) => void = () => undefined;
  const failed = new Promise<never>((_, reject) => (fail = reject));
  failed.catch(() => undefined);
  const abort = () => fail(aborted());
  signal.addEventListener('abort', abort, { once: true });
  /** the words of the pass being read */
  let words = statusText('recognizing text');
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  const creating = createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: ocrUrl('worker.min.js'),
    corePath: ocrUrl(''),
    langPath: ocrUrl(''),
    workerBlobURL: false,
    cacheMethod: 'none',
    gzip: true,
    errorHandler: (error: unknown) => fail(new Error(typeof error === 'string' ? error : 'the reader failed')),
    logger: (message: { status: string; progress: number }) =>
      onprogress({ status: message.status === 'recognizing text' ? words : statusText(message.status), progress: message.progress }),
  });
  try {
    const worker = await Promise.race([creating, failed]);
    await Promise.race([worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, debug_file: '/dev/null' }), failed]);
    const recognize: Recognize = async (plan) => {
      words = passWords(plan);
      onprogress({ status: words, progress: 0 });
      const canvas = turnedCanvas(source, plan.degrees, plan.long);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no canvas');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      preparePixels(pixels.data, plan.invert);
      context.putImageData(pixels, 0, 0);
      const { data } = await Promise.race([worker.recognize(canvas, {}, { blocks: true }), failed]);
      return (data.blocks ?? []).flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.map((line) => ({
            text: line.text,
            height: line.bbox.y1 - line.bbox.y0,
            confidence: line.confidence,
            box: line.bbox,
          })),
        ),
      );
    };
    const { kept } = await readPasses(recognize, catalogue);
    return { ...bagText(kept.lines, catalogue), chips: chipLines(kept.lines) };
  } finally {
    signal.removeEventListener('abort', abort);
    // a worker still loading is ended when it is ready
    void creating.then((worker) => worker.terminate()).catch(() => undefined);
  }
}
