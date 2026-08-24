import { buildMilestoneCelebration } from './milestoneAchievements';

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
