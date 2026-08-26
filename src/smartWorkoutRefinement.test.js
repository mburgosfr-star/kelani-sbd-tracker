import {
  getSmartMeetdayBlockerDisplayLabels,
  getSmartModalDetailRows,
} from './App';
import {
  buildSmartMeetAttemptSets,
  buildSmartMeetWarmups,
  generateWorkoutsForTrainingModel,
  hasEffectiveSmartTrainingStimulus,
  isHeavySmartTrainingLift,
  isMaximalSmartTrainingLift,
  isUltraLightSmartTrainingCandidate,
  repeatsHeavyPrimaryLift,
  violatesSmartTrainingSafety,
} from './smartTrainingEngine';
import { applyAccessoryPlanToWorkouts } from './accessoryGeneration';
import { generateUltraProgram } from './classicProgramTemplates';

test('meet warm-ups prepare the opener with the requested SBD ladders', () => {
  expect(buildSmartMeetWarmups(37.5, 'Squat')).toEqual([
    { reps: 5, weight: 20, originalWeight: 20, done: false },
  ]);
  expect(buildSmartMeetWarmups(30, 'Bench')).toEqual([
    { reps: 5, weight: 20, originalWeight: 20, done: false },
  ]);
  expect(buildSmartMeetWarmups(55, 'Deadlift')).toEqual([
    { reps: 5, weight: 20, originalWeight: 20, done: false },
    { reps: 3, weight: 40, originalWeight: 40, done: false },
  ]);
  expect(buildSmartMeetWarmups(135, 'Squat')).toEqual([
    { reps: 5, weight: 20, originalWeight: 20, done: false },
    { reps: 3, weight: 70, originalWeight: 70, done: false },
    { reps: 1, weight: 120, originalWeight: 120, done: false },
  ]);
  expect(buildSmartMeetWarmups(90, 'Bench')).toEqual([
    { reps: 5, weight: 20, originalWeight: 20, done: false },
    { reps: 3, weight: 70, originalWeight: 70, done: false },
    { reps: 1, weight: 80, originalWeight: 80, done: false },
  ]);
  expect(buildSmartMeetWarmups(165, 'Deadlift')).toEqual([
    { reps: 5, weight: 20, originalWeight: 20, done: false },
    { reps: 5, weight: 70, originalWeight: 70, done: false },
    { reps: 3, weight: 120, originalWeight: 120, done: false },
    { reps: 1, weight: 150, originalWeight: 150, done: false },
  ]);
  expect(buildSmartMeetWarmups(175, 'Deadlift')).toEqual([
    { reps: 5, weight: 20, originalWeight: 20, done: false },
    { reps: 5, weight: 70, originalWeight: 70, done: false },
    { reps: 3, weight: 120, originalWeight: 120, done: false },
    { reps: 1, weight: 160, originalWeight: 160, done: false },
  ]);
});

test('meet attempts use readiness rather than the stale template and remain strictly increasing', () => {
  const sets = buildSmartMeetAttemptSets('Bench', {
    meetPlanReadiness: {
      Bench: {
        attempts: { opener: 88, secondAttempt: 95, thirdAttempt: 100 },
      },
    },
  }, [
    { labelKey: 'opener', weight: 90 },
    { labelKey: 'secondAttempt', weight: 100 },
    { labelKey: 'thirdAttempt', weight: 100 },
  ]);

  expect(sets.map(set => set.weight)).toEqual([87.5, 95, 100]);
  expect(sets.map(set => set.pct)).toEqual([0.9, 0.975, 1.025]);
});

test('rejects a 90% Bench single with only one double as normal training', () => {
  const workout = {
    type: 'training',
    label: 'Ultra Bench Opener',
    lifts: [{
      lift: 'Bench',
      sets: [
        { labelKey: 'opener', reps: 1, pct: 0.9 },
        { labelKey: 'backoff', reps: 2, pct: 0.65 },
      ],
    }],
  };

  expect(hasEffectiveSmartTrainingStimulus(workout)).toBe(false);
});

test('accepts a prepared Bench single with four real backoff sets', () => {
  const workout = {
    type: 'training',
    lifts: [{
      lift: 'Bench',
      sets: [
        { labelKey: 'topSingle', reps: 1, pct: 0.875 },
        { labelKey: 'backoff', reps: 5, pct: 0.7 },
        { labelKey: 'backoff', reps: 5, pct: 0.7 },
        { labelKey: 'backoff', reps: 5, pct: 0.7 },
        { labelKey: 'backoff', reps: 5, pct: 0.7 },
      ],
    }],
  };

  expect(hasEffectiveSmartTrainingStimulus(workout)).toBe(true);
});

test('classifies two triples at 50% as ultra-light rather than real training', () => {
  const workout = {
    type: 'training',
    lifts: [
      {
        lift: 'Squat',
        sets: [
          { reps: 3, pct: 0.5 },
          { reps: 3, pct: 0.5 },
        ],
      },
      {
        lift: 'Bench',
        sets: [
          { reps: 3, pct: 0.5 },
          { reps: 3, pct: 0.5 },
        ],
      },
    ],
  };

  expect(isUltraLightSmartTrainingCandidate(workout)).toBe(true);
});

test('generates a beginner Deadlift 80/70 prescription consistently from a 60 kg max', () => {
  const workouts = generateUltraProgram(42.5, 32.5, 60);
  const workout = workouts.find(
    item => item.label === 'Ultra Deadlift + Bench Volume'
  );

  expect(workout).toBeTruthy();

  const deadlift = workout.lifts.find(item => item.lift === 'Deadlift');

  expect(deadlift.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    pct: 0.8,
    weight: 47.5,
    originalPct: 0.8,
    originalWeight: 47.5,
  });

  deadlift.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.7,
      weight: 42.5,
      originalPct: 0.7,
      originalWeight: 42.5,
    });
  });
});

