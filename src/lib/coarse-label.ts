export const COARSE_LABEL_MAX_LENGTH = 80;

export const COARSE_LABEL_HINT =
  "Use a city or neighborhood, not a street address. Precise pickup stays private and is shared only after you match.";

const UNIT_PATTERN = /\b(apt|apartment|suite|ste|unit|#|p\.?o\.?\s*box|po\s*box)\b/i;
const ALLOWED_CHARS = /^[A-Za-z\s,.'&-]+$/;

export function validateCoarseLabel(
  label: string | null | undefined,
  presetNames: ReadonlySet<string> = new Set(),
): string | null {
  const trimmed = (label ?? "").trim();
  if (!trimmed) {
    return "Please enter a city or neighborhood.";
  }
  if (presetNames.has(trimmed)) {
    return null;
  }
  if (trimmed.length > COARSE_LABEL_MAX_LENGTH) {
    return `${COARSE_LABEL_HINT} Keep it under ${COARSE_LABEL_MAX_LENGTH} characters.`;
  }
  if (/[0-9]/.test(trimmed)) {
    return COARSE_LABEL_HINT;
  }
  if (UNIT_PATTERN.test(trimmed)) {
    return COARSE_LABEL_HINT;
  }
  if (!ALLOWED_CHARS.test(trimmed)) {
    return COARSE_LABEL_HINT;
  }
  return null;
}

export function mapCoarseLabelDbError(message: string): string {
  if (/coarse_label_/i.test(message)) {
    return COARSE_LABEL_HINT;
  }
  return message;
}
