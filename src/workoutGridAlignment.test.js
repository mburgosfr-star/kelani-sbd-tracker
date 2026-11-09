import { render } from '@testing-library/react';
import { BackoffGroup, SetRow, WarmupGrid, WorkoutLiftGrid, centeredMeetItemStyle } from './App';

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
  const shared = 'repeat(5, minmax(0, 1fr))';
  expect(warmupItem.parentElement.style.gridTemplateColumns).toBe(shared);
  expect(warmupItem.firstElementChild).toHaveTextContent('20 kg10%');
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
    .toHaveTextContent('140 kg77.5%');
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
    expect(item.firstElementChild).toHaveTextContent('125 kg70%');
    expect(item.querySelector('[data-testid="workout-circle-reps"]')).toHaveTextContent('3');
  });
});

test.each([3, 4])('meet centers %i warmups on one row and three attempts on their own row', count => {
  const view = render(
    <WorkoutLiftGrid columnCount={10} testId="meet-lift-grid">
      <WarmupGrid
        compactGrid
        centeredMeetRow
        warmups={Array.from({ length: count }, (_, index) => ({ reps: 5, weight: 20 + index * 20, done: false }))}
        referenceSets={[{ reps: 1, weight: 87.5, pct: 0.9 }]}
        isReadOnly={false} activeIndex={-1} onToggle={() => {}}
        renderTimer={() => null} t={t} lift="Bench"
      />
      {[87.5, 95, 100].map((weight, index) => (
        <SetRow
          key={weight}
          compactGrid
          set={{ reps: 1, weight, pct: [0.9, 0.975, 1.025][index], done: false }}
          index={index}
          gridPosition={centeredMeetItemStyle(3, index, 2)}
          label={`Attempt ${index + 1}`}
          onToggle={() => {}} onWeightChange={() => {}}
          onMarkFailed={() => {}} onRestoreWeight={() => {}}
          isActive={false} isReadOnly={false} t={t} lift="Bench"
        />
      ))}
    </WorkoutLiftGrid>
  );

  expect(view.getByTestId('meet-lift-grid').style.gridTemplateColumns)
    .toBe('repeat(10, minmax(0, 1fr))');
  expect(view.getByTestId('meet-lift-grid').style.rowGap)
    .toBe('clamp(8px, 2vw, 10px)');
  expect(view.getByTestId('meet-lift-grid').style.marginBottom)
    .toBe('4px');
  expect(view.getByTestId('meet-lift-grid').style.getPropertyValue('--workout-circle-item-row-gap'))
    .toBe('clamp(6px, 0.8dvh, 9px)');
  const expectedStarts = count === 3 ? [3, 5, 7] : [2, 4, 6, 8];
  view.getAllByTestId(/warmup-row-/).forEach((item, index) => {
    expect(item.style.gridColumn).toBe(`${expectedStarts[index]} / span 2`);
    expect(item.style.gridRow).toBe('1');
  });
  view.getAllByTestId('workout-set-circle-item').forEach((item, index) => {
    expect(item.style.gridColumn).toBe(`${[3, 5, 7][index]} / span 2`);
    expect(item.style.gridRow).toBe('2');
  });
});
