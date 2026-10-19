const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createDesktopNotifier } = require('./notifications.cjs');
const { isAppUrl, resolveAssetPath, isAllowedExternalUrl, writeVerifiedBackup, createTimerController } = require('./runtime.cjs');

test('packaged assets cannot escape the application root or load foreign origins', () => {
  const root = path.resolve('fixture-build');
  assert.equal(resolveAssetPath(root, 'kelani://app/index.html'), path.join(root, 'index.html'));
  assert.equal(resolveAssetPath(root, 'kelani://app/assets/app.js'), path.join(root, 'assets/app.js'));
  for (const url of ['https://app/index.html', 'kelani://evil/index.html', 'kelani://app/%2e%2e%2fsecret', 'kelani://app/%5c..%5csecret', 'kelani://app/%00', 'kelani://app/%XX']) {
    assert.equal(resolveAssetPath(root, url), null, url);
  }
  assert.equal(isAppUrl('kelani://app.evil/index.html'), false);
  assert.equal(isAppUrl('kelani://user@app/index.html'), false);
});

test('external links never launch files, commands or lookalike hosts', () => {
  assert.equal(isAllowedExternalUrl('https://github.com/sponsors/mburgosfr-star?amount=5'), true);
  assert.equal(isAllowedExternalUrl('mailto:mburgosfr@gmail.com?subject=Feedback'), true);
  for (const url of ['file:///test.exe', 'javascript:alert(1)', 'https://github.com.evil/a', 'https://github.com@evil/a', 'http://github.com', 'mailto:other@example.test']) {
    assert.equal(isAllowedExternalUrl(url), false, url);
  }
});

test('verified backup replacement keeps the previous valid copy and rejects malformed data', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kelani-desktop-test-'));
  try {
    const filename = path.join(root, 'Backups', 'automatic.json');
    const backup = n => JSON.stringify({ backupVersion: 1, storageKey: 'kel-powerlifting-user-data-v1', exportedAt: '2026-01-01', data: { history: [{ workoutNumber: n }] } });
    await writeVerifiedBackup(filename, backup(1), { keepPrevious: true });
    const result = await writeVerifiedBackup(filename, backup(2), { keepPrevious: true });
    assert.equal(result.data, backup(2));
    assert.equal(await fs.readFile(filename + '.previous', 'utf8'), backup(1));
    await assert.rejects(writeVerifiedBackup(filename, '{bad json'));
    await assert.rejects(writeVerifiedBackup(filename, JSON.stringify({ backupVersion: 1, data: {} })));
    assert.equal(await fs.readFile(filename, 'utf8'), backup(2));
    await assert.rejects(fs.stat(filename + '.tmp'), { code: 'ENOENT' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('timer replacement, cancellation and resume never deliver old or duplicate notifications', () => {
  let time = 1000;
  const callbacks = new Map();
  const delivered = [];
  let persisted;
  let id = 0;
  const timer = createTimerController({ now: () => time, setTimeout: fn => { callbacks.set(++id, fn); return id; }, clearTimeout: key => callbacks.delete(key), save: value => { persisted = value; }, notify: value => delivered.push(value) });
  timer.schedule({ id: 7, at: 2000, title: 'First', body: 'Test' });
  timer.schedule({ id: 7, at: 3000, title: 'Second', body: 'Test' });
  assert.equal(callbacks.size, 1);
  time = 4000; // Simulate resuming after the deadline.
  timer.resume();
  timer.resume();
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].title, 'Second');
  assert.equal(persisted, null);
  timer.schedule({ id: 7, at: 5000, title: 'Canceled', body: 'Test' });
  timer.cancel();
  time = 6000;
  timer.resume();
  assert.equal(delivered.length, 1);
  assert.equal(callbacks.size, 0);
  assert.equal(timer.getPending().pending, false);
});

test('invalid timer input cannot replace a valid pending timer', () => {
  const timer = createTimerController({ now: () => 1000, setTimeout: () => 1, clearTimeout: () => {}, save: () => {}, notify: () => {} });
  timer.schedule({ id: 7, at: 3000, title: 'Valid', body: 'Test' });
  assert.throws(() => timer.schedule({ id: 7, at: Infinity, title: 'Invalid', body: 'Test' }));
  assert.equal(timer.getPending().at, 3000);
});

function notificationFixture(platform) {
  const notifications = [];
  const sounds = [];
  const errors = [];
  class Notification extends EventEmitter {
    static isSupported() { return true; }
    constructor(options) { super(); this.options = options; notifications.push(this); }
    show() { this.emit('show'); }
    close() { this.closed = true; }
  }
  const notifier = createDesktopNotifier({
    Notification, platform, icon: 'kelani.png', soundPath: '/packaged/rest-timer.wav',
    spawn(command, args, options) {
      const child = new EventEmitter();
      child.kill = () => { child.killed = true; child.emit('exit', null, 'SIGTERM'); };
      sounds.push({ command, args, options, child });
      return child;
    },
    onError: error => errors.push(error),
  });
  return { notifier, notifications, sounds, errors };
}

test('Linux timer delivery has exactly one audio owner even when notification show repeats', () => {
  const { notifier, notifications, sounds } = notificationFixture('linux');
  let clicked = false;
  notifier.show({ title: 'Timer', body: 'Ready' }, () => { clicked = true; });
  notifications[0].emit('show');
  assert.equal(notifications[0].options.silent, true);
  assert.equal(sounds.length, 1);
  assert.equal(sounds[0].command, '/usr/bin/paplay');
  assert.equal(sounds[0].args.at(-1), '/packaged/rest-timer.wav');
  assert.equal(sounds[0].options.shell, false);
  notifications[0].emit('click');
  assert.equal(clicked, true);
  notifier.close();
  assert.equal(sounds[0].child.killed, true);
  assert.equal(notifications[0].closed, true);
});

test('Windows leaves audio to its OS notification and never starts the Linux player', () => {
  const { notifier, notifications, sounds } = notificationFixture('win32');
  notifier.show({ title: 'Timer', body: 'Ready' }, () => {});
  assert.equal(notifications[0].options.silent, false);
  assert.equal(sounds.length, 0);
});

test('Linux sound errors are reported without triggering duplicate fallback audio', () => {
  const { notifier, sounds, errors } = notificationFixture('linux');
  notifier.show({ title: 'Timer', body: 'Ready' }, () => {});
  sounds[0].child.emit('error', new Error('Audio unavailable'));
  sounds[0].child.emit('exit', 1, null);
  assert.equal(errors.length, 2);
  assert.equal(sounds.length, 1);
});
