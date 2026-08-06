const fs = require('fs');
const source = 'scripts/kelani-smart-always-good-qa-browser.js';
const target = '/tmp/kelani-always-fail-cycle-sim.js';

if (!fs.existsSync(source)) {
  console.error(`${source} not found.`);
  process.exit(1);
}

let code = fs.readFileSync(source, 'utf8');

code = code
  .replaceAll('always-good', 'always-fail')
  .replaceAll('Always good', 'Always fail')
  .replaceAll('always good', 'always fail')
  .replaceAll("workoutEffort: 'good'", "workoutEffort: 'tooMuch'")
  .replaceAll("setEffort: 'good'", "setEffort: 'max'")
  .replaceAll("effort: 'good'", "effort: 'tooMuch'")
  .replaceAll("workoutEffort: \"good\"", "workoutEffort: \"tooMuch\"")
  .replaceAll("setEffort: \"good\"", "setEffort: \"max\"")
  .replaceAll("effort: \"good\"", "effort: \"tooMuch\"")
  .replaceAll("failed: false, skipped: false", "failed: true, skipped: false")
  .replaceAll("failed: false,", "failed: true,");

// Fail route should never reach meet. Use a long enough window to catch leaks.
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
