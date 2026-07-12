export type FocusDirection = "forward" | "backward";
export type DismissReason = "escape" | "backdrop" | "close-button";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function nextFocusableIndex(
  currentIndex: number,
  focusableCount: number,
  direction: FocusDirection,
) {
  if (focusableCount <= 0) return -1;
  if (direction === "backward") {
    return currentIndex <= 0 ? focusableCount - 1 : currentIndex - 1;
  }
  return currentIndex >= focusableCount - 1 ? 0 : currentIndex + 1;
}

export function shouldDismissLayer({
  pending,
}: {
  pending: boolean;
  reason: DismissReason;
}) {
  return !pending;
}

export function getFocusableElements(root: HTMLElement) {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return candidates.filter((element) => {
    const disabled = element.getAttribute("aria-disabled") === "true";
    const hidden = element.closest("[aria-hidden='true']");
    return !disabled && !hidden;
  });
}

export function getInitialFocusTarget(root: HTMLElement) {
  return (
    root.querySelector<HTMLElement>("[autofocus], [data-autofocus='true']") ??
    getFocusableElements(root)[0] ??
    root
  );
}

export function restoreFocus(
  target: HTMLElement | null,
  contains: (element: HTMLElement) => boolean = (element) => document.contains(element),
) {
  if (!target || !contains(target)) return false;
  target.focus();
  return true;
}

export function contrastRatio(foreground: string, background: string) {
  const [front, back] = [relativeLuminance(foreground), relativeLuminance(background)];
  const lighter = Math.max(front, back);
  const darker = Math.min(front, back);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  if (!/^[\da-fA-F]{6}$/.test(value)) {
    throw new Error(`Expected a 6-digit hex color, received ${hex}`);
  }
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}
