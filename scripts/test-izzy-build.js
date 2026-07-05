#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const androidDir = path.join(root, 'android');
const pkg = require(path.join(root, 'package.json'));

const javaHome = '/usr/lib/jvm/java-21-openjdk-amd64';
const gradleHome = path.join(os.tmpdir(), 'kelani-izzy-gradle-home');

fs.rmSync(gradleHome, { recursive: true, force: true });
fs.mkdirSync(gradleHome, { recursive: true });

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${path.join(javaHome, 'bin')}:${process.env.PATH}`,
  GRADLE_USER_HOME: gradleHome,
  REACT_APP_VERSION: pkg.version,
  GENERATE_SOURCEMAP: 'false',
};

function run(command, args, options = {}) {
  console.log(`\n> ${[command, ...args].join(' ')}`);

  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    env,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run('npm', ['run', 'build']);
run('npx', ['cap', 'sync', 'android']);
run('./gradlew', ['clean', ':app:assembleRelease', '--no-daemon'], { cwd: androidDir });

console.log('\n✅ Izzy-style build test passed');
