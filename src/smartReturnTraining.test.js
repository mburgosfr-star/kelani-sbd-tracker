import {
  buildSmartReturnTraining,
  getDaysSinceLastCompletedWorkout,
  restoreSmartReturnTraining,
} from './smartReturnTraining';
import {
  buildSmartReadinessSignals,
  generateWorkoutsForTrainingModel,
  isSmartIdealRoutePristine,
} from './smartTrainingEngine';
import { TRAINING_MODELS } from './smartTrainingConstants';
import { applyAccessoryPlanToWorkouts } from './accessoryGeneration';
import { mergeGeneratedWorkoutStructure } from './workoutStateMerge';
import { warmupLoadJumpsNeverIncrease } from './warmupAndPrepGeneration';
import { formatSetPercentDisplay } from './workoutHistoryStats';
import { fireEvent, render, screen } from '@testing-library/react';
import { CurrentWorkout } from './App';
import { translations } from './translations';

const options = {
  programProfile: 'kelaniSbd',
  athleteLevel: 'intermediate',
  squat: 150,
  bench: 100,
  deadlift: 200,
  accessoryMode: 'standard',
  preparationMode: 'off',
  history: [],
  currentIndex: 0,
  currentCycle: 1,
};

test('suggestion uses the latest completed session date, including older Dutch dates', () => {
  const history = [
    { date: '20-09-2026', workoutSnapshot: { completed: true } },
    { date: '26-09-2026', workoutSnapshot: { completed: true } },
    { date: '01-10-2026', restDay: true, workoutSnapshot: { type: 'rest', completed: true } },
    { date: '02-10-2026', manualMax: true, workoutSnapshot: { completed: true } },
  ];
  expect(getDaysSinceLastCompletedWorkout(history, new Date(2026, 9, 3))).toBe(7);
  expect(getDaysSinceLastCompletedWorkout([
    ...history,
    { workoutSnapshot: { completed: true, completedAt: '2026-10-02T18:00:00+02:00' } },
  ], new Date(2026, 9, 3))).toBe(1);
  expect(getDaysSinceLastCompletedWorkout([], new Date(2026, 9, 3))).toBeNull();
});

test('return choice lightens only the current Smart training and can be restored', () => {
  const generated = generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, options);
  const regular = generated[0];
  const lighter = buildSmartReturnTraining(regular);

  expect(lighter).toMatchObject({
    number: regular.number,
    type: 'training',
    smartDayType: 'deload',
    smartReturnTraining: true,
    smartIdealRoute: regular.smartIdealRoute,
    smartReturnTrainingVersion: 2,
  });
  expect(lighter.lifts.map(block => block.lift)).toEqual(regular.lifts.map(block => block.lift));
  expect(lighter.accessories.map(accessory => accessory.key))
    .toEqual(regular.accessories.map(accessory => accessory.key));
  lighter.accessories.forEach((accessory, index) => {
    expect(accessory.weights.length).toBe(regular.accessories[index].weights.length);
    accessory.weights.forEach((weight, setIndex) => {
      expect(weight).toBeLessThanOrEqual(regular.accessories[index].weights[setIndex]);
    });
  });
  lighter.lifts.forEach((block, index) => {
    expect(block.sets.length).toBeGreaterThanOrEqual(4);
    expect(block.sets.length).toBeGreaterThanOrEqual(regular.lifts[index].sets.length);
    expect((block.sets.length + block.warmups.length) % 4).toBe(0);
    block.sets.slice(0, regular.lifts[index].sets.length).forEach((set, setIndex) => {
      expect(set.weight).toBeLessThanOrEqual(regular.lifts[index].sets[setIndex].weight);
      expect(set.weight % 2.5).toBe(0);
    });
    expect(block.warmups.every(warmup => warmup.weight < block.sets[0].weight)).toBe(true);
    expect(warmupLoadJumpsNeverIncrease(
      block.warmups.map(warmup => warmup.weight), block.sets[0].weight
    )).toBe(true);
  });
  expect(lighter.prepItems).toEqual(regular.prepItems);
  expect(restoreSmartReturnTraining(lighter)).toEqual(regular);
});

