import {
  calculateAchievedMaxesFromHistory,
  calculateBestMaxesFromHistory,
  getActualOneRMFromSets,
  getTopWeightFromSets,
  buildCompletedWorkoutLiftSummaries,
  isFlatLegacyTrainingWorkout,
  getCurrentCycleBestMaxes,
} from './workoutHistoryStats';
import { buildSmartMeetPlanReadiness } from './smartTrainingEngine';

function trainingEntry(sets) {
  const successfulSets = sets.filter(set => set.done && !set.failed && !set.skipped);
  const topSet = successfulSets.reduce((best, set) => (
    set.weight * (1 + set.reps / 30) > best.weight * (1 + best.reps / 30)
      ? set
      : best
  ), successfulSets[0]);

  return {
    cycle: 1,
    workoutNumber: 1,
    lift: 'Squat',
    topWeight: topSet.weight,
    topReps: topSet.reps,
    e1rm: topSet.weight * (1 + topSet.reps / 30),
    workoutSnapshot: {
      type: 'training',
      lifts: [{ lift: 'Squat', sets }],
    },
  };
}

test('every successful work set establishes its weight as a real 1RM floor', () => {
  const sets = [
    { weight: 102.5, reps: 5, done: true, failed: false, skipped: false },
    { weight: 100, reps: 1, done: true, failed: false, skipped: false },
    { weight: 110, reps: 1, done: true, failed: true, skipped: false },
    { weight: 115, reps: 3, done: true, failed: false, skipped: true },
    { weight: 120, reps: 5, done: true, failed: false, skipped: false, warmup: true },
  ];

  expect(getActualOneRMFromSets(sets)).toBe(102.5);
  const achieved = calculateAchievedMaxesFromHistory([
    trainingEntry(sets.filter(set => !set.warmup)),
  ]).Squat;
  expect(achieved.oneRM).toBe(102.5);
  expect(achieved.e1rm).toBeCloseTo(119.5833333333);
});

test('workout-complete and real 1RM both use the heaviest successful work-set weight', () => {
  const sets = [
    { weight: 120, reps: 3, done: true, failed: false, skipped: false },
    { weight: 100, reps: 5, done: true, failed: false, skipped: false },
  ];

  // Five or three successful reps prove that the same weight can be lifted
  // once, so the real-1RM floor and the completion display agree.
  expect(getActualOneRMFromSets(sets)).toBe(120);
  expect(getTopWeightFromSets(sets)).toBe(120);
});

test('workout-complete summary includes every trackable lift of the day, not only the first', () => {
  const completedWorkout = {
    type: 'training',
    number: 5,
    lifts: [
      { lift: 'Squat', sets: [{ weight: 100, reps: 5, done: true, failed: false, skipped: false }] },
      { lift: 'Bench', sets: [{ weight: 60, reps: 8, done: true, failed: false, skipped: false }] },
    ],
  };
  const completedSummary = {
    type: 'multiTraining',
    results: [
      { lift: 'Squat', trackStrength: true, oneRMToday: 100, e1RMToday: 116.7 },
      { lift: 'Bench', trackStrength: true, oneRMToday: 60, e1RMToday: 76 },
    ],
  };

  const summaries = buildCompletedWorkoutLiftSummaries({
    completedSummary,
    completedWorkout,
    best1RMs: { Squat: 110, Bench: 65, Deadlift: 150 },
    bestE1RMs: { Squat: 120, Bench: 78, Deadlift: 170 },
    prs: {},
  });

  expect(summaries).toHaveLength(2);
  expect(summaries.map(s => s.lift)).toEqual(['Squat', 'Bench']);
  expect(summaries[0]).toMatchObject({ lift: 'Squat', oneRMToday: 100, e1RMToday: 116.7 });
  expect(summaries[1]).toMatchObject({ lift: 'Bench', oneRMToday: 60, e1RMToday: 76 });
});

test('workout-complete summary skips lifts that are not strength-tracked', () => {
  const completedWorkout = {
    type: 'training',
    number: 5,
    lifts: [
      { lift: 'Squat', sets: [{ weight: 100, reps: 5, done: true, failed: false, skipped: false }] },
      { lift: 'Bench', sets: [] },
    ],
  };
  const completedSummary = {
    type: 'multiTraining',
    results: [
      { lift: 'Squat', trackStrength: true, oneRMToday: 100, e1RMToday: 116.7 },
      { lift: 'Bench', trackStrength: false, oneRMToday: 0, e1RMToday: 0 },
    ],
  };

  const summaries = buildCompletedWorkoutLiftSummaries({
    completedSummary,
    completedWorkout,
    best1RMs: { Squat: 110, Bench: 65, Deadlift: 150 },
    bestE1RMs: { Squat: 120, Bench: 78, Deadlift: 170 },
    prs: {},
  });

  expect(summaries.map(s => s.lift)).toEqual(['Squat']);
});

