import {
  buildSmartMeetPlanReadiness,
  buildSmartMeetWorkoutProjection,
  buildSmartReadinessSignals,
  generateWorkoutsForTrainingModel,
  isSmartCycleCompleteAfterHistory,
} from './smartTrainingEngine';
import {
  calculateAchievedMaxesFromHistory,
  formatSetPercentDisplay,
  roundE1RM,
} from './workoutHistoryStats';
import {
  buildSmartLiftState,
  buildSmartLiftPrescription,
} from './smartPrescriptionEngine';

function makeSmartLiftEntry({
  workoutNumber,
  lift = 'Bench',
  workoutEffort = 'good',
  role = 'primary',
  sets = [],
}) {
  return {
    cycle: 1,
    workoutNumber,
    lift,
    workoutEffort,
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      lift,
      lifts: [{ lift, role, sets }],
      workoutEffort,
    },
  };
}

function makeSet({
  labelKey,
  reps,
  pct,
  trainingMax,
  done = true,
  failed = false,
  skipped = false,
}) {
  const weight = Math.round((trainingMax * pct) / 2.5) * 2.5;
  return {
    labelKey,
    reps,
    pct,
    weight,
    originalPct: pct,
    originalWeight: weight,
    done,
    failed,
    skipped,
  };
}

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

// Mirrors the onboarding seedMax history entries the real app creates for
// every user's starting maxes (App.js handleStart) - the real, all-time
// best 1RM basis meet attempts are now computed from, kept separate from
// whatever e1RM evidence the current cycle's training produces.
function makeSeedMaxEntry(lift, weight) {
  return {
    workoutNumber: 0,
    cycle: 0,
    seedMax: true,
    lift,
    topWeight: weight,
    topReps: 1,
    e1rm: weight,
  };
}

const attempts = values => ({
  opener: values[0],
  secondAttempt: values[1],
  thirdAttempt: values[2],
});

function makeCompletedMeetEntries({
  workoutNumber = 10,
  workoutEffort = 'tooMuch',
  failedOrSkippedSetCount = 1,
  failAllAttempts = false,
  smartIdealRoute = null,
} = {}) {
  const failed = labelKey => failAllAttempts || (
    failedOrSkippedSetCount > 0 &&
    labelKey === 'thirdAttempt' &&
    !failAllAttempts
  );
  const attemptSet = (labelKey, weight) => ({
    labelKey,
    weight,
    reps: 1,
    done: true,
    failed: failed(labelKey),
    skipped: failed(labelKey),
  });
  const snapshot = {
    number: workoutNumber,
    type: 'meet',
    smartDayType: 'meet',
    workoutEffort,
    ...(smartIdealRoute ? { smartIdealRoute } : {}),
    lifts: [
      {
        lift: 'Squat',
        sets: [
          attemptSet('opener', 90),
          attemptSet('secondAttempt', 97.5),
          attemptSet('thirdAttempt', 100),
        ],
      },
      {
        lift: 'Bench',
        sets: [
          attemptSet('opener', 72.5),
          attemptSet('secondAttempt', 77.5),
          attemptSet('thirdAttempt', 80),
        ],
      },
      {
        lift: 'Deadlift',
        sets: [
          attemptSet('opener', 125),
          attemptSet('secondAttempt', 135),
          attemptSet('thirdAttempt', 140),
        ],
      },
    ],
  };

  return ['Squat', 'Bench', 'Deadlift'].map(lift => ({
    cycle: 1,
    workoutNumber,
    lift,
    smartDayType: 'meet',
    workoutEffort,
    failedOrSkippedSetCount,
    workoutSnapshot: snapshot,
  }));
}

function makePostMeetRecoveryEntry(workoutNumber) {
  return {
    cycle: 1,
    workoutNumber,
    restDay: true,
    completionOnly: true,
    smartDayType: 'recovery',
    workoutEffort: 'easy',
    workoutSnapshot: {
      number: workoutNumber,
      type: 'rest',
      smartDayType: 'recovery',
      workoutEffort: 'easy',
    },
  };
}

test('rounds every e1RM to the nearest 2.5kg barbell value', () => {
  expect(roundE1RM(180)).toBe(180);
  expect(roundE1RM(182.49)).toBe(182.5);
  expect(roundE1RM(182.5)).toBe(182.5);
  expect(roundE1RM(184.9)).toBe(185);
});

test('a completed meet suppresses another same-cycle meet projection and ends after its recovery days', () => {
  const meetHistory = makeCompletedMeetEntries();
  const readiness = buildSmartReadinessSignals({
    history: meetHistory,
    currentCycle: 1,
    prs: { Squat: 100, Bench: 80, Deadlift: 140 },
    oneRMs: { Squat: 100, Bench: 80, Deadlift: 140 },
  });

  expect(readiness).toMatchObject({
    completedMeetInCurrentCycle: true,
    lastMeetWorkoutNumber: 10,
    inPostMeetRecovery: true,
    postMeetRecoveryTarget: 2,
    meetProjection: {
      available: false,
      reason: 'meet-completed',
      completedMeetWorkoutNumber: 10,
    },
  });

  const recoveryHistory = [
    ...meetHistory,
    makePostMeetRecoveryEntry(11),
    makePostMeetRecoveryEntry(12),
  ];
  expect(isSmartCycleCompleteAfterHistory(recoveryHistory, 1)).toBe(true);
});

test('post-meet recovery is one day plus each missed attempt, capped at ten days', () => {
  const context = {
    currentCycle: 1,
    prs: { Squat: 100, Bench: 80, Deadlift: 140 },
    oneRMs: { Squat: 100, Bench: 80, Deadlift: 140 },
  };

  expect(buildSmartReadinessSignals({
    ...context,
    history: makeCompletedMeetEntries({
      workoutEffort: 'tooMuch',
      failedOrSkippedSetCount: 0,
    }),
  }).postMeetRecoveryTarget).toBe(1);

  expect(buildSmartReadinessSignals({
    ...context,
    history: makeCompletedMeetEntries({
      failedOrSkippedSetCount: 9,
      failAllAttempts: true,
    }),
  }).postMeetRecoveryTarget).toBe(10);
});

test('a failed ideal-route meet uses adaptive recovery and can still complete the cycle', () => {
  const history = [
    ...makeCompletedMeetEntries({
      failedOrSkippedSetCount: 1,
      smartIdealRoute: { stage: 'meet', postMeetRecoveryTarget: 1 },
    }),
    makePostMeetRecoveryEntry(11),
    makePostMeetRecoveryEntry(12),
  ];

  expect(isSmartCycleCompleteAfterHistory(history, 1)).toBe(true);
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

  expect(result.byLift.Squat.currentCycleBestE1RM).toBe(35);
  expect(result.byLift.Bench.currentCycleBestE1RM).toBe(27.5);
  expect(result.byLift.Deadlift.currentCycleBestE1RM).toBe(50);
  expect(result.byLift.Bench.currentCycleTarget).toBe(32.5);
  expect(result.byLift.Bench.plannedTopAttempt).toBe(32.5);
  expect(result.byLift.Bench.ready).toBe(false);
  expect(result.weakestLift).toBe('Deadlift');
});

