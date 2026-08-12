import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { SettingsListRow, StatsScreen, buildDashboardE1RMMetrics, canSwitchClassicToSmart, capRunningBestChart, compactPrepLabelStyle, formatWorkoutSetPercentDisplay, getDashboardE1RMPrGain, getDashboardE1RMValue, getDashboardMeetState, isDashboardE1RMPR, preparationGridStyle, regularSettingsClusterStyle, replaceCurrentChartEndpoint, restWorkoutScreenStyle, settingsModalPanelStyle, shouldShowAutomaticBackupStatus, statsScreenStyle, workoutCompletionButtonStyle } from './App';
import { translations } from './translations';

test('dashboard e1RM PR gain compares against the real 1RM on the same card', () => {
  expect(getDashboardE1RMPrGain(100, 97.5)).toBe(2.5);
  expect(getDashboardE1RMPrGain(150, 142.5)).toBe(7.5);
  expect(getDashboardE1RMPrGain(180, 180)).toBe(0);
  expect(getDashboardE1RMPrGain(101.3333333333, 97.5)).toBe(5);
});

test('dashboard total PR is always the sum of the same displayed lift gains', () => {
  const metrics = buildDashboardE1RMMetrics(
    { Squat: 145, Bench: 97.5, Deadlift: 180 },
    {
      Squat: 145,
      Bench: 101.3333333333,
      Deadlift: 181.3333333333,
    }
  );

  expect(metrics.lifts).toEqual({
    Squat: { oneRM: 145, e1RM: 145, prGain: 0 },
    Bench: { oneRM: 97.5, e1RM: 102.5, prGain: 5 },
    Deadlift: { oneRM: 180, e1RM: 182.5, prGain: 2.5 },
  });
  expect(metrics.total).toEqual({
    oneRM: 422.5,
    e1RM: 430,
    prGain: 7.5,
  });
  expect(metrics.total.prGain).toBe(
    Object.values(metrics.lifts).reduce(
      (sum, lift) => sum + lift.prGain,
      0
    )
  );
});

test('rest and training completion actions share the same compact button style', () => {
  expect(workoutCompletionButtonStyle()).toMatchObject({
    display: 'block',
    width: 'auto',
    minHeight: 44,
    padding: '10px 28px',
    fontWeight: 700,
    borderRadius: 8,
    margin: '14px auto 10px',
  });
});

test('rest information and completion action sit slightly higher', () => {
  expect(restWorkoutScreenStyle()).toMatchObject({
    display: 'grid',
    alignContent: 'space-between',
    paddingBottom: 32,
  });
});

test('stats charts reserve extra clearance above the bottom navigation', () => {
  expect(statsScreenStyle()).toMatchObject({
    height: 'calc(100dvh - 52px)',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 32,
  });
});

test('ordinary settings move up without changing the Start over layout slot', () => {
  expect(regularSettingsClusterStyle()).toMatchObject({
    display: 'grid',
    gap: 'clamp(1px, 0.35dvh, 4px)',
    transform: 'translateY(-14px)',
  });
});

test('rounded seed e1RMs do not create a false dashboard PR', () => {
  expect(isDashboardE1RMPR({ achievedE1RM: 38.5, oneRM: 42.5 })).toBe(false);
  expect(isDashboardE1RMPR({ achievedE1RM: 43, oneRM: 42.5 })).toBe(false);
  expect(isDashboardE1RMPR({ achievedE1RM: 44, oneRM: 42.5 })).toBe(true);
  expect(isDashboardE1RMPR({
    achievedE1RM: 181.3333333333,
    displayedE1RM: 180,
    oneRM: 180,
  })).toBe(false);
});

test('dashboard totals exclude inherited rounded planning maxes that were never achieved', () => {
  const oneRMs = { Squat: 42.5, Bench: 32.5, Deadlift: 60 };
  const achievedE1RMs = { Squat: 45, Bench: 30, Deadlift: 55 };
  const displayedE1RMs = Object.fromEntries(
    Object.keys(oneRMs).map(lift => [
      lift,
      getDashboardE1RMValue(oneRMs[lift], achievedE1RMs[lift]),
    ])
  );
  const total1RM = Object.values(oneRMs).reduce((sum, value) => sum + value, 0);
  const totalE1RM = Object.values(displayedE1RMs).reduce((sum, value) => sum + value, 0);

  expect(displayedE1RMs).toEqual({ Squat: 45, Bench: 32.5, Deadlift: 60 });
  expect(total1RM).toBe(135);
  expect(totalE1RM).toBe(137.5);
  expect(getDashboardE1RMPrGain(totalE1RM, total1RM)).toBe(2.5);
});

test('modals use the available dynamic viewport before enabling internal scrolling', () => {
  expect(settingsModalPanelStyle()).toMatchObject({
    maxHeight: 'calc(100dvh - clamp(24px, 8vw, 40px))',
    boxSizing: 'border-box',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  });
});

test('preparation uses one compact four-column grid row', () => {
  expect(preparationGridStyle()).toMatchObject({
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  });
});

test('compact preparation labels reserve two aligned, readable text lines', () => {
  expect(compactPrepLabelStyle()).toMatchObject({
    fontSize: 'clamp(12px, 3vw, 14px)',
    lineHeight: 1.1,
    height: '2.2em',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  });
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

test('stats tabs keep the same chart frame size, including empty charts', () => {
  const statsTranslations = {
    stats: 'Stats', cycle: 'Cycle', workoutProgress: 'Workout',
    squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift',
    statsTabLifts: 'Lifts', statsTabTotal: 'Total', statsTabBody: 'Body', statsTabHealth: 'Health',
    totalSBD: 'Total SBD', strengthTotalBodyweight: 'Strength / bodyweight', strengthMax: 'Strength Max',
    noStatsData: 'No data', noMetricData: 'No metric data', e1RM: 'e1RM', bodyweight: 'Body weight',
  };
  const commonProps = {
    history: [], bodyWeights: [], currentCycle: 1, currentIndex: 0, totalWorkouts: 4,
    t: statsTranslations,
  };
  const view = render(<StatsScreen {...commonProps} activescreen="lifts" />);
  const liftFrames = screen.getAllByTestId('stats-chart-frame');

  expect(liftFrames).toHaveLength(3);
  expect(new Set(liftFrames.map(frame => frame.style.height))).toEqual(new Set(['100%']));
  expect(new Set(liftFrames.map(frame => frame.style.minHeight))).toEqual(new Set(['108px']));

  view.rerender(<StatsScreen {...commonProps} activescreen="totaal" />);
  const totalFrames = screen.getAllByTestId('stats-chart-frame');

  expect(totalFrames).toHaveLength(3);
  expect(totalFrames.map(frame => frame.style.height)).toEqual(liftFrames.map(frame => frame.style.height));
});

test('settings rows use responsive text and phone-sized action targets', () => {
  render(<SettingsListRow label="Profile" actionLabel="Edit" onAction={() => {}} />);

  expect(screen.getByText('Profile').style.fontSize).toBe('clamp(16px, 4vw, 20px)');
  const action = screen.getByRole('button', { name: 'Edit' });
  expect(action.style.minHeight).toBe('clamp(44px, 5.5dvh, 52px)');
  expect(action.style.fontSize).toBe('clamp(15px, 3.7vw, 18px)');
  expect(action.style.whiteSpace).toBe('normal');
});

test('the destructive settings action stays concise in every language', () => {
  expect(translations.nl.startFromScratch).toBe('Opnieuw');
  expect(translations.en.startFromScratch).toBe('Start over');
  expect(translations.ca.startFromScratch).toBe('Reinicia');
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
