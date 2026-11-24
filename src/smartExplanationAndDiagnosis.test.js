import {
  buildSmartDiagnosticText,
  getSmartModalDetailRows,
  getSmartPrescriptionDetailRows,
  getSmartAttemptPhaseLabel,
  getHistoricalSmartIntensityRole,
} from './App';
import { translations } from './translations';
import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import { SMART_IDEAL_LEVELS, buildAdjustedSmartIdealRoutePlan } from './smartIdealRoute';
import { TRAINING_MODELS } from './smartTrainingConstants';

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
      label: 'Execution',
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

function completeIdealRouteWorkout(history, workout) {
  const completed = {
    ...workout,
    completed: true,
    workoutEffort: workout.type === 'rest' ? 'easy' : 'good',
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
      smartDayType: 'recovery',
      workoutSnapshot: completed,
    }];
  }

  return [
    ...history,
    ...completed.lifts.map(liftBlock => ({
      cycle: 1,
      workoutNumber: completed.number,
      lift: liftBlock.lift,
      workoutEffort: completed.workoutEffort,
      smartDayType: completed.type === 'meet' ? 'meet' : 'training',
      workoutSnapshot: completed,
    })),
  ];
}

test.each(SMART_IDEAL_LEVELS)(
  'every active %s route screen keeps its meet plan without readiness claims',
  athleteLevel => {
    let history = [];
    const workouts = [];

    const plan = buildAdjustedSmartIdealRoutePlan({ athleteLevel }).workouts;
    for (let currentIndex = 0; currentIndex < plan.length; currentIndex += 1) {
      const workout = generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, {
        programProfile: 'kelaniSbd',
        squat: 150,
        bench: 100,
        deadlift: 200,
        accessoryMode: 'off',
        preparationMode: 'off',
        currentCycle: 1,
        currentIndex,
        history,
        athleteLevel,
      })[currentIndex];
      workouts.push(workout);
      history = completeIdealRouteWorkout(history, workout);
    }

    expect(workouts).toHaveLength(plan.length);

    workouts.forEach((workout, index) => {
      expect(workout.smartIdealRoute).toMatchObject({
        workoutNumber: plan[index].workoutNumber,
      });

      const rows = getSmartModalDetailRows(workout, translations.en);
      const labels = rows.map(row => row.label);
      const diagnosis = buildSmartDiagnosticText(workout, translations.en);

      expect(labels).not.toContain(translations.en.smartCurrentBlocker);
      expect(labels).not.toContain(translations.en.smartCurrentBlockers);
      expect(labels).not.toContain(translations.en.smartPrimaryBlocker);
      expect(diagnosis).not.toContain('Meet blockers:');

      if (workout.type === 'meet') {
        expect(labels).toContain(translations.en.smartMeetDayExecutionLabel);
        expect(labels).not.toContain(translations.en.expectedMeetWindow);
        return;
      }

      expect(labels).toContain(translations.en.expectedMeetWindow);
      expect(labels).not.toContain(translations.en.smartProjectedMeet);

      if (Object.keys(
        workout.smartDecisionSummary?.readiness?.meetPlanReadiness || {}
      ).length > 0) {
        expect(rows.some(row => row.kind === 'lift-readiness')).toBe(false);
      }
    });
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

test('keeps actionable fatigue and missed-set details on recovery days', () => {
  const workout = workoutWith([]);
  workout.smartDayType = 'recovery';
  workout.smartDecisionSummary.dayType = 'recovery';
  workout.smartDecisionSummary.reason = 'frequency-recovery';
  workout.smartDecisionSummary.readiness.recentFatigueScore = 6;
  workout.smartDecisionSummary.readiness.recentFailedOrSkippedSetCount = 2;

  const rows = getSmartModalDetailRows(workout);

  expect(rows).toEqual(expect.arrayContaining([
    {
      label: 'Fatigue score',
      value: '6/2 (recovery threshold reached)',
    },
    {
      label: 'Failed sets',
      value: '2/2 (recovery selected)',
    },
  ]));
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
    expect(row.value).not.toContain('Light intensity.');
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
    expect(row.value).not.toContain('Medium intensity.');
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
      value: '5×4×70%',
      kind: 'prescription',
    },
    {
      label: 'Bench (Plan)',
      value: '6×4×70%',
      kind: 'prescription',
    },
  ]);
});

