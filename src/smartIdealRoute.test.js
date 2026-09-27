import {
  SMART_TRAINING_FOCUSES,
  SMART_IDEAL_LOAD_POLICY,
  SMART_IDEAL_LEVELS,
  SMART_IDEAL_MEET_POLICY,
  SMART_IDEAL_POST_MEET,
  buildAcceleratedSmartIdealRoutePlan,
  buildAdjustedSmartIdealRoutePlan,
  getSmartIdealNormalTrainingDays,
  getSmartIdealNormalPhase,
  getSmartIdealRouteEntryWorkoutNumber,
  getSmartIdealRouteWorkout,
  isSmartIdealRouteEnabled,
  resolveSmartIdealRouteStartCycle,
  summarizeSmartIdealFrequency,
} from './smartIdealRoute';
import { SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL } from './smartTrainingConstants';

const signature = workout => workout.type === 'rest'
  ? 'Rust'
  : workout.lifts.map(item =>
    `${item.lift} ${item.intensityRole[0].toUpperCase()}`
  ).join(' → ');

test('opt-in beginner squat priority exchanges Bench medium for Squat light without changing the calendar', () => {
  for (const workoutNumber of [3, 10, 17, 24]) {
    const standard = getSmartIdealRouteWorkout({ athleteLevel: 'beginner', workoutNumber });
    const focused = getSmartIdealRouteWorkout({
      athleteLevel: 'beginner',
      workoutNumber,
      trainingFocus: SMART_TRAINING_FOCUSES.BEGINNER_SQUAT,
    });
    expect(standard.lifts.map(item => [item.lift, item.intensityRole])).toEqual([
      ['Deadlift', 'heavy'], ['Bench', 'medium'],
    ]);
    expect(focused.lifts.map(item => [item.lift, item.intensityRole])).toEqual([
      ['Deadlift', 'heavy'], ['Squat', 'light'],
    ]);
    expect(focused.type).toBe(standard.type);
  }

  for (const workoutNumber of [22, 23, 25, 26, 27, 28]) {
    expect(getSmartIdealRouteWorkout({
      athleteLevel: 'beginner', workoutNumber,
      trainingFocus: SMART_TRAINING_FOCUSES.BEGINNER_SQUAT,
    })).toEqual(getSmartIdealRouteWorkout({ athleteLevel: 'beginner', workoutNumber }));
  }
  expect(getSmartIdealRouteWorkout({
    athleteLevel: 'intermediate', workoutNumber: 24,
    trainingFocus: SMART_TRAINING_FOCUSES.BEGINNER_SQUAT,
  })).toEqual(getSmartIdealRouteWorkout({ athleteLevel: 'intermediate', workoutNumber: 24 }));
});

const expectedNormalWeek = {
  beginner: [
    'Squat H → Bench L',
    'Rust',
    'Deadlift H → Bench M',
    'Rust',
    'Bench H → Squat M',
    'Rust',
    'Rust',
  ],
  intermediate: [
    'Squat H → Bench L',
    'Deadlift M → Bench M',
    'Rust',
    'Bench H → Squat M',
    'Rust',
    'Deadlift H → Bench L → Squat L',
    'Rust',
  ],
  advanced: [
    'Squat H → Bench L',
    'Deadlift M → Bench M',
    'Squat M → Bench L',
    'Bench H → Deadlift L',
    'Bench M → Squat L',
    'Deadlift H → Squat L',
    'Rust',
  ],
  elite: [
    'Squat H → Bench L → Deadlift L',
    'Deadlift M → Bench M',
    'Bench L → Squat L',
    'Bench H → Squat M → Deadlift L',
    'Squat M → Bench M',
    'Deadlift H → Bench L → Squat L',
    'Rust',
  ],
};

