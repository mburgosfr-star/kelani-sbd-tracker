// Both fixed bars reserve the same amount of viewport space.
export const BOTTOM_NAV_SPACE = 78;
export const APP_HEADER_SPACE = BOTTOM_NAV_SPACE;

// Insets are measured from the visible divider lines. The bottom divider
// sits inside the navigation bar, so its offset is part of the visible gap.
export const NAV_DIVIDER_INSET = 'clamp(4px, 0.7dvh, 6px)';
export const SCREEN_VERTICAL_INSET = 'clamp(10px, 1.8dvh, 18px)';
export const SCREEN_BOTTOM_INSET = `calc(${SCREEN_VERTICAL_INSET} - ${NAV_DIVIDER_INSET})`;
export function screenContentPadding(horizontal = 'clamp(14px, 4vw, 20px)') {
  return `${SCREEN_VERTICAL_INSET} ${horizontal} ${SCREEN_BOTTOM_INSET}`;
}
