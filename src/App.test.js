import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App, { BOTTOM_NAV_ICON_SIZE, BOTTOM_NAV_SPACE, BodyDataSection, DashboardCycleWorkoutLabel, MeetDayDashboardPlan, MeetPlanContent, MilestoneCelebrationModal, SettingsListRow, SmartDayTypeInline, StatsScreen, WeightUnitSection, activeWorkoutLiftBlockStyle, activeWorkoutScreenStyle, appViewportStyle, bottomNavButtonStyle, bottomNavStyle, buildDashboardE1RMMetrics, buildDashboardRecentPrEvents, canSwitchClassicToSmart, capRunningBestChart, compactPrepLabelStyle, completedWorkoutScreenStyle, countDashboardRecentPrLines, formatStrengthRatioWithMax, formatWorkoutSetPercentDisplay, getDashboardE1RMValue, getDashboardMeetState, getDashboardPrimaryBlockerLift, getLatestBodyDataValues, getSmartDecisionReasonDisplayText, getSmartModalDetailRows, getStatsHistoricalOneRM, isCompletedSuccessfulThirdAttempt, isMeetAttemptPlanLocked, meetCompletedAchievedWeightStyle, meetDayDashboardContentStyle, meetDayDashboardScreenStyle, meetWorkoutGridSpan, meetWorkoutLiftBlockStyle, meetWorkoutScreenStyle, preparationGridStyle, programScreenStyle, programWorkoutCardSpacingStyle, programWorkoutListVerticalSpacing, regularDashboardContentStyle, regularDashboardScreenStyle, regularSettingsClusterStyle, replaceCurrentChartEndpoint, resolveStoredWeightUnit, restDayCompletedContentStyle, restDayCompletedScreenStyle, restWorkoutContentStyle, restWorkoutScreenStyle, screenContentNeedsScroll, settingsContentLayoutStyle, settingsModalPanelStyle, shouldAllowAppVerticalScroll, shouldReserveWorkoutBottomNavSpace, shouldShowAutomaticBackupStatus, shouldShowCompletedWorkoutMetadata, shouldUseCompactDashboardLayout, shouldUseExpandedDashboardLayout, shouldShowSmartReasonWithStructuredDetails, statsScreenStyle, workoutCompletionButtonMargin, workoutCompletionButtonStyle } from './App';
import { translations } from './translations';

test('dashboard metrics contain values without treating the e1RM and 1RM difference as a new PR', () => {
  const metrics = buildDashboardE1RMMetrics(
    { Squat: 145, Bench: 97.5, Deadlift: 180 },
    {
      Squat: 145,
      Bench: 101.3333333333,
      Deadlift: 181.3333333333,
    }
  );

  expect(metrics.lifts).toEqual({
    Squat: { oneRM: 145, e1RM: 145 },
    Bench: { oneRM: 97.5, e1RM: 102.5 },
    Deadlift: { oneRM: 180, e1RM: 182.5 },
  });
  expect(metrics.total).toEqual({
    oneRM: 422.5,
    e1RM: 430,
  });
});

test('dashboard Strength ratios always show two decimal places', () => {
  expect(formatStrengthRatioWithMax(5.3, 5.36)).toBe('5.30 / 5.36');
  expect(formatStrengthRatioWithMax(5.3, null)).toBe('5.30 / 5.30');
  expect(formatStrengthRatioWithMax(null, 5.36)).toBeNull();
});

function dashboardPrHistory() {
  const seed = (lift, weight) => ({
    cycle: 0,
    workoutNumber: 0,
    lift,
    seedMax: true,
    topWeight: weight,
    topReps: 1,
    e1rm: weight,
  });
  const training = (workoutNumber, lift, weight, reps, e1rm) => ({
    cycle: 3,
    workoutNumber,
    lift,
    topWeight: weight,
    topReps: reps,
    e1rm,
    workoutSnapshot: {
      type: 'training',
      completed: true,
      lift,
      sets: [{ weight, reps, done: true, failed: false, skipped: false }],
    },
  });
  const meetSnapshot = {
    type: 'meet',
    completed: true,
    lifts: [
      { lift: 'Squat', sets: [{ weight: 147.5, reps: 1, done: true, failed: false, skipped: false }] },
      { lift: 'Bench', sets: [{ weight: 100, reps: 1, done: true, failed: false, skipped: false }] },
      { lift: 'Deadlift', sets: [{ weight: 175, reps: 1, done: true, failed: false, skipped: false }] },
    ],
  };

  return [
    seed('Squat', 145),
    seed('Bench', 97.5),
    seed('Deadlift', 180),
    training(39, 'Squat', 135, 2, 145),
    training(40, 'Bench', 90, 4, 102.5),
    training(41, 'Deadlift', 170, 2, 180),
    ...[
      ['Squat', 147.5],
      ['Bench', 100],
      ['Deadlift', 175],
    ].map(([lift, weight]) => ({
      cycle: 3,
      workoutNumber: 45,
      lift,
      topWeight: weight,
      topReps: 1,
      oneRMToday: weight,
      e1rm: weight,
      workoutSnapshot: meetSnapshot,
    })),
  ];
}

test('dashboard shows only PRs created by the latest strength workout', () => {
  const events = buildDashboardRecentPrEvents(dashboardPrHistory());

  expect(events.lifts).toEqual({
    Squat: { oneRMGain: 2.5, e1RMGain: 2.5 },
    Bench: { oneRMGain: 2.5, e1RMGain: 0 },
    Deadlift: { oneRMGain: 0, e1RMGain: 0 },
  });
  expect(events.total).toEqual({ oneRMGain: 5, e1RMGain: 2.5 });
});

