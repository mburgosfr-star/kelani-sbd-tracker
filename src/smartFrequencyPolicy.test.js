import {
  constrainSmartWorkoutByFrequency,
  getSmartFrequencyPolicyDecision,
  isHeavySmartLiftBlock,
  roundBarbellWeight,
} from './smartFrequencyPolicy';
import { generateAccessoriesForWorkout } from './accessoryGeneration';

function makeLiftBlock(lift, heavy = false, setCount = 1) {
  return {
    lift,
    role: heavy ? 'primary' : 'secondary',
    sets: Array.from({ length: setCount }, (_, index) => ({
      id: `${lift}-${heavy ? 'heavy' : 'light'}-${index + 1}`,
      labelKey: heavy ? 'topDouble' : 'workSets',
      pct: heavy ? 0.825 : 0.725,
      reps: heavy ? 2 : 4,
    })),
  };
}

function addWorkout(history, cycle, workoutNumber, lifts = []) {
  if (lifts.length === 0) {
    history.push({
      cycle,
      workoutNumber,
      restDay: true,
      workoutSnapshot: { type: 'rest' },
    });
    return;
  }

  lifts.forEach(({ lift, heavy }) => {
    history.push({
      cycle,
      workoutNumber,
      lift,
      workoutSnapshot: {
        type: 'training',
        lifts: [makeLiftBlock(lift, heavy)],
      },
    });
  });
}

describe('barbell and meet rounding', () => {
  test.each([
    [100, 100],
    [101.2, 100],
    [102.4, 102.5],
    [102.5, 102.5],
    [107.4, 107.5],
    [107.5, 107.5],
  ])('rounds %s kg to %s kg for gym prescriptions', (input, expected) => {
    expect(roundBarbellWeight(input)).toBe(expected);
  });

  test('rounds upward to the next available 2.5 kg load', () => {
    expect(roundBarbellWeight(100.1, 'up')).toBe(102.5);
    expect(roundBarbellWeight(105, 'up')).toBe(105);
  });

  test('treats a top triple as heavy but 4x4 at 72.5% as light', () => {
    expect(isHeavySmartLiftBlock(makeLiftBlock('Squat', true))).toBe(true);
    expect(isHeavySmartLiftBlock(makeLiftBlock('Bench', false))).toBe(false);
  });
});

