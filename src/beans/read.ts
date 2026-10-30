// The bag's reader of the ocr flavour, loaded only through readPhoto in ./reading. It reads no
// line yet: it stands in for the reader, so that the flag and the two builds can be tested.
import type { BagLine } from './reading';

/** The lines read on a stored photo (a data URL). */
export function readBag(photo: string): Promise<BagLine[]> {
  void photo;
  return Promise.resolve([]);
}
