// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
// src/modules/firmware-progress.js (splitNdjson).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The framing of a newline-delimited JSON stream: a chunk ends anywhere, so the caller keeps
// what follows the last newline until the next chunk.

/**
 * Cuts one decoded chunk into whole lines. `buffer` is what the last call returned as `rest`
 * ('' to start); `atEnd` flushes an unterminated last line. A line that is not JSON is dropped:
 * a firmware upload is not worth aborting over one.
 */
export function splitNdjson<T>(buffer: string, chunk: string, atEnd = false): { events: T[]; rest: string } {
  const lines = (buffer + chunk).split('\n');
  const rest = atEnd ? '' : (lines.pop() ?? '');
  const events: T[] = [];
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    try {
      events.push(JSON.parse(text) as T);
    } catch {
      // dropped, as Streamline drops it
    }
  }
  return { events, rest };
}

/** Gives every line of a response body to `take` as it arrives. */
export async function readNdjson<T>(response: Response, take: (event: T) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    splitNdjson<T>('', await response.text(), true).events.forEach(take);
    return;
  }
  const decoder = new TextDecoder();
  let rest = '';
  for (;;) {
    const { value, done } = await reader.read();
    const cut = splitNdjson<T>(rest, done ? decoder.decode() : decoder.decode(value, { stream: true }), done);
    rest = cut.rest;
    cut.events.forEach(take);
    if (done) break;
  }
}
