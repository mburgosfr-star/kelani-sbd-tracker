import fs from 'fs';
import path from 'path';
import { fireEvent, render, screen } from '@testing-library/react';
import { AccessoryGroup, SetRow, WarmupGrid } from './App';

const appSource = fs.readFileSync(
  path.join(__dirname, 'App.js'),
  'utf8'
);

const t = {
  bodyweight: 'Body weight',
  edit: 'Edit',
  markSetFailed: 'Fail',
  perSideSuffix: '/ side',
  plateCalculatorTitle: 'Plate calculator',
  restoreOriginalWeight: 'Restore',
  set: 'Set',
};

const noop = () => {};

function componentBlock(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return appSource.slice(start, end);
}

test('the complete weight label opens the plate calculator without taking extra grid width', () => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  const onShowPlateCalculator = jest.fn();

  render(
    <SetRow
      set={{ reps: 3, weight: 225, pct: 0.9, done: false, skipped: false }}
      index={0}
      label="Main set"
      isActive
      isReadOnly={false}
      onToggle={noop}
      onWeightChange={noop}
      onMarkFailed={noop}
      onRestoreWeight={noop}
      onShowPlateCalculator={onShowPlateCalculator}
      t={t}
      weightUnit="lb"
      lift="Squat"
    />
  );

  const weightTrigger = screen.getByTestId('workout-weight-calculator-trigger');
  expect(weightTrigger).toHaveTextContent('495 lb90%');
  expect(weightTrigger.style.width).toBe('100%');
  expect(weightTrigger.style.borderStyle).toBe('none');
  expect(screen.getByTestId('workout-weight-plate-icon')).toBeInTheDocument();

  fireEvent.click(weightTrigger);
  expect(onShowPlateCalculator).toHaveBeenLastCalledWith(225);
  expect(onShowPlateCalculator).toHaveBeenCalledTimes(1);
});

test('each clickable weight keeps its small plate icon beside the percentage', () => {
  const onShowPlateCalculator = jest.fn();
  const warmups = [
    { reps: 5, weight: 20, done: true },
    { reps: 3, weight: 60, done: false },
  ];
  const referenceSets = [{ reps: 3, weight: 100, pct: 0.9 }];

  const view = render(
    <WarmupGrid
      warmups={warmups}
      referenceSets={referenceSets}
      isReadOnly={false}
      activeIndex={1}
      onToggle={noop}
      renderTimer={() => null}
      onShowPlateCalculator={onShowPlateCalculator}
      t={t}
      lift="Bench"
    />
  );

  expect(screen.getAllByTestId('workout-weight-calculator-trigger')).toHaveLength(2);
  expect(screen.getAllByTestId('workout-weight-plate-icon')).toHaveLength(2);
  expect(screen.queryByTestId('active-set-plate-calculator')).not.toBeInTheDocument();

  view.rerender(
    <WarmupGrid
      warmups={warmups}
      referenceSets={referenceSets}
      isReadOnly={false}
      activeIndex={-1}
      onToggle={noop}
      renderTimer={() => null}
      onShowPlateCalculator={onShowPlateCalculator}
      t={t}
      lift="Bench"
    />
  );

  expect(screen.getAllByTestId('workout-weight-calculator-trigger')).toHaveLength(2);
  expect(screen.getAllByTestId('workout-weight-plate-icon')).toHaveLength(2);
});

test('accessory weights use the same trigger and still exclude bodyweight and per-side work', () => {
  const onShowPlateCalculator = jest.fn();
  const commonProps = {
    accIndex: 0,
    isActiveGroup: true,
    isReadOnly: false,
    hasMoreAccessoryWork: false,
    onToggle: noop,
    onEditAll: noop,
    onRestoreAll: noop,
    onMarkFailed: noop,
    renderTimer: () => null,
    onShowPlateCalculator,
    t,
  };

  const view = render(
    <AccessoryGroup
      {...commonProps}
      acc={{ name: 'Row', reps: 10, weights: [40], done: [false] }}
    />
  );

  expect(screen.getByTestId('workout-weight-calculator-trigger')).toBeInTheDocument();
  expect(screen.getByTestId('workout-weight-plate-icon')).toBeInTheDocument();

  view.rerender(
    <AccessoryGroup
      {...commonProps}
      acc={{ name: 'Row', reps: 10, weights: [40], done: [false], perSide: true }}
    />
  );

  expect(screen.queryByTestId('workout-weight-calculator-trigger')).not.toBeInTheDocument();
  expect(screen.queryByTestId('workout-weight-plate-icon')).not.toBeInTheDocument();

  view.rerender(
    <AccessoryGroup
      {...commonProps}
      acc={{ name: 'Push-up', reps: 10, weights: [0], done: [false], bodyweight: true }}
    />
  );

  expect(screen.queryByTestId('workout-weight-calculator-trigger')).not.toBeInTheDocument();
  expect(screen.queryByTestId('workout-weight-plate-icon')).not.toBeInTheDocument();
});

test('all workout weight paths use the shared full-label trigger and inline icon', () => {
  const triggerBlock = componentBlock(
    'function WorkoutWeightCalculatorTrigger',
    'function formatWarmupPercentDisplay'
  );
  const circleBlock = componentBlock('function WorkoutCircle', 'function WorkoutWeightPercentLabel');
  const labelBlock = componentBlock(
    'function WorkoutWeightPercentLabel',
    'function WorkoutWeightCalculatorTrigger'
  );
  const componentRanges = [
    ['export function WarmupGrid', 'function CooldownBlock'],
    ['export function SetRow', 'export function BackoffGroup'],
    ['export function BackoffGroup', 'export function AccessoryGroup'],
    ['export function AccessoryGroup', 'function getExerciseGuide'],
  ];

  expect(triggerBlock).toContain("width: '100%'");
  expect(triggerBlock).toContain("border: 'none'");
  expect(triggerBlock).not.toContain('PlateIcon');
  expect(circleBlock).not.toContain('active-set-plate-calculator');
  expect(labelBlock).toContain('showPlateCalculatorIcon');
  expect(labelBlock).toContain('workout-weight-plate-icon');

  componentRanges.forEach(([start, end], index) => {
    const block = componentBlock(start, end);
    expect(block).toContain('<WorkoutWeightCalculatorTrigger');
    if (index < 3) {
      expect(block).toContain('showPlateCalculatorIcon={');
    } else {
      expect(block).toContain('workout-weight-plate-icon');
    }
  });

  const warmupCalls = (
    appSource.match(
      /<WarmupGrid[\s\S]*?onShowPlateCalculator=\{onShowPlateCalculator\}[\s\S]*?\/>/g
    ) || []
  ).length;
  const accessoryCalls = (
    appSource.match(
      /<AccessoryGroup[\s\S]*?onShowPlateCalculator=\{onShowPlateCalculator\}[\s\S]*?\/>/g
    ) || []
  ).length;

  expect(warmupCalls).toBe(2);
  expect(accessoryCalls).toBe(2);
});