test('dashboard reports a total e1RM PR when one lift raises the e1RM total', () => {
  const historyBeforeMeet = dashboardPrHistory().filter(entry => entry.workoutNumber !== 45);
  const history = [
    ...historyBeforeMeet,
    {
      cycle: 3,
      workoutNumber: 42,
      lift: 'Squat',
      topWeight: 137.5,
      topReps: 2,
      e1rm: 147.5,
      workoutSnapshot: {
        type: 'training',
        completed: true,
        lift: 'Squat',
        sets: [{ weight: 137.5, reps: 2, done: true, failed: false, skipped: false }],
      },
    },
  ];

  expect(buildDashboardRecentPrEvents(history)).toMatchObject({
    lifts: {
      Squat: { oneRMGain: 0, e1RMGain: 2.5 },
      Bench: { oneRMGain: 0, e1RMGain: 0 },
      Deadlift: { oneRMGain: 0, e1RMGain: 0 },
    },
    total: { oneRMGain: 0, e1RMGain: 2.5 },
  });
});

test('dashboard reads recent Strength Max records from the latest milestone celebration', () => {
  const history = dashboardPrHistory();
  history.at(-1).workoutSnapshot.milestoneCelebration = {
    achievements: [
      { type: 'e1RM', lift: 'Squat', gain: 2.5 },
      { type: 'eStrengthMax', previous: 5.3, value: 5.33, gain: 0.03 },
    ],
  };

  expect(buildDashboardRecentPrEvents(history).ratios).toEqual({
    strengthMaxGain: 0,
    eStrengthMaxGain: 0.03,
  });

  const afterRecovery = [
    ...history,
    { cycle: 3, workoutNumber: 46, restDay: true, completionOnly: true },
  ];
  expect(buildDashboardRecentPrEvents(afterRecovery).ratios.eStrengthMaxGain).toBe(0.03);

  const afterNextStrengthWorkout = [
    ...afterRecovery,
    {
      cycle: 4,
      workoutNumber: 1,
      lift: 'Squat',
      topWeight: 100,
      topReps: 3,
      e1rm: 110,
      workoutSnapshot: {
        type: 'training',
        completed: true,
        lift: 'Squat',
        sets: [{ weight: 100, reps: 3, done: true, failed: false, skipped: false }],
      },
    },
  ];
  expect(buildDashboardRecentPrEvents(afterNextStrengthWorkout).ratios).toEqual({
    strengthMaxGain: 0,
    eStrengthMaxGain: 0,
  });
});

test('recent dashboard PRs survive recovery days and expire after the next strength workout', () => {
  const historyAfterRecovery = [
    ...dashboardPrHistory(),
    { cycle: 3, workoutNumber: 46, restDay: true, completionOnly: true },
  ];
  expect(buildDashboardRecentPrEvents(historyAfterRecovery).total.oneRMGain).toBe(5);

  const historyAfterNextTraining = [
    ...historyAfterRecovery,
    {
      cycle: 4,
      workoutNumber: 1,
      lift: 'Squat',
      topWeight: 100,
      topReps: 3,
      e1rm: 110,
      workoutSnapshot: {
        type: 'training',
        completed: true,
        lift: 'Squat',
        sets: [{ weight: 100, reps: 3, done: true, failed: false, skipped: false }],
      },
    },
  ];
  expect(buildDashboardRecentPrEvents(historyAfterNextTraining)).toMatchObject({
    lifts: {
      Squat: { oneRMGain: 0, e1RMGain: 0 },
      Bench: { oneRMGain: 0, e1RMGain: 0 },
      Deadlift: { oneRMGain: 0, e1RMGain: 0 },
    },
    total: { oneRMGain: 0, e1RMGain: 0 },
  });
});

test('dashboard hides a zero-gap fallback blocker when every meet target is ready', () => {
  expect(getDashboardPrimaryBlockerLift({
    meetPlanReady: true,
    meetPlanWeakestLift: 'Bench',
    meetPlanWeakestPhase: 'ready',
    meetPlanReadiness: {
      Squat: { currentCycleBestE1RM: 45, oneRMTargetE1RM: 42.5, ready: true },
      Bench: { currentCycleBestE1RM: 32.5, oneRMTargetE1RM: 32.5, ready: true },
      Deadlift: { currentCycleBestE1RM: 60, oneRMTargetE1RM: 60, ready: true },
    },
  })).toBeNull();
});

test('dashboard keeps legacy blocker fallback only for unfinished meet plans', () => {
  expect(getDashboardPrimaryBlockerLift({
    meetPlanReady: false,
    meetPlanWeakestLift: 'Bench',
  })).toBe('Bench');

  expect(getDashboardPrimaryBlockerLift({
    meetPlanReady: false,
    primaryBlockerLift: null,
    meetPlanWeakestLift: 'Bench',
  })).toBeNull();
});

