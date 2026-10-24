// Reads a bean's name and roaster from the photo of its bag (spec 3.9 item 20) with
// Tesseract.js. Its worker, the LSTM cores and the English data are copied into the build's
// `ocr/` (vite.config.ts) and loaded from there, never from the network. The guess only fills
// empty fields; the user corrects it.
import type { CatalogueBean } from '../api';

/** A line Tesseract read: its text, its height and box in pixels and its confidence (0 to 100). */
export interface OcrLine {
  text: string;
  height: number;
  confidence: number;
  box: { x0: number; y0: number; x1: number; y1: number };
}

/** What the catalogue knows of a bean that helps to read a bag: its roaster, name and country. */
export type KnownBean = Pick<CatalogueBean, 'roaster' | 'name' | 'country'>;

/** The guess: '' where nothing fits. */
export interface BagText {
  name: string;
  roaster: string;
}

/** Below it a line is noise. */
const MIN_CONFIDENCE = 50;
/** A name is read surely or not at all. */
const MIN_NAME_CONFIDENCE = 60;
/** A line directly under the roaster and smaller than this share of its height is its descriptor. */
const DESCRIPTOR_SHARE = 0.6;
/** A name is at least this share of the tallest line's height: the small print is not one. */
const MIN_NAME_SHARE = 0.4;
/** Words that name a roaster on a bag. */
const ROASTER_WORDS =
  /\b(roasters?|roastery|roasting|roastworks|röster(?:ei)?|rösterei|kaffeerösterei|torrefaz\w*|torréfaction|brûlerie|coffee (?:co|company))\b/i;
/** Lines that are a bag's details, not a name. */
const DETAIL_WORDS =
  /\b(net|wt|weight|whole ?beans?|ground|roast(?:ed)? (?:on|date)|best before|mhd|origin|process(?:ed|ing)?|washed|natural|variet(?:y|ies)|altitude|masl|producer|farm|region|notes?|tasting|flavou?r|cupping|score|espresso|filter|omni|light|medium|dark|batch|lot|www|http|\.com|\.de|@)\b/i;
/** The marks between the words of a tasting line: a full stop, a dot or a comma after a word, a spaced dash or dot. */
const TASTING_MARKS = /\p{L}[.,·•]|\s[-–·•+«»]\s/gu;

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

/** Most of the words have three letters or more: '2 ame' has not. */
function namelike(text: string): boolean {
  const words = text.split(' ');
  return words.filter((word) => (word.match(/\p{L}/gu) ?? []).length >= 3).length * 2 > words.length;
}

/** Words joined by full stops or dots, as tasting notes are printed: 'Haselnuss. Kakao. Nougat.' */
function tasting(printed: string): boolean {
  return (printed.trim().match(TASTING_MARKS) ?? []).length >= 2;
}

/**
 * A roaster's word and nothing else of more than two letters but 'Coffee' (or a misreading of it):
 * 'Coffee Roasters', 'COFFeg ROASTERS', 'Roastery'.
 */
function descriptor(text: string): boolean {
  if (!ROASTER_WORDS.test(text)) return false;
  return text
    .replace(new RegExp(ROASTER_WORDS.source, 'gi'), ' ')
    .split(/[^\p{L}]+/u)
    .every((word) => word.length <= 2 || ['coffee', 'kaffee'].some((coffee) => editDistance(key(word), coffee) <= 1));
}

