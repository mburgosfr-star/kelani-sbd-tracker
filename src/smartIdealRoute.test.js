import {
  SMART_IDEAL_LOAD_POLICY,
  SMART_IDEAL_LEVELS,
  SMART_IDEAL_MEET_POLICY,
  SMART_IDEAL_POST_MEET,
  buildAcceleratedSmartIdealRoutePlan,
  buildAdjustedSmartIdealRoutePlan,
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
  })).toBe(28);
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

test('normal heavy loading is 90% triple, 95% double and 100% single with the agreed back-offs', () => {
  const expected = [
    [1, 'triple', 3, 0.90, 6, 0.60],
    [8, 'double', 2, 0.95, 5, 0.65],
    [15, 'single', 1, 1.00, 4, 0.70],
  ];

  expected.forEach(([workoutNumber, phaseKey, topReps, topPct, backoffReps, backoffPct]) => {
    const phase = getSmartIdealNormalPhase(workoutNumber);
    const workout = getSmartIdealRouteWorkout({
      athleteLevel: 'intermediate',
      workoutNumber,
    });
    const heavy = workout.lifts.find(item => item.intensityRole === 'heavy');

    expect(phase.key).toBe(phaseKey);
    expect(heavy.prescription).toMatchObject({
      kind: 'top-set-with-backoffs',
      basis: 'real-1rm',
      topSet: { reps: topReps, pct: topPct },
      backoff: {
        reps: backoffReps,
        pct: backoffPct,
        setCount: 'grid-dependent',
      },
      fullGridRequired: true,
    });
  });
});

