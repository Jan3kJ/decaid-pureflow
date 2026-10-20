// A value read from the gateway, as the page writes it: the way `String` does, an object as its JSON.
export function textOf(value: unknown): string {
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}
