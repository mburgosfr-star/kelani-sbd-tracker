import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

const calendarMocks = vi.hoisted(() => ({
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  permission: vi.fn().mockResolvedValue('granted'),
}));

vi.mock('./calendarNative', () => ({
  isNativeCalendarAvailable: () => true,
  getCalendarPermissionState: calendarMocks.permission,
  requestCalendarPermission: async () => 'granted',
  getWritableDeviceCalendars: async () => [
    { id: '7', name: 'Training', accountName: 'local' },
  ],
  upsertDeviceWorkoutEvent: async () => '42',
  ensureDeviceWorkoutEventReminder: async () => {},
  deleteDeviceWorkoutEvent: calendarMocks.deleteEvent,
}));

const storageKey = 'kel-powerlifting-user-data-v1';

test('Calendar settings are available from Settings, persist and restore without a Program button', async () => {
  localStorage.clear();
  localStorage.setItem(storageKey, JSON.stringify({
    version: 1,
    showWhatsNewAfterUpdates: false,
    trainingModel: 'classic',
    currentCycle: 1,
    prs: { Squat: 100, Bench: 75, Deadlift: 125 },
    history: [],
  }));

  const view = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Program' }, { timeout: 3000 }));
  expect(screen.queryByRole('button', { name: 'Set up calendar' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set up calendar' }));
  const calendarPicker = await screen.findByRole('button', { name: 'Choose a calendar' });
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(calendarPicker);
  fireEvent.click(screen.getByRole('button', { name: 'Training (local)' }));
  fireEvent.change(screen.getByLabelText('Default start time'), { target: { value: '19:30' } });
  expect(screen.getByLabelText('Enable calendar integration')).toBeChecked();
  expect(screen.getByLabelText('Delete completed workouts from calendar')).not.toBeChecked();
  fireEvent.click(screen.getByLabelText('Delete completed workouts from calendar'));

  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem(storageKey)).calendarIntegration).toMatchObject({
      enabled: true,
      deleteCompletedWorkouts: true,
      hasSynced: false,
      calendarId: '7',
      calendarName: 'Training',
      defaultStartTime: '19:30',
    });
  });

  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem(storageKey)).calendarIntegration.hasSynced).toBe(true);
  });

  view.unmount();
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 3000 }));
  fireEvent.click(screen.getByRole('button', { name: 'Set up calendar' }));
  expect(await screen.findByLabelText('Enable calendar integration')).toBeChecked();
  expect(screen.getByLabelText('Delete completed workouts from calendar')).toBeChecked();
  expect(screen.getByLabelText('Default start time')).toHaveValue('19:30');
}, 10000);

test('enabling completed cleanup automatically deletes a mapped completed workout from an older cycle', async () => {
  localStorage.clear();
  calendarMocks.deleteEvent.mockClear();
  localStorage.setItem('kelani-calendar-sync-consent-v1', '1');
  localStorage.setItem(storageKey, JSON.stringify({
    version: 1, showWhatsNewAfterUpdates: false, trainingModel: 'classic', currentCycle: 2,
    prs: { Squat: 100, Bench: 75, Deadlift: 125 },
    history: [{ cycle: 1, workoutNumber: 28, lift: 'Squat', weight: 100, reps: 1 }],
    calendarIntegration: {
      enabled: true, calendarId: '7', calendarName: 'Training', calendarAccountName: 'local',
      hasSynced: true, deleteCompletedWorkouts: false,
      eventMappings: [{ cycleId: 1, workoutId: 28, calendarId: '7', eventId: '42', syncedDate: '2026-01-01' }],
    },
  }));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 3000 }));
  fireEvent.click(screen.getByRole('button', { name: 'Set up calendar' }));
  const checkbox = await screen.findByLabelText('Delete completed workouts from calendar');
  await waitFor(() => expect(checkbox).not.toBeDisabled());
  expect(checkbox).not.toBeChecked();
  expect(calendarMocks.deleteEvent).not.toHaveBeenCalled();
  fireEvent.click(checkbox);
  await waitFor(() => expect(calendarMocks.deleteEvent).toHaveBeenCalledWith({
    cycleId: 1, workoutId: 28, calendarId: '7', eventId: '42',
  }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(storageKey)).calendarIntegration)
    .toMatchObject({ deleteCompletedWorkouts: true, eventMappings: [] }));
}, 10000);

async function openSavedCalendar() {
  localStorage.clear();
  localStorage.setItem(storageKey, JSON.stringify({
    version: 1, showWhatsNewAfterUpdates: false, trainingModel: 'classic', currentCycle: 1,
    prs: { Squat: 100, Bench: 75, Deadlift: 125 }, history: [],
    calendarIntegration: {
      enabled: true, calendarId: '7', calendarName: 'Training',
      calendarAccountName: 'local', hasSynced: false, eventMappings: [],
    },
  }));
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 3000 }));
  fireEvent.click(screen.getByRole('button', { name: 'Set up calendar' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).not.toBeDisabled());
}

test.each(['success', 'error'])('closing Calendar clears the %s message on reopening', async result => {
  await openSavedCalendar();
  if (result === 'error') calendarMocks.permission.mockResolvedValueOnce('denied');
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  const message = result === 'success'
    ? 'Calendar updated.' : 'Sync failed. Check the calendar and try again.';
  expect(await screen.findByText(message)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set up calendar' }));
  await screen.findByLabelText('Default start time');
  expect(screen.queryByText(message)).not.toBeInTheDocument();
}, 10000);

test.each(['granted', 'denied'])('a late sync result (%s) cannot appear in a reopened Calendar', async permission => {
  await openSavedCalendar();
  let finishPermission;
  calendarMocks.permission.mockImplementationOnce(() => new Promise(resolve => { finishPermission = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Set up calendar' }));
  await screen.findByLabelText('Default start time');
  await act(async () => { finishPermission(permission); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sync now' })).not.toBeDisabled());
  expect(screen.queryByText('Calendar updated.')).not.toBeInTheDocument();
  expect(screen.queryByText('Sync failed. Check the calendar and try again.')).not.toBeInTheDocument();
}, 10000);