test('uses the same strictly increasing beginner attempts as the visible meet plan', () => {
  const history = [
    makeSeedMaxEntry('Squat', 42.5),
    makeSeedMaxEntry('Bench', 32.5),
    makeSeedMaxEntry('Deadlift', 60),
    makeTrainingEntry({ workoutNumber: 1, lift: 'Squat', weight: 40, reps: 1, e1rm: 40 }),
    makeTrainingEntry({ workoutNumber: 2, lift: 'Bench', weight: 30, reps: 1, e1rm: 30 }),
    makeTrainingEntry({ workoutNumber: 3, lift: 'Deadlift', weight: 50, reps: 1, e1rm: 50 }),
  ];

  const result = buildSmartMeetPlanReadiness({
    history,
    prs: { Squat: 45, Bench: 35, Deadlift: 60 },
    currentCycle: 1,
  });

  expect(result.byLift.Squat.attempts)
    .toEqual({ opener: 37.5, secondAttempt: 42.5, thirdAttempt: 45 });
  expect(result.byLift.Bench.attempts)
    .toEqual({ opener: 30, secondAttempt: 32.5, thirdAttempt: 35 });
  expect(result.byLift.Deadlift.attempts)
    .toEqual({ opener: 55, secondAttempt: 57.5, thirdAttempt: 62.5 });
  expect(result.byLift.Deadlift.readinessPhase).toBe('opener');
  expect(result.byLift.Squat.readinessPhase).toBe('third-attempt');
  expect(result.byLift.Bench.readinessPhase).toBe('third-attempt');
});

test('uses the confirmed real 1RM target and identifies the actual limiter', () => {
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

  expect(result.byLift.Squat.currentCycleBestE1RM).toBe(115);
  expect(result.byLift.Squat.currentCycleTarget).toBe(145);
  expect(result.byLift.Squat.plannedTopAttempt).toBe(147.5);
  expect(result.byLift.Bench.currentCycleTarget).toBe(97.5);
  expect(result.byLift.Bench.openerReady).toBe(true);
  expect(result.byLift.Bench.secondAttemptReady).toBe(false);
  expect(result.byLift.Bench.ready).toBe(false);
  expect(result.byLift.Deadlift.ready).toBe(false);
  expect(result.weakestLift).toBe('Squat');
});

test('established 1RMs restore consistent attempts and confirm meet readiness', () => {
  const history = [
    makeSeedMaxEntry('Squat', 142.5),
    makeSeedMaxEntry('Bench', 97.5),
    makeSeedMaxEntry('Deadlift', 175),
    makeTrainingEntry({
      cycle: 3,
      workoutNumber: 38,
      lift: 'Squat',
      weight: 135,
      reps: 2,
      e1rm: 145,
    }),
    makeTrainingEntry({
      cycle: 3,
      workoutNumber: 33,
      lift: 'Bench',
      weight: 95,
      reps: 2,
      e1rm: 101.33,
    }),
    makeTrainingEntry({
      cycle: 3,
      workoutNumber: 39,
      lift: 'Deadlift',
      weight: 170,
      reps: 2,
      e1rm: 180,
      workoutEffort: 'tooMuch',
    }),
  ];

  const result = buildSmartMeetPlanReadiness({
    history,
    prs: { Squat: 145, Bench: 102.5, Deadlift: 182.5 },
    oneRMs: { Squat: 145, Bench: 97.5, Deadlift: 180 },
    currentCycle: 3,
  });

  expect(result.byLift.Squat.attempts).toEqual({
    opener: 130,
    secondAttempt: 142.5,
    thirdAttempt: 147.5,
  });
  expect(result.byLift.Bench.attempts).toEqual({
    opener: 87.5,
    secondAttempt: 95,
    thirdAttempt: 100,
  });
  expect(result.byLift.Deadlift.attempts).toEqual({
    opener: 162.5,
    secondAttempt: 175,
    thirdAttempt: 185,
  });
  expect(result.byLift).toMatchObject({
    Squat: { currentCycleBestE1RM: 145, secondAttemptReady: true },
    Bench: { currentCycleBestE1RM: 102.5, secondAttemptReady: true },
    Deadlift: { currentCycleBestE1RM: 182.5, secondAttemptReady: true },
  });
  expect(result.ready).toBe(true);
});

test('a clean taper after enough work offers the meet with the restored attempt plan', () => {
  const readinessEntries = [
    makeTrainingEntry({ cycle: 3, workoutNumber: 1, lift: 'Squat', weight: 135, reps: 2, e1rm: 145 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 2, lift: 'Bench', weight: 95, reps: 2, e1rm: 101.33 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 3, lift: 'Deadlift', weight: 170, reps: 2, e1rm: 180 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 4, lift: 'Squat', weight: 100, reps: 5, e1rm: 116.67 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 5, lift: 'Bench', weight: 70, reps: 5, e1rm: 81.67 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 6, lift: 'Deadlift', weight: 130, reps: 4, e1rm: 147.33 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 7, lift: 'Squat', weight: 100, reps: 5, e1rm: 116.67 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 8, lift: 'Bench', weight: 70, reps: 5, e1rm: 81.67 }),
  ];
  const recovery = {
    cycle: 3,
    workoutNumber: 9,
    restDay: true,
    completionOnly: true,
    smartDayType: 'recovery',
    workoutEffort: 'easy',
    failedOrSkippedSetCount: 0,
    workoutSnapshot: {
      number: 9,
      type: 'rest',
      smartDayType: 'recovery',
      workoutEffort: 'easy',
    },
  };

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 142.5,
    bench: 92.5,
    deadlift: 175,
    oneRMs: { Squat: 145, Bench: 97.5, Deadlift: 180 },
    history: [...readinessEntries, recovery],
    currentCycle: 3,
    currentIndex: 9,
  });
  const meet = workouts.find(workout => workout?.smartDecisionSummary);

  expect(meet).toMatchObject({
    type: 'meet',
    smartDayType: 'meet',
    smartDecisionSummary: {
      reason: 'meetday-ready',
      readiness: {
        meetPlanReady: true,
        meetdayBlockers: [],
      },
    },
  });
  expect(meet.lifts.find(block => block.lift === 'Squat').sets.map(set => set.weight))
    .toEqual([130, 142.5, 147.5]);
});

