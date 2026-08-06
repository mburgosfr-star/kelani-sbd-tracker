const fs = require('fs');
const source = 'scripts/kelani-smart-always-good-qa-browser.js';
const target = '/tmp/kelani-always-hard-cycle-sim.js';

if (!fs.existsSync(source)) {
  console.error(`${source} not found.`);
  process.exit(1);
}

let code = fs.readFileSync(source, 'utf8');

code = code
  .replaceAll('always-good', 'always-hard')
  .replaceAll('Always good', 'Always hard')
  .replaceAll('always good', 'always hard')
  .replaceAll("workoutEffort: 'good'", "workoutEffort: 'hard'")
  .replaceAll("setEffort: 'good'", "setEffort: 'hard'")
  .replaceAll("workoutEffort: \"good\"", "workoutEffort: \"hard\"")
  .replaceAll("setEffort: \"good\"", "setEffort: \"hard\"");

// The good QA only needs a short window. Always-hard is expected much later,
// around W112, so extend common loop/window literals safely.
code = code
  .replace(/\bMAX_STEPS\s*=\s*80\b/g, 'MAX_STEPS = 180')
  .replace(/\bmaxSteps\s*=\s*80\b/g, 'maxSteps = 180')
  .replace(/\bstep\s*<=\s*80\b/g, 'step <= 180')
  .replace(/\bstep\s*<\s*80\b/g, 'step < 180')
  .replace(/\bi\s*<=\s*80\b/g, 'i <= 180')
  .replace(/\bi\s*<\s*80\b/g, 'i < 180')
  .replace(/\bfor\s*\(\s*let\s+step\s*=\s*1;\s*step\s*<=\s*80;/g, 'for (let step = 1; step <= 180;')
  .replace(/\bfor\s*\(\s*let\s+i\s*=\s*1;\s*i\s*<=\s*80;/g, 'for (let i = 1; i <= 180;');

fs.writeFileSync(target, code);
console.log(`created ${target}`);
