/** The text of a thrown value: an Error's message, anything else as a string. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
