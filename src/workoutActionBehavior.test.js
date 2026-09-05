import { fireEvent, render, screen, within } from '@testing-library/react';
import {
  AccessoryGroup,
  BackoffGroup,
  CurrentWorkout,
  WarmupGrid,
  WorkoutCompletionButton,
} from './App';
import { translations } from './translations';
import {
  generatePrepItems,
  generateSmartWorkoutPrepItems,
} from './warmupAndPrepGeneration';
import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import { generateAccessoriesForWorkout } from './accessoryGeneration';
import { displayWeightToKg, formatWeightFromKg } from './workoutUnits';

const preparationContexts = ['nl', 'en', 'ca'].flatMap(language =>
  ['training', 'meet'].map(type => ({ language, type }))
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: jest.fn(),
    writable: true,
  });
});

function expectLastAutoScrollTarget(target) {
  const scrollMock = HTMLElement.prototype.scrollIntoView;
  const lastCallIndex = scrollMock.mock.calls.length - 1;

  expect(lastCallIndex).toBeGreaterThanOrEqual(0);
  expect(scrollMock.mock.contexts[lastCallIndex]).toBe(target);
  expect(scrollMock).toHaveBeenLastCalledWith({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest',
  });
}

test('dynamic focus scrolls each active warm-up and grouped work set into the centre', () => {
  const scrollMock = HTMLElement.prototype.scrollIntoView;
  scrollMock.mockClear();

  const warmups = [
    { weight: 20, reps: 5, done: false },
    { weight: 60, reps: 3, done: false },
  ];
  const warmupProps = {
    warmups,
    referenceSets: [{ weight: 100, pct: 1 }],
    isReadOnly: false,
    onToggle: jest.fn(),
    renderTimer: () => null,
    t: translations.en,
    lift: 'Squat',
  };
  const warmupRender = render(
    <WarmupGrid {...warmupProps} activeIndex={0} />
  );

  expectLastAutoScrollTarget(screen.getByTestId('warmup-row-0'));

  warmupRender.rerender(
    <WarmupGrid {...warmupProps} activeIndex={1} />
  );
  expectLastAutoScrollTarget(screen.getByTestId('warmup-row-1'));
  warmupRender.unmount();

  scrollMock.mockClear();
  const entries = [
    { index: 2, set: { weight: 70, pct: 0.7, reps: 4, done: false } },
    { index: 3, set: { weight: 70, pct: 0.7, reps: 4, done: false } },
  ];
  const groupProps = {
    entries,
    isReadOnly: false,
    onToggle: jest.fn(),
    onEditAll: jest.fn(),
    onRestoreAll: jest.fn(),
    onMarkFailed: jest.fn(),
    renderTimer: () => null,
    t: translations.en,
    lift: 'Squat',
  };
  const groupRender = render(
    <BackoffGroup {...groupProps} activeIndex={2} />
  );

  expectLastAutoScrollTarget(screen.getByTestId('workout-set-group-item-2'));

  groupRender.rerender(
    <BackoffGroup {...groupProps} activeIndex={3} />
  );
  expectLastAutoScrollTarget(screen.getByTestId('workout-set-group-item-3'));
});

test('the completion action scrolls into the centre when it receives dynamic focus', () => {
  const scrollMock = HTMLElement.prototype.scrollIntoView;
  scrollMock.mockClear();

  const completionRender = render(
    <WorkoutCompletionButton active={false}>Complete workout</WorkoutCompletionButton>
  );
  expect(scrollMock).not.toHaveBeenCalled();

  completionRender.rerender(
    <WorkoutCompletionButton active>Complete workout</WorkoutCompletionButton>
  );
  expectLastAutoScrollTarget(screen.getByRole('button', { name: 'Complete workout' }));
});

