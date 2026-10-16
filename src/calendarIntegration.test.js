import { projectNextSmartCalendarCycle } from './smartTrainingEngine';
import {
  DEFAULT_CALENDAR_START_TIME,
  getCalendarRestWorkoutKeys,
  buildCalendarEventSpecs,
  buildCalendarPlanningEventSpecs,
  countPlannedWorkoutSets,
  createCalendarIntegrationSettings,
  getFutureCalendarWorkouts,
  getCompletedCalendarWorkoutKeys,
  getWorkoutCalendarDurationMinutes,
  normalizeCalendarIntegrationSettings,
  shouldShowCalendarCyclePrompt,
} from './calendarIntegration';

test('normalizes old or incomplete calendar settings safely', () => {
  expect(createCalendarIntegrationSettings()).toEqual({
    enabled: false,
    deleteCompletedWorkouts: false,
    calendarId: null,
    calendarName: '',
    calendarAccountName: '',
    calendarAccountType: '',
    defaultStartTime: DEFAULT_CALENDAR_START_TIME,
    eventMappings: [],
    hasSynced: false,
    promptDismissedCycle: null,
    promptsDisabled: false,
  });
  expect(normalizeCalendarIntegrationSettings({ enabled: true, defaultStartTime: '99:99' }))
    .toMatchObject({ enabled: false, deleteCompletedWorkouts: false, defaultStartTime: DEFAULT_CALENDAR_START_TIME });
  expect(normalizeCalendarIntegrationSettings({ deleteCompletedWorkouts: 'true' }).deleteCompletedWorkouts).toBe(false);
  expect(normalizeCalendarIntegrationSettings({ deleteCompletedWorkouts: true }).deleteCompletedWorkouts).toBe(true);
});

test('calendar completion keys include older cycles and ignore non-workout history', () => {
  expect([...getCompletedCalendarWorkoutKeys([
    { cycle: 4, workoutNumber: 28, workoutSnapshot: { type: 'meet' } },
    { cycle: 5, workoutNumber: 1, lift: 'Squat' },
    { cycle: 5, workoutNumber: 1, lift: 'Bench' },
    { workoutNumber: 2, lift: 'Deadlift' },
    { cycle: 5, workoutNumber: 2, type: 'bodyweight', weight: 80 },
  ])]).toEqual(['4:28', '5:1', '1:2']);
});

test('builds local-time future events from scheduled training sets', () => {
  const specs = buildCalendarEventSpecs({
    workouts: [
      { number: 18, type: 'training', lifts: [{ warmups: [{}, {}], sets: [{}, {}] }] },
      { number: 19, type: 'rest' },
    ],
    scheduleDateKeys: ['2026-10-02', '2026-10-03'],
    currentCycle: 5,
    startTime: '19:30',
    today: new Date(2026, 9, 2, 12),
    titleTemplate: 'Kelani C{cycle}W{workout}',
  });

  expect(specs).toHaveLength(1);
  expect(specs[0]).toMatchObject({
    cycleId: 5,
    workoutId: 18,
    dateKey: '2026-10-02',
    startTime: '19:30',
    durationMinutes: 20,
    title: 'Kelani C5W18',
  });
  expect(new Date(specs[0].startMillis).getHours()).toBe(19);
  expect(new Date(specs[0].endMillis).getMinutes()).toBe(50);
});

test('counts every actual planned set and derives five minutes per set', () => {
  const workout = {
    type: 'training',
    prepItems: [
      { prescription: '3×8' },
      { sets: 2, prescription: '2×15' },
    ],
    lifts: [
      { warmups: [{}, {}, {}], sets: [{}, {}, {}, {}] },
      { warmups: [{}, {}], sets: [{}, {}, {}] },
    ],
    accessories: [
      { weights: [20, 20, 20, 20] },
    ],
    cooldownItems: [
      { prescription: '2×10 sec' },
      { prescription: '2–5 min' },
    ],
  };

  expect(countPlannedWorkoutSets(workout)).toBe(24);
  expect(getWorkoutCalendarDurationMinutes(workout)).toBe(120);
  expect(getWorkoutCalendarDurationMinutes({ type: 'rest' })).toBe(0);
});

test('selects only unfinished training workouts scheduled today or later', () => {
  const workouts = [
    { number: 1, type: 'training', completed: true },
    { number: 2, type: 'rest' },
    { number: 3, type: 'training' },
    { number: 4, type: 'meet' },
  ];

  expect(getFutureCalendarWorkouts({
    workouts,
    scheduleDateKeys: ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'],
    currentIndex: 1,
    today: new Date(2026, 8, 30, 12),
  }).map(({ workout, dateKey }) => [workout.number, dateKey])).toEqual([
    [3, '2026-10-01'],
    [4, '2026-10-02'],
  ]);
});

