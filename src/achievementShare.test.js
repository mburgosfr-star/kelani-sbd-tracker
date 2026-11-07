import { vi } from 'vitest';
import { buildAchievementCard, achievementShareText, KELANI_DOWNLOAD_URL, renderAchievementCard } from './achievementShare';
import { translations } from './translations';

const t = translations.en;
const make = options => buildAchievementCard({ t, ...options });
const set = (weight, reps, extra = {}) => ({ weight, reps, done: true, ...extra });

test('workout cards include only successful work sets, never plans, warmups or personal fields', () => {
  const workout = { completed: true, email: 'private@example.test', bodyWeight: 87, notes: 'PRIVATE',
    lifts: [{ lift: 'Squat', warmups: [set(20, 5)], sets: [set(120, 3), set(100, 5), set(100, 5), set(140, 1, { failed: true }), set(150, 1, { skipped: true }), set(160, 1, { done: false })] }] };
  const before = JSON.stringify(workout);
  const card = make({ kind: 'workout', workout });
  expect(card.rows).toEqual([{ label: 'Squat', value: '1 × 3 × 120 kg · 2 × 5 × 100 kg', color: '#ff5c45' }]);
  expect(JSON.stringify(card)).not.toMatch(/private|PRIVATE|87|140 kg|150 kg|160 kg|\b20 kg/);
  expect(JSON.stringify(workout)).toBe(before);
});

test('meet cards never present a failed attempt as best or an incomplete SBD as a total', () => {
  const workout = { lifts: [{ lift: 'Squat', sets: [set(150, 1), set(160, 1, { failed: true })] }, { lift: 'Bench', sets: [set(100, 1)] }, { lift: 'Deadlift', sets: [set(180, 1)] }] };
  expect(make({ kind: 'meet', workout }).rows.map(row => row.value)).toEqual(['150 kg', '100 kg', '180 kg', '430 kg']);
  workout.lifts[2].sets[0].skipped = true;
  expect(make({ kind: 'meet', workout }).rows.some(row => row.label === t.total)).toBe(false);
});

test.each(['en', 'nl', 'ca'])('milestone and generic cards use localized copy in %s', language => {
  const t = translations[language];
  const card = buildAchievementCard({ t, kind: 'milestone', celebration: { achievements: [
    { type: 'oneRM', lift: 'Bench', value: 102.5, gain: 2.5 },
    { type: 'e1RM', lift: 'Total', value: 400.25, gain: 1.25 },
    { type: 'level', value: 'intermediate' },
  ] } });
  expect(card.rows[0].label).toBe(`${t.bench} 1RM`);
  expect(card.rows[1].label).toBe(`${t.total} e1RM`);
  expect(card.rows[2].value).toBe(t.athleteLevelIntermediate);
  expect(achievementShareText(card)).toContain(KELANI_DOWNLOAD_URL);
  expect(buildAchievementCard({ t }).footer).toBe(t.shareCardFooter);
  expect(buildAchievementCard({ t, kind: 'rest' }).rows).toEqual([]);
});

test('cycle cards deduplicate multi-lift snapshots and do not mutate history', () => {
  const snapshot = { completed: true, type: 'training', lifts: ['Squat', 'Bench', 'Deadlift'].map(lift => ({ lift, sets: [set(100, 1)] })) };
  const history = snapshot.lifts.map(block => ({ cycle: 2, workoutNumber: 1, lift: block.lift, weight: 100, reps: 1, workoutSnapshot: snapshot }));
  const before = JSON.stringify(history);
  const card = make({ kind: 'cycle', cycle: 2, history });
  expect(card.rows.find(row => row.label === t.cycleReviewTrainingDays).value).toBe('1');
  expect(JSON.stringify(history)).toBe(before);
});

test('weight-unit preference is respected without leaking the original workout object', () => {
  const card = make({ kind: 'workout', weightUnit: 'lb', workout: { lifts: [{ lift: 'Bench', sets: [set(100, 5)] }] } });
  expect(card.rows[0].value).toContain('lb');
  expect(card.rows[0].value).not.toContain('kg');
});

test('PNG renderer uses the real logo, a black background and keeps long result lists above the footer', async () => {
  let source;
  const drawings = [];
  const ctx = { font: '', fillStyle: '', drawImage: vi.fn(),
    measureText(value) { return { width: value.length * parseFloat(this.font.split(' ')[1]) * 0.58 }; },
    fillRect: vi.fn(), fillText(value, x, y) { drawings.push({ value, x, y }); } };
  vi.stubGlobal('Image', class { set src(value) { source = value; queueMicrotask(() => this.onload()); } });
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  const data = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,PNG');
  try {
    const card = buildAchievementCard({ t: translations.ca, kind: 'milestone', celebration: {
      achievements: Array.from({ length: 10 }, (_, i) => ({ type: 'e1RM', lift: 'Deadlift', value: 200 + i, gain: 1 }))
    } });
    expect(await renderAchievementCard(card)).toBe('data:image/png;base64,PNG');
    expect(source).toBe('/icons/icon-512.webp');
    expect(ctx.fillRect.mock.calls[0].slice(0, 3)).toEqual([0, 0, 1080]);
    const footerY = ctx.fillRect.mock.calls[1][1];
    const lastResult = drawings.filter(item => item.value.includes('kg')).at(-1);
    expect(lastResult.y).toBeLessThan(footerY);
    expect(data).toHaveBeenCalledWith('image/png');
  } finally { context.mockRestore(); data.mockRestore(); vi.unstubAllGlobals(); }
});