function renderCurrentWorkout(workout, { t = translations.en, isReadOnly = false } = {}) {
  const handlers = {
    onTogglePrepItem: jest.fn(),
    onToggleWarmup: jest.fn(),
    onToggleSet: jest.fn(),
    onMarkSetFailed: jest.fn(),
    onRestoreSetWeight: jest.fn(),
    onToggleAccessorySet: jest.fn(),
    onMarkAccessorySetFailed: jest.fn(),
    onRestoreAccessoryWeight: jest.fn(),
    onToggleCooldownItem: jest.fn(),
    onToggleMeetWarmup: jest.fn(),
    onToggleMeetSet: jest.fn(),
    onMarkLiftBlockSetFailed: jest.fn(),
    onRestoreLiftBlockSetWeight: jest.fn(),
    onLiftBlockWeightChange: jest.fn(),
    onWeightChange: jest.fn(),
    onAccessoryWeightChange: jest.fn(),
    onComplete: jest.fn(),
    onActivateWorkout: jest.fn(),
    setTimer: jest.fn(),
    startTimer: jest.fn(),
  };

  render(
    <CurrentWorkout
      trainingModel="smart"
      workout={workout}
      currentCycle={1}
      totalWorkouts={1}
      isReadOnly={isReadOnly}
      t={t}
      weightUnit="kg"
      timer={null}
      athleteLevel="beginner"
      eStrengthRatio={2}
      eStrengthMax={2}
      latestBodyWeight={70}
      currentE1RMs={{ Squat: 100, Bench: 70, Deadlift: 120 }}
      {...handlers}
    />
  );

  return handlers;
}

test.each(preparationContexts)('one translated preparation section appears before all main lifts in $language ($type)', ({ language, type }) => {
  const t = translations[language];
  const lifts = ['Squat', 'Bench', 'Deadlift'];
  const workout = {
    number: 1,
    type,
    prepItems: generateSmartWorkoutPrepItems(lifts).map((item, index) => ({
      ...item,
      done: index === 0,
    })),
    lifts: lifts.map(lift => ({
      lift,
      prepItems: [],
      warmups: [{ weight: 20, reps: 5, done: false }],
      sets: [{ weight: 60, reps: 5, done: false }],
    })),
  };
  const handlers = renderCurrentWorkout(workout, { t });

  const firstLiftSection = screen.getByTestId('workout-lift-Squat');
  const prepTitle = screen.getByText(t.prepTitle, { exact: true });
  expect(prepTitle.compareDocumentPosition(firstLiftSection) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy();

  workout.prepItems.forEach((item, itemIndex) => {
    const button = screen.getByRole('button', { name: t[item.labelKey], exact: true });
    expect(button).toBeEnabled();
    expect(button.closest('[data-testid^="workout-lift-"]')).toBeNull();
    fireEvent.click(button);
    expect(handlers.onTogglePrepItem).toHaveBeenLastCalledWith(itemIndex);
  });
  expect(screen.getByRole('button', { name: t.prepBandPullApart, exact: true }).style.animation)
    .toContain('kelaniActiveWorkoutCirclePulse');
  expect(screen.getByRole('button', { name: t.prepHipHinges, exact: true }).style.animation)
    .not.toContain('kelaniActiveWorkoutCirclePulse');
});

test.each(preparationContexts)('preparation off adds no controls or completion steps in $language ($type)', ({ language, type }) => {
  const t = translations[language];
  const generated = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbd',
    squat: 100,
    bench: 70,
    deadlift: 120,
    history: [],
    currentIndex: 0,
    currentCycle: 1,
    preparationMode: 'off',
    accessoryMode: 'off',
    cooldownMode: 'off',
    skipMeetProjectionSimulation: true,
  }).find(workout => workout.type === type);
  expect(generated).toBeTruthy();
  expect(generated.lifts.length).toBeGreaterThan(1);

  const completedSets = {
    ...generated,
    lifts: generated.lifts.map(block => ({
      ...block,
      warmups: block.warmups.map(set => ({ ...set, done: true })),
      sets: block.sets.map(set => ({ ...set, done: true })),
    })),
  };
  const handlers = renderCurrentWorkout(completedSets, { t });

  generated.lifts.forEach(block => {
    expect(block.prepItems).toEqual([]);
    generatePrepItems(block.lift).forEach(item => {
      expect(screen.queryByRole('button', {
        name: t[item.labelKey], exact: true,
      })).not.toBeInTheDocument();
    });
  });
  const completeButton = screen.getByRole('button', {
    name: `${t.completeWorkout} ✓`, exact: true,
  });
  expect(completeButton).toBeEnabled();
  expect(completeButton).toHaveAttribute('data-dynamic-focus', 'true');
  fireEvent.click(completeButton);
  expect(handlers.onComplete).toHaveBeenCalledTimes(1);
  expect(handlers.onTogglePrepItem).not.toHaveBeenCalled();
});

