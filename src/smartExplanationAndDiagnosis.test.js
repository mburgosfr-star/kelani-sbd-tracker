import {
  buildSmartDiagnosticText,
  getSmartModalDetailRows,
  getSmartPrescriptionDetailRows,
  getSmartAttemptPhaseLabel,
  getHistoricalSmartIntensityRole,
} from './App';
import { translations } from './translations';

test('completed workout labels keep their stored historical meaning', () => {
  expect(getHistoricalSmartIntensityRole({
    lift: 'Squat',
    role: 'secondary',
    intensityRole: 'light',
    sets: Array.from({ length: 6 }, () => ({ reps: 4, pct: 0.75 })),
  })).toBe('light');
  expect(getHistoricalSmartIntensityRole({
    lift: 'Bench',
    role: 'secondary',
    intensityRole: 'light',
    sets: Array.from({ length: 6 }, () => ({ reps: 4, pct: 0.75 })),
  })).toBe('light');
});

test('maps the projected third-attempt limiter without falling back to opener', () => {
  expect(getSmartAttemptPhaseLabel('third-attempt', {
    smartAttemptPhaseThird: '3e poging',
  })).toBe('3e poging');
  expect(getSmartAttemptPhaseLabel('second-attempt', {
    smartAttemptPhaseSecond: '2e poging',
  })).toBe('2e poging');
  expect(getSmartAttemptPhaseLabel('opener', {
    smartAttemptPhaseOpener: 'opener',
  })).toBe('opener');
});

test('meet-day Smart details switch from diagnostics to positive execution guidance', () => {
  expect(getSmartModalDetailRows({
    type: 'meet',
    smartDecisionSummary: {
      dayType: 'meet',
      readiness: { recentFatigueScore: 99 },
    },
  }, {})).toEqual([
    {
      label: 'You are ready',
      value: 'Trust your preparation. Stay calm and execute one attempt at a time.',
      kind: 'meet-day',
    },
    {
      label: 'Attempt strategy',
      value: 'Secure the opener, build the total with the second, then commit to the third.',
      kind: 'meet-day',
    },
  ]);
});

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
            oneRMTargetE1RM: 180,
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
        meetdayBlockers: ['one-rm-readiness'],
        recentFatigueScore: 0,
        recentFailedOrSkippedSetCount: 0,
      },
    },
  };
}

test('fully demonstrated meet readiness does not claim taper before taper starts', () => {
  const workout = workoutWith([smartLift({ lift: 'Squat', role: 'secondary' })]);
  workout.smartDecisionSummary.readiness.meetPlanFullyDemonstrated = true;
  workout.smartDecisionSummary.readiness.meetPlanOpenerReadyCount = 3;
  workout.smartDecisionSummary.readiness.meetPlanSecondAttemptReadyCount = 3;
  workout.smartDecisionSummary.readiness.meetPlanThirdAttemptPotentialCount = 3;

  const rows = getSmartModalDetailRows(workout, {
    smartMeetStatus: 'Meetstatus',
    smartMeetFullyReady: 'Volledig wedstrijdklaar: alle liftdoelen bereikt. De training gaat verder volgens plan.',
  });

  expect(rows).toContainEqual({
    label: 'Meetstatus',
    value: 'Volledig wedstrijdklaar: alle liftdoelen bereikt. De training gaat verder volgens plan.',
  });
});

test.each(['nl', 'en', 'ca'])(
  'a fully meet-ready ideal-route taper explicitly explains tapering in %s',
  language => {
    const t = translations[language];
    const workout = workoutWith([
      smartLift({ lift: 'Squat' }),
      smartLift({ lift: 'Bench', role: 'secondary' }),
    ]);
    workout.smartIdealRoute = { stage: 'taper', workoutNumber: 22 };
    workout.smartDecisionSummary.readiness.meetPlanReady = true;
    workout.smartDecisionSummary.readiness.meetPlanFullyDemonstrated = true;

    const rows = getSmartModalDetailRows(workout, t);

    expect(rows).toContainEqual({
      label: t.smartMeetStatus,
      value: t.smartMeetFullyReadyTaper,
    });
    expect(t.smartMeetFullyReadyTaper).not.toBe(t.smartMeetFullyReady);
  }
);

