import { render } from '@testing-library/react';
import { AccessoryGroup } from './App';

const t = {
  edit: 'Edit',
  restoreOriginalWeight: 'Restore',
  markSetFailed: 'Fail',
  perSideSuffix: '/ side',
};

test('centers accessory actions under the same set-grid columns', () => {
  const view = render(
    <AccessoryGroup
      acc={{
        name: 'Hip thrust',
        reps: 8,
        weights: [40, 40, 40],
        originalWeights: [40, 40, 40],
        done: [false, false, false],
        failed: [false, false, false],
        skipped: [false, false, false],
      }}
      accIndex={0}
      isActiveGroup
      isReadOnly={false}
      hasMoreAccessoryWork
      onToggle={() => {}}
      onEditAll={() => {}}
      onRestoreAll={() => {}}
      onMarkFailed={() => {}}
      renderTimer={() => null}
      t={t}
    />
  );

  const setGrid = view.getByTestId('workout-accessory-group-grid');
  const actionGrid = view.getByTestId('workout-accessory-action-grid');

  expect(actionGrid.style.gridTemplateColumns)
    .toBe(setGrid.style.gridTemplateColumns);
  expect(actionGrid.style.gap).toBe(setGrid.style.gap);
  expect(actionGrid.style.justifyItems).toBe('center');
});
