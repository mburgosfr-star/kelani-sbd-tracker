import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import intermediateHistory from './intermediateDeloadFrequencyHistory.json';

// C3W34->W35 regression boundary: 2 failed Deadlift sets on W34 correctly
// triggering a deload for C3W35). The deload deliberately picked Deadlift
// as its target (the lift that actually failed) - but Deadlift was already
// at its rolling-window frequency cap and would have been trained on
// consecutive days, so the generic frequency-supplemented path silently
// swapped it for Squat at FULL intensity (not deloaded), with a broken
// (non-multiple-of-4) grid and an oversized warmup jump. The invariant is:
// if the deload's own target lift can't be scheduled, give
// rest instead of an unrelated full-intensity substitute.
test.each(['off', 'standard'])('falls back to rest when a deload target is frequency-blocked, even with accessories %s', accessoryMode => {
  const workouts = generateWorkoutsForTrainingModel('smart', {
    programProfile: 'kelaniSbdUltra',
    squat: 145,
    bench: 101.33333333333333,
    deadlift: 180,
    accessoryMode,
    preparationMode: 'off',
    cooldownMode: 'off',
    squatVariant: 'standard',
    benchPressVariant: 'standard',
    deadliftVariant: 'standard',
    history: intermediateHistory,
    currentIndex: 34,
    currentCycle: 3,
  });

  const w35 = workouts.find(w => Number(w.number) === 35);

  expect(w35.type).toBe('rest');
  expect(w35.smartDayType).toBe('recovery');
  expect(w35.lifts || []).toHaveLength(0);
  expect(w35.accessories || []).toEqual([]);
  expect(w35.smartDecisionSummary?.dayType).toBe('recovery');
  // Regression: buildSmartRecoveryWorkout resets smartVisible/smartSelectable
  // to false internally (every other caller re-derives them from an outer
  // index <= visibleThroughIndex wrapper) - this fallback must re-set them
  // itself, or the Programma screen silently drops today's workout.
  expect(w35.smartVisible).toBe(true);
  expect(w35.smartSelectable).toBe(true);
});