test('regenerates future main-lift weights from the current 1RM', () => {
  const staleFutureWorkout = {
    number: 7,
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      warmups: [],
      sets: [
        {
          labelKey: 'topDouble',
          reps: 2,
          pct: 0.8,
          weight: 57.5,
          originalPct: 0.8,
          originalWeight: 57.5,
          adjustedFromOriginal: true,
          done: false,
        },
        {
          labelKey: 'backoff',
          reps: 3,
          pct: 0.7,
          weight: 42.5,
          originalPct: 0.7,
          originalWeight: 42.5,
          done: false,
        },
      ],
    }],
    accessories: [],
    cooldownItems: [],
  };

  const regeneratedWorkout = {
    number: 7,
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      warmups: [],
      sets: [
        {
          labelKey: 'topDouble',
          reps: 2,
          pct: 0.8,
          weight: 47.5,
          originalPct: 0.8,
          originalWeight: 47.5,
          done: false,
        },
        {
          labelKey: 'backoff',
          reps: 3,
          pct: 0.7,
          weight: 42.5,
          originalPct: 0.7,
          originalWeight: 42.5,
          done: false,
        },
      ],
    }],
    accessories: [],
    cooldownItems: [],
  };

  const [merged] = applyAccessoryPlanToWorkouts(
    [staleFutureWorkout],
    [regeneratedWorkout],
    new Set(),
    6
  );

  expect(merged.lifts[0].sets[0]).toMatchObject({
    weight: 47.5,
    pct: 0.8,
    originalWeight: 47.5,
    originalPct: 0.8,
  });

  expect(merged.lifts[0].sets[1]).toMatchObject({
    weight: 42.5,
    pct: 0.7,
  });
});

test('preserves begun set progress only for the active workout', () => {
  const currentWorkout = {
    number: 7,
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      warmups: [],
      sets: [{
        labelKey: 'topDouble',
        reps: 2,
        pct: 0.8,
        weight: 50,
        originalPct: 0.8,
        originalWeight: 47.5,
        adjustedFromOriginal: true,
        done: true,
        effort: 'good',
      }],
    }],
    accessories: [],
    cooldownItems: [],
  };

  const regeneratedWorkout = {
    number: 7,
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      warmups: [],
      sets: [{
        labelKey: 'topDouble',
        reps: 2,
        pct: 0.8,
        weight: 47.5,
        originalPct: 0.8,
        originalWeight: 47.5,
        done: false,
      }],
    }],
    accessories: [],
    cooldownItems: [],
  };

  const [merged] = applyAccessoryPlanToWorkouts(
    [currentWorkout],
    [regeneratedWorkout],
    new Set(),
    7
  );

  expect(merged.lifts[0].sets[0]).toMatchObject({
    weight: 50,
    originalWeight: 47.5,
    done: true,
    effort: 'good',
  });
});

test('preserves a begun accessory plan when the active workout regenerates', () => {
  const currentWorkout = {
    number: 7,
    type: 'training',
    lifts: [],
    accessories: [{
      key: 'machineCrunch',
      weights: [20, 20, 20],
      originalWeights: [20, 20, 20],
      done: [true, false, false],
    }],
    cooldownItems: [],
  };
  const regeneratedWorkout = {
    ...currentWorkout,
    accessories: [{
      key: 'plank',
      bodyweight: true,
      durationSeconds: 30,
      weights: [0, 0, 0],
      originalWeights: [0, 0, 0],
      done: [false, false, false],
    }],
  };

  const [activeMerged] = applyAccessoryPlanToWorkouts(
    [currentWorkout],
    [regeneratedWorkout],
    new Set(),
    7
  );
  const [futureMerged] = applyAccessoryPlanToWorkouts(
    [currentWorkout],
    [regeneratedWorkout],
    new Set(),
    6
  );

  expect(activeMerged.accessories).toEqual(currentWorkout.accessories);
  expect(futureMerged.accessories[0].key).toBe('plank');
});


test('gives Ultra Bench Strength three Deadlift work sets', () => {
  const workouts = generateUltraProgram(145, 100, 180);
  const workout = workouts.find(item => item.label === 'Ultra Bench Strength');
  const deadlift = workout.lifts.find(item => item.lift === 'Deadlift');

  expect(deadlift.sets).toHaveLength(3);

  deadlift.sets.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'workSets',
      reps: 3,
      pct: 0.625,
      weight: 112.5,
    });
  });
});

test('uses four-rep volume work at 70% after the Deadlift top double', () => {
  const workouts = generateUltraProgram(145, 100, 180);
  const workout = workouts.find(
    item => item.label === 'Ultra Deadlift + Bench Volume'
  );

  expect(workout).toBeTruthy();

  const deadlift = workout.lifts.find(item => item.lift === 'Deadlift');
  const bench = workout.lifts.find(item => item.lift === 'Bench');

  expect(deadlift.sets).toHaveLength(5);
  expect(deadlift.sets[0]).toMatchObject({
    labelKey: 'topDouble',
    reps: 2,
    pct: 0.8,
  });

  expect(deadlift.sets.slice(1)).toHaveLength(4);
  deadlift.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.7,
    });
  });

  expect(bench.sets).toHaveLength(4);
  bench.sets.forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'workSets',
      reps: 4,
      pct: 0.7,
    });
  });
});


