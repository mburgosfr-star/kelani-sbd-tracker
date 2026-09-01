import React, { useMemo, useState } from 'react';

const CHART_WIDTH = 360;
const CHART_HEIGHT = 132;
const CHART_MARGIN = Object.freeze({ top: 7, right: 5, bottom: 28, left: 31 });

function chooseDomainUnit(minimum, maximum) {
  const largest = Math.max(Math.abs(minimum), Math.abs(maximum));

  if (largest >= 1000) return 100;
  if (largest >= 10) return 10;
  if (largest >= 2) return 1;
  return 0.1;
}

function roundedChartValue(value) {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function prepareStatsLineChart(data = [], dataKeys = [], maximumPoints = 10) {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      visibleData: [],
      xTicks: [],
      yTicks: [],
      yDomain: [0, 1],
    };
  }

  const pointLimit = Math.max(2, Number(maximumPoints) || 10);
  const visibleSourceData = data.length <= pointLimit
    ? data
    : Array.from({ length: pointLimit }, (_, index) => {
        const sourceIndex = Math.round(
          index * (data.length - 1) / (pointLimit - 1)
        );
        return data[sourceIndex];
      });

  const visibleData = visibleSourceData.map((item, index) => ({
    ...item,
    chartIndex: index + 1,
  }));
  const yValues = visibleData
    .flatMap(item => dataKeys.map(key => Number(item[key])))
    .filter(Number.isFinite);

  let yDomain = [0, 1];
  let yTicks = [0, 0.5, 1];

  if (yValues.length > 0) {
    const minimum = Math.min(...yValues);
    const maximum = Math.max(...yValues);
    const unit = chooseDomainUnit(minimum, maximum);
    let lower = Math.floor(minimum / unit) * unit;
    let upper = Math.ceil(maximum / unit) * unit;

    if (lower === upper) {
      lower -= unit;
      upper += unit;
    }
    if (minimum <= lower) lower -= unit;
    if (maximum >= upper) upper += unit;

    lower = roundedChartValue(lower);
    upper = roundedChartValue(upper);
    yDomain = [lower, upper];
    yTicks = [lower, (lower + upper) / 2, upper].map(roundedChartValue);
  }

  const allXTicks = visibleData.map(item => item.chartIndex);
  const xTicks = allXTicks.length <= 4
    ? allXTicks
    : [
        allXTicks[0],
        allXTicks[Math.floor(allXTicks.length * 0.33)],
        allXTicks[Math.floor(allXTicks.length * 0.66)],
        allXTicks.at(-1),
      ].filter((value, index, values) => (
        value !== undefined && values.indexOf(value) === index
      ));

  return { visibleData, xTicks, yTicks, yDomain };
}

function chartCoordinates(point, pointCount, yDomain) {
  const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
  const xRatio = pointCount <= 1
    ? 0.5
    : (Number(point.chartIndex) - 1) / (pointCount - 1);
  const [lower, upper] = yDomain;
  const range = upper - lower || 1;

  return {
    x: CHART_MARGIN.left + (xRatio * plotWidth),
    y: CHART_MARGIN.top + (((upper - Number(point.value)) / range) * plotHeight),
  };
}

function StatsLineChart({
  data,
  dataKeys,
  colors,
  getMetricLabel,
  formatValue,
  minHeight = 108,
}) {
  const [activePoint, setActivePoint] = useState(null);
  const prepared = useMemo(
    () => prepareStatsLineChart(data, dataKeys),
    [data, dataKeys]
  );
  const { visibleData, xTicks, yTicks, yDomain } = prepared;
  const pointCount = visibleData.length;
  const xLabels = Object.fromEntries(
    visibleData.map(point => [point.chartIndex, point.label])
  );
  const xPosition = chartIndex => chartCoordinates(
    { chartIndex, value: yDomain[0] },
    pointCount,
    yDomain
  ).x;
  const yPosition = value => chartCoordinates(
    { chartIndex: 1, value },
    pointCount,
    yDomain
  ).y;

  function selectPoint(point) {
    setActivePoint(point);
  }

  return (
    <div
      data-testid="stats-chart-frame"
      style={{
        height: '100%',
        minHeight,
        minWidth: 0,
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr) auto',
        position: 'relative',
      }}
      onMouseLeave={() => setActivePoint(null)}
    >
      {activePoint && (
        <div
          data-testid="stats-chart-tooltip"
          role="status"
          style={{
            position: 'absolute',
            zIndex: 1,
            top: 0,
            right: 2,
            maxWidth: '72%',
            padding: '5px 7px',
            border: '1px solid #8b5e3c',
            borderRadius: 5,
            background: '#171717',
            color: '#ffffff',
            fontSize: 12,
            lineHeight: 1.3,
            pointerEvents: 'none',
            textAlign: 'right',
          }}
        >
          <strong>{activePoint.label}</strong>
          {dataKeys.map(key => (
            Number.isFinite(Number(activePoint[key])) && (
              <div key={key}>
                {getMetricLabel(key)}: {formatValue(activePoint[key])}
              </div>
            )
          ))}
        </div>
      )}

      <svg
        data-testid="stats-line-chart"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        width="100%"
        height="100%"
        role="group"
        style={{ display: 'block', minHeight: 104, overflow: 'visible' }}
      >
        {yTicks.map(tick => (
          <g key={`y-${tick}`}>
            <line
              x1={CHART_MARGIN.left}
              x2={CHART_WIDTH - CHART_MARGIN.right}
              y1={yPosition(tick)}
              y2={yPosition(tick)}
              stroke="#5f4637"
              strokeWidth="1"
            />
            <text
              x={CHART_MARGIN.left - 5}
              y={yPosition(tick) + 3}
              fill="#ffffff"
              fontSize="13"
              textAnchor="end"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {xTicks.map(tick => (
          <text
            key={`x-${tick}`}
            x={xPosition(tick)}
            y={CHART_HEIGHT - 3}
            fill="#ffffff"
            fontSize="13"
            textAnchor={tick === 1 ? 'start' : tick === pointCount ? 'end' : 'middle'}
          >
            {xLabels[tick] || ''}
          </text>
        ))}

        {dataKeys.map((key, keyIndex) => {
          const color = colors[keyIndex] || '#ff7a22';
          const points = visibleData
            .filter(point => Number.isFinite(Number(point[key])))
            .map(point => ({
              ...point,
              ...chartCoordinates(
                { chartIndex: point.chartIndex, value: point[key] },
                pointCount,
                yDomain
              ),
            }));
          const path = points
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
            .join(' ');

          return (
            <g key={key}>
              {path && (
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {points.map(point => (
                <g key={`${key}-${point.chartIndex}`}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="3"
                    fill={color}
                    stroke={color}
                    strokeWidth="1"
                    aria-hidden="true"
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="10"
                    fill="transparent"
                    stroke="transparent"
                    tabIndex="0"
                    role="button"
                    aria-label={`${point.label}: ${getMetricLabel(key)} ${formatValue(point[key])}`}
                    onFocus={() => selectPoint(point)}
                    onPointerEnter={() => selectPoint(point)}
                    onClick={() => selectPoint(point)}
                  />
                </g>
              ))}
            </g>
          );
        })}
      </svg>

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        columnGap: 14,
        rowGap: 2,
        minHeight: 18,
        color: '#ffffff',
        fontSize: 13,
        lineHeight: 1.2,
      }}>
        {dataKeys.map((key, index) => (
          <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span
              aria-hidden="true"
              style={{
                width: 14,
                height: 3,
                background: colors[index] || '#ff7a22',
              }}
            />
            {getMetricLabel(key)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default React.memo(StatsLineChart);
