import { addLocalDays, parseWorkoutDateKey } from './workoutScheduleDates';
import { getEntryCycle, getEntryWorkoutNumber, isCompletedHistoryEntry } from './workoutHistoryStats';

export const PROGRAM_FUTURE_DAYS = 28;
export const programWorkoutKey = (cycle, number) => `C${cycle}W${number}`;

export function getProgramForecastWindow({ scheduleDateKeys = [], today = new Date() } = {}) {
  const todayKey = parseWorkoutDateKey(today);
  if (!todayKey) return { startDate: null, additionalDays: 0 };
  const lastDate = scheduleDateKeys.map(parseWorkoutDateKey).filter(Boolean).at(-1);
  const startDate = lastDate ? [addLocalDays(lastDate, 1), todayKey].sort().at(-1) : todayKey;
  const days = (Date.parse(`${addLocalDays(todayKey, PROGRAM_FUTURE_DAYS - 1)}T12:00:00Z`)
    - Date.parse(`${startDate}T12:00:00Z`)) / 86400000 + 1;
  return { startDate, additionalDays: Math.max(0, days) };
}

// Each completion can have several lift records. Retain one complete snapshot
// per cycle/workout; legacy records remain inspectable without inventing sets.
export function buildProgramTimeline({ workouts = [], history = [], currentCycle = 1,
  scheduleDateKeys = [], currentIndex = 0, forecast = [], forecastStartDate } = {}) {
  const past = new Map();
  for (const entry of history) {
    const cycle = getEntryCycle(entry), number = getEntryWorkoutNumber(entry);
    if (cycle > currentCycle || number <= 0 || entry.seedMax || entry.manualMax ||
      !(isCompletedHistoryEntry(entry) || entry.restDay)) continue;
    const key = programWorkoutKey(cycle, number);
    if (cycle === currentCycle && workouts.some(workout => Number(workout.number) === number)) continue;
    const previous = past.get(key);
    const snapshot = entry.workoutSnapshot;
    const workout = snapshot ? { ...snapshot, number, completed: true,
      completedAt: snapshot.completedAt || entry.completedAt, completedDate: snapshot.completedDate || entry.date }
      : previous?.workout || { number, completed: true, type: entry.restDay ? 'rest' : 'training',
        completedAt: entry.completedAt, completedDate: entry.date, lifts: [] };
    if (!snapshot && !previous?.snapshot && entry.lift && !workout.lifts?.some(block => block.lift === entry.lift)) {
      workout.lifts = [...(workout.lifts || []), { lift: entry.lift, sets: [] }];
    }
    if (!previous?.snapshot || snapshot) past.set(key, { key, cycle, workout, idx: null, snapshot: Boolean(snapshot), projected: false });
  }
  const current = workouts.slice(0, forecast.length ? currentIndex : workouts.length).map((workout, idx) => ({ workout, idx, cycle: currentCycle,
    key: programWorkoutKey(currentCycle, workout.number), dateKey: scheduleDateKeys[idx], projected: false }));
  const future = forecast.map(({ cycle, workout }, index) => {
    const active = cycle === currentCycle && index === 0;
    return { workout: active ? workouts[currentIndex] || workout : workout, cycle,
      idx: cycle === currentCycle && Number(workout.number) <= workouts.length ? Number(workout.number) - 1 : null, key: programWorkoutKey(cycle, workout.number),
      dateKey: addLocalDays(forecastStartDate, index), projected: !active };
  });
  return [...past.values()].sort((a, b) => a.cycle - b.cycle || a.workout.number - b.workout.number)
    .concat(current, future);
}
