import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { canSwitchClassicToSmart, capRunningBestChart, formatWorkoutSetPercentDisplay, getDashboardE1RMPrGain, getDashboardMeetState, isDashboardE1RMPR, replaceCurrentChartEndpoint, shouldShowAutomaticBackupStatus } from './App';

test('dashboard e1RM PR gain compares against the real 1RM on the same card', () => {
  expect(getDashboardE1RMPrGain(100, 97.5)).toBe(2.5);
  expect(getDashboardE1RMPrGain(150, 142.5)).toBe(7.5);
  expect(getDashboardE1RMPrGain(180, 180)).toBe(0);
});

test('rounded seed e1RMs do not create a false dashboard PR', () => {
  expect(isDashboardE1RMPR({ achievedE1RM: 38.5, oneRM: 42.5 })).toBe(false);
  expect(isDashboardE1RMPR({ achievedE1RM: 43, oneRM: 42.5 })).toBe(true);
  expect(isDashboardE1RMPR({
    achievedE1RM: 181.3333333333,
    displayedE1RM: 180,
    oneRM: 180,
  })).toBe(false);
});

test('only the current graph endpoint adopts the rounded live e1RM', () => {
  const history = [
    { label: 'C3W39', e1rm: 176 },
    { label: 'C3W46', e1rm: 181.3333333333 },
  ];

  expect(replaceCurrentChartEndpoint(history, { e1rm: 180 })).toEqual([
    { label: 'C3W39', e1rm: 176 },
    { label: 'C3W46', e1rm: 180 },
  ]);
  expect(history[1].e1rm).toBeCloseTo(181.3333333333);
});

test('rounding the current endpoint can never lower a running-best graph', () => {
  const history = [
    { label: 'C3W33', oneRM: 97.5, e1rm: 101.3333333333 },
    { label: 'C3W46', oneRM: 97.5, e1rm: 101.3333333333 },
  ];

  expect(replaceCurrentChartEndpoint(history, {
    oneRM: 97.5,
    e1rm: 100,
  })).toEqual([
    history[0],
    { label: 'C3W46', oneRM: 97.5, e1rm: 101.3333333333 },
  ]);
});

test('the canonical current e1RM permanently caps older raw running-best points', () => {
  const history = [
    { label: 'C3W39', e1rm: 176 },
    { label: 'C3W46', e1rm: 181.3333333333 },
    { label: 'C3W48', e1rm: 181.3333333333 },
  ];

  expect(capRunningBestChart(history, 'e1rm', 180)).toEqual([
    { label: 'C3W39', e1rm: 176 },
    { label: 'C3W46', e1rm: 180 },
    { label: 'C3W48', e1rm: 180 },
  ]);
});

test('automatic emergency-backup status is shown only in the native app', () => {
  expect(shouldShowAutomaticBackupStatus(true)).toBe(true);
  expect(shouldShowAutomaticBackupStatus(false)).toBe(false);
});

test('meet day focuses the dashboard and hides route to meet', () => {
  expect(getDashboardMeetState({ type: 'meet', smartDayType: 'meet' })).toEqual({
    isMeetDay: true,
    hideRouteToMeet: true,
  });
});

test('post-meet recovery restores the dashboard but keeps route to meet hidden', () => {
  expect(getDashboardMeetState({
    type: 'rest',
    smartDayType: 'recovery',
    smartDecisionSummary: { reason: 'post-meet-recovery' },
  })).toEqual({
    isMeetDay: false,
    hideRouteToMeet: true,
  });
});

test('a normal workout in the new cycle restores route to meet', () => {
  expect(getDashboardMeetState({
    type: 'training',
    smartDayType: 'training',
  })).toEqual({
    isMeetDay: false,
    hideRouteToMeet: false,
  });
});

test('meet attempts show their exact percentages instead of rounded duplicate 100% labels', () => {
  expect(formatWorkoutSetPercentDisplay({ labelKey: 'opener', pct: 0.9 })).toBe('90');
  expect(formatWorkoutSetPercentDisplay({ labelKey: 'secondAttempt', pct: 0.975 })).toBe('97.5');
  expect(formatWorkoutSetPercentDisplay({ labelKey: 'thirdAttempt', pct: 1.025 })).toBe('102.5');
});

