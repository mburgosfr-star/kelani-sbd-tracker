import {
  buildSmartIdealTrainingWorkout,
  countFailedOrSkippedSetsFromSnapshot,
  generateWorkoutsForTrainingModel,
  getNextSmartIdealRouteWorkoutNumber,
  hasAutomaticTooHardWorkoutOutcome,
  isSmartCycleCompleteAfterHistory,
  isSmartIdealRoutePristine,
  shouldFollowSmartIdealRoute,
} from './smartTrainingEngine';
import {
  SMART_DAY_TYPES,
  SMART_DECISION_REASONS,
  TRAINING_MODELS,
} from './smartTrainingConstants';
import {
  SMART_IDEAL_LEVELS,
  getSmartIdealRouteWorkout,
} from './smartIdealRoute';
import { warmupLoadJumpsNeverIncrease } from './warmupAndPrepGeneration';

const baseOptions = {
  programProfile: 'kelaniSbd',
  squat: 150,
  bench: 100,
  deadlift: 200,
  accessoryMode: 'off',
  preparationMode: 'off',
  currentCycle: 1,
  idealRouteEnabled: true,
};

function generateCurrent({
  history = [],
  currentIndex = 0,
  athleteLevel = 'intermediate',
  options = {},
} = {}) {
  return generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, {
    ...baseOptions,
    ...options,
    athleteLevel,
    history,
    currentIndex,
  })[currentIndex];
}

test.each(SMART_IDEAL_LEVELS)(
  'Smart defaults to the complete canonical %s route without Classic substitutions',
  athleteLevel => {
    const { idealRouteEnabled: _legacyFlag, ...options } = baseOptions;
    const workouts = generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, {
      ...options,
      athleteLevel,
      history: [],
      currentIndex: 0,
    });

    for (let workoutNumber = 1; workoutNumber <= 28; workoutNumber += 1) {
      const expected = getSmartIdealRouteWorkout({
        athleteLevel,
        workoutNumber,
      });
      const actual = workouts[workoutNumber - 1];

      expect(actual).toMatchObject({
        number: workoutNumber,
        type: expected.type,
        smartIdealRoute: {
          workoutNumber,
          stage: expected.stage,
        },
      });
      expect((actual.lifts || []).map(({ lift, intensityRole }) => ({
        lift,
        intensityRole: intensityRole || (expected.type === 'meet' ? 'meet' : null),
      }))).toEqual(expected.lifts.map(({ lift, intensityRole }) => ({
        lift,
        intensityRole,
      })));

      if (actual.type === 'training') {
        expect(actual.smartSourceWorkoutNumber).toBeNull();
        expect(actual.smartFrequencyValidated).toBe(true);
        if (workoutNumber === 1) {
          expect(actual.smartTrainingSelectionSummary).toMatchObject({
            templateIndependent: true,
            reasonFlags: expect.arrayContaining(['ideal-route']),
          });
        }
      }
    }
  }
);

test('Classic generation remains separate and never receives Smart route metadata', () => {
  const classic = generateWorkoutsForTrainingModel(TRAINING_MODELS.CLASSIC, {
    ...baseOptions,
    idealRouteEnabled: true,
  });

  expect(classic).toHaveLength(28);
  expect(classic.every(workout => !workout.smartIdealRoute)).toBe(true);
  expect(classic[27]).toMatchObject({ number: 28, type: 'meet' });
});

test('Smart exposes the full provisional ideal route through meet and one recovery day', () => {
  const workouts = generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, {
    ...baseOptions,
    athleteLevel: 'intermediate',
    history: [],
    currentIndex: 0,
  });
  const visible = workouts.filter(workout => workout.smartVisible !== false);

  expect(visible).toHaveLength(29);
  expect(visible[0]).toMatchObject({
    number: 1,
    type: 'training',
    smartSelectable: true,
  });
  expect(visible.slice(1).every(workout => (
    workout.smartFuturePreview === true && workout.smartSelectable === false
  ))).toBe(true);
  expect(visible[27]).toMatchObject({
    number: 28,
    type: 'meet',
    smartIdealRoute: { workoutNumber: 28, stage: 'meet' },
  });
  expect(visible[28]).toMatchObject({
    number: 29,
    type: 'rest',
    smartIdealRoute: { workoutNumber: 29, stage: 'post-meet' },
  });

  visible
    .filter(workout => workout.type === 'training')
    .forEach(workout => {
      expect(workout.lifts.length).toBeGreaterThan(0);
      workout.lifts.forEach(liftBlock => {
        expect(liftBlock.sets.length).toBeGreaterThan(0);
      });
    });
});

test('Smart previews every required recovery day after a meet with failed attempts', () => {
  let history = [];

  for (let index = 0; index < 28; index += 1) {
    const workout = generateCurrent({
      history,
      currentIndex: index,
      athleteLevel: 'intermediate',
    });
    history = workout.type === 'meet'
      ? completeWorkoutWithFailures(history, workout, { failedSetCount: 3 })
      : completeWorkout(history, workout);
  }

  const workouts = generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, {
    ...baseOptions,
    athleteLevel: 'intermediate',
    history,
    currentIndex: 28,
  });
  const recoveryPreview = workouts
    .filter(workout => workout.smartVisible !== false)
    .slice(28);

  expect(recoveryPreview).toHaveLength(3);
  expect(recoveryPreview.map(workout => ({
    number: workout.number,
    type: workout.type,
    stage: workout.smartIdealRoute?.stage,
    target: workout.smartIdealRoute?.postMeetRecoveryTarget,
  }))).toEqual(Array.from({ length: 3 }, (_, offset) => ({
    number: 29 + offset,
    type: 'rest',
    stage: 'post-meet',
    target: 3,
  })));
  expect(recoveryPreview[0]).toMatchObject({
    number: 29,
    smartSelectable: true,
  });
  expect(recoveryPreview.slice(1).every(workout => (
    workout.smartFuturePreview === true && workout.smartSelectable === false
  ))).toBe(true);
});

function completeWorkout(history, workout, effort = 'good') {
  const completed = {
    ...workout,
    completed: true,
    workoutEffort: workout.type === 'rest' ? 'easy' : effort,
    lifts: (workout.lifts || []).map(liftBlock => ({
      ...liftBlock,
      warmups: (liftBlock.warmups || []).map(item => ({ ...item, done: true })),
      sets: (liftBlock.sets || []).map(set => ({
        ...set,
        done: true,
        failed: false,
        skipped: false,
      })),
    })),
  };
  completed.warmups = completed.lifts[0]?.warmups || [];
  completed.sets = completed.lifts[0]?.sets || [];

  if (completed.type === 'rest') {
    return [...history, {
      cycle: 1,
      workoutNumber: completed.number,
      restDay: true,
      completionOnly: true,
      workoutEffort: 'easy',
      smartDayType: SMART_DAY_TYPES.RECOVERY,
      workoutSnapshot: completed,
    }];
  }

  return [
    ...history,
    ...(completed.lifts || []).map(liftBlock => ({
      cycle: 1,
      workoutNumber: completed.number,
      lift: liftBlock.lift,
      workoutEffort: completed.workoutEffort,
      smartDayType: completed.type === 'meet'
        ? SMART_DAY_TYPES.MEET
        : SMART_DAY_TYPES.TRAINING,
      workoutSnapshot: completed,
    })),
  ];
}

