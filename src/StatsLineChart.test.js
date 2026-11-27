import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import StatsLineChart, { prepareStatsLineChart } from './StatsLineChart';

test('stats chart keeps ten evenly distributed points including both endpoints', () => {
  const data = Array.from({ length: 28 }, (_, index) => ({
    label: `C1W${index + 1}`,
    oneRM: 100 + index,
  }));

  const prepared = prepareStatsLineChart(data, ['oneRM']);

  expect(prepared.visibleData).toHaveLength(10);
  expect(prepared.visibleData[0].label).toBe('C1W1');
  expect(prepared.visibleData.at(-1).label).toBe('C1W28');
  expect(prepared.xTicks).toHaveLength(4);
  expect(prepared.yDomain[0]).toBeLessThan(100);
  expect(prepared.yDomain[1]).toBeGreaterThan(127);
});

test('stats chart exposes values through keyboard and touch friendly points', () => {
  const { container } = render(
    <StatsLineChart
      data={[
        { label: 'C1W1', oneRM: 100, e1rm: 105 },
        { label: 'C1W2', oneRM: 102.5, e1rm: 107.5 },
      ]}
      dataKeys={['oneRM', 'e1rm']}
      colors={['#aaaaaa', '#ff7a22']}
      getMetricLabel={key => key === 'oneRM' ? '1RM (kg)' : 'e1RM (kg)'}
      formatValue={value => String(value)}
    />
  );

  expect(screen.getByTestId('stats-line-chart')).toBeInTheDocument();
  expect(screen.getByTestId('stats-line-chart')).toHaveAttribute('viewBox', '0 0 360 132');
  expect(container.querySelector('svg text')).toHaveAttribute('font-size', '13');
  const secondOneRMPoint = screen.getByRole('button', {
    name: 'C1W2: 1RM (kg) 102.5',
  });
  fireEvent.focus(secondOneRMPoint);

  const tooltip = screen.getByRole('status');
  expect(tooltip).toHaveTextContent('C1W2');
  expect(tooltip).toHaveTextContent('1RM (kg): 102.5');
  expect(tooltip).toHaveTextContent('e1RM (kg): 107.5');
  expect(tooltip).toHaveStyle({ fontSize: '12px' });
});

function chart(data, dataKeys = ['oneRM', 'e1rm']) {
  return <StatsLineChart
    data={data} dataKeys={dataKeys} colors={['#fff', '#ff8a3d']}
    getMetricLabel={key => key} formatValue={String}
  />;
}

test('the 1RM band follows both solid lines and tapers where the values meet', () => {
  render(chart([
    { oneRM: 100, e1rm: 100 }, { oneRM: 100, e1rm: 110 }, { oneRM: 110, e1rm: 110 },
  ]));
  const plot = screen.getByTestId('stats-line-chart');
  const [band, recorded, estimated] = plot.querySelectorAll('path');
  expect(band).toHaveAttribute('fill', '#ff8a3d');
  expect(band).toHaveAttribute('pointer-events', 'none');
  for (const line of [recorded, estimated]) {
    expect(line).toHaveAttribute('fill', 'none');
    expect(line).not.toHaveAttribute('stroke-dasharray');
    expect(line.parentElement.querySelector('circle')).toHaveAttribute('r', '2');
  }
  const [r1, r2, r3] = recorded.getAttribute('d').slice(2).split(' L ');
  const [e1, e2, e3] = estimated.getAttribute('d').slice(2).split(' L ');
  expect(band).toHaveAttribute('d', `M ${r1} L ${r2} L ${e2} L ${e1} Z M ${r2} L ${r3} L ${e3} L ${e2} Z`);
});

test.each([
  ['equal values', [{ oneRM: 100, e1rm: 100 }, { oneRM: 110, e1rm: 110 }]],
  ['a single workout', [{ oneRM: 100, e1rm: 105 }]],
  ['a missing estimate between workouts', [{ oneRM: 100, e1rm: 105 }, { oneRM: 100, e1rm: null }, { oneRM: 105, e1rm: 110 }]],
  ['a single series', [{ oneRM: 100, e1rm: 105 }, { oneRM: 105, e1rm: 110 }], ['oneRM']],
  ['strength ratios', [{ strength: 3, eStrength: 3.1 }, { strength: 3, eStrength: 3.2 }], ['strength', 'eStrength']],
])('no 1RM band is drawn for %s', (_, data, keys) => {
  render(chart(data, keys));
  expect(screen.getByTestId('stats-line-chart').querySelector('path:not([fill="none"])')).toBeNull();
});
