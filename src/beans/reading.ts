// The reading of the bean bag's photo, in the ocr flavour only. `__OCR__` is a build constant: in
// the base build the branch is false, and the bundler leaves out ./read and all it imports.

/** A line read on the bag: its text, the reader's score from 0 to 1, its box in the photo's pixels. */
export interface BagLine {
  text: string;
  score: number;
  box: { x: number; y: number; width: number; height: number };
}

/** The lines read on a stored photo (a data URL); none in the base flavour. */
export async function readPhoto(photo: string): Promise<BagLine[]> {
  if (__OCR__) {
    const { readBag } = await import('./read');
    return readBag(photo);
  }
  return [];
}