function completeWorkoutWithFailures(
  history,
  workout,
  { failedSetCount = 1, accessoryFailure = false } = {}
) {
  const nextHistory = completeWorkout(history, workout, 'hard');
  const completedSnapshot = nextHistory.at(-1)?.workoutSnapshot;
  let remainingFailures = Math.max(Number(failedSetCount) || 0, 0);

  (completedSnapshot?.lifts || []).forEach(liftBlock => {
    (liftBlock.sets || []).forEach(set => {
      if (remainingFailures <= 0) return;
      set.done = true;
      set.failed = true;
      set.skipped = true;
      remainingFailures -= 1;
    });
  });

  if (accessoryFailure) {
    completedSnapshot.accessories = [{
      name: 'Row',
      done: [true],
      failed: [true],
      skipped: [true],
    }];
  }

  return nextHistory;
}

function legacyEntry({ workoutNumber, type = 'training', effort = 'good' }) {
  return {
    cycle: 1,
    workoutNumber,
    lift: 'Squat',
    workoutEffort: effort,
    smartDayType: type === 'meet' ? SMART_DAY_TYPES.MEET : SMART_DAY_TYPES.TRAINING,
    workoutSnapshot: {
      number: workoutNumber,
      type,
      workoutEffort: effort,
      lifts: [{
        lift: 'Squat',
        sets: [{ weight: 100, reps: 5, done: true, failed: false, skipped: false }],
      }],
    },
  };
}

function legacyWorkoutEntries({
  workoutNumber,
  effort = 'good',
  lifts = [],
  rest = false,
}) {
  const snapshot = {
    number: workoutNumber,
    type: rest ? 'rest' : 'training',
    workoutEffort: rest ? 'easy' : effort,
    lifts: lifts.map(({ lift, weight, reps, intensityRole }) => ({
      lift,
      intensityRole,
      sets: [{
        weight,
        reps,
        done: true,
        failed: false,
        skipped: false,
      }],
    })),
  };

  if (rest) {
    return [{
      cycle: 1,
      workoutNumber,
      restDay: true,
      completionOnly: true,
      workoutEffort: 'easy',
      smartDayType: SMART_DAY_TYPES.RECOVERY,
      workoutSnapshot: snapshot,
    }];
  }

  return lifts.map(({ lift, weight, reps, e1rm }) => ({
    cycle: 1,
    workoutNumber,
    lift,
    topWeight: weight,
    topReps: reps,
    e1rm: Number(e1rm) || weight * (1 + reps / 30),
    workoutEffort: effort,
    smartDayType: SMART_DAY_TYPES.TRAINING,
    workoutSnapshot: snapshot,
  }));
}

function expectFullLiftGrids(workout) {
  (workout.lifts || []).forEach(liftBlock => {
    expect(liftBlock.warmups.length + liftBlock.sets.length).toBeGreaterThan(0);

    if (workout.type === 'meet') {
      // Meet warm-ups and the three attempts are two separate complete
      // rows. Their combined item count is deliberately not padded to a
      // multiple of four.
      expect(liftBlock.warmups.length).toBeGreaterThan(0);
      expect(liftBlock.warmups.length).toBeLessThanOrEqual(4);
      expect(liftBlock.sets).toHaveLength(3);
      return;
    }

    expect((liftBlock.warmups.length + liftBlock.sets.length) % 4).toBe(0);
    expect(liftBlock.smartPrescription?.completeGrid).toBe(true);
  });
}

test('automatic TOO HARD counts explicit accessory failures but ignores untouched optional work', () => {
  const snapshot = {
    type: 'training',
    lifts: [{
      lift: 'Bench',
      sets: [{ done: true, failed: false, skipped: false }],
    }],
    accessories: [{
      name: 'Row',
      done: [false, true],
      failed: [false, true],
      skipped: [false, true],
    }],
  };

  expect(countFailedOrSkippedSetsFromSnapshot(snapshot)).toBe(1);
  expect(hasAutomaticTooHardWorkoutOutcome(snapshot)).toBe(true);
  expect(hasAutomaticTooHardWorkoutOutcome({
    ...snapshot,
    accessories: [{
      name: 'Row',
      done: [false, false],
      failed: [false, false],
      skipped: [false, false],
    }],
  })).toBe(false);
});

test('a legacy MAX set is normalized to the automatic TOO HARD outcome', () => {
  expect(hasAutomaticTooHardWorkoutOutcome({
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ done: true, effort: 'max' }],
    }],
  })).toBe(true);
});

test('the live ideal route starts with the exact intermediate W1 prescription', () => {
  const workout = generateCurrent();

  expect(workout.smartDecisionSummary).toMatchObject({
    dayType: SMART_DAY_TYPES.TRAINING,
    reason: SMART_DECISION_REASONS.IDEAL_ROUTE,
    readiness: {
      meetProjection: {
        available: true,
        minimumWorkoutNumber: 28,
        maximumWorkoutNumber: 28,
        label: 'C1W28',
        projectedByIdealRoute: true,
      },
    },
  });
  expect(workout.smartIdealRoute).toMatchObject({
    version: 1,
    workoutNumber: 1,
    athleteLevel: 'intermediate',
    stage: 'normal',
    phase: 'triple',
  });
  expect(workout.lifts.map(({ lift, intensityRole }) => [lift, intensityRole]))
    .toEqual([
      ['Squat', 'heavy'],
      ['Bench', 'light'],
    ]);

  const squat = workout.lifts[0];
  expect(squat.sets[0]).toMatchObject({
    labelKey: 'topTriple',
    reps: 3,
    precisePct: 0.9,
    weight: 135,
  });
  expect(squat.sets.slice(1).every(set => (
    set.labelKey === 'backoff' &&
    set.reps === 6 &&
    set.precisePct === 0.6
  ))).toBe(true);

  const bench = workout.lifts[1];
  expect(bench.sets.every(set => (
    set.labelKey === 'workSets' &&
    set.precisePct === 0.6 &&
    set.weight === 60
  ))).toBe(true);
  expectFullLiftGrids(workout);
});

test('GOOD completion advances to W2 and the current level changes the route immediately', () => {
  const w1 = generateCurrent();
  const history = completeWorkout([], w1);
  const intermediateW2 = generateCurrent({ history, currentIndex: 1 });
  const eliteW2 = generateCurrent({
    history,
    currentIndex: 1,
    athleteLevel: 'elite',
  });

  expect(intermediateW2.lifts.map(({ lift, intensityRole }) => [lift, intensityRole]))
    .toEqual([
      ['Deadlift', 'medium'],
      ['Bench', 'medium'],
    ]);
  expect(eliteW2.lifts.map(({ lift, intensityRole }) => [lift, intensityRole]))
    .toEqual([
      ['Deadlift', 'medium'],
      ['Bench', 'medium'],
    ]);
  expectFullLiftGrids(eliteW2);
});

