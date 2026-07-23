import {
  buildSmartMeetPlanReadiness,
  buildSmartMeetWorkoutProjection,
  calculateAchievedMaxesFromHistory,
} from './App';

function makeTrainingEntry({
  cycle = 1,
  workoutNumber,
  lift,
  weight,
  reps,
  e1rm,
  inheritedBestE1RM,
  failedTopWeight = null,
  workoutEffort = 'good',
}) {
  const sets = [
    ...(failedTopWeight
      ? [{
          labelKey: 'opener',
          reps: 1,
          weight: failedTopWeight,
          done: true,
          failed: true,
          skipped: true,
        }]
      : []),
    {
      labelKey: reps <= 3 ? `top${reps === 1 ? 'Single' : reps === 2 ? 'Double' : 'Triple'}` : 'backoff',
      reps,
      weight,
      done: true,
      failed: false,
      skipped: false,
    },
  ];

  return {
    cycle,
    workoutNumber,
    lift,
    topWeight: weight,
    topReps: reps,
    e1rm,
    bestE1RM: inheritedBestE1RM,
    previousBestE1RM: inheritedBestE1RM,
    workoutEffort,
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      workoutEffort,
      lift,
      lifts: [{ lift, sets }],
    },
  };
}

const attempts = values => ({
  opener: values[0],
  secondAttempt: values[1],
  thirdAttempt: values[2],
});

