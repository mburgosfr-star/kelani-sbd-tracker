import { render } from '@testing-library/react';
import { BackoffGroup, SetRow, WarmupGrid, WorkoutLiftGrid } from './App';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: jest.fn(), writable: true,
  });
});

const t = {
  edit: 'Edit', restoreOriginalWeight: 'Restore', markSetFailed: 'Fail',
  set: 'Set', perSideSuffix: '/ side', setEffortHard: 'Hard',
};

test('flows weight labels and rep circles through one compact lift grid', () => {
  const referenceSets = [
    { labelKey: 'topDouble', reps: 2, weight: 145, pct: 0.8 },
    { labelKey: 'backoff', reps: 4, weight: 125, pct: 0.7 },
  ];
  const view = render(
    <WorkoutLiftGrid testId="compact-lift-grid">
      <WarmupGrid compactGrid
        warmups={[
          { reps: 5, weight: 20, done: false },
          { reps: 5, weight: 70, done: false },
          { reps: 3, weight: 120, done: false },
        ]}
        referenceSets={referenceSets} isReadOnly={false} activeIndex={-1}
        onToggle={() => {}} renderTimer={() => null} t={t} lift="Deadlift"
      />
      <SetRow compactGrid
        set={{ labelKey: 'topDouble', reps: 2, weight: 145, pct: 0.8,
          effort: 'hard', done: true, skipped: false }}
        index={0} label="Top double" onToggle={() => {}}
        onWeightChange={() => {}} onMarkFailed={() => {}}
        onRestoreWeight={() => {}} isActive={false} isReadOnly={false}
        t={t} lift="Deadlift"
      />
      <BackoffGroup compactGrid
        entries={[
          { index: 1, set: { reps: 4, weight: 125, pct: 0.7, done: false, skipped: false } },
          { index: 2, set: { reps: 4, weight: 125, pct: 0.7, done: false, skipped: false } },
        ]}
        activeIndex={-1} isReadOnly={false} onToggle={() => {}}
        onEditAll={() => {}} onRestoreAll={() => {}} onMarkFailed={() => {}}
        renderTimer={() => null} t={t} lift="Deadlift"
      />
    </WorkoutLiftGrid>
  );

  const liftGrid = view.getByTestId('compact-lift-grid');
  const items = liftGrid.querySelectorAll('[data-workout-circle-item="true"]');
  expect(liftGrid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
  expect(items).toHaveLength(6);
  const labels = Array.from(items).map(item => item.firstElementChild.textContent);
  expect(labels).toEqual([
    '20 kg10%', '70 kg40%', '120 kg65%',
    '145 kg80%', '125 kg70%', '125 kg70%',
  ]);
  expect(view.getAllByTestId('workout-circle-reps').map(node => node.textContent))
    .toEqual(['5', '5', '3', '2', '4', '4']);
  expect(items[3].querySelector('[data-testid="workout-circle-status"]'))
    .toHaveTextContent('✓');
  expect(items[3].lastElementChild).toBe(view.getByTestId('workout-set-effort-label'));
});