test('an ideal rest remains part of the pristine GOOD route', () => {
  let history = [];
  const w1 = generateCurrent({ history, currentIndex: 0 });
  history = completeWorkout(history, w1);
  const w2 = generateCurrent({ history, currentIndex: 1 });
  history = completeWorkout(history, w2);
  const w3 = generateCurrent({ history, currentIndex: 2 });

  expect(w3.type).toBe('rest');
  expect(w3.smartIdealRoute).toMatchObject({
    workoutNumber: 3,
    stage: 'normal',
  });

  history = completeWorkout(history, w3);
  expect(isSmartIdealRoutePristine({ history, currentCycle: 1 })).toBe(true);
});

test('TOO HARD keeps the ideal route and inserts exactly one recovery day', () => {
  const w1 = generateCurrent();
  const history = completeWorkout([], w1, 'hard');
  const next = generateCurrent({ history, currentIndex: 1 });

  expect(isSmartIdealRoutePristine({ history, currentCycle: 1 })).toBe(false);
  expect(next).toMatchObject({
    number: 2,
    type: 'rest',
    smartIdealRoute: {
      workoutNumber: 2,
      transitionPending: true,
      adjustmentReason: 'too-hard-recovery',
      delayCreditsConsumed: 1,
    },
    smartDecisionSummary: {
      reason: SMART_DECISION_REASONS.IDEAL_ROUTE,
      readiness: {
        meetProjection: {
          label: 'C1W29',
          minimumWorkoutNumber: 29,
          maximumWorkoutNumber: 29,
          delayedByTooHardCount: 1,
          pendingTooHardDelayCount: 1,
        },
      },
    },
  });
});

test('multiple failed sets in one non-meet workout still add only one rest day', () => {
  const w1 = generateCurrent();
  let history = completeWorkoutWithFailures([], w1, { failedSetCount: 2 });
  const recovery = generateCurrent({ history, currentIndex: 1 });

  expect(recovery).toMatchObject({
    number: 2,
    type: 'rest',
    smartDayType: SMART_DAY_TYPES.RECOVERY,
    smartIdealRoute: {
      workoutNumber: 2,
      transitionPending: true,
      delayCreditsConsumed: 1,
    },
    smartDecisionSummary: {
      reason: SMART_DECISION_REASONS.IDEAL_ROUTE,
      readiness: {
        meetProjection: {
          label: 'C1W29',
          delayedByTooHardCount: 1,
        },
      },
    },
  });

  history = completeWorkout(history, recovery);
  const resumedRoute = generateCurrent({ history, currentIndex: 2 });
  expect(resumedRoute).toMatchObject({
    number: 3,
    type: 'training',
    smartIdealRoute: {
      workoutNumber: 2,
      delayCreditsConsumed: 0,
    },
  });
  expect(resumedRoute.smartIdealRoute.transitionPending).toBeUndefined();
  expect(resumedRoute.smartDayType).toBe(SMART_DAY_TYPES.TRAINING);

  const controlW2 = generateCurrent({
    history: completeWorkout([], w1, 'good'),
    currentIndex: 1,
  });
  const prescription = workout => (workout.lifts || []).map(liftBlock => ({
    lift: liftBlock.lift,
    intensityRole: liftBlock.intensityRole,
    sets: (liftBlock.sets || []).map(set => ({
      reps: set.reps,
      weight: set.weight,
      pct: set.pct,
    })),
  }));
  expect(prescription(resumedRoute)).toEqual(prescription(controlW2));
});

test('an explicitly failed accessory set earns the same single TOO HARD rest day', () => {
  const w1 = generateCurrent();
  const history = completeWorkoutWithFailures([], w1, {
    failedSetCount: 0,
    accessoryFailure: true,
  });
  const recovery = generateCurrent({ history, currentIndex: 1 });

  expect(recovery).toMatchObject({
    type: 'rest',
    smartIdealRoute: {
      transitionPending: true,
      adjustmentReason: 'too-hard-recovery',
      delayCreditsConsumed: 1,
    },
  });
  expect(recovery.smartDecisionSummary?.readiness?.meetProjection?.label)
    .toBe('C1W29');
});

test('a hard beginner W1 adds a rest before rather than consuming planned W2 rest', () => {
  const w1 = generateCurrent({ athleteLevel: 'beginner' });
  let history = completeWorkout([], w1, 'hard');
  const insertedRest = generateCurrent({
    history,
    currentIndex: 1,
    athleteLevel: 'beginner',
  });

  expect(isSmartIdealRoutePristine({ history, currentCycle: 1 })).toBe(false);
  expect(insertedRest).toMatchObject({
    number: 2,
    type: 'rest',
    smartDayType: SMART_DAY_TYPES.RECOVERY,
    smartIdealRoute: {
      workoutNumber: 2,
      athleteLevel: 'beginner',
      stage: 'normal',
      transitionPending: true,
      delayCreditsConsumed: 1,
    },
    smartDecisionSummary: {
      reason: SMART_DECISION_REASONS.IDEAL_ROUTE,
    },
  });

  history = completeWorkout(history, insertedRest);
  const plannedRest = generateCurrent({
    history,
    currentIndex: 2,
    athleteLevel: 'beginner',
  });
  expect(plannedRest).toMatchObject({
    number: 3,
    type: 'rest',
    smartIdealRoute: {
      workoutNumber: 2,
      delayCreditsConsumed: 0,
    },
  });
  expect(plannedRest.smartIdealRoute.transitionPending).toBeUndefined();
});

test('failed work stays on route and is represented by one TOO HARD delay credit', () => {
  const failedRouteSnapshot = {
    number: 2,
    type: 'training',
    workoutEffort: 'tooMuch',
    smartIdealRoute: {
      version: 1,
      workoutNumber: 1,
      stage: 'normal',
      phase: 'triple',
    },
    lifts: [{
      lift: 'Squat',
      sets: [{ weight: 100, reps: 3, done: true, failed: true, skipped: false }],
    }],
  };
  const history = [
    legacyEntry({ workoutNumber: 1, effort: 'good' }),
    {
      cycle: 1,
      workoutNumber: 2,
      lift: 'Squat',
      workoutEffort: 'tooMuch',
      smartDayType: SMART_DAY_TYPES.TRAINING,
      workoutSnapshot: failedRouteSnapshot,
    },
  ];

  expect(shouldFollowSmartIdealRoute({
    history,
    currentCycle: 1,
    readiness: {
      recentFatigueScore: 1,
      recentFailedOrSkippedSetCount: 1,
    },
    nextRouteWorkout: getSmartIdealRouteWorkout({
      athleteLevel: 'beginner',
      workoutNumber: 2,
    }),
  })).toBe(true);

  const recovery = generateCurrent({
    history,
    currentIndex: 2,
    athleteLevel: 'beginner',
  });
  expect(recovery).toMatchObject({
    number: 3,
    type: 'rest',
    smartIdealRoute: {
      workoutNumber: 2,
      transitionPending: true,
      delayCreditsConsumed: 1,
    },
  });
});

