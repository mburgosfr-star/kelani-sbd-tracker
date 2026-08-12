import {
  generateWorkoutsForTrainingModel,
  getProjectedSmartLiftEligibility,
} from './smartTrainingEngine';

const maxes = {
  Squat: 145,
  Bench: 100,
  Deadlift: 180,
};

function completedSet(lift, role) {
  const weight = role === 'primary'
    ? maxes[lift] * 0.75
    : maxes[lift] * 0.6;

  return {
    labelKey: role === 'primary' ? 'topTriple' : 'workSets',
    reps: role === 'primary' ? 3 : 4,
    pct: role === 'primary' ? 0.75 : 0.6,
    weight,
    done: true,
    failed: false,
    skipped: false,
  };
}

function completedTrainingDay(number, liftRoles) {
  const lifts = liftRoles.map(([lift, role]) => ({
    lift,
    role,
    intensityRole: role === 'primary' ? 'heavy' : 'light',
    warmups: [],
    sets: [completedSet(lift, role)],
  }));
  const workoutSnapshot = {
    number,
    type: 'training',
    completed: true,
    workoutEffort: 'good',
    smartCurrentCycle: 3,
    smartDayType: 'training',
    lift: lifts[0].lift,
    lifts,
    warmups: [],
    sets: lifts[0].sets,
  };

  return lifts.map(block => ({
    cycle: 3,
    workoutNumber: number,
    lift: block.lift,
    topWeight: block.sets[0].weight,
    topReps: block.sets[0].reps,
    workoutEffort: 'good',
    workoutSnapshot,
  }));
}

function completedRecoveryDay(number) {
  const workoutSnapshot = {
    number,
    type: 'rest',
    restDay: true,
    completionOnly: true,
    completed: true,
    smartCurrentCycle: 3,
    smartDayType: 'recovery',
    lifts: [],
    warmups: [],
    sets: [],
  };

  return [{
    cycle: 3,
    workoutNumber: number,
    restDay: true,
    completionOnly: true,
    workoutSnapshot,
  }];
}

function buildC3W44Boundary({ includeFinalBench = true } = {}) {
  return [
    ...completedTrainingDay(38, [
      ['Squat', 'primary'],
      ['Bench', 'secondary'],
    ]),
    ...completedTrainingDay(39, [
      ['Deadlift', 'primary'],
      ['Bench', 'secondary'],
    ]),
    ...completedTrainingDay(40, [
      ['Squat', 'secondary'],
      ['Bench', 'primary'],
    ]),
    ...completedTrainingDay(41, [
      ['Deadlift', 'secondary'],
    ]),
    ...completedTrainingDay(42, [
      ['Squat', 'secondary'],
      ...(includeFinalBench ? [['Bench', 'secondary']] : []),
    ]),
    ...completedRecoveryDay(43),
  ];
}

function generateC3W44(history) {
  return generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    athleteLevel: 'intermediate',
    squat: maxes.Squat,
    bench: maxes.Bench,
    deadlift: maxes.Deadlift,
    history,
    currentIndex: 43,
    currentCycle: 3,
    meetPlannerAttempts: {
      Squat: [132.5, 140, 147.5],
      Bench: [90, 95, 102.5],
      Deadlift: [165, 175, 185],
    },
  }).find(workout => workout.smartDecisionSummary);
}

test('C3W44 is recovery once every rolling weekly lift target is complete', () => {
  const history = buildC3W44Boundary();
  const eligibility = getProjectedSmartLiftEligibility({
    history,
    currentCycle: 3,
    athleteLevel: 'intermediate',
    targetWorkoutNumber: 44,
  });

  expect(eligibility.exposureCounts).toEqual({
    Squat: 3,
    Bench: 4,
    Deadlift: 2,
  });
  expect(eligibility.eligibleLifts).toEqual([]);
  expect(eligibility.primaryEligibleLifts).toEqual([]);
  expect(eligibility.secondaryEligibleLifts).toEqual([]);

  const c3w44 = generateC3W44(history);

  expect(c3w44).toBeTruthy();
  expect(c3w44).toMatchObject({
    number: 44,
    type: 'rest',
    smartDayType: 'recovery',
    smartOverride: 'recovery',
  });
  expect(c3w44.lifts).toEqual([]);
  expect(c3w44.smartDecisionSummary).toMatchObject({
    dayType: 'recovery',
    reason: 'frequency-recovery',
    overrideType: 'rest',
  });
});

test('C3W44 remains training while Bench still has one weekly exposure left', () => {
  const history = buildC3W44Boundary({ includeFinalBench: false });
  const eligibility = getProjectedSmartLiftEligibility({
    history,
    currentCycle: 3,
    athleteLevel: 'intermediate',
    targetWorkoutNumber: 44,
  });

  expect(eligibility.exposureCounts).toEqual({
    Squat: 3,
    Bench: 3,
    Deadlift: 2,
  });
  expect(eligibility.eligibleLifts).toEqual(['Bench']);

  const c3w44 = generateC3W44(history);

  expect(c3w44).toBeTruthy();
  expect(c3w44.type).toBe('training');
  expect(c3w44.smartDecisionSummary.dayType).toBe('training');
  expect(c3w44.lifts.map(block => block.lift)).toEqual(['Bench']);
});
