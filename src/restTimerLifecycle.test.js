import {
  classifyRestTimerTestStatus,
  createRestTimerNotificationQueue,
  getRestTimerNotificationChannelStatus,
  hasPendingNativeRestTimerAlarm,
  hasMoreWorkAfterMainSet,
  hasMoreMeetSets,
  normalizePersistedNavigationState,
  normalizePersistedRestTimerState,
  normalizeRestTimerDoNotDisturbStatus,
  resolveRestoredNavigationState,
  scheduleNativeRestTimerAlarmWithPermissions,
  shouldPlayRestTimerInAppAlert,
  shouldTriggerRestTimerWebAlert,
} from './App';
import { translations } from './translations';

test('active rest timers survive reloads but expired or malformed timers do not', () => {
  expect(normalizePersistedRestTimerState({
    id: 10,
    seconds: 180,
    endTime: 20_000,
    placement: { workoutNumber: 8, liftIndex: 0, setIndex: 1 },
  }, 10_000)).toEqual({
    id: 10,
    seconds: 180,
    endTime: 20_000,
    placement: { workoutNumber: 8, liftIndex: 0, setIndex: 1 },
  });

  expect(normalizePersistedRestTimerState({
    id: 10,
    seconds: 180,
    endTime: 10_000,
  }, 10_000)).toBeNull();
  expect(normalizePersistedRestTimerState('{broken json', 10_000)).toBeNull();
});

test('only stable main screens are restored and workout indexes stay in range', () => {
  expect(normalizePersistedNavigationState({
    screen: 'stats',
    selectedIndex: 7,
  }, 10)).toEqual({
    screen: 'stats',
    selectedIndex: 7,
  });

  expect(normalizePersistedNavigationState({
    screen: 'completed',
    selectedIndex: 99,
  }, 10)).toEqual({
    screen: 'dashboard',
    selectedIndex: 9,
  });
});

test('an active timer restores its workout instead of the dashboard', () => {
  expect(resolveRestoredNavigationState({
    navigation: { screen: 'dashboard', selectedIndex: 0 },
    activeTimer: {
      id: 10,
      seconds: 180,
      endTime: 20_000,
      placement: { workoutNumber: 8 },
    },
    workouts: [{ number: 7 }, { number: 8 }, { number: 9 }],
    fallbackSelectedIndex: 0,
  })).toEqual({
    screen: 'current',
    selectedIndex: 1,
  });
});

test('native alarm verification requires the Kelani id and exact deadline', () => {
  expect(hasPendingNativeRestTimerAlarm({
    pending: true,
    id: 1208,
    at: 20_000,
  }, 20_000)).toBe(true);
  expect(hasPendingNativeRestTimerAlarm({
    pending: true,
    id: 1208,
    at: 19_000,
  }, 20_000)).toBe(false);
  expect(hasPendingNativeRestTimerAlarm({
    pending: true,
    id: 99,
    at: 20_000,
  }, 20_000)).toBe(false);
  expect(hasPendingNativeRestTimerAlarm({
    pending: false,
    id: 1208,
    at: 20_000,
  }, 20_000)).toBe(false);
});

test('native rest timer scheduling is the first and only operation when permissions exist', async () => {
  const events = [];
  const result = await scheduleNativeRestTimerAlarmWithPermissions({
    nativeRequest: { at: 20_000 },
    scheduleAlarm: async request => {
      events.push(['schedule', request.at]);
      return { scheduled: true };
    },
    requestNotificationPermission: async () => {
      events.push(['notification-permission']);
      return { display: 'granted' };
    },
    requestExactAlarmPermission: async () => {
      events.push(['exact-alarm-permission']);
    },
  });

  expect(result).toEqual({ scheduled: true });
  expect(events).toEqual([['schedule', 20_000]]);
});

