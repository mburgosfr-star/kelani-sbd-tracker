import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import App from './App';
import { translations } from './translations';

const native = vi.hoisted(() => ({ callback: null, appStateCallback: null, retained: null, remove: vi.fn() }));

vi.mock('@capacitor/core', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    Capacitor: { ...actual.Capacitor, isNativePlatform: () => true },
    registerPlugin: name => name === 'RestTimerAlarm' ? {
      addListener: async (event, callback) => {
        expect(event).toBe('notificationTapped');
        native.callback = callback;
        if (native.retained) {
          const retained = native.retained;
          native.retained = null;
          callback(retained);
        }
        return { remove: native.remove };
      },
      ensureChannel: async () => {},
      getPending: async () => ({ pending: false }),
      schedule: async () => ({ scheduled: true }),
      cancel: async () => {},
    } : actual.registerPlugin(name),
  };
});
vi.mock('@capacitor/app', () => ({ App: {
  addListener: async (event, callback) => {
    if (event === 'appStateChange') native.appStateCallback = callback;
    return { remove: vi.fn() };
  },
  getInfo: async () => ({ version: '2.0.47', build: '147' }),
} }));
vi.mock('./calendarNative', () => ({ isNativeCalendarAvailable: () => false }));
vi.mock('@capacitor/filesystem', async importOriginal => ({
  ...await importOriginal(),
  Filesystem: { writeFile: async () => ({ uri: 'test-backup.json' }) },
}));

const navigationKey = 'kelani-sbd-tracker-navigation-state';
const dataKey = 'kel-powerlifting-user-data-v1';

beforeEach(() => {
  native.callback = null;
  native.appStateCallback = null;
  native.retained = null;
  native.remove.mockClear();
  localStorage.clear();
  localStorage.setItem(dataKey, JSON.stringify({
    version: 1, trainingModel: 'classic', currentCycle: 1,
    prs: { Squat: 100, Bench: 75, Deadlift: 125 }, history: [],
    showWhatsNewAfterUpdates: false,
  }));
  localStorage.setItem(navigationKey, JSON.stringify({ screen: 'settings', selectedIndex: 5 }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function expectCurrentWorkout() {
  expect(JSON.parse(localStorage.getItem(navigationKey))).toEqual({ screen: 'current', selectedIndex: 0 });
}

test('tapping an expired rest alert opens the current Workout from Settings and dismisses Calendar', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Set up calendar' }, { timeout: 3000 }));
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  await act(async () => { native.callback({ id: 1208 }); });
  await waitFor(expectCurrentWorkout);
  expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(dataKey)).history).toEqual([]);
});

test('a retained cold-start rest alert overrides restored Settings after loading the profile', async () => {
  native.retained = { id: 1208 };
  const view = render(<App />);
  await waitFor(expectCurrentWorkout);
  await screen.findByRole('button', { name: 'Workout' }, { timeout: 3000 });
  view.unmount();
  expect(native.remove).toHaveBeenCalled();
  expect(native.retained).toBeNull();
});

test('the diagnostic alert does not navigate away from Settings', async () => {
  render(<App />);
  await screen.findByRole('button', { name: 'Set up calendar' }, { timeout: 3000 });
  await act(async () => { native.callback({ id: 1209 }); });
  expect(JSON.parse(localStorage.getItem(navigationKey)).screen).toBe('settings');
});

test.each([true, false])('Android keeps the ready message when rest expires %s before backgrounding', async expiresBeforeBackground => {
  let now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const timerKey = 'kelani-sbd-tracker-active-rest-timer';
  localStorage.setItem(timerKey, JSON.stringify({
    id: now,
    seconds: 60,
    endTime: now + 60_000,
    placement: { workoutNumber: 1, type: 'meetSet', liftIndex: 0, index: 0 },
  }));
  render(<App />);
  await screen.findByRole('button', { name: 'Workout' }, { timeout: 3000 });
  await waitFor(() => expect(native.appStateCallback).toBeTypeOf('function'));

  if (expiresBeforeBackground) {
    now += 61_000;
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.getByText(translations.en.readyNextSet)).toBeInTheDocument();
  }
  await act(async () => native.appStateCallback({ isActive: false }));
  if (!expiresBeforeBackground) now += 61_000;
  await act(async () => {
    native.appStateCallback({ isActive: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(localStorage.getItem(timerKey)).toBeNull();
  expect(screen.getByText(translations.en.readyNextSet)).toBeInTheDocument();

  // Repeated resume events must not consume the ready message either.
  await act(async () => native.appStateCallback({ isActive: true }));
  expect(screen.getByText(translations.en.readyNextSet)).toBeInTheDocument();
});
