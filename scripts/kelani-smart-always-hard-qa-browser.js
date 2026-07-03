const fs = require('fs');
const path = '/tmp/kelani-always-hard-cycle-sim.js';

if (!fs.existsSync(path)) {
  console.error(`${path} not found. Recreate it from the always-good sim first.`);
  process.exit(1);
}

require(path);