test('TOO EASY stays under route control while ending pristine status', () => {
  const w1 = generateCurrent();
  const history = completeWorkout([], w1, 'easy');
  const acceleratedW2 = generateCurrent({ history, currentIndex: 1 });

  expect(isSmartIdealRoutePristine({ history, currentCycle: 1 })).toBe(false);
  expect(shouldFollowSmartIdealRoute({
    history,
    currentCycle: 1,
    readiness: {
      recentFatigueScore: 0,
      recentFailedOrSkippedSetCount: 0,
    },
  })).toBe(true);

  expect(acceleratedW2.smartIdealRoute).toMatchObject({
    workoutNumber: 2,
    stage: 'normal',
  });
  expect(acceleratedW2.type).toBe('training');
  expect(acceleratedW2.smartDecisionSummary.readiness.meetProjection)
    .toMatchObject({
      label: 'C1W27',
      minimumWorkoutNumber: 27,
      maximumWorkoutNumber: 27,
      acceleratedByTooEasyCount: 1,
      pendingTooEasyAccelerationCount: 1,
    });
});

test('C4W22 TOO EASY keeps ideal W23 and moves the meet from W28 to W27', () => {
  let history = [];

  for (let currentIndex = 0; currentIndex < 22; currentIndex += 1) {
    const workout = generateCurrent({ history, currentIndex });
    expect(workout.smartIdealRoute?.workoutNumber).toBe(currentIndex + 1);
    history = completeWorkout(
      history,
      workout,
      currentIndex === 21 ? 'easy' : 'good'
    );
  }

  const w23 = generateCurrent({ history, currentIndex: 22 });

  expect(w23).toMatchObject({
    number: 23,
    type: 'training',
    smartIdealRoute: {
      workoutNumber: 23,
      stage: 'taper',
    },
    smartDecisionSummary: {
      reason: SMART_DECISION_REASONS.IDEAL_ROUTE,
      readiness: {
        meetProjection: {
          label: 'C1W27',
          minimumWorkoutNumber: 27,
          maximumWorkoutNumber: 27,
          acceleratedByTooEasyCount: 1,
        },
      },
    },
  });
  expect(w23.lifts.map(({ lift, intensityRole }) => [lift, intensityRole]))
    .toEqual([
      ['Deadlift', 'heavy'],
      ['Bench', 'medium'],
    ]);

  history = completeWorkout(history, w23, 'good');
  for (let currentIndex = 23; currentIndex < 26; currentIndex += 1) {
    const workout = generateCurrent({ history, currentIndex });
    expect(workout.smartDecisionSummary.readiness.meetProjection.label)
      .toBe('C1W27');
    history = completeWorkout(history, workout, 'good');
  }

  const meet = generateCurrent({ history, currentIndex: 26 });
  expect(meet).toMatchObject({
    number: 27,
    type: 'meet',
    smartIdealRoute: {
      workoutNumber: 28,
      stage: 'meet',
    },
    smartDecisionSummary: {
      readiness: {
        meetProjection: {
          label: 'C1W27',
          minimumWorkoutNumber: 27,
          maximumWorkoutNumber: 27,
        },
      },
    },
  });
});

test('two TOO EASY taper workouts move the meet exactly two days closer', () => {
  let history = [];

  for (let currentIndex = 0; currentIndex < 22; currentIndex += 1) {
    const workout = generateCurrent({ history, currentIndex });
    history = completeWorkout(
      history,
      workout,
      currentIndex === 21 ? 'easy' : 'good'
    );
  }

  const w23 = generateCurrent({ history, currentIndex: 22 });
  history = completeWorkout(history, w23, 'easy');
  const combinedW24 = generateCurrent({ history, currentIndex: 23 });

  expect(combinedW24.smartDecisionSummary.readiness.meetProjection)
    .toMatchObject({
      label: 'C1W26',
      minimumWorkoutNumber: 26,
      maximumWorkoutNumber: 26,
      acceleratedByTooEasyCount: 2,
      pendingTooEasyAccelerationCount: 2,
    });
  expect(combinedW24.smartIdealRoute).toMatchObject({
    workoutNumber: 25,
    stage: 'taper',
    accelerationCreditsConsumed: 1,
    accelerationActions: ['remove-optional-rest'],
    skippedRouteWorkoutNumbers: [24],
  });
  expect(combinedW24.lifts.map(({ lift, intensityRole }) => [
    lift,
    intensityRole,
  ])).toEqual([
    ['Bench', 'heavy'],
    ['Squat', 'medium'],
  ]);
});

test('legacy unmarked work is valid evidence and starts at the first unresolved heavy row', () => {
  const history = [legacyEntry({ workoutNumber: 1, effort: 'good' })];
  const routeStartAtActualW2 = generateCurrent({ history, currentIndex: 1 });

  expect(shouldFollowSmartIdealRoute({
    history,
    currentCycle: 1,
    readiness: {
      recentFatigueScore: 0,
      recentFailedOrSkippedSetCount: 0,
    },
  })).toBe(true);
  expect(routeStartAtActualW2.number).toBe(2);
  expect(routeStartAtActualW2.smartIdealRoute).toMatchObject({
    workoutNumber: 4,
    stage: 'normal',
    phase: 'triple',
  });
});

test('legacy migration activates the route controller even while readiness still reports fatigue', () => {
  const history = [legacyEntry({ workoutNumber: 1, effort: 'hard' })];
  expect(shouldFollowSmartIdealRoute({
    history,
    currentCycle: 1,
    readiness: {
      recentFatigueScore: 1,
      recentFailedOrSkippedSetCount: 0,
    },
  })).toBe(true);

  expect(shouldFollowSmartIdealRoute({
    history,
    currentCycle: 1,
    readiness: {
      recentFatigueScore: 0,
      recentFailedOrSkippedSetCount: 1,
    },
  })).toBe(true);
});

test('a legacy user starts immediately regardless of how much unmarked history exists', () => {
  const history = [1, 2, 3, 4, 5].map(workoutNumber => (
    legacyEntry({ workoutNumber, effort: 'good' })
  ));

  expect(shouldFollowSmartIdealRoute({
    history,
    currentCycle: 1,
    readiness: {
      recentFatigueScore: 0,
      recentFailedOrSkippedSetCount: 0,
    },
  })).toBe(true);

  const rejoinedW6 = generateCurrent({ history, currentIndex: 5 });
  expect(rejoinedW6.number).toBe(6);
  expect(rejoinedW6.smartIdealRoute).toMatchObject({
    workoutNumber: 4,
    stage: 'normal',
  });
});

