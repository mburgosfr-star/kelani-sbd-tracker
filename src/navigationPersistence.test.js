import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

const key = 'kel-powerlifting-user-data-v1';

test('navigation does not rewrite training data; changed settings persist and survive reload', async () => {
  localStorage.clear();
  localStorage.setItem('language', 'en');
  localStorage.setItem(key, JSON.stringify({
    version: 1,
    trainingModel: 'smart',
    currentCycle: 1,
    showWhatsNewAfterUpdates: false,
    prs: { Squat: 100, Bench: 75, Deadlift: 125 },
    oneRMs: { Squat: 100, Bench: 75, Deadlift: 125 },
    history: ['Squat', 'Bench', 'Deadlift'].map((lift, index) => ({
      cycle: 0, workoutNumber: 0, seedMax: true, lift,
      topWeight: [100, 75, 125][index], e1rm: [100, 75, 125][index],
    })),
  }));
  const view = render(<App />);
  await screen.findByRole('button', { name: 'Settings' }, { timeout: 5000 });
  const previous = localStorage.getItem(key);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  try {
    for (const label of ['Settings', 'Statistics', 'Program', 'Dashboard', 'Workout', 'Settings']) {
      fireEvent.click(screen.getByRole('button', { name: label }));
    }
    expect(write.mock.calls.filter(([storageKey]) => storageKey === key)).toHaveLength(0);
    expect(localStorage.getItem(key)).toBe(previous);
    fireEvent.click(screen.getByRole('button', { name: 'kg' }));
    fireEvent.click(screen.getByRole('button', { name: 'lb' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(key)).weightUnit).toBe('lb'));
    expect(write.mock.calls.some(([storageKey]) => storageKey === key)).toBe(true);
    view.unmount();
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }, { timeout: 5000 }));
    expect(screen.getByRole('button', { name: 'lb' })).toBeInTheDocument();
  } finally {
    write.mockRestore();
  }
}, 15000);
