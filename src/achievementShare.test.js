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
  expect(card.rows[0].gain).toMatch(/^\+.* kg$/);
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

const milestoneShapes = () => ({
  beginPath: vi.fn(), roundRect: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  stroke: vi.fn(), fill: vi.fn(), createRadialGradient: () => ({ addColorStop: vi.fn() }),
});

test('milestone PNG shows the result and its gain separately, with the download footer in the share text', async () => {
  let source;
  const drawings = [];
  const ctx = { ...milestoneShapes(), font: '', fillStyle: '', textAlign: '', drawImage: vi.fn(),
    measureText(value) { return { width: value.length * parseFloat(this.font.split(' ')[1]) * 0.58 }; },
    fillRect: vi.fn(), fillText(value, x, y) { drawings.push({ value, x, y, align: this.textAlign, color: this.fillStyle }); } };
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
    expect(ctx.drawImage.mock.calls[0].slice(3)).toEqual([58, 58]);
    expect(ctx.fillRect.mock.calls[0][3]).toBeGreaterThanOrEqual(1080);
    const lastResult = drawings.filter(item => item.value.includes('kg')).at(-1);
    expect(lastResult.y).toBeLessThan(ctx.fillRect.mock.calls[0][3]);
    expect(drawings.some(item => item.value.includes('github.com') || item.value === card.downloadLabel)).toBe(false);
    expect(achievementShareText(card)).toBe(`${card.downloadLabel}: ${card.url}`);
    expect(drawings.every(item => item.x >= 56 && item.x <= 1024)).toBe(true);
    const result = drawings.find(item => item.value === card.rows[0].value);
    const gain = drawings.find(item => item.value === card.rows[0].gain);
    expect(result.align).toBe('right');
    expect(gain).toMatchObject({ align: 'right', x: result.x, color: '#46e597' });
    expect(gain.y).toBeGreaterThan(result.y);
    expect(data).toHaveBeenCalledWith('image/png');
  } finally { context.mockRestore(); data.mockRestore(); vi.unstubAllGlobals(); }
});

// Result context must describe the shared result, not the next planned session.
test.each(['en', 'nl', 'ca'])('share context uses localized level and the completed workout number (%s)', language => {
  const t = translations[language];
  const card = buildAchievementCard({ t, kind: 'workout', athleteLevel: 'advanced', cycle: 6,
    workoutNumber: 27, workout: { number: 26, lifts: [{ lift: 'Bench', sets: [set(90, 3)] }] } });
  expect(card.context).toEqual([t.athleteLevelAdvanced, `${t.cycle} 6`, `${t.workout} 26`]);
  expect(achievementShareText(card)).toBe(`${t.shareDownload}: ${KELANI_DOWNLOAD_URL}`);
  expect(achievementShareText(card)).not.toContain(`${t.workout} 27`);
});

test('invalid context is omitted instead of sharing arbitrary user fields', () => {
  expect(make({ athleteLevel: 'PRIVATE', cycle: -1, workoutNumber: 'PRIVATE' }).context).toEqual([]);
});


test.each(['en', 'nl', 'ca'])('cycle share retains the real review results and progress without personal history (%s)', language => {
  const t = translations[language];
  const lifts = ['Squat', 'Bench', 'Deadlift'];
  const baseline = lifts.map(lift => ({ lift, cycle: 0, workoutNumber: 0, topWeight: 90, e1rm: 90, seedMax: true }));
  const snapshot = { completed: true, type: 'meet', notes: 'PRIVATE', lifts: lifts.map(lift => ({
    lift, sets: [set(100, 1), set(110, 1, { failed: true })],
  })) };
  const history = [...baseline, ...lifts.map(lift => ({ cycle: 1, workoutNumber: 28, lift, workoutSnapshot: snapshot }))];
  const before = JSON.stringify(history);
  const card = buildAchievementCard({ kind: 'cycle', t, history, cycle: 1 });
  expect(card.cycleSummary.lifts).toHaveLength(3);
  expect(card.cycleSummary.lifts[0]).toMatchObject({ values: ['100 kg', '100 kg'], gains: ['+10 kg', '+10 kg'], sinceStart: '+10 kg' });
  expect(card.cycleSummary.meet.value).toBe('300 kg');
  expect(card.cycleSummary.points.map(point => point.value)).toEqual([270, 300]);
  expect(JSON.stringify(card)).not.toMatch(/PRIVATE|110 kg|workoutSnapshot/);
  expect(JSON.stringify(history)).toBe(before);
});

