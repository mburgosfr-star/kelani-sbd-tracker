import { buildProgramTimeline, getProgramForecastWindow } from './programTimeline';
import { buildTimelineCalendarEventSpecs } from './calendarIntegration';
import { generateWorkoutsForTrainingModel, projectSmartPlanningHorizon } from './smartTrainingEngine';
import { addLocalDays } from './workoutScheduleDates';

const options = { programProfile: 'kelaniSbd', squat: 150, bench: 100, deadlift: 200,
  preparationMode: 'off', accessoryMode: 'off', currentCycle: 2, currentIndex: 0,
  idealRouteEnabled: true, history: [] };

test.each(['beginner', 'intermediate', 'advanced', 'elite'])('%s planning covers four weeks without persisting fictional successes', athleteLevel => {
  const config = { ...options, athleteLevel, history: [] };
  const actual = generateWorkoutsForTrainingModel('smart', config);
  const before = JSON.stringify({ actual, config });
  const forecast = projectSmartPlanningHorizon(config);
  expect(forecast.length).toBeGreaterThanOrEqual(28);
  expect(forecast.every(item => !item.workout.completed)).toBe(true);
  expect(new Set(forecast.map(item => `C${item.cycle}W${item.workout.number}`)).size).toBe(forecast.length);
  expect(JSON.stringify({ actual, config })).toBe(before);
  const timeline = buildProgramTimeline({ workouts: actual, currentCycle: 2, forecast, forecastStartDate: '2026-11-17' });
  expect(timeline.at(-1).dateKey >= '2026-12-14').toBe(true);
  expect(timeline[0].workout).toBe(actual[0]);
  const events = buildTimelineCalendarEventSpecs({ timeline, today: '2026-11-17', titleTemplate: 'C{cycle}W{workout} Kelani' });
  const training = timeline.filter(item => item.workout.type !== 'rest');
  expect(events.map(event => `C${event.cycleId}W${event.workoutId}`)).toEqual(training.map(item => item.key));
  expect(events.map(event => event.dateKey)).toEqual(training.map(item => item.dateKey));
  expect(events.every(event => event.title === `C${event.cycleId}W${event.workoutId} Kelani`)).toBe(true);
});

test('one timeline spans multiple short cycles and keeps a longer current cycle complete', () => {
  const workout = number => ({ number, type: 'rest' });
  const long = Array.from({ length: 40 }, (_, index) => workout(index + 1));
  const timeline = buildProgramTimeline({ workouts: long, currentCycle: 1,
    scheduleDateKeys: long.map((_, index) => addLocalDays('2026-11-17', index)) });
  expect(timeline).toHaveLength(40);
  expect(timeline.at(-1).dateKey).toBe('2026-12-26');
  expect(getProgramForecastWindow({ scheduleDateKeys: timeline.map(item => item.dateKey), today: '2026-11-17' }).additionalDays).toBe(0);
});

test('history deduplicates full multi-lift snapshots and preserves the active manually edited workout', () => {
  const snapshot = { number: 27, completed: true, type: 'meet', lifts: [{ lift: 'Squat', sets: [{ weight: 150, reps: 1, done: true }] }] };
  const history = ['Squat', 'Bench', 'Deadlift'].map(lift => ({ lift, cycle: 1, workoutNumber: 27, workoutSnapshot: snapshot }));
  history.push({ cycle: 1, workoutNumber: 28, restDay: true });
  const active = { number: 2, type: 'training', lifts: [{ lift: 'Bench', sets: [{ weight: 83.5, reps: 3, done: true, manualWeight: true }] }] };
  const workouts = [{ number: 1, type: 'rest', completed: true }, active];
  const before = JSON.stringify({ history, workouts });
  const timeline = buildProgramTimeline({ history, workouts, currentCycle: 2, currentIndex: 1,
    forecastStartDate: '2026-11-18', forecast: [{ cycle: 2, workout: { number: 2, type: 'rest' } }, { cycle: 3, workout: { number: 1, type: 'training' } }] });
  expect(timeline.map(entry => entry.key)).toEqual(['C1W27', 'C1W28', 'C2W1', 'C2W2', 'C3W1']);
  expect(timeline[3].workout).toBe(active);
  expect(timeline[3].projected).toBe(false);
  expect(timeline[4]).toMatchObject({ projected: true, dateKey: '2026-11-19' });
  expect(JSON.stringify({ history, workouts })).toBe(before);
});

test('a beginner horizon can cross two cycle boundaries and still cover all 28 upcoming days', () => {
  const config = { ...options, athleteLevel: 'beginner', currentCycle: 1 };
  const initial = projectSmartPlanningHorizon(config);
  const days = initial.filter(item => item.cycle === 1);
  const history = days.slice(0, -1).flatMap(({ workout }) => {
    const snapshot = { ...workout, completed: true, lifts: (workout.lifts || []).map(block => ({ ...block,
      sets: (block.sets || []).map(set => ({ ...set, done: true, failed: false, skipped: false })) })) };
    if (snapshot.type === 'rest') return [{ cycle: 1, workoutNumber: snapshot.number, restDay: true, workoutSnapshot: snapshot }];
    return snapshot.lifts.map(block => ({ cycle: 1, workoutNumber: snapshot.number, lift: block.lift, workoutSnapshot: snapshot }));
  });
  const before = JSON.stringify(history);
  const horizon = projectSmartPlanningHorizon({ ...config, currentIndex: days.length - 1, history });
  expect(horizon).toHaveLength(28);
  expect([...new Set(horizon.map(item => item.cycle))]).toEqual([1, 2, 3]);
  expect(horizon[0].workout.type).toBe('rest');
  expect(JSON.stringify(history)).toBe(before);
});