describe('Smart rolling seven-workout frequency policy', () => {
  test('C3W25 becomes recovery when Squat and Deadlift are both blocked', () => {
    const history = [];
    addWorkout(history, 3, 19, [{ lift: 'Bench', heavy: false }]);
    addWorkout(history, 3, 20, [
      { lift: 'Bench', heavy: true },
      { lift: 'Deadlift', heavy: false },
    ]);
    addWorkout(history, 3, 21);
    addWorkout(history, 3, 22, [
      { lift: 'Squat', heavy: false },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 23, [{ lift: 'Squat', heavy: true }]);
    addWorkout(history, 3, 24, [
      { lift: 'Squat', heavy: true },
      { lift: 'Deadlift', heavy: true },
    ]);

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 3,
      workoutNumber: 25,
      candidateWorkout: {
        number: 25,
        type: 'training',
        lift: 'Squat',
        lifts: [
          makeLiftBlock('Squat', false),
          makeLiftBlock('Deadlift', false),
        ],
      },
      availableWorkouts: [],
      currentIndex: 0,
    });

    expect(result.changed).toBe(true);
    expect(result.workout.type).toBe('rest');
    expect(result.workout.lifts).toEqual([]);
    expect(result.decision.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        lift: 'Squat',
        reasons: expect.arrayContaining(['rolling-window-maximum', 'consecutive-lift']),
      }),
      expect.objectContaining({
        lift: 'Deadlift',
        reasons: expect.arrayContaining(['rolling-window-maximum', 'consecutive-lift']),
      }),
    ]));
  });

  test('C3W26 builds complete heavy Bench beside light Deadlift', () => {
    const history = [];
    // Bench's own weekly heavy allocation is exactly 1 (maxHeavy) - keep it
    // light here so it still has real heavy capacity left for this
    // candidate to fill (a heavy W20 Bench would already exhaust that
    // single weekly slot, leaving no valid heavy substitute for anyone).
    addWorkout(history, 3, 20, [
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 21);
    addWorkout(history, 3, 22, [
      { lift: 'Squat', heavy: false },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 23, [
      { lift: 'Squat', heavy: true },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 24, [
      { lift: 'Squat', heavy: true },
      { lift: 'Deadlift', heavy: true },
    ]);
    addWorkout(history, 3, 25);

    const lightDeadlift = {
      ...makeLiftBlock('Deadlift', false, 3),
      warmups: [
        { id: 'deadlift-warmup-1', reps: 5, weight: 20, pct: 0.10 },
        { id: 'deadlift-warmup-2', reps: 5, weight: 70, pct: 0.40 },
        { id: 'deadlift-warmup-3', reps: 4, weight: 120, pct: 0.65 },
      ],
      smartPrescription: {
        role: 'secondary',
        volumeAnchorPct: 0.725,
        plannedVolumePct: 0.725,
        gridItemCount: 6,
      },
    };
    const supplementalBench = {
      lift: 'Bench',
      warmups: [
        { id: 'bench-warmup-1', reps: 5, weight: 20, pct: 0.20 },
        { id: 'bench-warmup-2', reps: 2, weight: 60, pct: 0.60 },
      ],
      sets: [
        {
          id: 'bench-top-single',
          labelKey: 'topSingle',
          reps: 1,
          weight: 90,
          originalWeight: 90,
          pct: 0.90,
          originalPct: 0.90,
        },
        {
          id: 'bench-old-backoff',
          labelKey: 'backoff',
          reps: 2,
          weight: 65,
          originalWeight: 65,
          pct: 0.65,
          originalPct: 0.65,
        },
      ],
    };
    const candidateWorkout = {
      number: 26,
      type: 'training',
      lift: 'Squat',
      lifts: [
        makeLiftBlock('Squat', false, 4),
        lightDeadlift,
      ],
      smartTrainingSelectionSummary: {
        primaryLift: 'Squat',
        secondaryLift: 'Deadlift',
      },
    };
    const availableWorkouts = [
      candidateWorkout,
      {
        number: 27,
        type: 'training',
        lift: 'Bench',
        lifts: [supplementalBench],
      },
    ];

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 3,
      workoutNumber: 26,
      candidateWorkout,
      availableWorkouts,
      currentIndex: 0,
    });

    expect(result.workout.type).toBe('training');
    expect(result.workout.lifts.map(({ lift }) => lift))
      .toEqual(['Bench', 'Deadlift']);
    expect(result.workout.lift).toBe('Bench');

    const bench = result.workout.lifts[0];
    expect(bench.role).toBe('primary');
    expect(bench.warmups.map(({ weight, reps }) => [weight, reps]))
      .toEqual([[20, 5], [70, 3]]);
    // Backoff mirrors the primary-role formula while respecting the shared
    // 75% recoverability ceiling.
    expect(bench.sets.map(({ weight, reps }) => [weight, reps]))
      .toEqual([
        [90, 1],
        [75, 5],
        [75, 5],
        [75, 5],
      ]);
    expect(bench.smartPrescription).toMatchObject({
      role: 'primary',
      topSetAnchorPct: 0.90,
      volumeAnchorPct: 0.75,
      plannedVolumePct: 0.75,
      gridItemCount: 6,
    });

    const deadlift = result.workout.lifts[1];
    expect(deadlift.role).toBe('secondary');
    expect(deadlift.sets).toHaveLength(3);
    expect(deadlift.warmups[2]).toMatchObject({
      weight: 120,
      reps: 5,
    });

    expect(result.summary.supplementedLifts).toEqual(['Bench']);
    // Accessory finalization must follow the new primary lift, even though
    // frequency replacement has cleared the old candidate's accessories.
    expect(result.workout.accessories).toEqual([]);
    const finalAccessories = generateAccessoriesForWorkout(result.workout, {
      accessoryMode: 'standard', oneRMs: { Squat: 150, Bench: 100, Deadlift: 200 }, smart: true,
    });
    expect(finalAccessories.map(item => item.key)).toEqual(['row', 'legExtension']);
    expect(result.summary.countsAfter.Bench).toEqual({
      total: 4,
      heavy: 1,
      light: 3,
    });
    expect(result.summary.countsAfter.Deadlift).toEqual({
      total: 2,
      heavy: 1,
      light: 1,
    });
    expect(result.workout.smartTrainingSelectionSummary.primaryLift)
      .toBe('Bench');
    expect(result.workout.smartTrainingSelectionSummary.secondaryLift)
      .toBe('Deadlift');
  });

  test('a supplemental heavy Bench day uses the athlete\'s current real training max, not the static template\'s frozen numbers', () => {
    const history = [];
    // Bench's own weekly heavy allocation is exactly 1 (maxHeavy) - keep it
    // light here so it still has real heavy capacity left for this
    // candidate to fill.
    addWorkout(history, 3, 20, [
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 21);
    addWorkout(history, 3, 22, [
      { lift: 'Squat', heavy: false },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 23, [
      { lift: 'Squat', heavy: true },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 24, [
      { lift: 'Squat', heavy: true },
      { lift: 'Deadlift', heavy: true },
    ]);
    addWorkout(history, 3, 25);

    const lightDeadlift = {
      ...makeLiftBlock('Deadlift', false, 3),
      warmups: [
        { id: 'deadlift-warmup-1', reps: 5, weight: 20, pct: 0.10 },
        { id: 'deadlift-warmup-2', reps: 5, weight: 70, pct: 0.40 },
        { id: 'deadlift-warmup-3', reps: 4, weight: 120, pct: 0.65 },
      ],
      smartPrescription: {
        role: 'secondary',
        volumeAnchorPct: 0.725,
        plannedVolumePct: 0.725,
        gridItemCount: 6,
      },
    };
    const supplementalBench = {
      lift: 'Bench',
      warmups: [
        { id: 'bench-warmup-1', reps: 5, weight: 20, pct: 0.20 },
        { id: 'bench-warmup-2', reps: 2, weight: 60, pct: 0.60 },
      ],
      sets: [
        {
          id: 'bench-top-single',
          labelKey: 'topSingle',
          reps: 1,
          weight: 90,
          originalWeight: 90,
          pct: 0.90,
          originalPct: 0.90,
        },
        {
          id: 'bench-old-backoff',
          labelKey: 'backoff',
          reps: 2,
          weight: 65,
          originalWeight: 65,
          pct: 0.65,
          originalPct: 0.65,
        },
      ],
    };
    const candidateWorkout = {
      number: 26,
      type: 'training',
      lift: 'Squat',
      lifts: [
        makeLiftBlock('Squat', false, 4),
        lightDeadlift,
      ],
      smartTrainingSelectionSummary: {
        primaryLift: 'Squat',
        secondaryLift: 'Deadlift',
      },
    };
    const availableWorkouts = [
      candidateWorkout,
      {
        number: 27,
        type: 'training',
        lift: 'Bench',
        lifts: [supplementalBench],
      },
    ];

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 3,
      workoutNumber: 26,
      candidateWorkout,
      availableWorkouts,
      currentIndex: 0,
      // Bench has progressed since the static template was built (it no
      // longer implies ~97.5-100 kg) - the supplemental block should reflect
      // that current training max, not the template's frozen 90/75 kg.
      trainingMaxes: { Squat: 145, Bench: 110, Deadlift: 180 },
    });

    const bench = result.workout.lifts[0];
    expect(bench.lift).toBe('Bench');
    // 110 * 0.90 = 99, rounded to the nearest 2.5 kg (the barbell increment
    // used everywhere in Smart Training) is 100 kg. The backoff now mirrors
    // the primary-role formula with its 75% ceiling, i.e. 110 * 0.75 = 82.5,
    // already is 82.5 kg rather than retaining the template's stale load.
    expect(bench.sets.map(({ weight, reps }) => [weight, reps]))
      .toEqual([
        [100, 1],
        [82.5, 5],
        [82.5, 5],
        [82.5, 5],
      ]);
  });

  test('a supplemental heavy Squat day is corrected from the real training max too, not just Bench', () => {
    const history = [];
    addWorkout(history, 3, 20, [{ lift: 'Bench', heavy: true }]);
    addWorkout(history, 3, 21, [{ lift: 'Deadlift', heavy: true }]);
    addWorkout(history, 3, 22, [{ lift: 'Bench', heavy: false }]);
    addWorkout(history, 3, 23, [{ lift: 'Deadlift', heavy: false }]);
    addWorkout(history, 3, 24, [{ lift: 'Bench', heavy: true }]);
    addWorkout(history, 3, 25);

    const candidateWorkout = {
      number: 26,
      type: 'training',
      lift: 'Bench',
      lifts: [makeLiftBlock('Bench', false, 3)],
      smartTrainingSelectionSummary: { primaryLift: 'Bench', secondaryLift: null },
    };
    // Built as if Squat's max was ~100 kg at generation time (100*0.85=85).
    const staleSquatBlock = {
      lift: 'Squat',
      warmups: [
        { id: 'squat-warmup-1', reps: 5, weight: 20, pct: 0.2 },
        { id: 'squat-warmup-2', reps: 3, weight: 70, pct: 0.7 },
      ],
      sets: [
        {
          id: 'squat-top', labelKey: 'topDouble', reps: 2,
          weight: 85, originalWeight: 85, pct: 0.85, originalPct: 0.85,
        },
        {
          id: 'squat-backoff', labelKey: 'backoff', reps: 4,
          weight: 70, originalWeight: 70, pct: 0.70, originalPct: 0.70,
        },
      ],
    };
    const availableWorkouts = [
      candidateWorkout,
      { number: 27, type: 'training', lift: 'Squat', lifts: [staleSquatBlock] },
    ];

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 3,
      workoutNumber: 26,
      candidateWorkout,
      availableWorkouts,
      currentIndex: 0,
      // The athlete's real Squat max has since climbed well past the
      // template's implied ~100 kg.
      trainingMaxes: { Squat: 145, Bench: 97.5, Deadlift: 180 },
    });

    const squat = result.workout.lifts.find(({ lift }) => lift === 'Squat');
    expect(squat).toBeTruthy();
    expect(squat.frequencyRole).toBe('supplemental-heavy');
    // 145 * 0.85 = 123.25, rounded to the nearest 2.5 kg is 122.5 kg - not the
    // template's stale 85 kg.
    expect(squat.sets[0]).toMatchObject({ weight: 122.5, pct: 0.85 });
  });

  test("a supplemental heavy lift's backoff scales with its own top intensity instead of a flat 75%", () => {
    // Regression boundary: a supplemented Bench day showed a 55kg/54% backoff next
    // to a much heavier top set - the backoff was hardcoded to a flat 75% of
    // training max regardless of how heavy the top single actually was,
    // instead of scaling with it like every other Smart Training backoff
    // does (topPct - 10%, clamped 60-80%). An 80% top single should produce
    // a 70% backoff here - neither the old flat 75%, nor the 80% ceiling
    // that a 90%+ top single would clamp to (covered by the tests above).
    const history = [];
    addWorkout(history, 3, 20, [{ lift: 'Squat', heavy: true }]);
    addWorkout(history, 3, 21, [{ lift: 'Deadlift', heavy: true }]);
    addWorkout(history, 3, 22, [{ lift: 'Squat', heavy: false }]);
    addWorkout(history, 3, 23, [{ lift: 'Deadlift', heavy: false }]);
    addWorkout(history, 3, 24, [{ lift: 'Squat', heavy: true }]);
    addWorkout(history, 3, 25);

    const candidateWorkout = {
      number: 26,
      type: 'training',
      lift: 'Squat',
      lifts: [makeLiftBlock('Squat', false, 3)],
      smartTrainingSelectionSummary: { primaryLift: 'Squat', secondaryLift: null },
    };
    const supplementalBench = {
      lift: 'Bench',
      warmups: [
        { id: 'bench-warmup-1', reps: 5, weight: 20, pct: 0.20 },
        { id: 'bench-warmup-2', reps: 2, weight: 60, pct: 0.60 },
      ],
      sets: [
        {
          id: 'bench-top-single', labelKey: 'topSingle', reps: 1,
          weight: 80, originalWeight: 80, pct: 0.80, originalPct: 0.80,
        },
        {
          id: 'bench-old-backoff', labelKey: 'backoff', reps: 5,
          weight: 55, originalWeight: 55, pct: 0.55, originalPct: 0.55,
        },
      ],
    };
    const availableWorkouts = [
      candidateWorkout,
      { number: 27, type: 'training', lift: 'Bench', lifts: [supplementalBench] },
    ];

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 3,
      workoutNumber: 26,
      candidateWorkout,
      availableWorkouts,
      currentIndex: 0,
      trainingMaxes: { Squat: 145, Bench: 100, Deadlift: 180 },
    });

    const bench = result.workout.lifts.find(({ lift }) => lift === 'Bench');
    expect(bench).toBeTruthy();
    expect(bench.sets[0]).toMatchObject({ weight: 80, pct: 0.80 });
    expect(bench.sets.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ weight: 70, pct: 0.70 }),
      ])
    );
    expect(bench.smartPrescription).toMatchObject({
      volumeAnchorPct: 0.70,
      plannedVolumePct: 0.70,
    });
  });

  test('a supplemental block whose template top set is a double/triple (not a literal single) is still corrected', () => {
    const history = [];
    addWorkout(history, 3, 20, [{ lift: 'Squat', heavy: true }]);
    addWorkout(history, 3, 21, [{ lift: 'Deadlift', heavy: true }]);
    addWorkout(history, 3, 22, [{ lift: 'Squat', heavy: false }]);
    addWorkout(history, 3, 23, [{ lift: 'Deadlift', heavy: false }]);
    addWorkout(history, 3, 24, [{ lift: 'Squat', heavy: true }]);
    addWorkout(history, 3, 25);

    const candidateWorkout = {
      number: 26,
      type: 'training',
      lift: 'Squat',
      lifts: [makeLiftBlock('Squat', false, 3)],
      smartTrainingSelectionSummary: { primaryLift: 'Squat', secondaryLift: null },
    };
    // A real template block shaped like "Ultra Bench Strength": a topDouble,
    // not a literal 1-rep single - built as if Bench's max was ~70 kg.
    const staleBenchBlock = {
      lift: 'Bench',
      warmups: [
        { id: 'bench-warmup-1', reps: 5, weight: 20, pct: 0.2 },
        { id: 'bench-warmup-2', reps: 3, weight: 40, pct: 0.6 },
      ],
      sets: [
        {
          id: 'bench-top', labelKey: 'topDouble', reps: 2,
          weight: 60, originalWeight: 60, pct: 0.825, originalPct: 0.825,
        },
        {
          id: 'bench-backoff', labelKey: 'backoff', reps: 4,
          weight: 50, originalWeight: 50, pct: 0.725, originalPct: 0.725,
        },
      ],
    };
    const availableWorkouts = [
      candidateWorkout,
      { number: 27, type: 'training', lift: 'Bench', lifts: [staleBenchBlock] },
    ];

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 3,
      workoutNumber: 26,
      candidateWorkout,
      availableWorkouts,
      currentIndex: 0,
      trainingMaxes: { Squat: 145, Bench: 97.5, Deadlift: 180 },
    });

    const bench = result.workout.lifts.find(({ lift }) => lift === 'Bench');
    expect(bench).toBeTruthy();
    expect(bench.frequencyRole).toBe('supplemental-heavy');
    // Precise 0.825 stays on the 2.5% step, then 97.5 * 0.825 = 80.4375,
    // rounded to the nearest 2.5 kg is 80 kg - not the stale template load.
    expect(bench.sets[0]).toMatchObject({ weight: 80, pct: 0.825 });
  });

  test('a fallback single light Deadlift receives six real work sets', () => {
    const history = [];
    addWorkout(history, 3, 20, [
      { lift: 'Bench', heavy: true },
    ]);
    addWorkout(history, 3, 21);
    addWorkout(history, 3, 22, [
      { lift: 'Squat', heavy: false },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 23, [
      { lift: 'Squat', heavy: true },
      { lift: 'Bench', heavy: false },
    ]);
    addWorkout(history, 3, 24, [
      { lift: 'Squat', heavy: true },
      { lift: 'Deadlift', heavy: true },
    ]);
    addWorkout(history, 3, 25);

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 3,
      workoutNumber: 26,
      candidateWorkout: {
        number: 26,
        type: 'training',
        lift: 'Squat',
        lifts: [
          makeLiftBlock('Squat', false, 4),
          {
            ...makeLiftBlock('Deadlift', false, 3),
            reason: 'Lower volume for the secondary lift.',
          },
        ],
      },
      availableWorkouts: [],
      currentIndex: 0,
    });

    expect(result.workout.lifts.map(({ lift }) => lift)).toEqual(['Deadlift']);
    expect(result.workout.lifts[0].sets).toHaveLength(6);
    expect(result.workout.sets).toHaveLength(6);
    expect(result.workout.lifts[0].reason)
      .toBe('Full volume for single-lift training.');
    expect(result.summary.singleLiftVolumeExpanded).toBe(true);
  });

  test('never permits consecutive Squat or Deadlift', () => {
    const history = [];
    addWorkout(history, 1, 1, [
      { lift: 'Squat', heavy: false },
      { lift: 'Deadlift', heavy: false },
    ]);

    const decision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lifts: [
          makeLiftBlock('Squat', true),
          makeLiftBlock('Deadlift', true),
        ],
      },
    });

    expect(decision.validLiftBlocks).toHaveLength(0);
    expect(decision.blockers.every(({ reasons }) => reasons.includes('consecutive-lift'))).toBe(true);
  });

  test('permits consecutive Bench only when the second exposure is light', () => {
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Bench', heavy: true }]);

    const heavyDecision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Bench', true)],
      },
    });
    const lightDecision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Bench', false)],
      },
    });

    expect(heavyDecision.validLiftBlocks).toHaveLength(0);
    expect(heavyDecision.blockers[0].reasons).toContain('consecutive-heavy-lift');
    expect(lightDecision.validLiftBlocks).toHaveLength(1);
  });

  test('enforces 3/4/2 totals and heavy-light caps', () => {
    const history = [];
    addWorkout(history, 1, 1, [
      { lift: 'Squat', heavy: true },
      { lift: 'Bench', heavy: true },
    ]);
    addWorkout(history, 1, 2, [
      { lift: 'Bench', heavy: false },
      { lift: 'Deadlift', heavy: true },
    ]);
    addWorkout(history, 1, 3);
    addWorkout(history, 1, 4, [
      { lift: 'Squat', heavy: false },
      { lift: 'Deadlift', heavy: false },
    ]);
    addWorkout(history, 1, 5, [{ lift: 'Bench', heavy: true }]);
    addWorkout(history, 1, 6, [
      { lift: 'Squat', heavy: true },
      { lift: 'Bench', heavy: false },
    ]);

    const decision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 7,
      candidateWorkout: {
        type: 'training',
        lifts: [
          makeLiftBlock('Squat', false),
          makeLiftBlock('Bench', false),
          makeLiftBlock('Deadlift', false),
        ],
      },
    });

    expect(decision.validLiftBlocks).toHaveLength(0);
    expect(decision.blockers.map(({ lift }) => lift).sort()).toEqual(
      ['Bench', 'Deadlift', 'Squat'],
    );
  });

  test('filters an invalid lift but keeps a valid lift from the same workout', () => {
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Squat', heavy: false }]);

    const result = constrainSmartWorkoutByFrequency({
      history,
      currentCycle: 1,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lift: 'Squat',
        lifts: [
          makeLiftBlock('Squat', true),
          makeLiftBlock('Bench', false, 3),
        ],
        accessories: [{ name: 'example' }],
      },
      availableWorkouts: [],
      currentIndex: 0,
    });

    expect(result.workout.type).toBe('training');
    expect(result.workout.lift).toBe('Bench');
    expect(result.workout.lifts.map(({ lift }) => lift)).toEqual(['Bench']);
    expect(result.workout.lifts[0].sets).toHaveLength(6);
    expect(result.workout.accessories).toEqual([]);
  });

  test('a rest workout breaks the consecutive restriction', () => {
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Squat', heavy: true }]);
    addWorkout(history, 1, 2);

    const decision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 3,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Squat', false)],
      },
    });

    expect(decision.validLiftBlocks).toHaveLength(1);
  });

  test('keeps rolling order correct across cycle boundaries', () => {
    const history = [];
    addWorkout(history, 1, 31, [{ lift: 'Deadlift', heavy: true }]);
    addWorkout(history, 2, 1);

    const decision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 2,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Deadlift', false)],
      },
    });

    expect(decision.validLiftBlocks).toHaveLength(1);
  });
});