test('a failed heavy Deadlift proof keeps its strength evidence but requires two final recovery days', () => {
  const failedHeavyDeadlift = {
    cycle: 3,
    workoutNumber: 3,
    lift: 'Deadlift',
    topWeight: 170,
    topReps: 2,
    e1rm: 180,
    workoutEffort: 'tooMuch',
    failedOrSkippedSetCount: 3,
    workoutSnapshot: {
      number: 3,
      type: 'training',
      smartDayType: 'training',
      workoutEffort: 'tooMuch',
      lifts: [{
        lift: 'Deadlift',
        role: 'primary',
        sets: [
          { labelKey: 'topDouble', reps: 2, weight: 170, pct: 170 / 180, done: true, failed: false, skipped: false },
          { labelKey: 'backoff', reps: 4, weight: 145, pct: 145 / 180, done: true, failed: false, skipped: false },
          ...Array.from({ length: 3 }, () => ({
            labelKey: 'backoff',
            reps: 4,
            weight: 145,
            pct: 145 / 180,
            done: true,
            failed: true,
            skipped: true,
          })),
        ],
      }],
    },
  };
  const recovery = workoutNumber => ({
    cycle: 3,
    workoutNumber,
    restDay: true,
    completionOnly: true,
    smartDayType: 'recovery',
    workoutEffort: 'easy',
    failedOrSkippedSetCount: 0,
    workoutSnapshot: {
      number: workoutNumber,
      type: 'rest',
      smartDayType: 'recovery',
      workoutEffort: 'easy',
    },
  });
  const history = [
    makeTrainingEntry({ cycle: 3, workoutNumber: 1, lift: 'Squat', weight: 135, reps: 2, e1rm: 145 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 2, lift: 'Bench', weight: 95, reps: 2, e1rm: 101.33 }),
    failedHeavyDeadlift,
    recovery(4),
    makeTrainingEntry({ cycle: 3, workoutNumber: 5, lift: 'Bench', weight: 70, reps: 5, e1rm: 81.67 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 6, lift: 'Deadlift', weight: 115, reps: 4, e1rm: 130 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 7, lift: 'Squat', weight: 100, reps: 5, e1rm: 116.67 }),
    makeTrainingEntry({ cycle: 3, workoutNumber: 8, lift: 'Bench', weight: 70, reps: 5, e1rm: 81.67 }),
    recovery(9),
  ];
  const options = {
    programProfile: 'kelaniSbdUltra',
    squat: 142.5,
    bench: 92.5,
    deadlift: 175,
    oneRMs: { Squat: 145, Bench: 97.5, Deadlift: 180 },
    currentCycle: 3,
  };
  const firstDecision = generateWorkoutsForTrainingModel('smart', {
    ...options,
    history,
    currentIndex: 9,
  }).find(workout => workout?.smartDecisionSummary);

  expect(firstDecision).toMatchObject({
    type: 'rest',
    smartDayType: 'recovery',
    smartDecisionSummary: {
      reason: 'deadlift-taper-recovery',
      readiness: {
        meetPlanReady: true,
        preMeetHeavyDeadliftFailureWorkoutNumber: 3,
        preMeetHeavyDeadliftRecoveryDaysCompleted: 1,
        preMeetHeavyDeadliftRecoveryDaysRequired: 2,
        needsPreMeetHeavyDeadliftRecovery: true,
        meetProjection: {
          label: 'C3W11',
          projectedBySimulation: true,
        },
      },
    },
  });
  expect(firstDecision.smartDecisionSummary.readiness.meetdayBlockers)
    .toContain('deadlift-taper-recovery');

  const meet = generateWorkoutsForTrainingModel('smart', {
    ...options,
    history: [...history, recovery(10)],
    currentIndex: 10,
  }).find(workout => workout?.smartDecisionSummary);

  expect(meet).toMatchObject({
    type: 'meet',
    smartDayType: 'meet',
    smartDecisionSummary: {
      reason: 'meetday-ready',
      readiness: {
        meetPlanReady: true,
        preMeetHeavyDeadliftRecoveryDaysCompleted: 2,
        needsPreMeetHeavyDeadliftRecovery: false,
        meetdayBlockers: [],
      },
    },
  });
});

test('a later clean heavy Deadlift clears an earlier heavy-failure taper debt', () => {
  const heavyDeadliftEntry = ({ workoutNumber, failed }) => ({
    cycle: 1,
    workoutNumber,
    lift: 'Deadlift',
    topWeight: 135,
    topReps: 2,
    e1rm: 144,
    workoutEffort: failed ? 'tooMuch' : 'good',
    failedOrSkippedSetCount: failed ? 1 : 0,
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      workoutEffort: failed ? 'tooMuch' : 'good',
      lifts: [{
        lift: 'Deadlift',
        role: 'primary',
        sets: [
          { labelKey: 'topDouble', reps: 2, weight: 135, pct: 135 / 140, done: true, failed: false, skipped: false },
          ...(failed ? [{ labelKey: 'backoff', reps: 4, weight: 110, pct: 110 / 140, done: true, failed: true, skipped: true }] : []),
        ],
      }],
    },
  });
  const history = [
    makeTrainingEntry({ workoutNumber: 1, lift: 'Squat', weight: 97, reps: 2, e1rm: 103.47 }),
    makeTrainingEntry({ workoutNumber: 2, lift: 'Bench', weight: 77.5, reps: 2, e1rm: 82.67 }),
    heavyDeadliftEntry({ workoutNumber: 3, failed: true }),
    makeTrainingEntry({ workoutNumber: 4, lift: 'Squat', weight: 70, reps: 5, e1rm: 81.67 }),
    makeTrainingEntry({ workoutNumber: 5, lift: 'Bench', weight: 55, reps: 5, e1rm: 64.17 }),
    makeTrainingEntry({ workoutNumber: 6, lift: 'Squat', weight: 70, reps: 5, e1rm: 81.67 }),
    makeTrainingEntry({ workoutNumber: 7, lift: 'Bench', weight: 55, reps: 5, e1rm: 64.17 }),
    heavyDeadliftEntry({ workoutNumber: 8, failed: false }),
    {
      cycle: 1,
      workoutNumber: 9,
      restDay: true,
      completionOnly: true,
      smartDayType: 'recovery',
      workoutEffort: 'easy',
      workoutSnapshot: { number: 9, type: 'rest', smartDayType: 'recovery', workoutEffort: 'easy' },
    },
  ];
  const next = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 100,
    bench: 80,
    deadlift: 140,
    oneRMs: { Squat: 100, Bench: 80, Deadlift: 140 },
    currentCycle: 1,
    history,
    currentIndex: 9,
  }).find(workout => workout?.smartDecisionSummary);

  expect(next).toMatchObject({
    type: 'meet',
    smartDayType: 'meet',
    smartDecisionSummary: {
      readiness: {
        needsPreMeetHeavyDeadliftRecovery: false,
        meetdayBlockers: [],
      },
    },
  });
});

test('ignores failed top work and keeps successful multi-rep work as e1RM-only evidence', () => {
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

  expect(achieved.Squat.oneRM).toBe(0);
  expect(achieved.Squat.e1rm).toBeCloseTo(113.3333333333);
  expect(achieved.Squat.e1rm).toBeLessThan(135);
});

