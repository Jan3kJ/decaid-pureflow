import { describe, expect, it } from 'vitest';
import { readShotState, type ShotStateFrame } from '../api';
import { abnormalText, SCALE_LOST_NOTICE, ShotWarnings } from './shot-warnings.svelte';

// The notice for a scale lost while a shot with a target weight pours, and the popup for an
// abnormal end: each once per shot, from the frames of Decaid's shot feed as the rig sent them.

function frame(change: Record<string, unknown> = {}): ShotStateFrame {
  return readShotState({
    event: 'decision',
    shotId: 'shot-1',
    state: 'pouring',
    scaleConnected: false,
    scaleLost: true,
    machineHasAutonomousSAW: false,
    decision: { kind: 'advance', reason: 'profileAdvance', details: 'Firmware advanced from frame 4 to 5', data: null },
    ...change,
  })!;
}

const terminal = (reason: string, details: string | null = null, shotId = 'shot-1') =>
  frame({ event: 'terminal', shotId, scaleLost: false, decision: { kind: 'terminal', reason, details, data: null } });

describe('the notice that the scale was lost', () => {
  it('shows while a shot with a target weight pours, and stays when the scale comes back', () => {
    const warnings = new ShotWarnings();
    warnings.frame(frame({ scaleLost: false }), 36);
    expect(warnings.scaleLost).toBe(false);
    warnings.frame(frame(), 36);
    expect(warnings.scaleLost).toBe(true);
    // Decaid keeps scaleLost to the shot's end; the scale back changes nothing.
    warnings.frame(frame({ scaleConnected: true }), 36);
    warnings.frame(frame({ event: 'state', state: 'stopping', decision: null }), 36);
    expect(warnings.scaleLost).toBe(true);
    expect(SCALE_LOST_NOTICE).toBe('The scale was lost: stop at weight is off for the rest of this shot. Stop it by hand.');
  });

  it("goes when the shot ends, by the feed or by the skin's own shot, and comes once per shot", () => {
    const warnings = new ShotWarnings();
    warnings.frame(frame(), 36);
    warnings.frame(frame({ state: 'finished', decision: { kind: 'stop', reason: 'apiStop', details: null, data: null } }), 36);
    expect(warnings.scaleLost).toBe(false);
    // A later frame of the same shot that still says it: not again.
    warnings.frame(frame(), 36);
    expect(warnings.scaleLost).toBe(false);

    warnings.frame(frame({ shotId: 'shot-2' }), 36);
    expect(warnings.scaleLost).toBe(true);
    warnings.shotEnded();
    expect(warnings.scaleLost).toBe(false);

    warnings.frame(frame({ shotId: 'shot-3' }), 36);
    warnings.frame(frame({ event: 'state', shotId: null, state: 'idle', scaleLost: false, decision: null }), 36);
    expect(warnings.scaleLost).toBe(false);
  });

  it('a frame of another shot ends it', () => {
    const warnings = new ShotWarnings();
    warnings.frame(frame(), 36);
    warnings.frame(frame({ event: 'state', shotId: 'shot-2', state: 'preheating', scaleLost: false, decision: null }), 36);
    expect(warnings.scaleLost).toBe(false);
  });

  it('is not shown without a target weight, on a Bengle, or outside the pour', () => {
    for (const yieldGrams of [0, null, undefined]) {
      const warnings = new ShotWarnings();
      warnings.frame(frame(), yieldGrams);
      expect(warnings.scaleLost, String(yieldGrams)).toBe(false);
    }
    const warnings = new ShotWarnings();
    warnings.frame(frame({ machineHasAutonomousSAW: true }), 36);
    warnings.frame(frame({ state: 'finished' }), 36);
    warnings.frame(frame({ state: 'preheating' }), 36);
    expect(warnings.scaleLost).toBe(false);
  });
});

describe('the popup for an abnormal end', () => {
  it("says Decaid's words, once per shot, and closes", () => {
    const warnings = new ShotWarnings();
    warnings.frame(terminal('disconnected', 'Shot tracking torn down mid-shot'), 36);
    expect(warnings.abnormal).toBe('The shot ended abnormally: Shot tracking torn down mid-shot.');
    warnings.closeAbnormal();
    expect(warnings.abnormal).toBeNull();
    warnings.frame(terminal('disconnected', 'Shot tracking torn down mid-shot'), 36);
    expect(warnings.abnormal).toBeNull();
    warnings.frame(terminal('error', 'Machine fault', 'shot-2'), 36);
    expect(warnings.abnormal).toBe('The shot ended abnormally: Machine fault.');
  });

  it('ends the notice that the scale was lost', () => {
    const warnings = new ShotWarnings();
    warnings.frame(frame(), 36);
    warnings.frame(terminal('error'), 36);
    expect(warnings.scaleLost).toBe(false);
    expect(warnings.abnormal).toBe('The shot ended abnormally.');
  });

  it('is not shown for a stop, an abort or an advance', () => {
    const warnings = new ShotWarnings();
    for (const [kind, reason] of [
      ['stop', 'apiStop'],
      ['abort', 'noScale'],
      ['advance', 'profileAdvance'],
      ['finalize', 'stoppingBackstop'],
    ]) {
      warnings.frame(frame({ scaleLost: false, decision: { kind, reason, details: null, data: null } }), 36);
    }
    expect(warnings.abnormal).toBeNull();
  });
});

describe("the popup's sentence", () => {
  it("takes Decaid's words with one full stop, else the reason's", () => {
    expect(abnormalText({ reason: 'error', details: 'Something broke' })).toBe('The shot ended abnormally: Something broke.');
    expect(abnormalText({ reason: 'error', details: 'Something broke.' })).toBe('The shot ended abnormally: Something broke.');
    expect(abnormalText({ reason: 'disconnected', details: null })).toBe(
      "The shot ended abnormally: the machine's connection was lost.",
    );
    expect(abnormalText({ reason: 'error', details: null })).toBe('The shot ended abnormally.');
  });
});
