import { describe, expect, it } from 'vitest';
import { textOf } from './text';

describe('textOf', () => {
  it('writes a value the way String does', () => {
    expect(textOf('on')).toBe('on');
    expect(textOf(2.5)).toBe('2.5');
    expect(textOf(true)).toBe('true');
    expect(textOf(null)).toBe('null');
    expect(textOf(undefined)).toBe('undefined');
  });

  it('writes an object as its JSON', () => {
    expect(textOf({ a: 1 })).toBe('{"a":1}');
    expect(textOf([1, 2])).toBe('[1,2]');
  });
});
