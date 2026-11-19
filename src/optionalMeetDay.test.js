import { createWorkoutSetup, normalizeWorkoutSetup } from './workoutSetup';
import { applyOptionalMeetDay, generateWorkoutsForTrainingModel, isSmartCycleCompleteAfterHistory,
  projectSmartPlanningHorizon } from './smartTrainingEngine';
import { mergeGeneratedWorkoutStructure } from './workoutStateMerge';
import { buildTimelineCalendarEventSpecs } from './calendarIntegration';

const options = { squat: 160, bench: 100, deadlift: 200, athleteLevel: 'intermediate',
  currentCycle: 1, currentIndex: 0, history: [], idealRouteEnabled: true,
  weightRounding: { training: 2.5, meet: 2.5 }, workoutSetup: createWorkoutSetup(), skipMeetProjectionSimulation: true };
const withoutMeet = { ...options, workoutSetup: createWorkoutSetup({ meetDayEnabled: false }) };

test('new and legacy settings default on, explicit off survives normalization and JSON', () => {
  expect(createWorkoutSetup().meetDayEnabled).toBe(true);
  expect(normalizeWorkoutSetup({ version: 1 }).meetDayEnabled).toBe(true);
  expect(normalizeWorkoutSetup(JSON.parse(JSON.stringify(withoutMeet.workoutSetup))).meetDayEnabled).toBe(false);
});

test.each(['beginner', 'intermediate', 'advanced', 'elite'])('%s replaces only the meet with light SBD work', athleteLevel => {
  const withMeet = generateWorkoutsForTrainingModel('smart', { ...options, athleteLevel });
  const disabled = generateWorkoutsForTrainingModel('smart', { ...withoutMeet, athleteLevel });
  const index = withMeet.findIndex(workout => workout.type === 'meet');
  expect(index).toBeGreaterThan(-1);
  expect(disabled.slice(0, index)).toEqual(withMeet.slice(0, index));
  withMeet.forEach((workout, position) => {
    if (workout.type !== 'meet') expect(disabled[position]).toEqual(workout);
  });
  const taper = disabled[index];
  expect(taper).toMatchObject({ type: 'training', cycleClosingTaper: true, number: withMeet[index].number });
  expect(taper.lifts.map(block => block.lift)).toEqual(['Squat', 'Bench', 'Deadlift']);
  for (const block of taper.lifts) {
    expect(block.sets.every(set => set.labelKey === 'workSets' && set.reps === 5)).toBe(true);
    block.sets.forEach(set => expect(set.pct).toBeCloseTo(0.6));
    expect((block.sets.length + block.warmups.length) % 5).toBe(0);
    expect(block.sets.length).toBeGreaterThanOrEqual(3);
    expect(block.sets.length).toBeLessThanOrEqual(7);
  }
});

test('the replacement uses training limits, and a completed closing day plus one rest closes the cycle', () => {
  const generated = generateWorkoutsForTrainingModel('smart', { ...withoutMeet, weightLimits: { Deadlift: 100 } });
  const taper = generated.find(workout => workout.cycleClosingTaper);
  const deadlift = taper.lifts.find(block => block.lift === 'Deadlift');
  expect(deadlift.sets.every(set => set.weight === 100 && set.reps > 5)).toBe(true);
  const snapshot = { ...taper, completed: true, workoutEffort: 'good',
    lifts: taper.lifts.map(block => ({ ...block, sets: block.sets.map(set => ({ ...set, done: true })) })) };
  const history = [{ cycle: 1, workoutNumber: taper.number, workoutSnapshot: snapshot }];
  expect(isSmartCycleCompleteAfterHistory(history, 1)).toBe(false);
  const rest = { number: taper.number + 1, type: 'rest', completed: true, smartIdealRoute: { stage: 'post-meet' } };
  expect(isSmartCycleCompleteAfterHistory([...history, { cycle: 1, workoutNumber: rest.number, workoutSnapshot: rest }], 1)).toBe(true);
  expect(isSmartCycleCompleteAfterHistory(history, 2)).toBe(false);
});

test('started and completed closing sessions survive a preference change', () => {
  const withMeet = generateWorkoutsForTrainingModel('smart', options);
  const index = withMeet.findIndex(workout => workout.type === 'meet');
  const started = structuredClone(withMeet[index]); started.lifts[0].warmups[0].done = true;
  const result = generateWorkoutsForTrainingModel('smart', { ...withoutMeet, currentIndex: index, inProgressWorkout: started });
  expect(result[index]).toEqual(started);
  const taper = applyOptionalMeetDay(withMeet[index], withoutMeet);
  taper.lifts[0].sets[0].done = true;
  expect(mergeGeneratedWorkoutStructure([taper], [withMeet[index]], [], 1)[0]).toBe(taper);
  const completed = { ...withMeet[index], completed: true };
  expect(applyOptionalMeetDay(completed, withoutMeet)).toBe(completed);
});

test('four-week planning crosses the cycle boundary without a meet, and Calendar keeps the replacement day', () => {
  const initial = generateWorkoutsForTrainingModel('smart', withoutMeet);
  const closingDay = initial.find(workout => workout.cycleClosingTaper);
  const forecast = projectSmartPlanningHorizon({ ...withoutMeet, currentIndex: closingDay.number,
    history: [{ cycle: 1, workoutNumber: closingDay.number, workoutSnapshot: { ...closingDay, completed: true, workoutEffort: 'good' } }] }, 28);
  expect(forecast.length).toBeGreaterThanOrEqual(28);
  expect(forecast.some(entry => entry.cycle === 2)).toBe(true);
  expect(forecast.some(entry => entry.workout.type === 'meet')).toBe(false);
  const closing = { cycle: 1, workout: closingDay };
  const events = buildTimelineCalendarEventSpecs({ timeline: [{ ...closing, dateKey: '2026-12-01' }],
    today: '2026-11-19', titleTemplate: 'C{cycle}W{workout} Kelani' });
  expect(events).toHaveLength(1);
  expect(events[0].title).toBe(`C1W${closing.workout.number} Kelani`);
});