test.each([
  ['medium', 0.70],
  ['light', 0.60],
])('%s normal work has no top set, uses %s and stays at or below 24 reps', (role, pct) => {
  const workouts = Array.from({ length: 21 }, (_, index) =>
    getSmartIdealRouteWorkout({
      athleteLevel: 'elite',
      workoutNumber: index + 1,
    })
  );
  const prescriptions = workouts.flatMap(workout => workout.lifts)
    .filter(item => item.intensityRole === role)
    .map(item => item.prescription);

  expect(prescriptions.length).toBeGreaterThan(0);
  prescriptions.forEach(prescription => {
    expect(prescription).toMatchObject({
      kind: 'work-sets',
      basis: 'real-1rm',
      pct,
      repRange: { min: 4, max: 6 },
      maxTotalWorkReps: 24,
      setCount: 'grid-dependent',
      fullGridRequired: true,
    });
    expect(prescription.topSet).toBeUndefined();
  });
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

test('only beginner W25 remains a single-lift taper day', () => {
  const singleLiftDays = SMART_IDEAL_LEVELS.flatMap(level =>
    Array.from({ length: 4 }, (_, index) => {
      const workoutNumber = index + 22;
      const workout = getSmartIdealRouteWorkout({ athleteLevel: level, workoutNumber });
      return workout.type === 'training' && workout.lifts.length === 1
        ? `${level}-${workoutNumber}`
        : null;
    }).filter(Boolean)
  );

  expect(singleLiftDays).toEqual(['beginner-25']);
});

const expectedTaper = {
  beginner: [
    'Squat H → Bench L',
    'Rust',
    'Deadlift H → Bench M',
    'Bench H',
    'Rust',
    'Rust',
  ],
  intermediate: [
    'Squat H → Bench L',
    'Deadlift H → Bench M',
    'Rust',
    'Bench H → Squat M',
    'Rust',
    'Rust',
  ],
  advanced: [
    'Squat H → Bench L',
    'Deadlift H → Bench M',
    'Bench H → Squat M',
    'Rust',
    'Rust',
    'Rust',
  ],
  elite: [
    'Squat H → Bench L',
    'Deadlift H → Bench M → Squat L',
    'Bench H → Squat M',
    'Rust',
    'Rust',
    'Rust',
  ],
};

test.each(SMART_IDEAL_LEVELS)(
  '%s follows the agreed W22-W27 taper and disables the regular accessory plan',
  level => {
    const workouts = Array.from({ length: 6 }, (_, index) =>
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

test('every taper lift keeps a meaningful dose around the 90% opener or lighter work', () => {
  const workouts = Array.from({ length: 4 }, (_, index) =>
    getSmartIdealRouteWorkout({
      athleteLevel: 'elite',
      workoutNumber: index + 22,
    })
  );

  workouts.flatMap(workout => workout.lifts).forEach(item => {
    if (item.intensityRole === 'heavy') {
      expect(item.prescription).toEqual({
        kind: 'opener-single',
        basis: 'real-1rm',
        topSet: { reps: 1, pct: 0.90 },
        backoff: {
          reps: 4,
          pct: 0.60,
          setCount: 'grid-dependent',
          minimumSetCount: 1,
          fullRowWhenAligned: true,
        },
        normalBackoffs: false,
        fullGridRequired: true,
      });
      return;
    }

    expect(item.prescription).toMatchObject({
      kind: 'taper-work-sets',
      basis: 'real-1rm',
      pct: item.intensityRole === 'medium' ? 0.70 : 0.60,
      reps: 4,
      minimumSetCount: 3,
      minimumRepsPerSet: 4,
      setCount: 'grid-dependent',
      fullGridRequired: true,
    });
  });
});

test.each(SMART_IDEAL_LEVELS)(
  '%s schedules no Deadlift later than W24 and keeps at least two final rest days',
  level => {
    const taper = Array.from({ length: 7 }, (_, index) =>
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
    expect(taper.slice(-3, -1).map(workout => workout.type)).toEqual(['rest', 'rest']);
  }
);

test.each(SMART_IDEAL_LEVELS)('%s has the full simulated meet at W28', level => {
  const meet = getSmartIdealRouteWorkout({ athleteLevel: level, workoutNumber: 28 });

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
  ['advanced', 25],
  ['elite', 25],
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

test('a second TOO EASY credit removes the new optional W24 rest', () => {
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
  expect(plan.workouts).toHaveLength(3);
  expect(plan.workouts[0]).toMatchObject({
    workoutNumber: 25,
    type: 'training',
    stage: 'taper',
    accelerationCreditsConsumed: 1,
    accelerationActions: ['remove-optional-rest'],
    skippedRouteWorkoutNumbers: [24],
  });
  expect(plan.workouts[0].lifts.map(item => [
    item.lift,
    item.intensityRole,
  ])).toEqual([
    ['Bench', 'heavy'],
    ['Squat', 'medium'],
  ]);
  expect(plan.workouts[1]).toMatchObject({
    type: 'rest',
    workoutNumber: 27,
    accelerationCreditsConsumed: 1,
    accelerationActions: ['remove-optional-rest'],
    skippedRouteWorkoutNumbers: [26],
  });
  expect(plan.workouts.at(-1)).toMatchObject({ type: 'meet', workoutNumber: 28 });
});

test('a trailing completed rest lets a pending credit skip the duplicate rest now', () => {
  const plan = buildAcceleratedSmartIdealRoutePlan({
    athleteLevel: 'intermediate',
    startWorkoutNumber: 27,
    accelerationCredits: 1,
    hasTrailingCompletedRest: true,
  });

  expect(plan.workouts).toHaveLength(1);
  expect(plan.workouts[0]).toMatchObject({
    type: 'meet',
    workoutNumber: 28,
    accelerationCreditsConsumed: 1,
    skippedRouteWorkoutNumbers: [27],
  });
});

test('TOO EASY on the final taper day removes the last rest when no safer option remains', () => {
  const plan = buildAcceleratedSmartIdealRoutePlan({
    athleteLevel: 'intermediate',
    startWorkoutNumber: 27,
    accelerationCredits: 1,
  });

  expect(plan).toMatchObject({
    requestedCredits: 1,
    appliedCredits: 1,
    unappliedCredits: 0,
  });
  expect(plan.workouts).toHaveLength(1);
  expect(plan.workouts[0]).toMatchObject({
    workoutNumber: 28,
    type: 'meet',
    accelerationActions: ['remove-final-rest'],
    skippedRouteWorkoutNumbers: [27],
  });
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
  expect(plan.workouts.findIndex(workout => workout.type === 'meet')).toBe(6);
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

test('TOO HARD never increases an upcoming recovery block beyond three days', () => {
  const plan = buildAdjustedSmartIdealRoutePlan({
    athleteLevel: 'beginner',
    startWorkoutNumber: 6,
    delayCredits: 2,
  });

  expect(plan).toMatchObject({
    requestedDelayCredits: 2,
    appliedDelayCredits: 1,
    unappliedDelayCredits: 1,
  });
  expect(plan.workouts.slice(0, 3).every(workout => workout.type === 'rest'))
    .toBe(true);
  expect(plan.workouts[3].type).toBe('training');
});

test('one TOO EASY and one TOO HARD credit change the meet date by a net zero days', () => {
  const plan = buildAdjustedSmartIdealRoutePlan({
    athleteLevel: 'intermediate',
    startWorkoutNumber: 23,
    accelerationCredits: 1,
    delayCredits: 1,
  });

  expect(plan.appliedCredits).toBe(1);
  expect(plan.appliedDelayCredits).toBe(1);
  expect(plan.workouts.findIndex(workout => workout.type === 'meet')).toBe(5);
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
        workoutNumber: index + 29,
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
