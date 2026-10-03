import { generateWarmups } from './warmupAndPrepGeneration';
import { roundPercent } from './smartPrescriptionEngine';
import { isTopSetLabel } from './workoutHistoryStats';

export const SMART_RETURN_TRAINING = Object.freeze({
  suggestedAfterDays: 7,
  loadFactor: 0.9,
  accessoryLoadFactor: 0.8,
  minimumWorkSetsPerLift: 4,
  version: 2,
});

function roundedLoad(weight, factor) {
  const numericWeight = Number(weight);
  return Number.isFinite(numericWeight) && numericWeight > 0
    ? Math.max(2.5, Math.round(numericWeight * factor / 2.5) * 2.5)
    : weight;
}

function trainingMaxForBlock(block) {
  const reference = (block.sets || []).find(set =>
    Number(set.weight) > 0 && Number(set.precisePct || set.pct) > 0
  );
  return reference
    ? Number(reference.weight) / Number(reference.precisePct || reference.pct)
    : 0;
}

function localDayNumber(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function completedDayNumber(entry) {
  const isoDate = entry?.workoutSnapshot?.completedAt || entry?.completedAt;
  if (isoDate) return localDayNumber(isoDate);

  // Older records contain only the Dutch display date, not an ISO timestamp.
  const match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(entry?.date || '');
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
    ? localDayNumber(parsed)
    : null;
}

export function getDaysSinceLastCompletedWorkout(history = [], today = new Date()) {
  const todayDay = localDayNumber(today);
  if (todayDay === null) return null;

  const days = (history || [])
    .filter(entry =>
      !entry?.manualMax && !entry?.seedMax &&
      !entry?.restDay && entry?.workoutSnapshot?.type !== 'rest' &&
      entry?.workoutSnapshot?.completed
    )
    .map(completedDayNumber)
    .filter(day => day !== null && day <= todayDay);
  if (!days.length) return null;
  return todayDay - Math.max(...days);
}

export function canChooseSmartReturnTraining(workout) {
  return workout?.type === 'training' &&
    !workout.completed &&
    !workout.smartReturnTraining &&
    (workout.lifts || []).length > 0 &&
    (workout.lifts || []).every(block => (block.sets || []).length > 0);
}

export function buildSmartReturnTraining(workout) {
  if (!canChooseSmartReturnTraining(workout)) return workout;

  const lifts = workout.lifts.map(block => {
    const trainingMax = trainingMaxForBlock(block);
    let topWeight = null;
    const sets = block.sets.map(set => {
      let weight = roundedLoad(set.weight, SMART_RETURN_TRAINING.loadFactor);
      if (isTopSetLabel(set.labelKey)) {
        topWeight = Number(weight);
      } else if (set.labelKey === 'backoff' && topWeight > 2.5 && Number(weight) >= topWeight) {
        weight = topWeight - 2.5;
      }
      const exactPct = trainingMax > 0 ? Number(weight) / trainingMax : 0;
      const pct = exactPct > 0 ? roundPercent(exactPct) : null;
      return {
        ...set,
        weight,
        originalWeight: weight,
        ...(pct !== null ? {
          pct,
          originalPct: pct,
          ...(Number(set.prescribedPct) > 0 ? { prescribedPct: pct } : {}),
          ...(Number(set.precisePct) > 0 ? { precisePct: exactPct } : {}),
        } : {}),
      };
    });
    const warmups = generateWarmups(sets, block.lift);
    const volumeTemplate = [...sets].reverse().find(set =>
      set.labelKey === 'backoff' || set.labelKey === 'workSets'
    );
    if (volumeTemplate) {
      while (sets.length < SMART_RETURN_TRAINING.minimumWorkSetsPerLift ||
        (sets.length + warmups.length) % 4 !== 0) {
        sets.push({ ...volumeTemplate, done: false, failed: false, skipped: false });
      }
    }
    return {
      ...block,
      sets,
      warmups,
      smartPrescription: {
        ...(block.smartPrescription || {}),
        completeGrid: (warmups.length + sets.length) % 4 === 0,
        gridItemCount: warmups.length + sets.length,
      },
    };
  });

  return {
    ...workout,
    smartReturnTraining: true,
    smartReturnTrainingVersion: SMART_RETURN_TRAINING.version,
    smartDayType: 'deload',
    smartReturnBaseline: workout,
    lifts,
    sets: lifts[0].sets,
    warmups: lifts[0].warmups,
    accessories: (workout.accessories || []).map(accessory => {
      if (accessory.bodyweight) return accessory;
      const weights = (accessory.weights || []).map(weight =>
        roundedLoad(weight, SMART_RETURN_TRAINING.accessoryLoadFactor)
      );
      return { ...accessory, weights, originalWeights: [...weights] };
    }),
  };
}

export function restoreSmartReturnTraining(workout) {
  return workout?.smartReturnTraining && workout.smartReturnBaseline
    ? workout.smartReturnBaseline
    : workout;
}
