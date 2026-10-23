// Reads a bean's name and roaster from the photo of its bag (spec 3.9 item 20) with
// Tesseract.js. Its worker, the LSTM cores and the English data are copied into the build's
// `ocr/` (vite.config.ts) and loaded from there, never from the network. The guess only fills
// empty fields; the user corrects it.

/** A line Tesseract read: its text, its height in pixels and its confidence (0 to 100). */
export interface OcrLine {
  text: string;
  height: number;
  confidence: number;
}

/** The guess: '' where nothing fits. */
export interface BagText {
  name: string;
  roaster: string;
}

/** Below it a line is noise. */
const MIN_CONFIDENCE = 50;
/** Words that name a roaster on a bag. */
const ROASTER_WORDS =
  /\b(roasters?|roastery|roasting|roastworks|röster(?:ei)?|rösterei|kaffeerösterei|torrefaz\w*|torréfaction|brûlerie|coffee (?:co|company))\b/i;
/** Lines that are a bag's details, not a name. */
const DETAIL_WORDS =
  /\b(net|wt|weight|whole ?beans?|ground|roast(?:ed)? (?:on|date)|best before|mhd|origin|process(?:ed|ing)?|washed|natural|honey|variet(?:y|ies)|altitude|masl|producer|farm|region|notes?|tasting|flavou?r|cupping|score|espresso|filter|omni|light|medium|dark|batch|lot|www|http|\.com|\.de|@)\b/i;

/** A line cleaned of the marks Tesseract reads into a print: kept letters, digits and the usual punctuation. */
export function cleanLine(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}&'’.,\-/ ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-.,/']+|[\s\-.,/']+$/g, '')
    .trim();
}

function wordy(text: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return letters >= 3 && letters / text.replace(/ /g, '').length >= 0.6;
}

/** Title case for a line printed in capitals; other lines stay as printed. */
function readable(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s\-/&'])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/**
 * The name and the roaster from a bag's lines. The roaster is the line with a roaster's word
 * (Roasters, Rösterei, Coffee Co …), else the topmost line; the name is the tallest of the others.
 * Weights, dates, origins, tasting notes and addresses are left out.
 */
export function bagText(lines: readonly OcrLine[]): BagText {
  const kept = lines
    .filter((line) => line.confidence >= MIN_CONFIDENCE)
    .map((line) => ({ ...line, text: cleanLine(line.text) }))
    .filter((line) => wordy(line.text) && !/\d{2,}/.test(line.text));
  const named = kept.find((line) => ROASTER_WORDS.test(line.text));
  const candidates = kept.filter((line) => line !== named && !DETAIL_WORDS.test(line.text));
  const roaster = named ?? (candidates.length > 1 ? candidates[0] : undefined);
  const others = candidates.filter((line) => line !== roaster);
  const name = others.reduce<OcrLine | undefined>(
    (tallest, line) => (!tallest || line.height > tallest.height ? line : tallest),
    undefined,
  );
  return { name: name ? readable(name.text) : '', roaster: roaster ? readable(roaster.text) : '' };
}

/** What the reading does now, for the progress line. */
export interface OcrProgress {
  status: string;
  /** 0 to 1 */
  progress: number;
}

const STATUS_WORDS: Record<string, string> = {
  'loading tesseract core': 'Loading the reader',
  'initializing tesseract': 'Loading the reader',
  'loading language traineddata': 'Loading the English data',
  'initializing api': 'Loading the reader',
  'recognizing text': 'Reading the bag',
};

/** The progress line's words for one of Tesseract's statuses. */
export function statusText(status: string): string {
  return STATUS_WORDS[status] ?? 'Reading the bag';
}

/** Where the reader's files are: the build's `ocr/`, beside index.html. */
function ocrUrl(file: string): string {
  return new URL(`./ocr/${file}`, document.baseURI).href;
}

/**
 * Reads the lines of a photo. `signal` stops it: the worker is ended and the promise rejects
 * with an `AbortError`.
 */
export async function readBag(photo: string, onprogress: (progress: OcrProgress) => void, signal: AbortSignal): Promise<BagText> {
  const aborted = () => new DOMException('The reading was cancelled', 'AbortError');
  if (signal.aborted) throw aborted();
  // Tesseract.js reports a failed language load only to its error handler, and the worker's
  // promise never settles: every step is raced against this one.
  let fail: (error: unknown) => void = () => undefined;
  const failed = new Promise<never>((_, reject) => (fail = reject));
  failed.catch(() => undefined);
  const abort = () => fail(aborted());
  signal.addEventListener('abort', abort, { once: true });
  const { createWorker, OEM, PSM } = await import('tesseract.js');
  const creating = createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: ocrUrl('worker.min.js'),
    corePath: ocrUrl(''),
    langPath: ocrUrl(''),
    workerBlobURL: false,
    cacheMethod: 'none',
    gzip: true,
    errorHandler: (error: unknown) => fail(new Error(typeof error === 'string' ? error : 'the reader failed')),
    logger: (message: { status: string; progress: number }) => onprogress({ status: message.status, progress: message.progress }),
  });
  try {
    const worker = await Promise.race([creating, failed]);
    await Promise.race([worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, debug_file: '/dev/null' }), failed]);
    const { data } = await Promise.race([worker.recognize(photo, {}, { blocks: true }), failed]);
    const lines: OcrLine[] = (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.map((line) => ({ text: line.text, height: line.bbox.y1 - line.bbox.y0, confidence: line.confidence })),
      ),
    );
    return bagText(lines);
  } finally {
    signal.removeEventListener('abort', abort);
    // a worker still loading is ended when it is ready
    void creating.then((worker) => worker.terminate()).catch(() => undefined);
  }
}