test.each(['nl', 'en', 'ca'])('dashboard PR labels are translated in %s', language => {
  expect(translations[language]).toMatchObject({
    new1RMPR: expect.any(String),
    newE1RMPR: expect.any(String),
    newStrengthMaxPR: expect.any(String),
    newEStrengthMaxPR: expect.any(String),
  });
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

test('active workout screen preserves its original balanced height', () => {
  expect(activeWorkoutScreenStyle()).toMatchObject({
    display: 'grid',
    alignContent: 'space-between',
  });
  expect(activeWorkoutScreenStyle().transform).toBeUndefined();
});

test('program screen uses the same responsive header alignment as other content screens', () => {
  expect(programScreenStyle()).toMatchObject({
    width: '100%',
    maxWidth: 500,
    margin: '0 auto',
    padding: 'clamp(10px, 1.8dvh, 18px) clamp(14px, 4vw, 20px) 16px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
  });
});

test('program workout cards tighten only when the compact list toggles are visible', () => {
  expect(programWorkoutCardSpacingStyle({ compact: true })).toEqual({
    marginBottom: 'clamp(1px, 0.25dvh, 3px)',
  });
  expect(programWorkoutCardSpacingStyle()).toEqual({
    marginBottom: 'clamp(6px, 0.8dvh, 9px)',
  });
});

test('compact program lists pull both toggles closer to the workout cards', () => {
  expect(programWorkoutListVerticalSpacing({ compact: true })).toEqual({
    listMarginTop: 'clamp(1px, 0.25dvh, 3px)',
    topToggleMargin: '14px 0 2px',
    bottomToggleMargin: '2px 0 0',
  });
  expect(programWorkoutListVerticalSpacing()).toEqual({
    listMarginTop: 'clamp(14px, 2dvh, 22px)',
    topToggleMargin: '14px 0 10px',
    bottomToggleMargin: '6px 0 0',
  });
});

test('activeWorkoutLiftBlockStyle uses normal margins', () => {
  expect(activeWorkoutLiftBlockStyle()).toMatchObject({
    background: 'transparent',
    marginBottom: 'clamp(4px, 0.8dvh, 8px)',
  });
});

test('meet workout keeps the standard top spacing and balanced compact lift spacing', () => {
  expect(meetWorkoutScreenStyle()).toMatchObject({
    display: 'block',
    paddingBottom: 4,
  });
  expect(meetWorkoutScreenStyle().paddingTop).toBeUndefined();
  expect(meetWorkoutLiftBlockStyle()).toMatchObject({
    overflow: 'visible',
    margin: '0 0 3px',
  });
  expect(meetWorkoutLiftBlockStyle().marginTop).toBeUndefined();
  expect(workoutCompletionButtonMargin({ isMeetDay: true })).toBe('8px auto 0');
  expect(workoutCompletionButtonMargin({ isMeetDay: false })).toBe('2px auto 18px');
});

test('meet warmups and attempts each consume one complete 12-column row', () => {
  expect(meetWorkoutGridSpan(2) * 2).toBe(12);
  expect(meetWorkoutGridSpan(3) * 3).toBe(12);
  expect(meetWorkoutGridSpan(4) * 4).toBe(12);
});

test('the current meet screen always permits natural overflow scrolling', () => {
  expect(shouldAllowAppVerticalScroll({
    screen: 'current',
    workout: { type: 'meet' },
    measuredOverflow: false,
  })).toBe(true);
  expect(shouldAllowAppVerticalScroll({
    screen: 'current',
    workout: { type: 'training' },
    measuredOverflow: false,
  })).toBe(false);
  expect(shouldAllowAppVerticalScroll({
    screen: 'settings',
    measuredOverflow: true,
  })).toBe(true);
  expect(shouldReserveWorkoutBottomNavSpace({
    screen: 'current',
    workout: { type: 'meet' },
    measuredNeedsClearance: false,
  })).toBe(true);
  expect(shouldReserveWorkoutBottomNavSpace({
    screen: 'current',
    workout: { type: 'training' },
    measuredNeedsClearance: false,
  })).toBe(false);
  expect(shouldReserveWorkoutBottomNavSpace({
    screen: 'current',
    workout: { type: 'training' },
    measuredNeedsClearance: true,
  })).toBe(true);
});

test('rest information sits optically above centre with its completion action below', () => {
  expect(restWorkoutScreenStyle()).toMatchObject({
    display: 'grid',
    alignContent: 'space-between',
    gridTemplateRows: 'auto minmax(0, 1fr) auto',
    paddingBottom: 32,
  });

  expect(restWorkoutContentStyle()).toMatchObject({
    display: 'grid',
    alignContent: 'center',
    transform: 'translateY(clamp(-28px, -3dvh, -18px))',
  });
});

test('completed rest day content is distributed over the available screen height', () => {
  // Must be an absolute viewport-relative height, not a percentage: every
  // ancestor of this screen only sets minHeight (never a definite height),
  // so a percentage here can never resolve, collapsing the centering grid
  // row to content size and leaving the content stuck at the top. Must also
  // subtract the parent's own 36px of vertical padding, or this screen
  // claims more height than its parent has left and forces an unnecessary
  // scroll.
  expect(restDayCompletedScreenStyle()).toMatchObject({
    minHeight: 'calc(100dvh - 78px - 36px)',
    display: 'grid',
    gridTemplateRows: 'minmax(0, 1fr)',
    boxSizing: 'border-box',
  });

  expect(restDayCompletedContentStyle()).toMatchObject({
    alignSelf: 'center',
    transform: 'translateY(clamp(-24px, -2.5dvh, -16px))',
  });
});

test('completed workout content leaves vertical overflow control to the shared viewport', () => {
  expect(completedWorkoutScreenStyle()).toMatchObject({
    minHeight: 'calc(100dvh - 78px)',
    overflowX: 'hidden',
  });
  expect(completedWorkoutScreenStyle().height).toBeUndefined();
  expect(completedWorkoutScreenStyle().overflowY).toBeUndefined();
});

test('all main screens suppress tiny pseudo-overflow and scroll only for hidden content', () => {
  expect(screenContentNeedsScroll({
    contentBottom: 795,
    viewportHeight: 873,
  })).toBe(false);
  expect(screenContentNeedsScroll({
    contentBottom: 797,
    viewportHeight: 873,
  })).toBe(false);
  expect(screenContentNeedsScroll({
    contentBottom: 798,
    viewportHeight: 873,
  })).toBe(true);

  expect(appViewportStyle({ screen: 'completed', allowVerticalScroll: false })).toMatchObject({
    height: '100dvh',
    minHeight: '100dvh',
    paddingBottom: 78,
    overflowY: 'hidden',
    overscrollBehaviorY: 'none',
  });
  expect(appViewportStyle({ screen: 'settings', allowVerticalScroll: true })).toMatchObject({
    height: '100dvh',
    paddingBottom: 78,
    overflowY: 'auto',
  });
  expect(appViewportStyle({
    screen: 'current',
    workoutNeedsNavClearance: false,
    allowVerticalScroll: false,
  }).paddingBottom).toBe(0);
});

test('meet completion keeps achieved lift weights prominent', () => {
  expect(meetCompletedAchievedWeightStyle()).toMatchObject({
    fontSize: 'clamp(18px, 2.8dvh, 22px)',
    fontWeight: 900,
    whiteSpace: 'nowrap',
  });
});

test('meet completion omits the ordinary workout metadata card', () => {
  const workout = { lifts: [{ lift: 'Squat' }] };

  expect(shouldShowCompletedWorkoutMetadata(workout, true)).toBe(false);
  expect(shouldShowCompletedWorkoutMetadata(workout, false)).toBe(true);
});

test('meet feedback highlights only successful third attempts', () => {
  expect(isCompletedSuccessfulThirdAttempt({
    labelKey: 'thirdAttempt',
    done: true,
    failed: false,
    skipped: false,
  })).toBe(true);
  expect(isCompletedSuccessfulThirdAttempt({
    labelKey: 'secondAttempt',
    done: true,
    failed: false,
    skipped: false,
  })).toBe(false);
  expect(isCompletedSuccessfulThirdAttempt({
    labelKey: 'thirdAttempt',
    done: false,
    failed: true,
    skipped: false,
  })).toBe(false);
});

test.each(['nl', 'en', 'ca'])('meet completion feedback is translated in %s', language => {
  expect(translations[language]).toMatchObject({
    meetCompleted: expect.any(String),
    meetCompletedSaved: expect.any(String),
  });
});

test('stats charts reserve extra clearance above the bottom navigation', () => {
  expect(statsScreenStyle()).toMatchObject({
    height: 'calc(100dvh - 78px)',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: 32,
  });
});

test('bottom navigation uses one-and-a-half times its original height and icon size', () => {
  expect(BOTTOM_NAV_SPACE).toBe(78);
  expect(BOTTOM_NAV_ICON_SIZE).toBe(39);
  expect(bottomNavStyle()).toMatchObject({
    height: 78,
    display: 'flex',
    boxSizing: 'border-box',
  });
  expect(bottomNavStyle().borderTop).toBeUndefined();
  expect(bottomNavButtonStyle(true)).toMatchObject({
    height: '100%',
    padding: 0,
    color: '#ff8a3d',
    background: 'none',
    alignItems: 'center',
    justifyContent: 'center',
  });
});

test('settings distribute regular actions and keep Start over at the bottom', () => {
  expect(regularSettingsClusterStyle()).toMatchObject({
    display: 'grid',
    gap: 'clamp(3px, 0.6dvh, 7px)',
    alignContent: 'space-evenly',
    minHeight: 0,
  });
  expect(regularSettingsClusterStyle().transform).toBeUndefined();
  expect(settingsContentLayoutStyle()).toMatchObject({
    gridTemplateRows: 'minmax(0, 1fr) auto',
    marginTop: 'clamp(10px, 1.5dvh, 16px)',
    rowGap: 'clamp(8px, 1.2dvh, 14px)',
    alignContent: 'stretch',
  });
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

test('stats places established meet 1RMs in historical data instead of inventing a current jump', () => {
  const historicalWorkout = {
    lift: 'Squat',
    workoutNumber: 25,
    cycle: 2,
    topWeight: 100,
    topReps: 4,
    workoutSnapshot: {
      completedSummary: {
        results: [
          {
            lift: 'Squat',
            previousBest1RM: 145,
            best1RM: 145,
            topSet: { weight: 100, reps: 4 },
          },
          {
            lift: 'Bench',
            previousBest1RM: 97.5,
            best1RM: 100,
            topSet: { weight: 95, reps: 2 },
          },
          {
            lift: 'Deadlift',
            previousBest1RM: 180,
            best1RM: 180,
            topSet: { weight: 170, reps: 2 },
          },
        ],
      },
    },
  };

  expect(getStatsHistoricalOneRM(historicalWorkout, 100)).toBe(145);
  expect(getStatsHistoricalOneRM({ ...historicalWorkout, lift: 'Bench' }, 95)).toBe(97.5);
  expect(getStatsHistoricalOneRM({ ...historicalWorkout, lift: 'Deadlift' }, 170)).toBe(180);

  const runningSquatLine = [
    { label: 'C2W25', oneRM: getStatsHistoricalOneRM(historicalWorkout, 100) },
    { label: 'C3W43', oneRM: 145 },
  ];
  expect(replaceCurrentChartEndpoint(runningSquatLine, { oneRM: 145 }))
    .toEqual(runningSquatLine);
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

test('weight unit is a direct Settings choice without a demographic profile', () => {
  const setWeightUnit = jest.fn();
  render(
    <WeightUnitSection
      weightUnit="kg"
      setWeightUnit={setWeightUnit}
      t={translations.en}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: 'kg' }));
  expect(screen.getByRole('heading', { name: 'Change weight unit' })).toBeInTheDocument();
  expect(screen.queryByText(/date of birth/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/^sex/i)).not.toBeInTheDocument();

  const unitButtons = [
    screen.getAllByRole('button', { name: 'kg' }).at(-1),
    screen.getByRole('button', { name: 'lb' }),
  ];
  expect(unitButtons[0].parentElement.style.gridTemplateColumns)
    .toBe('repeat(2, minmax(0, 140px))');

  fireEvent.click(screen.getByRole('button', { name: 'lb' }));
  expect(setWeightUnit).toHaveBeenCalledWith('lb');
});

test('body data keeps the most recent valid value for every individual field', () => {
  const latestBodyData = getLatestBodyDataValues([
    { bodyWeight: 80, bodyFat: 20, bodyWater: 51, visceralFat: 8, physiqueRating: 4 },
    { bodyWeight: 81 },
    { bodyFat: 19, bodyWater: 53, visceralFat: 7 },
  ]);

  expect(latestBodyData).toEqual({
    bodyWeight: 81,
    bodyFat: 19,
    bodyWater: 53,
    visceralFat: 7,
    physiqueRating: 4,
  });

  render(
    <BodyDataSection
      bodyData={latestBodyData}
      onSave={() => {}}
      t={translations.en}
      weightUnit="kg"
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));

  const inputs = screen.getAllByRole('spinbutton');
  expect(inputs.map(input => Number(input.placeholder))).toEqual([81, 19, 53, 7, 4]);
});

test('stored weight unit prefers canonical data and still reads legacy backups', () => {
  expect(resolveStoredWeightUnit({
    weightUnit: 'lb',
    userProfile: { weightUnit: 'kg' },
  }, 'kg')).toBe('lb');
  expect(resolveStoredWeightUnit({
    userProfile: { weightUnit: 'lb' },
  }, 'kg')).toBe('lb');
  expect(resolveStoredWeightUnit({}, 'lb')).toBe('lb');
});

test('milestone celebration overlays the already-rendered completed screen and combines achievements', () => {
  const onClose = jest.fn();
  render(
    <>
      <div data-testid="underlying-completed-screen">Workout completed</div>
      <MilestoneCelebrationModal
        celebration={{
          primaryType: 'level',
          achievements: [
            { type: 'level', previous: 'beginner', value: 'intermediate' },
            { type: 'e1RM', lift: 'Squat', previous: 100, value: 105, gain: 5 },
            { type: 'e1RM', lift: 'Total', previous: 300, value: 305, gain: 5 },
            { type: 'eStrengthMax', previous: 3.75, value: 3.81, gain: 0.06 },
          ],
        }}
        t={translations.en}
        weightUnit="kg"
        onClose={onClose}
      />
    </>
  );

  expect(screen.getByTestId('underlying-completed-screen')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'New level reached!' })).toBeInTheDocument();
  expect(screen.getByText('Intermediate')).toBeInTheDocument();
  expect(screen.getByText('Squat e1RM')).toBeInTheDocument();
  expect(screen.getByText('Total e1RM')).toBeInTheDocument();
  expect(screen.getByText('eStrength Max')).toBeInTheDocument();
  expect(screen.getByText('105 kg (+5 kg)')).toBeInTheDocument();
  expect(screen.getByText('3.81x (+0.06)')).toBeInTheDocument();

  const eStrengthRow = screen.getByText('eStrength Max').parentElement;
  expect(eStrengthRow.style.background).toBe('transparent');
  expect(eStrengthRow.style.borderStyle).toBe('none');

  const modalOverlay = screen.getByRole('heading', { name: 'New level reached!' })
    .parentElement.parentElement;
  expect(modalOverlay.style.position).toBe('fixed');
  expect(modalOverlay.style.zIndex).toBe('650');

  expect(screen.getByRole('button', { name: 'Support' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Share usage data' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Contact' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Share usage data' }));
  expect(screen.getByRole('heading', { name: 'Anonymous usage summary' })).toBeInTheDocument();
  expect(screen.getByText(/No weights, PRs, body data, dates, device data or training history/))
    .toBeInTheDocument();
  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: 'Email Kelani' }));
  expect(openSpy.mock.calls.at(-1)[0]).toMatch(
    /^mailto:mburgosfr@gmail\.com\?subject=Kelani%20anonymous%20usage%20summary&body=/
  );
  openSpy.mockRestore();

  fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
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

test('meet-day dashboard keeps the cycle, workout and Smart level label', () => {
  render(
    <DashboardCycleWorkoutLabel
      t={translations.nl}
      currentCycle={3}
      workoutNumber={45}
      totalWorkouts={45}
      smartModel
      athleteLevel="intermediate"
      eStrengthRatio={5}
      eStrengthMax={5.1}
      latestBodyWeight={80}
    />
  );

  expect(screen.getByText(/Cyclus 3 · Workout 45/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Ervaringsniveau: Intermediate/i }))
    .toBeInTheDocument();
});

test('only the meet-plan card opens the meet workout, not the level badge', () => {
  const onOpenWorkout = jest.fn();
  render(
    <>
      <DashboardCycleWorkoutLabel
        t={translations.nl}
        currentCycle={3}
        workoutNumber={45}
        totalWorkouts={45}
        smartModel
        athleteLevel="intermediate"
        eStrengthRatio={5}
        eStrengthMax={5.1}
        latestBodyWeight={80}
      />
      <MeetDayDashboardPlan
        meetPlan={[{
          lift: 'Bench',
          oneRM: 97.5,
          opener: 87.5,
          second: 95,
          third: 100,
        }]}
        meetTotals={{ opener: 87.5, second: 95, third: 100 }}
        t={translations.nl}
        onOpenWorkout={onOpenWorkout}
      />
    </>
  );

  fireEvent.click(screen.getByRole('button', {
    name: /Ervaringsniveau: Intermediate/i,
  }));
  expect(onOpenWorkout).not.toHaveBeenCalled();
  expect(screen.getByText(translations.nl.athleteLevelModalTitle))
    .toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {
    name: translations.nl.openWorkout || translations.nl.workout,
  }));
  expect(onOpenWorkout).toHaveBeenCalledTimes(1);
  expect(screen.getByText(translations.nl.projectedTotal).style.fontSize)
    .toBe('clamp(13px, 3.2vw, 15px)');
});

