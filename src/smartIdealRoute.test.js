import {
  SMART_IDEAL_LOAD_POLICY,
  SMART_IDEAL_LEVELS,
  SMART_IDEAL_MEET_POLICY,
  SMART_IDEAL_POST_MEET,
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
    'Squat M',
    'Bench H → Deadlift L',
    'Squat L → Bench L',
    'Deadlift H → Bench M → Squat L',
    'Rust',
  ],
  elite: [
    'Squat H → Bench L → Deadlift L',
    'Deadlift M → Bench M → Squat L',
    'Bench L',
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
      basis: 'cycle-e1rm',
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
      basis: 'cycle-e1rm',
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
    'Squat M',
    'Bench H',
    'Rust',
    'Rust',
  ],
  advanced: [
    'Squat H → Bench L',
    'Deadlift H → Bench M',
    'Squat M → Bench L',
    'Bench H → Deadlift M → Squat L',
    'Rust',
    'Rust',
  ],
  elite: [
    'Squat H → Bench L',
    'Deadlift H → Bench M → Squat L',
    'Squat M → Bench L',
    'Bench H → Deadlift L',
    'Rust',
    'Rust',
  ],
};

test.each(SMART_IDEAL_LEVELS)(
  '%s follows the agreed W22-W27 taper and disables accessories',
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

test('taper heavy is one 90% opener without normal back-offs; medium/light target about 12 reps', () => {
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
        basis: 'cycle-e1rm',
        topSet: { reps: 1, pct: 0.90 },
        normalBackoffs: false,
        fullGridRequired: true,
      });
      return;
    }

    expect(item.prescription).toMatchObject({
      kind: 'taper-work-sets',
      basis: 'cycle-e1rm',
      pct: item.intensityRole === 'medium' ? 0.70 : 0.60,
      targetTotalWorkReps: 12,
      targetIsApproximate: true,
      setCount: 'grid-dependent',
      fullGridRequired: true,
    });
  });
});

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

test('the ideal route freezes cycle e1RM and uses 2.5kg / 2.5-percentage-point precision', () => {
  expect(SMART_IDEAL_LOAD_POLICY).toEqual({
    basis: 'cycle-e1rm',
    cycleE1RMFixed: true,
    workWeightIncrementKg: 2.5,
    achievedE1RMIncrementKg: 2.5,
    displayedPercentageIncrement: 0.025,
    heavyPhaseMinimumIncreaseKg: 2.5,
    heavyPhaseCap: 'cycle-e1rm',
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
    'achieved-e1rm-at-least-cycle-e1rm',
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
  }))).toBe('Deadlift M → Bench M → Squat L');
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
