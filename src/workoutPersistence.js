// The full record remains a checkpoint. A progress edit atomically replaces only
// the smaller in-progress record. Imports and new checkpoints invalidate old edits.
export const PROFILE_KEY = 'kel-powerlifting-user-data-v1';
const progressKey = PROFILE_KEY + ':progress';

// A multi-lift completion records the same snapshot on several history
// entries. Keep the portable backup format intact. If a local checkpoint
// exceeds the quota, reference only byte-identical snapshots within it.
function writeCheckpoint(storage, profile) {
  try {
    storage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return;
  } catch (error) {
    if (error.name !== 'QuotaExceededError' || !Array.isArray(profile.history)) throw error;
  }
  const originals = new Map();
  const snapshotLinks = [];
  const history = profile.history.map((entry, index) => {
    if (!entry?.workoutSnapshot) return entry;
    const serialized = JSON.stringify(entry.workoutSnapshot);
    if (!originals.has(serialized)) {
      originals.set(serialized, index);
      return entry;
    }
    snapshotLinks.push([index, originals.get(serialized)]);
    const { workoutSnapshot, ...rest } = entry;
    return rest;
  });
  storage.setItem(PROFILE_KEY, JSON.stringify({ ...profile, history, snapshotLinks }));
}

export function readProfile(storage) {
  const base = JSON.parse(storage.getItem(PROFILE_KEY));
  if (Array.isArray(base?.snapshotLinks)) {
    for (const [index, source] of base.snapshotLinks) {
      base.history[index].workoutSnapshot = base.history[source].workoutSnapshot;
    }
    delete base.snapshotLinks;
  }
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
  writeCheckpoint(storage, profile);
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
  writeCheckpoint(storage, { ...data, progressRevision: revision });
  storage.removeItem(progressKey);
  return { revision, data, workouts: data.inProgress.workouts };
}

export function clearProfile(storage) {
  storage.removeItem(PROFILE_KEY);
  storage.removeItem(progressKey);
}