test('a ready-phase Bench prescription explains taper instead of recovery or blocked progression', () => {
  const bench = smartLift({ lift: 'Bench', labelKey: 'topTriple', reps: 3 });
  bench.smartPrescription.regressionReason = 'ready-taper';
  bench.smartPrescription.repeatVariationApplied = false;

  const rows = getSmartPrescriptionDetailRows(workoutWith([bench]), {
    smartTaperReason: 'Taper: vermoeidheid verlagen.',
    smartRegressionReason: 'Recovery or blocked.',
  });

  expect(rows[0].value).toContain('Taper: vermoeidheid verlagen.');
  expect(rows[0].value).not.toContain('Recovery or blocked.');
});

test('names the current blocker once, not duplicated as a separate primary-blocker row', () => {
  const rows = getSmartModalDetailRows(workoutWith([
    smartLift({ lift: 'Deadlift' }),
  ]));

  expect(rows).toEqual(expect.arrayContaining([
    {
      label: 'Current blocker',
      value: 'Deadlift (100% of the real 1RM not yet reached)',
    },
  ]));
  expect(rows.filter(row => row.label === 'Primary blocker')).toHaveLength(0);
});

test('shows the full readiness/blocker/fatigue detail on a deload or rest day too, not just on training-fallback days', () => {
  // C3W35 was correctly converted to a rest day (via the
  // deload frequency fallback), but the modal collapsed to showing only
  // "Projected meet" because this whole block used to be gated on
  // isTrainingFallback (dayType==='training' && reason==='training-fallback').
  // The underlying readiness/fatigue data is exactly as meaningful on a
  // deload or recovery day - if anything more so, since it explains why
  // today isn't a training day at all.
  const workout = workoutWith([]);
  workout.smartDayType = 'recovery';
  workout.smartDecisionSummary.dayType = 'recovery';
  workout.smartDecisionSummary.reason = 'frequency-recovery';
  workout.smartDecisionSummary.readiness.recentFatigueScore = 6;
  workout.smartDecisionSummary.readiness.recentFailedOrSkippedSetCount = 2;

  const rows = getSmartModalDetailRows(workout);

  expect(rows).toEqual(expect.arrayContaining([
    {
      label: 'Current blocker',
      value: 'Deadlift (100% of the real 1RM not yet reached)',
    },
    {
      label: 'Deadlift',
      value: 'Cycle e1RM 157.5 kg → 180 kg (Gap 22.5 kg)',
      kind: 'lift-readiness',
    },
    {
      label: 'Fatigue',
      value: '6 (recovery required)',
    },
    {
      label: 'Failed',
      value: '2/2 (recovery selected)',
    },
  ]));
});

test('the Gap is always exactly (displayed target) - (displayed current) - simple, visible arithmetic on the two numbers shown right above it', () => {
  // Reproduces the C3W33 diagnosis boundary: the UI showed
  // "Cycle e1RM: 170 kg" and "Real 1RM target: 185 kg" but a Gap of "13.8 kg" -
  // a flat contradiction of the two rounded numbers right above it (the
  // expects 185 - 170 = 15). Whether a lift still counts as a blocker at
  // all is decided separately from raw (unrounded) values in
  // smartTrainingEngine.js (isEffectivelyMet), but once a lift IS shown as
  // the blocker, its Gap must match simple subtraction of the displayed
  // Cycle e1RM and target - never a more "precise" number that doesn't add
  // up against what's on screen.
  const workout = workoutWith([smartLift({ lift: 'Deadlift' })]);
  workout.smartDecisionSummary.readiness.meetPlanReadiness.Deadlift = {
    currentCycleBestE1RM: 170.66666666666666,
    oneRMTargetE1RM: 185,
    readinessTargetAttempt: 184.5,
    readinessPhase: 'third-attempt',
    openerReady: true,
  };
  workout.smartDecisionSummary.readiness.meetPlanWeakestPhase = 'third-attempt';

  const rows = getSmartModalDetailRows(workout);
  const liftRow = rows.find(row => row.label === 'Deadlift');

  expect(liftRow.value).toBe('Cycle e1RM 170 kg → 185 kg (Gap 15 kg)');
});

