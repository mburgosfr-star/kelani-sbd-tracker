import React, { useMemo } from 'react';
import StatsLineChart from './StatsLineChart';
import { TRAINING_MODELS } from './smartTrainingConstants';
import {
  WEIGHT_UNITS,
  normalizeWeightUnit,
  kgToDisplayWeight,
  formatWeightValue,
  formatDecimalDisplay,
} from './workoutUnits';
import {
  LIFT_ORDER,
  getHistoryMaxCandidates,
  getEstablishedOneRMFromHistoryEntry,
  getEntryCycle,
  getEntryWorkoutNumber,
  getAbsoluteWorkoutIndex,
  getWorkoutLabel,
  formatCycleWorkoutSubtitle,
} from './workoutHistoryStats';
import { isSmartTrainingModel } from './programProfiles';

const THEME = {
  card: '#101010',
  border: '#3a1f1f',
  text: '#fff4e6',
  muted: '#fff4e6',
  primary: '#ff8a3d',
  red: '#ff5c45',
  yellow: '#ffd166',
  meet: '#c62828',
  brown: '#a67c52',
};

const BOTTOM_NAV_SPACE = 78;
const RESPONSIVE_CONTENT_UI = Object.freeze({
  screenPadding: 'clamp(10px, 1.8dvh, 18px) clamp(14px, 4vw, 20px) 16px',
  headerTitleFontSize: 'clamp(30px, 7vw, 36px)',
  headerSubtitleFontSize: 'clamp(15px, 3.4vw, 17px)',
  bodyFontSize: 'clamp(14px, 3.4vw, 17px)',
});
const RESPONSIVE_STATS_UI = Object.freeze({
  tabGap: 'clamp(5px, 1.5vw, 8px)',
  tabFontSize: 'clamp(13px, 3.2vw, 16px)',
  tabMinHeight: 'clamp(38px, 5dvh, 42px)',
  cardGap: 'clamp(2px, 0.4dvh, 4px)',
  cardPadding: 'clamp(1px, 0.7vw, 3px)',
  chartTitleFontSize: 'clamp(18px, 4.4vw, 21px)',
  chartTitleHeight: 'clamp(24px, 3.2dvh, 28px)',
  chartMinHeight: 120,
});

function responsiveStatsChartGridStyle() {
  return {
    height: '100%',
    minHeight: 0,
    display: 'grid',
    gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
    gap: RESPONSIVE_STATS_UI.cardGap,
  };
}

export function statsScreenStyle() {
  return {
    minHeight: 600,
    width: '100%',
    maxWidth: 500,
    height: `calc(100dvh - ${BOTTOM_NAV_SPACE}px)`,
    margin: '0 auto',
    padding: RESPONSIVE_CONTENT_UI.screenPadding,
    paddingBottom: 32,
    boxSizing: 'border-box',
    color: THEME.text,
    fontFamily: 'sans-serif',
    fontWeight: 900,
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
    display: 'flex',
    flexDirection: 'column',
  };
}

