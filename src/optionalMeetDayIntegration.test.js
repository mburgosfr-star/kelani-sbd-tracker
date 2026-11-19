import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import App, { buildBackupPayload, validateImportedBackup } from './App';

const key = 'kel-powerlifting-user-data-v1';

test('legacy default remains enabled; disabling in Settings survives backup and reload', async () => {
  localStorage.clear(); localStorage.setItem('language', 'en');
  localStorage.setItem(key, JSON.stringify({ version: 1, trainingModel: 'smart', currentCycle: 1,
    showWhatsNewAfterUpdates: false, prs: { Squat: 160, Bench: 100, Deadlift: 200 }, history: [] }));
  const view = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 5000 }));
  fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
  const checkbox = screen.getByRole('checkbox', { name: 'Include meet day' });
  expect(checkbox).toBeChecked();
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(key)).workoutSetup.meetDayEnabled).toBe(false));
  const saved = JSON.parse(localStorage.getItem(key));
  expect(saved.inProgress.workouts.some(workout => workout.type === 'meet')).toBe(false);
  expect(saved.inProgress.workouts.some(workout => workout.cycleClosingTaper)).toBe(true);
  const backup = buildBackupPayload(saved);
  expect(validateImportedBackup(backup)).toBe(true);
  const invalid = structuredClone(backup); invalid.data.workoutSetup.meetDayEnabled = 'false';
  expect(validateImportedBackup(invalid)).toBe(false);
  view.unmount(); render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Dashboard' }, { timeout: 5000 }));
  expect(screen.queryByTestId('dashboard-expected-meet-date')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
  expect(screen.getByRole('checkbox', { name: 'Include meet day' })).not.toBeChecked();
}, 20000);

test('onboarding can start a profile without a meet day', async () => {
  localStorage.clear(); localStorage.setItem('language', 'en');
  render(<App />);
  await screen.findByText('Start with Smart Training', {}, { timeout: 5000 });
  fireEvent.change(screen.getByLabelText('Body weight'), { target: { value: '80' } });
  for (const [lift, weight] of [['Squat', '100'], ['Bench', '75'], ['Deadlift', '125']]) {
    fireEvent.change(screen.getByRole('spinbutton', { name: `${lift} Weight` }), { target: { value: weight } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Training approach' }), { target: { value: 'powerbuilding' } });
  expect(screen.getByRole('checkbox', { name: 'Include meet day' })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Include meet day' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(key))?.workoutSetup.meetDayEnabled).toBe(false));
  expect(JSON.parse(localStorage.getItem(key)).inProgress.workouts.some(workout => workout.type === 'meet')).toBe(false);
  expect(JSON.parse(localStorage.getItem(key)).workoutSetup.trainingApproach).toBe('powerbuilding');
}, 20000);


test('Settings changes approach and retains it in backups and reload', async () => {
  localStorage.clear(); localStorage.setItem('language', 'en');
  localStorage.setItem(key, JSON.stringify({ version: 1, trainingModel: 'smart', currentCycle: 1,
    showWhatsNewAfterUpdates: false, prs: { Squat: 160, Bench: 100, Deadlift: 200 }, history: [] }));
  const view = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 5000 }));
  fireEvent.click(screen.getByRole('button', { name: /^Balanced SBD Route$/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Training approach' }), { target: { value: 'powerbuilding' } });
  await waitFor(() => expect(JSON.parse(localStorage.getItem(key)).workoutSetup.trainingApproach).toBe('powerbuilding'));
  const saved = JSON.parse(localStorage.getItem(key));
  expect(validateImportedBackup(buildBackupPayload(saved))).toBe(true);
  const invalid = buildBackupPayload(saved); invalid.data.workoutSetup.trainingApproach = 'unknown';
  expect(validateImportedBackup(invalid)).toBe(false);
  view.unmount(); render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 5000 }));
  fireEvent.click(screen.getByRole('button', { name: /Balanced SBD Route.*Powerbuilding/ }));
  expect(screen.getByRole('combobox', { name: 'Training approach' })).toHaveValue('powerbuilding');
}, 20000);