function secondaryLiftBlock(lift, { volumePct = 0.75, volumeReps = 6, volumeCount = 6 } = {}) {
  return {
    lift,
    role: 'secondary',
    sets: volumeSets(lift, volumeCount, volumeReps, volumePct).map(
      set => ({ ...set, labelKey: 'workSets' })
    ),
    warmups: Array.from({ length: 2 }, () => ({})),
    smartPrescription: {
      role: 'secondary',
      volumeAnchorPct: volumePct,
      plannedVolumePct: volumePct,
      regressionReason: null,
      repeatVariationApplied: false,
    },
  };
}

test('explains genuinely light secondary lifts from their dose', () => {
  const rows = getSmartPrescriptionDetailRows(
    workoutWith([
      secondaryLiftBlock('Squat', { volumePct: 0.60, volumeReps: 4, volumeCount: 6 }),
      secondaryLiftBlock('Bench', { volumePct: 0.60, volumeReps: 4, volumeCount: 6 }),
    ])
  );

  expect(rows).toHaveLength(2);
  rows.forEach(row => {
    expect(row.value).toContain('Light work.');
    expect(row.value).not.toContain('Lower volume for the secondary lift');
  });
});

test('C3W43 secondary roles are both explained as medium from their prescribed dose', () => {
  const squat = secondaryLiftBlock('Squat', {
    volumePct: 100 / 145,
    volumeReps: 4,
    volumeCount: 6,
  });
  const bench = secondaryLiftBlock('Bench', {
    volumePct: 0.70,
    volumeReps: 4,
    volumeCount: 6,
  });
  squat.intensityRole = 'medium';
  bench.intensityRole = 'medium';
  squat.smartPrescription.intensityRole = 'medium';
  bench.smartPrescription.intensityRole = 'medium';

  const rows = getSmartPrescriptionDetailRows(workoutWith([squat, bench]));

  expect(rows).toHaveLength(2);
  rows.forEach(row => {
    expect(row.value).toContain('Medium intensity.');
    expect(row.value).not.toContain('Light work');
  });
});

test('C4W9 primary and secondary medium lifts use the same intensity explanation', () => {
  const deadlift = secondaryLiftBlock('Deadlift', {
    volumePct: 0.70,
    volumeReps: 4,
    volumeCount: 5,
  });
  const bench = secondaryLiftBlock('Bench', {
    volumePct: 0.70,
    volumeReps: 4,
    volumeCount: 6,
  });
  deadlift.role = 'primary';
  deadlift.intensityRole = 'medium';
  deadlift.smartPrescription.role = 'primary';
  deadlift.smartPrescription.intensityRole = 'medium';
  bench.intensityRole = 'medium';
  bench.smartPrescription.intensityRole = 'medium';

  expect(getSmartPrescriptionDetailRows(workoutWith([deadlift, bench]))).toEqual([
    {
      label: 'Deadlift (Plan)',
      value: '5×4×70% · Medium intensity.',
      kind: 'prescription',
    },
    {
      label: 'Bench (Plan)',
      value: '6×4×70% · Medium intensity.',
      kind: 'prescription',
    },
  ]);
});

