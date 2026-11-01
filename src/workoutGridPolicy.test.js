import { completeWorkoutVolumeGrid, reduceVolumeReps } from './workoutGridPolicy';
import { generateWorkoutsForTrainingModel } from './smartTrainingEngine';
import { mergeGeneratedWorkoutStructure } from './workoutStateMerge';

const options = { squat: 155, bench: 102.5, deadlift: 180, accessoryMode: 'off',
  preparationMode: 'off', currentCycle: 1, currentIndex: 0 };

test('the universal rep conversion is limited to volume repetitions 4–6', () => {
  expect([1,2,3,4,5,6,8,12].map(reduceVolumeReps)).toEqual([1,2,3,3,4,5,8,12]);
});

test('every warmup/top combination fits five columns with 2–6 volume sets without changing loads', () => {
  for (let warmupCount=0; warmupCount<=8; warmupCount++) {
    for (let topCount=0; topCount<=1; topCount++) {
      for (let oldCount=1; oldCount<=8; oldCount++) {
        const tops=Array.from({length:topCount},()=>({labelKey:'topSingle',reps:1,weight:140}));
        const volume=Array.from({length:oldCount},()=>({labelKey:'backoff',reps:3,weight:132.5,pct:.85}));
        const sets=[...tops,...volume];
        const completed=completeWorkoutVolumeGrid({sets,warmups:Array(warmupCount).fill({})});
        expect((warmupCount+completed.length)%5).toBe(0);
        expect(completed.length-topCount).toBeGreaterThanOrEqual(2);
        expect(completed.length-topCount).toBeLessThanOrEqual(6);
        expect(completed.slice(0,topCount)).toEqual(tops);
        expect(completed.slice(topCount).every(s=>s.reps===3&&s.weight===132.5&&s.pct===.85)).toBe(true);
        expect(sets).toHaveLength(topCount+oldCount);
      }
    }
  }
});

test.each(['default','practical'])('%s route uses 2–6 sets and 3–4–5 reps at the agreed phase percentages across every level', trainingFocus => {
 for (const athleteLevel of ['beginner','intermediate','advanced','elite']) {
  const workouts=generateWorkoutsForTrainingModel('smart',{...options,athleteLevel,trainingFocus});
  for (const w of workouts.filter(w=>w.type==='training'&&w.smartIdealRoute?.stage==='normal')) {
   const phase=w.smartIdealRoute.phase;
   for (const b of w.lifts) {
    const volume=b.sets.filter(s=>['backoff','workSets'].includes(s.labelKey));
    expect(volume.length).toBeGreaterThanOrEqual(2);
    expect(volume.length).toBeLessThanOrEqual(6);
    expect((b.warmups.length+b.sets.length)%5).toBe(0);
    const role=b.smartPrescription.intensityRole;
    const i=['heavy','medium','light'].indexOf(role);
    const phaseOffset=['triple','double','single'].indexOf(phase);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(volume.every(s=>s.reps===3+i)).toBe(true);
    const expectedPct=(80-5*i-5*phaseOffset)/100;
    expect(volume.every(s=>s.originalWeight===Math.round(options[{Squat:'squat',Bench:'bench',Deadlift:'deadlift'}[b.lift]]*expectedPct/2.5)*2.5)).toBe(true);
   }
  }
 }
});

test('new prescriptions preserve completed snapshots and started workouts while replacing untouched plans', () => {
 const generated=generateWorkoutsForTrainingModel('smart',options);
 const saved=structuredClone(generated);
 saved[0].lifts[0].sets[0].done=true;
 Object.assign(saved[0].lifts[0].sets[1], {
   reps: 4, pct: .85, precisePct: .85, weight: 132.5, originalWeight: 132.5,
 });
 // An untouched plan from the earlier prescription must adopt the new load.
 Object.assign(saved[3].lifts[0].sets[1], {
   reps: 6, pct: .85, precisePct: .85, weight: 132.5, originalWeight: 132.5,
 });
 saved[1]={...saved[1],completed:true};
 const history=[{cycle:1,workoutNumber:saved[1].number,workoutSnapshot:saved[1]}];
 const merged=mergeGeneratedWorkoutStructure(saved,generated,history,1);
 expect(merged[0].lifts[0].sets).toEqual(saved[0].lifts[0].sets);
 expect(merged[1]).toEqual(saved[1]);
 expect(merged[3]).toEqual(generated[3]);
});

test.each(['kelaniSbd','kelaniSbdUltra','kelaniSbdLower','kelaniSbdLowerPlus'])('Classic %s shares the five-column volume bounds', programProfile => {
 const workouts=generateWorkoutsForTrainingModel('classic',{...options,programProfile});
 for (const w of workouts.filter(w=>w.type==='training')) {
  for (const b of w.lifts||[]) {
   const v=b.sets.filter(s=>['backoff','workSets'].includes(s.labelKey));
   if(!v.length)continue;
   expect(v.length).toBeGreaterThanOrEqual(2);
   expect(v.length).toBeLessThanOrEqual(6);
   expect(v.every(s=>s.reps<=5)).toBe(true);
   expect((b.warmups.length+b.sets.length)%5).toBe(0);
  }
 }
});

test('a three-warmup single-lift workout receives six back-offs rather than one', () => {
  const warmups = [20, 50, 70].map(weight => ({ weight, reps: 3 }));
  const top = { labelKey: 'topTriple', reps: 3, weight: 87.5, pct: 0.9 };
  const backoff = { labelKey: 'backoff', reps: 5, weight: 57.5, pct: 0.6 };
  const result = completeWorkoutVolumeGrid({ warmups, sets: [top, backoff] });
  expect(result[0]).toEqual(top);
  expect(result.filter(set => set.labelKey === 'backoff')).toHaveLength(6);
  expect(result.filter(set => set.labelKey === 'backoff').every(set => set.weight === 57.5 && set.reps === 5 && set.pct === 0.6)).toBe(true);
  expect(warmups.length + result.length).toBe(10);
  expect(completeWorkoutVolumeGrid({ warmups, sets: result })).toEqual(result);
});


test.each(['set', 'warmup'])('old one-set history and %s progress survive the 2–6 policy upgrade', progress => {
  const old = number => ({ number, type: 'training', lift: 'Bench', lifts: [{ lift: 'Bench',
    warmups: [20, 50, 70].map(weight => ({ weight, reps: 3 })),
    sets: [{ labelKey: 'topTriple', weight: 87.5, reps: 3 }, { labelKey: 'backoff', weight: 57.5, reps: 5 }],
  }] });
  const saved = [old(1), { ...old(2), completed: true }, old(3)];
  if (progress === 'set') saved[0].lifts[0].sets[0].done = true;
  else saved[0].lifts[0].warmups[0].done = true;
  const before = structuredClone(saved);
  const generated = saved.map(workout => ({ ...workout, completed: false,
    lifts: workout.lifts.map(block => ({ ...block, sets: completeWorkoutVolumeGrid(block) })),
  }));
  const merged = mergeGeneratedWorkoutStructure(saved, generated, [
    { cycle: 1, workoutNumber: 2, workoutSnapshot: saved[1] },
  ], 1);
  expect(merged[0].lifts[0].sets).toEqual(before[0].lifts[0].sets);
  expect(merged[0].lifts[0].warmups).toEqual(before[0].lifts[0].warmups);
  expect(merged[1]).toEqual(before[1]);
  expect(merged[2].lifts[0].sets.filter(set => set.labelKey === 'backoff')).toHaveLength(6);
  expect(saved).toEqual(before);
});