test('preparation remains read-only for a completed or future workout', () => {
  const handlers = renderCurrentWorkout({
    number: 2,
    type: 'meet',
    prepItems: generateSmartWorkoutPrepItems(['Squat', 'Bench', 'Deadlift']),
    lifts: ['Squat', 'Bench', 'Deadlift'].map(lift => ({
      lift,
      prepItems: [],
      warmups: [],
      sets: [{ labelKey: 'opener', weight: 60, reps: 1, done: false }],
    })),
  }, { isReadOnly: true });

  const button = screen.getByRole('button', { name: translations.en.prepHipHinges, exact: true });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(handlers.onTogglePrepItem).not.toHaveBeenCalled();
});

function useThreeSetActions({ onRestore, onMissed, onEdit }) {
  fireEvent.click(screen.getByRole('button', {
    name: translations.en.restoreOriginalWeight,
  }));
  expect(onRestore).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', {
    name: translations.en.markSetFailed,
  }));
  expect(onMissed).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: translations.en.edit }));
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: '105' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onEdit).toHaveBeenCalledTimes(1);
}

test('all three actions are usable on an ordinary flat workout set', () => {
  const handlers = renderCurrentWorkout({
    number: 1,
    type: 'training',
    lift: 'Squat',
    prepItems: [],
    warmups: [],
    sets: [{
      weight: 100,
      originalWeight: 100,
      pct: 0.75,
      originalPct: 0.75,
      reps: 3,
      done: false,
      failed: false,
      skipped: false,
    }],
    accessories: [],
    cooldownItems: [],
  });

  useThreeSetActions({
    onRestore: handlers.onRestoreSetWeight,
    onMissed: handlers.onMarkSetFailed,
    onEdit: handlers.onWeightChange,
  });
  expect(handlers.onRestoreSetWeight).toHaveBeenCalledWith(0);
  expect(handlers.onMarkSetFailed).toHaveBeenCalledWith(0);
  expect(handlers.onWeightChange).toHaveBeenCalledWith('set', 0, 105);
});

test.each([
  ['ordinary Smart Training', 'training'],
  ['meet day', 'meet'],
])('all three actions are usable on the active set during %s', (_, type) => {
  const handlers = renderCurrentWorkout({
    number: 1,
    type,
    smartDayType: type === 'meet' ? 'meet' : 'training',
    lifts: [{
      lift: 'Squat',
      prepItems: [],
      warmups: [{ weight: 20, reps: 5, done: true }],
      sets: [{
        labelKey: type === 'meet' ? 'opener' : 'topTriple',
        weight: 100,
        originalWeight: 100,
        pct: type === 'meet' ? 0.9 : 0.75,
        originalPct: type === 'meet' ? 0.9 : 0.75,
        reps: type === 'meet' ? 1 : 3,
        done: false,
        failed: false,
        skipped: false,
      }],
    }],
    accessories: [],
    cooldownItems: [],
  });

  useThreeSetActions({
    onRestore: handlers.onRestoreLiftBlockSetWeight,
    onMissed: handlers.onMarkLiftBlockSetFailed,
    onEdit: handlers.onLiftBlockWeightChange,
  });
  expect(handlers.onRestoreLiftBlockSetWeight).toHaveBeenCalledWith(0, 0);
  expect(handlers.onMarkLiftBlockSetFailed).toHaveBeenCalledWith(0, 0);
  expect(handlers.onLiftBlockWeightChange).toHaveBeenCalledWith(0, 0, 105);
});