test('a fresh Android install can grant both permissions and then schedule', async () => {
  const events = [];
  let scheduleAttempt = 0;
  const result = await scheduleNativeRestTimerAlarmWithPermissions({
    nativeRequest: { at: 20_000 },
    scheduleAlarm: async () => {
      scheduleAttempt += 1;
      events.push(`schedule-${scheduleAttempt}`);
      if (scheduleAttempt === 1) {
        throw { code: 'NOTIFICATION_PERMISSION_REQUIRED' };
      }
      if (scheduleAttempt === 2) {
        throw { code: 'EXACT_ALARM_PERMISSION_REQUIRED' };
      }
      return { scheduled: true };
    },
    requestNotificationPermission: async () => {
      events.push('notification-permission');
      return { display: 'granted' };
    },
    requestExactAlarmPermission: async () => {
      events.push('exact-alarm-permission');
    },
  });

  expect(result).toEqual({ scheduled: true });
  expect(events).toEqual([
    'schedule-1',
    'notification-permission',
    'schedule-2',
    'exact-alarm-permission',
    'schedule-3',
  ]);
});

test('native alert self-test distinguishes scheduled, delivered and missed alarms', () => {
  const scheduled = {
    id: 1209,
    pending: true,
    scheduledAt: 10_000,
    targetAt: 25_000,
    deliveredAt: 0,
  };

  expect(classifyRestTimerTestStatus(scheduled, 15_000)).toBe('scheduled');
  expect(classifyRestTimerTestStatus({
    ...scheduled,
    pending: false,
    delivered: true,
    deliveredAt: 25_100,
  }, 26_000)).toBe('delivered');
  expect(classifyRestTimerTestStatus({
    ...scheduled,
    pending: false,
  }, 31_000)).toBe('not-delivered');
  expect(classifyRestTimerTestStatus({
    ...scheduled,
    id: 1208,
  }, 15_000)).toBe('idle');
});

test('web rest timer alerts depend on the deadline and visibility, not the active screen', () => {
  const timer = { id: 44, endTime: 10_000 };

  expect(shouldTriggerRestTimerWebAlert({
    timer,
    now: 10_000,
    isNativePlatform: false,
    isDocumentHidden: false,
  })).toBe(true);
  expect(shouldTriggerRestTimerWebAlert({
    timer,
    now: 10_000,
    isNativePlatform: false,
    isDocumentHidden: true,
  })).toBe(false);
  expect(shouldTriggerRestTimerWebAlert({
    timer,
    now: 10_000,
    isNativePlatform: true,
    isDocumentHidden: false,
  })).toBe(false);
  expect(shouldTriggerRestTimerWebAlert({
    timer,
    alertedTimerId: 44,
    now: 10_000,
    isNativePlatform: false,
    isDocumentHidden: false,
  })).toBe(false);
  expect(shouldTriggerRestTimerWebAlert({
    timer,
    now: 9_999,
    isNativePlatform: false,
    isDocumentHidden: false,
  })).toBe(false);
});

test('rest timer diagnostics report the actual Android channel settings', () => {
  expect(getRestTimerNotificationChannelStatus([
    {
      id: 'kelani_rest_timer_v5',
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
      id: 'kelani_rest_timer_v5',
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
    restTimerTestAlert: expect.any(String),
    restTimerTestNotificationTitle: expect.any(String),
    restTimerTestNotificationBody: expect.any(String),
    restTimerTestScheduled: expect.any(String),
    restTimerTestDelivered: expect.any(String),
    restTimerTestNotDelivered: expect.any(String),
    restTimerTestFailedToSchedule: expect.any(String),
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

test('finishing a lift does not start rest before the next lift', () => {
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

  expect(hasMoreMeetSets(workout, 0, 1)).toBe(false);
});

test('rest starts only when the same lift still has another main set', () => {
  const workout = {
    lifts: [
      { lift: 'Bench', sets: [{ done: false }, { done: false }] },
      {
        lift: 'Squat',
        prepItems: [{ done: false }],
        warmups: [{ done: false }],
        sets: [{ done: false }],
      },
    ],
    accessories: [{ done: [false, false] }],
  };

  expect(hasMoreMeetSets(workout, 0, 0)).toBe(true);
  expect(hasMoreMeetSets(workout, 0, 1)).toBe(false);
});

test('a flat workout also stops rest after its final main set', () => {
  const workout = {
    sets: [{ done: false }, { done: false }],
    accessories: [{ done: [false, false] }],
  };

  expect(hasMoreWorkAfterMainSet(workout, 0)).toBe(true);
  expect(hasMoreWorkAfterMainSet(workout, 1)).toBe(false);
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