beforeAll(() => {
  Object.defineProperty(window, 'scrollTo', {
    value: jest.fn(),
    writable: true,
  });
});

test('renders the Kelani splash screen', () => {
  render(<App />);
  expect(screen.getByAltText('Kelani')).toBeInTheDocument();
});

test('offers backup import directly from the compact setup actions', async () => {
  localStorage.clear();
  render(<App />);

  expect(await screen.findByRole(
    'button',
    { name: 'Import backup' },
    { timeout: 3000 }
  )).toBeInTheDocument();
});

test('new setup offers Smart directly without a Classic model choice', async () => {
  localStorage.clear();
  render(<App />);

  await screen.findByText('Start with Smart Training', {}, { timeout: 3000 });
  expect(screen.queryByText('Kelani SBD Classic')).not.toBeInTheDocument();
  expect(screen.queryByText('Choose training model')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Body weight')).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: 'Squat Weight' })).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: 'Bench Weight' })).toBeInTheDocument();
  expect(screen.getByRole('spinbutton', { name: 'Deadlift Weight' })).toBeInTheDocument();
  expect(screen.queryByText('Profile')).not.toBeInTheDocument();
  expect(screen.queryByText('Body data')).not.toBeInTheDocument();
});

test('Classic can switch only before the current workout has user progress', () => {
  expect(canSwitchClassicToSmart('classic', {
    sets: [{ reps: 5, weight: 100, originalWeight: 100, done: false }],
  })).toBe(true);
  expect(canSwitchClassicToSmart('classic', {
    sets: [{ reps: 5, weight: 100, originalWeight: 100, done: true }],
  })).toBe(false);
  expect(canSwitchClassicToSmart('classic', {
    prepItems: [{ key: 'brace', done: true }],
  })).toBe(false);
  expect(canSwitchClassicToSmart('classic', {
    accessories: [{ done: [false, true] }],
  })).toBe(false);
  expect(canSwitchClassicToSmart('classic', {
    cooldownItems: [{ key: 'walk', done: true }],
  })).toBe(false);
  expect(canSwitchClassicToSmart('smart', {})).toBe(false);
});

test('finishing the compact setup creates a Smart user with body weight and starting maxes', async () => {
  localStorage.clear();
  render(<App />);

  await screen.findByText('Start with Smart Training', {}, { timeout: 3000 });
  fireEvent.change(screen.getByLabelText('Body weight'), {
    target: { value: '80' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Squat Weight' }), {
    target: { value: '100' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Squat Reps' }), {
    target: { value: '5' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Bench Weight' }), {
    target: { value: '75' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Deadlift Weight' }), {
    target: { value: '125' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));

  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem('kel-powerlifting-user-data-v1'));
    expect(saved.trainingModel).toBe('smart');
    expect(saved.userProfile).toEqual({ weightUnit: 'kg', trainingModel: 'smart' });
    expect(saved.prs.Squat).toBe(115);
    expect(saved.bodyWeights[0].bodyWeight).toBe(80);
  });
});

test('an existing Classic user keeps Classic and can make the one-way switch to Smart', async () => {
  localStorage.clear();
  localStorage.setItem('kel-powerlifting-user-data-v1', JSON.stringify({
    version: 1,
    trainingModel: 'classic',
    currentCycle: 1,
    prs: { Squat: 100, Bench: 75, Deadlift: 125 },
    history: [
      { workoutNumber: 0, cycle: 0, seedMax: true, lift: 'Squat', topWeight: 100, topReps: 1, e1rm: 100 },
      { workoutNumber: 0, cycle: 0, seedMax: true, lift: 'Bench', topWeight: 75, topReps: 1, e1rm: 75 },
      { workoutNumber: 0, cycle: 0, seedMax: true, lift: 'Deadlift', topWeight: 125, topReps: 1, e1rm: 125 },
    ],
  }));
  render(<App />);

  fireEvent.click(await screen.findByRole(
    'button',
    { name: 'Settings' },
    { timeout: 3000 }
  ));
  expect(screen.getByText('Model')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Classic' }));
  expect(screen.getByText('Switch to Smart Training')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Switch permanently to Smart' }));

  await waitFor(() => {
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem('kel-powerlifting-user-data-v1'));
    expect(saved.trainingModel).toBe('smart');
  });
});
