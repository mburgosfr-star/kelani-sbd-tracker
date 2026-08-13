import {
  buildSmartIdealTrainingWorkout,
  generateWorkoutsForTrainingModel,
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
} = {}) {
  return generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, {
    ...baseOptions,
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

function expectFullLiftGrids(workout) {
  (workout.lifts || []).forEach(liftBlock => {
    expect(liftBlock.warmups.length + liftBlock.sets.length).toBeGreaterThan(0);
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
    workoutNumber: 3,
    stage: 'normal',
  });
  expect(rejoinedW3.type).toBe('rest');
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
        });

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

test('elite ideal route reaches W28 meet and requires four post-meet recovery workouts', () => {
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
        postMeetRecoveryTarget: 4,
        nextCycleWorkout: 33,
      });
      expectFullLiftGrids(workout);
    }

    history = completeWorkout(history, workout);
  }

  expect(isSmartCycleCompleteAfterHistory(history, 1)).toBe(false);

  for (let index = 28; index < 32; index += 1) {
    const recovery = generateCurrent({
      history,
      currentIndex: index,
      athleteLevel: 'elite',
    });
    expect(recovery.type).toBe('rest');
    expect(recovery.smartIdealRoute).toMatchObject({
      stage: 'post-meet',
      postMeetRecoveryTarget: 4,
    });
    history = completeWorkout(history, recovery);
    expect(isSmartCycleCompleteAfterHistory(history, 1)).toBe(index === 31);
  }
});

test('W28 is delayed instead of forcing a meet when readiness was lost to deviations', () => {
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
  const w28 = generateCurrent({ history, currentIndex: 27 });

  expect(w28.smartDecisionSummary?.readiness?.meetPlanReady).toBe(false);
  expect(w28.type).not.toBe('meet');
  expect(w28.smartIdealRoute).toBeFalsy();
});
