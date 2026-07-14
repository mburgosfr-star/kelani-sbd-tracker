import {
  generateUltraProgram,
  getSmartMeetdayBlockerDisplayLabels,
  getSmartModalDetailRows,
  repeatsHeavyPrimaryLift,
} from './App';

test('uses four-rep volume work at 70% after the Deadlift top double', () => {
  const workouts = generateUltraProgram(145, 100, 180);
  const workout = workouts.find(
    item => item.label === 'Ultra Deadlift + Bench Volume'
  );

  expect(workout).toBeTruthy();

  const deadlift = workout.lifts.find(item => item.lift === 'Deadlift');
  const bench = workout.lifts.find(item => item.lift === 'Bench');

  expect(deadlift.sets).toHaveLength(5);
  expect(deadlift.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    pct: 0.8,
  });

  expect(deadlift.sets.slice(1)).toHaveLength(4);
  deadlift.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.7,
    });
  });

  expect(bench.sets).toHaveLength(4);
  bench.sets.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'workSets',
      reps: 4,
      pct: 0.7,
    });
  });
});


test('gives the Ultra Squat Opener a full four-by-four backoff block', () => {
  const workouts = generateUltraProgram(145, 100, 180);
  const workout = workouts.find(item => item.label === 'Ultra Squat Opener');

  expect(workout).toBeTruthy();

  const squat = workout.lifts.find(item => item.lift === 'Squat');

  expect(squat.sets).toHaveLength(5);
  expect(squat.sets[0]).toMatchObject({
    labelKey: 'opener',
    reps: 1,
    pct: 0.9,
  });

  squat.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.7,
    });
  });
});


test('blocks the previous HARD primary lift only when it is heavy again', () => {
  const readiness = {
    lastWorkoutEffort: 'hard',
    lastWorkoutPrimaryLift: 'Deadlift',
  };

  const repeatedHeavyDeadlift = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      sets: [{ labelKey: 'topDouble', reps: 2, pct: 0.8 }],
    }],
  };
  const lightDeadlift = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      sets: [{ labelKey: 'workSets', reps: 4, pct: 0.7 }],
    }],
  };
  const heavySquat = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'topSingle', reps: 1, pct: 0.9 }],
    }],
  };

  expect(repeatsHeavyPrimaryLift(repeatedHeavyDeadlift, readiness)).toBe(true);
  expect(repeatsHeavyPrimaryLift(lightDeadlift, readiness)).toBe(false);
  expect(repeatsHeavyPrimaryLift(heavySquat, readiness)).toBe(false);
});


test('explains fatigue with score and previous workout effort', () => {
  expect(
    getSmartMeetdayBlockerDisplayLabels(
      ['fatigue', 'meet-plan-not-ready'],
      {},
      {
        recentFatigueScore: 1,
        lastWorkoutEffort: 'hard',
      }
    )
  ).toEqual([
    'fatigue 1/2 (previous workout HARD)',
    'meet plan',
  ]);
});


test('splits training fallback details into separate modal rows', () => {
  expect(
    getSmartModalDetailRows({
      smartDecisionSummary: {
        dayType: 'training',
        reason: 'training-fallback',
        readiness: {
          meetPlanReady: false,
          meetdayBlockers: ['meet-plan-not-ready', 'fatigue'],
          recentFatigueScore: 1,
          lastWorkoutEffort: 'hard',
        },
      },
    })
  ).toEqual([
    {
      label: 'Meet status',
      value: 'Meet plan not ready',
    },
    {
      label: 'Fatigue',
      value: '1/2 — previous workout HARD',
    },
  ]);
});