test('uses the same 2.5kg e1RM rounding policy across strength levels', () => {
  const lighter = buildSmartMeetPlanReadiness({
    history: [
      makeTrainingEntry({ workoutNumber: 1, lift: 'Squat', weight: 36, reps: 1, e1rm: 36 }),
      makeTrainingEntry({ workoutNumber: 2, lift: 'Bench', weight: 27, reps: 1, e1rm: 27 }),
      makeTrainingEntry({ workoutNumber: 3, lift: 'Deadlift', weight: 54, reps: 1, e1rm: 54 }),
    ],
    prs: { Squat: 45, Bench: 35, Deadlift: 65 },
    oneRMs: { Squat: 45, Bench: 35, Deadlift: 65 },
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
    oneRMs: { Squat: 225, Bench: 175, Deadlift: 325 },
    currentCycle: 1,
    meetPlannerAttempts: {
      Squat: attempts([200, 212.5, 225]),
      Bench: attempts([150, 162.5, 175]),
      Deadlift: attempts([300, 312.5, 325]),
    },
  });

  expect(lighter.byLift.Squat.currentCycleReadinessRatio).toBeCloseTo(35 / 45);
  expect(stronger.byLift.Squat.currentCycleReadinessRatio).toBeCloseTo(180 / 225);
  expect(lighter.byLift.Bench.currentCycleReadinessRatio).toBeCloseTo(27.5 / 35);
  expect(stronger.byLift.Bench.currentCycleReadinessRatio).toBeCloseTo(135 / 175);
  expect(lighter.byLift.Deadlift.currentCycleReadinessRatio).toBeCloseTo(55 / 65);
  expect(stronger.byLift.Deadlift.currentCycleReadinessRatio).toBeCloseTo(270 / 325);
  expect(lighter.ready).toBe(false);
  expect(stronger.ready).toBe(false);
});


test('reaching the 90% phase is not enough for the 100%-of-real-1RM gate', () => {
  const result = buildSmartMeetPlanReadiness({
    history: [
      makeTrainingEntry({ workoutNumber: 1, lift: 'Squat', weight: 90, reps: 1, e1rm: 90 }),
      makeTrainingEntry({ workoutNumber: 2, lift: 'Bench', weight: 72.5, reps: 1, e1rm: 72.5 }),
      makeTrainingEntry({ workoutNumber: 3, lift: 'Deadlift', weight: 125, reps: 1, e1rm: 125 }),
    ],
    prs: { Squat: 100, Bench: 80, Deadlift: 140 },
    oneRMs: { Squat: 100, Bench: 80, Deadlift: 140 },
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
  expect(result.byLift.Squat.oneRMTargetE1RM).toBe(100);
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
          projectedMeetReadyExposureCount: 2,
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
    label: 'C3W31–C3W33',
    limitingLift: 'Deadlift',
    limitingPhase: 'second-attempt',
    minimumWorkoutNumber: 31,
    maximumWorkoutNumber: 33,
  });
});

test('does not project optional third-attempt evidence past meet readiness', () => {
  const projection = buildSmartMeetWorkoutProjection({
    meetPlanReadiness: {
      ready: true,
      fullyDemonstrated: false,
      weakestLift: 'Deadlift',
      weakestPhase: 'third-attempt',
      byLift: {
        Squat: {
          hasCurrentCycleEvidence: true,
          readinessTargetAttempt: 148.5,
          readinessPhase: 'third-attempt',
          projectedMeetReadyExposureCount: 0,
          projectedExposureCount: 2,
        },
        Bench: {
          hasCurrentCycleEvidence: true,
          readinessTargetAttempt: 100,
          readinessPhase: 'ready',
          projectedMeetReadyExposureCount: 0,
          projectedExposureCount: 0,
        },
        Deadlift: {
          hasCurrentCycleEvidence: true,
          readinessTargetAttempt: 184.5,
          readinessPhase: 'third-attempt',
          projectedMeetReadyExposureCount: 0,
          projectedExposureCount: 3,
        },
      },
    },
    currentCycle: 3,
    currentWorkoutNumber: 37,
    rollingLiftExposureCounts: { Squat: 7, Bench: 8, Deadlift: 4 },
    rollingProgressionExposureCounts: { Squat: 2, Bench: 2, Deadlift: 2 },
    rollingTrainingDayCount: 12,
    profileExposureTargets: { Squat: 3, Bench: 4, Deadlift: 2 },
    profileProgressionExposureTargets: { Squat: 1, Bench: 1, Deadlift: 1 },
  });

  expect(projection).toMatchObject({
    label: 'C3W39',
    limitingLift: null,
    limitingPhase: 'ready',
    minimumWorkoutNumber: 39,
    maximumWorkoutNumber: 39,
  });
  expect(projection.perLift.find(row => row.lift === 'Deadlift')).toMatchObject({
    requiredExposures: 0,
    expectedWorkouts: 0,
  });
});

test('fully demonstrated plan projects light taper, mandatory rest, then meet', () => {
  const readyPlan = {
    ready: true,
    fullyDemonstrated: true,
    byLift: {
      Squat: { hasCurrentCycleEvidence: true, readinessTargetAttempt: 150, projectedExposureCount: 0 },
      Bench: { hasCurrentCycleEvidence: true, readinessTargetAttempt: 100, projectedExposureCount: 0 },
      Deadlift: { hasCurrentCycleEvidence: true, readinessTargetAttempt: 185, projectedExposureCount: 0 },
    },
  };

  const beforeTaper = buildSmartMeetWorkoutProjection({
    meetPlanReadiness: readyPlan,
    currentCycle: 3,
    currentWorkoutNumber: 54,
    lastTrainingDayWasLightOnly: false,
  });
  const afterTaper = buildSmartMeetWorkoutProjection({
    meetPlanReadiness: readyPlan,
    currentCycle: 3,
    currentWorkoutNumber: 55,
    lastTrainingDayWasLightOnly: true,
  });
  const afterRest = buildSmartMeetWorkoutProjection({
    meetPlanReadiness: readyPlan,
    currentCycle: 3,
    currentWorkoutNumber: 56,
    lastWasRecoveryIntervention: true,
  });

  expect(beforeTaper.label).toBe('C3W56');
  expect(beforeTaper.taperWorkouts).toBe(2);
  expect(afterTaper.label).toBe('C3W56');
  expect(afterTaper.taperWorkouts).toBe(1);
  expect(afterRest.label).toBe('C3W56');
  expect(afterRest.taperWorkouts).toBe(0);
});

