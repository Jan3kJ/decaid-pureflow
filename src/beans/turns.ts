// The readings of one photo in several turns made into one list. The reader sees a canvas turned
// clockwise by the pass's turn, so its boxes are mapped back to the photo's pixels here, and each
// line says how its letters stand on the photo. Pure, so that it is tested without the reader.
import { MIN_SCORE } from './fields';
import type { BagLine, Turn } from './reading';

type Point = readonly [number, number];

/** A crop this much taller than wide is turned by 270 degrees before it is read, by the reader itself. */
const TALL_CROP = 1.5;
/** Two lines are in the same place when their overlap covers this share of the smaller box. */
const SAME_PLACE = 0.5;
/** A line in the same place as another and under this share of its area is a piece of it. */
const PIECE = 0.5;

/** A point of a canvas turned clockwise by `turn` (`width` x `height` is the canvas) as a point of the photo. */
function toPhoto([x, y]: Point, turn: 0 | 90 | 270, width: number, height: number): Point {
  if (turn === 90) return [y, width - x];
  if (turn === 270) return [height - y, x];
  return [x, y];
}

const length = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * A line the reader gave for a canvas turned clockwise by `pass`: its box in the photo's pixels and
 * its turn, the clockwise turn of the photo that stands its letters upright. That is the pass's
 * turn and, for a tall crop, the turn the reader makes itself.
 */
export function lineOf(
  item: { text: string; score: number; poly: readonly Point[] },
  pass: 0 | 90 | 270,
  width: number,
  height: number,
): BagLine {
  const [a, b, c, d] = item.poly;
  const tall = Math.max(length(a, d), length(b, c)) / Math.max(1, length(a, b), length(c, d)) >= TALL_CROP;
  const points = item.poly.map((point) => toPhoto(point, pass, width, height));
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    text: item.text.trim(),
    score: item.score,
    box: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
    turn: ((pass + (tall ? 270 : 0)) % 360) as Turn,
  };
}

const area = ({ box }: BagLine) => box.width * box.height;

function overlap(a: BagLine, b: BagLine): number {
  const width = Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x);
  const height = Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y);
  return Math.max(0, width) * Math.max(0, height);
}

const samePlace = (a: BagLine, b: BagLine) => overlap(a, b) >= SAME_PLACE * Math.min(area(a), area(b));

/** Whether a line takes the place of one read before it: a whole line beats a piece of it, else the better score. */
function beats(line: BagLine, other: BagLine): boolean {
  if (area(line) < PIECE * area(other)) return false;
  if (area(other) < PIECE * area(line)) return true;
  return line.score > other.score;
}

/**
 * The lines of a photo's passes as one list: one line in a place, the one read best, whatever a
 * wrong turn made of the same letters. A pass's own lines are different lines even where their
 * boxes overlap, so a line only meets the lines of earlier passes. Lines read less surely than the
 * guess accepts do not count. The first pass's order stays and a better line takes the place of the
 * one it beats; lines found only in a later pass follow in that pass's order.
 */
export function mergeTurns(passes: readonly (readonly BagLine[])[]): BagLine[] {
  const kept: BagLine[] = [];
  for (const pass of passes) {
    const earlier = new Set(kept);
    for (const line of pass) {
      if (line.text === '' || line.score < MIN_SCORE) continue;
      const rivals = kept.filter((other) => earlier.has(other) && samePlace(line, other));
      if (!rivals.every((other) => beats(line, other))) continue;
      if (rivals.length === 0) kept.push(line);
      else kept.splice(kept.indexOf(rivals[0]), 1, line);
      for (const other of rivals.slice(1)) kept.splice(kept.indexOf(other), 1);
    }
  }
  return kept;
}