test('ideal-route modal keeps planned intensities and presents every lift consistently', () => {
  const deadlift = smartLift({
    lift: 'Deadlift',
    labelKey: 'topSingle',
    reps: 1,
    previousPct: 0.90,
    currentPct: 0.90,
  });
  deadlift.intensityRole = 'heavy';
  deadlift.smartPrescription.intensityRole = 'heavy';

  const bench = smartLift({
    lift: 'Bench',
    role: 'secondary',
    labelKey: 'topDouble',
    reps: 2,
  });
  bench.intensityRole = 'light';
  bench.smartPrescription.intensityRole = 'light';

  const squat = smartLift({
    lift: 'Squat',
    role: 'tertiary',
    labelKey: 'topTriple',
    reps: 3,
  });
  squat.intensityRole = 'light';
  squat.smartPrescription.intensityRole = 'light';

  [deadlift, bench, squat].forEach(liftBlock => {
    liftBlock.smartPrescription.topSetAnchorPct = 0;
    liftBlock.smartPrescription.volumeAnchorPct = 0;
    liftBlock.smartPrescription.plannedVolumePct = 0;
  });

  const workout = workoutWith([deadlift, bench, squat]);
  workout.smartIdealRoute = { stage: 'normal', workoutNumber: 24 };

  const rows = getSmartPrescriptionDetailRows(workout);

  expect(rows).toHaveLength(3);
  expect(rows[0].value).toBe(
    'Top single: 90% · 5×4×72.5%'
  );
  expect(rows[1].value).not.toContain('Light intensity.');
  expect(rows[2].value).not.toContain('Light intensity.');
  rows.forEach(row => {
    expect(row.value).not.toContain('Primary work was selected');
    expect(row.value).not.toContain(' kg');
    expect(row.value).not.toMatch(/(Heavy|Medium|Light) intensity\./);
  });

  const diagnosis = buildSmartDiagnosticText(workout);
  expect(diagnosis).toContain(
    'Selection: primary=Deadlift, secondary=Bench, tertiary=Squat'
  );
  expect(diagnosis).toContain(
    'Deadlift technical: role=primary, intensity=heavy, repeatVariation=true'
  );
  expect(diagnosis).toContain(
    'Bench technical: role=secondary, intensity=light, repeatVariation=true'
  );
  expect(diagnosis).toContain(
    'Squat technical: role=tertiary, intensity=light, repeatVariation=true'
  );
  expect(diagnosis).not.toContain('measuredDoseIntensity');
  expect(diagnosis).not.toMatch(/(?:topAnchor|volumeAnchor|plannedVolume)=0%/);
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
  expect(rows.find(row => row.label === 'Fatigue score')).toBeUndefined();
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
  expect(row.value).not.toContain(
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

  expect(row.value).not.toContain('Light intensity.');
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
  expect(row.value).toBe('6×4×60%');
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
  expect(text).not.toContain('Current blocker:');
  expect(text).toContain('Projected meet: C3W32–C3W35');
  expect(text).not.toContain('Projected limiter');
  expect(text).toContain('Deadlift (Plan):');
  expect(text).toContain('Selection: primary=Deadlift, secondary=Bench');
  expect(text).toContain('repeatVariation=true');
  expect(text).toContain('gridItems=9');
});


test.each(['nl', 'en', 'ca'])(
  'Smart details omit strength gaps and readiness claims while preserving plans in %s',
  language => {
    const t = translations[language];
    for (const dayType of ['training', 'recovery', 'deload']) {
      for (const stage of [null, 'normal', 'taper']) {
        for (const ready of [false, true]) {
          const workout = workoutWith([smartLift({ lift: 'Deadlift' })]);
          workout.smartDecisionSummary.dayType = dayType;
          if (stage) workout.smartIdealRoute = { stage, workoutNumber: 24 };
          Object.assign(workout.smartDecisionSummary.readiness, {
            meetPlanReady: ready,
            meetPlanFullyDemonstrated: ready,
            meetPlanReadiness: {
              Squat: { currentCycleBestE1RM: 0, oneRMTargetE1RM: 150, readinessPhase: 'opener' },
              Bench: { currentCycleBestE1RM: 105, oneRMTargetE1RM: 100, readinessPhase: 'ready' },
              Deadlift: { currentCycleBestE1RM: 170, oneRMTargetE1RM: 185, readinessPhase: 'third-attempt' },
            },
          });
          const before = JSON.stringify(workout);
          const rows = getSmartModalDetailRows(workout, t, { Deadlift: 182.5 }, 'Tomorrow');
          const labels = rows.map(row => row.label);
          expect(rows.some(row => row.kind === 'lift-readiness')).toBe(false);
          for (const removed of [t.smartCurrentBlocker, t.smartCurrentBlockers,
            t.smartMeetStatus, t.smartReadinessBasis, 'Squat', 'Bench', 'Deadlift']) {
            expect(labels).not.toContain(removed);
          }
          expect(rows).toContainEqual({
            label: stage ? t.expectedMeetWindow : t.smartProjectedMeet,
            value: 'C3W32–C3W35 · Tomorrow',
          });
          expect(rows.some(row => row.kind === 'prescription')).toBe(true);
          expect(JSON.stringify(workout)).toBe(before);
        }
      }
    }
  }
);