test('a beginner with only Squat evidence starts at the first unresolved Deadlift row', () => {
  let history = Array.from({ length: 33 }, (_, index) => (
    legacyEntry({
      workoutNumber: index + 1,
      effort: index === 32 ? 'hard' : 'good',
    })
  ));
  const projectedMeetLabels = [];
  let meet = null;

  for (let currentIndex = 33; currentIndex < 66; currentIndex += 1) {
    const workout = generateCurrent({
      history,
      currentIndex,
      athleteLevel: 'beginner',
    });

    if (currentIndex === 33) {
      expect(workout.number).toBe(34);
      expect(workout.smartIdealRoute).toMatchObject({
        workoutNumber: 3,
        stage: 'normal',
        phase: 'triple',
      });
      expect(workout.smartTrainingSelectionSummary?.reasonFlags).toContain(
        'ideal-route'
      );
      expect(workout.smartDecisionSummary?.readiness?.meetProjection).toMatchObject({
        currentWorkoutNumber: 34,
        minimumWorkoutNumber: 59,
        maximumWorkoutNumber: 59,
        minimumWorkoutsBeforeMeet: 25,
        projectedByIdealRoute: true,
      });
      expect(
        workout.smartDecisionSummary?.readiness?.meetProjection?.projectedBySimulation
      ).not.toBe(true);
    }

    const projection = workout.smartDecisionSummary?.readiness?.meetProjection;
    if (projection?.projectedByIdealRoute) {
      projectedMeetLabels.push(projection.label);
    }

    if (workout.type === 'meet') {
      meet = workout;
      break;
    }

    history = completeWorkout(history, workout, 'good');
  }

  expect(new Set(projectedMeetLabels)).toEqual(new Set(['C1W59']));
  expect(meet).toBeTruthy();
  expect(meet.number).toBe(59);
  expect(meet.smartIdealRoute).toMatchObject({
    workoutNumber: 28,
    stage: 'meet',
  });
});

test('an almost meet-ready legacy beginner inserts one rest after HARD and then resumes W18', () => {
  let history = [
    ...legacyWorkoutEntries({
      workoutNumber: 17,
      effort: 'hard',
      lifts: [{ lift: 'Deadlift', weight: 42.5, reps: 4, e1rm: 48.1666666667, intensityRole: 'heavy' }],
    }),
    ...legacyWorkoutEntries({
      workoutNumber: 24,
      lifts: [{ lift: 'Deadlift', weight: 52.5, reps: 2, e1rm: 55, intensityRole: 'heavy' }],
    }),
    ...legacyWorkoutEntries({
      workoutNumber: 28,
      effort: 'hard',
      lifts: [{ lift: 'Bench', weight: 30, reps: 1, e1rm: 30, intensityRole: 'heavy' }],
    }),
    ...legacyWorkoutEntries({
      workoutNumber: 29,
      lifts: [{ lift: 'Squat', weight: 30, reps: 5, intensityRole: 'medium' }],
    }),
    ...legacyWorkoutEntries({ workoutNumber: 30, rest: true }),
    ...legacyWorkoutEntries({
      workoutNumber: 31,
      lifts: [{ lift: 'Deadlift', weight: 50, reps: 2, e1rm: 52.5, intensityRole: 'heavy' }],
    }),
    ...legacyWorkoutEntries({
      workoutNumber: 32,
      lifts: [{ lift: 'Bench', weight: 22.5, reps: 5, e1rm: 27.5, intensityRole: 'medium' }],
    }),
    ...legacyWorkoutEntries({
      workoutNumber: 33,
      effort: 'hard',
      lifts: [{ lift: 'Squat', weight: 37.5, reps: 3, e1rm: 42.5, intensityRole: 'heavy' }],
    }),
    ...legacyWorkoutEntries({
      workoutNumber: 34,
      effort: 'easy',
      lifts: [{ lift: 'Bench', weight: 17.5, reps: 5, e1rm: 20.4166666667, intensityRole: 'light' }],
    }),
  ];
  const legacyBeginnerOptions = {
    squat: 42.5,
    bench: 32.5,
    deadlift: 60,
    oneRMs: { Squat: 42.5, Bench: 32.5, Deadlift: 60 },
  };
  const deliveredRouteNumbers = [];
  const deliveredWorkoutTypes = [];
  let meet = null;

  for (let currentIndex = 34; currentIndex < 59; currentIndex += 1) {
    const workout = generateCurrent({
      history,
      currentIndex,
      athleteLevel: 'beginner',
      options: legacyBeginnerOptions,
    });
    deliveredRouteNumbers.push(workout.smartIdealRoute?.workoutNumber);
    deliveredWorkoutTypes.push(workout.type);

    if (currentIndex === 34) {
      expect(workout.number).toBe(35);
      expect(workout.smartIdealRoute).toMatchObject({
        workoutNumber: 17,
        stage: 'normal',
        phase: 'single',
      });
      expect(workout.lifts.map(block => [block.lift, block.intensityRole]))
        .toEqual([
          ['Deadlift', 'heavy'],
          ['Bench', 'medium'],
        ]);
      expect(workout.smartIdealRoute.transitionPending).toBeUndefined();
      expect(workout.smartTrainingSelectionSummary?.reasonFlags).not.toContain(
        'ideal-route-frequency-transition'
      );
      expect(workout.smartDecisionSummary?.readiness).toMatchObject({
        meetPlanWeakestLift: 'Deadlift',
        meetPlanWeakestPhase: 'second-attempt',
        meetProjection: { label: 'C1W46' },
      });
    }

    if (workout.type === 'meet') {
      meet = workout;
      break;
    }

    history = completeWorkout(
      history,
      workout,
      currentIndex === 34 ? 'hard' : 'good'
    );
  }

  expect(deliveredRouteNumbers).toEqual([
    17, 18, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
  ]);
  expect(deliveredWorkoutTypes).toEqual([
    'training', 'rest', 'rest', 'training', 'rest', 'rest',
    'training', 'rest', 'training', 'training', 'rest', 'rest', 'meet',
  ]);
  expect(meet).toBeTruthy();
  expect(meet.number).toBe(47);
  expect(meet.smartIdealRoute).toMatchObject({
    workoutNumber: 28,
    stage: 'meet',
  });
  expect(meet.lifts.find(block => block.lift === 'Squat').warmups)
    .toEqual([
      { reps: 5, weight: 20, originalWeight: 20, done: false },
    ]);
  expect(meet.lifts.find(block => block.lift === 'Bench').warmups)
    .toEqual([
      { reps: 5, weight: 20, originalWeight: 20, done: false },
    ]);
  expect(meet.lifts.find(block => block.lift === 'Deadlift').warmups)
    .toEqual([
      { reps: 5, weight: 20, originalWeight: 20, done: false },
      { reps: 3, weight: 40, originalWeight: 40, done: false },
    ]);
});