test('all three actions are usable on a weighted accessory set', () => {
  const handlers = renderCurrentWorkout({
    number: 1,
    type: 'training',
    lift: 'Bench',
    prepItems: [],
    warmups: [],
    sets: [{ weight: 70, reps: 3, done: true, skipped: false }],
    accessories: [{
      name: 'Row',
      reps: 10,
      weights: [40],
      originalWeights: [40],
      done: [false],
      failed: [false],
      skipped: [false],
    }],
    cooldownItems: [],
  });

  fireEvent.click(screen.getByRole('button', {
    name: translations.en.restoreOriginalWeight,
  }));
  expect(handlers.onRestoreAccessoryWeight).toHaveBeenCalledWith(0, 0);

  fireEvent.click(screen.getByRole('button', {
    name: translations.en.markSetFailed,
  }));
  expect(handlers.onMarkAccessorySetFailed).toHaveBeenCalledWith(0, 0);

  fireEvent.click(screen.getByRole('button', { name: translations.en.edit }));
  const input = screen.getByRole('spinbutton');
  fireEvent.change(input, { target: { value: '35' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(handlers.onAccessoryWeightChange).toHaveBeenCalledWith(0, 0, 35);
});

const rowContexts = ['nl', 'en', 'ca'].flatMap(language =>
  ['kg', 'lb'].flatMap(weightUnit =>
    ['normal', 'light'].map(accessoryIntensity => ({ language, weightUnit, accessoryIntensity }))
  )
);

test.each(rowContexts)(
  'generated $accessoryIntensity Row has four translated sets and usable actions ($language, $weightUnit)',
  ({ language, weightUnit, accessoryIntensity }) => {
    const t = translations[language];
    const row = generateAccessoriesForWorkout({
      type: 'training', lift: 'Bench', accessoryIntensity,
    }, {
      accessoryMode: 'standard', oneRMs: { Squat: 100, Bench: 70, Deadlift: 120 }, smart: true,
    }).find(item => item.key === 'row');
    const onToggle = jest.fn();
    const onEditAll = jest.fn();
    const onRestoreAll = jest.fn();
    const onMarkFailed = jest.fn();
    render(
      <AccessoryGroup
        acc={row}
        accIndex={0}
        isActiveGroup
        isReadOnly={false}
        hasMoreAccessoryWork={false}
        onToggle={onToggle}
        onEditAll={onEditAll}
        onRestoreAll={onRestoreAll}
        onMarkFailed={onMarkFailed}
        renderTimer={() => null}
        t={t}
        weightUnit={weightUnit}
      />
    );

    expect(screen.getByTestId('workout-accessory-label')).toHaveTextContent(t.accessoryRow);
    const items = screen.getAllByTestId(/workout-accessory-set-item-/);
    expect(items).toHaveLength(4);
    items.forEach((item, index) => {
      expect(within(item).getByText(formatWeightFromKg(row.weights[index], weightUnit))).toBeInTheDocument();
      expect(within(item).getByText(String(row.reps))).toBeInTheDocument();
      fireEvent.click(within(item).getByRole('button'));
      expect(onToggle).toHaveBeenLastCalledWith(index);
    });
    fireEvent.click(screen.getByRole('button', { name: t.restoreOriginalWeight }));
    expect(onRestoreAll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: t.markSetFailed }));
    expect(onMarkFailed).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole('button', { name: t.edit }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '25' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onEditAll).toHaveBeenCalledWith(displayWeightToKg(25, weightUnit));
  }
);

test('group editing starts from the current open work-set weight', () => {
  const onEditAll = jest.fn();
  render(
    <BackoffGroup
      entries={[
        { index: 0, set: { weight: 100, originalWeight: 100, reps: 4, done: true } },
        { index: 1, set: { weight: 90, originalWeight: 100, reps: 4, done: false } },
      ]}
      activeIndex={1}
      isReadOnly={false}
      onToggle={jest.fn()}
      onEditAll={onEditAll}
      onRestoreAll={jest.fn()}
      onMarkFailed={jest.fn()}
      renderTimer={() => null}
      t={translations.en}
      lift="Squat"
    />
  );

  fireEvent.click(screen.getByRole('button', { name: translations.en.edit }));
  const input = screen.getByRole('spinbutton');
  expect(input).toHaveValue(90);
  fireEvent.change(input, { target: { value: '85' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onEditAll).toHaveBeenCalledWith(85);
});

test('accessory editing starts from the current open accessory-set weight', () => {
  const onEditAll = jest.fn();
  render(
    <AccessoryGroup
      acc={{
        name: 'Row',
        reps: 10,
        weights: [40, 35],
        originalWeights: [40, 40],
        done: [true, false],
        failed: [false, false],
        skipped: [false, false],
      }}
      accIndex={0}
      isActiveGroup
      isReadOnly={false}
      hasMoreAccessoryWork
      onToggle={jest.fn()}
      onEditAll={onEditAll}
      onRestoreAll={jest.fn()}
      onMarkFailed={jest.fn()}
      renderTimer={() => null}
      t={translations.en}
    />
  );

  fireEvent.click(screen.getByRole('button', { name: translations.en.edit }));
  const input = screen.getByRole('spinbutton');
  expect(input).toHaveValue(35);
  fireEvent.change(input, { target: { value: '30' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onEditAll).toHaveBeenCalledWith(30);
});