test('uses a wider frequency window for the meet projection than for candidate scoring', () => {
  // Squat trains 4 of the first 6 days, then a Bench+Deadlift day (no Squat)
  // is added. The 6-day window used for same-day candidate scoring quantizes
  // hard (4/6 -> 3/6): one day aging out of a 6-slot window is a full 1/6
  // swing. The meet projection instead uses a wider (12-day) window, which
  // only grows the denominator (4/6 -> 4/7) until an old exposure actually
  // ages out past 12 days — a much smaller day-to-day swing, which is what
  // keeps the projected meet date from spiking after a single non-squat day.
  const plan = ['Squat', 'Squat', 'Squat', 'Squat', 'Bench', 'Deadlift'];
  const baseWeight = { Squat: 90, Bench: 72.5, Deadlift: 125 };
  const counts = { Squat: 0, Bench: 0, Deadlift: 0 };

  const rotationHistory = plan.map((lift, index) => {
    const weight = baseWeight[lift] + counts[lift] * 2.5;
    counts[lift] += 1;

    return {
      cycle: 1,
      workoutNumber: index + 1,
      lift,
      workoutEffort: 'good',
      workoutSnapshot: {
        number: index + 1,
        type: 'training',
        smartDayType: 'training',
        workoutEffort: 'good',
        lift,
        lifts: [{ lift, sets: [{ labelKey: 'topSingle', reps: 1, weight, done: true }] }],
      },
    };
  });

  const before = buildSmartReadinessSignals({
    history: rotationHistory,
    prs: { Squat: 100, Bench: 80, Deadlift: 140 },
    currentCycle: 1,
    currentIndex: 6,
    programProfile: 'kelaniSbdUltra',
  });

  const nonSquatDay = ['Bench', 'Deadlift'].map(lift => ({
    cycle: 1,
    workoutNumber: 7,
    lift,
    workoutEffort: 'good',
    workoutSnapshot: {
      number: 7,
      type: 'training',
      smartDayType: 'training',
      workoutEffort: 'good',
      lift,
      lifts: [{ lift, sets: [{ labelKey: 'topSingle', reps: 1, weight: baseWeight[lift] + 2.5, done: true }] }],
    },
  }));

  const after = buildSmartReadinessSignals({
    history: [...rotationHistory, ...nonSquatDay],
    prs: { Squat: 100, Bench: 80, Deadlift: 140 },
    currentCycle: 1,
    currentIndex: 7,
    programProfile: 'kelaniSbdUltra',
  });

  expect(before.rollingLiftExposureCounts.Squat).toBe(4);
  expect(before.rollingTrainingDayCount).toBe(6);
  expect(after.rollingLiftExposureCounts.Squat).toBe(3);
  expect(after.rollingTrainingDayCount).toBe(6);

  expect(before.projectionLiftExposureCounts.Squat).toBe(4);
  expect(before.projectionTrainingDayCount).toBe(6);
  expect(after.projectionLiftExposureCounts.Squat).toBe(4);
  expect(after.projectionTrainingDayCount).toBe(7);
  // A completed Smart exposure progresses its own prescription regardless
  // of whether the lift was primary or secondary that day. The projection
  // must use that same usable-exposure cadence.
  expect(after.projectionProgressionExposureCounts)
    .toEqual(after.projectionLiftExposureCounts);
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
  const history = [
    makeSeedMaxEntry('Squat', 100),
    makeSeedMaxEntry('Bench', 80),
    makeSeedMaxEntry('Deadlift', 140),
    ...trainingPlan.map(([lift, weight], index) =>
      makeTrainingEntry({
        workoutNumber: index + 1,
        lift,
        weight,
        reps: 1,
        e1rm: weight,
      })
    ),
  ];
  const workouts = generateWorkoutsForTrainingModel(
    'smart',
    {
      programProfile: 'kelaniSbdUltra',
      squat: 100,
      bench: 80,
      deadlift: 140,
      oneRMs: { Squat: 100, Bench: 80, Deadlift: 140 },
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
    .toContain('one-rm-readiness');
  expect(decision.smartDecisionSummary.dayType).not.toBe('meet');
  expect(decision.type).not.toBe('meet');
});

test('schedules one clean taper day only after every lift has also shown third-attempt potential, then offers the meet', () => {
  // Design invariant: opener -> second attempt -> INDIRECTLY
  // demonstrate the third attempt (more reps at a proven-or-higher weight,
  // never a literal near-meet single in training) -> only then taper ->
  // meet. Tapering right after second-attempt support skips real, useful
  // third-attempt work still available - see isSmartMeetdayReady /
  // meetPlanFullyDemonstrated in smartTrainingEngine.js.
  const trainingPlan = [
    ['Squat', 90, 1], ['Bench', 72.5, 1], ['Deadlift', 125, 1], // openers
    ['Squat', 97.5, 1], ['Bench', 77.5, 1], ['Deadlift', 135, 1], // second-attempt support
    // Third-attempt potential is demonstrated INDIRECTLY, via reps at a
    // weight still below the real 1RM seed (97/77/135, all under the
    // 100/80/140 seed) - never a literal new single above what's already
    // proven, matching the "never rehearse the real attempt in training"
    // design. The e1RM these doubles produce clears each 102.5%-of-real-1RM
    // target without the real 1RM basis itself moving.
    ['Squat', 97, 2], ['Bench', 77.5, 2], ['Deadlift', 135, 2],
  ];

  const history = [
    makeSeedMaxEntry('Squat', 100),
    makeSeedMaxEntry('Bench', 80),
    makeSeedMaxEntry('Deadlift', 140),
    ...trainingPlan.map(([lift, weight, reps], index) =>
      makeTrainingEntry({
        workoutNumber: index + 1,
        lift,
        weight,
        reps,
        e1rm: weight,
      })
    ),
  ];

  const args = {
    programProfile: 'kelaniSbdUltra',
    squat: 100,
    bench: 80,
    deadlift: 140,
    currentCycle: 1,
  };

  const taperWorkouts = generateWorkoutsForTrainingModel(
    'smart',
    {
      ...args,
      history,
      currentIndex: 9,
    }
  );
  const taper = taperWorkouts.find(workout =>
    workout?.smartDecisionSummary
  );

  expect(taper.smartDecisionSummary.readiness.meetPlanOpenerReady).toBe(true);
  expect(taper.smartDecisionSummary.readiness.meetPlanSecondAttemptReady).toBe(true);
  expect(taper.smartDecisionSummary.readiness.meetPlanReady).toBe(true);
  expect(taper.smartDecisionSummary.readiness.meetPlanFullyDemonstrated).toBe(true);
  expect(taper.smartDecisionSummary.dayType).toBe('recovery');
});

test('a light taper workout forces rest before the meet even when the active block is short', () => {
  const demonstrated = [
    ['Squat', 97, 2],
    ['Bench', 77.5, 2],
    ['Deadlift', 135, 2],
  ].map(([lift, weight, reps], index) => makeTrainingEntry({
    workoutNumber: index + 1,
    lift,
    weight,
    reps,
    e1rm: weight,
  }));
  const recovery = {
    cycle: 1,
    workoutNumber: 4,
    restDay: true,
    smartDayType: 'recovery',
    workoutEffort: 'easy',
    workoutSnapshot: { type: 'rest', smartDayType: 'recovery' },
  };
  const lightTaper = makeSmartLiftEntry({
    workoutNumber: 5,
    lift: 'Squat',
    role: 'tertiary',
    sets: [{ labelKey: 'workSets', reps: 4, weight: 60, pct: 0.6, done: true }],
  });
  const history = [
    makeSeedMaxEntry('Squat', 100),
    makeSeedMaxEntry('Bench', 80),
    makeSeedMaxEntry('Deadlift', 140),
    ...demonstrated,
    recovery,
    lightTaper,
  ];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 100,
    bench: 80,
    deadlift: 140,
    currentCycle: 1,
    history,
    currentIndex: 5,
  });
  const next = workouts.find(workout => workout?.smartDecisionSummary);

  expect(next.smartDecisionSummary.readiness.meetPlanFullyDemonstrated).toBe(true);
  expect(next.smartDecisionSummary.readiness.lastTrainingDayWasLightOnly).toBe(true);
  expect(next.smartDecisionSummary.dayType).toBe('recovery');
  expect(next.type).toBe('rest');
  expect(next.smartDecisionSummary.readiness.meetProjection).toMatchObject({
    label: 'C1W9',
    projectedBySimulation: true,
    assumedSuccessfulFutureWorkouts: true,
  });
});

