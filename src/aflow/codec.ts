import { PAUSE_EXIT_FLOW_UNDER } from './constants';
import { AFLOW_VERSION, type AFlowParams } from './types';
import {
  isFollowField,
  paramRanges,
  TOGGLE_FIELDS,
  type FollowField,
  type NumberField,
} from './validate';

// Where the values are stored (a record's `metadata`, a profile's `notes`) is decided in
// src/editor/storage.ts, not here.

const VALUE_FIELDS = Object.keys(paramRanges()) as (NumberField | FollowField)[];

/**
 * Values that came after the first saved 3.0 strings. A string without one reads as the value
 * the generator had fixed, so it generates the steps it did; the version stays '3.0'.
 */
const ADDED_FIELDS: Partial<Record<NumberField | FollowField, number>> = {
  // founder, 2026-10-13: the pause ends at a flow under an editable value
  pauseExitFlow: PAUSE_EXIT_FLOW_UNDER,
};

export type ParseResult = { ok: true; params: AFlowParams } | { ok: false; error: string };

/** The parameters and the version '3.0' as an object, `{ aflow, params }`. The key order is fixed. */
export function encodeParams(params: AFlowParams): { aflow: string; params: Record<string, number | boolean | null> } {
  const ordered: Record<string, number | boolean | null> = {};
  for (const field of VALUE_FIELDS) ordered[field] = params[field];
  for (const field of TOGGLE_FIELDS) ordered[field] = params[field];
  return { aflow: AFLOW_VERSION, params: ordered };
}

/** Writes the parameters and the version '3.0' to a string (`encodeParams`). */
export function serializeParams(params: AFlowParams): string {
  return JSON.stringify(encodeParams(params));
}

/** Reads a string written by serializeParams (`decodeParams`). */
export function parseParams(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not JSON' };
  }
  return decodeParams(data);
}

/**
 * Reads an object written by encodeParams. It checks the version and the type of every
 * value, not the ranges (validateParams does that). Every key must be there, except those of
 * ADDED_FIELDS: a value that follows another one is written as null. Unknown keys are ignored,
 * so an object with other keys beside `aflow` and `params` (a record's metadata) reads too.
 */
export function decodeParams(data: unknown): ParseResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, error: 'not an object' };

  const { aflow, params } = data as { aflow?: unknown; params?: unknown };
  if (aflow !== AFLOW_VERSION) {
    return { ok: false, error: `not A-Flow ${AFLOW_VERSION}: version ${JSON.stringify(aflow)}` };
  }
  if (typeof params !== 'object' || params === null) return { ok: false, error: 'no params' };

  const source = params as Record<string, unknown>;
  const result: Partial<Record<keyof AFlowParams, number | boolean | null>> = {};
  for (const field of VALUE_FIELDS) {
    const value = field in source ? source[field] : ADDED_FIELDS[field];
    if (value === null && isFollowField(field)) {
      result[field] = null;
    } else if (typeof value !== 'number' || !Number.isFinite(value)) {
      return {
        ok: false,
        error: `${field} is not a number${isFollowField(field) ? ' or null' : ''}`,
      };
    } else {
      result[field] = value;
    }
  }
  for (const field of TOGGLE_FIELDS) {
    const value = source[field];
    if (typeof value !== 'boolean') return { ok: false, error: `${field} is not true or false` };
    result[field] = value;
  }
  return { ok: true, params: result as unknown as AFlowParams };
}