test('cycle prompts distinguish not now from permanent suppression', () => {
  expect(shouldShowCalendarCyclePrompt({}, 3)).toBe(true);
  expect(shouldShowCalendarCyclePrompt({ promptDismissedCycle: 3 }, 3)).toBe(false);
  expect(shouldShowCalendarCyclePrompt({ promptDismissedCycle: 3 }, 4)).toBe(true);
  expect(shouldShowCalendarCyclePrompt({ promptsDisabled: true }, 4)).toBe(false);
  expect(shouldShowCalendarCyclePrompt({ enabled: true, calendarId: '7' }, 4)).toBe(false);
});


test('reminder initialization survives storage normalization while legacy mappings remain migratable', () => {
  const base = { cycleId: 1, workoutId: 2, eventId: '3' };
  expect(normalizeCalendarIntegrationSettings({ eventMappings: [base] }).eventMappings[0].reminderInitialized).toBe(false);
  const initialized = normalizeCalendarIntegrationSettings({ eventMappings: [{ ...base, reminderInitialized: true }] });
  expect(normalizeCalendarIntegrationSettings(JSON.parse(JSON.stringify(initialized))).eventMappings[0].reminderInitialized).toBe(true);
});

test('manual calendar deletions survive reload while legacy event mappings remain active', () => {
  const base = { cycleId: 8, workoutId: 12, calendarId: '7', eventId: '3' };
  expect(normalizeCalendarIntegrationSettings({ eventMappings: [base] }).eventMappings[0].deletedExternally).toBe(false);
  const saved = normalizeCalendarIntegrationSettings({ eventMappings: [{ ...base, deletedExternally: true }] });
  expect(normalizeCalendarIntegrationSettings(JSON.parse(JSON.stringify(saved))).eventMappings[0])
    .toMatchObject({ eventId: '3', deletedExternally: true });
});


test('plans exactly one provisional cycle after the current recovery days without changing workouts', () => {
  const training = number => ({ number, type: 'training', lifts: [{ sets: [{}] }] });
  const workouts = [training(28), { number: 29, type: 'rest' }, { number: 30, type: 'rest' }];
  const nextCycleWorkouts = [training(1), { number: 2, type: 'rest' }, training(3)];
  const before = JSON.stringify({ workouts, nextCycleWorkouts });
  const specs = buildCalendarPlanningEventSpecs({
    workouts, nextCycleWorkouts, currentCycle: 5, currentIndex: 0,
    scheduleDateKeys: ['2026-10-30', '2026-10-31', '2026-11-01'],
    today: new Date(2026, 9, 30), startTime: '10:00',
    titleTemplate: 'Kelani C{cycle}W{workout}',
    provisionalTitleTemplate: 'Kelani provisional C{cycle}W{workout}',
  });
  expect(specs.map(({ cycleId, workoutId, dateKey }) => [cycleId, workoutId, dateKey]))
    .toEqual([[5, 28, '2026-10-30'], [6, 1, '2026-11-02'], [6, 3, '2026-11-04']]);
  expect(specs[0].provisional).toBeUndefined();
  expect(specs[1]).toMatchObject({ provisional: true, title: 'Kelani provisional C6W1' });
  expect(JSON.stringify({ workouts, nextCycleWorkouts })).toBe(before);
  const mapping = normalizeCalendarIntegrationSettings({ eventMappings: [{ ...specs[1], eventId: '9' }] });
  expect(normalizeCalendarIntegrationSettings(JSON.parse(JSON.stringify(mapping))).eventMappings[0].provisional).toBe(true);
});


test.each(['standard', 'practical'])('forecasts a complete next cycle using the existing %s route', trainingFocus => {
  const nextCycleWorkouts = projectNextSmartCalendarCycle({
    programProfile: 'kelaniSbd', squat: 150, bench: 100, deadlift: 180,
    currentCycle: 5, currentIndex: 0, athleteLevel: 'intermediate',
    trainingFocus, idealRouteEnabled: true, history: [],
    preparationMode: 'off', accessoryMode: 'off', meetPlannerAttempts: {},
  });
  expect(nextCycleWorkouts.some(workout => workout.type === 'meet')).toBe(true);
  const specs = buildCalendarPlanningEventSpecs({
    workouts: [{ number: 30, type: 'rest' }], scheduleDateKeys: ['2026-10-13'],
    currentCycle: 5, nextCycleWorkouts, today: new Date(2026, 9, 13),
    provisionalTitleTemplate: 'Provisional C{cycle}W{workout}',
  });
  expect(specs.length).toBeGreaterThan(7);
  expect(specs.every(event => event.cycleId === 6 && event.provisional)).toBe(true);
  expect(specs[0].dateKey).toBe('2026-10-14');
  expect(specs.at(-1).workoutId).toBe(nextCycleWorkouts.find(workout => workout.type === 'meet').number);
});

test('rest identities cover only explicit rest days in the current and forecast cycles', () => {
  expect([...getCalendarRestWorkoutKeys({ currentCycle: 8,
    workouts: [{ number: 12, type: 'rest' }, { number: 13, type: 'meet' }],
    nextCycleWorkouts: [{ number: 1, type: 'training' }, { number: 2, type: 'rest' }],
  })]).toEqual(['8:12', '9:2']);
});
