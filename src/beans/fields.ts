// The bean's name and roaster told apart in the lines read on a bag's photo. The reader gives
// lines, not fields: these rules order the lines as chips for the bean form, the guessed name first
// and the guessed roaster second, and fill nothing in themselves.
import type { BagLine } from './reading';

/** Lines read less surely than this are left out. */
const MIN_SCORE = 0.5;
/** A line right after a taller one and smaller than this share of its height is that line's descriptor. */
const DESCRIPTOR_SHARE = 0.75;
/** A roaster's word: 'Coffee Roasters' printed under or beside the roaster's own name. */
const ROASTER_WORDS = ['coffeeroasters', 'roasters', 'roastery', 'kaffeerösterei', 'rösterei'];
/** Countries printed as the origin, in German and English; the catalogue's are added. */
const COUNTRIES = [
  ...['Äthiopien', 'Ethiopia', 'Brasilien', 'Brazil', 'Burundi', 'Bolivien', 'Bolivia', 'China', 'Costa Rica', 'Ecuador'],
  ...['El Salvador', 'Guatemala', 'Honduras', 'Indien', 'India', 'Indonesien', 'Indonesia', 'Jamaika', 'Jamaica', 'Jemen'],
  ...['Yemen', 'Kenia', 'Kenya', 'Kolumbien', 'Colombia', 'Kongo', 'Congo', 'Mexiko', 'Mexico', 'Myanmar', 'Nicaragua'],
  ...['Panama', 'Papua-Neuguinea', 'Papua New Guinea', 'Peru', 'Ruanda', 'Rwanda', 'Tansania', 'Tanzania', 'Uganda', 'Vietnam'],
];

/** The guess and the chips: the guessed name first, the guessed roaster second, then the other lines. */
export interface BagFields {
  name: string;
  roaster: string;
  chips: string[];
}

interface Line extends BagLine {
  /** the height of its letters: the box's short side, so that a turned line counts too */
  size: number;
  /** a line turned on its side: its top points to the right of the photo */
  turned: boolean;
}

/** Letters and digits only, in lower case: what two spellings are compared by. */
const key = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** A line that reads as `known`: one wrong letter in 5 to 7, two in 8 or more. */
function reads(text: string, known: string): boolean {
  const target = key(known);
  const allowed = target.length >= 8 ? 2 : target.length >= 5 ? 1 : 0;
  return target !== '' && distance(key(text), target) <= allowed;
}

/** Words joined by full stops or dots, as tasting notes are printed: 'Haselnuss. Kakao. Nougat'. */
const tasting = (text: string) => (text.match(/\p{L}\s*[.,·•]\s*(?=\p{L})/gu) ?? []).length >= 2;

/** Title case for a line printed all in capitals or all in small letters; others stay as printed. */
export function titleCase(text: string): string {
  if (text !== text.toUpperCase() && text !== text.toLowerCase()) return text;
  return text.toLowerCase().replace(/(^|[\s\-/&'])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** Where a line starts and ends across its letters (y for an upright line, x from the right for a turned one), and along them. */
function across(line: Line): [number, number] {
  const { x, y, width, height } = line.box;
  return line.turned ? [-(x + width), -x] : [y, y + height];
}

function along(line: Line): [number, number] {
  const { x, y, width, height } = line.box;
  return line.turned ? [y, y + height] : [x, x + width];
}

/** The gap from `first` to `next` across the letters, when `next` follows it and they share some of their length. */
function gap(first: Line, next: Line): number | null {
  if (first === next || first.turned !== next.turned) return null;
  const [a0, a1] = along(first);
  const [b0, b1] = along(next);
  if (a1 <= b0 || b1 <= a0) return null;
  const [, end] = across(first);
  const [start, nextEnd] = across(next);
  return nextEnd > end ? start - end : null;
}

/**
 * The nearest line among `lines` right after `line` (after: true), right before it (false) or on
 * either side (undefined); a line more than twice the taller one's height away is not next to it.
 */
function neighbour(line: Line, lines: readonly Line[], after?: boolean): Line | undefined {
  let nearest: Line | undefined;
  let best = Infinity;
  for (const other of lines) {
    const between = (after !== false ? gap(line, other) : null) ?? (after !== true ? gap(other, line) : null);
    if (between !== null && between < best && between < Math.max(line.size, other.size) * 2) [nearest, best] = [other, between];
  }
  return nearest;
}

/**
 * The guessed name and roaster of a bag and its lines as chips. The roaster is a line that reads as
 * a roaster of the catalogue, else the line next to a 'Coffee Roasters' line, else the line right
 * above the name, else the one right below it. The name is the tallest other line, leaving out a
 * small line right under a taller one, tasting lines and countries. The chips leave out the
 * 'Coffee Roasters' lines, tasting lines and countries; every chip is in title case.
 */
export function bagFields(read: readonly BagLine[], roasters: readonly string[] = [], countries: readonly string[] = []): BagFields {
  const lines: Line[] = read
    .filter((line) => line.score >= MIN_SCORE && (line.text.match(/\p{L}/gu) ?? []).length >= 2)
    .map((line) => ({
      ...line,
      size: Math.min(line.box.width, line.box.height),
      turned: line.box.height > line.box.width * 1.5 && line.text.length > 2,
    }));
  const places = [...COUNTRIES, ...countries];
  const roasterWords = new Set(lines.filter((line) => ROASTER_WORDS.some((word) => reads(line.text, word))));
  const offered = lines.filter(
    (line) =>
      !roasterWords.has(line) && !tasting(line.text) && !places.some((place) => key(place) !== '' && key(line.text) === key(place)),
  );
  const descriptors = new Set(
    offered.filter((line) => {
      const before = neighbour(line, lines, false);
      return before !== undefined && line.size < before.size * DESCRIPTOR_SHARE;
    }),
  );

  const known = roasters.find((roaster) => offered.some((line) => reads(line.text, roaster)));
  let roaster = known ? offered.find((line) => reads(line.text, known)) : undefined;
  for (const words of roasterWords) roaster ??= neighbour(words, offered);
  const names = offered.filter((line) => line !== roaster && !descriptors.has(line));
  const name = names.reduce<Line | undefined>((top, line) => (!top || line.size > top.size ? line : top), undefined);
  if (name && !roaster) {
    const others = offered.filter((line) => line !== name);
    roaster =
      neighbour(
        name,
        others.filter((line) => !descriptors.has(line)),
        false,
      ) ?? neighbour(name, others, true);
  }

  const guess = { name: name ? titleCase(name.text) : '', roaster: known ?? (roaster ? titleCase(roaster.text) : '') };
  const rest = offered.filter((line) => line !== name && line !== roaster).map((line) => titleCase(line.text));
  return { ...guess, chips: [...new Set([guess.name, guess.roaster, ...rest].filter((chip) => chip !== ''))] };
}