test('meet-day dashboard spreads the plan across the available vertical space', () => {
  expect(meetDayDashboardScreenStyle()).toMatchObject({
    gridTemplateRows: 'auto minmax(min-content, 1fr)',
    alignContent: 'stretch',
    rowGap: 'clamp(4px, 0.8dvh, 10px)',
  });
  expect(meetDayDashboardContentStyle()).toMatchObject({
    minHeight: 0,
    display: 'grid',
    gridTemplateRows: 'auto auto minmax(min-content, 1fr) auto',
    alignContent: 'stretch',
    rowGap: 'clamp(4px, 0.8dvh, 8px)',
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

test('post-meet dashboard distributes space between and around its cards', () => {
  expect(regularDashboardScreenStyle()).toMatchObject({
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    alignContent: 'stretch',
    rowGap: 'clamp(14px, 2.2dvh, 24px)',
  });
  expect(regularDashboardContentStyle({ spreadContent: true })).toMatchObject({
    display: 'grid',
    alignContent: 'space-evenly',
    rowGap: 'clamp(10px, 1.4dvh, 16px)',
    paddingBottom: 'clamp(24px, 3.5dvh, 36px)',
  });
  expect(regularDashboardContentStyle()).toMatchObject({
    alignContent: 'start',
    rowGap: 'clamp(14px, 2.2dvh, 24px)',
  });
});

test('PR-rich training dashboards use tighter spacing without changing sparse dashboards', () => {
  const recentPrEvents = {
    lifts: {
      Squat: { oneRMGain: 2.5, e1RMGain: 0 },
      Bench: { oneRMGain: 2.5, e1RMGain: 2.5 },
      Deadlift: { oneRMGain: 2.5, e1RMGain: 2.5 },
    },
    total: { oneRMGain: 7.5, e1RMGain: 5 },
    ratios: { strengthMaxGain: 0.1, eStrengthMaxGain: 0.01 },
  };

  expect(countDashboardRecentPrLines(recentPrEvents)).toBe(9);
  expect(shouldUseCompactDashboardLayout({
    workout: { type: 'training' },
    meetState: { isMeetDay: false },
    recentPrEvents,
  })).toBe(true);
  expect(regularDashboardScreenStyle({ compact: true }).rowGap)
    .toBe('clamp(9px, 1.3dvh, 13px)');
  expect(regularDashboardContentStyle({ compact: true }).rowGap)
    .toBe('clamp(8px, 1.1dvh, 12px)');

  expect(shouldUseCompactDashboardLayout({
    workout: { type: 'training' },
    meetState: { isMeetDay: false },
    recentPrEvents: {
      lifts: { Squat: { oneRMGain: 0, e1RMGain: 2.5 } },
      total: { oneRMGain: 0, e1RMGain: 2.5 },
      ratios: { strengthMaxGain: 0, eStrengthMaxGain: 0 },
    },
  })).toBe(false);
});

test('sparse rest dashboards use the expanded layout while training dashboards stay compact', () => {
  expect(shouldUseExpandedDashboardLayout({
    workout: { type: 'rest' },
    meetState: { isMeetDay: false, hideRouteToMeet: false },
  })).toBe(true);

  expect(shouldUseExpandedDashboardLayout({
    workout: { type: 'training' },
    meetState: { isMeetDay: false, hideRouteToMeet: false },
  })).toBe(false);

  expect(shouldUseExpandedDashboardLayout({
    workout: { type: 'rest' },
    meetState: { isMeetDay: true, hideRouteToMeet: false },
  })).toBe(false);
});

test('ideal-route post-meet recovery also keeps route to meet hidden', () => {
  expect(getDashboardMeetState({
    type: 'rest',
    smartDayType: 'recovery',
    smartDecisionSummary: { reason: 'ideal-route' },
    smartIdealRoute: { stage: 'post-meet' },
  })).toEqual({
    isMeetDay: false,
    hideRouteToMeet: true,
  });
});

test.each(['nl', 'en', 'ca'])('ideal-route post-meet recovery explains why the workout is rest in %s', language => {
  const t = translations[language];
  const workout = {
    type: 'rest',
    smartDayType: 'recovery',
    smartDecisionSummary: {
      reason: 'ideal-route',
      dayType: 'recovery',
    },
    smartIdealRoute: { stage: 'post-meet' },
  };

  expect(t.smartReasonIdealRoutePostMeetRecovery).toBeTruthy();
  expect(getSmartDecisionReasonDisplayText(workout.smartDecisionSummary, t, workout))
    .toBe(t.smartReasonIdealRoutePostMeetRecovery);
});

test.each(['nl', 'en', 'ca'])('post-meet recovery includes its progress and purpose in %s', language => {
  const t = translations[language];
  const reason = getSmartDecisionReasonDisplayText({
    reason: 'post-meet-recovery',
    dayType: 'recovery',
    readiness: {
      postMeetRecoveryTarget: 3,
      postMeetRecoveryDaysCompleted: 0,
    },
  }, t);

  expect(reason).toBe(
    t.smartReasonPostMeetRecovery
      .replace('{current}', '1')
      .replace('{target}', '3')
  );
  expect(reason).not.toContain('{');
});

test.each(['nl', 'en', 'ca'])('post-meet Smart details replace obsolete meet-readiness and projection data in %s', language => {
  const t = translations[language];
  const rows = getSmartModalDetailRows({
    type: 'rest',
    smartDayType: 'recovery',
    smartDecisionSummary: {
      reason: 'post-meet-recovery',
      dayType: 'recovery',
      readiness: {
        lastMeetWorkoutNumber: 45,
        inPostMeetRecovery: true,
        postMeetRecoveryTarget: 3,
        postMeetRecoveryDaysCompleted: 0,
        lastMeetFailedOrSkippedSetCount: 1,
        meetPlanReady: true,
        meetPlanReadiness: {
          Squat: { readinessPhase: 'ready' },
        },
        meetProjection: { available: true, label: 'C3W48' },
      },
    },
  }, t);

  expect(rows).toEqual([
    { label: t.smartPostMeetStatus, value: t.smartPostMeetStatusText },
    {
      label: t.smartPostMeetRecoveryPlan,
      value: t.smartPostMeetRecoveryPlanText
        .replace('{current}', '1')
        .replace('{target}', '3'),
    },
    { label: t.smartPostMeetRecoveryReason, value: t.smartPostMeetRecoveryAfterMeet },
    { label: t.smartPostMeetNextStep, value: t.smartPostMeetNextStepText },
  ]);
  expect(rows.some(row => row.label === t.smartMeetStatus)).toBe(false);
  expect(rows.some(row => row.label === t.smartProjectedMeet)).toBe(false);
});

test.each(['nl', 'en', 'ca'])('meet-readiness labels explain the 90, 95 and 100 percent thresholds in %s', language => {
  const t = translations[language];

  expect(t.smartE1RM90Readiness).not.toBe('90% e1RM');
  expect(t.smartE1RM95Readiness).not.toBe('95% e1RM');
  expect(t.smartOneRMReadiness).toMatch(/100%/);
  expect(t.smartReadinessBasisText).toMatch(/e1RM/i);
  expect(t.smartReadinessBasisText).toContain(t.smartCycleEstimateShort);
});

test('recovery and deload reasons stay visible beside structured Smart details', () => {
  expect(shouldShowSmartReasonWithStructuredDetails('recovery')).toBe(true);
  expect(shouldShowSmartReasonWithStructuredDetails('deload')).toBe(true);
  expect(shouldShowSmartReasonWithStructuredDetails('training')).toBe(false);
  expect(shouldShowSmartReasonWithStructuredDetails('meet')).toBe(false);
});

test('Smart recovery status stays above the shifted recovery content and opens its information', () => {
  render(
    <SmartDayTypeInline
      workout={{
        type: 'rest',
        smartDayType: 'recovery',
        smartDecisionSummary: {
          reason: 'post-meet-recovery',
          dayType: 'recovery',
          readiness: {
            postMeetRecoveryTarget: 3,
            postMeetRecoveryDaysCompleted: 0,
          },
        },
      }}
      t={translations.en}
    />
  );

  const button = screen.getByRole('button', {
    name: /Smart: Rest & recovery/i,
  });
  expect(button).toHaveStyle({
    position: 'relative',
    zIndex: '2',
    touchAction: 'manipulation',
  });

  fireEvent.click(button);

  expect(screen.getByRole('dialog', { name: translations.en.smartWorkoutDialogLabel }))
    .toBeInTheDocument();
  expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/Recovery day 1 of 3/i))
    .toBeInTheDocument();
  expect(screen.queryByText('Reason')).not.toBeInTheDocument();
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

test('ideal-route taper singles show their prescribed 90 percent until the weight is adjusted', () => {
  expect(formatWorkoutSetPercentDisplay({
    labelKey: 'topSingle',
    pct: 0.925,
    prescribedPct: 0.9,
  })).toBe('90');
  expect(formatWorkoutSetPercentDisplay({
    labelKey: 'topSingle',
    pct: 0.925,
    prescribedPct: 0.9,
    adjustedFromOriginal: true,
  })).toBe('92.5');
});

test('meet attempt weights lock as soon as meet execution has started', () => {
  expect(isMeetAttemptPlanLocked({
    type: 'meet',
    lifts: [{
      warmups: [{ done: false }],
      sets: [{ done: false, failed: false, skipped: false }],
    }],
  })).toBe(false);

  expect(isMeetAttemptPlanLocked({
    type: 'meet',
    lifts: [{
      warmups: [{ done: true }],
      sets: [{ done: false, failed: false, skipped: false }],
    }],
  })).toBe(true);
});

test('meet planner shows the weight unit inside the attempt value only', () => {
  render(
    <MeetPlanContent
      meetPlan={[{
        lift: 'Squat',
        oneRM: 145,
        opener: 130,
        second: 140,
        third: 150,
      }]}
      meetTotals={{ opener: 130, second: 140, third: 150 }}
      t={translations.nl}
      weightUnit="kg"
    />
  );

  expect(screen.getAllByText('130 kg').length).toBeGreaterThan(0);
  expect(screen.queryByText('kg')).not.toBeInTheDocument();
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

test('onboarding reserves the ordinary navigation footprint without showing navigation', async () => {
  localStorage.clear();
  render(<App />);

  const content = await screen.findByTestId('onboarding-content', {}, { timeout: 3000 });
  expect(content.style.minHeight).toBe(`calc(100dvh - ${BOTTOM_NAV_SPACE}px)`);
  expect(screen.queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument();
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
    expect(saved.weightUnit).toBe('kg');
    expect(saved.userProfile).toBeUndefined();
    expect(saved.prs.Squat).toBe(117.5);
    expect(saved.cycleE1RMs).toEqual({
      Squat: 117.5,
      Bench: 75,
      Deadlift: 125,
    });
    expect(saved.smartIdealRouteStartCycle).toBe(1);
    expect(saved.inProgress.workouts[0].smartIdealRoute).toMatchObject({
      workoutNumber: 1,
      stage: 'normal',
      phase: 'triple',
    });
    expect(saved.bodyWeights[0].bodyWeight).toBe(80);
  });
});

test('a legacy Smart save freezes the reconstructed cycle-start e1RMs on reload', async () => {
  localStorage.clear();
  localStorage.setItem('kel-powerlifting-user-data-v1', JSON.stringify({
    version: 1,
    trainingModel: 'smart',
    currentCycle: 1,
    prs: { Squat: 112.5, Bench: 75, Deadlift: 125 },
    history: [
      { workoutNumber: 0, cycle: 0, seedMax: true, lift: 'Squat', topWeight: 100, topReps: 1, e1rm: 100 },
      { workoutNumber: 0, cycle: 0, seedMax: true, lift: 'Bench', topWeight: 75, topReps: 1, e1rm: 75 },
      { workoutNumber: 0, cycle: 0, seedMax: true, lift: 'Deadlift', topWeight: 125, topReps: 1, e1rm: 125 },
      {
        workoutNumber: 1,
        cycle: 1,
        lift: 'Squat',
        topWeight: 105,
        topReps: 2,
        e1rm: 112,
        workoutEffort: 'good',
        workoutSnapshot: {
          number: 1,
          type: 'training',
          lifts: [{
            lift: 'Squat',
            sets: [{ weight: 105, reps: 2, done: true, failed: false, skipped: false }],
          }],
        },
      },
    ],
  }));

  render(<App />);

  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem('kel-powerlifting-user-data-v1'));
    expect(saved.prs.Squat).toBe(112.5);
    expect(saved.cycleE1RMs).toEqual({
      Squat: 100,
      Bench: 75,
      Deadlift: 125,
    });
    expect(saved.smartIdealRouteStartCycle).toBe(1);
    expect(saved.inProgress.workouts[1]).toMatchObject({
      number: 2,
      smartIdealRoute: {
        workoutNumber: 3,
        stage: 'normal',
        phase: 'triple',
      },
    });
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

test('settings combines support, feedback, source, identity and release verification in About', async () => {
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

  // The identity facts must not sit directly on the settings screen -
  // only a compact row with a button that opens them in a modal.
  expect(screen.queryByText(/com\.kelani\.sbdtracker/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Support' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'View' }));

  expect(screen.getByRole('button', { name: 'Support' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Share usage data' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Feedback' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Contact' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Report issue' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'GitHub repo' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'IzzyOnDroid (NeoStore)' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Verify release' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  const packageValue = screen.getByText(/com\.kelani\.sbdtracker/);
  expect(packageValue).toBeInTheDocument();
  expect(packageValue.style.textAlign).toBe('center');
  expect(screen.getByText(
    /15d23f2e5ee95ebc2a530b48be6f27dad7a568f722bc819f4571b3470a2ff39d/
  ).style.textAlign).toBe('center');

  const supportActionButtons = [
    'Support',
    'Share usage data',
    'Feedback',
    'Contact',
    'Report issue',
    'GitHub repo',
    'IzzyOnDroid (NeoStore)',
    'Verify release',
    'Close',
  ].map(name => screen.getByRole('button', { name }));
  expect(new Set(supportActionButtons.map(button => button.style.height)))
    .toEqual(new Set(['clamp(52px, 6.5dvh, 60px)']));
  expect(screen.getByRole('button', { name: 'Close' }).parentElement.style.width)
    .toBe('calc(50% - 4px)');

  const openSpy = jest.spyOn(window, 'open').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: 'Feedback' }));
  expect(openSpy).toHaveBeenCalledWith(
    'https://github.com/mburgosfr-star/kelani-sbd-tracker/issues/new?template=feedback.md',
    '_blank',
    'noopener,noreferrer'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Contact' }));
  expect(openSpy).toHaveBeenCalledWith(
    'mailto:mburgosfr@gmail.com?subject=Kelani%20contact',
    '_blank',
    'noopener,noreferrer'
  );
  fireEvent.click(screen.getByRole('button', { name: 'IzzyOnDroid (NeoStore)' }));
  expect(openSpy).toHaveBeenCalledWith(
    'https://apt.izzysoft.de/packages/com.kelani.sbdtracker',
    '_blank',
    'noopener,noreferrer'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Verify release' }));
  expect(openSpy).toHaveBeenCalledWith(
    'https://github.com/mburgosfr-star/kelani-sbd-tracker/blob/main/VERIFY.md',
    '_blank',
    'noopener,noreferrer'
  );
  openSpy.mockRestore();

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByText(/com\.kelani\.sbdtracker/)).not.toBeInTheDocument();
});
