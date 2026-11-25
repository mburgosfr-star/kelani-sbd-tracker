import { createWorkoutSetup, normalizeWorkoutSetup } from './workoutSetup';
import { generateWorkoutsForTrainingModel, isSmartCycleCompleteAfterHistory,
  projectSmartPlanningHorizon } from './smartTrainingEngine';
import { mergeGeneratedWorkoutStructure } from './workoutStateMerge';
import { buildTimelineCalendarEventSpecs } from './calendarIntegration';

const options = { squat: 160, bench: 100, deadlift: 200, athleteLevel: 'intermediate',
  currentCycle: 1, currentIndex: 0, history: [], idealRouteEnabled: true,
  weightRounding: { training: 2.5, meet: 2.5 }, workoutSetup: createWorkoutSetup({ meetDayEnabled: true }), skipMeetProjectionSimulation: true };
const withoutMeet = { ...options, workoutSetup: createWorkoutSetup({ meetDayEnabled: false }) };

test('new profiles default off, legacy profiles keep their meet and explicit off survives restore', () => {
  expect(createWorkoutSetup().meetDayEnabled).toBe(false);
  expect(normalizeWorkoutSetup(undefined).meetDayEnabled).toBe(true);
  expect(normalizeWorkoutSetup({ version: 1 }).meetDayEnabled).toBe(true);
  expect(normalizeWorkoutSetup(JSON.parse(JSON.stringify(withoutMeet.workoutSetup))).meetDayEnabled).toBe(false);
});

test.each(['beginner', 'intermediate', 'advanced', 'elite'])('%s repeats the regular period with the second-period prescription', athleteLevel => {
  for (const trainingApproach of ['powerlifting', 'powerbuilding']) {
    for (const trainingFocus of ['standard', 'practical', 'beginnerSquat']) {
      const plan = generateWorkoutsForTrainingModel('smart', { ...withoutMeet, athleteLevel, trainingFocus,
        workoutSetup: createWorkoutSetup({ meetDayEnabled: false, trainingApproach }) });
      const period = athleteLevel === 'beginner' ? 6 : 7;
      expect(plan).toHaveLength(4 * period);
      expect(plan.some(w => w.type === 'meet' || w.smartIdealRoute?.stage === 'taper')).toBe(false);
      for (let i = 0; i < period; i++) {
        const fourth = plan[3 * period + i];
        expect(fourth.type).toBe(plan[i].type);
        expect(fourth.smartIdealRoute.phase).toBe('transitionWeek');
        expect(fourth.lifts.map(b => b.lift)).toEqual(plan[i].lifts.map(b => b.lift));
        fourth.lifts.forEach((block, j) => {
          const prescription = sets => sets.map(({ labelKey, reps, prescribedPct, weight, pct }) => ({
            labelKey, reps, prescribedPct, weight, pct,
          }));
          expect(prescription(block.sets)).toEqual(prescription(plan[period + i].lifts[j].sets));
        });
      }
      expect(plan.at(-1).smartIdealRoute.endsCycle).toBe(true);
    }
  }
});

test('transition week retains the week-two heavy topset floor with 2.5 kg increments', () => {
  const plan = generateWorkoutsForTrainingModel('smart', {
    ...withoutMeet, squat: 50, bench: 50, deadlift: 50,
  });
  const topSet = weekIndex => plan[weekIndex * 7].lifts[0].sets[0];

  expect(topSet(1)).toMatchObject({ weight: 50, pct: 1 });
  expect(topSet(3)).toMatchObject({
    weight: topSet(1).weight,
    pct: topSet(1).pct,
  });
});

const legacyTaper = { type: 'training', number: 27, cycleClosingTaper: true,
  smartIdealRoute: { workoutNumber: 27, stage: 'taper' },
  lifts: [{ lift: 'Bench', sets: [{ reps: 5, weight: 60, done: true }] }] };

test('a legacy completed taper plus one rest still closes the cycle', () => {
  const taper = legacyTaper;
  const snapshot = { ...taper, completed: true, workoutEffort: 'good' };
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
  const taper = legacyTaper;
  expect(mergeGeneratedWorkoutStructure([taper], [withMeet[index]], [], 1)[0]).toBe(taper);
  const completed = { ...withMeet[index], completed: true };
  expect(mergeGeneratedWorkoutStructure([completed], [result[index]], [], 1)[0]).toBe(completed);
});

test('four-week planning crosses the cycle boundary without a meet, and Calendar keeps the replacement day', () => {
  const initial = generateWorkoutsForTrainingModel('smart', withoutMeet);
  const closingDay = initial.find(workout => workout.smartIdealRoute?.endsCycle);
  const forecast = projectSmartPlanningHorizon({ ...withoutMeet, currentIndex: closingDay.number,
    history: [{ cycle: 1, workoutNumber: closingDay.number, workoutSnapshot: { ...closingDay, completed: true, workoutEffort: 'good' } }] }, 28);
  expect(forecast.length).toBeGreaterThanOrEqual(28);
  expect(forecast.some(entry => entry.cycle === 2)).toBe(true);
  expect(forecast.some(entry => entry.workout.type === 'meet')).toBe(false);
  const closing = { cycle: 1, workout: initial.filter(w => w.smartIdealRoute?.phase === 'transitionWeek' && w.type === 'training').at(-1) };
  const events = buildTimelineCalendarEventSpecs({ timeline: [{ ...closing, dateKey: '2026-12-01' }],
    today: '2026-11-19', titleTemplate: 'C{cycle}W{workout} Kelani' });
  expect(forecast[0]).toMatchObject({ cycle: 2, workout: { number: 1 } });
  expect(events).toHaveLength(1);
  expect(events[0].title).toBe(`C1W${closing.workout.number} Kelani`);
});
