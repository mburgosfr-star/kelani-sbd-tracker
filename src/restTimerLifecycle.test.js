import {
  createRestTimerNotificationQueue,
  getRestTimerNotificationChannelStatus,
  hasMoreMeetSets,
  normalizeRestTimerDoNotDisturbStatus,
  shouldPlayRestTimerInAppAlert,
} from './App';
import { translations } from './translations';

test('rest timer diagnostics report the actual Android channel settings', () => {
  expect(getRestTimerNotificationChannelStatus([
    {
      id: 'kelani_rest_timer_v4',
      sound: 'android.resource://com.kelani.sbdtracker/raw/kelani_rest_timer_quiet',
      vibration: true,
      importance: 5,
    },
  ])).toEqual({
    found: true,
    soundEnabled: true,
    vibrationEnabled: true,
    importance: 5,
    importanceSufficient: true,
  });
});

test('rest timer diagnostics expose muted or missing Android channels', () => {
  expect(getRestTimerNotificationChannelStatus([
    {
      id: 'kelani_rest_timer_v4',
      sound: null,
      vibration: false,
      importance: 2,
    },
  ])).toEqual({
    found: true,
    soundEnabled: false,
    vibrationEnabled: false,
    importance: 2,
    importanceSufficient: false,
  });

  expect(getRestTimerNotificationChannelStatus([])).toEqual({
    found: false,
    soundEnabled: null,
    vibrationEnabled: null,
    importance: null,
    importanceSufficient: null,
  });
});

test('rest timer diagnostics identify active Android Do Not Disturb modes', () => {
  expect(normalizeRestTimerDoNotDisturbStatus({
    available: true,
    interruptionFilter: 'all',
    channelCanBypassDoNotDisturb: false,
  })).toEqual({
    available: true,
    filter: 'all',
    active: false,
    channelCanBypassDoNotDisturb: false,
  });

  expect(normalizeRestTimerDoNotDisturbStatus({
    available: true,
    interruptionFilter: 'priority',
  })).toEqual({
    available: true,
    filter: 'priority',
    active: true,
    channelCanBypassDoNotDisturb: null,
  });

  expect(normalizeRestTimerDoNotDisturbStatus(null)).toEqual({
    available: false,
    filter: 'unknown',
    active: null,
    channelCanBypassDoNotDisturb: null,
  });
});

test.each(['nl', 'en', 'ca'])('rest timer channel diagnostics are translated in %s', language => {
  expect(translations[language]).toMatchObject({
    restTimerNotificationsLabel: expect.any(String),
    restTimerExactAlarmsLabel: expect.any(String),
    restTimerChannelLabel: expect.any(String),
    restTimerSoundLabel: expect.any(String),
    restTimerVibrationLabel: expect.any(String),
    restTimerImportanceLabel: expect.any(String),
    restTimerDndLabel: expect.any(String),
    restTimerDndOff: expect.any(String),
    restTimerDndPriority: expect.any(String),
    restTimerDndAlarms: expect.any(String),
    restTimerDndNone: expect.any(String),
    restTimerDndWarning: expect.any(String),
    restTimerOpenDndSettings: expect.any(String),
    restTimerStatusOn: expect.any(String),
    restTimerStatusOff: expect.any(String),
    restTimerStatusMissing: expect.any(String),
    restTimerStatusUnknown: expect.any(String),
  });
});

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
