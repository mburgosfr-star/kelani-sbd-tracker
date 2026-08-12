import { render } from '@testing-library/react';
import { AccessoryGroup } from './App';

const t = {
  edit: 'Edit',
  restoreOriginalWeight: 'Restore',
  markSetFailed: 'Fail',
  perSideSuffix: '/ side',
};

test('centers three accessory actions independently from the four-column set grid', () => {
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

  expect(setGrid.style.gridTemplateColumns).toBe('repeat(4, minmax(0, 1fr))');
  expect(actionGrid.style.gridTemplateColumns)
    .toBe('repeat(3, clamp(50px, 12vw, 58px))');
  expect(actionGrid.style.columnGap).toBe('0px');
  expect(actionGrid.style.justifyItems).toBe('center');
  expect(actionGrid.style.justifyContent).toBe('space-evenly');
  expect(actionGrid.style.width).toBe('100%');
  expect(actionGrid.style.margin).toBe('8px auto 0px');

  const actionButtons = actionGrid.querySelectorAll('button');
  expect(actionButtons).toHaveLength(3);
  actionButtons.forEach(button => {
    expect(button.style.width).toBe('clamp(50px, 12vw, 58px)');
    expect(button.style.background).not.toBe('transparent');
    expect(button.querySelector('svg')).not.toBeNull();
  });
});