const expectedPracticalWeek = {
  beginner: [
    'Squat H → Bench H → Deadlift H',
    'Rust',
    'Squat M → Bench M',
    'Rust',
    'Bench L',
    'Rust',
    'Rust',
  ],
  intermediate: [
    'Squat H → Bench H → Deadlift H',
    'Bench L',
    'Rust',
    'Squat M → Bench M → Deadlift M',
    'Rust',
    'Squat L → Bench L',
    'Rust',
  ],
  advanced: [
    'Squat H → Bench H → Deadlift H',
    'Squat L → Bench L',
    'Rust',
    'Squat M → Bench M → Deadlift M',
    'Bench M',
    'Squat L → Bench L → Deadlift L',
    'Rust',
  ],
  elite: [
    'Squat H → Bench H → Deadlift H',
    'Squat M → Bench M',
    'Squat M → Bench M → Deadlift M',
    'Bench L',
    'Squat L → Bench L → Deadlift L',
    'Squat L → Bench L → Deadlift L',
    'Rust',
  ],
};

test('legacy route entry uses demonstrated readiness instead of restarting the cycle', () => {
  const midCycleReadiness = {
    meetPlanReady: false,
    meetPlanHasCurrentCycleEvidence: true,
    meetPlanOpenerReady: true,
    meetPlanSecondAttemptReady: false,
    meetPlanReadiness: {
      Squat: {
        openerReady: true,
        secondAttemptReady: true,
        thirdAttemptPotential: true,
        projectedMeetReadyExposureCount: 0,
      },
      Bench: {
        openerReady: true,
        secondAttemptReady: true,
        thirdAttemptPotential: false,
        projectedMeetReadyExposureCount: 2,
      },
      Deadlift: {
        openerReady: true,
        secondAttemptReady: false,
        thirdAttemptPotential: false,
        projectedMeetReadyExposureCount: 2,
      },
    },
  };

  expect(getSmartIdealRouteEntryWorkoutNumber({
    athleteLevel: 'beginner',
    readiness: midCycleReadiness,
  })).toBe(17);
  expect(getSmartIdealRouteEntryWorkoutNumber({
    athleteLevel: 'beginner',
    trainingFocus: SMART_TRAINING_FOCUSES.PRACTICAL,
    readiness: midCycleReadiness,
  })).toBe(15);
  expect(getSmartIdealRouteEntryWorkoutNumber({
    athleteLevel: 'beginner',
    readiness: {
      ...midCycleReadiness,
      meetPlanHasCurrentCycleEvidence: false,
    },
  })).toBe(1);
  expect(getSmartIdealRouteEntryWorkoutNumber({
    athleteLevel: 'beginner',
    readiness: {
      ...midCycleReadiness,
      meetPlanReady: true,
    },
  })).toBe(27);
  expect(getSmartIdealRouteEntryWorkoutNumber({
    athleteLevel: 'beginner',
    readiness: {
      ...midCycleReadiness,
      meetPlanReadiness: {
        ...midCycleReadiness.meetPlanReadiness,
        Deadlift: {
          ...midCycleReadiness.meetPlanReadiness.Deadlift,
          projectedMeetReadyExposureCount: 3,
        },
      },
    },
  })).toBe(10);
  expect(getSmartIdealRouteEntryWorkoutNumber({
    athleteLevel: 'beginner',
    readiness: {
      ...midCycleReadiness,
      meetPlanSecondAttemptReady: true,
      meetPlanReadiness: {
        ...midCycleReadiness.meetPlanReadiness,
        Deadlift: {
          ...midCycleReadiness.meetPlanReadiness.Deadlift,
          secondAttemptReady: true,
          thirdAttemptPotential: true,
          projectedMeetReadyExposureCount: 0,
        },
      },
    },
  })).toBe(19);
});

test('existing records enable the ideal-route policy immediately', () => {
  expect(resolveSmartIdealRouteStartCycle({ currentCycle: 3 })).toBe(3);
  expect(resolveSmartIdealRouteStartCycle({
    savedStartCycle: 2,
    currentCycle: 3,
  })).toBe(2);
  expect(resolveSmartIdealRouteStartCycle({
    savedStartCycle: 4,
    currentCycle: 3,
  })).toBe(3);
  expect(isSmartIdealRouteEnabled({ currentCycle: 3, startCycle: 3 })).toBe(true);
  expect(isSmartIdealRouteEnabled({ currentCycle: 4, startCycle: 4 })).toBe(true);
});

