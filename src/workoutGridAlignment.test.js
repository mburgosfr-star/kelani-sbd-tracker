import { render } from '@testing-library/react';
import { BackoffGroup, SetRow, WarmupGrid } from './App';

const t = {
  set: 'Set',
  edit: 'Edit',
  restoreOriginalWeight: 'Restore original weight',
  markSetFailed: 'Mark set failed',
  perSideSuffix: '/ side',
  perArm: '/ arm',
};

test('places workout descriptions above circles in one shared three-column grid', () => {
  const warmupView = render(
    <WarmupGrid
      warmups={[
        { reps: 5, weight: 20, done: false },
        { reps: 5, weight: 70, done: false },
        { reps: 3, weight: 120, done: false },
      ]}
      isReadOnly={false}
      activeIndex={-1}
      onToggle={() => {}}
      renderTimer={() => null}
      t={t}
      lift="Deadlift"
    />
  );

  const warmupRow = warmupView.getByTestId('warmup-row-0');
  const warmupGrid = warmupRow.parentElement;
  const sharedGridTemplate = 'repeat(3, minmax(0, 1fr))';

  expect(warmupGrid.style.gridTemplateColumns).toBe(sharedGridTemplate);
  expect(warmupGrid.style.gap).toBe('8px');
  expect(window.getComputedStyle(warmupGrid).paddingLeft).toBe('12px');
  expect(warmupRow).toHaveAttribute('data-workout-circle-item', 'true');
  expect(warmupRow.firstElementChild).toHaveTextContent('5 × 20 kg');
  expect(warmupRow.lastElementChild.tagName).toBe('BUTTON');
  expect(warmupView.queryByText(/WU 1/i)).not.toBeInTheDocument();

  warmupView.unmount();

  const setView = render(
    <SetRow
      set={{ reps: 2, weight: 140, pct: 0.775, done: false }}
      index={0}
      label="Top double"
      onToggle={() => {}}
      onWeightChange={() => {}}
      onMarkFailed={() => {}}
      onRestoreWeight={() => {}}
      isActive={false}
      isReadOnly={false}
      t={t}
      lift="Deadlift"
    />
  );

  const setRow = setView.getByTestId('workout-set-row');
  const setRowGrid = setView.getByTestId('workout-set-row-grid');
  const setCircleItem = setView.getByTestId('workout-set-circle-item');

  expect(setRowGrid.style.gridTemplateColumns).toBe(sharedGridTemplate);
  expect(setRowGrid.style.gap).toBe('8px');
  expect(window.getComputedStyle(setRow).paddingLeft).toBe('12px');
  expect(setCircleItem.firstElementChild).toHaveTextContent('1 × 2 × 140 kg (77.5%)');
  expect(setCircleItem.lastElementChild.tagName).toBe('BUTTON');

  setView.unmount();

  const groupView = render(
    <BackoffGroup
      entries={[
        { index: 1, set: { reps: 3, weight: 125, pct: 0.7, done: false } },
        { index: 2, set: { reps: 3, weight: 125, pct: 0.7, done: false } },
      ]}
      activeIndex={-1}
      isReadOnly={false}
      onToggle={() => {}}
      onEditAll={() => {}}
      onRestoreAll={() => {}}
      onMarkFailed={() => {}}
      renderTimer={() => null}
      t={t}
      lift="Deadlift"
    />
  );

  const groupGrid = groupView.getByTestId('workout-set-group-grid');

  expect(groupGrid.style.gridTemplateColumns).toBe(sharedGridTemplate);
  expect(groupGrid.style.gap).toBe('8px');
  expect(groupGrid.style.marginTop).toBe('6px');
  expect(window.getComputedStyle(groupView.container.firstElementChild).paddingLeft).toBe('12px');
});
