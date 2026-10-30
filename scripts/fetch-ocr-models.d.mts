// The types of scripts/fetch-ocr-models.mjs, for vite.config.ts and the tests.
export interface Model {
  name: string;
  url: string;
  sha256: string;
}
export const MODELS: readonly Model[];
export const CACHE: string;
export const NOTICE_SECTION: string;
export function fetchModels(options?: {
  cache?: string;
  models?: readonly Model[];
  fetch?: typeof globalThis.fetch;
  log?: (line: string) => void;
}): Promise<string[]>;