test('adaptive recovery satisfies pending beginner route rests after a mid-cycle migration', () => {
  const routeSnapshot = ({
    number,
    routeNumber,
    type = 'training',
    effort = 'good',
    marked = true,
  }) => ({
    number,
    type,
    workoutEffort: type === 'rest' ? 'easy' : effort,
    smartIdealRoute: marked ? {
      version: 1,
      workoutNumber: routeNumber,
      athleteLevel: 'beginner',
      stage: 'normal',
      phase: routeNumber >= 15 ? 'single' : null,
    } : undefined,
    lifts: type === 'rest' ? [] : [{
      lift: 'Squat',
      sets: [{
        weight: 40,
        reps: 1,
        done: true,
        failed: false,
        skipped: false,
      }],
    }],
  });
  const entryFor = snapshot => ({
    cycle: 1,
    workoutNumber: snapshot.number,
    restDay: snapshot.type === 'rest',
    completionOnly: snapshot.type === 'rest',
    lift: snapshot.type === 'rest' ? undefined : 'Squat',
    workoutEffort: snapshot.workoutEffort,
    smartDayType: snapshot.type === 'rest'
      ? SMART_DAY_TYPES.RECOVERY
      : SMART_DAY_TYPES.TRAINING,
    workoutSnapshot: snapshot,
  });
  const history = [
    routeSnapshot({ number: 35, routeNumber: 17, effort: 'hard' }),
    routeSnapshot({ number: 36, routeNumber: 18, type: 'rest' }),
    routeSnapshot({ number: 37, routeNumber: 19, effort: 'hard' }),
    routeSnapshot({ number: 38, type: 'rest', marked: false }),
    routeSnapshot({ number: 39, routeNumber: 20, type: 'rest' }),
  ].map(entryFor);

  expect(getNextSmartIdealRouteWorkoutNumber({
    history,
    currentCycle: 1,
    athleteLevel: 'beginner',
  })).toBe(22);

  const w40 = generateCurrent({
    history,
    currentIndex: 39,
    athleteLevel: 'beginner',
    options: {
      squat: 42.5,
      bench: 32.5,
      deadlift: 60,
      oneRMs: { Squat: 42.5, Bench: 32.5, Deadlift: 60 },
    },
  });

  expect(w40).toMatchObject({
    number: 40,
    type: 'training',
    smartIdealRoute: {
      workoutNumber: 22,
      athleteLevel: 'beginner',
      stage: 'taper',
    },
  });
  expect(w40.lifts.map(({ lift, intensityRole }) => [lift, intensityRole]))
    .toEqual([
      ['Squat', 'heavy'],
      ['Bench', 'light'],
    ]);
});

test('an unmarked meet-type deviation still blocks the fixed route for the rest of the cycle', () => {
  const history = [
    legacyEntry({ workoutNumber: 1, type: 'meet', effort: 'good' }),
    legacyEntry({ workoutNumber: 2, type: 'training', effort: 'good' }),
  ];

  expect(shouldFollowSmartIdealRoute({
    history,
    currentCycle: 1,
    readiness: {
      recentFatigueScore: 0,
      recentFailedOrSkippedSetCount: 0,
    },
  })).toBe(false);
});

test('the pristine route reaches the double phase and keeps every generated grid full', () => {
  let history = [];

  for (let index = 0; index < 7; index += 1) {
    const workout = generateCurrent({ history, currentIndex: index });
    expectFullLiftGrids(workout);
    history = completeWorkout(history, workout);
  }

  const w8 = generateCurrent({ history, currentIndex: 7 });
  const heavy = w8.lifts.find(liftBlock => liftBlock.intensityRole === 'heavy');

  expect(w8.smartIdealRoute.phase).toBe('double');
  expect(heavy.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    precisePct: 0.95,
  });
  expect(heavy.sets.slice(1).every(set => (
    set.reps === 5 && set.precisePct === 0.65
  ))).toBe(true);
  expectFullLiftGrids(w8);
});

test('normal heavy phase changes guarantee a 2.5 kg rise when the cycle cap allows it', () => {
  const topWeights = [1, 8, 15].map(workoutNumber => {
    const routeWorkout = getSmartIdealRouteWorkout({
      workoutNumber,
      athleteLevel: 'intermediate',
    });
    const workout = buildSmartIdealTrainingWorkout({
      sourceWorkout: { number: workoutNumber },
      routeWorkout,
      athleteLevel: 'intermediate',
      squat: 40,
      bench: 40,
      deadlift: 40,
      preparationMode: 'off',
    });

    return workout.lifts[0].sets[0].weight;
  });

  expect(topWeights).toEqual([35, 37.5, 40]);
});

test('C4W18 top single and backoffs use the confirmed real Bench 1RM', () => {
  const routeWorkout = getSmartIdealRouteWorkout({
    workoutNumber: 18,
    athleteLevel: 'intermediate',
  });
  const workout = buildSmartIdealTrainingWorkout({
    sourceWorkout: { number: 18 },
    routeWorkout,
    athleteLevel: 'intermediate',
    squat: 147.5,
    bench: 100,
    deadlift: 180,
    preparationMode: 'off',
  });
  const bench = workout.lifts.find(block => block.lift === 'Bench');
  const topSingle = bench.sets.find(set => set.labelKey === 'topSingle');
  const backoffs = bench.sets.filter(set => set.labelKey === 'backoff');

  expect(topSingle).toMatchObject({
    weight: 100,
    reps: 1,
    pct: 1,
    precisePct: 1,
  });
  expect(backoffs.length).toBeGreaterThan(0);
  expect(backoffs.every(set => (
    set.weight === 70 && set.pct === 0.7 && set.precisePct === 0.7
  ))).toBe(true);
});

test('beginner W22 keeps taper backoffs and four-rep light work on a full grid', () => {
  const routeWorkout = getSmartIdealRouteWorkout({
    workoutNumber: 22,
    athleteLevel: 'beginner',
  });
  const workout = buildSmartIdealTrainingWorkout({
    sourceWorkout: { number: 40 },
    routeWorkout,
    athleteLevel: 'beginner',
    squat: 42.5,
    bench: 32.5,
    deadlift: 60,
    preparationMode: 'basicFirst',
  });
  const squat = workout.lifts.find(block => block.lift === 'Squat');
  const bench = workout.lifts.find(block => block.lift === 'Bench');

  expect(squat.warmups.map(({ weight, reps }) => ({ weight, reps })))
    .toEqual([
      { weight: 20, reps: 5 },
    ]);
  expect(squat.sets).toHaveLength(3);
  expect(squat.sets[0]).toMatchObject({
    weight: 37.5,
    reps: 1,
    pct: 0.875,
    precisePct: 0.9,
    prescribedPct: 0.9,
  });
  expect(squat.sets.slice(1)).toEqual(
    expect.arrayContaining(Array.from({ length: 2 }, () => expect.objectContaining({
      labelKey: 'backoff',
      weight: 27.5,
      reps: 4,
      precisePct: 0.6,
      prescribedPct: 0.6,
    })))
  );
  expect(squat.warmups.length + squat.sets.length).toBe(4);

  expect(bench.warmups).toHaveLength(0);
  expect(bench.sets.map(({ weight, reps }) => ({ weight, reps })))
    .toEqual(Array.from({ length: 4 }, () => ({ weight: 20, reps: 4 })));
  expect(bench.warmups.length + bench.sets.length).toBe(4);
});

