import {
  generateWorkoutsForTrainingModel,
  regenerateSmartWorkoutsAfterCompletion,
} from './App';

function roundWeight(max, pct) {
  return Math.round((Number(max) * Number(pct)) / 2.5) * 2.5;
}

function setFor(max, {
  labelKey,
  reps,
  pct,
  effort,
}) {
  const weight = roundWeight(max, pct);

  return {
    labelKey,
    reps,
    pct,
    weight,
    originalPct: pct,
    originalWeight: weight,
    done: true,
    failed: false,
    skipped: false,
    ...(effort ? { effort } : {}),
  };
}

function makeTrainingEntry({
  number,
  primaryLift,
  blocks,
  workoutEffort = 'good',
}) {
  return {
    cycle: 1,
    workoutNumber: number,
    lift: primaryLift,
    workoutEffort,
    failedOrSkippedSetCount: 0,
    workoutSnapshot: {
      number,
      type: 'training',
      smartDayType: 'training',
      lift: primaryLift,
      lifts: blocks,
      sets: blocks[0]?.sets || [],
      warmups: [],
      prepItems: [],
      accessories: [],
      cooldownItems: [],
      workoutEffort,
      completed: true,
    },
  };
}

function makeRecoveryEntry(number) {
  return {
    cycle: 1,
    workoutNumber: number,
    restDay: true,
    completionOnly: true,
    smartDayType: 'recovery',
    workoutEffort: 'easy',
    workoutSnapshot: {
      number,
      type: 'rest',
      smartDayType: 'recovery',
      lifts: [],
      sets: [],
      workoutEffort: 'easy',
      completed: true,
    },
  };
}

function buildLoadBalanceHistory(maxes) {
  return [
    makeTrainingEntry({
      number: 5,
      primaryLift: 'Deadlift',
      blocks: [
        {
          lift: 'Deadlift',
          sets: [
            setFor(maxes.Deadlift, {
              labelKey: 'topTriple', reps: 3, pct: 0.725,
            }),
            setFor(maxes.Deadlift, {
              labelKey: 'backoff', reps: 4, pct: 0.65,
            }),
            setFor(maxes.Deadlift, {
              labelKey: 'backoff', reps: 4, pct: 0.65,
            }),
          ],
        },
        {
          lift: 'Squat',
          sets: [
            setFor(maxes.Squat, {
              labelKey: 'workSets', reps: 5, pct: 0.60,
            }),
            setFor(maxes.Squat, {
              labelKey: 'workSets', reps: 5, pct: 0.60,
            }),
          ],
        },
      ],
    }),
    makeTrainingEntry({
      number: 6,
      primaryLift: 'Bench',
      workoutEffort: 'hard',
      blocks: [{
        lift: 'Bench',
        sets: Array.from({ length: 4 }, () =>
          setFor(maxes.Bench, {
            labelKey: 'workSets', reps: 5, pct: 0.675,
          })
        ),
      }],
    }),
    makeTrainingEntry({
      number: 7,
      primaryLift: 'Deadlift',
      blocks: [{
        lift: 'Deadlift',
        sets: [
          setFor(maxes.Deadlift, {
            labelKey: 'topDouble', reps: 2, pct: 0.775, effort: 'hard',
          }),
          setFor(maxes.Deadlift, {
            labelKey: 'backoff', reps: 3, pct: 0.70,
          }),
          setFor(maxes.Deadlift, {
            labelKey: 'backoff', reps: 3, pct: 0.70,
          }),
        ],
      }],
    }),
    makeRecoveryEntry(8),
    makeTrainingEntry({
      number: 9,
      primaryLift: 'Deadlift',
      workoutEffort: 'hard',
      blocks: [
        {
          lift: 'Deadlift',
          role: 'primary',
          sets: [
            setFor(maxes.Deadlift, {
              labelKey: 'topDouble', reps: 2, pct: 0.80,
            }),
            ...Array.from({ length: 4 }, () =>
              setFor(maxes.Deadlift, {
                labelKey: 'backoff', reps: 4, pct: 0.70,
              })
            ),
          ],
        },
        {
          lift: 'Squat',
          role: 'secondary',
          sets: Array.from({ length: 4 }, () =>
            setFor(maxes.Squat, {
              labelKey: 'workSets', reps: 5, pct: 0.625,
            })
          ),
        },
      ],
    }),
    makeTrainingEntry({
      number: 10,
      primaryLift: 'Bench',
      blocks: [{
        lift: 'Bench',
        role: 'primary',
        sets: [
          setFor(maxes.Bench, {
            labelKey: 'topTriple', reps: 3, pct: 0.70,
          }),
          ...Array.from({ length: 6 }, () =>
            setFor(maxes.Bench, {
              labelKey: 'backoff', reps: 6, pct: 0.60,
            })
          ),
        ],
      }],
    }),
  ];
}

const scenarios = [
  {
    label: 'lighter lifter',
    maxes: { Squat: 42.5, Bench: 32.5, Deadlift: 60 },
    attempts: {
      Squat: [37.5, 42.5, 42.5],
      Bench: [30, 32.5, 32.5],
      Deadlift: [55, 57.5, 62.5],
    },
  },
  {
    label: 'stronger lifter',
    maxes: { Squat: 145, Bench: 100, Deadlift: 180 },
    attempts: {
      Squat: [130, 140, 147.5],
      Bench: [90, 95, 100],
      Deadlift: [162.5, 175, 185],
    },
  },
];