test('uses only achieved current-cycle performance for a lighter lifter', () => {
  const history = [
    { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Squat', topWeight: 42.5, e1rm: 42.5 },
    { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Bench', topWeight: 32.5, e1rm: 32.5 },
    { cycle: 0, workoutNumber: 0, seedMax: true, lift: 'Deadlift', topWeight: 60, e1rm: 60 },
    makeTrainingEntry({ workoutNumber: 1, lift: 'Squat', weight: 32.5, reps: 3, e1rm: 35.75, inheritedBestE1RM: 42.5 }),
    makeTrainingEntry({ workoutNumber: 6, lift: 'Bench', weight: 22.5, reps: 5, e1rm: 26.25, inheritedBestE1RM: 32.5 }),
    makeTrainingEntry({ workoutNumber: 9, lift: 'Deadlift', weight: 47.5, reps: 2, e1rm: 50.6666666667, inheritedBestE1RM: 60 }),
  ];

  const result = buildSmartMeetPlanReadiness({
    history,
    prs: { Squat: 42.5, Bench: 32.5, Deadlift: 60 },
    currentCycle: 1,
    meetPlannerAttempts: {
      Squat: attempts([37.5, 42.5, 42.5]),
      Bench: attempts([30, 32.5, 32.5]),
      Deadlift: attempts([55, 57.5, 62.5]),
    },
  });

  expect(result.byLift.Squat.currentCycleBestE1RM).toBeCloseTo(35.75);
  expect(result.byLift.Bench.currentCycleBestE1RM).toBeCloseTo(26.25);
  expect(result.byLift.Deadlift.currentCycleBestE1RM).toBeCloseTo(50.6666666667);
  expect(result.byLift.Bench.currentCycleTarget).toBe(30);
  expect(result.byLift.Bench.plannedTopAttempt).toBe(32.5);
  expect(result.byLift.Bench.ready).toBe(false);
  expect(result.weakestLift).toBe('Bench');
});

test('uses opener readiness and identifies the actual limiter for a stronger lifter', () => {
  const history = [
    makeTrainingEntry({
      cycle: 3,
      workoutNumber: 15,
      lift: 'Squat',
      weight: 102.5,
      reps: 4,
      e1rm: 116.1666666667,
      inheritedBestE1RM: 145,
      failedTopWeight: 130,
    }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 19, lift: 'Bench', weight: 82.5, reps: 2, e1rm: 88, inheritedBestE1RM: 97.5 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 18, lift: 'Deadlift', weight: 147.5, reps: 2, e1rm: 157.3333333333, inheritedBestE1RM: 180 }),
  ];

  const result = buildSmartMeetPlanReadiness({
    history,
    prs: { Squat: 145, Bench: 97.5, Deadlift: 180 },
    currentCycle: 3,
    meetPlannerAttempts: {
      Squat: attempts([130, 142.5, 147.5]),
      Bench: attempts([87.5, 95, 100]),
      Deadlift: attempts([162.5, 175, 185]),
    },
  });

  expect(result.byLift.Squat.currentCycleBestE1RM).toBeCloseTo(116.1666666667);
  expect(result.byLift.Squat.currentCycleTarget).toBe(130);
  expect(result.byLift.Squat.plannedTopAttempt).toBe(147.5);
  expect(result.byLift.Bench.currentCycleTarget).toBeCloseTo(92.625);
  expect(result.byLift.Bench.openerReady).toBe(true);
  expect(result.byLift.Bench.secondAttemptReady).toBe(false);
  expect(result.byLift.Bench.ready).toBe(false);
  expect(result.byLift.Deadlift.ready).toBe(false);
  expect(result.weakestLift).toBe('Squat');
});

test('ignores failed top work and derives evidence from successful sets', () => {
  const history = [makeTrainingEntry({
    cycle: 2,
    workoutNumber: 7,
    lift: 'Squat',
    weight: 100,
    reps: 4,
    e1rm: undefined,
    inheritedBestE1RM: 150,
    failedTopWeight: 135,
  })];

  const achieved = calculateAchievedMaxesFromHistory(history);

  expect(achieved.Squat.oneRM).toBe(100);
  expect(achieved.Squat.e1rm).toBeCloseTo(113.3333333333);
  expect(achieved.Squat.e1rm).toBeLessThan(135);
});

test('requires the same relative opener evidence across strength levels', () => {
  const lighter = buildSmartMeetPlanReadiness({
    history: [
      makeTrainingEntry({ workoutNumber: 1, lift: 'Squat', weight: 36, reps: 1, e1rm: 36 }),
      makeTrainingEntry({ workoutNumber: 2, lift: 'Bench', weight: 27, reps: 1, e1rm: 27 }),
      makeTrainingEntry({ workoutNumber: 3, lift: 'Deadlift', weight: 54, reps: 1, e1rm: 54 }),
    ],
    prs: { Squat: 45, Bench: 35, Deadlift: 65 },
    currentCycle: 1,
    meetPlannerAttempts: {
      Squat: attempts([40, 42.5, 45]),
      Bench: attempts([30, 32.5, 35]),
      Deadlift: attempts([60, 62.5, 65]),
    },
  });

  const stronger = buildSmartMeetPlanReadiness({
    history: [
      makeTrainingEntry({ workoutNumber: 1, lift: 'Squat', weight: 180, reps: 1, e1rm: 180 }),
      makeTrainingEntry({ workoutNumber: 2, lift: 'Bench', weight: 135, reps: 1, e1rm: 135 }),
      makeTrainingEntry({ workoutNumber: 3, lift: 'Deadlift', weight: 270, reps: 1, e1rm: 270 }),
    ],
    prs: { Squat: 225, Bench: 175, Deadlift: 325 },
    currentCycle: 1,
    meetPlannerAttempts: {
      Squat: attempts([200, 212.5, 225]),
      Bench: attempts([150, 162.5, 175]),
      Deadlift: attempts([300, 312.5, 325]),
    },
  });

  expect(lighter.byLift.Squat.currentCycleReadinessRatio).toBeCloseTo(0.9);
  expect(stronger.byLift.Squat.currentCycleReadinessRatio).toBeCloseTo(0.9);
  expect(lighter.byLift.Bench.currentCycleReadinessRatio).toBeCloseTo(0.9);
  expect(stronger.byLift.Bench.currentCycleReadinessRatio).toBeCloseTo(0.9);
  expect(lighter.byLift.Deadlift.currentCycleReadinessRatio).toBeCloseTo(0.9);
  expect(stronger.byLift.Deadlift.currentCycleReadinessRatio).toBeCloseTo(0.9);
  expect(lighter.ready).toBe(false);
  expect(stronger.ready).toBe(false);
});


test('requires all openers and 97.5% support for every second attempt', () => {
  const result = buildSmartMeetPlanReadiness({
    history: [
      makeTrainingEntry({ workoutNumber: 1, lift: 'Squat', weight: 95, reps: 1, e1rm: 95 }),
      makeTrainingEntry({ workoutNumber: 2, lift: 'Bench', weight: 75, reps: 1, e1rm: 75 }),
      makeTrainingEntry({ workoutNumber: 3, lift: 'Deadlift', weight: 130, reps: 1, e1rm: 130 }),
    ],
    prs: { Squat: 100, Bench: 80, Deadlift: 140 },
    currentCycle: 1,
    meetPlannerAttempts: {
      Squat: attempts([90, 97.5, 102.5]),
      Bench: attempts([72.5, 77.5, 82.5]),
      Deadlift: attempts([125, 137.5, 145]),
    },
  });

  expect(result.openerReady).toBe(true);
  expect(result.secondAttemptReady).toBe(false);
  expect(result.ready).toBe(false);
  expect(result.weakestPhase).toBe('second-attempt');
  expect(result.byLift.Squat.secondAttemptSupportTarget)
    .toBeCloseTo(95.0625);
  expect(result.byLift.Squat.secondAttemptReady).toBe(false);
  expect(result.byLift.Bench.secondAttemptReady).toBe(false);
  expect(result.byLift.Deadlift.secondAttemptReady).toBe(false);
});

test('projects a meet as a cycle-workout range from the slowest lift', () => {
  const projection = buildSmartMeetWorkoutProjection({
    meetPlanReadiness: {
      ready: false,
      weakestLift: 'Deadlift',
      weakestPhase: 'second-attempt',
      byLift: {
        Squat: {
          hasCurrentCycleEvidence: true,
          readinessTargetAttempt: 95,
          readinessPhase: 'ready',
          projectedExposureCount: 0,
        },
        Bench: {
          hasCurrentCycleEvidence: true,
          readinessTargetAttempt: 76,
          readinessPhase: 'ready',
          projectedExposureCount: 0,
        },
        Deadlift: {
          hasCurrentCycleEvidence: true,
          readinessTargetAttempt: 170,
          readinessPhase: 'second-attempt',
          projectedExposureCount: 2,
        },
      },
    },
    currentCycle: 3,
    currentWorkoutNumber: 24,
    rollingLiftExposureCounts: {
      Squat: 3,
      Bench: 4,
      Deadlift: 2,
    },
    rollingTrainingDayCount: 6,
    profileExposureTargets: {
      Squat: 3,
      Bench: 4,
      Deadlift: 2,
    },
  });

  expect(projection).toMatchObject({
    available: true,
    label: 'C3W32–C3W35',
    limitingLift: 'Deadlift',
    limitingPhase: 'second-attempt',
    minimumWorkoutNumber: 32,
    maximumWorkoutNumber: 35,
  });
});

test('withholds the meet projection until every lift has active-cycle evidence', () => {
  const projection = buildSmartMeetWorkoutProjection({
    meetPlanReadiness: {
      weakestLift: 'Bench',
      weakestPhase: 'opener',
      byLift: {
        Squat: { hasCurrentCycleEvidence: true, readinessTargetAttempt: 90 },
        Bench: { hasCurrentCycleEvidence: false, readinessTargetAttempt: 72.5 },
        Deadlift: { hasCurrentCycleEvidence: true, readinessTargetAttempt: 125 },
      },
    },
    currentCycle: 1,
    currentWorkoutNumber: 4,
  });

  expect(projection).toEqual({
    available: false,
    reason: 'insufficient-active-cycle-data',
    limitingLift: 'Bench',
    limitingPhase: 'opener',
  });
});


test('does not activate a meet when only the openers are supported', () => {
  const trainingPlan = [
    ['Squat', 90],
    ['Bench', 72.5],
    ['Deadlift', 125],
    ['Squat', 92.5],
    ['Bench', 75],
    ['Deadlift', 127.5],
    ['Squat', 90],
    ['Bench', 72.5],
  ];
  const history = trainingPlan.map(([lift, weight], index) =>
    makeTrainingEntry({
      workoutNumber: index + 1,
      lift,
      weight,
      reps: 1,
      e1rm: weight,
    })
  );
  const workouts = require('./App').generateWorkoutsForTrainingModel(
    'smart',
    {
      programProfile: 'kelaniSbdUltra',
      squat: 100,
      bench: 80,
      deadlift: 140,
      currentCycle: 1,
      history,
      currentIndex: 8,
    }
  );
  const decision = workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  expect(decision.smartDecisionSummary.readiness.meetPlanOpenerReady)
    .toBe(true);
  expect(decision.smartDecisionSummary.readiness.meetPlanSecondAttemptReady)
    .toBe(false);
  expect(decision.smartDecisionSummary.readiness.meetPlanReady)
    .toBe(false);
  expect(decision.smartDecisionSummary.readiness.meetdayBlockers)
    .toContain('second-attempt-readiness');
  expect(decision.smartDecisionSummary.dayType).not.toBe('meet');
  expect(decision.type).not.toBe('meet');
});

test('schedules one clean taper day after openers and second attempts are supported', () => {
  const trainingPlan = [
    ['Squat', 90],
    ['Bench', 72.5],
    ['Deadlift', 125],
    ['Squat', 97.5],
    ['Bench', 77.5],
    ['Deadlift', 135],
    ['Squat', 95],
    ['Bench', 75],
  ];

  const history = trainingPlan.map(([lift, weight], index) =>
    makeTrainingEntry({
      workoutNumber: index + 1,
      lift,
      weight,
      reps: 1,
      e1rm: weight,
    })
  );

  const args = {
    programProfile: 'kelaniSbdUltra',
    squat: 100,
    bench: 80,
    deadlift: 140,
    currentCycle: 1,
  };

  const taperWorkouts = require('./App').generateWorkoutsForTrainingModel(
    'smart',
    {
      ...args,
      history,
      currentIndex: 8,
    }
  );
  const taper = taperWorkouts.find(workout =>
    workout?.smartDecisionSummary
  );

  expect(taper.smartDecisionSummary.readiness.meetPlanOpenerReady).toBe(true);
  expect(taper.smartDecisionSummary.readiness.meetPlanSecondAttemptReady).toBe(true);
  expect(taper.smartDecisionSummary.readiness.meetPlanThirdAttemptPotentialCount).toBe(0);
  expect(taper.smartDecisionSummary.readiness.meetPlanReady).toBe(true);
  expect(taper.smartDecisionSummary.dayType).toBe('recovery');

  const historyAfterTaper = [
    ...history,
    {
      cycle: 1,
      workoutNumber: 9,
      restDay: true,
      smartDayType: 'recovery',
      workoutEffort: 'easy',
      workoutSnapshot: {
        number: 9,
        type: 'rest',
        smartDayType: 'recovery',
        workoutEffort: 'easy',
        lifts: [],
        sets: [],
      },
    },
  ];

  const meetWorkouts = require('./App').generateWorkoutsForTrainingModel(
    'smart',
    {
      ...args,
      history: historyAfterTaper,
      currentIndex: 9,
    }
  );
  const meet = meetWorkouts.find(workout =>
    workout?.smartDecisionSummary
  );

  expect(meet.smartDecisionSummary.readiness.meetPlanReady).toBe(true);
  expect(meet.smartDecisionSummary.dayType).toBe('meet');
  expect(meet.type).toBe('meet');
});
