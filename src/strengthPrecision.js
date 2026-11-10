import {
  LIFT_ORDER, calculatePrsFromHistory,
  calculateStrengthRatioMaxes, getAbsoluteWorkoutIndex, getAthleteLevel,
  getCelebratedStrengthRatioMaxes, getHistoryMaxCandidates,
  getSmartLiftSetsFromSnapshot, initializeAthleteLevelPolicy, mergeStrengthRatioMaxes,
} from './workoutHistoryStats';
import { deriveOneRMs } from './oneRMState';

export const STRENGTH_PRECISION_VERSION = 1;

// Old releases rounded calculated estimates to a loadable barbell weight.
// Rebuild derived fields from retained set evidence, never the set weights,
// outcomes, dates or workout structure themselves. Unknown legacy evidence
// and explicit seed/manual values are left intact.
export function normalizeStrengthHistory(history = []) {
  const running = Object.fromEntries(LIFT_ORDER.map(lift => [lift, 0]));
  const result = [...history];
  const groups = new Map();
  history.forEach((entry, index) => {
    const key = getAbsoluteWorkoutIndex(entry);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ entry, index });
  });
  [...groups.entries()].sort(([a], [b]) => a - b).forEach(([, entries]) => {
    entries.forEach(({ entry, index }) => {
      if (entry.manualMax || entry.seedMax || !LIFT_ORDER.includes(entry.lift)) return;
      const sets = getSmartLiftSetsFromSnapshot(entry.workoutSnapshot || entry, entry.lift);
      if (!sets.length) return;
      const today = getHistoryMaxCandidates(entry).e1rm;
      const next = { ...entry };
      for (const key of ['e1rm', 'e1RMToday']) {
        if (key in entry) next[key] = today;
      }
      if ('previousBestE1RM' in entry && running[entry.lift] > 0) {
        next.previousBestE1RM = running[entry.lift];
      }
      if ('bestE1RM' in entry) next.bestE1RM = Math.max(running[entry.lift], today);
      const snapshot = entry.workoutSnapshot;
      if (snapshot?.completedSummary) {
        const summary = snapshot.completedSummary;
        const normalizeResult = row => {
          const liftSets = getSmartLiftSetsFromSnapshot(snapshot, row.lift);
          if (!LIFT_ORDER.includes(row.lift) || !liftSets.length || row.trackStrength === false) return row;
          const estimate = getHistoryMaxCandidates({ ...entry, lift: row.lift }).e1rm;
          const previous = Math.max(
            running[row.lift] || Number(row.previousBestE1RM) || 0,
            Number(row.previousBest1RM) || 0
          );
          return { ...row, e1RMToday: estimate, previousBestE1RM: previous,
            bestE1RM: Math.max(previous, estimate), isE1RMPR: estimate > previous };
        };
        const results = Array.isArray(summary.results) ? summary.results.map(normalizeResult) : null;
        const primary = results?.find(row => row.lift === summary.lift) || results?.[0];
        const normalized = results
          ? { ...summary, results, ...(primary ? Object.fromEntries(
            ['e1RMToday', 'previousBestE1RM', 'bestE1RM', 'isE1RMPR'].map(key => [key, primary[key]])
          ) : {}) }
          : summary.lift ? normalizeResult(summary) : summary;
        next.workoutSnapshot = { ...snapshot, completedSummary: normalized };
        if (snapshot.milestoneCelebration?.achievements && results) {
          const achievements = snapshot.milestoneCelebration.achievements.flatMap(item => {
            if (item.type !== 'e1RM') return [item];
            const row = results.find(row => row.lift === item.lift);
            const previousByLift = Object.fromEntries(LIFT_ORDER.map(lift => [lift,
              results.find(row => row.lift === lift)?.previousBestE1RM || running[lift]]));
            const totalKnown = LIFT_ORDER.every(lift => previousByLift[lift] > 0);
            const previous = item.lift === 'Total' && totalKnown
              ? LIFT_ORDER.reduce((sum, lift) => sum + previousByLift[lift], 0)
              : row?.previousBestE1RM;
            const value = item.lift === 'Total' && totalKnown
              ? LIFT_ORDER.reduce((sum, lift) => sum + Math.max(previousByLift[lift],
                results.find(row => row.lift === lift)?.bestE1RM || 0), 0)
              : row?.bestE1RM;
            if (previous === undefined || value === undefined) return [item];
            return value > previous ? [{ ...item, previous, value, gain: value - previous }] : [];
          });
          next.workoutSnapshot.milestoneCelebration = {
            ...snapshot.milestoneCelebration, achievements,
          };
        }
      }
      result[index] = next;
    });
    entries.forEach(({ index }) => {
      const entry = result[index];
      if (!LIFT_ORDER.includes(entry.lift)) return;
      running[entry.lift] = Math.max(running[entry.lift], getHistoryMaxCandidates(entry).e1rm);
    });
  });
  return result;
}

