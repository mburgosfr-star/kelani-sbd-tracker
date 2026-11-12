const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { TOOL, ORIGINS, verifyArchive, downloadArchive, setupDesktopValidator } = require('./ensure-desktop-validator.cjs');

function fixture(t, overrides = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'validator-test-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const payload = Buffer.from('test archive');
  const spec = { ...TOOL, bytes: payload.length, sha256: createHash('sha256').update(payload).digest('hex') };
  const calls = [];
  const options = { parent, spec, log: () => {},
    download: (url, file) => { calls.push(url); fs.writeFileSync(file, payload); },
    execute: (command, args) => {
      calls.push([command, args]);
      if (command === 'dpkg-deb' && args[0] === '-f') return { Package: spec.package, Version: spec.version, Architecture: spec.architecture }[args[2]];
      if (args[0]?.endsWith('invalid.desktop')) throw new Error('invalid desktop entry');
      return '';
    }, ...overrides };
  return { parent, payload, calls, options };
}

test('uses approved HTTPS origin, checks package identity and runs both validator probes', t => {
  const { calls, options } = fixture(t);
  const result = setupDesktopValidator(options);
  assert.equal(calls.filter(c => Array.isArray(c) && c[0] === result.validator).length, 2);
  assert.equal(calls[0], `${ORIGINS[0]}/${TOOL.file}`);
  assert(calls.some(c => Array.isArray(c) && c[1][0] === '--extract'));
});
test('a network failure tries the second official source without an apt index update', t => {
  const f = fixture(t); let attempts = 0;
  const result = setupDesktopValidator({ ...f.options, download: (url, file) => {
    attempts += 1;
    if (attempts === 1) { fs.writeFileSync(file, 'partial'); throw new Error('DNS failure'); }
    assert.equal(url, `${ORIGINS[1]}/${TOOL.file}`);
    fs.writeFileSync(file, f.payload);
  } });
  assert.equal(attempts, 2);
  assert(fs.existsSync(result.directory));
});
test('both unreachable sources fail closed and clean temporary files', t => {
  const f = fixture(t); let attempts = 0;
  assert.throws(() => setupDesktopValidator({ ...f.options, download: () => { attempts += 1; throw new Error('timeout'); } }), /validation remains blocked/);
  assert.equal(attempts, 2);
  assert.deepEqual(fs.readdirSync(f.parent), []);
  assert.equal(f.calls.length, 0);
});
test('a corrupt same-size archive is never extracted, executed or retried', t => {
  const f = fixture(t); let attempts = 0;
  assert.throws(() => setupDesktopValidator({ ...f.options, download: (url, file) => {
    attempts += 1; fs.writeFileSync(file, Buffer.alloc(f.payload.length));
  } }), /SHA-256/);
  assert.equal(attempts, 1);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(fs.readdirSync(f.parent), []);
});
test('package identity mismatch fails before extraction', t => {
  const f = fixture(t);
  assert.throws(() => setupDesktopValidator({ ...f.options, execute: () => 'wrong-package' }), /Unexpected/);
  assert.deepEqual(fs.readdirSync(f.parent), []);
});
test('missing runtime dependency or non-working validator cannot pass', t => {
  const f = fixture(t);
  assert.throws(() => setupDesktopValidator({ ...f.options, execute: (command, args, opts) => {
    if (command !== 'dpkg-deb') throw new Error('missing GLib');
    return f.options.execute(command, args, opts);
  } }), /missing GLib/);
  assert.deepEqual(fs.readdirSync(f.parent), []);
});
test('a validator that accepts invalid entries cannot pass', t => {
  const f = fixture(t);
  assert.throws(() => setupDesktopValidator({ ...f.options, execute: (command, args, opts) => command === 'dpkg-deb' ? f.options.execute(command, args, opts) : '' }), /did not reject/);
});
test('the production artifact pin rejects an unrelated archive', t => {
  const f = fixture(t); const file = path.join(f.parent, 'wrong.deb'); fs.writeFileSync(file, f.payload);
  assert.throws(() => verifyArchive(file), /SHA-256/);
});

test('real download transport enforces HTTPS, bounded time and a size limit', () => {
  downloadArchive(`${ORIGINS[0]}/${TOOL.file}`, '/tmp/example.deb', (command, args, options) => {
    assert.equal(command, 'curl');
    for (const [flag, value] of [['--proto', '=https'], ['--proto-redir', '=https'],
      ['--connect-timeout', '10'], ['--max-time', '30'], ['--max-filesize', String(TOOL.bytes)]]) {
      assert.equal(args[args.indexOf(flag) + 1], value);
    }
    assert.equal(options.timeout, 35000);
  });
});
