// The full record remains a checkpoint. A progress edit atomically replaces only
// the smaller in-progress record. Imports and new checkpoints invalidate old edits.
export const PROFILE_KEY = 'kel-powerlifting-user-data-v1';
const progressKey = PROFILE_KEY + ':progress';

export function readProfile(storage) {
  const base = JSON.parse(storage.getItem(PROFILE_KEY));
  if (!base || !base.progressRevision) return base;
  const { progressRevision, ...data } = base;
  const progress = JSON.parse(storage.getItem(progressKey));
  if (progress?.revision === progressRevision) {
    // Early progress records stored the complete in-progress calendar.
    if (Array.isArray(progress.inProgress?.workouts)) {
      return { ...data, inProgress: progress.inProgress };
    }
    const workouts = data.inProgress.workouts.slice();
    for (const [index, workout] of progress.changes) workouts[index] = workout;
    data.inProgress = { ...progress.state, workouts };
  }
  return data;
}

export function replaceProfile(storage, data) {
  const { progressRevision, ...profile } = data;
  storage.setItem(PROFILE_KEY, JSON.stringify(profile));
  storage.removeItem(progressKey);
}

export function saveProfile(storage, data, previous) {
  if (previous && Object.keys(data).every(key =>
    key === 'inProgress' || data[key] === previous.data[key]) &&
      data.inProgress.workouts.length === previous.workouts.length) {
    const { workouts, ...state } = data.inProgress;
    const changes = [];
    workouts.forEach((workout, index) => {
      if (workout !== previous.workouts[index]) changes.push([index, workout]);
    });
    try {
      storage.setItem(progressKey, JSON.stringify({ revision: previous.revision, state, changes }));
      return { ...previous, data };
    } catch (error) {
      if (error.name !== 'QuotaExceededError') throw error;
      // A full replacement can fit even when there is no room for an extra record.
    }
  }
  const revision = Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
  storage.setItem(PROFILE_KEY, JSON.stringify({ ...data, progressRevision: revision }));
  storage.removeItem(progressKey);
  return { revision, data, workouts: data.inProgress.workouts };
}

export function clearProfile(storage) {
  storage.removeItem(PROFILE_KEY);
  storage.removeItem(progressKey);
}
