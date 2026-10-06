#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const repository = 'mburgosfr-star/kelani-sbd-tracker';

function readResult(result, label) {
  if (result.error || result.signal || result.status === null) {
    throw new Error(`${label} could not complete. Check connectivity and access, then retry.`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} returned no valid report. Check connectivity and access, then retry.`);
  }
}

function checkDependencySecurity({ dependabot = false, execute = spawnSync } = {}) {
  const options = { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 10 * 1024 * 1024, shell: false };
  const audit = execute('npm', [
    'audit', '--json', '--package-lock-only',
    '--include=dev', '--include=optional', '--include=peer',
  ], options);
  const report = readResult(audit, 'npm security audit');
  const total = report.metadata?.vulnerabilities?.total;
  if (report.error || !Number.isInteger(total) || total < 0 || !report.vulnerabilities || typeof report.vulnerabilities !== 'object' || Array.isArray(report.vulnerabilities)) {
    throw new Error('npm security audit returned an incomplete report. Release preparation is blocked.');
  }
  if (total > 0 || Object.keys(report.vulnerabilities).length > 0) {
    throw new Error(`npm security audit found vulnerable dependencies: ${Object.keys(report.vulnerabilities).join(', ') || total}. Resolve them before release preparation.`);
  }
  if (audit.status !== 0) {
    throw new Error('npm security audit failed. Release preparation is blocked.');
  }

  if (dependabot) {
    const response = execute('gh', [
      'api', `repos/${repository}/dependabot/alerts?state=open&per_page=100`,
      '--paginate', '--jq', 'length',
    ], options);
    const counts = String(response.stdout || '').trim().split(/\s+/);
    if (response.error || response.signal || response.status !== 0 || counts.some(count => !/^\d+$/.test(count) || !Number.isSafeInteger(Number(count)))) {
      throw new Error('GitHub Dependabot alerts could not be verified. Check GitHub access and connectivity. Release preparation is blocked.');
    }
    const count = counts.reduce((total, value) => total + Number(value), 0);
    if (count > 0) {
      throw new Error(`${count} open Dependabot alert(s) block release preparation.`);
    }
  }
}

if (require.main === module) {
  try {
    checkDependencySecurity({ dependabot: process.argv.includes('--dependabot') });
    console.log('Dependency security audit passed (including development dependencies).');
    if (process.argv.includes('--dependabot')) console.log('No open Dependabot alerts.');
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { checkDependencySecurity };