test('beginner W24 uses a useful four-column deadlift ladder and preserves the prescribed taper percentage', () => {
  const routeWorkout = getSmartIdealRouteWorkout({
    workoutNumber: 24,
    athleteLevel: 'beginner',
  });
  const workout = buildSmartIdealTrainingWorkout({
    sourceWorkout: { number: 42 },
    routeWorkout,
    athleteLevel: 'beginner',
    squat: 42.5,
    bench: 32.5,
    deadlift: 60,
    preparationMode: 'basicFirst',
  });
  const deadlift = workout.lifts.find(block => block.lift === 'Deadlift');
  const bench = workout.lifts.find(block => block.lift === 'Bench');

  expect(deadlift.warmups.map(({ weight, reps }) => ({ weight, reps })))
    .toEqual([
      { weight: 20, reps: 5 },
      { weight: 40, reps: 3 },
    ]);
  expect(deadlift.sets).toHaveLength(2);
  expect(deadlift.sets[0]).toMatchObject({
    weight: 55,
    reps: 1,
    pct: 0.925,
    precisePct: 0.9,
    prescribedPct: 0.9,
  });
  expect(deadlift.sets[1]).toMatchObject({
    labelKey: 'backoff',
    weight: 37.5,
    reps: 4,
    precisePct: 0.6,
    prescribedPct: 0.6,
  });
  expect(deadlift.warmups.length + deadlift.sets.length).toBe(4);

  expect(bench.warmups).toHaveLength(0);
  expect(bench.sets.map(({ weight, reps }) => ({ weight, reps })))
    .toEqual(Array.from({ length: 4 }, () => ({ weight: 22.5, reps: 4 })));
  expect(bench.warmups.length + bench.sets.length).toBe(4);
});

test('C4W22 gives the reported intermediate Squat four backoffs and Bench three sets of four', () => {
  const routeWorkout = getSmartIdealRouteWorkout({
    workoutNumber: 22,
    athleteLevel: 'intermediate',
  });
  const workout = buildSmartIdealTrainingWorkout({
    sourceWorkout: { number: 22 },
    routeWorkout,
    athleteLevel: 'intermediate',
    squat: 147.5,
    bench: 100,
    deadlift: 180,
    preparationMode: 'off',
  });
  const squat = workout.lifts.find(block => block.lift === 'Squat');
  const bench = workout.lifts.find(block => block.lift === 'Bench');

  expect(squat.warmups.map(({ weight, reps }) => ({ weight, reps })))
    .toEqual([
      { weight: 20, reps: 5 },
      { weight: 70, reps: 3 },
      { weight: 120, reps: 1 },
    ]);
  expect(squat.sets[0]).toMatchObject({
    labelKey: 'topSingle',
    weight: 132.5,
    reps: 1,
    prescribedPct: 0.9,
  });
  expect(squat.sets.slice(1)).toEqual(
    Array.from({ length: 4 }, () => expect.objectContaining({
      labelKey: 'backoff',
      weight: 90,
      reps: 4,
      prescribedPct: 0.6,
    }))
  );
  expect(squat.warmups.length + squat.sets.length).toBe(8);

  expect(bench.warmups.map(({ weight, reps }) => ({ weight, reps })))
    .toEqual([{ weight: 20, reps: 5 }]);
  expect(bench.sets).toEqual(
    Array.from({ length: 3 }, () => expect.objectContaining({
      labelKey: 'workSets',
      weight: 60,
      reps: 4,
      prescribedPct: 0.6,
    }))
  );
  expect(bench.warmups.length + bench.sets.length).toBe(4);
});

test('beginner W25 fills three complete grids with a heavy single and useful backoffs', () => {
  const routeWorkout = getSmartIdealRouteWorkout({
    workoutNumber: 25,
    athleteLevel: 'beginner',
  });
  const workout = buildSmartIdealTrainingWorkout({
    sourceWorkout: { number: 25 },
    routeWorkout,
    athleteLevel: 'beginner',
    squat: 42.5,
    bench: 35,
    deadlift: 60,
    preparationMode: 'off',
  });
  const bench = workout.lifts[0];

  expect(bench.lift).toBe('Bench');
  expect(bench.warmups.length + bench.sets.length).toBe(12);
  expect(bench.sets[0]).toMatchObject({
    labelKey: 'topSingle',
    reps: 1,
    prescribedPct: 0.9,
  });
  bench.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      prescribedPct: 0.6,
    });
    expect(Number(set.weight)).toBeGreaterThanOrEqual(35 * 0.6);
  });
});

test('every ideal-route taper day preserves the universal taper dose from 10kg through 1000kg', () => {
  SMART_IDEAL_LEVELS.forEach(athleteLevel => {
    for (let workoutNumber = 22; workoutNumber <= 25; workoutNumber += 1) {
      const routeWorkout = getSmartIdealRouteWorkout({
        workoutNumber,
        athleteLevel,
      });
      if (routeWorkout.type !== 'training') continue;

      for (let realOneRM = 10; realOneRM <= 1000; realOneRM += 2.5) {
        const workout = buildSmartIdealTrainingWorkout({
          sourceWorkout: { number: workoutNumber },
          routeWorkout,
          athleteLevel,
          squat: realOneRM,
          bench: realOneRM,
          deadlift: realOneRM,
          preparationMode: 'off',
        });

        workout.lifts.forEach(liftBlock => {
          const warmups = liftBlock.warmups || [];
          const workSets = liftBlock.sets || [];
          const diagnostic = {
            athleteLevel,
            workoutNumber,
            realOneRM,
            lift: liftBlock.lift,
          };

          expect({
            ...diagnostic,
            gridRemainder: (warmups.length + workSets.length) % 4,
          }).toMatchObject({ gridRemainder: 0 });
          warmups.forEach(warmup => {
            expect({
              ...diagnostic,
              warmupWeight: warmup.weight,
              isTenKgMultiple: Number(warmup.weight) % 10 === 0,
              belowTarget: Number(warmup.weight) < Number(workSets[0]?.weight),
            }).toMatchObject({
              isTenKgMultiple: true,
              belowTarget: true,
            });
          });
          expect({
            ...diagnostic,
            safeWarmupJumps: warmupLoadJumpsNeverIncrease(
              warmups.map(warmup => warmup.weight),
              Number(workSets[0]?.weight) || 0
            ),
          }).toMatchObject({ safeWarmupJumps: true });

          if (liftBlock.intensityRole === 'heavy') {
            const backoffs = workSets.filter(set => set.labelKey === 'backoff');
            expect({
              ...diagnostic,
              topLabel: workSets[0]?.labelKey,
              topReps: workSets[0]?.reps,
              backoffCount: backoffs.length,
            }).toMatchObject({
              topLabel: 'topSingle',
              topReps: 1,
            });
            expect(backoffs.length).toBeGreaterThanOrEqual(1);
            if (routeWorkout.lifts.length === 1) {
              expect(warmups.length + workSets.length)
                .toBeGreaterThanOrEqual(12);
            } else {
              expect(backoffs.length).toBeLessThanOrEqual(4);
            }
            backoffs.forEach(set => {
              expect({
                ...diagnostic,
                reps: set.reps,
                prescribedPct: set.prescribedPct,
                minimumPctMet: Number(set.weight) >= realOneRM * 0.60,
              }).toMatchObject({
                reps: 4,
                prescribedPct: 0.6,
                minimumPctMet: true,
              });
            });
            return;
          }

          expect(workSets.length).toBeGreaterThanOrEqual(3);
          workSets.forEach(set => {
            expect({
              ...diagnostic,
              labelKey: set.labelKey,
              reps: set.reps,
              minimumPctMet: Number(set.weight) >= realOneRM * 0.60,
            }).toMatchObject({
              labelKey: 'workSets',
              reps: 4,
              minimumPctMet: true,
            });
          });
        });
      }
    }
  });
}, 15000);

