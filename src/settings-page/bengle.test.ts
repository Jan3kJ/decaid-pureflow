import { describe, expect, it } from 'vitest';
import { calibrationBusy, clampWhole, feedbackText, fromInputColour, isBengle, matReading, toInputColour, validGrams } from './bengle';

describe('the Bengle pages (research.md 31)', () => {
  it('shows only for a model that names a Bengle', () => {
    expect(isBengle('Bengle')).toBe(true);
    expect(isBengle('DE1 Bengle Pro')).toBe(true);
    expect(isBengle('DE1Pro')).toBe(false);
    expect(isBengle(undefined)).toBe(false);
    expect(isBengle(null)).toBe(false);
  });

  it('keeps the cup warmer in whole degrees and the pre-warm in whole minutes', () => {
    expect(clampWhole(61.6, 80)).toBe(62);
    expect(clampWhole(95, 80)).toBe(80);
    expect(clampWhole(-3, 80)).toBe(0);
    expect(clampWhole(Number.NaN, 120)).toBe(0);
  });

  it('reads a missing mat temperature as no reading, not as 0', () => {
    expect(matReading(41.25)).toBe('41.3 °C');
    expect(matReading(0)).toBe('0.0 °C');
    expect(matReading(null)).toBe('No reading');
  });

  it("converts a strip's 12 digits to the colour input and back", () => {
    expect(toInputColour('ffff80800000')).toBe('#ff8000');
    expect(fromInputColour('#ff8000')).toBe('ffff80800000');
    expect(fromInputColour(toInputColour('1234abcd5678'))).toBe('1212abab5656');
    expect(toInputColour('nonsense')).toBe('#000000');
    expect(fromInputColour('red')).toBe('000000000000');
  });

  it('takes a known mass of 1 to 10000 g for the latch', () => {
    expect([0.5, 1, 500.5, 10000, 10001, Number.NaN].map(validGrams)).toEqual([false, true, true, true, false, false]);
  });

  it('is busy while a calibration step runs', () => {
    const state = { detectedCell: 'none', subState: 'settling', secondsRemaining: 5, status: 'none' } as const;
    expect(calibrationBusy(null)).toBe(false);
    expect(calibrationBusy({ ...state, step: 'idle' })).toBe(false);
    expect(calibrationBusy({ ...state, step: 'complete' })).toBe(false);
    expect(calibrationBusy({ ...state, step: 'zeroing' })).toBe(true);
    expect(calibrationBusy({ ...state, step: 'calLatch' })).toBe(true);
  });

  it('writes the issue as Streamline does: the title in bold above the description', () => {
    expect(feedbackText(' Steam page ', ' The timer stops early. ')).toBe('**Steam page**\n\nThe timer stops early.');
  });
});
