import { describe, expect, it } from 'vitest';
import { readNdjson, splitNdjson } from './ndjson';

describe("splitNdjson (Streamline's framing of the firmware stream)", () => {
  it('keeps a line that is cut by the chunk until the next one', () => {
    const first = splitNdjson<{ n: number }>('', '{"n":1}\n{"n"');
    expect(first).toEqual({ events: [{ n: 1 }], rest: '{"n"' });
    const second = splitNdjson<{ n: number }>(first.rest, ':2}\n');
    expect(second).toEqual({ events: [{ n: 2 }], rest: '' });
  });

  it('drops blank and malformed lines and flushes the last line at the end', () => {
    expect(splitNdjson('', '\n  \nnot json\n{"n":3}\n{"n":4}', true)).toEqual({ events: [{ n: 3 }, { n: 4 }], rest: '' });
    expect(splitNdjson('', '{"n":3}\n{"n":4}').rest).toBe('{"n":4}');
  });
});

describe('readNdjson', () => {
  it('reads a body that arrives in pieces', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of ['{"status":"era', 'sing"}\n{"status":"up', 'loading","progress":0.5}\n{"status":"done"}'])
          controller.enqueue(encoder.encode(piece));
        controller.close();
      },
    });
    const seen: unknown[] = [];
    await readNdjson(new Response(body), (event) => seen.push(event));
    expect(seen).toEqual([{ status: 'erasing' }, { status: 'uploading', progress: 0.5 }, { status: 'done' }]);
  });
});
