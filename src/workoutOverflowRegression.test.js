import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CurrentWorkout, scrollActiveWorkoutTarget, appViewportStyle } from './App';
import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import { createWorkoutSetup } from './workoutSetup';
import { translations } from './translations';

test('a short viewport never disables scrolling on the active workout', () => {
  expect(appViewportStyle({ screen: 'current', allowContentScroll: false }))
    .toMatchObject({ '--kelani-screen-overflow-y': 'auto' });
  expect(appViewportStyle({ screen: 'dashboard', allowContentScroll: false }))
    .toMatchObject({ '--kelani-screen-overflow-y': 'hidden' });
});

function focusGeometry({ targetTop = 500, targetBottom = 550, liftTop, liftBottom, completionBottom, scrollTop = 100, viewportHeight = 600 } = {}) {
  const rect = (top, bottom) => ({ top, bottom, height: bottom - top });
  const completion = completionBottom ? { getBoundingClientRect: () => rect(completionBottom - 50, completionBottom) } : null;
  const region = {
    getBoundingClientRect: () => rect(100, 100 + viewportHeight),
    clientHeight: viewportHeight,
    scrollHeight: 1800,
    scrollTop,
    scrollTo: vi.fn(),
    querySelector: () => completion,
  };
  const lift = liftTop !== undefined ? {
    getBoundingClientRect: () => rect(liftTop, liftBottom),
    dataset: { workoutFocusEnd: completion ? 'true' : undefined },
  } : null;
  const target = {
    closest: selector => selector.includes('screen-scroll-content') ? region : lift,
    getBoundingClientRect: () => rect(targetTop, targetBottom),
  };
  return { region, target };
}

test('dynamic focus centres an active set even when it is already visible', () => {
  const { region, target } = focusGeometry();
  scrollActiveWorkoutTarget(target);
  expect(region.scrollTo).toHaveBeenCalledWith({ top: 225, behavior: 'smooth' });
});

test('dynamic focus centres the whole lift when all its sets fit', () => {
  const { region, target } = focusGeometry({ liftTop: 400, liftBottom: 800 });
  scrollActiveWorkoutTarget(target);
  expect(region.scrollTo).toHaveBeenCalledWith({ top: 300, behavior: 'smooth' });
});

test('the last meet lift includes the completion action when both fit', () => {
  const { region, target } = focusGeometry({ targetTop: 650, targetBottom: 700, liftTop: 600, liftBottom: 900, completionBottom: 980 });
  scrollActiveWorkoutTarget(target);
  expect(region.scrollTo).toHaveBeenCalledWith({ top: 490, behavior: 'smooth' });
});

test('a tall lift centres the active set instead of hiding it to fit the whole lift', () => {
  const { region, target } = focusGeometry({ liftTop: 200, liftBottom: 1100 });
  scrollActiveWorkoutTarget(target);
  expect(region.scrollTo).toHaveBeenCalledWith({ top: 225, behavior: 'smooth' });
});

test('centering stays within the available scroll range', () => {
  const { region, target } = focusGeometry({ targetTop: 1800, targetBottom: 1850 });
  scrollActiveWorkoutTarget(target);
  expect(region.scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: 'smooth' });
});

test('the last meet lift stays the focus when the completion action cannot fit alongside it', () => {
  const { region, target } = focusGeometry({ liftTop: 400, liftBottom: 800, completionBottom: 1100 });
  scrollActiveWorkoutTarget(target);
  expect(region.scrollTo).toHaveBeenCalledWith({ top: 300, behavior: 'smooth' });
});

test('moving from Bench to Deadlift centres the lift together with the completion action', async () => {
  const makeWorkout = benchDone => ({
    number: 27,
    type: 'meet',
    lifts: [
      { lift: 'Squat', warmups: [], sets: [{ weight: 50, reps: 1, done: true }] },
      { lift: 'Bench', warmups: [], sets: [{ weight: 40, reps: 1, done: benchDone }] },
      { lift: 'Deadlift', warmups: [{ weight: 20, reps: 5, done: false }], sets: [
        { labelKey: 'opener', weight: 60, pct: 0.9, reps: 1, done: false },
        { labelKey: 'secondAttempt', weight: 65, pct: 0.975, reps: 1, done: false },
        { labelKey: 'thirdAttempt', weight: 70, pct: 1.025, reps: 1, done: false },
      ] },
    ],
  });
  const props = { trainingModel: 'smart', currentCycle: 1, totalWorkouts: 28, isReadOnly: false, t: translations.en };
  const view = render(<CurrentWorkout {...props} workout={makeWorkout(false)} />);
  const region = screen.getByTestId('screen-scroll-content');
  region.scrollTo = vi.fn();
  region.getBoundingClientRect = () => ({ top: 100, bottom: 700, height: 600 });
  Object.defineProperty(region, 'clientHeight', { configurable: true, value: 600 });
  Object.defineProperty(region, 'scrollHeight', { configurable: true, value: 1800 });
  region.scrollTop = 100;
  const deadlift = screen.getByTestId('workout-lift-Deadlift');
  deadlift.getBoundingClientRect = () => ({ top: 600, bottom: 900, height: 300 });
  within(deadlift).getByTestId('warmup-row-0').getBoundingClientRect = () => ({ top: 650, bottom: 710, height: 60 });
  screen.getByRole('button', { name: translations.en.completeWorkout }).getBoundingClientRect = () => ({ top: 930, bottom: 980, height: 50 });

  view.rerender(<CurrentWorkout {...props} workout={makeWorkout(true)} />);
  await waitFor(() => expect(region.scrollTo).toHaveBeenCalledWith({ top: 490, behavior: 'smooth' }));
});

test('Smart C1W1 keeps preparation, all accessories and completion reachable', () => {
  const workoutSetup = createWorkoutSetup({
    preparationMode: 'basicFirst',
    accessoryMode: 'standard',
  });
  const workout = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbd',
    athleteLevel: 'beginner',
    squat: 50,
    bench: 35,
    deadlift: 70,
    history: [],
    currentIndex: 0,
    currentCycle: 1,
    preparationMode: 'off',
    accessoryMode: 'off',
    workoutSetup,
    skipMeetProjectionSimulation: true,
  })[0];
  const onComplete = vi.fn();
  const props = {
    trainingModel: 'smart',
    currentCycle: 1,
    totalWorkouts: 28,
    isReadOnly: false,
    t: translations.en,
    preparationMode: 'off',
    workoutSetup,
    onComplete,
  };

  expect(workout.prepItems).toHaveLength(4);
  expect(workout.accessories).toHaveLength(4);
  const view = render(<CurrentWorkout {...props} workout={workout} />);
  const content = screen.getByTestId('screen-scroll-content');
  expect(content).toHaveStyle({ gridAutoRows: 'max-content' });
  workout.prepItems.forEach(item => {
    expect(content.querySelector(`[title="${translations.en[item.labelKey]}"]`))
      .not.toBeNull();
  });
  expect(screen.getAllByTestId('workout-accessory-group')).toHaveLength(4);
  expect(screen.getByRole('button', { name: translations.en.completeWorkout }))
    .toBeDisabled();

  const finishedMainSets = {
    ...workout,
    lifts: workout.lifts.map(block => ({
      ...block,
      sets: block.sets.map(set => ({ ...set, done: true })),
    })),
  };
  view.rerender(<CurrentWorkout {...props} workout={finishedMainSets} />);
  const complete = screen.getByRole('button', {
    name: translations.en.completeWorkout,
  });
  expect(complete).toBeEnabled();
  fireEvent.click(complete);
  expect(onComplete).toHaveBeenCalledOnce();
});
