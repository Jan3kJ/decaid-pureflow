// The types of scripts/token-rules.mjs that src/token-rules.test.ts takes.
export function untokened(declaration: { property: string; value: string }): string | null;
export function literal(declaration: { property: string; value: string }): string | null;
