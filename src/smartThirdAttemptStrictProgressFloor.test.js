import {
  buildSmartLiftState,
  buildSmartLiftPrescription,
} from './smartPrescriptionEngine';

function makeTopDoubleEntry({ workoutNumber, weight, pct, trainingMax }) {
  return {
    cycle: 3,
    workoutNumber,
    lift: 'Squat',
    workoutEffort: 'good',
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      lift: 'Squat',
      lifts: [{
        lift: 'Squat',
        role: 'primary',
        sets: [
          {
            lift: 'Squat',
            labelKey: 'topDouble',
            reps: 2,
            pct,
            weight,
            originalPct: pct,
            originalWeight: weight,
            done: true,
            failed: false,
            skipped: false,
          },
          {
            lift: 'Squat',
            labelKey: 'backoff',
            reps: 4,
            pct: 0.8,
            weight: Math.round((trainingMax * 0.8) / 2.5) * 2.5,
            done: true,
            failed: false,
            skipped: false,
          },
        ],
      }],
    },
  };
}

test("a third-attempt-phase top set that's due to progress is never the exact same barbell weight as the last proven top, even when the %-increase alone would round back down to it", () => {
  // Regression boundary: Squat's last heavy exposure (C3W30) was a topDouble
  // at 130kg/90% (real training max 145kg). By the next heavy exposure
  // (C3W38, several weeks later, all training in between successful), the
  // progression policy correctly computed a genuine +2.5pp step - but
  // 145kg * 90% = 130.5kg, which rounds right back down to the exact same
  // 130kg the athlete already lifted. From the athlete's side, an
  // identical prescription after a fully successful cycle reads as zero
  // progress and no path to ever demonstrating a heavier meet attempt.
  const trainingMax = 145;
  const history = [
    makeTopDoubleEntry({ workoutNumber: 30, weight: 130, pct: 130 / trainingMax, trainingMax }),
  ];

  const state = buildSmartLiftState({
    history,
    currentCycle: 3,
    lift: 'Squat',
    trainingMax,
    meetPlanReadiness: {
      Squat: {
        ready: false,
        readinessPhase: 'third-attempt',
        attempts: { opener: 132.5, secondAttempt: 140, thirdAttempt: 148.5 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });
  const topSet = prescription.sets.find(set => set.reps === 2);

  expect(topSet).toBeTruthy();
  expect(topSet.weight).toBeGreaterThan(130);
});

test('a ready-phase taper is not forced back up to the demonstrated double', () => {
  // Once ready, the lift deliberately tapers to a 90% triple. The strict
  // progress floor must not override that taper with the old 150kg double.
  const trainingMax = 145;
  const history = [
    { cycle: 3, workoutNumber: 30, lift: 'Squat', workoutEffort: 'good',
      workoutSnapshot: {
        number: 30, type: 'training', smartDayType: 'training', lift: 'Squat',
        lifts: [{
          lift: 'Squat', role: 'primary',
          sets: [
            { lift: 'Squat', labelKey: 'topDouble', reps: 2, pct: 148.5 / trainingMax, weight: 150, originalPct: 148.5 / trainingMax, originalWeight: 150, done: true, failed: false, skipped: false },
            { lift: 'Squat', labelKey: 'backoff', reps: 4, pct: 0.8, weight: 115, done: true, failed: false, skipped: false },
          ],
        }],
      } },
  ];

  const state = buildSmartLiftState({
    history,
    currentCycle: 3,
    lift: 'Squat',
    trainingMax,
    meetPlanReadiness: {
      Squat: {
        ready: true,
        readinessPhase: 'ready',
        attempts: { opener: 132.5, secondAttempt: 140, thirdAttempt: 148.5 },
      },
    },
  });

  const prescription = buildSmartLiftPrescription({ state, role: 'primary' });
  const topSet = prescription.sets.find(set => set.reps === 3);

  expect(topSet.weight).toBe(130);
  expect(prescription.regressionReason).toBe('ready-taper');
});
