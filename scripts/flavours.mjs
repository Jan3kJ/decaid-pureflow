// The skin's two builds of one source, in one place for vite.config.ts, scripts/zip.mjs and the
// release script: base (no bag reading) and ocr (the same and the reading of the bean bag).

/** Each flavour: its build folder, the end of its ZIP's name, the largest ZIP it may make (bytes). */
export const FLAVOURS = [
  { name: 'base', dist: 'dist', suffix: '', maxBytes: 1_000_000 },
  { name: 'ocr', dist: 'dist-ocr', suffix: '-ocr', maxBytes: 16_000_000 },
];

/** The ocr ZIP's manifest description ends with this; the id and version are the base one's. */
export const OCR_DESCRIPTION = ' With bag reading.';

/** The ZIP's file name of a flavour: `<id>.zip`, `<id>-ocr.zip`. The version is in the tag and in the manifest inside the ZIP. */
export const zipName = (id, flavour) => `${id}${flavour.suffix}.zip`;
