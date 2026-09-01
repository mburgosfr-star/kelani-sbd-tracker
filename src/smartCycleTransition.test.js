import {
  buildAutomaticNextSmartCycle,
  shouldAutomaticallyStartNextSmartCycle,
} from './smartCycleTransition';
import { SMART_DAY_TYPES, TRAINING_MODELS } from './smartTrainingConstants';

function completedMeetAndRecoveryHistory() {
  const meetSnapshot = {
    number: 46,
    type: 'meet',
    smartDayType: SMART_DAY_TYPES.MEET,
    workoutEffort: 'good',
    smartIdealRoute: {
      version: 1,
      workoutNumber: 28,
      stage: 'meet',
      postMeetRecoveryTarget: 1,
      nextCycleWorkout: 30,
    },
    lifts: [
      { lift: 'Squat', sets: [{ reps: 1, weight: 45, done: true, failed: false, skipped: false }] },
      { lift: 'Bench', sets: [{ reps: 1, weight: 32.5, done: true, failed: false, skipped: false }] },
      { lift: 'Deadlift', sets: [{ reps: 1, weight: 60, done: true, failed: false, skipped: false }] },
    ],
  };
  const meetEntries = [
    ['Squat', 45],
    ['Bench', 32.5],
    ['Deadlift', 60],
  ].map(([lift, weight]) => ({
    cycle: 1,
    workoutNumber: 46,
    lift,
    topWeight: weight,
    topReps: 1,
    oneRMToday: weight,
    e1rm: weight,
    workoutEffort: 'good',
    smartDayType: SMART_DAY_TYPES.MEET,
    workoutSnapshot: meetSnapshot,
  }));
  const recoveryEntry = {
    cycle: 1,
    workoutNumber: 47,
    restDay: true,
    completionOnly: true,
    workoutEffort: 'easy',
    smartDayType: SMART_DAY_TYPES.RECOVERY,
    workoutSnapshot: {
      number: 47,
      type: 'rest',
      smartDayType: SMART_DAY_TYPES.RECOVERY,
      workoutEffort: 'easy',
      smartIdealRoute: {
        version: 1,
        workoutNumber: 29,
        stage: 'post-meet',
        postMeetRecoveryTarget: 1,
        nextCycleWorkout: 30,
      },
    },
  };

  return [...meetEntries, recoveryEntry];
}

test('a successful meet plus its recovery automatically starts C2W1', () => {
  const history = completedMeetAndRecoveryHistory();
  const transition = buildAutomaticNextSmartCycle({
    trainingModel: TRAINING_MODELS.SMART,
    currentCycle: 1,
    history,
    prs: { Squat: 45, Bench: 32.5, Deadlift: 60 },
    oneRMs: { Squat: 45, Bench: 32.5, Deadlift: 60 },
    bodyWeights: [{ date: '2030-01-15', weight: 60 }],
    programProfile: 'kelaniSbd',
    accessoryMode: 'off',
    preparationMode: 'off',
    cooldownMode: 'off',
    smartIdealRouteStartCycle: 1,
  });

  expect(transition).not.toBeNull();
  expect(transition).toMatchObject({
    currentCycle: 2,
    currentIndex: 0,
    selectedIndex: 0,
  });
  expect(transition.workouts[0]).toMatchObject({
    number: 1,
    type: 'training',
    smartIdealRoute: {
      workoutNumber: 1,
    },
  });
  expect(shouldAutomaticallyStartNextSmartCycle({
    trainingModel: TRAINING_MODELS.SMART,
    history,
    currentCycle: 2,
  })).toBe(false);
});

test('the meet alone does not start the next cycle before recovery is completed', () => {
  const history = completedMeetAndRecoveryHistory().filter(entry =>
    Number(entry.workoutNumber) === 46
  );

  expect(shouldAutomaticallyStartNextSmartCycle({
    trainingModel: TRAINING_MODELS.SMART,
    history,
    currentCycle: 1,
  })).toBe(false);
});

test('a prior-cycle meet never advances an imported active cycle', () => {
  const priorCycleHistory = completedMeetAndRecoveryHistory().map(entry => ({
    ...entry,
    cycle: 3,
  }));
  const activeCycleHistory = [
    ...priorCycleHistory,
    {
      cycle: 4,
      workoutNumber: 9,
      lift: 'Deadlift',
      topWeight: 127.5,
      topReps: 4,
      e1rm: 145,
      workoutEffort: 'good',
      smartDayType: SMART_DAY_TYPES.TRAINING,
      workoutSnapshot: {
        number: 9,
        type: 'training',
        smartDayType: SMART_DAY_TYPES.TRAINING,
        completed: true,
        lifts: [{
          lift: 'Deadlift',
          sets: [{ reps: 4, weight: 127.5, done: true, failed: false, skipped: false }],
        }],
      },
    },
  ];

  expect(shouldAutomaticallyStartNextSmartCycle({
    trainingModel: TRAINING_MODELS.SMART,
    history: activeCycleHistory,
    currentCycle: 4,
  })).toBe(false);
  expect(buildAutomaticNextSmartCycle({
    trainingModel: TRAINING_MODELS.SMART,
    history: activeCycleHistory,
    currentCycle: 4,
    prs: { Squat: 147.5, Bench: 100, Deadlift: 180 },
    oneRMs: { Squat: 147.5, Bench: 100, Deadlift: 180 },
  })).toBeNull();
});

test('a recorded level cannot regress when the next Smart cycle starts', () => {
  const history = completedMeetAndRecoveryHistory();
  const transition = buildAutomaticNextSmartCycle({
    trainingModel: TRAINING_MODELS.SMART,
    currentCycle: 1,
    history,
    prs: { Squat: 45, Bench: 32.5, Deadlift: 60 },
    oneRMs: { Squat: 45, Bench: 32.5, Deadlift: 60 },
    bodyWeights: [{ cycle: 1, workoutNumber: 46, bodyWeight: 80 }],
    strengthRatioMaxes: { eStrengthMax: 6.1 },
    programProfile: 'kelaniSbd',
    accessoryMode: 'off',
    preparationMode: 'off',
    cooldownMode: 'off',
    smartIdealRouteStartCycle: 1,
  });

  expect(transition).not.toBeNull();
  expect(transition.workouts[0].smartIdealRoute.athleteLevel).toBe('advanced');
});
