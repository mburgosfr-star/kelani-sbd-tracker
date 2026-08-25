import { buildMilestoneCelebration } from './milestoneAchievements';
import { calculateStrengthRatioMaxes } from './workoutHistoryStats';

const bodyWeights = [{ cycle: 1, workoutNumber: 0, bodyWeight: 80 }];
const baselineHistory = [
  { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Squat', topWeight: 100, e1rm: 100 },
  { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Bench', topWeight: 75, e1rm: 75 },
  { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Deadlift', topWeight: 125, e1rm: 125 },
];
const baseline = {
  history: baselineHistory,
  prs: { Squat: 100, Bench: 75, Deadlift: 125 },
  oneRMs: { Squat: 100, Bench: 75, Deadlift: 125 },
  bodyWeights,
};

function completedEntry({ lift = 'Squat', weight, reps, e1rm, failed = false }) {
  return {
    cycle: 1,
    workoutNumber: 1,
    lift,
    topWeight: weight,
    topReps: reps,
    oneRMToday: reps === 1 ? weight : 0,
    e1rm,
    workoutSnapshot: {
      type: 'training',
      completed: true,
      lifts: [{
        lift,
        sets: [{ weight, reps, done: true, failed, skipped: false }],
      }],
    },
  };
}

test('combines a lift e1RM, Total e1RM and eStrength Max in one celebration', () => {
  const history = [
    ...baselineHistory,
    completedEntry({ weight: 100, reps: 2, e1rm: 107.5 }),
  ];
  const celebration = buildMilestoneCelebration({
    before: baseline,
    after: {
      ...baseline,
      history,
      prs: { ...baseline.prs, Squat: 107.5 },
    },
    completionId: '1:1:test',
  });

  expect(celebration.completionId).toBe('1:1:test');
  expect(celebration.achievements).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'e1RM', lift: 'Squat', value: 107.5, gain: 7.5 }),
    expect.objectContaining({ type: 'e1RM', lift: 'Total', value: 307.5, gain: 7.5 }),
    expect.objectContaining({ type: 'eStrengthMax' }),
  ]));
  expect(celebration.achievements.some(item => item.type === 'oneRM')).toBe(false);
  expect(celebration.achievements.some(item => item.type === 'strengthMax')).toBe(false);
});

test('a successful new single celebrates both real and estimated records including totals', () => {
  const history = [
    ...baselineHistory,
    completedEntry({ weight: 105, reps: 1, e1rm: 105 }),
  ];
  const celebration = buildMilestoneCelebration({
    before: baseline,
    after: {
      ...baseline,
      history,
      prs: { ...baseline.prs, Squat: 105 },
      oneRMs: { ...baseline.oneRMs, Squat: 105 },
    },
  });

  expect(celebration.achievements).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'oneRM', lift: 'Squat', gain: 5 }),
    expect.objectContaining({ type: 'oneRM', lift: 'Total', gain: 5 }),
    expect.objectContaining({ type: 'e1RM', lift: 'Squat', gain: 5 }),
    expect.objectContaining({ type: 'e1RM', lift: 'Total', gain: 5 }),
    expect.objectContaining({ type: 'strengthMax' }),
    expect.objectContaining({ type: 'eStrengthMax' }),
  ]));
});

test('an e1RM-only PR never creates Strength Max when real 1RMs come from saved state', () => {
  const history = [
    completedEntry({ weight: 100, reps: 2, e1rm: 107.5 }),
  ];
  const celebration = buildMilestoneCelebration({
    before: {
      history: [],
      prs: baseline.prs,
      oneRMs: baseline.oneRMs,
      bodyWeights,
    },
    after: {
      history,
      prs: { ...baseline.prs, Squat: 107.5 },
      oneRMs: baseline.oneRMs,
      bodyWeights,
    },
  });

  expect(celebration.achievements).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'e1RM', lift: 'Squat' }),
    expect.objectContaining({ type: 'eStrengthMax' }),
  ]));
  expect(celebration.achievements.some(item => item.type === 'strengthMax')).toBe(false);
});

