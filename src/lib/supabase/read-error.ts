export function throwReadError(
  error: { code?: string } | null | undefined,
  context: string,
) {
  if (!error) return;
  throw new Error(`Could not load ${context}.`);
}
