import { render } from '@testing-library/react';
import { BackoffGroup, SetRow, WarmupGrid } from './App';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: jest.fn(), writable: true,
  });
});

const t = {
  set: 'Set', edit: 'Edit', restoreOriginalWeight: 'Restore original weight',
  markSetFailed: 'Mark set failed', perSideSuffix: '/ side', perArm: '/ arm',
};

test('aligns weight labels above rep circles in the shared grid', () => {
  const warmupView = render(
    <WarmupGrid
      warmups={[
        { reps: 5, weight: 20, done: false },
        { reps: 5, weight: 70, done: false },
        { reps: 3, weight: 120, done: false },
      ]}
      referenceSets={[{ reps: 2, weight: 140, pct: 0.775 }]}
      isReadOnly={false} activeIndex={-1} onToggle={() => {}}
      renderTimer={() => null} t={t} lift="Deadlift"
    />
  );
  const warmupItem = warmupView.getByTestId('warmup-row-0');
  const shared = 'repeat(3, minmax(0, 1fr))';
  expect(warmupItem.parentElement.style.gridTemplateColumns).toBe(shared);
  expect(warmupItem.firstElementChild).toHaveTextContent('20 kg (10%)');
  expect(warmupItem.querySelector('[data-testid="workout-circle-reps"]')).toHaveTextContent('5');
  warmupView.unmount();

  const setView = render(
    <SetRow
      set={{ reps: 2, weight: 140, pct: 0.775, done: false, skipped: false }}
      index={0} label="Top double" onToggle={() => {}}
      onWeightChange={() => {}} onMarkFailed={() => {}}
      onRestoreWeight={() => {}} isActive={false} isReadOnly={false}
      t={t} lift="Deadlift"
    />
  );
  expect(setView.getByTestId('workout-set-row-grid').style.gridTemplateColumns).toBe(shared);
  expect(setView.getByTestId('workout-set-circle-item').firstElementChild)
    .toHaveTextContent('140 kg (77.5%)');
  setView.unmount();

  const groupView = render(
    <BackoffGroup
      entries={[
        { index: 1, set: { reps: 3, weight: 125, pct: 0.7, done: false, skipped: false } },
        { index: 2, set: { reps: 3, weight: 125, pct: 0.7, done: false, skipped: false } },
      ]}
      activeIndex={-1} isReadOnly={false} onToggle={() => {}}
      onEditAll={() => {}} onRestoreAll={() => {}} onMarkFailed={() => {}}
      renderTimer={() => null} t={t} lift="Deadlift"
    />
  );
  const grid = groupView.getByTestId('workout-set-group-grid');
  expect(grid.style.gridTemplateColumns).toBe(shared);
  expect(grid.style.marginTop).toBe('0px');
  groupView.getAllByTestId(/workout-set-group-item-/).forEach(item => {
    expect(item.firstElementChild).toHaveTextContent('125 kg (70%)');
    expect(item.querySelector('[data-testid="workout-circle-reps"]')).toHaveTextContent('3');
  });
});