describe('athlete-level frequency tiers', () => {
  test('intermediate tier matches the default (no athleteLevel) behavior', () => {
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Deadlift', heavy: false }]);

    const withoutLevel = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Deadlift', false)],
      },
    });
    const withIntermediate = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 2,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Deadlift', false)],
      },
      athleteLevel: 'intermediate',
    });

    expect(withIntermediate.validLiftBlocks).toHaveLength(withoutLevel.validLiftBlocks.length);
    expect(withIntermediate.blockers).toEqual(withoutLevel.blockers);
  });

  test('beginner tier never allows a light Deadlift day (always heavy)', () => {
    const decision = getSmartFrequencyPolicyDecision({
      history: [],
      currentCycle: 1,
      workoutNumber: 1,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Deadlift', false)],
      },
      athleteLevel: 'beginner',
    });

    expect(decision.validLiftBlocks).toHaveLength(0);
    expect(decision.blockers).toEqual([
      expect.objectContaining({ lift: 'Deadlift', reasons: ['light-maximum'] }),
    ]);

    const heavyDecision = getSmartFrequencyPolicyDecision({
      history: [],
      currentCycle: 1,
      workoutNumber: 1,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Deadlift', true)],
      },
      athleteLevel: 'beginner',
    });

    expect(heavyDecision.validLiftBlocks).toHaveLength(1);
  });

  test('beginner tier caps Squat at 2 and Bench at 3 total exposures per rolling window', () => {
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Squat', heavy: true }]);
    addWorkout(history, 1, 2, [{ lift: 'Squat', heavy: false }]);
    addWorkout(history, 1, 3, [{ lift: 'Bench', heavy: true }]);
    addWorkout(history, 1, 4, [{ lift: 'Bench', heavy: false }]);
    addWorkout(history, 1, 5, [{ lift: 'Bench', heavy: false }]);

    const decision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 6,
      candidateWorkout: {
        type: 'training',
        lifts: [
          makeLiftBlock('Squat', false),
          makeLiftBlock('Bench', false),
        ],
      },
      athleteLevel: 'beginner',
    });

    expect(decision.validLiftBlocks).toHaveLength(0);
    expect(decision.blockers.map(({ lift, reasons }) => ({ lift, reasons }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lift: 'Squat', reasons: expect.arrayContaining(['rolling-window-maximum']) }),
        expect.objectContaining({ lift: 'Bench', reasons: expect.arrayContaining(['rolling-window-maximum']) }),
      ]),
    );
  });

  test('a 2nd heavy Bench in the same window is blocked at every level - only one heavy exposure/week is ever allowed', () => {
    // The frequency-score table caps every lift at exactly 1 heavy
    // exposure per week regardless of level - only the medium/light
    // allowance grows with experience (maxHeavy used to scale up to 3-4 at
    // higher levels here, which let a lift go heavy again far sooner than
    // the athlete's own approved weekly mix intended - see the C3W36/37
    // real report, where a similar stale cap let Deadlift sneak back into
    // heavy contention after already using its one weekly heavy turn).
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Bench', heavy: true }]);
    addWorkout(history, 1, 2, []);

    ['intermediate', 'advanced', 'elite'].forEach(athleteLevel => {
      const decision = getSmartFrequencyPolicyDecision({
        history,
        currentCycle: 1,
        workoutNumber: 3,
        candidateWorkout: {
          type: 'training',
          lifts: [makeLiftBlock('Bench', true)],
        },
        athleteLevel,
      });

      expect(decision.validLiftBlocks).toHaveLength(0);
      expect(decision.blockers).toEqual([
        expect.objectContaining({ lift: 'Bench', reasons: expect.arrayContaining(['heavy-maximum']) }),
      ]);
    });
  });

  test('higher levels allow more total (light) Bench sessions per week, not more heavy ones', () => {
    // Intermediate Bench's weekly mix is 1 heavy + 1 medium + 2 light (4
    // total, maxLight=3 in this binary heavy/light policy). Advanced's mix
    // is 1 heavy + 2 medium + 2 light (5 total, maxLight=4). With 3 light
    // exposures already banked, a 4th is still within advanced's room but
    // exceeds intermediate's - the extra weekly capacity higher levels get
    // shows up as more allowed light exposures, not a higher heavy cap
    // (see the previous test).
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Bench', heavy: true }]);
    addWorkout(history, 1, 3, [{ lift: 'Bench', heavy: false }]);
    addWorkout(history, 1, 5, [{ lift: 'Bench', heavy: false }]);
    addWorkout(history, 1, 7, [{ lift: 'Bench', heavy: false }]);

    const intermediateDecision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 9,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Bench', false)],
      },
      athleteLevel: 'intermediate',
    });

    expect(intermediateDecision.validLiftBlocks).toHaveLength(0);
    expect(intermediateDecision.blockers).toEqual([
      expect.objectContaining({ lift: 'Bench', reasons: expect.arrayContaining(['light-maximum']) }),
    ]);

    const advancedDecision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 9,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Bench', false)],
      },
      athleteLevel: 'advanced',
    });

    expect(advancedDecision.validLiftBlocks).toHaveLength(1);
  });

  test('elite tier keeps Deadlift capped the same as advanced (max 2 heavy, 3 total)', () => {
    const history = [];
    addWorkout(history, 1, 1, [{ lift: 'Deadlift', heavy: true }]);
    addWorkout(history, 1, 2, [{ lift: 'Deadlift', heavy: true }]);

    const decision = getSmartFrequencyPolicyDecision({
      history,
      currentCycle: 1,
      workoutNumber: 3,
      candidateWorkout: {
        type: 'training',
        lifts: [makeLiftBlock('Deadlift', true)],
      },
      athleteLevel: 'elite',
    });

    expect(decision.validLiftBlocks).toHaveLength(0);
    expect(decision.blockers).toEqual([
      expect.objectContaining({ lift: 'Deadlift', reasons: expect.arrayContaining(['heavy-maximum']) }),
    ]);
  });
});
