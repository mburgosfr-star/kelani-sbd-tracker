import { render, screen } from '@testing-library/react';
import { AccessoryGroup, BackoffGroup, SetRow } from './App';

const t = {
  edit: 'Edit',
  restoreOriginalWeight: 'Restore',
  markSetFailed: 'Fail',
  set: 'Set',
};

const noop = () => {};

function WorkoutSections({ activeSection, warmup = false }) {
  return (
    <>
      <SetRow
        set={{ reps: 5, weight: 100, pct: 75, done: false, skipped: false }}
        index={0}
        label="Main set"
        isWarmup={warmup}
        isActive={activeSection === 'set'}
        isReadOnly={false}
        onToggle={noop}
        onWeightChange={noop}
        onMarkFailed={noop}
        onRestoreWeight={noop}
        t={t}
        lift="Squat"
      />

      <BackoffGroup
        entries={[
          { index: 1, set: { reps: 5, weight: 90, pct: 70, done: false, skipped: false } },
          { index: 2, set: { reps: 5, weight: 90, pct: 70, done: false, skipped: false } },
        ]}
        activeIndex={activeSection === 'group' ? 1 : -1}
        isReadOnly={false}
        onToggle={noop}
        onEditAll={noop}
        onRestoreAll={noop}
        onMarkFailed={noop}
        renderTimer={() => null}
        t={t}
        lift="Squat"
      />

      <AccessoryGroup
        acc={{ name: 'Row', reps: 10, weights: [20, 20], done: [false, false] }}
        accIndex={0}
        isActiveGroup={activeSection === 'accessory'}
        isReadOnly={false}
        hasMoreAccessoryWork={true}
        onToggle={noop}
        onEditAll={noop}
        onRestoreAll={noop}
        onMarkFailed={noop}
        renderTimer={() => null}
        t={t}
      />
    </>
  );
}

function expectActionCount(count) {
  expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(count);
  expect(screen.queryAllByRole('button', { name: 'Restore' })).toHaveLength(count);
  expect(screen.queryAllByRole('button', { name: 'Fail' })).toHaveLength(count);
}

test('shows one action row only for the current eligible set or set group', () => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();

  const { rerender } = render(<WorkoutSections activeSection="set" />);
  expectActionCount(1);

  rerender(<WorkoutSections activeSection="group" />);
  expectActionCount(1);

  rerender(<WorkoutSections activeSection="accessory" />);
  expectActionCount(1);

  rerender(<WorkoutSections activeSection="set" warmup />);
  expectActionCount(0);

  rerender(<WorkoutSections activeSection={null} />);
  expectActionCount(0);
});
