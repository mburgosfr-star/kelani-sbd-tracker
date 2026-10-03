import {
  addLocalDays,
  buildWorkoutScheduleDateKeys,
  formatWorkoutScheduleDate,
  formatWorkoutScheduleDateRange,
  getMeetProjectionDateKeys,
  getNextWorkoutDateKey,
  parseWorkoutDateKey,
} from './workoutScheduleDates';

const TODAY = new Date(2026, 8, 30, 12, 0, 0);

test('plans the next workout today when the latest completion was yesterday or earlier', () => {
  expect(getNextWorkoutDateKey({
    history: [{ workoutSnapshot: { completedAt: '2026-09-29T20:00:00+02:00' } }],
    today: TODAY,
  })).toBe('2026-09-30');
});

test('does not mistake onboarding max seeds for completed workouts', () => {
  expect(getNextWorkoutDateKey({
    history: [
      { seedMax: true, lift: 'Squat', date: '30-9-2026' },
      { seedMax: true, lift: 'Bench', date: '30-9-2026' },
      { seedMax: true, lift: 'Deadlift', date: '30-9-2026' },
    ],
    today: TODAY,
  })).toBe('2026-09-30');
});

test('plans the next workout tomorrow when one or many workouts were completed today', () => {
  const oneCompletion = [{ workoutSnapshot: { completedAt: '2026-09-30T08:00:00+02:00' } }];
  const fiveCompletions = Array.from({ length: 5 }, (_, index) => ({
    workoutSnapshot: { completedAt: `2026-09-30T${String(8 + index).padStart(2, '0')}:00:00+02:00` },
  }));

  expect(getNextWorkoutDateKey({ history: oneCompletion, today: TODAY })).toBe('2026-10-01');
  expect(getNextWorkoutDateKey({ history: fiveCompletions, today: TODAY })).toBe('2026-10-01');
});

test('rolls an overdue next workout forward to the current local day', () => {
  const history = [{ date: '27-9-2026' }];

  expect(getNextWorkoutDateKey({ history, today: TODAY })).toBe('2026-09-30');
  expect(getNextWorkoutDateKey({
    history,
    today: new Date(2026, 9, 1, 0, 1, 0),
  })).toBe('2026-10-01');
});

test('gives every route position a consecutive local date including rest days', () => {
  const workouts = [
    { number: 17, type: 'rest' },
    { number: 18, type: 'training' },
    { number: 19, type: 'rest' },
    { number: 20, type: 'training' },
  ];

  expect(buildWorkoutScheduleDateKeys({ workouts, currentIndex: 0, today: TODAY })).toEqual([
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
    '2026-10-03',
  ]);
});

test('keeps completed workout dates while planning from the current index', () => {
  const workouts = [
    { number: 1, completed: true, completedAt: '2026-09-29T21:00:00+02:00' },
    { number: 2, type: 'training' },
    { number: 3, type: 'rest' },
  ];

  expect(buildWorkoutScheduleDateKeys({
    workouts,
    currentIndex: 1,
    history: [{ workoutSnapshot: workouts[0] }],
    today: TODAY,
  })).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
});

test('parses legacy local dates and adds calendar days across month boundaries', () => {
  expect(parseWorkoutDateKey('30-9-2026')).toBe('2026-09-30');
  expect(addLocalDays('2026-09-30', 1)).toBe('2026-10-01');
});

test('formats localized visible schedule labels', () => {
  expect(formatWorkoutScheduleDate('2026-09-30', {
    language: 'nl',
    today: TODAY,
    todayLabel: 'vandaag',
    tomorrowLabel: 'morgen',
  })).toBe('Vandaag · 30 september');

  expect(formatWorkoutScheduleDate('2026-10-01', {
    language: 'en',
    today: TODAY,
    todayLabel: 'today',
    tomorrowLabel: 'tomorrow',
    compact: true,
  })).toMatch(/^Tomorrow · /);
});

test('derives projected meet dates from the current route date', () => {
  expect(getMeetProjectionDateKeys({
    projectionLabel: 'C3W32–C3W35',
    currentCycle: 3,
    currentWorkoutNumber: 30,
    currentWorkoutDate: '2026-09-30',
  })).toEqual(['2026-10-02', '2026-10-05']);

  expect(getMeetProjectionDateKeys({
    projectionLabel: 'C4W1',
    currentCycle: 3,
    currentWorkoutNumber: 30,
    currentWorkoutDate: '2026-09-30',
  })).toEqual([]);
});

test('formats a localized projected meet date range', () => {
  expect(formatWorkoutScheduleDateRange(
    ['2026-10-02', '2026-10-05'],
    { language: 'nl' }
  )).toMatch(/2.*5 oktober/);
});
