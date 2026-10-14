import {
  LIFT_ORDER, calculateBestMaxesFromHistory, calculateAchievedMaxesFromHistory,
  getEntryCycle, getEntryWorkoutNumber, isCompletedHistoryEntry,
} from './workoutHistoryStats';

const isBaselineEntry = entry => Boolean(entry?.seedMax || (
  LIFT_ORDER.includes(entry?.lift) && Number(entry.workoutNumber) === 0 && !entry.manualMax
));

// Read-only review: completed history is the source, never planned weights or PR targets.
export function buildCycleReview(history = [], currentCycle = 1) {
  const cycle = Number(currentCycle) || 1;
  const entries = history.filter(entry => entry && entry.workoutSnapshot?.completed !== false &&
    (isBaselineEntry(entry) || getEntryCycle(entry) <= cycle)).map(entry => {
    const snapshot = entry.workoutSnapshot;
    const sets = snapshot?.lifts?.find(block => block.lift === entry.lift)?.sets || snapshot?.sets;
    // Structured set evidence wins over an older cached summary that might
    // still contain a failed attempt. Do not mutate the saved snapshot.
    return sets?.length && snapshot?.completedSummary
      ? { ...entry, workoutSnapshot: { ...snapshot, completedSummary: undefined } }
      : entry;
  });
  const seeds = entries.filter(isBaselineEntry);
  const baseline = calculateBestMaxesFromHistory(seeds);
  const before = calculateBestMaxesFromHistory(entries.filter(entry => isBaselineEntry(entry) || getEntryCycle(entry) < cycle));
  const currentEntries = entries.filter(entry => !isBaselineEntry(entry) && getEntryCycle(entry) === cycle);
  const achieved = calculateAchievedMaxesFromHistory(currentEntries);
  const best = calculateBestMaxesFromHistory(entries);
  const days = new Map();
  currentEntries.filter(entry => isCompletedHistoryEntry(entry) || entry.restDay).forEach(entry => {
    const number = getEntryWorkoutNumber(entry);
    if (!(number > 0)) return;
    const snapshot = entry.workoutSnapshot || entry;
    const type = entry.restDay || snapshot.type === 'rest' ? 'rest' : snapshot.type === 'meet' ? 'meet' : 'training';
    days.set(number, type);
  });
  const lifts = LIFT_ORDER.map(lift => ({
    lift,
    oneRM: achieved[lift].oneRM || null,
    e1rm: achieved[lift].e1rm || null,
    oneRMGain: before[lift].oneRM > 0 && achieved[lift].oneRM > 0 ? achieved[lift].oneRM - before[lift].oneRM : null,
    e1RMGain: before[lift].e1rm > 0 && achieved[lift].e1rm > 0 ? achieved[lift].e1rm - before[lift].e1rm : null,
    sinceStartGain: baseline[lift].oneRM > 0 && best[lift].oneRM > 0 ? best[lift].oneRM - baseline[lift].oneRM : null,
  }));
  const completeTotal = maxes => LIFT_ORDER.every(lift => maxes[lift].oneRM > 0)
    ? LIFT_ORDER.reduce((total, lift) => total + maxes[lift].oneRM, 0) : null;
  const points = [];
  if (completeTotal(baseline)) points.push({ cycle: 0, total: completeTotal(baseline) });
  const cycles = [...new Set(entries.filter(entry => !isBaselineEntry(entry) && !entry.manualMax && isCompletedHistoryEntry(entry)).map(getEntryCycle))].sort((a, b) => a - b);
  cycles.forEach(value => {
    const total = completeTotal(calculateBestMaxesFromHistory(entries.filter(entry => isBaselineEntry(entry) || getEntryCycle(entry) <= value)));
    if (total) points.push({ cycle: value, total });
  });
  const meetNumbers = [...days].filter(([, type]) => type === 'meet').map(([number]) => number);
  const lastMeetNumber = meetNumbers.length ? Math.max(...meetNumbers) : null;
  const meet = lastMeetNumber === null ? null : calculateAchievedMaxesFromHistory(currentEntries.filter(entry => getEntryWorkoutNumber(entry) === lastMeetNumber));
  return {
    cycle, lifts, points,
    trainingDays: [...days.values()].filter(type => type !== 'rest').length,
    restDays: [...days.values()].filter(type => type === 'rest').length,
    total: completeTotal(best),
    totalGain: completeTotal(best) !== null && completeTotal(baseline) !== null ? completeTotal(best) - completeTotal(baseline) : null,
    meetTotal: meet ? completeTotal(meet) : null,
  };
}
