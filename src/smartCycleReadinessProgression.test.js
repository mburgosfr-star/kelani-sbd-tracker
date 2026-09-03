import { getSmartModalDetailRows } from './App';
import {
  buildSmartLiftPrescription,
  buildSmartLiftState,
} from './smartPrescriptionEngine';

function makeSmartLiftEntry({
  workoutNumber,
  lift = 'Squat',
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

function makeMeetProgressionHistory(trainingMax) {
  return [
    makeSmartLiftEntry({
      workoutNumber: 1,
      sets: [
        makeSet({
          labelKey: 'topTriple', reps: 3, pct: 0.70, trainingMax,
        }),
        ...Array.from({ length: 4 }, () => makeSet({
          labelKey: 'backoff', reps: 4, pct: 0.65, trainingMax,
        })),
      ],
    }),
    makeSmartLiftEntry({
      workoutNumber: 2,
      sets: [
        makeSet({
          labelKey: 'topSingle', reps: 1, pct: 0.90, trainingMax,
          done: true, failed: true, skipped: true,
        }),
        ...Array.from({ length: 4 }, () => makeSet({
          labelKey: 'backoff', reps: 4, pct: 0.70, trainingMax,
        })),
      ],
    }),
    makeSmartLiftEntry({
      workoutNumber: 3,
      role: 'secondary',
      sets: Array.from({ length: 4 }, () => makeSet({
        labelKey: 'workSets', reps: 4, pct: 0.65, trainingMax,
      })),
    }),
  ];
}

test.each([100, 200])(
  'uses successful volume for meet-specific top and back-off progression at TM %s',
  trainingMax => {
    const state = buildSmartLiftState({
      history: makeMeetProgressionHistory(trainingMax),
      currentCycle: 1,
      lift: 'Squat',
      trainingMax,
      meetPlanReadiness: {
        Squat: {
          ready: false,
          readinessPhase: 'second-attempt',
          currentCycleReadinessRatio: 0.89,
          currentCycleBestE1RM: trainingMax * 0.89,
          readinessTargetAttempt: trainingMax,
          currentCycleShortfall: trainingMax * 0.11,
          attempts: {
            opener: trainingMax * 0.9,
            secondAttempt: trainingMax,
            thirdAttempt: trainingMax * 1.025,
          },
        },
      },
    });

    expect(state.highestRecentSuccessfulVolumePct).toBe(0.70);

    const prescription = buildSmartLiftPrescription({
      state,
      role: 'primary',
      isSingleLiftWorkout: false,
    });

    expect(prescription.validation.valid).toBe(true);
    expect(prescription.meetSpecificProgression).toBe(true);
    expect(prescription.topSetAnchorPct).toBe(0.70);
    expect(prescription.volumeAnchorPct).toBe(0.70);
    expect(prescription.plannedVolumePct).toBe(0.675);
    expect(prescription.sets.slice(1)).toHaveLength(3);
    expect(prescription.sets[0]).toMatchObject({
      labelKey: 'topTriple',
      reps: 3,
      pct: 0.725,
    });
    prescription.sets.slice(1).forEach(set => {
      expect(set).toMatchObject({
        labelKey: 'backoff',
        reps: 5,
        pct: 0.675,
      });
    });
  }
);

test('does not force meet-specific intensity after the opener is demonstrated', () => {
  const state = buildSmartLiftState({
    history: makeMeetProgressionHistory(100),
    currentCycle: 1,
    lift: 'Squat',
    trainingMax: 100,
    meetPlanReadiness: {
      Squat: {
        ready: true,
        currentCycleReadinessRatio: 1.01,
        currentCycleBestE1RM: 101,
        readinessTargetAttempt: 100,
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });
  expect(prescription.validation.valid).toBe(true);
  expect(prescription.meetSpecificProgression).toBe(false);
  expect(prescription.sets[0].pct).toBeLessThan(0.775);
});

test('keeps successful secondary work as an explicit volume anchor', () => {
  const state = buildSmartLiftState({
    history: makeMeetProgressionHistory(100),
    currentCycle: 1,
    lift: 'Squat',
    trainingMax: 100,
  });
  const prescription = buildSmartLiftPrescription({ state, role: 'secondary' });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.progressionAnchorPct).toBe(0);
  expect(prescription.volumeAnchorPct).toBe(0.70);
  expect(prescription.plannedVolumePct).toBe(0.675);
});

test('names the cycle estimate and real 1RM target separately in the Smart modal', () => {
  expect(
    getSmartModalDetailRows({
      smartDecisionSummary: {
        dayType: 'training',
        reason: 'training-fallback',
        readiness: {
          meetPlanReady: false,
          meetPlanOpenerReadyCount: 0,
          meetPlanSecondAttemptReadyCount: 0,
          meetPlanThirdAttemptPotentialCount: 0,
          meetPlanWeakestLift: 'Squat',
          meetPlanWeakestPhase: 'opener',
          meetPlanWeakestBestE1RM: 116.16666666666666,
          meetPlanWeakestTarget: 130,
          meetPlanReadiness: {
            Squat: {
              currentCycleBestE1RM: 116.16666666666666,
              oneRMTargetE1RM: 145,
              readinessTargetAttempt: 130,
              readinessPhase: 'opener',
              openerReady: false,
              attempts: { opener: 130 },
            },
          },
          meetProjection: {
            available: true,
            label: 'C3W27–C3W29',
            limitingLift: 'Squat',
            limitingPhase: 'opener',
          },
          meetdayBlockers: ['one-rm-readiness'],
        },
      },
    })
  ).toEqual([
    {
      label: 'Current blocker',
      value: 'Squat (100% of the real 1RM not yet reached)',
    },
    { label: 'Squat', value: 'Best e1RM this cycle 115 kg → 145 kg (Gap 30 kg)', kind: 'lift-readiness' },
    { label: 'Projected meet', value: 'C3W27–C3W29' },
    {
      label: 'Readiness basis',
      value: 'Your best e1RM this cycle is an estimate based on your best successful set in this cycle; the target is your confirmed real 1RM. The projection assumes normal progress and unchanged meet attempts.',
      kind: 'note',
    },
  ]);
});



test('shows the real 1RM readiness target in the Smart modal', () => {
  const rows = getSmartModalDetailRows({
    smartDecisionSummary: {
      dayType: 'training',
      reason: 'training-fallback',
      readiness: {
        meetPlanReady: false,
        meetPlanOpenerReadyCount: 3,
        meetPlanSecondAttemptReadyCount: 2,
        meetPlanThirdAttemptPotentialCount: 0,
        meetPlanWeakestLift: 'Deadlift',
        meetPlanWeakestPhase: 'second-attempt',
        meetPlanWeakestBestE1RM: 167.5,
        meetPlanWeakestTarget: 170.625,
        meetPlanReadiness: {
          Deadlift: {
            currentCycleBestE1RM: 167.5,
            oneRMTargetE1RM: 180,
            readinessTargetAttempt: 170.625,
            readinessPhase: 'second-attempt',
            openerReady: true,
          },
        },
        meetProjection: {
          available: true,
          label: 'C3W29–C3W31',
          limitingLift: 'Deadlift',
          limitingPhase: 'second-attempt',
        },
      },
    },
  });

  expect(rows[0]).toEqual({
    label: 'Current blocker',
    value: 'Deadlift (100% of the real 1RM not yet reached)',
  });
  expect(rows).toContainEqual({
    label: 'Deadlift',
    value: 'Best e1RM this cycle 167.5 kg → 180 kg (Gap 12.5 kg)',
    kind: 'lift-readiness',
  });
  expect(rows).toContainEqual({
    label: 'Projected meet',
    value: 'C3W29–C3W31',
  });
});

test('uses three-set secondary Bench volume on a mixed Smart day', () => {
  const state = buildSmartLiftState({
    history: [],
    currentCycle: 1,
    lift: 'Bench',
    trainingMax: 100,
  });
  const prescription = buildSmartLiftPrescription({
    state,
    role: 'secondary',
    isSingleLiftWorkout: false,
    isMixedLiftWorkout: true,
  });

  expect(prescription.validation.valid).toBe(true);
  expect(prescription.sets).toHaveLength(3);
});
