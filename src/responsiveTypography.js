// Keep the compact phone layout at its existing size. Give text more room
// on wider viewports without enlarging it indefinitely on tablets/desktops.
export function responsiveFontSize(size) {
  return `clamp(${size}px, ${(size * 100 / 393).toFixed(4)}vw, ${size * 1.25}px)`;
}
