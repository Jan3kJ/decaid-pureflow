/** Whether a filter holds no word: the list it filters is shown whole. */
export function isEmptyFilter(filter: string): boolean {
  return filter.trim() === '';
}

/** The match of every filter field: each word of the filter is found in the text, in any order and any case. */
export function matchesFilter(text: string, filter: string): boolean {
  const lower = text.toLocaleLowerCase();
  return filter
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => lower.includes(word));
}
