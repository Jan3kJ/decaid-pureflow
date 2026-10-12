import { AFLOW_VERSION, type AFlowParams } from './types';
import { paramRanges, TOGGLE_FIELDS, type NumberField } from './validate';

// Where the string is stored (profile notes or the KV store) is not decided here.

const NUMBER_FIELDS = Object.keys(paramRanges()) as NumberField[];

export type ParseResult = { ok: true; params: AFlowParams } | { ok: false; error: string };

/** Writes the parameters and the version '3.0' to a string. The key order is fixed. */
export function serializeParams(params: AFlowParams): string {
  const ordered: Record<string, number | boolean> = {};
  for (const field of NUMBER_FIELDS) ordered[field] = params[field];
  for (const field of TOGGLE_FIELDS) ordered[field] = params[field];
  return JSON.stringify({ aflow: AFLOW_VERSION, params: ordered });
}

/**
 * Reads a string written by serializeParams. It checks the version and the type of every
 * value, not the ranges (validateParams does that). Unknown keys are ignored.
 */
export function parseParams(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not JSON' };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, error: 'not an object' };

  const { aflow, params } = data as { aflow?: unknown; params?: unknown };
  if (aflow !== AFLOW_VERSION) {
    return { ok: false, error: `not A-Flow ${AFLOW_VERSION}: version ${JSON.stringify(aflow)}` };
  }
  if (typeof params !== 'object' || params === null) return { ok: false, error: 'no params' };

  const source = params as Record<string, unknown>;
  const result: Partial<Record<keyof AFlowParams, number | boolean>> = {};
  for (const field of NUMBER_FIELDS) {
    const value = source[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, error: `${field} is not a number` };
    }
    result[field] = value;
  }
  for (const field of TOGGLE_FIELDS) {
    const value = source[field];
    if (typeof value !== 'boolean') return { ok: false, error: `${field} is not true or false` };
    result[field] = value;
  }
  return { ok: true, params: result as unknown as AFlowParams };
}