test('gives the Ultra Squat Opener a full four-by-four backoff block', () => {
  const workouts = generateUltraProgram(145, 100, 180);
  const workout = workouts.find(item => item.label === 'Ultra Squat Opener');

  expect(workout).toBeTruthy();

  const squat = workout.lifts.find(item => item.lift === 'Squat');

  expect(squat.sets).toHaveLength(5);
  expect(squat.sets[0]).toMatchObject({
    labelKey: 'topSingle',
    reps: 1,
    pct: 0.9,
  });

  squat.sets.slice(1).forEach(set => {
    expect(set).toMatchObject({
      labelKey: 'backoff',
      reps: 4,
      pct: 0.7,
    });
  });
});


test('blocks the previous HARD primary lift only when it is heavy again', () => {
  const readiness = {
    lastWorkoutEffort: 'hard',
    lastWorkoutPrimaryLift: 'Deadlift',
  };

  const repeatedHeavyDeadlift = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      sets: [{ labelKey: 'topDouble', reps: 2, pct: 0.8 }],
    }],
  };
  const lightDeadlift = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      sets: [{ labelKey: 'workSets', reps: 4, pct: 0.7 }],
    }],
  };
  const heavySquat = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'topSingle', reps: 1, pct: 0.9 }],
    }],
  };

  expect(repeatsHeavyPrimaryLift(repeatedHeavyDeadlift, readiness)).toBe(true);
  expect(repeatsHeavyPrimaryLift(lightDeadlift, readiness)).toBe(false);
  expect(repeatsHeavyPrimaryLift(heavySquat, readiness)).toBe(false);
});


test('recognizes a 90% squat opener as maximal squat training', () => {
  const workout = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'opener', reps: 1, pct: 0.9 }],
    }],
  };

  expect(isMaximalSmartTrainingLift(workout, 'Squat')).toBe(true);
});

test('blocks heavy Deadlift directly after a heavy Deadlift training day', () => {
  const candidate = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      sets: [{ labelKey: 'topDouble', reps: 2, pct: 0.8 }],
    }],
  };

  expect(
    violatesSmartTrainingSafety(candidate, {
      lastTrainingDayHeavyDeadlift: true,
      recentHeavyDeadliftDayCount: 1,
    })
  ).toBe(true);
});

test('blocks any heavy lift directly after a different heavy lift', () => {
  const heavyDeadlift = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      intensityRole: 'heavy',
      sets: [{ labelKey: 'topDouble', reps: 2, pct: 0.95 }],
    }],
  };

  expect(violatesSmartTrainingSafety(heavyDeadlift, {
    lastWorkoutWasHeavyTraining: true,
    lastTrainingDayHeavyDeadlift: false,
  })).toBe(true);

  expect(violatesSmartTrainingSafety(heavyDeadlift, {
    lastWorkoutWasHeavyTraining: false,
    lastTrainingDayHeavyDeadlift: false,
  })).toBe(false);
});

test('generation turns the workout after a heavy day into medium/light work or rest', () => {
  const heavySquatSnapshot = {
    number: 1,
    type: 'training',
    smartDayType: 'training',
    lift: 'Squat',
    workoutEffort: 'good',
    lifts: [{
      lift: 'Squat',
      role: 'primary',
      intensityRole: 'heavy',
      sets: [{
        labelKey: 'topDouble', reps: 2, pct: 0.85, weight: 85,
        done: true, failed: false, skipped: false,
      }],
    }],
  };
  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 100,
    bench: 80,
    deadlift: 140,
    athleteLevel: 'intermediate',
    currentCycle: 1,
    currentIndex: 1,
    history: [{
      cycle: 1,
      workoutNumber: 1,
      lift: 'Squat',
      workoutEffort: 'good',
      workoutSnapshot: heavySquatSnapshot,
    }],
  });
  const next = workouts[1];

  expect(next.smartDecisionSummary.readiness.lastWorkoutWasHeavyTraining).toBe(true);
  expect((next.lifts || []).some(({ lift }) =>
    isHeavySmartTrainingLift(next, lift)
  )).toBe(false);
});

test('treats a HARD sub-80% Deadlift top set as a heavy Deadlift exposure', () => {
  const candidate = {
    type: 'training',
    lifts: [{
      lift: 'Deadlift',
      sets: [{ labelKey: 'topDouble', reps: 2, pct: 0.775, effort: 'hard' }],
    }],
  };

  expect(
    violatesSmartTrainingSafety(candidate, {
      lastTrainingDayHeavyDeadlift: true,
      recentHeavyDeadliftDayCount: 1,
    })
  ).toBe(true);
});

test('blocks maximal Squat after two recent heavy Deadlift days', () => {
  const candidate = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'opener', reps: 1, pct: 0.9 }],
    }],
  };

  expect(
    violatesSmartTrainingSafety(candidate, {
      recentHeavyDeadliftDayCount: 2,
      recentSquatMaxPct: 0.85,
    })
  ).toBe(true);
});

test('blocks an unprepared maximal Squat jump from sub-80% recent work', () => {
  const candidate = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'topSingle', reps: 1, pct: 0.9 }],
    }],
  };

  expect(
    violatesSmartTrainingSafety(candidate, {
      recentHeavyDeadliftDayCount: 0,
      recentSquatMaxPct: 0.675,
    })
  ).toBe(true);
});

test('allows maximal Squat when preparation and recovery are sufficient', () => {
  const candidate = {
    type: 'training',
    lifts: [{
      lift: 'Squat',
      sets: [{ labelKey: 'topSingle', reps: 1, pct: 0.9 }],
    }],
  };

  expect(
    violatesSmartTrainingSafety(candidate, {
      recentHeavyDeadliftDayCount: 0,
      recentSquatMaxPct: 0.85,
      lastTrainingDayHeavyDeadlift: false,
    })
  ).toBe(false);
});

