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
