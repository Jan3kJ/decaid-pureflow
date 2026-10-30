// The types of scripts/flavours.mjs, for vite.config.ts and the tests.
export interface Flavour {
  name: 'base' | 'ocr';
  dist: string;
  suffix: string;
  maxBytes: number;
}
export const FLAVOURS: readonly [Flavour, Flavour];
export const OCR_DESCRIPTION: string;
export function zipName(id: string, version: string, flavour: Flavour): string;