test("a sub-maximal training PR (raising e1RM/prs) never moves the athlete's meet attempts - only a real heavier single does", () => {
  // A real 95kg single (W29) sets the true 1RM basis. Later, a 95kg TOP
  // DOUBLE (2 reps, same weight, no real single attempted) raises e1RM/prs
  // to ~101 - a legitimate training PR - but opener/2nd/3rd must not move,
  // since no heavier single was actually lifted. "opener 90 -> unchanged,
  // 2nd 100 -> not real, 3rd 105 -> never attempted" was
  // the exact wrong behavior this fixes.
  const historyBeforeDouble = [
    makeTrainingEntry({
      workoutNumber: 29,
      lift: 'Bench',
      weight: 95,
      reps: 1,
      e1rm: 95,
    }),
  ];

  const readinessBefore = buildSmartMeetPlanReadiness({
    history: historyBeforeDouble,
    prs: { Squat: 100, Bench: 95, Deadlift: 100 },
    currentCycle: 3,
  });

  const historyAfterDouble = [
    ...historyBeforeDouble,
    makeTrainingEntry({
      workoutNumber: 33,
      lift: 'Bench',
      weight: 95,
      reps: 2,
      e1rm: 95 * (1 + 2 / 30),
    }),
  ];

  const readinessAfter = buildSmartMeetPlanReadiness({
    history: historyAfterDouble,
    // prs already bumped by the training PR, exactly as the real app does
    // on every workout completion (mergeHigherPrs + calculatePrsFromHistory).
    prs: { Squat: 100, Bench: 101.33, Deadlift: 100 },
    currentCycle: 3,
  });

  expect(readinessBefore.byLift.Bench.attempts).toEqual(
    readinessAfter.byLift.Bench.attempts
  );
  expect(readinessAfter.byLift.Bench.attempts.opener).toBe(85);
});