test.each(SMART_IDEAL_LEVELS)(
  '%s follows the agreed seven-workout composition in all three normal phases',
  level => {
    [0, 7, 14].forEach(offset => {
      const actual = Array.from({ length: 7 }, (_, index) =>
        signature(getSmartIdealRouteWorkout({
          athleteLevel: level,
          workoutNumber: offset + index + 1,
        }))
      );

      expect(actual).toEqual(expectedNormalWeek[level]);
    });
  }
);

test.each(SMART_IDEAL_LEVELS)(
  '%s practical route groups each workout by intensity in all three normal phases',
  level => {
    [0, 7, 14].forEach(offset => {
      const workouts = Array.from({ length: 7 }, (_, index) =>
        getSmartIdealRouteWorkout({
          athleteLevel: level,
          trainingFocus: SMART_TRAINING_FOCUSES.PRACTICAL,
          workoutNumber: offset + index + 1,
        })
      );

      expect(workouts.map(signature)).toEqual(expectedPracticalWeek[level]);
      workouts.filter(workout => workout.type === 'training').forEach(workout => {
        expect(new Set(workout.lifts.map(item => item.intensityRole)).size).toBe(1);
      });
    });
  }
);

test.each([
  ['beginner', 3],
  ['intermediate', 4],
  ['advanced', 5],
  ['elite', 6],
])('the %s practical route has %i normal training days', (level, expectedDays) => {
  expect(getSmartIdealNormalTrainingDays({
    athleteLevel: level,
    trainingFocus: SMART_TRAINING_FOCUSES.PRACTICAL,
  })).toBe(expectedDays);
});

