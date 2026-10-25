// Reads a bean's name and roaster from the photo of its bag (spec 3.9 item 20) with
// Tesseract.js. Its worker, the LSTM cores and the English data are copied into the build's
// `ocr/` (vite.config.ts) and loaded from there by src/beans/read.ts. The photo is prepared
// (src/beans/prepare.ts), read at the reader's line size, plain and inverted, and turned when it
// reads as nothing upright (spec 3.14, Z2). The guess only fills empty fields; the lines read are
// offered as chips, and the user corrects it.
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

/** One read of the photo: turned clockwise by `degrees`, scaled to `long` pixels on its long side, maybe inverted. */
export interface PassPlan {
  degrees: 0 | 90 | 270;
  long: number;
  invert: boolean;
}

/** A pass and the lines it read. */
export interface Pass extends PassPlan {
  lines: OcrLine[];
}

/** Draws the photo as the plan says, prepares it and reads its lines. */
export type Recognize = (plan: PassPlan) => Promise<OcrLine[]>;

/** The long side of the first read, which measures the print's lines. */
export const MEASURE_LONG = 1200;
/** The longest side a photo is read at. */
export const LONG_MAX = 2800;
/** The reader's line height, in pixels: a read whose lines are of this size is kept as it is. */
const LINE_RANGE = { min: 30, max: 50 };
/** The line height a read at another scale aims at. */
const LINE_TARGET = 36;
/** The long sides a read is scaled to: steps of 200 pixels from 800 to `LONG_MAX`. */
const LONG_STEP = 200;
const LONG_MIN = 800;
/** At most so many lines are offered as chips. */
const CHIPS = 6;

/** A line Tesseract is sure of that reads as words: what a pass is judged and measured by. */
function sure(line: OcrLine): boolean {
  return line.confidence >= MIN_NAME_CONFIDENCE && wordy(cleanLine(line.text));
}

const letters = (text: string) => (text.match(/\p{L}/gu) ?? []).length;

/** How much a pass read: the letters of its word-like lines at confidence 60 or more. */
export function passScore(lines: readonly OcrLine[]): number {
  return lines.filter(sure).reduce((sum, line) => sum + letters(cleanLine(line.text)), 0);
}

/** The median height of a read's sure lines, 0 for none. */
export function lineHeight(lines: readonly OcrLine[]): number {
  const heights = lines
    .filter(sure)
    .map((line) => line.height)
    .sort((a, b) => a - b);
  if (!heights.length) return 0;
  const middle = heights.length >> 1;
  return heights.length % 2 ? heights[middle] : (heights[middle - 1] + heights[middle]) / 2;
}

/**
 * The long side to read at after the measuring read at `measured` pixels: the same when its lines
 * are 30 to 50 pixels high or when it read no sure line, else the one that makes them about 36,
 * in steps of 200 pixels from 800 to 2800.
 */
export function longSide(measured: number, lines: readonly OcrLine[]): number {
  const height = lineHeight(lines);
  if (!height || (height >= LINE_RANGE.min && height <= LINE_RANGE.max)) return measured;
  const long = Math.round((measured * LINE_TARGET) / height / LONG_STEP) * LONG_STEP;
  return Math.min(LONG_MAX, Math.max(LONG_MIN, long));
}

/** The words of the progress line for a pass. */
export function passWords(plan: PassPlan): string {
  if (plan.degrees) return 'Turning the photo';
  return plan.invert ? 'Reading the bag inverted' : 'Reading the bag';
}

/**
 * Reads the photo at one turn: a measuring read at 1200 pixels, again at the long side that brings
 * the lines to the reader's size if they are not, and inverted at that size; the pass that read more
 * is kept, the plain one when both read as much.
 */
async function readTurn(recognize: Recognize, degrees: PassPlan['degrees'], passes: Pass[]): Promise<Pass> {
  const read = async (plan: PassPlan) => {
    const pass = { ...plan, lines: await recognize(plan) };
    passes.push(pass);
    return pass;
  };
  const measuring = await read({ degrees, long: MEASURE_LONG, invert: false });
  const long = longSide(MEASURE_LONG, measuring.lines);
  const plain = long === MEASURE_LONG ? measuring : await read({ degrees, long, invert: false });
  const inverted = await read({ degrees, long, invert: true });
  return passScore(inverted.lines) > passScore(plain.lines) ? inverted : plain;
}

/** Whether a reading gives a name or a roaster of the catalogue: then the photo is not turned. */
function found(lines: readonly OcrLine[], catalogue: readonly KnownBean[]): boolean {
  const text = bagText(lines, catalogue);
  return text.name !== '' || (text.roaster !== '' && catalogue.some((bean) => key(bean.roaster) === key(text.roaster)));
}

/**
 * Reads the photo (spec 3.14, Z2): upright, and when that gives no roaster of the catalogue and no
 * name, turned clockwise by 90 and by 270 degrees; the turn whose pass read the most is kept,
 * upright when none read more. `passes` holds every pass in the order read.
 */
export async function readPasses(recognize: Recognize, catalogue: readonly KnownBean[]): Promise<{ kept: Pass; passes: Pass[] }> {
  const passes: Pass[] = [];
  let kept = await readTurn(recognize, 0, passes);
  if (found(kept.lines, catalogue)) return { kept, passes };
  for (const degrees of [90, 270] as const) {
    const turned = await readTurn(recognize, degrees, passes);
    if (passScore(turned.lines) > passScore(kept.lines)) kept = turned;
  }
  return { kept, passes };
}

/**
 * The chips: up to six of the lines read, cleaned and as a field gets them, in the bag's order
 * from the top; of more, the six tallest.
 */
export function chipLines(lines: readonly OcrLine[]): string[] {
  const kept = lines
    .map((line) => ({ ...line, text: cleanLine(line.text) }))
    .filter((line) => line.confidence >= MIN_CONFIDENCE && wordy(line.text) && !/\d{2,}/.test(line.text));
  const tallest = new Set([...kept].sort((a, b) => b.height - a.height).slice(0, CHIPS));
  const texts = kept
    .filter((line) => tallest.has(line))
    .sort((a, b) => a.box.y0 - b.box.y0)
    .map((line) => readable(line.text));
  return [...new Set(texts)];
}

/** What the reading does now, for the progress line. */
export interface OcrProgress {
  /** the progress line's words */
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