test('the reported low-load collisions keep a real top/back-off difference', () => {
  const makeSet = (lift, labelKey, weight, pct, reps) => ({
    lift, labelKey, weight, originalWeight: weight,
    pct, precisePct: pct, originalPct: pct, reps, done: false,
  });
  const regular = {
    type: 'training',
    lifts: [
      { lift: 'Squat', sets: [
        makeSet('Squat', 'topSingle', 40, 0.9, 1),
        ...Array.from({ length: 5 }, () => makeSet('Squat', 'backoff', 37.5, 0.825, 4)),
      ] },
      { lift: 'Bench', sets: [
        makeSet('Bench', 'topTriple', 27.5, 0.775, 3),
        ...Array.from({ length: 3 }, () => makeSet('Bench', 'backoff', 27.5, 0.775, 6)),
      ] },
    ],
    accessories: [{ key: 'row', weights: [15, 15, 15, 15], originalWeights: [15, 15, 15, 15] }],
    prepItems: [{ key: 'hipOpeners', done: false }],
  };
  const lighter = buildSmartReturnTraining(regular);

  expect(lighter.lifts[0].sets[0].weight).toBe(35);
  expect(lighter.lifts[0].sets[1].weight).toBe(32.5);
  expect(lighter.lifts[1].sets[0].weight).toBe(25);
  expect(lighter.lifts[1].sets[1].weight).toBe(22.5);
  lighter.lifts.forEach(block => {
    expect(block.sets.length).toBeGreaterThanOrEqual(4);
    expect((block.warmups.length + block.sets.length) % 4).toBe(0);
    expect(block.sets[1].pct).toBeLessThan(block.sets[0].pct);
  });
  expect(lighter.accessories[0].weights).toEqual([12.5, 12.5, 12.5, 12.5]);
  expect(lighter.prepItems).toEqual(regular.prepItems);
});

test('rounded beginner top and back-off loads have matching displayed percentages', () => {
  const regular = generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, {
    ...options,
    athleteLevel: 'beginner',
    squat: 45,
    bench: 35,
    deadlift: 65,
  })[0];
  const lighter = buildSmartReturnTraining(regular);

  lighter.lifts.forEach(block => {
    const top = block.sets.find(set => /^top|^heavySingle/.test(set.labelKey));
    const backoffs = block.sets.filter(set => set.labelKey === 'backoff');
    if (top && backoffs.length) {
      backoffs.forEach(set => expect(set.weight).toBeLessThan(top.weight));
    }
    const percentByWeight = new Map();
    block.sets.forEach(set => {
      const display = formatSetPercentDisplay(set.prescribedPct || set.pct);
      if (percentByWeight.has(set.weight)) {
        expect(display).toBe(percentByWeight.get(set.weight));
      }
      percentByWeight.set(set.weight, display);
    });
  });
});

test('the chosen return workout survives save/reload merging and does not change future route slots', () => {
  const generated = generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, options);
  const lighter = buildSmartReturnTraining(generated[0]);
  const saved = JSON.parse(JSON.stringify([lighter, ...generated.slice(1)]));
  const merged = mergeGeneratedWorkoutStructure(saved, generated, [], 1);
  const regenerated = applyAccessoryPlanToWorkouts(merged, generated, new Set(), 1);

  expect(regenerated[0]).toEqual(lighter);
  expect(regenerated[1]).toEqual(generated[1]);
  expect(regenerated[2].smartIdealRoute).toEqual(generated[2].smartIdealRoute);
});