test('an e1RM PR is not an eStrength Max PR while a lighter historical ratio remains higher', () => {
  const seedHistory = [
    { cycle: 1, workoutNumber: 0, seedMax: true, lift: 'Squat', topWeight: 150, e1rm: 150 },
    { cycle: 1, workoutNumber: 0, seedMax: true, lift: 'Bench', topWeight: 100, e1rm: 100 },
    { cycle: 1, workoutNumber: 0, seedMax: true, lift: 'Deadlift', topWeight: 180, e1rm: 180 },
  ];
  const priorEstimatedRecords = [
    {
      cycle: 2,
      workoutNumber: 1,
      lift: 'Bench',
      topWeight: 92.5,
      topReps: 3,
      e1rm: 102.5,
      workoutSnapshot: {
        type: 'training',
        completed: true,
        lifts: [{ lift: 'Bench', sets: [{ weight: 92.5, reps: 3, done: true }] }],
      },
    },
    {
      cycle: 2,
      workoutNumber: 1,
      lift: 'Deadlift',
      topWeight: 170,
      topReps: 2,
      e1rm: 182.5,
      workoutSnapshot: {
        type: 'training',
        completed: true,
        lifts: [{ lift: 'Deadlift', sets: [{ weight: 170, reps: 2, done: true }] }],
      },
    },
  ];
  const beforeHistory = [...seedHistory, ...priorEstimatedRecords];
  const newSquatRecord = {
    cycle: 2,
    workoutNumber: 2,
    lift: 'Squat',
    topWeight: 142.5,
    topReps: 2,
    e1rm: 152.5,
    workoutSnapshot: {
      type: 'training',
      completed: true,
      lifts: [{ lift: 'Squat', sets: [{ weight: 142.5, reps: 2, done: true }] }],
    },
  };
  const ratioBodyWeights = [
    { cycle: 1, workoutNumber: 0, bodyWeight: 80 },
    { cycle: 2, workoutNumber: 0, bodyWeight: 82.1 },
  ];
  const before = {
    history: beforeHistory,
    prs: { Squat: 150, Bench: 102.5, Deadlift: 182.5 },
    oneRMs: { Squat: 150, Bench: 100, Deadlift: 180 },
    bodyWeights: ratioBodyWeights,
  };
  const after = {
    ...before,
    history: [...beforeHistory, newSquatRecord],
    prs: { ...before.prs, Squat: 152.5 },
  };

  expect(calculateStrengthRatioMaxes(before)).toEqual({
    strengthMax: 5.38,
    eStrengthMax: 5.38,
  });
  expect(calculateStrengthRatioMaxes(after)).toEqual({
    strengthMax: 5.38,
    eStrengthMax: 5.38,
  });

  const celebration = buildMilestoneCelebration({ before, after });
  expect(celebration.achievements).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'e1RM', lift: 'Squat', gain: 2.5 }),
    expect.objectContaining({ type: 'e1RM', lift: 'Total', gain: 2.5 }),
  ]));
  expect(celebration.achievements.some(item => item.type === 'strengthMax')).toBe(false);
  expect(celebration.achievements.some(item => item.type === 'eStrengthMax')).toBe(false);
});

test('a level increase is the primary milestone', () => {
  const nearIntermediate = {
    history: [
      { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Squat', topWeight: 80, e1rm: 80 },
      { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Bench', topWeight: 60, e1rm: 60 },
      { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Deadlift', topWeight: 97.5, e1rm: 97.5 },
    ],
    prs: { Squat: 80, Bench: 60, Deadlift: 97.5 },
    oneRMs: { Squat: 80, Bench: 60, Deadlift: 97.5 },
    bodyWeights,
  };
  const newEntry = completedEntry({ weight: 82.5, reps: 1, e1rm: 82.5 });
  const celebration = buildMilestoneCelebration({
    before: nearIntermediate,
    after: {
      ...nearIntermediate,
      history: [...nearIntermediate.history, newEntry],
      prs: { ...nearIntermediate.prs, Squat: 82.5 },
      oneRMs: { ...nearIntermediate.oneRMs, Squat: 82.5 },
    },
  });

  expect(celebration.primaryType).toBe('level');
  expect(celebration.achievements[0]).toEqual({
    type: 'level',
    previous: 'beginner',
    value: 'intermediate',
  });
});

test('rest and failed work cannot create a milestone', () => {
  expect(buildMilestoneCelebration({ before: baseline, after: baseline })).toBeNull();

  const failedEntry = completedEntry({ weight: 150, reps: 1, e1rm: 0, failed: true });
  failedEntry.topWeight = 0;
  failedEntry.topReps = 0;
  failedEntry.oneRMToday = 0;
  const failedHistory = [...baselineHistory, failedEntry];
  expect(buildMilestoneCelebration({
    before: baseline,
    after: { ...baseline, history: failedHistory },
  })).toBeNull();
});