test('a workout already described by workout.lifts is never treated as flat-legacy', () => {
  // The Smart ideal route mirrors its primary lift onto workout.lift for
  // backward compatibility even on a genuine multi-lift day (e.g. Squat
  // heavy + Bench light). A completion handler that used workout.lift alone
  // to decide "is this a single-lift workout" would wrongly re-complete an
  // already-handled multi-lift day and collapse its result to one lift.
  expect(isFlatLegacyTrainingWorkout({
    type: 'training',
    lift: 'Squat',
    lifts: [{ lift: 'Squat' }, { lift: 'Bench' }],
  })).toBe(false);

  expect(isFlatLegacyTrainingWorkout({ type: 'training', lift: 'Squat', lifts: [] })).toBe(true);
  expect(isFlatLegacyTrainingWorkout({ type: 'training', lift: 'Squat' })).toBe(true);
  expect(isFlatLegacyTrainingWorkout({ type: 'meet', lift: 'Squat', lifts: [] })).toBe(false);
  expect(isFlatLegacyTrainingWorkout({ type: 'rest' })).toBe(false);
});

test('a heavier double raises both the real 1RM floor and e1RM', () => {
  const seed = {
    cycle: 0,
    workoutNumber: 0,
    seedMax: true,
    lift: 'Squat',
    topWeight: 100,
    topReps: 1,
    e1rm: 100,
  };
  const heavierDouble = trainingEntry([
    { weight: 105, reps: 2, done: true, failed: false, skipped: false },
  ]);
  const history = [seed, heavierDouble];

  expect(calculateBestMaxesFromHistory(history).Squat.oneRM).toBe(105);
  expect(calculateBestMaxesFromHistory(history).Squat.e1rm).toBeGreaterThan(105);
  expect(buildSmartMeetPlanReadiness({
    history,
    prs: { Squat: 112.5, Bench: 75, Deadlift: 125 },
    currentCycle: 1,
  }).byLift.Squat.attempts).toEqual({
    opener: 95,
    secondAttempt: 102.5,
    thirdAttempt: 107.5,
  });
});

test('the current-cycle best e1RM never leaks in an all-time PR from a previous cycle', () => {
  // The Smart modal must show meet-readiness numbers scoped to what has
  // actually been achieved within the active cycle. An all-time best e1RM
  // set in a previous cycle must not make this cycle's "Gap" read as
  // resolved (0 kg) while the blocker list - which is scoped the same way -
  // still names the lift, or the two visibly contradict each other.
  const history = [
    { cycle: 3, workoutNumber: 20, lift: 'Squat', topWeight: 145, topReps: 2, e1rm: 155 },
    { cycle: 4, workoutNumber: 1, lift: 'Squat', topWeight: 100, topReps: 5, e1rm: 116.7 },
  ];

  expect(getCurrentCycleBestMaxes(history, 4).Squat.e1rm).toBeCloseTo(116.7, 1);
  expect(calculateBestMaxesFromHistory(history).Squat.e1rm).toBe(155);
});

test('seed/manual maxes and other cycles never count toward the current cycle e1RM', () => {
  const history = [
    { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Bench', topWeight: 90, topReps: 1, e1rm: 90 },
    { cycle: 3, workoutNumber: 12, lift: 'Bench', topWeight: 95, topReps: 3, e1rm: 103.75 },
    { cycle: 4, workoutNumber: 2, lift: 'Bench', topWeight: 92.5, topReps: 3, e1rm: 101 },
  ];

  expect(getCurrentCycleBestMaxes(history, 4).Bench.e1rm).toBeCloseTo(101, 1);
});

test('a genuinely heavier single immediately updates automatic meet attempts', () => {
  const history = [
    {
      cycle: 0,
      workoutNumber: 0,
      seedMax: true,
      lift: 'Squat',
      topWeight: 100,
      topReps: 1,
      e1rm: 100,
    },
    trainingEntry([
      { weight: 105, reps: 1, done: true, failed: false, skipped: false },
    ]),
  ];

  expect(buildSmartMeetPlanReadiness({
    history,
    prs: { Squat: 105, Bench: 75, Deadlift: 125 },
    currentCycle: 1,
  }).byLift.Squat.attempts).toEqual({
    opener: 95,
    secondAttempt: 102.5,
    thirdAttempt: 107.5,
  });
});
