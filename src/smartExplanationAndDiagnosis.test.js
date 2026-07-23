import {
  buildSmartDiagnosticText,
  getSmartModalDetailRows,
  getSmartPrescriptionDetailRows,
} from './App';

function volumeSets(lift, count, reps, pct) {
  return Array.from({ length: count }, () => ({
    lift,
    labelKey: 'backoff',
    reps,
    pct,
    weight: 100,
  }));
}

function smartLift({
  lift,
  role = 'primary',
  labelKey = 'topDouble',
  reps = 2,
  previousPct = 0.825,
  currentPct = 0.85,
  volumeCount = 5,
  volumeReps = 4,
  volumePct = 0.725,
  repeatVariationApplied = true,
}) {
  return {
    lift,
    role,
    sets: [
      {
        lift,
        labelKey,
        reps,
        pct: currentPct,
        weight: 100,
      },
      ...volumeSets(
        lift,
        volumeCount,
        volumeReps,
        volumePct
      ),
    ],
    warmups: Array.from({ length: 3 }, () => ({})),
    smartPrescription: {
      role,
      topSetAnchorPct: previousPct,
      progressionAnchorPct: previousPct,
      volumeAnchorPct: volumePct,
      plannedVolumePct: volumePct,
      repeatVariationApplied,
      regressionReason: null,
      completeGrid: true,
      gridItemCount: 9,
    },
  };
}

function workoutWith(lifts) {
  return {
    number: 24,
    smartCurrentCycle: 3,
    smartDayType: 'training',
    smartGeneratedPrescriptionVersion: 10,
    lifts,
    smartTrainingSelectionSummary: {
      primaryLift: lifts[0]?.lift || null,
      secondaryLift: lifts[1]?.lift || null,
      reasonFlags: [
        'generated-prescription',
        'recent-prescription-variation',
      ],
      frequencyExposureCounts: {
        Squat: 3,
        Bench: 3,
        Deadlift: 1,
      },
    },
    smartDecisionSummary: {
      dayType: 'training',
      reason: 'training-fallback',
      readiness: {
        meetPlanReady: false,
        meetPlanWeakestLift: 'Deadlift',
        meetPlanWeakestPhase: 'opener',
        meetPlanOpenerReadyCount: 1,
        meetPlanSecondAttemptReadyCount: 0,
        meetPlanThirdAttemptPotentialCount: 0,
        meetPlanReadiness: {
          Deadlift: {
            currentCycleBestE1RM: 157.3,
            readinessTargetAttempt: 162.5,
            readinessPhase: 'opener',
            openerReady: false,
          },
        },
        meetProjection: {
          available: true,
          label: 'C3W32–C3W35',
          limitingLift: 'Squat',
          limitingPhase: 'opener',
        },
        meetdayBlockers: ['meet-plan-not-ready'],
        recentFatigueScore: 0,
        recentFailedOrSkippedSetCount: 0,
      },
    },
  };
}

test('distinguishes the current blocker from the projected limiter', () => {
  const rows = getSmartModalDetailRows(workoutWith([
    smartLift({ lift: 'Deadlift' }),
  ]));

  expect(rows).toEqual(expect.arrayContaining([
    {
      label: 'Current blocker',
      value: 'Deadlift — opener not yet demonstrated',
    },
    {
      label: 'Projected limiter',
      value: 'Squat — opener',
    },
  ]));
});

test.each([
  ['Squat', 'topTriple', 3, 0.75, 0.775],
  ['Bench', 'topDouble', 2, 0.80, 0.825],
  ['Deadlift', 'topDouble', 2, 0.825, 0.85],
])(
  'explains previous and current %s stimulus with compact volume and progression reason',
  (lift, labelKey, reps, previousPct, currentPct) => {
    const rows = getSmartPrescriptionDetailRows(workoutWith([
      smartLift({
        lift,
        labelKey,
        reps,
        previousPct,
        currentPct,
      }),
    ]));

    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe(`${lift} — Plan`);
    expect(rows[0].value).toContain('→');
    expect(rows[0].value).toContain('5×4×72.5%');
    expect(rows[0].value).toContain(
      'Progressed to avoid repeating the same stimulus.'
    );
    expect(rows[0].value).not.toContain('grid');
    expect(rows[0].value).not.toContain('empty cells');
  }
);

test('explains secondary volume without inventing top-set progress', () => {
  const bench = smartLift({
    lift: 'Bench',
    role: 'secondary',
    labelKey: 'workSets',
    reps: 4,
    previousPct: 0,
    currentPct: 0.75,
    volumeCount: 3,
    volumeReps: 4,
    volumePct: 0.75,
    repeatVariationApplied: false,
  });
  bench.sets = Array.from({ length: 4 }, () => ({
    lift: 'Bench',
    labelKey: 'workSets',
    reps: 4,
    pct: 0.75,
    weight: 72.5,
  }));
  bench.smartPrescription.gridItemCount = 6;

  const [row] = getSmartPrescriptionDetailRows(
    workoutWith([bench])
  );

  expect(row.value).toContain('4×4×75%');
  expect(row.value).toContain(
    'Lower volume for the secondary lift.'
  );
  expect(row.value).not.toContain('→');
});

test('builds a copyable diagnosis with decision, projection and technical proof', () => {
  const workout = workoutWith([
    smartLift({ lift: 'Deadlift' }),
    smartLift({
      lift: 'Bench',
      role: 'secondary',
      repeatVariationApplied: false,
    }),
  ]);
  const text = buildSmartDiagnosticText(workout);

  expect(text).toContain('Kelani SBD Smart diagnosis');
  expect(text).toContain('Prescription version: 10');
  expect(text).toContain('Workout: C3W24');
  expect(text).toContain('Current blocker: Deadlift');
  expect(text).toContain('Projected meet: C3W32–C3W35');
  expect(text).toContain('Projected limiter: Squat — opener');
  expect(text).toContain('Deadlift — Plan:');
  expect(text).toContain('Selection: primary=Deadlift, secondary=Bench');
  expect(text).toContain('repeatVariation=true');
  expect(text).toContain('gridItems=9');
});
