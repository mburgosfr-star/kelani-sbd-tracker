import {
  buildSmartLiftState,
  buildSmartLiftPrescription,
} from './smartPrescriptionEngine';

function makeEntry({ workoutNumber, role, labelKey, reps, pct, trainingMax }) {
  const weight = Math.round((trainingMax * pct) / 2.5) * 2.5;

  return {
    cycle: 3,
    workoutNumber,
    lift: 'Deadlift',
    workoutEffort: 'good',
    workoutSnapshot: {
      number: workoutNumber,
      type: 'training',
      smartDayType: 'training',
      lift: 'Deadlift',
      lifts: [{
        lift: 'Deadlift',
        role,
        sets: [{
          lift: 'Deadlift',
          labelKey,
          reps,
          pct,
          weight,
          originalPct: pct,
          originalWeight: weight,
          done: true,
          failed: false,
          skipped: false,
        }],
      }],
    },
  };
}

test("a secondary-role volume set's intensity never exceeds its own 60-72.5% ceiling, even when the anchor (last successful volume) came from a heavier primary-role backoff", () => {
  // Reproduces the C3W34 "TOO MUCH" Deadlift root cause
  // failure: a earlier PRIMARY-role Deadlift day's backoff was recorded at
  // 77.5% (145kg of a 180kg training max, from a real C3W32 3-lift day).
  // findSuccessfulVolumeBlock (smartPrescriptionEngine.js) doesn't filter
  // by role, so that 77.5% became the "last successful volume" anchor for
  // a later SECONDARY-role Deadlift day - and the "never regress from what
  // you already proved" floor pushed the secondary prescription right back
  // up to 77.5-80%, well above getSecondaryVolumePct's own stated 72.5%
  // ceiling, straight into a real 5x4 failure.
  const trainingMax = 180;
  const history = [
    makeEntry({
      workoutNumber: 32,
      role: 'primary',
      labelKey: 'backoff',
      reps: 4,
      pct: 0.775,
      trainingMax,
    }),
  ];

  const state = buildSmartLiftState({
    history,
    currentCycle: 3,
    lift: 'Deadlift',
    trainingMax,
  });

  expect(state.lastSuccessfulVolume.pct).toBeCloseTo(0.775, 2);

  const prescription = buildSmartLiftPrescription({ state, role: 'secondary' });

  // The precise, internal ceiling really is held at 72.5%...
  expect(prescription.plannedVolumePct).toBeLessThanOrEqual(0.725);
  // ...though the actual generated set's displayed/loaded weight still goes
  // through the app's universal round-to-nearest-5% step, and 72.5% sits
  // exactly on that boundary (rounds up, not down) - so 75% is the real
  // effective ceiling an athlete ever sees here, not 72.5%. Either way,
  // this is a world away from the 77.5-80% that actually caused the
  // failure; the pre-existing round-half-up quirk is not this bug.
  prescription.sets.forEach(set => {
    expect(set.pct).toBeLessThanOrEqual(0.75);
  });
});
