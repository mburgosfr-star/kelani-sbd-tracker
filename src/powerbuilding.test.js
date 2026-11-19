import { getSmartIdealRouteWorkout, buildAdjustedSmartIdealRoutePlan } from './smartIdealRoute';
import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import { createWorkoutSetup, normalizeWorkoutSetup } from './workoutSetup';
import { isTopSetLabel } from './workoutHistoryStats';
import { mergeGeneratedWorkoutStructure } from './workoutStateMerge';

const levels = ['beginner', 'intermediate', 'advanced', 'elite'];
const focuses = ['standard', 'practical', 'beginnerSquat'];
const base = { squat: 160, bench: 100, deadlift: 200, athleteLevel: 'elite', currentCycle: 1,
  currentIndex: 0, history: [], idealRouteEnabled: true, skipMeetProjectionSimulation: true,
  workoutSetup: createWorkoutSetup({ trainingApproach: 'powerbuilding' }) };

test('legacy defaults and persistence retain the chosen approach', () => {
  expect(normalizeWorkoutSetup({}).trainingApproach).toBe('powerlifting');
  expect(normalizeWorkoutSetup(JSON.parse(JSON.stringify(base.workoutSetup))).trainingApproach).toBe('powerbuilding');
});

test.each(levels)('%s keeps route days, frequency, phase percentages and taper in every focus', athleteLevel => {
  for (const trainingFocus of focuses) {
    for (let phase = 0; phase < 3; phase++) {
      const seen = { Squat: [], Bench: [], Deadlift: [] };
      for (let day = 1; day <= 7; day++) {
        const opts = { athleteLevel, trainingFocus, workoutNumber: phase * 7 + day };
        const current = getSmartIdealRouteWorkout(opts);
        const pb = getSmartIdealRouteWorkout({ ...opts, trainingApproach: 'powerbuilding' });
        expect(pb.type).toBe(current.type);
        expect(pb.lifts.map(x => x.lift)).toEqual(current.lifts.map(x => x.lift));
        for (const block of pb.lifts) {
          const { topSet, backoff } = block.prescription;
          seen[block.lift].push(topSet.reps);
          expect(backoff.reps).toBe(topSet.reps * 2);
          expect(topSet.pct).toBeCloseTo((95 - topSet.reps * 5 + phase * 5) / 100);
          expect(backoff.pct).toBeCloseTo((90 - topSet.reps * 5 - phase * 5) / 100);
        }
      }
      for (const reps of Object.values(seen)) expect(reps.sort((a,b) => a-b)).toEqual(Array.from({length: reps.length}, (_,i)=>i+1));
    }
    for (let workoutNumber = 22; workoutNumber <= 28; workoutNumber++) {
      const opts = { athleteLevel, trainingFocus, workoutNumber };
      expect(getSmartIdealRouteWorkout({ ...opts, trainingApproach: 'powerbuilding' })).toEqual(getSmartIdealRouteWorkout(opts));
    }
    const plan = buildAdjustedSmartIdealRoutePlan({ athleteLevel, trainingFocus, trainingApproach: 'powerbuilding' });
    expect(plan.workouts.find(x => x.type === 'training').trainingApproach).toBe('powerbuilding');
  }
});

test('generated prescriptions retain high reps, valid grids, labels and lower warmups', () => {
  const workouts = generateWorkoutsForTrainingModel('smart', base);
  const regular = workouts.filter(x => x.type === 'training' && x.smartIdealRoute?.stage === 'normal');
  expect(regular.length).toBeGreaterThan(0);
  expect(regular.flatMap(w => w.lifts.flatMap(b => b.sets)).some(s => s.reps === 12)).toBe(true);
  for (const workout of regular) for (const block of workout.lifts) {
    expect(isTopSetLabel(block.sets[0].labelKey)).toBe(true);
    const backoffs = block.sets.slice(1);
    expect(backoffs.length).toBeGreaterThanOrEqual(3);
    expect(backoffs.length).toBeLessThanOrEqual(7);
    expect(backoffs.every(s => s.reps === block.sets[0].reps * 2 && s.labelKey === 'backoff')).toBe(true);
    expect((block.warmups.length + block.sets.length) % 5).toBe(0);
    expect(block.warmups.every(s => s.weight < block.sets[0].weight)).toBe(true);
    expect(block.sets.every(s => Number.isInteger(s.weight * 2))).toBe(true);
  }
});

test('switching approach preserves a started session in generation and merge', () => {
  const options = { ...base, workoutSetup: createWorkoutSetup() };
  const original = generateWorkoutsForTrainingModel('smart', options)[0];
  original.lifts[0].sets[0].done = true;
  const next = generateWorkoutsForTrainingModel('smart', { ...base, inProgressWorkout: original });
  expect(next[0]).toEqual(original);
  expect(mergeGeneratedWorkoutStructure([original], generateWorkoutsForTrainingModel('smart', base), [], 1)[0]).toBe(original);
});
