import { render } from '@testing-library/react';
import React from 'react';
import { CurrentWorkout } from './App';
import * as Translations from './translations';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: jest.fn(), writable: true,
  });
});

test('multi-lift workout groups lifts without negative margin hacks', () => {
  const t = Translations.translations['en'];

  const workout = {
    type: 'training',
    number: 1,
    lift: 'Squat',
    sets: [],
    lifts: [
      {
        lift: 'Squat',
        sets: [{ reps: 5, target: 100, done: true }]
      },
      {
        lift: 'Bench',
        sets: [{ reps: 5, target: 80, done: false }]
      }
    ]
  };

  const { container } = render(
    <CurrentWorkout
      workout={workout}
      t={t}
      weightUnit="kg"
      isReadOnly={false}
      onComplete={() => {}}
      onToggleSet={() => {}}
      onToggleMeetSet={() => {}}
      smartModel={true}
    />
  );

  const blocks = container.querySelectorAll('div[style*="border-radius: 8px"]');
  const hasNegativeMargin = Array.from(blocks).some(block => block.style && block.style.marginTop === '-40px');
  expect(hasNegativeMargin).toBe(false);

  // Verify the lifts are wrapped in a flex column container
  // We can just check the DOM string
  expect(container.innerHTML).toContain('flex-direction: column');
});

test('multi-lift workout preserves spacing when a rest timer is active', () => {
  const t = Translations.translations['en'];

  const workout = {
    type: 'training',
    number: 1,
    lift: 'Squat',
    sets: [],
    lifts: [
      {
        lift: 'Squat',
        sets: [{ reps: 5, target: 100, done: true }]
      },
      {
        lift: 'Bench',
        sets: [{ reps: 5, target: 80, done: false }]
      }
    ]
  };

  const timer = {
    id: 'test-timer',
    placement: { workoutNumber: 1, type: 'meetSet', liftIndex: 0, index: 0 },
    seconds: 180,
    endTime: Date.now() + 180000
  };

  const { container, getByText } = render(
    <CurrentWorkout
      workout={workout}
      timer={timer}
      t={t}
      weightUnit="kg"
      isReadOnly={false}
      onComplete={() => {}}
      onToggleSet={() => {}}
      onToggleMeetSet={() => {}}
      smartModel={true}
    />
  );

  expect(getByText(t.restTime)).toBeInTheDocument();

  const blocks = container.querySelectorAll('div[style*="border-radius: 8px"]');
  const hasNegativeMargin = Array.from(blocks).some(block => block.style && block.style.marginTop === '-40px');
  expect(hasNegativeMargin).toBe(false);
});
