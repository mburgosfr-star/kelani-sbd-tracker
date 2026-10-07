import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import App from './App';

const native = vi.hoisted(() => ({ callback: null, retained: null, remove: vi.fn() }));

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
      cancel: async () => {},
    } : actual.registerPlugin(name),
  };
});
vi.mock('@capacitor/app', () => ({ App: {
  addListener: async () => ({ remove: vi.fn() }),
  getInfo: async () => ({ version: '2.0.47', build: '147' }),
} }));
vi.mock('./calendarNative', () => ({ isNativeCalendarAvailable: () => false }));

const navigationKey = 'kelani-sbd-tracker-navigation-state';
const dataKey = 'kel-powerlifting-user-data-v1';

beforeEach(() => {
  native.callback = null;
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
