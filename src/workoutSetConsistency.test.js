import { render } from '@testing-library/react';
import { BackoffGroup, SetRow } from './App';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: jest.fn(),
    writable: true,
  });
});

const t = {
  edit: 'Edit', restoreOriginalWeight: 'Restore', markSetFailed: 'Fail',
  set: 'Set', perSideSuffix: '/ side', setEffortHard: 'Hard',
};

test('keeps reps visible inside a completed set circle', () => {
  const view = render(
    <SetRow
      set={{ labelKey: 'topDouble', reps: 2, weight: 140, pct: 0.775,
        effort: 'hard', done: true, skipped: false }}
      index={0} label="Top double" onToggle={() => {}}
      onWeightChange={() => {}} onMarkFailed={() => {}}
      onRestoreWeight={() => {}} isActive={false} isReadOnly={false}
      t={t} lift="Deadlift"
    />
  );

  const item = view.getByTestId('workout-set-circle-item');
  expect(item.firstElementChild).toHaveTextContent('140 kg77.5%');
  expect(view.getByTestId('workout-circle-reps')).toHaveTextContent('2');
  expect(view.getByTestId('workout-circle-status')).toHaveTextContent('✓');
  expect(view.getByTestId('workout-set-effort-label')).toHaveTextContent('Hard');
  expect(view.queryByText('2 × 140 kg (77.5%)')).toBeNull();
});

test('gives every grouped set its own weight label and reps value', () => {
  const view = render(
    <BackoffGroup
      entries={[
        { index: 1, set: { reps: 3, weight: 125, pct: 0.7, done: false, skipped: false } },
        { index: 2, set: { reps: 3, weight: 125, pct: 0.7, done: true, skipped: false } },
      ]}
      activeIndex={1} isReadOnly={false} onToggle={() => {}}
      onEditAll={() => {}} onRestoreAll={() => {}} onMarkFailed={() => {}}
      renderTimer={() => null} t={t} lift="Deadlift"
    />
  );

  const groupedItems = view.getAllByTestId(/workout-set-group-item-/);
  expect(groupedItems).toHaveLength(2);

  groupedItems.forEach(item => {
    expect(item.firstElementChild).toHaveTextContent('125 kg70%');
  });
  const reps = view.getAllByTestId('workout-circle-reps');
  expect(reps.map(node => node.textContent)).toEqual(['3', '3']);
  expect(view.queryByText('3 × 125 kg (70%)')).toBeNull();
  expect(view.getByTestId('workout-set-group-action-grid').style.gap).toBe('8px');
  expect(view.getByTestId('workout-circle-status')).toHaveTextContent('✓');
});
