import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODELS, fetchModels } from '../scripts/fetch-ocr-models.mjs';

// scripts/fetch-ocr-models.mjs with its download replaced: the ocr build's models are fetched once,
// kept only with their pinned SHA-256, and a wrong file or no network stops with a message.

const BYTES = Buffer.from('a model, as a fixture');
const MODEL = { name: 'det.tar', url: 'https://models.invalid/det.tar', sha256: createHash('sha256').update(BYTES).digest('hex') };

let cache: string;
afterEach(() => {
  if (cache) rmSync(cache, { recursive: true, force: true });
});

const answering = (body: Buffer, status = 200) =>
  vi.fn(() => Promise.resolve(new Response(new Uint8Array(body), { status }))) as unknown as typeof fetch;

describe('fetch-ocr-models', () => {
  it('pins the two archives of PP-OCRv6 tiny, each by its SHA-256', () => {
    expect(MODELS.map((model) => model.name)).toEqual(['PP-OCRv6_tiny_det_onnx_infer.tar', 'PP-OCRv6_tiny_rec_onnx_infer.tar']);
    for (const model of MODELS) {
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(model.url).toMatch(new RegExp(`^https://paddle-model-ecology\\.bj\\.bcebos\\.com/.*/${model.name}$`));
    }
  });

  it('downloads a model once and keeps it; a cached one is not fetched again', async () => {
    cache = mkdtempSync(join(tmpdir(), 'ocr-cache-'));
    const fetch = answering(BYTES);
    const log = () => undefined;
    expect(await fetchModels({ cache, models: [MODEL], fetch, log })).toEqual([join(cache, 'det.tar')]);
    expect(readFileSync(join(cache, 'det.tar'))).toEqual(BYTES);
    await fetchModels({ cache, models: [MODEL], fetch, log });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fetches a cached file with the wrong hash again, and keeps no download with the wrong hash', async () => {
    cache = mkdtempSync(join(tmpdir(), 'ocr-cache-'));
    writeFileSync(join(cache, 'det.tar'), 'damaged');
    const log = () => undefined;
    await expect(fetchModels({ cache, models: [MODEL], fetch: answering(Buffer.from('changed')), log })).rejects.toThrow(
      /has the SHA-256 [0-9a-f]{64}, not the pinned/,
    );
    expect(readFileSync(join(cache, 'det.tar'), 'utf8')).toBe('damaged');
    await fetchModels({ cache, models: [MODEL], fetch: answering(BYTES), log });
    expect(readFileSync(join(cache, 'det.tar'))).toEqual(BYTES);
  });

  it('stops with what to do when there is no network or the host fails', async () => {
    cache = mkdtempSync(join(tmpdir(), 'ocr-cache-'));
    const offline = vi.fn(() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    const log = () => undefined;
    await expect(fetchModels({ cache, models: [MODEL], fetch: offline, log })).rejects.toThrow(
      /could not download it from https:\/\/models\.invalid\/det\.tar \(fetch failed\).*npm run build:base/,
    );
    await expect(fetchModels({ cache, models: [MODEL], fetch: answering(BYTES, 404), log })).rejects.toThrow(/HTTP 404/);
    expect(existsSync(join(cache, 'det.tar'))).toBe(false);
  });
});
