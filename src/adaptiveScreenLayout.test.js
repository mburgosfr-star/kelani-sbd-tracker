import { adaptiveFontSize, screenFontCandidates, fitScreenContent, scrollRegionsFit } from './adaptiveScreenLayout';

function fit({ available, natural, compactSaving = 0, screen = 'dashboard', width = 393, height = 873 }) {
  let scale = 1;
  let dense = false;
  const result = fitScreenContent({
    candidates: screenFontCandidates(screen, { width, height }),
    apply: value => { scale = value; },
    compact: value => { dense = value; },
    fits: () => natural * scale - (dense ? compactSaving : 0) <= available,
  });
  return { ...result, applied: scale };
}

test('keeps Dashboard text restrained even when there is abundant spare space', () => {
  expect(fit({ natural: 500, available: 650 })).toEqual({ scale: 1.05, applied: 1.05, compact: false, scroll: false });
  expect(fit({ natural: 580, available: 650 }).scale).toBe(1.05);
});

test('reduces spacing before reducing type, then scrolls when readable content cannot fit', () => {
  expect(fit({ natural: 660, available: 650, compactSaving: 20 })).toMatchObject({ scale: 1, compact: true, scroll: false });
  expect(fit({ natural: 700, available: 650 })).toMatchObject({ scale: 0.9, compact: true, scroll: false });
  expect(fit({ natural: 1000, available: 500 })).toEqual({ scale: 1, applied: 1, compact: true, scroll: true });
});

test('a resized or changed screen can expand again instead of retaining sticky compaction', () => {
  expect(fit({ natural: 700, available: 650 }).compact).toBe(true);
  expect(fit({ natural: 700, available: 900 })).toMatchObject({ scale: 1.05, compact: false });
  expect(fit({ natural: 500, available: 650 })).toMatchObject({ scale: 1.05, compact: false });
});

test('long workouts keep readable type and Program only gets its requested date change', () => {
  expect(fit({ screen: 'current', natural: 1500, available: 650 })).toMatchObject({ scale: 1, scroll: true });
  expect(screenFontCandidates('all')).toEqual([1]);
  expect(screenFontCandidates('dashboard')[0]).toBe(1.05);
  expect(screenFontCandidates('settings')[0]).toBe(1.15);
  expect(screenFontCandidates('current', { width: 320, height: 600 })).toEqual([1, 0.95, 0.9]);
});

test('fitting checks horizontal as well as vertical overflow and respects measurement tolerance', () => {
  expect(scrollRegionsFit([{ clientHeight: 650, scrollHeight: 651, clientWidth: 360, scrollWidth: 360 }])).toBe(true);
  expect(scrollRegionsFit([{ clientHeight: 650, scrollHeight: 653, clientWidth: 360, scrollWidth: 360 }])).toBe(false);
  expect(scrollRegionsFit([{ clientHeight: 650, scrollHeight: 640, clientWidth: 360, scrollWidth: 370 }])).toBe(false);
});

test('type scaling is scoped by a content variable with a safe baseline', () => {
  expect(adaptiveFontSize(16)).toBe('calc(16px * var(--kelani-content-font-scale, 1))');
});