test('lists every lift still short of its real 1RM as a blocker, not just the single weakest one', () => {
  const workout = workoutWith([smartLift({ lift: 'Deadlift' })]);
  workout.smartDecisionSummary.readiness.meetPlanReadiness = {
    Deadlift: {
      currentCycleBestE1RM: 170.66666666666666,
      oneRMTargetE1RM: 185,
      readinessTargetAttempt: 184.5,
      readinessPhase: 'third-attempt',
      openerReady: true,
    },
    Squat: {
      currentCycleBestE1RM: 138.66666666666666,
      oneRMTargetE1RM: 147.5,
      readinessTargetAttempt: 148.5,
      readinessPhase: 'third-attempt',
      openerReady: true,
    },
    Bench: {
      currentCycleBestE1RM: 101.33333333333333,
      oneRMTargetE1RM: 100,
      readinessTargetAttempt: 100,
      readinessPhase: 'ready',
      openerReady: true,
    },
  };
  workout.smartDecisionSummary.readiness.meetPlanWeakestLift = 'Deadlift';
  workout.smartDecisionSummary.readiness.meetPlanWeakestPhase = 'third-attempt';

  const rows = getSmartModalDetailRows(workout);
  const blockerRow = rows.find(row =>
    row.label === 'Current blockers' || row.label === 'Current blocker'
  );

  expect(blockerRow.label).toBe('Current blockers');
  expect(blockerRow.value).toBe(
    'Deadlift, Squat (100% of the real 1RM not yet reached)'
  );
  // Bench is fully ready and must not be listed as a blocker.
  expect(blockerRow.value).not.toContain('Bench');

  // Showing a row for only the single weakest lift (Deadlift) while naming
  // Squat as a blocker too was inconsistent - all 3 lifts still get their
  // own row, including Bench even though it's already fully ready (not
  // omitted), just compacted to one line each instead of three cells.
  expect(rows).toEqual(expect.arrayContaining([
    { label: 'Deadlift', value: 'Cycle e1RM 170 kg → 185 kg (Gap 15 kg)', kind: 'lift-readiness' },
    { label: 'Squat', value: 'Cycle e1RM 137.5 kg → 147.5 kg (Gap 10 kg)', kind: 'lift-readiness' },
    { label: 'Bench', value: 'Ready (Cycle e1RM 102.5 kg)', kind: 'lift-readiness' },
  ]));
});

test('live dashboard e1RMs override stale 5kg workout snapshots in the Smart modal', () => {
  const workout = workoutWith([smartLift({ lift: 'Deadlift' })]);
  workout.smartDecisionSummary.readiness.meetPlanReadiness = {
    Bench: {
      currentCycleBestE1RM: 100,
      oneRMTargetE1RM: 105,
      readinessTargetAttempt: 105,
      readinessPhase: 'third-attempt',
    },
    Deadlift: {
      currentCycleBestE1RM: 180,
      oneRMTargetE1RM: 185,
      readinessTargetAttempt: 185,
      readinessPhase: 'third-attempt',
    },
  };

  const rows = getSmartModalDetailRows(workout, {}, {
    Bench: 102.5,
    Deadlift: 182.5,
  });

  expect(rows).toEqual(expect.arrayContaining([
    { label: 'Bench', value: 'Cycle e1RM 102.5 kg → 105 kg (Gap 2.5 kg)', kind: 'lift-readiness' },
    { label: 'Deadlift', value: 'Cycle e1RM 182.5 kg → 185 kg (Gap 2.5 kg)', kind: 'lift-readiness' },
  ]));
});

test("does not add a fatigue detail or 'cause' for an all-clear rest day", () => {
  // completeWorkout's "Complete rest day" button always records
  // workoutEffort: 'easy' for a rest day - technically accurate, but
  // showing "Previous workout EASY" reads as if a training session felt
  // easy, when there was no training at all.
  const workout = workoutWith([smartLift({ lift: 'Deadlift' })]);
  workout.smartDecisionSummary.readiness.lastWorkoutEffort = 'easy';
  workout.smartDecisionSummary.readiness.lastWasRestDay = true;

  const rows = getSmartModalDetailRows(workout);
  expect(rows.find(row => row.label === 'Fatigue')).toBeUndefined();
  expect(rows.find(row => row.label === 'Cause')).toBeUndefined();
});

