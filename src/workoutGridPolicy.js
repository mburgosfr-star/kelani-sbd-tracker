// Shared by workout rendering and prescription generation.
export const WORKOUT_GRID_COLUMNS = 5;
export const WORKOUT_VOLUME_MIN_SETS = 1;
export const WORKOUT_VOLUME_MAX_SETS = 5;

export function reduceVolumeReps(reps) {
  const value = Number(reps);
  return value >= 4 && value <= 6 ? value - 1 : value;
}

export function completeWorkoutVolumeGrid({ sets = [], warmups = [] } = {}) {
  const isVolume = set => ['backoff', 'worksets'].includes(String(set.labelKey || '').toLowerCase());
  const volume = sets.filter(isVolume);
  if (!volume.length) return sets.map(set => ({ ...set }));
  const fixedCount = sets.length - volume.length;
  const count = WORKOUT_GRID_COLUMNS - ((warmups.length + fixedCount) % WORKOUT_GRID_COLUMNS);
  let kept = 0;
  const result = sets.filter(set => !isVolume(set) || kept++ < count).map(set => ({ ...set }));
  while (kept < count) {
    result.push({ ...volume.at(-1), done: false, failed: false, skipped: false });
    kept += 1;
  }
  return result;
}