/** Title case for a line printed in capitals; other lines stay as printed. */
function readable(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s\-/&'])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** Letters and digits only, in lower case: what two spellings of a name are compared by. */
function key(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/**
 * Whether a line reads as a known name: the whole line, or as many of its words in a row as the
 * name has, within an edit distance of 1 for a name of 5 to 7 letters and 2 for 8 or more.
 */
function reads(text: string, known: string): boolean {
  const target = key(known);
  if (!target) return false;
  const allowed = target.length >= 8 ? 2 : target.length >= 5 ? 1 : 0;
  const words = text.split(' ');
  const span = known.trim().split(/\s+/).length;
  const tries = [
    text,
    ...words.slice(0, Math.max(1, words.length - span + 1)).map((_, index) => words.slice(index, index + span).join(' ')),
  ];
  return tries.some((tried) => editDistance(key(tried), target) <= allowed);
}

/** A line as read and as cleaned. */
interface Read extends OcrLine {
  printed: string;
}

function overlaps(a: Read, b: Read): boolean {
  return a.box.x0 < b.box.x1 && b.box.x0 < a.box.x1;
}

/** The nearest line above `line` that shares some of its width. */
function above(line: Read, lines: readonly Read[]): Read | undefined {
  const middle = (line.box.y0 + line.box.y1) / 2;
  return lines
    .filter((other) => other !== line && other.box.y1 <= middle && overlaps(other, line))
    .reduce<Read | undefined>((nearest, other) => (!nearest || other.box.y1 > nearest.box.y1 ? other : nearest), undefined);
}

/** A small line right under the roaster: its descriptor ('KAFFEEHAUS ESPRESSO' under 'maldaner'). */
function under(line: Read, roaster: Read): boolean {
  return (
    line !== roaster &&
    overlaps(line, roaster) &&
    line.height < roaster.height * DESCRIPTOR_SHARE &&
    line.box.y0 >= roaster.box.y1 - roaster.height / 2 &&
    line.box.y0 <= roaster.box.y1 + roaster.height
  );
}

function tallest(lines: readonly Read[]): Read | undefined {
  return lines.reduce<Read | undefined>((top, line) => (!top || line.height > top.height ? line : top), undefined);
}

/**
 * The name and the roaster from a bag's lines (spec 3.14, Z1). The roaster is a line that reads
 * as a roaster of the catalogue, else a line with a roaster's word (Roasters, Rösterei …) and
 * more, else the line above a descriptor that is only such a word ('Coffee Roasters'), else the
 * topmost line. The name is a bean of that roaster in the catalogue when a line reads as one,
 * else the tallest line that is word-like and read surely, not the roaster or a small line right
 * under it. Weights, dates, origins, countries of the catalogue, tasting notes and addresses are
 * left out; a field that no line passes for stays empty.
 */
export function bagText(lines: readonly OcrLine[], catalogue: readonly KnownBean[] = []): BagText {
  const all: Read[] = lines
    .map((line) => ({ ...line, printed: line.text, text: cleanLine(line.text) }))
    .sort((a, b) => a.box.y0 - b.box.y0);
  const kept = all.filter((line) => line.confidence >= MIN_CONFIDENCE && wordy(line.text) && !/\d{2,}/.test(line.text));
  const roasters = [...new Set(catalogue.map((bean) => bean.roaster.trim()).filter(Boolean))];
  const countries = [...new Set(catalogue.map((bean) => bean.country?.trim() ?? '').filter(Boolean))];

  const descriptors = new Set(kept.filter((line) => descriptor(line.text)));
  const match = all.map((line) => ({ line, name: roasters.find((name) => reads(line.text, name)) })).find(({ name }) => name);
  const known = match?.name ?? '';
  let roaster = match?.line;
  roaster ??= kept.find((line) => ROASTER_WORDS.test(line.text) && !descriptors.has(line));
  roaster ??= [...descriptors].map((line) => above(line, kept)).find((line) => line && !descriptors.has(line));
  if (roaster) for (const line of kept) if (under(line, roaster)) descriptors.add(line);

  const candidates = kept.filter(
    (line) =>
      line !== roaster &&
      !descriptors.has(line) &&
      !DETAIL_WORDS.test(line.text) &&
      !tasting(line.printed) &&
      !countries.some((country) => reads(line.text, country)),
  );
  if (!roaster && candidates.length > 1) roaster = candidates[0];
  const smallest = (tallest(kept)?.height ?? 0) * MIN_NAME_SHARE;
  const names = candidates.filter(
    (line) => line !== roaster && line.confidence >= MIN_NAME_CONFIDENCE && namelike(line.text) && line.height >= smallest,
  );

  const roasterText = known || (roaster ? readable(roaster.text) : '');
  const beans = catalogue.filter((bean) => roasterText !== '' && key(bean.roaster) === key(roasterText));
  const bean = kept
    .filter((line) => line !== roaster && !descriptors.has(line))
    .map((line) => beans.find((candidate) => reads(line.text, candidate.name)))
    .find(Boolean);
  const name = tallest(names);
  return { name: bean?.name ?? (name ? readable(name.text) : ''), roaster: roasterText };
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
 * Reads the lines of a photo; the catalogue's beans help to read them. `signal` stops it: the
 * worker is ended and the promise rejects with an `AbortError`.
 */
export async function readBag(
  photo: string,
  catalogue: readonly KnownBean[],
  onprogress: (progress: OcrProgress) => void,
  signal: AbortSignal,
): Promise<BagText> {
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
        paragraph.lines.map((line) => ({
          text: line.text,
          height: line.bbox.y1 - line.bbox.y0,
          confidence: line.confidence,
          box: line.bbox,
        })),
      ),
    );
    return bagText(lines, catalogue);
  } finally {
    signal.removeEventListener('abort', abort);
    // a worker still loading is ended when it is ready
    void creating.then((worker) => worker.terminate()).catch(() => undefined);
  }
}