test('supporting the attempts still does not satisfy the 100%-of-real-1RM gate', () => {
  const trainingPlan = [
    ['Squat', 90], ['Bench', 72.5], ['Deadlift', 125],
    ['Squat', 97.5], ['Bench', 77.5], ['Deadlift', 135],
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

  const workouts = generateWorkoutsForTrainingModel(
    'smart',
    {
      programProfile: 'kelaniSbdUltra',
      squat: 100,
      bench: 80,
      deadlift: 140,
      oneRMs: { Squat: 100, Bench: 80, Deadlift: 140 },
      currentCycle: 1,
      history,
      currentIndex: 6,
    }
  );
  const next = workouts.find(workout => workout?.smartDecisionSummary);

  expect(next.smartDecisionSummary.readiness.meetPlanReady).toBe(false);
  expect(next.smartDecisionSummary.readiness.meetPlanFullyDemonstrated).toBe(false);
  expect(next.smartDecisionSummary.readiness.meetdayBlockers)
    .not.toContain('third-attempt-potential');
  expect(next.smartDecisionSummary.readiness.meetdayBlockers)
    .toContain('one-rm-readiness');
  expect(next.smartDecisionSummary.readiness.completedCount).toBeLessThan(8);
  expect(next.smartDecisionSummary.dayType).not.toBe('meet');
  expect(next.smartDecisionSummary.dayType).toBe('training');
});

test('enters the third-attempt phase once second-attempt e1RM is demonstrated but third-attempt is not', () => {
  const result = buildSmartMeetPlanReadiness({
    history: [
      makeTrainingEntry({ workoutNumber: 1, lift: 'Bench', weight: 96, reps: 1, e1rm: 96 }),
    ],
    prs: { Squat: 100, Bench: 100, Deadlift: 100 },
    oneRMs: { Squat: 100, Bench: 100, Deadlift: 100 },
    currentCycle: 1,
    meetPlannerAttempts: {
      Bench: attempts([90, 97.5, 102.5]),
    },
  });

  expect(result.byLift.Bench.openerReady).toBe(true);
  expect(result.byLift.Bench.secondAttemptReady).toBe(true);
  expect(result.byLift.Bench.thirdAttemptPotential).toBe(false);
  expect(result.byLift.Bench.readinessPhase).toBe('third-attempt');
  expect(result.byLift.Bench.ready).toBe(false);
  expect(result.byLift.Bench.fullyDemonstrated).toBe(false);
});

test('reaches the ready phase at 100% of the confirmed real 1RM', () => {
  const result = buildSmartMeetPlanReadiness({
    history: [
      makeTrainingEntry({ workoutNumber: 1, lift: 'Bench', weight: 100, reps: 1, e1rm: 100 }),
    ],
    prs: { Squat: 100, Bench: 100, Deadlift: 100 },
    oneRMs: { Squat: 100, Bench: 100, Deadlift: 100 },
    currentCycle: 1,
    meetPlannerAttempts: {
      Bench: attempts([90, 97.5, 102.5]),
    },
  });

  expect(result.byLift.Bench.thirdAttemptPotential).toBe(true);
  expect(result.byLift.Bench.readinessPhase).toBe('ready');
  expect(result.byLift.Bench.ready).toBe(true);
});

test('a 182.5kg Deadlift e1RM clears a real 180kg 1RM regardless of the 185kg third attempt', () => {
  const result = buildSmartMeetPlanReadiness({
    history: [
      makeTrainingEntry({
        cycle: 3,
        workoutNumber: 46,
        lift: 'Deadlift',
        weight: 182.5,
        reps: 1,
        e1rm: 182.5,
      }),
    ],
    prs: { Squat: 150, Bench: 100, Deadlift: 182.5 },
    oneRMs: { Squat: 150, Bench: 100, Deadlift: 180 },
    currentCycle: 3,
    meetPlannerAttempts: {
      Deadlift: attempts([162.5, 175, 185]),
    },
  });

  expect(result.byLift.Deadlift.currentCycleBestE1RM).toBe(182.5);
  expect(result.byLift.Deadlift.thirdAttemptPotential).toBe(true);
  expect(result.byLift.Deadlift.readinessPhase).toBe('ready');
  expect(result.byLift.Deadlift.ready).toBe(true);
  expect(result.byLift.Deadlift.fullyDemonstrated).toBe(true);
});

test('a new cycle resets readinessPhase back to opener even after a fully-ready previous cycle', () => {
  const history = [
    makeTrainingEntry({ cycle: 1, workoutNumber: 1, lift: 'Bench', weight: 103, reps: 1, e1rm: 103 }),
  ];

  const result = buildSmartMeetPlanReadiness({
    history,
    prs: { Squat: 100, Bench: 100, Deadlift: 100 },
    currentCycle: 2,
    meetPlannerAttempts: {
      Bench: attempts([90, 97.5, 102.5]),
    },
  });

  expect(result.byLift.Bench.currentCycleBestE1RM).toBe(0);
  expect(result.byLift.Bench.readinessPhase).toBe('opener');
  expect(result.byLift.Bench.ready).toBe(false);
});

test('third-attempt phase prescribes an escalating top double toward third-attempt e1RM equivalence', () => {
  const state = buildSmartLiftState({
    history: [
      makeSmartLiftEntry({
        lift: 'Bench',
        workoutNumber: 1,
        sets: [
          makeSet({ labelKey: 'topDouble', reps: 2, pct: 0.85, trainingMax: 100 }),
          ...Array.from({ length: 4 }, () => makeSet({ labelKey: 'backoff', reps: 5, pct: 0.75, trainingMax: 100 })),
        ],
      }),
    ],
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
    meetPlanReadiness: {
      Bench: {
        ready: false,
        readinessPhase: 'third-attempt',
        attempts: { opener: 90, secondAttempt: 97.5, thirdAttempt: 102.5 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets[0].labelKey).toBe('topDouble');
  expect(prescription.sets[0].reps).toBe(2);
  // Anchor 0.85 + a 2.5% good-session step = 0.875, still well below the
  // 102.5/100/(1+2/30) ~= 0.9611 third-attempt-equivalent ceiling - the
  // double climbs toward that ceiling gradually, never toward a literal
  // third-attempt single.
  expect(prescription.sets[0].precisePct).toBeCloseTo(0.875, 3);
  expect(prescription.sets[0].precisePct).toBeLessThanOrEqual(0.9612);
});

test('a progressing 90% top double must visibly advance to 95%', () => {
  const state = buildSmartLiftState({
    history: [makeSmartLiftEntry({
      lift: 'Deadlift',
      workoutNumber: 1,
      sets: [
        makeSet({ labelKey: 'topDouble', reps: 2, pct: 0.90, trainingMax: 180 }),
        ...Array.from({ length: 4 }, () => makeSet({ labelKey: 'backoff', reps: 4, pct: 0.75, trainingMax: 180 })),
      ],
    })],
    currentCycle: 1,
    lift: 'Deadlift',
    trainingMax: 180,
    meetPlanReadiness: {
      Deadlift: {
        ready: false,
        readinessPhase: 'third-attempt',
        attempts: { opener: 170, secondAttempt: 180, thirdAttempt: 200 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });

  expect(prescription.sets[0].labelKey).toBe('topDouble');
  // 170kg is 94.44% of a 180kg training max, which displays at the nearest
  // 2.5-percentage-point step.
  expect(prescription.sets[0].precisePct).toBeGreaterThan(0.90);
  expect(formatSetPercentDisplay(prescription.sets[0].precisePct)).toBe('92.5');
});

test('third-attempt phase converts a non-double anchor (e.g. a single carried in from second-attempt phase) to its double-equivalent instead of flagging a false regression', () => {
  // Reproduces the v1.5.3 regression: the lift's last top set was a
  // single (from the second-attempt phase this cycle just transitioned out
  // of), and this phase always prescribes a double. Comparing the double's
  // lower raw %1RM against the single's higher raw %1RM without converting
  // rep schemes first made validateSmartLiftPrescription think top work had
  // regressed, throwing "Invalid Smart prescription" out of buildLiftBlocks
  // right after workout completion (uncaught -> blank screen, and again on
  // next app load -> falls back to onboarding).
  const state = buildSmartLiftState({
    history: [
      makeSmartLiftEntry({
        lift: 'Bench',
        workoutNumber: 1,
        sets: [
          makeSet({ labelKey: 'topSingle', reps: 1, pct: 0.85, trainingMax: 100 }),
          ...Array.from({ length: 4 }, () => makeSet({ labelKey: 'backoff', reps: 5, pct: 0.75, trainingMax: 100 })),
        ],
      }),
    ],
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
    meetPlanReadiness: {
      Bench: {
        ready: false,
        readinessPhase: 'third-attempt',
        attempts: { opener: 90, secondAttempt: 97.5, thirdAttempt: 102.5 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets[0].labelKey).toBe('topDouble');
  expect(prescription.sets[0].reps).toBe(2);
  // Never below its own (converted) anchor, and always below TOP_PCT_LIMITS[2].max.
  expect(prescription.sets[0].precisePct).toBeGreaterThanOrEqual(prescription.topSetAnchorPct - 0.0001);
  expect(prescription.sets[0].precisePct).toBeLessThanOrEqual(0.875);
});

test('third-attempt phase does not clamp a strong single-to-double conversion down to the generic double ceiling', () => {
  // Reproduces the C3W33 boundary: a single at 95% (from the
  // second-attempt phase) converts to ~92% as a double - well above
  // TOP_PCT_LIMITS[2].max (87.5%), the ceiling this phase used to
  // (incorrectly) clamp the anchor to. That silently deflated the anchor,
  // so a normal +2.5pp progression step landed at 90% and read as "safe
  // progression" even though 90% as a double is actually LIGHTER than the
  // 95% single already proven (95% single ~= 92% double in e1RM terms) -
  // exactly the "2x90% is lighter than my 1x95%" report.
  const state = buildSmartLiftState({
    history: [
      makeSmartLiftEntry({
        lift: 'Bench',
        workoutNumber: 1,
        sets: [
          makeSet({ labelKey: 'topSingle', reps: 1, pct: 0.95, trainingMax: 100 }),
          ...Array.from({ length: 4 }, () => makeSet({ labelKey: 'backoff', reps: 5, pct: 0.80, trainingMax: 100 })),
        ],
      }),
    ],
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
    meetPlanReadiness: {
      Bench: {
        ready: false,
        readinessPhase: 'third-attempt',
        // thirdAttemptDoublePct here is well above 87.5%, so it must not be
        // the binding ceiling on the converted anchor.
        attempts: { opener: 90, secondAttempt: 97.5, thirdAttempt: 105 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });

  expect(prescription.validation.valid).toBe(true);
  // The converted anchor (~92%) must survive, not get clamped to 87.5%.
  expect(prescription.topSetAnchorPct).toBeGreaterThan(0.90);
  // A 2x90% prescription is not progress from 1x95%, while 2x95% is. The
  // *actual displayed/lifted weight* must never drop below the 95kg single
  // already proven, regardless of what the %-based math alone would round
  // to (92.1% precise -> 90% displayed -> 90kg, a real regression in kg).
  expect(prescription.sets[0].weight).toBeGreaterThanOrEqual(95);
  // The prescribed double must never sit below its own converted anchor -
  // i.e. never lighter than the single already proven.
  expect(prescription.sets[0].precisePct).toBeGreaterThanOrEqual(
    prescription.topSetAnchorPct - 0.0001
  );
});

test('never prescribes a real weight regression: a rep-scheme change may never lower the actual kg below the last proven top', () => {
  // Always make progress unless there is a specific reason not to.
  // For an athlete who has already demonstrated both opener and second
  // attempt, the third-attempt phase must demonstrate the third attempt
  // INDIRECTLY (never a literal near-meet single in training) by holding at
  // least the last proven weight and climbing via reps, not by dropping the
  // weight for a new rep scheme. 1x95kg -> 2x90kg is a real regression in
  // kg (even though the %-math treats it as a hold/light progress);
  // 1x95kg -> 2x95kg is genuine, unambiguous progress and must be the
  // floor.
  const state = buildSmartLiftState({
    history: [
      makeSmartLiftEntry({
        lift: 'Bench',
        workoutNumber: 1,
        sets: [
          makeSet({ labelKey: 'topSingle', reps: 1, pct: 0.95, trainingMax: 100 }),
          ...Array.from({ length: 4 }, () => makeSet({ labelKey: 'backoff', reps: 5, pct: 0.80, trainingMax: 100 })),
        ],
      }),
    ],
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
    meetPlanReadiness: {
      Bench: {
        ready: false,
        readinessPhase: 'third-attempt',
        // Deliberately chosen so the naive %-based math alone would land on
        // exactly the buggy 90kg double from the regression (attempts default to
        // MEET_ATTEMPT_PCTS - see smartTrainingConstants.js).
        attempts: { opener: 90, secondAttempt: 97.5, thirdAttempt: 102.5 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets[0].reps).toBe(2);
  expect(prescription.sets[0].weight).toBe(95);
  expect(prescription.sets[0].weight).not.toBe(90);
});

test('the ready phase tapers to a submaximal triple instead of escalating further', () => {
  const state = buildSmartLiftState({
    history: [
      makeSmartLiftEntry({
        lift: 'Bench',
        workoutNumber: 1,
        sets: [
          makeSet({ labelKey: 'topDouble', reps: 2, pct: 0.95, trainingMax: 100 }),
          ...Array.from({ length: 4 }, () => makeSet({ labelKey: 'backoff', reps: 5, pct: 0.80, trainingMax: 100 })),
        ],
      }),
    ],
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
    meetPlanReadiness: {
      Bench: {
        ready: true,
        readinessPhase: 'ready',
        attempts: { opener: 90, secondAttempt: 97.5, thirdAttempt: 102.5 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets[0]).toMatchObject({
    labelKey: 'topTriple',
    reps: 3,
    precisePct: 0.90,
  });
  expect(prescription.regressionReason).toBe('ready-taper');
  prescription.sets.slice(1).forEach(set => {
    expect(set.reps).toBe(4);
    expect(set.precisePct).toBeLessThanOrEqual(0.70);
  });
});

test('validation compares the true precisePct, not the 5%-rounded display pct, against the anchor', () => {
  // Reproduces a v1.5.4 regression: a proven third-attempt-phase
  // double (weight floor already holding it at the last proven weight) has
  // a precise anchor of 0.974 - a value that rounds DOWN to "95%" for
  // display while the true (held) top is also 0.974. Comparing the
  // rounded display pct (0.95) against the unrounded anchor (0.974) made a
  // perfectly-held top look like a regression.
  const state = buildSmartLiftState({
    history: [
      makeSmartLiftEntry({
        lift: 'Bench',
        workoutNumber: 1,
        sets: [
          makeSet({ labelKey: 'topDouble', reps: 2, pct: 0.974, trainingMax: 100 }),
          ...Array.from({ length: 4 }, () => makeSet({ labelKey: 'backoff', reps: 5, pct: 0.80, trainingMax: 100 })),
        ],
      }),
    ],
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
    meetPlanReadiness: {
      Bench: {
        ready: false,
        readinessPhase: 'third-attempt',
        attempts: { opener: 90, secondAttempt: 97.5, thirdAttempt: 104 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets[0].reps).toBe(2);
});

test('the "avoid repeating the same stimulus" variation never fires during a meet-specific phase (never drops third-attempt-phase reps against a mismatched anchor)', () => {
  // Reproduces the full v1.5.4 regression: on a day where the
  // engine tries to vary the prescription (avoidRecentRepeat, e.g. after
  // repeating the same lift), it used to see the third-attempt phase's
  // pct already above the *generic* double ceiling (TOP_PCT_LIMITS[2].max
  // = 87.5%) and "helpfully" drop to a single - without re-deriving the
  // anchor for the new rep scheme, comparing a single's lower pct against
  // the still-double-based anchor and flagging a false regression. Meet-
  // specific phases (second/third-attempt) already fix their own rep
  // scheme deliberately; this variation must not touch them at all.
  const state = buildSmartLiftState({
    history: [
      makeSmartLiftEntry({
        lift: 'Bench',
        workoutNumber: 1,
        sets: [
          makeSet({ labelKey: 'topDouble', reps: 2, pct: 0.974, trainingMax: 100 }),
          ...Array.from({ length: 4 }, () => makeSet({ labelKey: 'backoff', reps: 5, pct: 0.80, trainingMax: 100 })),
        ],
      }),
    ],
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
    meetPlanReadiness: {
      Bench: {
        ready: false,
        readinessPhase: 'third-attempt',
        attempts: { opener: 90, secondAttempt: 97.5, thirdAttempt: 104 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({
    state,
    role: 'primary',
    avoidRecentRepeat: true,
  });

  expect(prescription.validation.valid).toBe(true);
  // Must stay a double (the third-attempt phase's own rep scheme), never
  // dropped to a single by the generic variation logic.
  expect(prescription.sets[0].labelKey).toBe('topDouble');
  expect(prescription.sets[0].reps).toBe(2);
});
