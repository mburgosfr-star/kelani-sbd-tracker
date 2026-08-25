import {
  buildSmartIdealTrainingWorkout,
  generateWorkoutsForTrainingModel,
  getNextSmartIdealRouteWorkoutNumber,
  isSmartCycleCompleteAfterHistory,
  isSmartIdealRoutePristine,
  shouldFollowSmartIdealRoute,
} from './smartTrainingEngine';
import {
  SMART_DAY_TYPES,
  SMART_DECISION_REASONS,
  TRAINING_MODELS,
} from './smartTrainingConstants';
import { getSmartIdealRouteWorkout } from './smartIdealRoute';
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
      ['Squat', 'light'],
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

test('non-GOOD feedback leaves the ideal path and returns control to autoregulation', () => {
  const w1 = generateCurrent();
  const history = completeWorkout([], w1, 'hard');
  const next = generateCurrent({ history, currentIndex: 1 });

  expect(isSmartIdealRoutePristine({ history, currentCycle: 1 })).toBe(false);
  expect(next.smartIdealRoute).toBeFalsy();
  expect(next.smartDecisionSummary?.reason).not.toBe(
    SMART_DECISION_REASONS.IDEAL_ROUTE
  );
});

test('failed work on the first migrated route workout does not force its scheduled rest row', () => {
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
  })).toBe(false);
});

test('a safe successful adaptive workout rejoins the ideal route as soon as possible', () => {
  const w1 = generateCurrent();
  let history = completeWorkout([], w1, 'easy');
  const adaptiveW2 = generateCurrent({ history, currentIndex: 1 });

  expect(adaptiveW2.smartIdealRoute).toBeFalsy();
  history = completeWorkout(history, adaptiveW2, 'good');

  expect(shouldFollowSmartIdealRoute({
    history,
    currentCycle: 1,
    readiness: {
      recentFatigueScore: 0,
      recentFailedOrSkippedSetCount: 0,
    },
  })).toBe(true);

  const rejoinedW3 = generateCurrent({ history, currentIndex: 2 });
  expect(rejoinedW3.smartIdealRoute).toMatchObject({
    workoutNumber: 2,
    stage: 'normal',
  });
  expect(rejoinedW3.type).toBe('training');
});

test('a legacy unmarked history starts relative ideal-route W1 immediately', () => {
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
    workoutNumber: 1,
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
    workoutNumber: 1,
    stage: 'normal',
  });
});

test('a beginner beyond the legacy route range with no cross-lift evidence starts at route W1', () => {
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
        workoutNumber: 1,
        stage: 'normal',
        phase: 'triple',
      });
      expect(workout.smartTrainingSelectionSummary?.reasonFlags).toContain(
        'ideal-route'
      );
      expect(workout.smartDecisionSummary?.readiness?.meetProjection).toMatchObject({
        currentWorkoutNumber: 34,
        minimumWorkoutNumber: 61,
        maximumWorkoutNumber: 61,
        minimumWorkoutsBeforeMeet: 27,
        projectedByIdealRoute: true,
      });
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

  expect(new Set(projectedMeetLabels)).toEqual(new Set(['C1W61']));
  expect(meet).toBeTruthy();
  expect(meet.number).toBe(61);
  expect(meet.smartIdealRoute).toMatchObject({
    workoutNumber: 28,
    stage: 'meet',
  });
});

test('an almost meet-ready legacy beginner keeps the W17-W18-W19 route after HARD entry feedback', () => {
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
    17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
  ]);
  expect(deliveredWorkoutTypes).toEqual([
    'training', 'rest', 'training', 'rest', 'rest', 'training',
    'rest', 'training', 'training', 'rest', 'rest', 'meet',
  ]);
  expect(meet).toBeTruthy();
  expect(meet.number).toBe(46);
  expect(meet.smartIdealRoute).toMatchObject({
    workoutNumber: 28,
    stage: 'meet',
  });
  expect(meet.lifts.find(block => block.lift === 'Squat').warmups)
    .toEqual([
      { reps: 5, weight: 20, originalWeight: 20, done: false },
      { reps: 3, weight: 30, originalWeight: 30, done: false },
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

test('beginner W22 keeps four-column grids and rehearses the final squat warmup for three reps', () => {
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
      { weight: 20, reps: 5 },
      { weight: 30, reps: 3 },
    ]);
  expect(squat.sets).toHaveLength(1);
  expect(squat.sets[0]).toMatchObject({
    weight: 37.5,
    reps: 1,
    pct: 0.875,
    precisePct: 0.9,
    prescribedPct: 0.9,
  });
  expect(squat.warmups.length + squat.sets.length).toBe(4);

  expect(bench.warmups).toHaveLength(0);
  expect(bench.sets.map(({ weight, reps }) => ({ weight, reps })))
    .toEqual(Array.from({ length: 4 }, () => ({ weight: 20, reps: 3 })));
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
      { weight: 50, reps: 1 },
    ]);
  expect(deadlift.sets).toHaveLength(1);
  expect(deadlift.sets[0]).toMatchObject({
    weight: 55,
    reps: 1,
    pct: 0.925,
    precisePct: 0.9,
    prescribedPct: 0.9,
  });
  expect(deadlift.warmups.length + deadlift.sets.length).toBe(4);

  expect(bench.warmups).toHaveLength(0);
  expect(bench.sets.map(({ weight, reps }) => ({ weight, reps })))
    .toEqual(Array.from({ length: 4 }, () => ({ weight: 22.5, reps: 3 })));
  expect(bench.warmups.length + bench.sets.length).toBe(4);
});

test.each(['beginner', 'intermediate', 'advanced', 'elite'])(
  '%s live route preserves dose, barbell and grid invariants through the meet',
  athleteLevel => {
    let history = [];

    for (let index = 0; index < 28; index += 1) {
      const workout = generateCurrent({
        history,
        currentIndex: index,
        athleteLevel,
      });

      expectFullLiftGrids(workout);

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
          expect(workSets.reduce(
            (total, set) => total + Number(set.reps || 0),
            0
          )).toBe(12);
        }

        if (
          workout.smartIdealRoute?.stage === 'taper' &&
          liftBlock.intensityRole === 'heavy'
        ) {
          expect(workSets).toHaveLength(1);
          expect(workSets[0]).toMatchObject({
            labelKey: 'topSingle',
            reps: 1,
            precisePct: 0.9,
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

test('W28 stays pending and is eventually delivered when readiness was lost to deviations', () => {
  let history = Array.from({ length: 27 }, (_, index) => ({
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
  expect(w28.type).not.toBe('meet');
  expect(w28.smartIdealRoute).toBeFalsy();

  let meet = null;
  for (let currentIndex = 27; currentIndex < 120; currentIndex += 1) {
    const workout = generateCurrent({
      history,
      currentIndex,
      options: { skipMeetProjectionSimulation: true },
    });

    expect(getNextSmartIdealRouteWorkoutNumber({
      history,
      currentCycle: 1,
    })).toBe(28);

    if (workout.type === 'meet') {
      meet = workout;
      break;
    }

    history = completeWorkout(history, workout, 'good');
  }

  expect(meet).toBeTruthy();
  expect(meet.number).toBeGreaterThan(28);
  expect(meet.smartIdealRoute).toMatchObject({
    workoutNumber: 28,
    stage: 'meet',
  });
});