test.each(scenarios)(
  'balances primary load after repeated heavy days for a $label',
  ({ maxes, attempts }) => {
    const workouts = generateWorkoutsForTrainingModel('smart', {
      programProfile: 'kelaniSbd',
      squat: maxes.Squat,
      bench: maxes.Bench,
      deadlift: maxes.Deadlift,
      history: buildLoadBalanceHistory(maxes),
      currentIndex: 10,
      currentCycle: 1,
      meetPlannerAttempts: attempts,
    });

    const decisionWorkout = workouts.find(workout =>
      workout?.smartDecisionSummary
    );

    expect(decisionWorkout).toBeTruthy();
    expect(decisionWorkout.smartDecisionSummary.dayType).toBe('training');

    const selection = decisionWorkout.smartTrainingSelectionSummary;

    expect(selection.primaryLift).toBe('Squat');
    expect(selection.secondaryLift).toBe('Bench');
    expect(selection.candidateLifts).toEqual(['Squat', 'Bench']);
    expect(selection.candidateLifts).not.toContain('Deadlift');

    expect(selection.frequencyExposureCounts).toEqual({
      Squat: 2,
      Bench: 2,
      Deadlift: 3,
    });
    expect(selection.frequencyPrimaryExposureCounts).toEqual({
      Squat: 0,
      Bench: 2,
      Deadlift: 3,
    });
    expect(selection.frequencySecondaryExposureCounts).toEqual({
      Squat: 2,
      Bench: 0,
      Deadlift: 0,
    });
    expect(selection.frequencyWeightedExposureCounts).toEqual({
      Squat: 1,
      Bench: 2,
      Deadlift: 3,
    });
    expect(selection.frequencyLastPrimaryLift).toBe('Bench');
    expect(selection.frequencyPrimaryEligibleLifts).toEqual(['Squat']);
    expect(selection.frequencySecondaryEligibleLifts).toEqual(['Bench']);
    expect(selection.reasonFlags).toEqual(
      expect.arrayContaining([
        'primary-load-balance',
        'secondary-frequency-guard',
        'avoided-consecutive-primary',
      ])
    );

    expect(decisionWorkout.lifts.map(block => ({
      lift: block.lift,
      role: block.role,
    }))).toEqual([
      { lift: 'Squat', role: 'primary' },
      { lift: 'Bench', role: 'secondary' },
    ]);
  }
);

test('replaces a stale pre-generated next workout immediately after completion', () => {
  const maxes = { Squat: 42.5, Bench: 32.5, Deadlift: 60 };
  const nextHistory = buildLoadBalanceHistory(maxes);
  const finishedWorkout = nextHistory[nextHistory.length - 1].workoutSnapshot;

  const staleWorkouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbd',
    squat: maxes.Squat,
    bench: maxes.Bench,
    deadlift: maxes.Deadlift,
    history: nextHistory.slice(0, -1),
    currentIndex: 10,
    currentCycle: 1,
  });

  staleWorkouts[9] = finishedWorkout;
  staleWorkouts[10] = {
    number: 11,
    type: 'training',
    lift: 'Bench',
    smartGeneratedPrescription: true,
    smartGeneratedPrescriptionVersion: 3,
    lifts: [{
      lift: 'Bench',
      role: 'primary',
      sets: [{
        labelKey: 'topDouble',
        reps: 2,
        pct: 0.825,
        weight: 27.5,
        originalPct: 0.825,
        originalWeight: 27.5,
        done: false,
      }],
    }],
    sets: [],
    warmups: [],
    prepItems: [],
    accessories: [],
    cooldownItems: [],
  };

  const refreshedWorkouts = regenerateSmartWorkoutsAfterCompletion({
    workouts: staleWorkouts,
    finishedWorkout,
    completedIndex: 9,
    nextHistory,
    currentCycle: 1,
    nextWorkoutIndex: 10,
    generationOptions: {
      programProfile: 'kelaniSbd',
      squat: maxes.Squat,
      bench: maxes.Bench,
      deadlift: maxes.Deadlift,
    },
  });

  expect(refreshedWorkouts[9]).toMatchObject({
    number: 10,
    completed: true,
    lift: 'Bench',
  });
  expect(refreshedWorkouts[10].smartTrainingSelectionSummary).toMatchObject({
    primaryLift: 'Squat',
    secondaryLift: 'Bench',
    frequencyLastPrimaryLift: 'Bench',
  });
  expect(refreshedWorkouts[10].lifts.map(block => block.lift)).toEqual([
    'Squat',
    'Bench',
  ]);
  expect(
    refreshedWorkouts[10].smartGeneratedPrescriptionVersion
  ).toBe(7);
  expect(
    refreshedWorkouts[10].lifts[0].sets.slice(1)
  ).toHaveLength(3);
  expect(
    refreshedWorkouts[10].lifts[1].sets
  ).toHaveLength(3);
});