test('avoids the C3W15 maximal Squat choice after two heavy Deadlift days', () => {
  const makeLiftSnapshot = ({
    number,
    lift,
    sets,
    workoutEffort = 'good',
    smartDayType = 'training',
  }) => ({
    number,
    type: 'training',
    smartDayType,
    lift,
    lifts: [{
      lift,
      prepItems: [],
      warmups: [],
      sets,
    }],
    prepItems: [],
    warmups: [],
    sets,
    accessories: [],
    workoutEffort,
  });

  const history = [
    {
      cycle: 3,
      workoutNumber: 10,
      lift: 'Squat',
      workoutEffort: 'good',
      workoutSnapshot: makeLiftSnapshot({
        number: 10,
        lift: 'Squat',
        sets: [
          { labelKey: 'workSets', reps: 4, pct: 0.675, weight: 97.5, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.675, weight: 97.5, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.675, weight: 97.5, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.675, weight: 97.5, done: true },
        ],
      }),
    },
    {
      cycle: 3,
      workoutNumber: 11,
      lift: 'Deadlift',
      workoutEffort: 'hard',
      workoutSnapshot: makeLiftSnapshot({
        number: 11,
        lift: 'Deadlift',
        workoutEffort: 'hard',
        sets: [
          { labelKey: 'topSet', reps: 5, pct: 0.721, weight: 130, done: true, effort: 'hard' },
          { labelKey: 'backoff', reps: 6, pct: 0.639, weight: 115, done: true },
          { labelKey: 'backoff', reps: 6, pct: 0.639, weight: 115, done: true },
        ],
      }),
    },
    {
      cycle: 3,
      workoutNumber: 12,
      restDay: true,
      workoutEffort: 'easy',
      smartDayType: 'recovery',
      workoutSnapshot: {
        number: 12,
        type: 'rest',
        smartDayType: 'recovery',
        lifts: [],
        sets: [],
        workoutEffort: 'easy',
      },
    },
    {
      cycle: 3,
      workoutNumber: 13,
      lift: 'Deadlift',
      workoutEffort: 'good',
      workoutSnapshot: {
        number: 13,
        type: 'training',
        smartDayType: 'training',
        lift: 'Deadlift',
        lifts: [
          {
            lift: 'Deadlift',
            prepItems: [],
            warmups: [],
            sets: [
              {
                labelKey: 'topDouble',
                reps: 2,
                pct: 0.775,
                weight: 140,
                done: true,
                effort: 'hard',
              },
              { labelKey: 'backoff', reps: 3, pct: 0.70, weight: 125, done: true },
              { labelKey: 'backoff', reps: 3, pct: 0.70, weight: 125, done: true },
            ],
          },
          {
            lift: 'Squat',
            prepItems: [],
            warmups: [],
            sets: [
              { labelKey: 'workSets', reps: 4, pct: 0.625, weight: 90, done: true },
              { labelKey: 'workSets', reps: 4, pct: 0.625, weight: 90, done: true },
              { labelKey: 'workSets', reps: 4, pct: 0.625, weight: 90, done: true },
            ],
          },
        ],
        prepItems: [],
        warmups: [],
        sets: [],
        accessories: [],
        workoutEffort: 'good',
      },
    },
    {
      cycle: 3,
      workoutNumber: 14,
      lift: 'Deadlift',
      workoutEffort: 'hard',
      workoutSnapshot: {
        number: 14,
        type: 'training',
        smartDayType: 'training',
        lift: 'Deadlift',
        lifts: [
          {
            lift: 'Deadlift',
            prepItems: [],
            warmups: [],
            sets: [
              {
                labelKey: 'topDouble',
                reps: 2,
                pct: 0.80,
                weight: 145,
                done: true,
                effort: 'hard',
              },
              { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
              { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
              { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
              { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
            ],
          },
          {
            lift: 'Bench',
            prepItems: [],
            warmups: [],
            sets: [
              { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
              { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
              { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
              { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
            ],
          },
        ],
        prepItems: [],
        warmups: [],
        sets: [],
        accessories: [],
        workoutEffort: 'hard',
      },
    },
  ];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 145,
    bench: 100,
    deadlift: 180,
    history,
    currentIndex: 14,
    currentCycle: 3,
    meetPlannerAttempts: {
      Squat: [132.5, 140, 147.5],
      Bench: [90, 95, 100],
      Deadlift: [167.5, 177.5, 185],
    },
  });

  const decisionWorkout = workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  expect(decisionWorkout).toBeTruthy();
  expect(decisionWorkout.smartDecisionSummary.dayType).toBe('training');
  expect(isMaximalSmartTrainingLift(decisionWorkout, 'Squat')).toBe(false);
  expect(isHeavySmartTrainingLift(decisionWorkout, 'Deadlift')).toBe(false);

  expect(
    decisionWorkout.smartDecisionSummary.readiness.recentHeavyDeadliftDayCount
  ).toBeGreaterThanOrEqual(2);

  expect(
    decisionWorkout.smartDecisionSummary.readiness.recentSquatMaxPct
  ).toBeCloseTo(0.675);
});


test('does not repeat the last training prescription after Rest & recovery', () => {
  const previousTraining = {
    number: 14,
    type: 'training',
    smartDayType: 'training',
    lift: 'Deadlift',
    lifts: [
      {
        lift: 'Deadlift',
        prepItems: [],
        warmups: [],
        sets: [
          {
            labelKey: 'topDouble',
            reps: 2,
            pct: 0.80,
            weight: 145,
            done: true,
            effort: 'good',
          },
          { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
          { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
          { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
          { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
        ],
      },
      {
        lift: 'Bench',
        prepItems: [],
        warmups: [],
        sets: [
          { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
          { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 70, done: true },
        ],
      },
    ],
    prepItems: [],
    warmups: [],
    sets: [],
    accessories: [],
    workoutEffort: 'good',
  };

  const history = [
    {
      cycle: 3,
      workoutNumber: 14,
      lift: 'Deadlift',
      workoutEffort: 'good',
      workoutSnapshot: previousTraining,
    },
    {
      cycle: 3,
      workoutNumber: 15,
      restDay: true,
      workoutEffort: 'easy',
      smartDayType: 'recovery',
      workoutSnapshot: {
        number: 15,
        type: 'rest',
        smartDayType: 'recovery',
        lifts: [],
        sets: [],
        workoutEffort: 'easy',
      },
    },
  ];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 145,
    bench: 100,
    deadlift: 180,
    history,
    currentIndex: 15,
    currentCycle: 3,
    meetPlannerAttempts: {
      Squat: [132.5, 140, 147.5],
      Bench: [90, 95, 100],
      Deadlift: [167.5, 177.5, 185],
    },
  });

  const decisionWorkout = workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  const prescriptionSignature = workout =>
    (workout?.lifts || [])
      .flatMap(liftBlock =>
        (liftBlock.sets || [])
          .filter(set => !set.warmup && !set.isWarmup)
          .map(set => [
            liftBlock.lift,
            set.labelKey || set.label || set.type || '',
            Number(set.reps) || 0,
            Number(set.weight ?? set.originalWeight) || 0,
            Number(set.pct ?? set.originalPct) || 0,
          ].join(':'))
      )
      .filter(Boolean)
      .sort()
      .join('|');

  expect(decisionWorkout).toBeTruthy();
  expect(decisionWorkout.smartDecisionSummary.dayType).toBe('training');
  expect(decisionWorkout.smartDecisionSummary.readiness.lastWasRecoveryIntervention).toBe(true);
  expect(decisionWorkout.smartDecisionSummary.readiness.lastWorkoutLifts).toEqual([
    'Deadlift',
    'Bench',
  ]);
  expect(
    decisionWorkout.smartDecisionSummary.readiness.lastWorkoutPrescriptionSignature
  ).not.toBe('');

  expect(prescriptionSignature(decisionWorkout))
    .not.toBe(prescriptionSignature(previousTraining));
});


test('does not repeat a recent training prescription after another workout and recovery', () => {
  const makeSnapshot = (number, lifts, workoutEffort = 'good') => ({
    number,
    type: 'training',
    smartDayType: 'training',
    lift: lifts[0]?.lift,
    lifts,
    prepItems: [],
    warmups: [],
    sets: [],
    accessories: [],
    workoutEffort,
  });

  const deadliftBench = makeSnapshot(14, [
    {
      lift: 'Deadlift',
      prepItems: [],
      warmups: [],
      sets: [
        { labelKey: 'topDouble', reps: 2, pct: 0.80, weight: 145, done: true },
        { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
        { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
        { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
        { labelKey: 'backoff', reps: 4, pct: 0.70, weight: 125, done: true },
      ],
    },
    {
      lift: 'Bench',
      prepItems: [],
      warmups: [],
      sets: [
        { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 67.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 67.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 67.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.70, weight: 67.5, done: true },
      ],
    },
  ]);

  const squatBench = makeSnapshot(15, [
    {
      lift: 'Squat',
      prepItems: [],
      warmups: [],
      sets: [
        {
          labelKey: 'topTriple',
          reps: 3,
          pct: 0.775,
          weight: 112.5,
          done: false,
          skipped: true,
        },
        { labelKey: 'backoff', reps: 5, pct: 0.675, weight: 97.5, done: true },
        { labelKey: 'backoff', reps: 5, pct: 0.675, weight: 97.5, done: true },
      ],
    },
    {
      lift: 'Bench',
      prepItems: [],
      warmups: [],
      sets: [
        { labelKey: 'workSets', reps: 4, pct: 0.65, weight: 62.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.65, weight: 62.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.65, weight: 62.5, done: true },
        { labelKey: 'workSets', reps: 4, pct: 0.65, weight: 62.5, done: true },
      ],
    },
  ], 'tooMuch');

  const history = [
    {
      cycle: 3,
      workoutNumber: 14,
      lift: 'Deadlift',
      workoutEffort: 'good',
      workoutSnapshot: deadliftBench,
    },
    {
      cycle: 3,
      workoutNumber: 15,
      lift: 'Squat',
      workoutEffort: 'tooMuch',
      failedOrSkippedSetCount: 1,
      workoutSnapshot: squatBench,
    },
    {
      cycle: 3,
      workoutNumber: 16,
      restDay: true,
      workoutEffort: 'easy',
      smartDayType: 'recovery',
      workoutSnapshot: {
        number: 16,
        type: 'rest',
        smartDayType: 'recovery',
        lifts: [],
        sets: [],
        workoutEffort: 'easy',
      },
    },
  ];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 145,
    bench: 100,
    deadlift: 180,
    history,
    currentIndex: 16,
    currentCycle: 3,
    meetPlannerAttempts: {
      Squat: [132.5, 140, 147.5],
      Bench: [90, 95, 100],
      Deadlift: [167.5, 177.5, 185],
    },
  });

  const decisionWorkout = workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  const signature = workout =>
    (workout?.lifts || [])
      .flatMap(liftBlock =>
        (liftBlock.sets || [])
          .filter(set => !set.warmup && !set.isWarmup)
          .map(set => [
            liftBlock.lift,
            set.labelKey || set.label || set.type || '',
            Number(set.reps) || 0,
            Number(set.weight ?? set.originalWeight) || 0,
            Number(set.pct ?? set.originalPct) || 0,
          ].join(':'))
      )
      .sort()
      .join('|');

  expect(decisionWorkout).toBeTruthy();
  expect(
    decisionWorkout.smartDecisionSummary.readiness
      .recentTrainingPrescriptionSignatures
  ).toHaveLength(2);

  if (decisionWorkout.smartDecisionSummary.dayType === 'training') {
    expect(signature(decisionWorkout)).not.toBe(signature(deadliftBench));
  } else {
    expect(decisionWorkout.smartDecisionSummary.dayType).toBe('recovery');
  }
});

test('explains fatigue with score and previous workout effort', () => {
  expect(
    getSmartMeetdayBlockerDisplayLabels(
      ['fatigue', 'meet-plan-not-ready'],
      {},
      {
        recentFatigueScore: 1,
        lastWorkoutEffort: 'hard',
      }
    )
  ).toEqual([
    'fatigue 1/2 (previous workout HARD)',
    'meet plan',
  ]);

  expect(
    getSmartMeetdayBlockerDisplayLabels(
      ['deadlift-taper-recovery'],
      { smartBlockerDeadliftTaperRecovery: 'Deadlift taper recovery' }
    )
  ).toEqual(['Deadlift taper recovery']);
});


test('splits training fallback details into separate modal rows', () => {
  expect(
    getSmartModalDetailRows({
      smartDecisionSummary: {
        dayType: 'training',
        reason: 'training-fallback',
        readiness: {
          meetPlanReady: false,
          meetdayBlockers: ['meet-plan-not-ready', 'fatigue'],
          recentFatigueScore: 1,
          recentFailedOrSkippedSetCount: 0,
          lastWorkoutEffort: 'hard',
        },
      },
    })
  ).toEqual([
    {
      label: 'Current blocker',
      value: 'Meet plan not ready',
    },
    {
      label: 'Fatigue',
      value: '1 (below recovery threshold)',
    },
  ]);
});

test('omits zero fatigue and zero missed-set rows from a normal Smart modal', () => {
  const rows = getSmartModalDetailRows({
    smartDecisionSummary: {
      dayType: 'training',
      readiness: {
        recentFatigueScore: 0,
        recentFailedOrSkippedSetCount: 0,
      },
    },
  });

  expect(rows.find(row => row.label === 'Fatigue')).toBeUndefined();
  expect(rows.find(row => row.label === 'Failed')).toBeUndefined();
});

test('shows structured recovery details without a combined Reason row', () => {
  expect(
    getSmartModalDetailRows({
      smartDecisionSummary: {
        dayType: 'recovery',
        reason: 'fatigue-recovery',
        readiness: {
          recentFatigueScore: 4,
          recentFailedOrSkippedSetCount: 1,
          lastWorkoutEffort: 'tooMuch',
        },
      },
    })
  ).toEqual([
    {
      label: 'Fatigue',
      value: '4 (recovery required)',
    },
    {
      label: 'Failed',
      value: '1/2 (below deload threshold)',
    },
  ]);
});

test('generates progressive C3W18 training without template prescriptions', () => {
  const makeSnapshot = ({
    number,
    lifts,
    workoutEffort = 'good',
  }) => ({
    number,
    type: 'training',
    smartDayType: 'training',
    lift: lifts[0]?.lift || null,
    lifts,
    sets: [],
    warmups: [],
    prepItems: [],
    accessories: [],
    workoutEffort,
  });

  const history = [
    {
      cycle: 3,
      workoutNumber: 13,
      lift: 'Deadlift',
      topWeight: 140,
      topReps: 2,
      e1rm: 149,
      workoutEffort: 'good',
      workoutSnapshot: makeSnapshot({
        number: 13,
        lifts: [
          {
            lift: 'Deadlift',
            sets: [
              {
                labelKey: 'topDouble',
                reps: 2,
                pct: 0.775,
                weight: 140,
                done: true,
              },
              {
                labelKey: 'backoff',
                reps: 3,
                pct: 0.70,
                weight: 125,
                done: true,
              },
              {
                labelKey: 'backoff',
                reps: 3,
                pct: 0.70,
                weight: 125,
                done: true,
              },
            ],
          },
          {
            lift: 'Squat',
            sets: [
              {
                labelKey: 'workSets',
                reps: 4,
                pct: 0.625,
                weight: 90,
                done: true,
              },
              {
                labelKey: 'workSets',
                reps: 4,
                pct: 0.625,
                weight: 90,
                done: true,
              },
              {
                labelKey: 'workSets',
                reps: 4,
                pct: 0.625,
                weight: 90,
                done: true,
              },
            ],
          },
        ],
      }),
    },
    {
      cycle: 3,
      workoutNumber: 14,
      lift: 'Deadlift',
      topWeight: 145,
      topReps: 2,
      e1rm: 155,
      workoutEffort: 'hard',
      workoutSnapshot: makeSnapshot({
        number: 14,
        workoutEffort: 'hard',
        lifts: [
          {
            lift: 'Deadlift',
            sets: [
              {
                labelKey: 'topDouble',
                reps: 2,
                pct: 0.80,
                weight: 145,
                done: true,
              },
              ...Array.from({ length: 4 }, () => ({
                labelKey: 'backoff',
                reps: 4,
                pct: 0.70,
                weight: 125,
                done: true,
              })),
            ],
          },
          {
            lift: 'Bench',
            sets: Array.from({ length: 4 }, () => ({
              labelKey: 'workSets',
              reps: 4,
              pct: 0.70,
              weight: 70,
              done: true,
            })),
          },
        ],
      }),
    },
    {
      cycle: 3,
      workoutNumber: 15,
      lift: 'Squat',
      topWeight: 112.5,
      topReps: 3,
      e1rm: 124,
      workoutEffort: 'tooMuch',
      failedOrSkippedSetCount: 1,
      workoutSnapshot: makeSnapshot({
        number: 15,
        workoutEffort: 'tooMuch',
        lifts: [
          {
            lift: 'Squat',
            sets: [
              {
                labelKey: 'topTriple',
                reps: 3,
                pct: 0.775,
                weight: 112.5,
                done: false,
                skipped: true,
              },
              {
                labelKey: 'backoff',
                reps: 5,
                pct: 0.675,
                weight: 97.5,
                done: true,
              },
              {
                labelKey: 'backoff',
                reps: 5,
                pct: 0.675,
                weight: 97.5,
                done: true,
              },
            ],
          },
        ],
      }),
    },
    {
      cycle: 3,
      workoutNumber: 16,
      restDay: true,
      workoutEffort: 'easy',
      smartDayType: 'recovery',
      workoutSnapshot: {
        number: 16,
        type: 'rest',
        smartDayType: 'recovery',
        lifts: [],
        sets: [],
        workoutEffort: 'easy',
      },
    },
    {
      cycle: 3,
      workoutNumber: 17,
      lift: 'Bench',
      topWeight: 82.5,
      topReps: 2,
      e1rm: 88,
      workoutEffort: 'good',
      workoutSnapshot: makeSnapshot({
        number: 17,
        lifts: [
          {
            lift: 'Bench',
            sets: [
              {
                labelKey: 'topDouble',
                reps: 2,
                pct: 0.825,
                weight: 82.5,
                done: true,
              },
              ...Array.from({ length: 3 }, () => ({
                labelKey: 'backoff',
                reps: 4,
                pct: 0.725,
                weight: 72.5,
                done: true,
              })),
            ],
          },
          {
            lift: 'Deadlift',
            sets: Array.from({ length: 3 }, () => ({
              labelKey: 'workSets',
              reps: 3,
              pct: 0.625,
              weight: 112.5,
              done: true,
            })),
          },
        ],
      }),
    },
  ];

  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 145,
    bench: 100,
    deadlift: 180,
    history,
    currentIndex: 17,
    currentCycle: 3,
    meetPlannerAttempts: {
      Squat: [132.5, 140, 147.5],
      Bench: [90, 95, 100],
      Deadlift: [167.5, 177.5, 185],
    },
  });

  const decisionWorkout = workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  expect(decisionWorkout).toBeTruthy();
  expect(decisionWorkout.smartDecisionSummary.dayType)
    .toBe('training');
  expect(decisionWorkout.smartGeneratedPrescription)
    .toBe(true);
  expect(decisionWorkout.smartSourceWorkoutNumber)
    .toBeNull();
  expect(
    decisionWorkout.smartTrainingSelectionSummary
      .templateIndependent
  ).toBe(true);

  expect(
    decisionWorkout.smartTrainingSelectionSummary
      .reasonFlags
  ).toContain('projected-frequency-guard');
  expect(
    decisionWorkout.smartTrainingSelectionSummary
      .frequencyExposureCounts
  ).toEqual({
    Squat: 2,
    Bench: 2,
    Deadlift: 3,
  });
  expect(
    decisionWorkout.smartTrainingSelectionSummary
      .frequencyEligibleLifts
  ).toEqual(['Squat', 'Bench']);
  expect(
    decisionWorkout.lifts.map(liftBlock => liftBlock.lift)
  ).toEqual(['Squat', 'Bench']);
  // Meet attempts remain based on real 1RM, while readiness compares the
  // newly canonical 2.5kg-rounded e1RMs. At this boundary Deadlift is the
  // remaining readiness limiter; this does not change the frequency-gated
  // Squat + Bench selection asserted above.
  expect(
    decisionWorkout.smartDecisionSummary.readiness
      .meetPlanWeakestLift
  ).toBe('Deadlift');

  decisionWorkout.lifts.forEach(liftBlock => {
    const volumeSets = liftBlock.sets.filter(set =>
      ['backoff', 'workSets'].includes(set.labelKey)
    );

    expect(volumeSets.length).toBeGreaterThanOrEqual(2);
    expect(volumeSets.length).toBeLessThanOrEqual(6);
    expect(
      ((liftBlock.warmups || []).length + (liftBlock.sets || []).length) % 4
    ).toBe(0);
    volumeSets.forEach(set => {
      expect(set.reps).toBeGreaterThanOrEqual(2);
      expect(set.reps).toBeLessThanOrEqual(6);
    });
  });

  const c3w18Snapshot = makeSnapshot({
    number: 18,
    workoutEffort: 'hard',
    lifts: [
      {
        lift: 'Deadlift',
        role: 'primary',
        sets: [
          {
            labelKey: 'topDouble',
            reps: 2,
            pct: 0.825,
            weight: 147.5,
            done: true,
          },
          ...Array.from({ length: 4 }, () => ({
            labelKey: 'backoff',
            reps: 4,
            pct: 0.725,
            weight: 130,
            done: true,
          })),
        ],
      },
      {
        lift: 'Squat',
        role: 'secondary',
        sets: Array.from({ length: 4 }, () => ({
          labelKey: 'workSets',
          reps: 4,
          pct: 0.65,
          weight: 95,
          done: true,
        })),
      },
    ],
  });

  const c3w19Workouts = generateWorkoutsForTrainingModel(
    'smart',
    {
      programProfile: 'kelaniSbdUltra',
      squat: 145,
      bench: 100,
      deadlift: 180,
      history: [
        ...history,
        {
          cycle: 3,
          workoutNumber: 18,
          lift: 'Deadlift',
          topWeight: 147.5,
          topReps: 2,
          e1rm: 157.33,
          workoutEffort: 'hard',
          workoutSnapshot: c3w18Snapshot,
        },
        {
          cycle: 3,
          workoutNumber: 18,
          lift: 'Squat',
          topWeight: 95,
          topReps: 4,
          e1rm: 107.67,
          workoutEffort: 'hard',
          workoutSnapshot: c3w18Snapshot,
        },
      ],
      currentIndex: 18,
      currentCycle: 3,
      meetPlannerAttempts: {
        Squat: [132.5, 140, 147.5],
        Bench: [90, 95, 100],
        Deadlift: [167.5, 177.5, 185],
      },
    }
  );

  const c3w19 = c3w19Workouts.find(workout =>
    workout?.smartDecisionSummary
  );

  expect(c3w19).toBeTruthy();
  expect(c3w19.lifts.map(liftBlock => liftBlock.lift))
    .toEqual(['Bench']);
  expect(c3w19.smartTrainingSelectionSummary.primaryLift)
    .toBe('Bench');
  expect(c3w19.smartTrainingSelectionSummary.secondaryLift)
    .toBeNull();
  // Bench already used its ideal single heavy allocation for the week on
  // W17 (a topDouble), just one training day before this candidate (W18 was
  // Deadlift/Squat only) - it isn't due for another heavy top set yet, so
  // this fresh, template-independent prescription is correctly a light
  // volume-only day instead of another top-set exposure.
  expect(c3w19.lifts[0].role).toBe('secondary');

  const c3w19BenchVolumeSets = c3w19.lifts[0].sets.filter(
    set => set.labelKey === 'workSets'
  );

  expect(c3w19BenchVolumeSets.length).toBeGreaterThanOrEqual(3);
  c3w19BenchVolumeSets.forEach(set => {
    expect(set).toMatchObject({
      reps: 4,
      pct: 0.70,
      weight: 70,
    });
  });
  expect(
    c3w19.smartTrainingSelectionSummary
      .frequencyExposureCounts
  ).toEqual({
    Squat: 3,
    Bench: 2,
    Deadlift: 4,
  });
  // Squat is at its raw exposure target (3/3) too - frequencyEligibleLifts
  // now gates on the raw count, not the weighted one that used to let a
  // lift back in after only a light session (see the C3W36/W37 report:
  // Deadlift, already at 2/2, was sneaking back into primary contention
  // the same way before this fix).
  expect(
    c3w19.smartTrainingSelectionSummary
      .frequencyEligibleLifts
  ).toEqual(['Bench']);
  expect(
    c3w19.smartTrainingSelectionSummary.reasonFlags
  ).toContain('projected-frequency-guard');
});

test('an untouched stale "meet" slot adopts the freshly generated day type after completing the prior workout', () => {
  const staleMeetWorkout = {
    number: 28,
    type: 'meet',
    lift: 'SBD',
    labelKey: 'meetDay',
    lifts: [
      {
        lift: 'Squat',
        warmups: [{ reps: 5, weight: 20, done: false }],
        sets: [{ labelKey: 'opener', reps: 1, pct: 0.9, weight: 130, done: false }],
      },
    ],
    accessories: [],
  };

  const freshlyGeneratedTrainingWorkout = {
    number: 28,
    type: 'training',
    lift: 'Squat',
    label: 'Ultra Primary SBD',
    lifts: [
      {
        lift: 'Squat',
        warmups: [{ reps: 5, weight: 20, done: false }],
        sets: [{ labelKey: 'topTriple', reps: 3, pct: 0.725, weight: 110, done: false }],
      },
    ],
    accessories: [],
  };

  const result = applyAccessoryPlanToWorkouts(
    [staleMeetWorkout],
    [freshlyGeneratedTrainingWorkout],
    new Set(),
    28
  );

  expect(result[0].type).toBe('training');
  expect(result[0].lifts[0].lift).toBe('Squat');
  expect(result[0].lifts[0].sets[0]).toMatchObject({ labelKey: 'topTriple', weight: 110 });
});

test('a meet day the user already started entering attempts for is preserved, not overwritten', () => {
  const inProgressMeetWorkout = {
    number: 28,
    type: 'meet',
    lift: 'SBD',
    labelKey: 'meetDay',
    lifts: [
      {
        lift: 'Squat',
        warmups: [{ reps: 5, weight: 20, done: false }],
        sets: [{ labelKey: 'opener', reps: 1, pct: 0.9, weight: 135, done: true }],
      },
    ],
    accessories: [],
  };

  const freshlyGeneratedTrainingWorkout = {
    number: 28,
    type: 'training',
    lift: 'Squat',
    lifts: [
      {
        lift: 'Squat',
        warmups: [{ reps: 5, weight: 20, done: false }],
        sets: [{ labelKey: 'topTriple', reps: 3, pct: 0.725, weight: 110, done: false }],
      },
    ],
    accessories: [],
  };

  const result = applyAccessoryPlanToWorkouts(
    [inProgressMeetWorkout],
    [freshlyGeneratedTrainingWorkout],
    new Set(),
    28
  );

  expect(result[0].type).toBe('meet');
  expect(result[0].lifts[0].sets[0]).toMatchObject({ weight: 135, done: true });
});