test('cycle renderer lays out every translated results panel and the progress chart within the image', async () => {
  const drawings = [];
  const ctx = { font: '', drawImage: vi.fn(), fillRect: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    measureText(value) { return { width: value.length * parseFloat(this.font.split(' ')[1]) * 0.58 }; },
    fillText(value, x, y) { drawings.push({ value, x, y }); },
  };
  vi.stubGlobal('Image', class { set src(value) { queueMicrotask(() => this.onload()); } });
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  const data = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,PNG');
  try {
    const seeds = ['Squat', 'Bench', 'Deadlift'].map(lift => ({ lift, cycle: 0, workoutNumber: 0, topWeight: 100, seedMax: true }));
    for (const language of ['en', 'nl', 'ca']) {
      drawings.length = 0;
      const card = buildAchievementCard({ t: translations[language], kind: 'cycle', history: seeds });
      await renderAchievementCard(card);
      const height = ctx.fillRect.mock.calls.filter(call => call[0] === 0).at(-1)[3];
      expect(drawings.every(item => item.y > 0 && item.y < height && item.x > 0 && item.x < 1080)).toBe(true);
      expect(drawings.some(item => item.value === translations[language].e1RM)).toBe(true);
      expect(drawings.some(item => item.value.includes('github.com'))).toBe(false);
    }
    expect(ctx.arc).toHaveBeenCalled();
  } finally { context.mockRestore(); data.mockRestore(); vi.unstubAllGlobals(); }
});

test.each(['en', 'nl', 'ca'])('About share is the real mini-dashboard in %s, with precise estimates and no personal fields', language => {
  const t = translations[language];
  const dashboard = { lifts: {
    Squat: { oneRM: 155, e1RM: 157.333333 }, Bench: { oneRM: 100, e1RM: 104 }, Deadlift: { oneRM: 175, e1RM: 184 },
  }, total: { oneRM: 430, e1RM: 445.333333 }, bodyWeight: 85.6, email: 'PRIVATE' };
  const before = JSON.stringify(dashboard);
  const dashboardRecentPrEvents = {
    lifts: { Squat: { oneRMGain: 2.5, e1RMGain: 0 }, Bench: { e1RMGain: 1.6, source: 'PRIVATE' } },
    total: { e1RMGain: 1.6 },
    ratios: { strengthMaxGain: 0.42 },
  };
  const card = buildAchievementCard({ t, dashboard, dashboardRecentPrEvents, athleteLevel: 'intermediate', cycle: 7, workoutNumber: 1 });
  expect(card.title).toBe('Kelani SBD Tracker');
  expect(JSON.stringify(card)).not.toContain(t.dashboard);
  expect(card.subtitle).toBe('');
  expect(card.dashboardSummary.columns).toEqual([t.oneRM, t.e1RM]);
  expect(card.dashboardSummary.tiles.map(tile => tile.values)).toEqual([
    ['155 kg', '157.33 kg'], ['100 kg', '104 kg'], ['175 kg', '184 kg'], ['430 kg', '445.33 kg'],
  ]);
  expect(card.dashboardSummary.tiles.map(tile => tile.records)).toEqual([
    [{ label: t.new1RMPR, gain: '+2.5 kg' }, null],
    [null, { label: t.newE1RMPR, gain: '+1.6 kg' }],
    [null, null],
    [null, { label: t.newE1RMPR, gain: '+1.6 kg' }],
  ]);
  expect(JSON.stringify(card)).not.toMatch(/PRIVATE|85\.6|bodyWeight|strengthMaxGain/);
  expect(JSON.stringify(dashboard)).toBe(before);
  const poundTile = buildAchievementCard({ t, dashboard, dashboardRecentPrEvents, weightUnit: 'lb' }).dashboardSummary.tiles[0];
  expect(poundTile.values[0]).toContain('lb');
  expect(poundTile.records[0].gain).toMatch(/^\+.* lb$/);
});

