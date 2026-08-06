const fs = require('fs');
const source = 'scripts/kelani-smart-always-good-qa-browser.js';
const target = '/tmp/kelani-always-max-cycle-sim.js';

if (!fs.existsSync(source)) {
  console.error(`${source} not found.`);
  process.exit(1);
}

let code = fs.readFileSync(source, 'utf8');

code = code
  .replaceAll('always-good', 'always-max')
  .replaceAll('Always good', 'Always max')
  .replaceAll('always good', 'always max')
  .replaceAll("workoutEffort: 'good'", "workoutEffort: 'max'")
  .replaceAll("setEffort: 'good'", "setEffort: 'max'")
  .replaceAll("effort: 'good'", "effort: 'max'")
  .replaceAll("workoutEffort: \"good\"", "workoutEffort: \"max\"")
  .replaceAll("setEffort: \"good\"", "setEffort: \"max\"")
  .replaceAll("effort: \"good\"", "effort: \"max\"");

// Always-max should be much slower than hard. Target is roughly W336,
// so use a wide window.
code = code
  .replace(/\bMAX_STEPS\s*=\s*80\b/g, 'MAX_STEPS = 420')
  .replace(/\bmaxSteps\s*=\s*80\b/g, 'maxSteps = 420')
  .replace(/\bstep\s*<=\s*80\b/g, 'step <= 420')
  .replace(/\bstep\s*<\s*80\b/g, 'step < 420')
  .replace(/\bi\s*<=\s*80\b/g, 'i <= 420')
  .replace(/\bi\s*<\s*80\b/g, 'i < 420')
  .replace(/\bfor\s*\(\s*let\s+step\s*=\s*1;\s*step\s*<=\s*80;/g, 'for (let step = 1; step <= 420;')
  .replace(/\bfor\s*\(\s*let\s+i\s*=\s*1;\s*i\s*<=\s*80;/g, 'for (let i = 1; i <= 420;');

fs.writeFileSync(target, code);
console.log(`created ${target}`);
