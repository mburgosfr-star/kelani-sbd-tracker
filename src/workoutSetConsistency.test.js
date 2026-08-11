import { render } from '@testing-library/react';
import { BackoffGroup, SetRow } from './App';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: jest.fn(),
    writable: true,
  });
});

const t = {
  edit: 'Edit', restoreOriginalWeight: 'Restore', markSetFailed: 'Fail',
  set: 'Set', perSideSuffix: '/ side', setEffortHard: 'Hard',
  topSetSkipped: 'Set skipped. Continue with the next set.',
  lastSetSkipped: 'Set skipped.',
};

test('keeps reps visible inside a completed set circle', () => {
  const view = render(
    <SetRow
      set={{ labelKey: 'topDouble', reps: 2, weight: 140, pct: 0.775,
        effort: 'hard', done: true, skipped: false }}
      index={0} label="Top double" onToggle={() => {}}
      onWeightChange={() => {}} onMarkFailed={() => {}}
      onRestoreWeight={() => {}} isActive={false} isReadOnly={false}
      t={t} lift="Deadlift"
    />
  );

  const item = view.getByTestId('workout-set-circle-item');
  expect(item.firstElementChild).toHaveTextContent('140 kg80%');
  expect(view.getByTestId('workout-circle-reps')).toHaveTextContent('2');
  expect(view.getByTestId('workout-circle-status')).toHaveTextContent('✓');
  expect(view.getByTestId('workout-set-effort-label')).toHaveTextContent('Hard');
  expect(view.queryByText('2 × 140 kg (77.5%)')).toBeNull();
});

test('gives every grouped set its own weight label and reps value', () => {
  const view = render(
    <BackoffGroup
      entries={[
        { index: 1, set: { reps: 3, weight: 125, pct: 0.7, done: false, skipped: false } },
        { index: 2, set: { reps: 3, weight: 125, pct: 0.7, done: true, skipped: false } },
      ]}
      activeIndex={1} isReadOnly={false} onToggle={() => {}}
      onEditAll={() => {}} onRestoreAll={() => {}} onMarkFailed={() => {}}
      renderTimer={() => null} t={t} lift="Deadlift"
    />
  );

  const groupedItems = view.getAllByTestId(/workout-set-group-item-/);
  expect(groupedItems).toHaveLength(2);

  groupedItems.forEach(item => {
    expect(item.firstElementChild).toHaveTextContent('125 kg70%');
  });
  const reps = view.getAllByTestId('workout-circle-reps');
  expect(reps.map(node => node.textContent)).toEqual(['3', '3']);
  expect(view.queryByText('3 × 125 kg (70%)')).toBeNull();
  expect(view.getByTestId('workout-set-group-action-grid').style.gap)
    .toBe('clamp(8px, 2vw, 10px)');
  expect(view.getByTestId('workout-circle-status')).toHaveTextContent('✓');
});

test('never tells the athlete to "continue with the next set" when the skipped set is the very last one of the workout', () => {
  const entries = [
    { index: 0, set: { reps: 3, weight: 125, pct: 0.7, done: true, skipped: false } },
    { index: 1, set: { reps: 3, weight: 125, pct: 0.7, done: false, skipped: true } },
  ];

  const midWorkout = render(
    <BackoffGroup
      entries={entries}
      activeIndex={-1} isReadOnly={false} onToggle={() => {}}
      onEditAll={() => {}} onRestoreAll={() => {}} onMarkFailed={() => {}}
      renderTimer={() => null} t={t} lift="Deadlift"
    />
  );

  expect(midWorkout.getByText('Set skipped. Continue with the next set.')).toBeTruthy();
  midWorkout.unmount();

  const lastOfWorkout = render(
    <BackoffGroup
      entries={entries}
      activeIndex={-1} isReadOnly={false} onToggle={() => {}}
      onEditAll={() => {}} onRestoreAll={() => {}} onMarkFailed={() => {}}
      renderTimer={() => null} t={t} lift="Deadlift"
      isLastGroupOfWorkout
    />
  );

  expect(lastOfWorkout.queryByText('Set skipped. Continue with the next set.')).toBeNull();
  expect(lastOfWorkout.getByText('Set skipped.')).toBeTruthy();
});

test('hides temporary skipped-set feedback after workout completion', () => {
  const view = render(
    <BackoffGroup
      entries={[{ index: 0, set: { reps: 4, weight: 100, done: true, failed: true, skipped: true } }]}
      activeIndex={-1} isReadOnly onToggle={() => {}}
      onEditAll={() => {}} onRestoreAll={() => {}} onMarkFailed={() => {}}
      renderTimer={() => null} t={t} lift="Deadlift"
      workoutCompleted
    />
  );

  expect(view.getByTestId('workout-set-group-item-0')).toBeTruthy();
  expect(view.queryByText('Set skipped.')).toBeNull();
  expect(view.queryByText('Set skipped. Continue with the next set.')).toBeNull();
});