test('an untouched older return workout upgrades on reload without changing a started one', () => {
  const generated = generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, options);
  const current = buildSmartReturnTraining(generated[0]);
  const old = {
    ...current,
    smartReturnTrainingVersion: undefined,
    accessories: [],
    lifts: current.lifts.map(block => ({ ...block, sets: block.sets.slice(0, 2) })),
  };
  const upgraded = mergeGeneratedWorkoutStructure([old, ...generated.slice(1)], generated, [], 1)[0];
  expect(upgraded).toEqual(current);

  const prepStarted = {
    ...old,
    smartReturnBaseline: {
      ...old.smartReturnBaseline,
      prepItems: [{ labelKey: 'prepHipOpeners', done: false }],
    },
    prepItems: [{ labelKey: 'prepHipOpeners', done: true }],
  };
  const prepUpgraded = mergeGeneratedWorkoutStructure(
    [prepStarted, ...generated.slice(1)], generated, [], 1
  )[0];
  expect(prepUpgraded.smartReturnTrainingVersion).toBe(2);
  expect(prepUpgraded.prepItems[0].done).toBe(true);
  expect(prepUpgraded.accessories).toEqual(current.accessories);

  const started = {
    ...old,
    lifts: old.lifts.map((block, index) => ({
      ...block,
      sets: block.sets.map((set, setIndex) => ({
        ...set,
        done: index === 0 && setIndex === 0,
      })),
    })),
  };
  expect(mergeGeneratedWorkoutStructure([started, ...generated.slice(1)], generated, [], 1)[0])
    .toEqual(started);
});

test('an easy return session advances the route without earning a TOO EASY credit', () => {
  const first = buildSmartReturnTraining(
    generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, options)[0]
  );
  const completed = {
    ...first,
    completed: true,
    workoutEffort: 'easy',
    smartReturnBaseline: undefined,
    lifts: first.lifts.map(block => ({
      ...block,
      sets: block.sets.map(set => ({ ...set, done: true })),
    })),
  };
  const history = completed.lifts.map(block => ({
    cycle: 1,
    workoutNumber: 1,
    lift: block.lift,
    smartDayType: 'deload',
    workoutEffort: 'easy',
    workoutSnapshot: completed,
  }));
  const next = generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, {
    ...options,
    history,
    currentIndex: 1,
  })[1];

  expect(next.smartIdealRoute.workoutNumber).toBe(2);
  expect(next.smartDecisionSummary.readiness.meetProjection.pendingTooEasyAccelerationCount).toBe(0);
  expect(buildSmartReadinessSignals({ history, currentCycle: 1 }).rollingLiftExposureCounts)
    .toEqual({ Squat: 0, Bench: 0, Deadlift: 0 });
  expect(isSmartIdealRoutePristine({ history, currentCycle: 1 })).toBe(false);
});

test('the Smart modal offers a voluntary return choice without adding a workout-screen card', () => {
  const workout = generateWorkoutsForTrainingModel(TRAINING_MODELS.SMART, options)[0];
  const choose = vi.fn();
  const props = {
    trainingModel: TRAINING_MODELS.SMART,
    workout,
    currentCycle: 1,
    totalWorkouts: 28,
    isReadOnly: false,
    preparationMode: 'off',
    daysSinceLastWorkout: 7,
    canChangeReturnTraining: true,
    onChooseReturnTraining: choose,
    onComplete: vi.fn(),
    t: translations.nl,
  };

  const view = render(<CurrentWorkout {...props} />);
  expect(screen.queryByText('Je laatste training was 7 dagen geleden. Wil je rustig hervatten?'))
    .not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Smart: Training/i }));
  const dialog = screen.getByRole('dialog', { name: translations.nl.smartWorkoutDialogLabel });
  expect(dialog).toBeInTheDocument();
  expect(dialog.querySelector('section[aria-label="Hervattraining"]')).not.toBeNull();
  expect(screen.getByText('Je laatste training was 7 dagen geleden. Wil je rustig hervatten?'))
    .toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: translations.nl.smartReturnTrainingChoose }));
  expect(choose).toHaveBeenCalledWith(true);

  view.rerender(<CurrentWorkout {...props} workout={buildSmartReturnTraining(workout)} />);
  fireEvent.click(screen.getByRole('button', { name: translations.nl.smartReturnTrainingRestore }));
  expect(choose).toHaveBeenCalledWith(false);
});
