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


const { getSnapAppId, createWindowActivator, createPortalNotificationClass, startPortalActivation } = require('./snap-notifications.cjs');
const { PassThrough } = require('node:stream');

test('Snap notification identity is confined to separator-free Linux Snap packages', () => {
  assert.equal(getSnapAppId('linux', {}), null);
  assert.equal(getSnapAppId('win32', { SNAP: '/test' }), null);
  assert.equal(getSnapAppId('linux', { SNAP: '/snap/test/current', SNAP_NAME: 'example' }), 'snap.example');
  for (const name of ['test-name', 'test_instance', '../test', '', undefined]) {
    assert.throws(() => getSnapAppId('linux', { SNAP: '/test', SNAP_NAME: name }));
  }
});

test('Snap click consumes one token through native handoff on Electron without the newer API', () => {
  const calls = [], errors = [];
  const child = new EventEmitter();
  const activate = createWindowActivator({ app: {}, execPath: '/example/app', env: { EXAMPLE: 'kept' },
    spawn: (...args) => { calls.push(args); return child; },
    revealWindow: () => assert.fail('Reveal must wait for second-instance'), onError: error => errors.push(error) });
  activate('fictional-token');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ['--kelani-activate-existing']);
  assert.equal(calls[0][2].shell, false);
  assert.equal(calls[0][2].stdio, 'ignore');
  assert.equal(calls[0][2].env.XDG_ACTIVATION_TOKEN, 'fictional-token');
  assert.equal(calls[0][2].env.EXAMPLE, 'kept');
  assert.equal(JSON.stringify(calls[0][1]).includes('fictional-token'), false);
  child.emit('error', new Error('sensitive subprocess details'));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.includes('sensitive'), false);
  for (const token of ['', null, 'x'.repeat(4097)]) assert.throws(() => activate(token));
  assert.equal(calls.length, 1);
});

test('a supported direct token API receives the token before exactly one window reveal', () => {
  const calls = [];
  createWindowActivator({ app: { setActivationToken: token => calls.push(token) },
    revealWindow: () => calls.push('show'), spawn: () => assert.fail('No helper needed') })('fictional');
  assert.deepEqual(calls, ['fictional', 'show']);
});

test('Snap reveals once while ordinary DEB and Windows retain restore/show/focus', () => {
  const vm = require('node:vm');
  const source = require('node:fs').readFileSync(path.join(__dirname, 'main.cjs'), 'utf8');
  const start = source.indexOf('function revealWindow() {');
  const end = source.indexOf('function showNotification', start);
  for (const snapAppId of [null, 'snap.example']) {
    const calls = [];
    vm.runInNewContext(source.slice(start, end) + '\nrevealWindow();', { snapAppId, window: {
      isDestroyed: () => false, isMinimized: () => true,
      restore: () => calls.push('restore'), show: () => calls.push('show'), focus: () => calls.push('focus'),
    } });
    assert.deepEqual(calls, snapAppId ? ['show'] : ['restore', 'show', 'focus']);
  }
});

test('portal acceptance is separate from one click and rejected/cancelled notifications cannot activate', () => {
  const commands = [];
  const Notification = createPortalNotificationClass(() => ({ isReady: () => true, send: v => commands.push(v) }));
  const n = new Notification({ title: 'Example', body: 'Fictional' });
  let accepted = 0, clicked = 0;
  n.on('show', () => accepted++); n.on('click', () => clicked++);
  n.show();
  assert.equal(accepted, 0);
  Notification.dispatch({ event: 'accepted', id: n.id });
  assert.equal(accepted, 1);
  Notification.dispatch({ event: 'activate', id: n.id });
  assert.equal(clicked, 1);
  assert.equal(Notification.dispatch({ event: 'activate', id: n.id }), false);
  for (const rejected of [true, false]) {
    const old = new Notification({ title: 'Old', body: '' });
    let failed = 0;
    old.on('failed', () => failed++);
    old.show();
    if (rejected) { Notification.dispatch({ event: 'error', id: old.id }); assert.equal(failed, 1); }
    else { old.close(); assert.deepEqual(commands.at(-1), { event: 'close', id: old.id }); }
    assert.equal(Notification.dispatch({ event: 'activate', id: old.id }), false);
  }
});

function portalFixture() {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
  child.kill = () => child.emit('exit', null, 'SIGTERM');
  const errors = [], tokens = [], spawned = [];
  let timeOut, stopped = 0;
  const Notification = createPortalNotificationClass(() => transport);
  const transport = startPortalActivation({
    spawn: (...args) => { spawned.push(args); return child; }, snapRoot: '/snap/example/current',
    appId: 'snap.example', helperPath: '/unpacked/portal-notifications.py', iconPath: '/icon.png', env: {},
    activateWithToken: token => tokens.push(token), onNotification: value => Notification.dispatch(value),
    onError: error => errors.push(error), onStopped: () => { stopped++; Notification.failAll(); },
    setTimeout: fn => { timeOut = fn; return 1; }, clearTimeout: () => {},
  });
  return { child, errors, tokens, spawned, Notification, transport, timeout: () => timeOut(), stopped: () => stopped };
}

test('portal startup, stale clicks, invalid tokens and stream failure never falsely report success', async () => {
  const f = portalFixture();
  const result = f.transport.ready.catch(error => error);
  assert.equal(f.Notification.isSupported(), false);
  f.child.stdout.write('{"event":"ready"}\n');
  await result;
  assert.equal(f.Notification.isSupported(), true);
  const n = new f.Notification({ title: 'Example', body: 'Fictional' });
  n.show();
  f.child.stdout.write(JSON.stringify({ event: 'activate', id: 'stale', token: 'fictional' }) + '\n');
  f.child.stdout.write(JSON.stringify({ event: 'activate', id: n.id, token: null }) + '\n');
  assert.deepEqual(f.tokens, []);
  f.child.stdout.write(JSON.stringify({ event: 'activate', id: n.id, token: 'fictional' }) + '\n');
  assert.deepEqual(f.tokens, ['fictional']);
  f.child.stdout.write('sensitive-invalid-json\n');
  assert.equal(f.errors.some(error => error.message.includes('sensitive')), false);
  f.child.emit('exit', 1);
  assert.equal(f.Notification.isSupported(), false);
  assert.throws(() => f.transport.send({ event: 'show' }));
  assert.equal(f.stopped(), 1);
});

test('portal startup timeout rejects readiness and cannot silently enable notifications', async () => {
  const f = portalFixture();
  const rejection = assert.rejects(f.transport.ready, /timed out/);
  f.timeout();
  await rejection;
  assert.equal(f.Notification.isSupported(), false);
  assert.equal(f.tokens.length, 0);
  f.child.stdout.write('{"event":"ready"}\n');
  assert.equal(f.Notification.isSupported(), false);
});

test('Snap notifier uses exactly one packaged sound and never the host player', () => {
  let sound;
  class Notification extends EventEmitter { static isSupported() { return true; } show() {} close() {} }
  const child = new EventEmitter(); child.kill = () => {};
  const notifier = createDesktopNotifier({ Notification, platform: 'linux', icon: '/icon.png', soundPath: '/sound.wav',
    audioPlayerPath: '/snap/example/current/bin/paplay', spawn: (...args) => { sound = args; return child; }, onError: assert.fail });
  notifier.show({ title: 'Example', body: 'Fictional' }, () => {});
  assert.equal(sound[0], '/snap/example/current/bin/paplay');
  assert.equal(sound[2].shell, false);
});
