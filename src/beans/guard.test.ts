import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_GUARD_MS, captureGuarded, markCapture, resetCaptureGuard } from './guard';

describe('the capture guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCaptureGuard();
  });
  afterEach(() => vi.useRealTimers());

  it('is 1000 ms', () => {
    expect(CAPTURE_GUARD_MS).toBe(1000);
  });

  it('does not guard before a capture', () => {
    expect(captureGuarded()).toBe(false);
  });

  it('ignores taps at 0 ms and 999 ms after the capture and lets them through at 1000 ms', () => {
    markCapture();
    expect(captureGuarded()).toBe(true);
    vi.advanceTimersByTime(999);
    expect(captureGuarded()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(captureGuarded()).toBe(false);
  });

  it('starts again with the next capture', () => {
    markCapture();
    vi.advanceTimersByTime(5000);
    markCapture();
    expect(captureGuarded()).toBe(true);
  });
});