test('never shows a "pp" delta annotation because it is confusing regardless of what it computed', () => {
  const bench = smartLift({
    lift: 'Bench',
    labelKey: 'topDouble',
    reps: 2,
    previousPct: 0.896,
    currentPct: 0.9,
  });
  bench.sets[0].precisePct = 0.921;

  const [row] = getSmartPrescriptionDetailRows(workoutWith([bench]));

  expect(row.value).toContain('90% to 90%');
  expect(row.value).not.toContain('pp');
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
    expect(rows[0].label).toBe(`${lift} (Plan)`);
    expect(rows[0].value).toContain(' to ');
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

  // A structural secondary role does not imply lower volume. Explain the
  // measured combined intensity instead.
  const squat = smartLift({ lift: 'Squat' });

  const [row] = getSmartPrescriptionDetailRows(
    workoutWith([bench, squat])
  );

  expect(row.value).toContain('4×4×75%');
  expect(row.value).toContain(
    'Medium intensity.'
  );
  expect(row.value).not.toContain('→');
});

test('explains W41-style secondary squat from its measured light intensity, not alleged lower volume', () => {
  const squat = secondaryLiftBlock('Squat', {
    volumePct: 0.66,
    volumeReps: 4,
    volumeCount: 6,
  });
  const bench = smartLift({ lift: 'Bench' });

  const [row] = getSmartPrescriptionDetailRows(workoutWith([squat, bench]));

  expect(row.value).toContain('Light work.');
  expect(row.value).not.toContain('Lower volume');
});

test("a lift forced light on a single-lift day (heavy weekly slot already used) explains why, instead of falsely calling it a secondary lift", () => {
  const bench = smartLift({
    lift: 'Bench',
    role: 'secondary',
    labelKey: 'workSets',
    reps: 4,
    previousPct: 0,
    currentPct: 0.6,
    volumeCount: 6,
    volumeReps: 4,
    volumePct: 0.6,
    repeatVariationApplied: false,
  });
  bench.intensityRole = 'light';
  bench.sets = Array.from({ length: 6 }, () => ({
    lift: 'Bench',
    labelKey: 'workSets',
    reps: 4,
    pct: 0.6,
    weight: 25,
  }));
  bench.smartPrescription.intensityRole = 'light';
  bench.smartPrescription.gridItemCount = 6;

  const [row] = getSmartPrescriptionDetailRows(
    workoutWith([bench])
  );

  expect(row.value).not.toContain('Lower volume for the secondary lift.');
  expect(row.value).toBe('6×4×60% · Light work.');
  expect(row.value).not.toContain('heavy work');
});

test("a planned medium single-lift day explains that it fills the remaining weekly target", () => {
  const deadlift = smartLift({
    lift: 'Deadlift',
    role: 'secondary',
    labelKey: 'workSets',
    reps: 4,
    previousPct: 0,
    currentPct: 0.65,
    volumeCount: 5,
    volumeReps: 4,
    volumePct: 0.65,
    repeatVariationApplied: false,
  });
  deadlift.intensityRole = 'medium';
  deadlift.sets = Array.from({ length: 6 }, () => ({
    lift: 'Deadlift',
    labelKey: 'workSets',
    reps: 4,
    pct: 0.65,
    weight: 115,
  }));
  deadlift.smartPrescription.intensityRole = 'medium';
  deadlift.smartPrescription.gridItemCount = 6;

  const [row] = getSmartPrescriptionDetailRows(workoutWith([deadlift]));

  expect(row.value).toContain('6×4×65%');
  expect(row.value).toContain(
    "This lift's heavy slot is already used this week. Today's medium session fills its remaining weekly target."
  );
  expect(row.value).not.toContain('today adds useful practice and volume');
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
  expect(text).not.toContain('Projected limiter');
  expect(text).toContain('Deadlift (Plan):');
  expect(text).toContain('Selection: primary=Deadlift, secondary=Bench');
  expect(text).toContain('repeatVariation=true');
  expect(text).toContain('gridItems=9');
});
