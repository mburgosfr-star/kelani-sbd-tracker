import { readProfile } from './workoutPersistence';
import React from 'react';
import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import App, { WeightUnitSection, buildBackupPayload, validateImportedBackup, buildSuggestedMeetPlan } from './App';
import { translations } from './translations';
import { LEGACY_WEIGHT_ROUNDING, uniformWeightRounding } from './weightRounding';
const key = 'kel-powerlifting-user-data-v1';

test.each(['en', 'nl', 'ca'])('%s weights dialog explains the preserved mixed setting and offers exactly two rounding choices', language => {
  localStorage.setItem('language', language);
  const setWeightRounding = vi.fn(); const t = translations[language];
  render(<WeightUnitSection weightUnit="kg" setWeightUnit={() => {}} weightRounding={LEGACY_WEIGHT_ROUNDING}
    setWeightRounding={setWeightRounding} t={t} />);
  fireEvent.click(screen.getByRole('button', { name: /kg ·/ }));
  expect(screen.getByRole('heading', { name: t.weightsSettingsTitle })).toBeInTheDocument();
  expect(screen.getByText(t.weightRoundingHelp)).toBeInTheDocument();
  const fine = screen.getByRole('button', { name: /^0[.,]5 kg$/ });
  const coarse = screen.getByRole('button', { name: /^2[.,]5 kg$/ });
  expect(fine).toHaveAttribute('aria-pressed', 'false');
  expect(coarse).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(fine); expect(setWeightRounding).toHaveBeenLastCalledWith({ training: 0.5, meet: 0.5 });
  fireEvent.click(coarse); expect(setWeightRounding).toHaveBeenLastCalledWith({ training: 2.5, meet: 2.5 });
});

test('existing profile keeps its loads on upgrade, then an explicit choice survives reload and backup', async () => {
  localStorage.clear(); localStorage.setItem('language', 'en');
  localStorage.setItem(key, JSON.stringify({ version: 1, trainingModel: 'smart', currentCycle: 2,
    showWhatsNewAfterUpdates: false, prs: { Squat: 157.5, Bench: 104, Deadlift: 184 },
    oneRMs: { Squat: 157.5, Bench: 102.5, Deadlift: 180 }, history: [] }));
  const view = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 5000 }));
  await waitFor(() => expect(readProfile(localStorage).weightRounding).toEqual(LEGACY_WEIGHT_ROUNDING));
  const before = readProfile(localStorage);
  const loadBefore = before.inProgress.workouts[0].lifts.find(l => l.lift === 'Bench')?.sets[0].weight;
  fireEvent.click(screen.getByRole('button', { name: /kg ·/ }));
  fireEvent.click(screen.getByRole('button', { name: '2.5 kg' }));
  await waitFor(() => expect(readProfile(localStorage).weightRounding).toEqual(uniformWeightRounding(2.5)));
  const after = readProfile(localStorage);
  expect(after.history).toEqual(before.history); expect(after.prs).toEqual(before.prs); expect(after.oneRMs).toEqual(before.oneRMs);
  expect(after.inProgress.workouts[0].lifts.every(l => l.sets.every(s => Number.isInteger(s.weight / 2.5)))).toBe(true);
  expect(loadBefore).toBeDefined();
  const backup = JSON.parse(JSON.stringify(buildBackupPayload(after)));
  expect(validateImportedBackup(backup)).toBe(true);
  expect(backup.data.weightRounding).toEqual({ training: 2.5, meet: 2.5 });
  const malformed = structuredClone(backup); malformed.data.weightRounding.training = 1;
  expect(validateImportedBackup(malformed)).toBe(false);
  view.unmount(); render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 5000 }));
  await waitFor(() => expect(readProfile(localStorage).weightRounding).toEqual(uniformWeightRounding(2.5)));
  expect(screen.getByRole('button', { name: /kg · 2.5/ })).toBeInTheDocument();
}, 20000);

test('Dashboard meet plan uses the setting and preserves manual and started attempts', () => {
  const stats = { Bench: { oneRM: 102.5, e1RM: 104 } };
  const plan = policy => buildSuggestedMeetPlan(stats, { trainingModel: 'smart', weightRounding: policy }).meetPlan.find(l => l.lift === 'Bench');
  expect(plan(uniformWeightRounding(0.5)).third).toBe(104);
  expect(plan(uniformWeightRounding(2.5)).third).toBe(105);
  expect(buildSuggestedMeetPlan(stats, { trainingModel: 'smart', weightRounding: uniformWeightRounding(2.5),
    manualAttempts: { Bench: { thirdAttempt: 104 } } }).meetPlan.find(l => l.lift === 'Bench').third).toBe(104);
  const started = { type: 'meet', lifts: [{ lift: 'Bench', sets: [
    { labelKey: 'opener', weight: 93.5, done: true }, { labelKey: 'secondAttempt', weight: 99 }, { labelKey: 'thirdAttempt', weight: 104 } ] }] };
  expect(buildSuggestedMeetPlan(stats, { trainingModel: 'smart', weightRounding: uniformWeightRounding(2.5), startedMeet: started })
    .meetPlan.find(l => l.lift === 'Bench')).toMatchObject({ opener: 93.5, second: 99, third: 104 });
});

test('weight limits save, constrain only excessive loads, and survive backup and reload', async () => {
  localStorage.clear(); localStorage.setItem('language', 'en');
  localStorage.setItem(key, JSON.stringify({ version: 1, trainingModel: 'smart', currentCycle: 2,
    showWhatsNewAfterUpdates: false, prs: { Squat: 200, Bench: 140, Deadlift: 220 },
    oneRMs: { Squat: 200, Bench: 140, Deadlift: 220 }, history: [], bodyWeights: [{ bodyWeight: 80 }] }));
  const view = render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 5000 }));
  const before = readProfile(localStorage);
  fireEvent.click(screen.getByRole('button', { name: /kg ·/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Weight limits' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Squat (kg)' }), { target: { value: '100' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Total bench capacity (kg)' }), { target: { value: '180' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(readProfile(localStorage).weightLimits.Squat).toBe(100));
  const after = readProfile(localStorage);
  expect(after.history).toEqual(before.history);
  expect(after.prs).toEqual(before.prs);
  expect(after.oneRMs).toEqual(before.oneRMs);
  for (const workout of after.inProgress.workouts.filter(w => w.type === 'training')) {
    for (const lift of workout.lifts || [workout]) {
      if (lift.lift !== 'Deadlift') expect(lift.sets.every(set => set.weight <= 100)).toBe(true);
    }
  }
  const backup = JSON.parse(JSON.stringify(buildBackupPayload(after)));
  expect(validateImportedBackup(backup)).toBe(true);
  expect(backup.data.weightLimits.benchCapacity).toBe(180);
  backup.data.weightLimits.Bench = -1;
  expect(validateImportedBackup(backup)).toBe(false);
  view.unmount(); render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 5000 }));
  fireEvent.click(screen.getByRole('button', { name: /kg ·/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Weight limits' }));
  expect(screen.getByRole('textbox', { name: 'Squat (kg)' })).toHaveValue('100');
  expect(screen.getByRole('textbox', { name: 'Total bench capacity (kg)' })).toHaveValue('180');
}, 20000);