export function normalizeStrengthPrecision(data = {}) {
  const sourceHistory = Array.isArray(data.history) ? data.history : [];
  const legacy = !(Number(data.strengthPrecisionVersion) >= STRENGTH_PRECISION_VERSION);
  const history = legacy ? normalizeStrengthHistory(sourceHistory) : sourceHistory;
  const savedPrs = data.prs || {};
  const oneRMs = deriveOneRMs({ savedOneRMs: data.oneRMs,
    stateVersion: data.oneRMStateVersion, prs: savedPrs, history: sourceHistory });
  const calculatedPrs = calculatePrsFromHistory(history);
  const prs = Object.fromEntries(LIFT_ORDER.map(lift => {
    const saved = Number(savedPrs[lift]) || 0;
    const calculated = Number(calculatedPrs[lift]) || 0;
    const canRecoverRoundedEstimate = legacy && calculated > 0 &&
      saved === Math.round(calculated / 2.5) * 2.5;
    return [lift, Math.max(Number(oneRMs[lift]) || 0, calculated,
      canRecoverRoundedEstimate ? 0 : saved)];
  }));
  const previousRecords = initializeAthleteLevelPolicy(mergeStrengthRatioMaxes(
    data.strengthRatioMaxes, legacy ? getCelebratedStrengthRatioMaxes(sourceHistory) : undefined,
    calculateStrengthRatioMaxes({ prs: savedPrs, oneRMs, history: sourceHistory, bodyWeights: data.bodyWeights })
  ), { legacy: true });
  const calculated = calculateStrengthRatioMaxes({ prs, oneRMs, history, bodyWeights: data.bodyWeights });
  const oldCalculated = calculateStrengthRatioMaxes({ prs: savedPrs, oneRMs,
    history: sourceHistory, bodyWeights: data.bodyWeights });
  // Identify ratio caches produced from the old, barbell-rounded summary
  // fields. Use them only to identify provenance, never as new performance.
  const oldSummaryCalculated = legacy ? calculateStrengthRatioMaxes({
    prs: savedPrs, oneRMs, bodyWeights: data.bodyWeights,
    history: sourceHistory.map(entry => ({ ...entry,
      ...(entry.workoutSnapshot ? { workoutSnapshot: { ...entry.workoutSnapshot,
        sets: [], lifts: (entry.workoutSnapshot.lifts || []).map(block => ({ ...block, sets: [] }))
      } } : {}),
    })),
  }) : {};
  const records = { ...previousRecords };
  for (const key of ['strengthMax', 'eStrengthMax']) {
    const old = Number(previousRecords[key]) || 0;
    const explainedByOldRounding = legacy && [oldCalculated[key], oldSummaryCalculated[key]]
      .some(value => Number(value) > 0 && (
        old === Number(value) || old === Math.round(Number(value) * 100) / 100
      ));
    records[key] = explainedByOldRounding ? calculated[key] : old || null;
  }
  const levels = ['beginner', 'intermediate', 'advanced', 'elite'];
  records.athleteLevelFloor = levels[Math.max(
    levels.indexOf(previousRecords.athleteLevelFloor),
    levels.indexOf(getAthleteLevel({ strengthRatioMaxes: previousRecords }))
  )];
  const snapshots = new Map(history.filter(entry => entry.workoutSnapshot?.completed)
    .map(entry => [`${entry.cycle || 1}:${entry.workoutNumber}`, entry.workoutSnapshot]));
  return {
    ...data, history, prs, strengthPrecisionVersion: STRENGTH_PRECISION_VERSION,
    strengthRatioMaxes: mergeStrengthRatioMaxes(records, calculated),
    ...(data.inProgress ? { inProgress: { ...data.inProgress,
      workouts: (data.inProgress.workouts || []).map(workout => workout.completed
        ? snapshots.get(`${data.inProgress.currentCycle}:${workout.number}`) || workout : workout) } } : {}),
  };
}