test('the normal ideal route contains no single-lift gym days', () => {
  SMART_IDEAL_LEVELS.forEach(level => {
    for (let workoutNumber = 1; workoutNumber <= 21; workoutNumber += 1) {
      const workout = getSmartIdealRouteWorkout({ athleteLevel: level, workoutNumber });
      if (workout.type === 'training') {
        expect(workout.lifts.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

test('all normal intensity roles use the agreed phase loading', () => {
  const expected = [
    [1, 'triple', {
      heavy: [1, 0.90, 4, 0.85],
      medium: [2, 0.85, 5, 0.80],
      light: [3, 0.80, 6, 0.75],
    }],
    [8, 'double', {
      heavy: [1, 0.95, 4, 0.80],
      medium: [2, 0.90, 5, 0.75],
      light: [3, 0.85, 6, 0.70],
    }],
    [15, 'single', {
      heavy: [1, 1.00, 4, 0.75],
      medium: [2, 0.95, 5, 0.70],
      light: [3, 0.90, 6, 0.65],
    }],
  ];

  expected.forEach(([workoutNumber, phaseKey, byRole]) => {
    const phase = getSmartIdealNormalPhase(workoutNumber);
    expect(phase.key).toBe(phaseKey);
    Object.entries(byRole).forEach(([role, [topReps, topPct, volumeReps, volumePct]]) => {
      expect(phase.prescriptions[role]).toEqual({
        topSet: { reps: topReps, pct: topPct },
        volume: { reps: volumeReps, pct: volumePct },
      });
    });
  });
});

test('each lift and intensity role gets at most one top set per normal phase', () => {
  for (const phaseStart of [1, 8, 15]) {
    const workouts = Array.from({ length: 7 }, (_, index) =>
    getSmartIdealRouteWorkout({
      athleteLevel: 'elite',
      workoutNumber: phaseStart + index,
    })
  );
    const counts = {};
    workouts.flatMap(workout => workout.lifts).forEach(item => {
      const key = `${item.lift}-${item.intensityRole}`;
      counts[key] = (counts[key] || 0) + (item.prescription.topSet ? 1 : 0);
      if (!item.prescription.topSet) {
        expect(item.prescription.kind).toBe('work-sets');
      }
    });
    Object.values(counts).forEach(count => expect(count).toBe(1));
  }
});

test.each(SMART_IDEAL_LEVELS)(
  '%s seven-workout frequency exactly matches the agreed score targets',
  level => {
    const actual = summarizeSmartIdealFrequency(level);
    const expected = SMART_FREQUENCY_SCORE_TARGETS_BY_LEVEL[level];

    ['Squat', 'Bench', 'Deadlift'].forEach(lift => {
      expect(actual[lift]).toEqual({
        days: expected[lift].days,
        score: expected[lift].score,
        mix: { ...expected[lift].defaultMix },
      });
    });
  }
);

test.each(SMART_IDEAL_LEVELS)(
  '%s practical route preserves the balanced frequency and intensity mix',
  level => {
    expect(summarizeSmartIdealFrequency(
      level,
      SMART_TRAINING_FOCUSES.PRACTICAL,
    )).toEqual(summarizeSmartIdealFrequency(level));
  }
);

test.each(SMART_IDEAL_LEVELS)(
  '%s practical route leaves taper and meet planning unchanged',
  level => {
    for (let workoutNumber = 22; workoutNumber <= 28; workoutNumber += 1) {
      expect(getSmartIdealRouteWorkout({
        athleteLevel: level,
        trainingFocus: SMART_TRAINING_FOCUSES.PRACTICAL,
        workoutNumber,
      })).toEqual(getSmartIdealRouteWorkout({ athleteLevel: level, workoutNumber }));
    }
  }
);

test('W25 is the single-lift Bench primer for every level', () => {
  const singleLiftDays = SMART_IDEAL_LEVELS.flatMap(level =>
    Array.from({ length: 4 }, (_, index) => {
      const workoutNumber = index + 22;
      const workout = getSmartIdealRouteWorkout({ athleteLevel: level, workoutNumber });
      return workout.type === 'training' && workout.lifts.length === 1
        ? `${level}-${workoutNumber}`
        : null;
    }).filter(Boolean)
  );

  expect(singleLiftDays).toEqual([
    'beginner-25',
    'intermediate-25',
    'advanced-25',
    'elite-25',
  ]);
});

const expectedTaper = {
  beginner: [
    'Squat H → Bench L',
    'Rust',
    'Deadlift H → Bench M',
    'Bench H',
    'Rust',
  ],
  intermediate: [
    'Squat H → Bench L',
    'Deadlift H → Bench M',
    'Rust',
    'Bench H',
    'Rust',
  ],
  advanced: [
    'Squat H → Bench L',
    'Deadlift H → Bench M',
    'Rust',
    'Bench H',
    'Rust',
  ],
  elite: [
    'Squat H → Bench L',
    'Deadlift H → Bench M → Squat L',
    'Rust',
    'Bench H',
    'Rust',
  ],
};

test.each(SMART_IDEAL_LEVELS)(
  '%s follows the agreed W22-W26 taper and disables the regular accessory plan',
  level => {
    const workouts = Array.from({ length: 5 }, (_, index) =>
      getSmartIdealRouteWorkout({
        athleteLevel: level,
        workoutNumber: index + 22,
      })
    );

    expect(workouts.map(signature)).toEqual(expectedTaper[level]);
    workouts.forEach(workout => {
      expect(workout.stage).toBe('taper');
      expect(workout.accessoriesAllowed).toBe(false);
    });
  }
);

test('taper uses the agreed role-specific top sets and reduced grid volume', () => {
  const workouts = Array.from({ length: 4 }, (_, index) =>
    getSmartIdealRouteWorkout({
      athleteLevel: 'elite',
      workoutNumber: index + 22,
    })
  );

  const expected = {
    heavy: [1, 0.90, 4, 0.75],
    medium: [2, 0.85, 5, 0.70],
    light: [3, 0.80, 6, 0.65],
  };
  const topSetCounts = {};

  workouts.flatMap(workout => workout.lifts).forEach(item => {
    const [topReps, topPct, volumeReps, volumePct] = expected[item.intensityRole];
    const key = `${item.lift}-${item.intensityRole}`;
    topSetCounts[key] = (topSetCounts[key] || 0) + (item.prescription.topSet ? 1 : 0);
    if (item.prescription.topSet) {
      expect(item.prescription).toMatchObject({
        kind: 'top-set-with-backoffs',
        topSet: { reps: topReps, pct: topPct },
        backoff: {
          reps: volumeReps,
          pct: volumePct,
          minimumSetCount: 1,
          maximumSetCount: 4,
        },
      });
    } else {
      expect(item.prescription).toMatchObject({
        kind: 'taper-work-sets',
        reps: volumeReps,
        pct: volumePct,
        minimumSetCount: 1,
        maximumSetCount: 4,
      });
    }
    expect(item.prescription).toMatchObject({
      basis: 'real-1rm',
      fullGridRequired: true,
    });
  });
  Object.values(topSetCounts).forEach(count => expect(count).toBe(1));
});

test.each(SMART_IDEAL_LEVELS)(
  '%s schedules no Deadlift later than W24 and keeps W26 as the final rest day',
  level => {
    const taper = Array.from({ length: 6 }, (_, index) =>
      getSmartIdealRouteWorkout({
        athleteLevel: level,
        workoutNumber: index + 22,
      })
    );
    const lastDeadlift = taper.findLast(workout =>
      workout.type === 'training' &&
      workout.lifts.some(item => item.lift === 'Deadlift')
    );

    expect(lastDeadlift.workoutNumber).toBeLessThanOrEqual(24);
    expect(taper.at(-2).type).toBe('rest');
    expect(taper.at(-1).type).toBe('meet');
  }
);

test.each(SMART_IDEAL_LEVELS)('%s has the full simulated meet at W27', level => {
  const meet = getSmartIdealRouteWorkout({ athleteLevel: level, workoutNumber: 27 });

  expect(meet).toMatchObject({
    type: 'meet',
    stage: 'meet',
    accessoriesAllowed: false,
  });
  expect(meet.lifts.map(item => item.lift)).toEqual(['Squat', 'Bench', 'Deadlift']);
  meet.lifts.forEach(item => {
    expect(item.prescription).toEqual({
      kind: 'meet-attempts',
      attemptCount: 3,
      attemptPcts: {
        opener: 0.90,
        secondAttempt: 0.975,
        thirdAttempt: 1.025,
      },
      fullGridRequired: true,
    });
  });
});

test.each([
  ['beginner', 23],
  ['intermediate', 24],
  ['advanced', 24],
  ['elite', 24],
])(
  '%s spends one TOO EASY credit on the earliest remaining non-final taper rest',
  (level, skippedWorkoutNumber) => {
    const plan = buildAcceleratedSmartIdealRoutePlan({
      athleteLevel: level,
      startWorkoutNumber: 23,
      accelerationCredits: 1,
    });

    expect(plan).toMatchObject({
      requestedCredits: 1,
      appliedCredits: 1,
      unappliedCredits: 0,
    });
    expect(plan.workouts.map(workout => workout.workoutNumber))
      .not.toContain(skippedWorkoutNumber);
    expect(plan.workouts.find(workout => (
      workout.skippedRouteWorkoutNumbers?.includes(skippedWorkoutNumber)
    ))).toMatchObject({
      accelerationCreditsConsumed: 1,
      accelerationActions: ['remove-optional-rest'],
      skippedRouteWorkoutNumbers: [skippedWorkoutNumber],
    });
    expect(plan.workouts.map(workout => workout.workoutNumber)).toContain(27);
  }
);

test('a second TOO EASY credit removes the taper primer after the optional rest', () => {
  const plan = buildAcceleratedSmartIdealRoutePlan({
    athleteLevel: 'intermediate',
    startWorkoutNumber: 24,
    accelerationCredits: 2,
  });

  expect(plan).toMatchObject({
    requestedCredits: 2,
    appliedCredits: 2,
    unappliedCredits: 0,
  });
  expect(plan.workouts).toHaveLength(2);
  expect(plan.workouts[0]).toMatchObject({
    workoutNumber: 26,
    type: 'rest',
    stage: 'taper',
    accelerationCreditsConsumed: 2,
    accelerationActions: ['remove-optional-rest', 'remove-training'],
    skippedRouteWorkoutNumbers: [24, 25],
  });
  expect(plan.workouts[1]).toMatchObject({
    type: 'meet',
    workoutNumber: 27,
  });
  expect(plan.workouts.at(-1)).toMatchObject({ type: 'meet', workoutNumber: 27 });
});

test('a trailing completed rest lets a pending credit skip the duplicate rest now', () => {
  const plan = buildAcceleratedSmartIdealRoutePlan({
    athleteLevel: 'intermediate',
    startWorkoutNumber: 26,
    accelerationCredits: 1,
    hasTrailingCompletedRest: true,
  });

  expect(plan.workouts).toHaveLength(1);
  expect(plan.workouts[0]).toMatchObject({
    type: 'meet',
    workoutNumber: 27,
    accelerationCreditsConsumed: 1,
    skippedRouteWorkoutNumbers: [26],
  });
});

test('TOO EASY does not accelerate when Meet Day is already next', () => {
  const plan = buildAcceleratedSmartIdealRoutePlan({
    athleteLevel: 'intermediate',
    startWorkoutNumber: 26,
    accelerationCredits: 1,
  });

  expect(plan).toMatchObject({
    requestedCredits: 1,
    appliedCredits: 0,
    unappliedCredits: 1,
  });
  expect(plan.workouts.map(workout => workout.type)).toEqual(['rest', 'meet']);
});

test('one TOO HARD credit inserts one transition rest without consuming the next route row', () => {
  const plan = buildAdjustedSmartIdealRoutePlan({
    athleteLevel: 'intermediate',
    startWorkoutNumber: 23,
    delayCredits: 1,
  });

  expect(plan).toMatchObject({
    requestedDelayCredits: 1,
    appliedDelayCredits: 1,
    unappliedDelayCredits: 0,
  });
  expect(plan.workouts[0]).toMatchObject({
    workoutNumber: 23,
    type: 'rest',
    transitionPending: true,
    adjustmentReason: 'too-hard-recovery',
    delayCreditsConsumed: 1,
  });
  expect(plan.workouts[1]).toMatchObject({
    workoutNumber: 23,
    type: 'training',
  });
  expect(plan.workouts.findIndex(workout => workout.type === 'meet')).toBe(5);
});

test('TOO HARD inserts an extra rest even when the next ideal route row is already rest', () => {
  const plan = buildAdjustedSmartIdealRoutePlan({
    athleteLevel: 'beginner',
    startWorkoutNumber: 2,
    delayCredits: 1,
  });

  expect(plan.workouts.slice(0, 2)).toMatchObject([
    {
      workoutNumber: 2,
      type: 'rest',
      transitionPending: true,
      delayCreditsConsumed: 1,
    },
    {
      workoutNumber: 2,
      type: 'rest',
    },
  ]);
  expect(plan.workouts[1].transitionPending).not.toBe(true);
});

test('TOO HARD never increases an upcoming recovery block beyond two days', () => {
  const plan = buildAdjustedSmartIdealRoutePlan({
    athleteLevel: 'beginner',
    startWorkoutNumber: 6,
    delayCredits: 2,
  });

  expect(plan).toMatchObject({
    requestedDelayCredits: 2,
    appliedDelayCredits: 0,
    unappliedDelayCredits: 2,
  });
  expect(plan.workouts.slice(0, 2).every(workout => workout.type === 'rest'))
    .toBe(true);
  expect(plan.workouts[2].type).toBe('training');
});

test.each(SMART_IDEAL_LEVELS)(
  '%s adjusted route never schedules more than two consecutive rest days',
  athleteLevel => {
    for (let startWorkoutNumber = 1; startWorkoutNumber <= 29; startWorkoutNumber += 1) {
      const plan = buildAdjustedSmartIdealRoutePlan({
        athleteLevel,
        startWorkoutNumber,
        delayCredits: 3,
      });
      let consecutiveRestDays = 0;

      plan.workouts.forEach(workout => {
        consecutiveRestDays = workout.type === 'rest'
          ? consecutiveRestDays + 1
          : 0;
        expect(consecutiveRestDays).toBeLessThanOrEqual(2);
      });
    }
  }
);

test('one TOO EASY and one TOO HARD credit change the meet date by a net zero days', () => {
  const plan = buildAdjustedSmartIdealRoutePlan({
    athleteLevel: 'intermediate',
    startWorkoutNumber: 23,
    accelerationCredits: 1,
    delayCredits: 1,
  });

  expect(plan.appliedCredits).toBe(1);
  expect(plan.appliedDelayCredits).toBe(1);
  expect(plan.workouts.findIndex(workout => workout.type === 'meet')).toBe(4);
});

test('the ideal route uses confirmed real 1RM with 2.5kg / 2.5-percentage-point precision', () => {
  expect(SMART_IDEAL_LOAD_POLICY).toEqual({
    basis: 'real-1rm',
    workWeightIncrementKg: 2.5,
    achievedE1RMIncrementKg: 2.5,
    displayedPercentageIncrement: 0.025,
    heavyPhaseMinimumIncreaseKg: 2.5,
    heavyPhaseCap: 'real-1rm',
  });
});

test('meet policy uses real 1RM attempts without requiring the third attempt to be pre-demonstrated', () => {
  expect(SMART_IDEAL_MEET_POLICY).toMatchObject({
    attemptPcts: {
      opener: 0.90,
      secondAttempt: 0.975,
      thirdAttempt: 1.025,
    },
    attemptWeightIncrementKg: 2.5,
    minimumAttemptIncreaseKg: 2.5,
    automaticAttemptBasis: 'real-1rm',
    recalculateAfterNewReal1RM: true,
    recalculateAfterE1RMOnlyPR: false,
    preserveManualAttempts: true,
    lockAttemptsAfterMeetStarts: true,
    thirdAttemptPreDemonstrationRequired: false,
  });
  expect(SMART_IDEAL_MEET_POLICY.readinessEvidence).toEqual([
    'successful-90-percent-triple',
    'successful-95-percent-double',
    'achieved-current-cycle-e1rm-at-least-real-1rm',
    'successful-100-percent-single',
    'successful-taper-opener',
  ]);
});

test.each(SMART_IDEAL_LEVELS)(
  '%s gets the agreed post-meet recovery before the next cycle',
  level => {
    const plan = SMART_IDEAL_POST_MEET[level];
    const recovery = Array.from({ length: plan.recoveryWorkouts }, (_, index) =>
      getSmartIdealRouteWorkout({
        athleteLevel: level,
        workoutNumber: index + 28,
      })
    );
    const nextCycle = getSmartIdealRouteWorkout({
      athleteLevel: level,
      workoutNumber: plan.nextCycleWorkout,
    });

    recovery.forEach(workout => {
      expect(workout).toMatchObject({ type: 'rest', stage: 'post-meet' });
    });
    expect(nextCycle).toMatchObject({
      type: 'new-cycle',
      stage: 'post-meet',
    });
  }
);

test('the current athlete level immediately changes the next ideal workout', () => {
  expect(signature(getSmartIdealRouteWorkout({
    athleteLevel: 'beginner', workoutNumber: 2,
  }))).toBe('Rust');
  expect(signature(getSmartIdealRouteWorkout({
    athleteLevel: 'intermediate', workoutNumber: 2,
  }))).toBe('Deadlift M → Bench M');
  expect(signature(getSmartIdealRouteWorkout({
    athleteLevel: 'elite', workoutNumber: 2,
  }))).toBe('Deadlift M → Bench M');
});

test('every prescribed lift keeps the full-grid invariant and heavy-medium-light order', () => {
  const intensityOrder = { heavy: 0, medium: 1, light: 2, meet: 3 };

  SMART_IDEAL_LEVELS.forEach(level => {
    for (let workoutNumber = 1; workoutNumber <= 28; workoutNumber += 1) {
      const workout = getSmartIdealRouteWorkout({ athleteLevel: level, workoutNumber });
      const roles = workout.lifts.map(item => item.intensityRole);

      workout.lifts.forEach(item => {
        expect(item.prescription.fullGridRequired).toBe(true);
      });
      expect(roles).toEqual([...roles].sort((a, b) =>
        intensityOrder[a] - intensityOrder[b]
      ));
    }
  });
});
