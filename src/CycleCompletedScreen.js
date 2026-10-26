import React, { useMemo } from 'react';
import { buildCycleReview } from './cycleReview';
import { formatWeightFromKg, formatEstimatedWeightFromKg } from './workoutUnits';

export default function CycleCompletedScreen({ history, currentCycle, t, weightUnit, theme, header,
  containerStyle, contentStyle, buttonStyle, onFeedback }) {
  const review = useMemo(() => buildCycleReview(history, currentCycle), [history, currentCycle]);
  const label = lift => ({ Squat: t.squat, Bench: t.bench, Deadlift: t.deadlift })[lift];
  const color = lift => ({ Squat: theme.red, Bench: theme.primary, Deadlift: theme.yellow })[lift];
  const weight = value => value == null ? t.cycleReviewUnavailable : formatWeightFromKg(value, weightUnit);
  const gain = value => value == null ? t.cycleReviewUnavailable : `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatEstimatedWeightFromKg(Math.abs(value), weightUnit)}`;
  const gainColor = value => value > 0 ? theme.green : value < 0 ? theme.red : theme.muted;
  const points = review.points.length <= 7 ? review.points : [review.points[0], ...review.points.slice(-6)];
  const values = points.map(point => point.total);
  const min = Math.min(...values);
  const range = Math.max(Math.max(...values) - min, 10);
  const chartPoints = points.map((point, index) => ({ ...point,
    x: points.length === 1 ? 180 : 48 + index * 264 / (points.length - 1),
    y: 112 - (point.total - min) / range * 70,
  }));
  const panel = { padding: '10px 6px', borderTop: `1px solid ${theme.border}` };
  return (
    <div style={containerStyle} data-testid="cycle-completed-screen">
      <div data-testid="screen-scroll-content" style={{ ...contentStyle, padding: '4px 0 12px' }}>
        {header}
        <div className="kelani-cycle-review" style={{ display: 'grid', alignContent: 'space-evenly', minHeight: '100%', gap: 10 }}>
          <section style={{ display: 'flex', justifyContent: 'space-evenly', gap: 12, textAlign: 'center' }}>
            <div><strong style={{ display: 'block', fontSize: 23, color: theme.primary }}>{review.trainingDays}</strong>{t.cycleReviewTrainingDays}</div>
            <div><strong style={{ display: 'block', fontSize: 23, color: theme.primary }}>{review.restDays}</strong>{t.cycleReviewRestDays}</div>
          </section>
          <section style={panel}>
            <h3 style={{ fontSize: 17, margin: '0 0 8px', textAlign: 'center', color: theme.primary }}>{t.cycleReviewResults}</h3>
            <p style={{ fontSize: 12, color: theme.muted, margin: '0 0 10px', textAlign: 'center' }}>{t.cycleReviewComparison}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) repeat(2, minmax(0, 1.25fr))', gap: '10px 8px', alignItems: 'center' }}>
              <span /><strong style={{ textAlign: 'center' }}>{t.oneRM}</strong><strong style={{ textAlign: 'center' }}>{t.e1RM}</strong>
              {review.lifts.map(item => <React.Fragment key={item.lift}>
                <strong style={{ color: color(item.lift), overflowWrap: 'anywhere' }}>{label(item.lift)}</strong>
                {[['oneRM', 'oneRMGain'], ['e1rm', 'e1RMGain']].map(([key, gainKey]) => <div key={key} style={{ textAlign: 'center' }}>
                  <strong>{key === 'e1rm' && item[key] != null ? formatEstimatedWeightFromKg(item[key], weightUnit) : weight(item[key])}</strong>
                  <div style={{ fontSize: 12, color: gainColor(item[gainKey]) }}>{gain(item[gainKey])}</div>
                </div>)}
              </React.Fragment>)}
            </div>
            {review.meetTotal !== null && <p style={{ margin: '12px 0 0', textAlign: 'center' }}>{t.cycleReviewMeetTotal}: <strong>{weight(review.meetTotal)}</strong></p>}
          </section>
          <section style={panel}>
            <h3 style={{ fontSize: 17, margin: '0 0 6px', textAlign: 'center', color: theme.primary }}>{t.cycleReviewSinceStart}</h3>
            <div style={{ display: 'flex', justifyContent: 'space-around', gap: 8, flexWrap: 'wrap', textAlign: 'center', fontSize: 13 }}>
              {review.lifts.map(item => <div key={item.lift}><strong style={{ display: 'block', color: color(item.lift) }}>{label(item.lift)}</strong><span style={{ color: gainColor(item.sinceStartGain) }}>{gain(item.sinceStartGain)}</span></div>)}
            </div>
            {review.total !== null && <p style={{ textAlign: 'center', margin: '10px 0 0' }}><strong>{weight(review.total)}</strong> <span style={{ color: gainColor(review.totalGain) }}>({gain(review.totalGain)})</span></p>}
            {chartPoints.length > 0 && <svg viewBox="0 0 360 150" role="img" aria-label={t.cycleReviewChartLabel} style={{ width: '100%', display: 'block', maxHeight: 150 }}>
              {chartPoints.length > 1 && <polyline points={chartPoints.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={theme.primary} strokeWidth="3" />}
              {chartPoints.map((point, index) => <g key={point.cycle}>
                <circle cx={point.x} cy={point.y} r="4" fill={theme.primary} />
                {(index === 0 || index === chartPoints.length - 1) && <text x={point.x} y={point.y - 12} textAnchor="middle" fill={theme.text} fontSize="11">{weight(point.total)}</text>}
                <text x={point.x} y="137" textAnchor="middle" fill={theme.muted} fontSize="12">{point.cycle === 0 ? t.cycleReviewBaseline : point.cycle}</text>
              </g>)}
            </svg>}
            <p style={{ fontSize: 12, color: theme.muted, margin: '0 0 4px', textAlign: 'center' }}>{t.cycleReviewChartExplanation}</p>
          </section>
          <section style={{ textAlign: 'center', display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={onFeedback} style={buttonStyle('secondary', '0')}>{t.shareCycleExperience}</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