test.each(['beginner', 'intermediate', 'advanced', 'elite'])(
  '%s live route preserves dose, barbell, grid and Bench/Row invariants through the meet',
  athleteLevel => {
    let history = [];

    for (let index = 0; index < 28; index += 1) {
      const workout = generateCurrent({
        history,
        currentIndex: index,
        athleteLevel,
        options: { accessoryMode: 'standard' },
      });

      expectFullLiftGrids(workout);
      const rows = (workout.accessories || []).filter(item => item.key === 'row');
      const needsRow = workout.type === 'training' && workout.lifts.some(block => block.lift === 'Bench');
      expect(rows).toHaveLength(needsRow ? 1 : 0);
      if (workout.type === 'training' && workout.smartIdealRoute?.stage === 'taper') {
        expect(workout.accessories).toEqual(rows);
        rows.forEach(row => {
          expect(row.reps).toBe(5);
          expect(row.weights).toEqual([25, 25, 25, 25]);
        });
      }
      if (workout.type !== 'training') expect(workout.accessories).toEqual([]);

      (workout.lifts || []).forEach(liftBlock => {
        const workSets = liftBlock.sets || [];
        const highestWorkWeight = Math.max(
          0,
          ...workSets.map(set => Number(set.weight) || 0)
        );

        [...(liftBlock.warmups || []), ...workSets].forEach(item => {
          expect((Number(item.weight) || 0) / 2.5).toBeCloseTo(
            Math.round((Number(item.weight) || 0) / 2.5),
            8
          );
        });
        (liftBlock.warmups || []).forEach(warmup => {
          expect(Number(warmup.weight)).toBeLessThan(highestWorkWeight);
          expect((Number(warmup.weight) || 0) % 10).toBe(0);
        });
        expect(warmupLoadJumpsNeverIncrease(
          (liftBlock.warmups || []).map(warmup => warmup.weight),
          Number(workSets[0]?.weight) || 0
        )).toBe(true);

        if (
          workout.smartIdealRoute?.stage === 'normal' &&
          ['medium', 'light'].includes(liftBlock.intensityRole)
        ) {
          expect(workSets.reduce(
            (total, set) => total + Number(set.reps || 0),
            0
          )).toBeLessThanOrEqual(24);
          workSets.forEach(set => {
            expect(Number(set.reps)).toBeGreaterThanOrEqual(4);
            expect(Number(set.reps)).toBeLessThanOrEqual(6);
          });
        }

        if (
          workout.smartIdealRoute?.stage === 'taper' &&
          ['medium', 'light'].includes(liftBlock.intensityRole)
        ) {
          expect(workSets.length).toBeGreaterThanOrEqual(3);
          workSets.forEach(set => {
            expect(Number(set.reps)).toBeGreaterThanOrEqual(4);
            expect(Number(set.weight)).toBeGreaterThanOrEqual(
              Number(baseOptions[liftBlock.lift.toLowerCase()]) * 0.60
            );
          });
        }

        if (
          workout.smartIdealRoute?.stage === 'taper' &&
          liftBlock.intensityRole === 'heavy'
        ) {
          expect(workSets[0]).toMatchObject({
            labelKey: 'topSingle',
            reps: 1,
            precisePct: 0.9,
          });
          expect(workSets.length).toBeGreaterThanOrEqual(2);
          workSets.slice(1).forEach(set => {
            expect(set).toMatchObject({
              labelKey: 'backoff',
              reps: 4,
              precisePct: 0.6,
            });
          });
        }
      });

      if (workout.type === 'meet') {
        expect(workout.smartDecisionSummary?.readiness?.meetPlanReady).toBe(true);
        workout.lifts.forEach(liftBlock => {
          const weights = liftBlock.sets.map(set => Number(set.weight));
          expect(weights[0]).toBeLessThan(weights[1]);
          expect(weights[1]).toBeLessThan(weights[2]);
        });
      }

      history = completeWorkout(history, workout);
    }
  }
);

test('elite ideal route reaches W28 meet and requires one post-meet recovery workout', () => {
  let history = [];

  for (let index = 0; index < 28; index += 1) {
    const workout = generateCurrent({
      history,
      currentIndex: index,
      athleteLevel: 'elite',
    });

    if (index === 27) {
      expect(workout.type).toBe('meet');
      expect(workout.smartIdealRoute).toMatchObject({
        stage: 'meet',
        postMeetRecoveryTarget: 1,
        nextCycleWorkout: 30,
      });
      expectFullLiftGrids(workout);
    }

    history = completeWorkout(history, workout);
  }

  expect(isSmartCycleCompleteAfterHistory(history, 1)).toBe(false);

  for (let index = 28; index < 29; index += 1) {
    const recovery = generateCurrent({
      history,
      currentIndex: index,
      athleteLevel: 'elite',
    });
    expect(recovery.type).toBe('rest');
    expect(recovery.smartIdealRoute).toMatchObject({
      stage: 'post-meet',
      postMeetRecoveryTarget: 1,
    });
    history = completeWorkout(history, recovery);
    expect(isSmartCycleCompleteAfterHistory(history, 1)).toBe(true);
  }
});

test('W28 remains the meet when readiness diagnostics are incomplete', () => {
  const history = Array.from({ length: 27 }, (_, index) => ({
    cycle: 1,
    workoutNumber: index + 1,
    workoutEffort: 'good',
    smartDayType: SMART_DAY_TYPES.TRAINING,
    workoutSnapshot: {
      number: index + 1,
      type: 'training',
      workoutEffort: 'good',
      smartIdealRoute: {
        version: 1,
        workoutNumber: index + 1,
        stage: index < 21 ? 'normal' : 'taper',
      },
      lifts: [],
      sets: [],
    },
  }));
  const w28 = generateCurrent({
    history,
    currentIndex: 27,
    options: { skipMeetProjectionSimulation: true },
  });

  expect(w28.smartDecisionSummary?.readiness?.meetPlanReady).toBe(false);
  expect(w28.type).toBe('meet');
  expect(w28.number).toBe(28);
  expect(w28.smartIdealRoute).toMatchObject({
    workoutNumber: 28,
    stage: 'meet',
  });
});
