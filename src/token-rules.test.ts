import { describe, expect, it } from 'vitest';
import { literal } from '../scripts/token-rules.mjs';

// scripts/token-rules.mjs, the rules of `npm run lint`'s token check: a glow in a text-shadow or a
// drop-shadow is a --shadow-* token, as a box-shadow is.

const check = (property: string, value: string) => literal({ property, value });

describe('text-shadow', () => {
  it('takes none, a shadow token or a list of them', () => {
    expect(check('text-shadow', 'none')).toBeNull();
    expect(check('text-shadow', 'var(--shadow-glow-flow)')).toBeNull();
    expect(check('text-shadow', 'var(--shadow-glow-flow), var(--shadow-glow-time)')).toBeNull();
  });

  it('refuses a written-out glow, with or without a colour', () => {
    expect(check('text-shadow', '0 0 0.8rem rgb(255 195 92 / 45%)')).toBe('a text shadow');
    expect(check('text-shadow', '0 0 0.8rem var(--weight)')).toBe('a text shadow');
    expect(check('text-shadow', 'var(--shadow-glow-flow), 0 0 1rem red')).toBe('a text shadow');
  });
});

describe('filter', () => {
  it('takes a drop-shadow of a token and a filter without one', () => {
    expect(check('filter', 'drop-shadow(var(--shadow-glow-weight))')).toBeNull();
    expect(check('filter', 'blur(0.4rem)')).toBeNull();
    expect(check('filter', 'none')).toBeNull();
  });

  it('refuses a written-out drop-shadow', () => {
    expect(check('filter', 'drop-shadow(0 0 0.5rem var(--flow))')).toBe('a drop shadow');
    expect(check('filter', 'blur(1px) drop-shadow(var(--shadow-glow-flow)) drop-shadow(0 0 1rem red)')).toBe('a drop shadow');
    expect(check('filter', 'drop-shadow(0 0 1rem rgb(0 0 0 / 50%))')).toBe('a drop shadow');
  });
});

describe('box-shadow', () => {
  it('still takes a token only', () => {
    expect(check('box-shadow', 'var(--shadow-glass)')).toBeNull();
    expect(check('box-shadow', '0 0 1rem black')).toBe('a shadow');
  });
});