export function statsTabListStyle(tabCount = 4) {
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${Math.max(1, Number(tabCount) || 1)}, minmax(0, 1fr))`,
    gap: RESPONSIVE_STATS_UI.tabGap,
    marginTop: 'clamp(9px, 1.2dvh, 12px)',
    marginBottom: RESPONSIVE_STATS_UI.cardGap,
  };
}

export function capRunningBestChart(data = [], key, maximum) {
  const numericMaximum = Number(maximum);
  if (!Array.isArray(data) || !Number.isFinite(numericMaximum)) return data;
  return data.map(point => {
    const value = Number(point?.[key]);
    return Number.isFinite(value) ? { ...point, [key]: Math.min(value, numericMaximum) } : point;
  });
}

export function getStatsHistoricalOneRM(entry, candidateOneRM = null) {
  const setCandidate = candidateOneRM == null
    ? Number(getHistoryMaxCandidates(entry).oneRM) || 0
    : Number(candidateOneRM) || 0;
  if (entry?.manualMax) return setCandidate;
  return Math.max(setCandidate, getEstablishedOneRMFromHistoryEntry(entry, entry?.lift));
}

export function mergeStatsHistoricalMaxes(previous, entry, candidates) {
  const historicalOneRM = getStatsHistoricalOneRM(entry, candidates.oneRM);
  const oneRM = entry?.manualMax
    ? historicalOneRM
    : Math.max(previous.oneRM, historicalOneRM);
  const estimated = entry?.manualMax
    ? candidates.e1rm
    : Math.max(previous.e1rm, candidates.e1rm);

  // A demonstrated real 1RM is also e1RM evidence.
  return { oneRM, e1rm: Math.max(oneRM, estimated) };
}

export function replaceCurrentChartEndpoint(data = [], updates = {}) {
  if (!Array.isArray(data) || data.length === 0) return data;
  const earlierPoints = data.slice(0, -1);
  const monotonicUpdates = Object.entries(updates).reduce((next, [key, value]) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      next[key] = value;
      return next;
    }
    const previousMaximum = earlierPoints.reduce((maximum, point) => {
      const candidate = Number(point?.[key]);
      return Number.isFinite(candidate) ? Math.max(maximum, candidate) : maximum;
    }, -Infinity);
    next[key] = Number.isFinite(previousMaximum) ? Math.max(previousMaximum, numericValue) : numericValue;
    return next;
  }, {});
  return [...earlierPoints, { ...data[data.length - 1], ...monotonicUpdates }];
}

function StatsHeader({ title, subtitle, titleStyle = {}, subtitleStyle = {} }) {
  return (
    <header style={{ textAlign: 'center' }}>
      <h1 style={{ margin: 0, color: THEME.red, ...titleStyle }}>{title}</h1>
      {subtitle && <div style={{ marginTop: 8, ...subtitleStyle }}>{subtitle}</div>}
    </header>
  );
}

function EmptyLevelBadge() {
  return null;
}

const STATS_LIFT_DATA_KEYS = Object.freeze(['oneRM', 'e1rm']);
const STATS_STRENGTH_DATA_KEYS = Object.freeze(['strength', 'eStrength']);
const STATS_STRENGTH_MAX_DATA_KEYS = Object.freeze(['strengthMax', 'eStrengthMax']);

export default function StatsScreen({ history, bodyWeights, currentCycle, currentIndex, currentWorkoutNumber = currentIndex, totalWorkouts, trainingModel = TRAINING_MODELS.CLASSIC, t, weightUnit = WEIGHT_UNITS.KG, best1RMs = {}, bestE1RMs = {}, athleteLevel, eStrengthRatio, strengthMax, eStrengthMax, latestBodyWeight, activescreen = 'lifts', onChangeTab, HeaderComponent = StatsHeader, LevelBadgeComponent = EmptyLevelBadge }) {
  const setActivescreen = onChangeTab || (() => {});
  const statsWeightUnit = normalizeWeightUnit(weightUnit);
  const COLORS = {
    Squat: THEME.red,
    Bench: THEME.primary,
    Deadlift: THEME.yellow,
  };
  const neutralChartColor = THEME.brown;
  const preparedStats = useMemo(() => {
    const liftData = {};
    const totalData = [];
    const bodyData = [];
    const strengthData = [];
    const bodyMetricData = {
      bodyFat: [],
      bodyWater: [],
      leanMass: [],
      visceralFat: [],
      physiqueRating: [],
    };

    function chartWeightFromKg(weightKg, options = {}) {
      const displayWeight = kgToDisplayWeight(weightKg, statsWeightUnit);
      if (displayWeight === '') return null;

      if (options.estimated) return displayWeight;
      const formatted = formatWeightValue(displayWeight, statsWeightUnit, options);
      const value = Number(formatted);
      return Number.isFinite(value) ? value : null;
    }

    const bestStats = Object.fromEntries(
      LIFT_ORDER.map(lift => [lift, { oneRM: 0, e1rm: 0 }])
    );
    const runningBestPerLift = Object.fromEntries(
      LIFT_ORDER.map(lift => [lift, { oneRM: 0, e1rm: 0 }])
    );
    const currentStatsLabel = currentWorkoutNumber > 0
      ? getWorkoutLabel({ cycle: currentCycle, workoutNumber: currentWorkoutNumber })
      : null;
    const sortedHistory = [...history]
      .filter(entry => entry && entry.lift)
      .sort((a, b) => getAbsoluteWorkoutIndex(a) - getAbsoluteWorkoutIndex(b));

    sortedHistory.forEach(entry => {
      if (!LIFT_ORDER.includes(entry.lift) || entry.completionOnly) return;

      const candidates = getHistoryMaxCandidates(entry);
      const historicalOneRM = getStatsHistoricalOneRM(entry, candidates.oneRM);
      if (historicalOneRM <= 0 && candidates.e1rm <= 0) return;

      runningBestPerLift[entry.lift] = mergeStatsHistoricalMaxes(
        runningBestPerLift[entry.lift],
        entry,
        candidates
      );
      bestStats[entry.lift] = { ...runningBestPerLift[entry.lift] };

      if (!liftData[entry.lift]) liftData[entry.lift] = [];
      const isChartPoint = getEntryWorkoutNumber(entry) > 0 || entry.seedMax || entry.manualMax;

      if (isChartPoint) {
        liftData[entry.lift].push({
          label: getWorkoutLabel(entry),
          absoluteWorkoutIndex: getAbsoluteWorkoutIndex(entry),
          oneRM: chartWeightFromKg(runningBestPerLift[entry.lift].oneRM),
          e1rm: chartWeightFromKg(runningBestPerLift[entry.lift].e1rm, { estimated: true }),
        });
      }

      if (
        isChartPoint &&
        runningBestPerLift.Squat.oneRM &&
        runningBestPerLift.Bench.oneRM &&
        runningBestPerLift.Deadlift.oneRM
      ) {
        totalData.push({
          label: getWorkoutLabel(entry),
          workoutNumber: getEntryWorkoutNumber(entry),
          absoluteWorkoutIndex: getAbsoluteWorkoutIndex(entry),
          date: entry.date,
          oneRM: LIFT_ORDER.reduce(
            (sum, lift) => sum + runningBestPerLift[lift].oneRM,
            0
          ),
          e1rm: LIFT_ORDER.reduce(
            (sum, lift) => sum + runningBestPerLift[lift].e1rm,
            0
          ),
        });
      }
    });

    LIFT_ORDER.forEach(lift => {
      const currentOneRM = Number(best1RMs?.[lift]) || bestStats[lift].oneRM || 0;
      const currentE1RM = Math.max(
        currentOneRM,
        Number(bestE1RMs?.[lift]) || bestStats[lift].e1rm || 0
      );
      const currentE1RMChartValue = chartWeightFromKg(currentE1RM, { estimated: true });

      liftData[lift] = capRunningBestChart(
        liftData[lift],
        'e1rm',
        currentE1RMChartValue
      );
      liftData[lift] = replaceCurrentChartEndpoint(liftData[lift], {
        oneRM: chartWeightFromKg(currentOneRM),
        e1rm: currentE1RMChartValue,
        ...(currentStatsLabel ? { label: currentStatsLabel } : {}),
      });
    });

    if (totalData.length > 0) {
      const currentTotalOneRM = LIFT_ORDER.reduce(
        (sum, lift) => sum + (Number(best1RMs?.[lift]) || 0),
        0
      );
      const currentTotalE1RM = LIFT_ORDER.reduce(
        (sum, lift) => sum + Math.max(
          Number(best1RMs?.[lift]) || 0,
          Number(bestE1RMs?.[lift]) || 0
        ),
        0
      );
      const cappedTotalData = capRunningBestChart(
        totalData,
        'e1rm',
        currentTotalE1RM
      );
      const currentTotalPoint = replaceCurrentChartEndpoint(cappedTotalData, {
        oneRM: currentTotalOneRM,
        e1rm: currentTotalE1RM,
        ...(currentStatsLabel ? { label: currentStatsLabel } : {}),
      }).at(-1);

      totalData.splice(0, totalData.length, ...cappedTotalData);
      totalData[totalData.length - 1] = currentTotalPoint;
    }

    const bodyWeightsByRecordedTime = bodyWeights
      .map((entry, sourceIndex) => {
        const recordedTime = entry?.timestamp
          ? new Date(entry.timestamp).getTime()
          : NaN;

        return { entry, sourceIndex, recordedTime };
      })
      .sort((a, b) => {
        const aHasTime = Number.isFinite(a.recordedTime);
        const bHasTime = Number.isFinite(b.recordedTime);

        if (aHasTime && bHasTime && a.recordedTime !== b.recordedTime) {
          return a.recordedTime - b.recordedTime;
        }
        if (aHasTime !== bHasTime) return aHasTime ? 1 : -1;
        return a.sourceIndex - b.sourceIndex;
      })
      .map(record => record.entry);
    const statsBodyWeights = bodyWeightsByRecordedTime;

    statsBodyWeights.forEach(entry => {
      const workoutNumber = getEntryWorkoutNumber(entry);
      const base = {
        label: getWorkoutLabel(entry),
        cycle: getEntryCycle(entry),
        workoutNumber,
        absoluteWorkoutIndex: getAbsoluteWorkoutIndex(entry),
      };

      if (entry.bodyWeight) {
        bodyData.push({
          ...base,
          gewicht: chartWeightFromKg(entry.bodyWeight, { body: true }),
        });
      }

      ['bodyFat', 'bodyWater', 'leanMass', 'visceralFat', 'physiqueRating']
        .forEach(key => {
          const value = Number(entry[key]);
          if (!Number.isFinite(value) || value <= 0) return;

          bodyMetricData[key].push({
            ...base,
            [key]: key === 'leanMass'
              ? chartWeightFromKg(value, { body: true })
              : value,
          });
        });
    });

    // Both arrays are ordered by absolute workout index, so bodyweight can be
    // paired to every total in one pass. The former implementation rescanned
    // the complete body-data history for every individual total point.
    const sortedBodyWeights = [...statsBodyWeights].sort(
      (a, b) => getAbsoluteWorkoutIndex(a) - getAbsoluteWorkoutIndex(b)
    );
    const firstRecordedBodyWeight = sortedBodyWeights.find(entry => entry.bodyWeight) || null;
    let bodyWeightIndex = 0;
    let activeBodyWeight = null;
    let runningStrengthMax = 0;
    let runningEStrengthMax = 0;

    totalData.forEach(entry => {
      while (
        bodyWeightIndex < sortedBodyWeights.length &&
        getAbsoluteWorkoutIndex(sortedBodyWeights[bodyWeightIndex]) <= entry.absoluteWorkoutIndex
      ) {
        if (sortedBodyWeights[bodyWeightIndex].bodyWeight) {
          activeBodyWeight = sortedBodyWeights[bodyWeightIndex];
        }
        bodyWeightIndex += 1;
      }

      const bodyWeightForWorkout = activeBodyWeight?.bodyWeight || (
        entry.absoluteWorkoutIndex <= 0
          ? firstRecordedBodyWeight?.bodyWeight
          : null
      );
      if (!bodyWeightForWorkout) return;

      const strength = Math.round((entry.oneRM / bodyWeightForWorkout) * 100) / 100;
      const eStrength = Math.round((entry.e1rm / bodyWeightForWorkout) * 100) / 100;
      runningStrengthMax = Math.max(runningStrengthMax, strength);
      runningEStrengthMax = Math.max(runningEStrengthMax, eStrength);
      strengthData.push({
        label: entry.label,
        absoluteWorkoutIndex: entry.absoluteWorkoutIndex,
        strength,
        eStrength,
        strengthMax: runningStrengthMax,
        eStrengthMax: runningEStrengthMax,
      });
    });

    if (strengthData.length > 0) {
      const latest = strengthData.at(-1);
      latest.strengthMax = Math.max(latest.strengthMax, Number(strengthMax) || 0);
      latest.eStrengthMax = Math.max(latest.eStrengthMax, Number(eStrengthMax) || 0);
    }

    return {
      liftData,
      totalChartData: totalData.map(entry => ({
        ...entry,
        oneRM: chartWeightFromKg(entry.oneRM),
        e1rm: chartWeightFromKg(entry.e1rm, { estimated: true }),
      })),
      bodyData,
      bodyMetricData,
      strengthData,
    };
  }, [
    history,
    bodyWeights,
    statsWeightUnit,
    best1RMs?.Squat,
    best1RMs?.Bench,
    best1RMs?.Deadlift,
    bestE1RMs?.Squat,
    bestE1RMs?.Bench,
    bestE1RMs?.Deadlift,
    strengthMax,
    eStrengthMax,
    currentCycle,
    currentIndex,
    currentWorkoutNumber,
  ]);
  const {
    liftData,
    totalChartData,
    bodyData,
    bodyMetricData,
    strengthData,
  } = preparedStats;

  function weightMetricTitle(label) {
    return `${label} (${statsWeightUnit})`;
  }

  function chartMetricLabel(key) {
    if (key === 'oneRM') return weightMetricTitle('1RM');
    if (key === 'e1rm') return weightMetricTitle(t.e1RM);
    if (key === 'gewicht') return weightMetricTitle(t.bodyweight);
    if (key === 'strength') return t.strength;
    if (key === 'eStrength') return t.eStrength;
    if (key === 'strengthMax') return t.strengthMax;
    if (key === 'eStrengthMax') return t.eStrengthMax;
    if (key === 'bodyFat') return `${t.bodyFatPercent} (%)`;
    if (key === 'bodyWater') return `${t.bodyWaterPercent} (%)`;
    if (key === 'leanMass') return weightMetricTitle(t.leanMassKg);
    if (key === 'visceralFat') return `${t.visceralFatRating} rating`;
    if (key === 'physiqueRating') return t.physiqueRating;

    return key;
  }

  function renderChart(data, dataKeys, colors, emptyMessage = t.noStatsData) {
    if (!data || data.length === 0) {
      return (
        <div
          data-testid="stats-chart-frame"
          style={{
            height: '100%',
            minHeight: RESPONSIVE_STATS_UI.chartMinHeight,
            display: 'grid',
            placeItems: 'center',
          }}
        >
        <p style={{ color: THEME.text, textAlign: 'center', padding: 14, margin: 0, fontSize: RESPONSIVE_CONTENT_UI.bodyFontSize }}>
          {emptyMessage}
        </p>
        </div>
      );
    }

    const isStrengthChart = dataKeys.some(key =>
      ['strength', 'eStrength', 'strengthMax', 'eStrengthMax'].includes(key)
    );

    function formatChartValue(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return value;

      return formatDecimalDisplay(numericValue, {
        maximumFractionDigits: isStrengthChart || dataKeys.includes('e1rm') ? 2 : 1,
      });
    }

    return (
      <React.Suspense fallback={null}>
        <StatsLineChart
          data={data}
          dataKeys={dataKeys}
          colors={colors}
          getMetricLabel={chartMetricLabel}
          formatValue={formatChartValue}
          minHeight={RESPONSIVE_STATS_UI.chartMinHeight}
        />
      </React.Suspense>
    );
  }

  const statsTabs = [
    { key: 'lifts', label: t.statsTabLifts },
    { key: 'totaal', label: t.statsTabTotal },
    { key: 'lichaam', label: t.statsTabBody },
    { key: 'scores', label: t.statsTabHealth },
  ];

  function renderChartCard(chart) {
    return (
      <section
        key={chart.key}
        data-testid="stats-chart-card"
        style={{
          background: 'transparent',
          border: 'none',
          borderRadius: 10,
          padding: RESPONSIVE_STATS_UI.cardPadding,
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: `${RESPONSIVE_STATS_UI.chartTitleHeight} minmax(0, 1fr)`,
        }}
      >
        <h3 style={{
          minHeight: RESPONSIVE_STATS_UI.chartTitleHeight,
          margin: 0,
          color: chart.color || neutralChartColor,
          fontSize: RESPONSIVE_STATS_UI.chartTitleFontSize,
          lineHeight: 1.15,
          display: 'flex',
          alignItems: 'flex-end',
        }}>
          {chart.title}
        </h3>
        {renderChart(chart.data, chart.dataKeys || [chart.key], chart.colors || [chart.color], chart.emptyMessage)}
      </section>
    );
  }

  function renderMetricChartCards(charts) {
    const visibleCharts = charts.filter(chart => chart.data.length > 0);

    if (visibleCharts.length === 0) {
      return (
        <p style={{ color: THEME.text, textAlign: 'center', padding: 14 }}>
          {t.noMetricData || t.noStatsData}
        </p>
      );
    }

    return (
      <div style={responsiveStatsChartGridStyle()}>
        {visibleCharts.map(chart => renderChartCard({ ...chart, color: neutralChartColor, colors: [chart.color] }))}
      </div>
    );
  }

  return (
    <div data-testid="stats-screen" style={statsScreenStyle()}>
      <HeaderComponent
        t={t}
        title={t.stats}
        subtitle={(
          <>
            {formatCycleWorkoutSubtitle({
              t,
              currentCycle,
              workoutNumber: Math.min(currentIndex + 1, totalWorkouts),
              totalWorkouts,
              smartModel: isSmartTrainingModel(trainingModel),
            })}
            {isSmartTrainingModel(trainingModel) && (
              <LevelBadgeComponent
                athleteLevel={athleteLevel}
                eStrengthRatio={eStrengthRatio}
                eStrengthMax={eStrengthMax}
                latestBodyWeight={latestBodyWeight}
                t={t}
              />
            )}
          </>
        )}
        titleStyle={{ fontSize: RESPONSIVE_CONTENT_UI.headerTitleFontSize }}
        subtitleStyle={{ fontSize: RESPONSIVE_CONTENT_UI.headerSubtitleFontSize }}
      />

      <div style={statsTabListStyle(statsTabs.length)}>
        {statsTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActivescreen(tab.key)}
            style={{
              width: '100%',
              minHeight: RESPONSIVE_STATS_UI.tabMinHeight,
              padding: '8px clamp(3px, 1.5vw, 7px)',
              fontSize: RESPONSIVE_STATS_UI.tabFontSize,
              lineHeight: 1.2,
              background: THEME.card,
              color: activescreen === tab.key ? THEME.primary : THEME.text,
              border: `1px solid ${activescreen === tab.key ? THEME.primary : THEME.border}`,
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: activescreen === tab.key ? 800 : 700,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
      {activescreen === 'lifts' && (
  <div style={responsiveStatsChartGridStyle()}>
    {LIFT_ORDER.map(lift => {
  const liftLabel =
    lift === 'Deadlift' ? t.deadlift :
    lift === 'Bench' ? t.bench :
    t.squat;

  return renderChartCard({
      key: lift,
      title: liftLabel,
      color: COLORS[lift],
      data: liftData[lift] || [],
      dataKeys: STATS_LIFT_DATA_KEYS,
      colors: [THEME.muted, COLORS[lift]],
      emptyMessage: t.noStatsData,
    });
})}
  </div>
)}

      {activescreen === 'totaal' && (
        <div style={responsiveStatsChartGridStyle()}>
          {renderChartCard({
            key: 'totalSBD',
            title: t.totalSBD,
            color: THEME.meet,
            data: totalChartData,
            dataKeys: STATS_LIFT_DATA_KEYS,
            colors: [THEME.muted, THEME.meet],
          })}
          {renderChartCard({
            key: 'strengthTotalBodyweight',
            title: t.strengthTotalBodyweight,
            color: THEME.meet,
            data: strengthData,
            dataKeys: STATS_STRENGTH_DATA_KEYS,
            colors: [THEME.muted, THEME.meet],
            emptyMessage: t.noMetricData || t.noStatsData,
          })}
          {renderChartCard({
            key: 'strengthMax',
            title: t.strengthMax,
            color: THEME.meet,
            data: strengthData,
            dataKeys: STATS_STRENGTH_MAX_DATA_KEYS,
            colors: [THEME.muted, THEME.meet],
            emptyMessage: t.noMetricData || t.noStatsData,
          })}
        </div>
      )}

      {activescreen === 'lichaam' && renderMetricChartCards([
        {
          key: 'gewicht',
          title: t.bodyweight,
          data: bodyData,
          color: THEME.primary,
        },
        {
          key: 'bodyFat',
          title: t.bodyFatPercent,
          data: bodyMetricData.bodyFat,
          color: THEME.primary,
        },
        {
          key: 'leanMass',
          title: t.leanMassKg,
          data: bodyMetricData.leanMass,
          color: THEME.primary,
        },
      ])}

      {activescreen === 'scores' && renderMetricChartCards([
        {
          key: 'bodyWater',
          title: t.bodyWaterPercent,
          data: bodyMetricData.bodyWater,
          color: THEME.primary,
        },
        {
          key: 'visceralFat',
          title: t.visceralFatRating,
          data: bodyMetricData.visceralFat,
          color: THEME.primary,
        },
        {
          key: 'physiqueRating',
          title: t.physiqueRating,
          data: bodyMetricData.physiqueRating,
          color: THEME.primary,
        },
      ])}
      </div>


    </div>
  );
}

export { StatsScreen };
