import { render } from '@testing-library/react';
import { BackoffGroup, SetRow } from './App';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: jest.fn(),
    writable: true,
  });
});

const t = {
  edit: 'Edit',
  restoreOriginalWeight: 'Restore',
  markSetFailed: 'Fail',
  set: 'Set',
  perSideSuffix: '/ side',
};

test('keeps a single-set prescription on one line across the shared grid', () => {
  const view = render(
    <SetRow
      set={{
        labelKey: 'topDouble',
        reps: 2,
        weight: 140,
        pct: 0.775,
        done: false,
        skipped: false,
      }}
      index={0}
      label="Top double"
      onToggle={() => {}}
      onWeightChange={() => {}}
      onMarkFailed={() => {}}
      onRestoreWeight={() => {}}
      isActive={true}
      isReadOnly={false}
      t={t}
      lift="Deadlift"
    />
  );

  const circleItem = view.getByTestId('workout-set-circle-item');
  const prescription = view.getByText('1 × 2 × 140 kg (77.5%)');
  const actionGrid = view.getByTestId('workout-set-action-grid');

  expect(circleItem.style.gridColumn).toBe('1 / -1');
  expect(prescription.style.whiteSpace).toBe('nowrap');
  expect(actionGrid.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
  expect(actionGrid.style.gap).toBe('8px');
});

test('aligns grouped workout actions with the same three circle columns', () => {
  const view = render(
    <BackoffGroup
      entries={[
        {
          index: 1,
          set: {
            labelKey: 'backoff',
            reps: 3,
            weight: 125,
            pct: 0.7,
            done: false,
            skipped: false,
          },
        },
        {
          index: 2,
          set: {
            labelKey: 'backoff',
            reps: 3,
            weight: 125,
            pct: 0.7,
            done: false,
            skipped: false,
          },
        },
      ]}
      activeIndex={1}
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

  const circleGrid = view.getByTestId('workout-set-group-grid');
  const actionGrid = view.getByTestId('workout-set-group-action-grid');

  expect(actionGrid.style.gridTemplateColumns).toBe(circleGrid.style.gridTemplateColumns);
  expect(actionGrid.style.gap).toBe(circleGrid.style.gap);
  expect(actionGrid.children).toHaveLength(3);
});
