import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { AccessoryGroup } from './App';

const translations = {
  accessoryHipThrust: 'Hip thrust',
  accessoryShoulderRotations: 'Shoulder rotations',
  perSideSuffix: '/ side',
};

const handlers = {
  onToggle: jest.fn(),
  onEditAll: jest.fn(),
  onRestoreAll: jest.fn(),
  onMarkFailed: jest.fn(),
  renderTimer: jest.fn(() => null),
};

function renderAccessory(acc) {
  return render(
    <AccessoryGroup
      acc={acc}
      accIndex={0}
      isActiveGroup={false}
      isReadOnly
      hasMoreAccessoryWork={false}
      t={translations}
      {...handlers}
    />
  );
}

test('renders accessory weight above every set and reps inside each circle', () => {
  renderAccessory({
    nameKey: 'accessoryHipThrust',
    reps: 8,
    weights: [40, 40, 40],
    originalWeights: [40, 40, 40],
    done: [false, false, false],
    failed: [false, false, false],
    skipped: [false, false, false],
  });

  expect(screen.getByTestId('workout-accessory-label'))
    .toHaveTextContent('Hip thrust');

  const items = screen.getAllByTestId(
    /workout-accessory-set-item-/
  );

  expect(items).toHaveLength(3);

  items.forEach(item => {
    expect(within(item).getByText('40 kg'))
      .toBeInTheDocument();
    expect(within(item).getByText('8'))
      .toBeInTheDocument();
  });

  expect(screen.queryByText(/3 × 8 × 40 kg/))
    .not.toBeInTheDocument();
});

test('keeps the per-side label with each accessory weight', () => {
  renderAccessory({
    nameKey: 'accessoryShoulderRotations',
    reps: 15,
    perSide: true,
    weights: [2.5, 2.5],
    originalWeights: [2.5, 2.5],
    done: [false, false],
    failed: [false, false],
    skipped: [false, false],
  });

  const items = screen.getAllByTestId(
    /workout-accessory-set-item-/
  );

  expect(items).toHaveLength(2);

  items.forEach(item => {
    expect(within(item).getByText('2.5 kg / side'))
      .toBeInTheDocument();
    expect(within(item).getByText('15'))
      .toBeInTheDocument();
  });
});
