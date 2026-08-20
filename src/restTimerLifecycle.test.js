import {
  createRestTimerNotificationQueue,
  hasMoreMeetSets,
  shouldPlayRestTimerInAppAlert,
} from './App';

test('Android uses only its notification sound while visible web uses the in-app alert', () => {
  expect(shouldPlayRestTimerInAppAlert({
    isNativePlatform: true,
    isDocumentHidden: false,
  })).toBe(false);
  expect(shouldPlayRestTimerInAppAlert({
    isNativePlatform: true,
    isDocumentHidden: true,
  })).toBe(false);
  expect(shouldPlayRestTimerInAppAlert({
    isNativePlatform: false,
    isDocumentHidden: false,
  })).toBe(true);
  expect(shouldPlayRestTimerInAppAlert({
    isNativePlatform: false,
    isDocumentHidden: true,
  })).toBe(false);
});

test('finishing one lift still starts rest when a later lift has work', () => {
  const workout = {
    lifts: [
      {
        lift: 'Bench',
        sets: [{ done: true }, { done: false }],
      },
      {
        lift: 'Squat',
        warmups: [{ done: false }],
        sets: [{ done: false }],
      },
    ],
    accessories: [],
  };

  expect(hasMoreMeetSets(workout, 0, 1)).toBe(true);
});

test('the timer stops only after every later lift and accessory is complete', () => {
  const completedWorkout = {
    lifts: [
      { lift: 'Bench', sets: [{ done: true }] },
      {
        lift: 'Squat',
        prepItems: [{ done: true }],
        warmups: [{ done: true }],
        sets: [{ done: true }],
      },
    ],
    accessories: [{ done: [true, true] }],
  };
  const pendingAccessoryWorkout = {
    ...completedWorkout,
    accessories: [{ done: [true, false] }],
  };

  expect(hasMoreMeetSets(completedWorkout, 0, 0)).toBe(false);
  expect(hasMoreMeetSets(pendingAccessoryWorkout, 0, 0)).toBe(true);
});

test('notification scheduling and cancellation cannot overtake each other', async () => {
  const queue = createRestTimerNotificationQueue();
  const events = [];
  let releaseSchedule;
  let markScheduleStarted;
  const scheduleGate = new Promise(resolve => {
    releaseSchedule = resolve;
  });
  const scheduleStarted = new Promise(resolve => {
    markScheduleStarted = resolve;
  });

  const scheduling = queue(async () => {
    events.push('schedule-start');
    markScheduleStarted();
    await scheduleGate;
    events.push('schedule-finish');
  });
  const cancelling = queue(async () => {
    events.push('cancel');
  });

  await scheduleStarted;
  expect(events).toEqual(['schedule-start']);

  releaseSchedule();
  await Promise.all([scheduling, cancelling]);

  expect(events).toEqual(['schedule-start', 'schedule-finish', 'cancel']);
});
