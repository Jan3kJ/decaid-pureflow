import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message';

describe('errorMessage', () => {
  it("gives an Error's message", () => {
    expect(errorMessage(new Error('no machine'))).toBe('no machine');
    expect(errorMessage(new TypeError('fetch failed'))).toBe('fetch failed');
  });

  it('gives anything else as a string', () => {
    expect(errorMessage('timeout')).toBe('timeout');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(undefined)).toBe('undefined');
    expect(errorMessage(null)).toBe('null');
  });
});
