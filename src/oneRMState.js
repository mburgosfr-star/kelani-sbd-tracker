import {
  LIFT_ORDER,
  getEstablishedOneRMFromHistoryEntry,
  getHistoryMaxCandidates,
} from './workoutHistoryStats';

export const ONE_RM_STATE_VERSION = 2;

function emptyOneRMs() {
  return LIFT_ORDER.reduce((result, lift) => ({
    ...result,
    [lift]: 0,
  }), {});
}

export function normalizeOneRMs(values = {}, fallback = {}) {
  return LIFT_ORDER.reduce((result, lift) => {
    const value = Number(values?.[lift]);
    const fallbackValue = Number(fallback?.[lift]);

    result[lift] = Number.isFinite(value) && value > 0
      ? value
      : Number.isFinite(fallbackValue) && fallbackValue > 0
        ? fallbackValue
        : 0;

    return result;
  }, {});
}

export function calculateActualOneRMsFromHistory(history = []) {
  return (history || []).reduce((result, entry) => {
    const entryLift = LIFT_ORDER.includes(entry?.lift) ? entry.lift : null;
    const actualOneRM = entryLift
      ? Number(getHistoryMaxCandidates(entry).oneRM) || 0
      : 0;
    const summary = entry.workoutSnapshot?.completedSummary;
    const summaryResults = Array.isArray(summary?.results)
      ? summary.results
      : summary?.lift
        ? [summary]
        : [];

    // Legacy completed summaries carry the established real 1RM that was
    // already known before that workout. This is essential when an older
    // imported history no longer contains the original meet's raw set row.
    // Do not use summary.best1RM here: older training summaries could call a
    // heavy multi-rep set a 1RM. A genuine new single is already detected by
    // getHistoryMaxCandidates above.
    if (entryLift) {
      result[entryLift] = Math.max(
        result[entryLift],
        actualOneRM,
        getEstablishedOneRMFromHistoryEntry(entry, entryLift)
      );
    }

    summaryResults.forEach(summaryResult => {
      const summaryLift = summaryResult?.lift;
      if (!LIFT_ORDER.includes(summaryLift)) return;

      result[summaryLift] = Math.max(
        result[summaryLift],
        getEstablishedOneRMFromHistoryEntry(entry, summaryLift)
      );
    });

    return result;
  }, emptyOneRMs());
}

// Version 1 briefly inferred established 1RMs by rounding e1RMs from doubles
// and triples. That is not a real 1RM. Unversioned/v1 records therefore
// rebuild from successful singles (including seed/manual maxes) and the
// established real-1RM baselines preserved in legacy completed summaries.
// Version 2 values are explicit confirmed 1RMs and remain valid even when the
// confirming lift happened outside the recorded Kelani workout history.
export function deriveOneRMs({
  savedOneRMs,
  stateVersion = 0,
  prs = {},
  history = [],
} = {}) {
  const hasTrustedSavedOneRMs =
    Number(stateVersion) >= ONE_RM_STATE_VERSION &&
    LIFT_ORDER.every(lift => {
    const value = Number(savedOneRMs?.[lift]);
    return Number.isFinite(value) && value > 0;
  });
  const actualOneRMs = calculateActualOneRMsFromHistory(history);

  if (hasTrustedSavedOneRMs) {
    return mergeHigherOneRMs(savedOneRMs, actualOneRMs);
  }

  return LIFT_ORDER.reduce((result, lift) => {
    result[lift] = actualOneRMs[lift] || Number(prs?.[lift]) || 0;
    return result;
  }, {});
}

export function mergeHigherOneRMs(current = {}, candidate = {}) {
  return LIFT_ORDER.reduce((result, lift) => {
    result[lift] = Math.max(
      Number(current?.[lift]) || 0,
      Number(candidate?.[lift]) || 0
    );
    return result;
  }, {});
}
