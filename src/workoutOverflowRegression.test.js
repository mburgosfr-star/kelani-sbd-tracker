import { fireEvent, render, screen } from '@testing-library/react';
import { CurrentWorkout, activeWorkoutTargetNeedsScroll, appViewportStyle } from './App';
import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import { createWorkoutSetup } from './workoutSetup';
import { translations } from './translations';

test('a short viewport never disables scrolling on the active workout', () => {
  expect(appViewportStyle({ screen: 'current', allowContentScroll: false }))
    .toMatchObject({ '--kelani-screen-overflow-y': 'auto' });
  expect(appViewportStyle({ screen: 'dashboard', allowContentScroll: false }))
    .toMatchObject({ '--kelani-screen-overflow-y': 'hidden' });
});

test('dynamic focus leaves visible workout controls in place and follows hidden ones', () => {
  const region = {
    getBoundingClientRect: () => ({ top: 100, bottom: 700, height: 600 }),
  };
  const target = (top, bottom) => ({
    closest: () => region,
    getBoundingClientRect: () => ({ top, bottom, height: bottom - top }),
  });

  expect(activeWorkoutTargetNeedsScroll(target(150, 200))).toBe(false);
  expect(activeWorkoutTargetNeedsScroll(target(90, 140))).toBe(true);
  expect(activeWorkoutTargetNeedsScroll(target(680, 720))).toBe(true);
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
    name: `${translations.en.completeWorkout} ✓`,
  });
  expect(complete).toBeEnabled();
  fireEvent.click(complete);
  expect(onComplete).toHaveBeenCalledOnce();
});
