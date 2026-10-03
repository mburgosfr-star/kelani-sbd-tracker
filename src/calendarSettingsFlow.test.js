import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

vi.mock('./calendarNative', () => ({
  isNativeCalendarAvailable: () => true,
  getCalendarPermissionState: async () => 'granted',
  requestCalendarPermission: async () => 'granted',
  getWritableDeviceCalendars: async () => [
    { id: '7', name: 'Training', accountName: 'local' },
  ],
  upsertDeviceWorkoutEvent: async () => '42',
  deleteDeviceWorkoutEvent: async () => {},
}));

const storageKey = 'kel-powerlifting-user-data-v1';

test('Calendar settings are available from Settings, persist and restore without a Program button', async () => {
  localStorage.clear();
  localStorage.setItem(storageKey, JSON.stringify({
    version: 1,
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

  await waitFor(() => {
    expect(JSON.parse(localStorage.getItem(storageKey)).calendarIntegration).toMatchObject({
      enabled: true,
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
  expect(screen.getByLabelText('Default start time')).toHaveValue('19:30');
}, 10000);