test('mini-dashboard renderer has four colored quadrants and no advertising panel', async () => {
  const drawings = [];
  const ctx = { ...milestoneShapes(), font: '', drawImage: vi.fn(), fillRect: vi.fn(),
    measureText(value) { return { width: value.length * parseFloat(this.font.split(' ')[1]) * 0.58 }; },
    fillText(value, x, y) { drawings.push({ value, x, y, color: this.fillStyle }); },
  };
  vi.stubGlobal('Image', class { set src(value) { queueMicrotask(() => this.onload()); } });
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  const data = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,PNG');
  try {
    const card = buildAchievementCard({ t, dashboard: { lifts: { Bench: { oneRM: 100, e1RM: 104 } } },
      dashboardRecentPrEvents: { lifts: { Bench: { e1RMGain: 1.6 } } } });
    await renderAchievementCard(card);
    expect(drawings.filter(item => item.value === '1RM')).toHaveLength(4);
    expect(drawings.filter(item => item.value === 'e1RM')).toHaveLength(4);
    expect(drawings.find(item => item.value === t.squat).x).toBeLessThan(drawings.find(item => item.value === t.bench).x);
    expect(drawings.find(item => item.value === t.deadlift).y).toBeGreaterThan(drawings.find(item => item.value === t.squat).y);
    expect(ctx.roundRect).toHaveBeenCalledTimes(4);
    const record = drawings.find(item => item.value === t.newE1RMPR);
    expect(record.y).toBeGreaterThan(drawings.find(item => item.value === '104 kg').y);
    expect(drawings.find(item => item.value === '+1.6 kg')).toMatchObject({ y: record.y, color: '#46e597' });
    expect(drawings.some(item => item.value.includes('Plan your training') || item.value === t.shareAboutTitle)).toBe(false);
    const height = ctx.fillRect.mock.calls[0][3];
    expect(drawings.every(item => item.y > 0 && item.y < height)).toBe(true);
  } finally { context.mockRestore(); data.mockRestore(); vi.unstubAllGlobals(); }
});

test.each(['en', 'nl', 'ca'])('all six share types stay inside their image with long localized lb results (%s)', async language => {
  const drawings = [];
  const ctx = { ...milestoneShapes(), font: '', textAlign: '', drawImage: vi.fn(), fillRect: vi.fn(),
    measureText(value) { return { width: String(value).length * parseFloat(this.font.split(' ')[1]) * 0.58 }; },
    fillText(value, x, y) { drawings.push({ value, x, y, size: parseFloat(this.font.split(' ')[1]), width: this.measureText(value).width, align: this.textAlign }); },
  };
  vi.stubGlobal('Image', class { set src(value) { queueMicrotask(() => this.onload()); } });
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  const data = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,PNG');
  try {
    const t = translations[language];
    const lifts = ['Squat', 'Bench', 'Deadlift'];
    for (const kind of ['about', 'workout', 'meet', 'cycle', 'milestone', 'rest']) {
      drawings.length = 0; ctx.fillRect.mockClear();
      const card = buildAchievementCard({ t, kind, weightUnit: 'lb', athleteLevel: 'intermediate', cycle: 12, workoutNumber: 28,
        dashboard: { lifts: Object.fromEntries(lifts.map(lift => [lift, { oneRM: 225, e1RM: 227.3333 }])), total: { oneRM: 675, e1RM: 681.9999 } },
        dashboardRecentPrEvents: { total: { oneRMGain: 10, e1RMGain: 11.25 } },
        workout: { lifts: lifts.map(lift => ({ lift, sets: [set(225, 1), set(200, 3), set(200, 3)] })) },
        history: lifts.map(lift => ({ lift, cycle: 0, workoutNumber: 0, topWeight: 200, e1rm: 200, seedMax: true })),
        celebration: { achievements: [{ type: 'oneRM', lift: 'Squat', value: 225, gain: 2.5 }, { type: 'level', value: 'intermediate' }] },
      });
      await renderAchievementCard(card);
      const height = ctx.fillRect.mock.calls[0][3];
      for (const item of drawings) {
        const left = item.x - (item.align === 'center' ? item.width / 2 : item.align === 'right' ? item.width : 0);
        expect(left, `${kind}: ${item.value}`).toBeGreaterThanOrEqual(32);
        expect(left + item.width, `${kind}: ${item.value}`).toBeLessThanOrEqual(1048);
        expect(item.y + item.size, `${kind}: ${item.value}`).toBeLessThanOrEqual(height);
      }
      if (kind !== 'milestone' && kind !== 'about') expect(drawings.every(item => item.align === 'center')).toBe(true);
      expect(drawings.some(item => item.value === t.dashboard)).toBe(false);
      expect(drawings.some(item => item.value.includes('github.com'))).toBe(false);
      if (kind === 'workout') expect(drawings.some(item => item.value.includes(' · ') && item.value.includes('lb'))).toBe(false);
    }
  } finally { context.mockRestore(); data.mockRestore(); vi.unstubAllGlobals(); }
});
