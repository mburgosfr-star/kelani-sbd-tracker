// Content fitting never scales screen titles, navigation or touch targets.
export const SCREEN_FONT_STEPS = [1.25, 1.2, 1.15, 1.1, 1.05, 1, 0.95, 0.9];

export function adaptiveFontSize(value) {
  const size = typeof value === 'number' ? `${value}px` : value;
  return `calc(${size} * var(--kelani-content-font-scale, 1))`;
}

export function screenFontCandidates(screen, { width = 393, height = 873 } = {}) {
  // Long workout lists must stay readable rather than shrink to one page.
  if (screen === 'all') return [1];
  // Dashboard already has a larger heading/value hierarchy. Spare height
  // should spread its sections, not magnify every label by another 25%.
  if (screen === 'dashboard') return [1.05, 1, 0.95, 0.9];
  if (screen === 'settings') return [1.15, 1.1, 1.05, 1, 0.95, 0.9];
  if (screen === 'current') return width < 360 || height < 640 ? [1, 0.95, 0.9] : [1];
  return SCREEN_FONT_STEPS;
}

export function fitScreenContent({ candidates = [1], apply, fits, compact }) {
  // Reduce whitespace before reducing type. A bounded search is deterministic:
  // it cannot oscillate when a resize observation follows our own changes.
  compact(false);
  for (const scale of candidates.filter(value => value >= 1)) {
    apply(scale);
    if (fits()) return { scale, compact: false, scroll: false };
  }
  compact(true);
  for (const scale of candidates.filter(value => value <= 1)) {
    apply(scale);
    if (fits()) return { scale, compact: true, scroll: false };
  }
  // Oversized content scrolls at its readable baseline, never at the smallest
  // font just to show more rows. Native/system text preferences stay effective.
  apply(1);
  return { scale: 1, compact: true, scroll: true };
}

export function scrollRegionsFit(regions = []) {
  return regions.every(region =>
    region.clientHeight > 0 &&
    region.scrollHeight <= region.clientHeight + 2 &&
    region.scrollWidth <= region.clientWidth + 2
  );
}
