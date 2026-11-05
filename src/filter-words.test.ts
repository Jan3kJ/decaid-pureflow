import { describe, expect, it } from 'vitest';
import { isEmptyFilter, matchesFilter } from './filter-words';

describe('matchesFilter', () => {
  it('finds every word, in any order and any case', () => {
    expect(matchesFilter('Light roast', 'ROAST light')).toBe(true);
    expect(matchesFilter('Light roast', 'ht ro')).toBe(true);
  });

  it('needs every word', () => {
    expect(matchesFilter('Light roast', 'light dark')).toBe(false);
  });

  it('holds for any text with an empty filter', () => {
    expect(matchesFilter('Light roast', '  ')).toBe(true);
    expect(isEmptyFilter('  ')).toBe(true);
    expect(isEmptyFilter(' a ')).toBe(false);
  });
});
