import fs from 'fs';
import path from 'path';
import React from 'react';
import { render } from '@testing-library/react';
import { AccessoryGroup, BackoffGroup } from './App';

const appSource = fs.readFileSync(path.join(__dirname, 'App.js'), 'utf8');

function sourceBlock(startMarker, endMarker) {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return appSource.slice(start, end);
}

test('grouped sets and accessories always render the rest timer before actions', () => {
  const grouped = sourceBlock(
    'export function BackoffGroup',
    'export function AccessoryGroup'
  );
  const accessory = sourceBlock(
    'export function AccessoryGroup',
    'function getExerciseGuide'
  );

  expect(grouped.lastIndexOf('timerNode')).toBeLessThan(
    grouped.lastIndexOf('{actions}')
  );
  expect(accessory.lastIndexOf('{timerNode}')).toBeLessThan(
    accessory.lastIndexOf('{actions}')
  );
});

test('a loose-set timer remains after its completed set and before the next set actions', () => {
  expect(appSource).not.toContain(
    "{set.failed && renderInlineTimer({ type: 'main', index: i })}"
  );

  const looseSetBlock = sourceBlock(
    '<SetRow\n                set={set}',
    '</React.Fragment>\n          );'
  );

  expect(looseSetBlock.indexOf('<SetRow')).toBeLessThan(
    looseSetBlock.indexOf("renderInlineTimer({ type: 'main', index: i })")
  );
});

test('rendered grouped-set and accessory timers precede their visible action grids', () => {
  const t = {
    edit: 'Edit',
    restoreOriginalWeight: 'Restore',
    markSetFailed: 'Fail',
    set: 'Set',
  };
  const timer = <div data-testid="rest-timer">Rest</div>;
  const grouped = render(
    <BackoffGroup
      entries={[
        { index: 0, set: { reps: 5, weight: 60, pct: 0.6, done: true } },
        { index: 1, set: { reps: 5, weight: 60, pct: 0.6, done: false } },
      ]}
      activeIndex={1}
      isReadOnly={false}
      onToggle={() => {}}
      onEditAll={() => {}}
      onRestoreAll={() => {}}
      onMarkFailed={() => {}}
      renderTimer={index => index === 0 ? timer : null}
      t={t}
      lift="Squat"
    />
  );
  const groupedTimer = grouped.getByTestId('rest-timer');
  const groupedActions = grouped.getByTestId('workout-set-group-action-grid');
  expect(groupedTimer.compareDocumentPosition(groupedActions) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy();
  grouped.unmount();

  const accessory = render(
    <AccessoryGroup
      acc={{
        name: 'Row', reps: 10,
        weights: [25, 25, 25, 25],
        originalWeights: [25, 25, 25, 25],
        done: [true, false, false, false],
      }}
      accIndex={0}
      isActiveGroup
      isReadOnly={false}
      onToggle={() => {}}
      onEditAll={() => {}}
      onRestoreAll={() => {}}
      onMarkFailed={() => {}}
      renderTimer={index => index === 0 ? timer : null}
      t={t}
    />
  );
  const accessoryTimer = accessory.getByTestId('rest-timer');
  const accessoryActions = accessory.getByTestId('workout-accessory-action-grid');
  expect(accessoryTimer.compareDocumentPosition(accessoryActions) & Node.DOCUMENT_POSITION_FOLLOWING)
    .toBeTruthy();
});
