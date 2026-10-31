const { EventEmitter } = require('node:events');
const { createInterface } = require('node:readline');
const path = require('node:path');

function getSnapAppId(platform, env) {
  if (platform !== 'linux' || !env.SNAP) return null;
  const name = env.SNAP_INSTANCE_NAME || env.SNAP_NAME;
  // Gio changes hyphens to underscores in object paths, unlike snapd's policy.
  // The package must declare this exact desktop ID and session D-Bus slot.
  if (typeof name !== 'string' || !/^[a-z][a-z0-9]*$/.test(name)) {
    throw new Error('Snap notifications require a package name without separators');
  }
  return `snap.${name}`;
}

function createWindowActivator({ app, spawn, execPath, env, revealWindow, onError }) {
  return token => {
    if (typeof token !== 'string' || !token.length || token.length > 4096) {
      throw new Error('Invalid activation token');
    }
    if (typeof app.setActivationToken === 'function') {
      app.setActivationToken(token);
      revealWindow();
      return;
    }
    // Electron 44 consumes this token through its native single-instance
    // protocol before the original process receives second-instance.
    // Keep tokens out of arguments, persistent data and diagnostics.
    const child = spawn(execPath, ['--kelani-activate-existing'], {
      shell: false, env: { ...env, XDG_ACTIVATION_TOKEN: token }, stdio: 'ignore',
    });
    child.once('error', () => onError(new Error('Activation handoff could not start')));
    child.once('exit', code => {
      if (code !== 0) onError(new Error('Activation handoff failed'));
    });
  };
}

function createPortalNotificationClass(getTransport) {
  let nextId = 0;
  const notifications = new Map();
  return class PortalNotification extends EventEmitter {
    static isSupported() { return Boolean(getTransport()?.isReady()); }
    constructor(options) { super(); this.options = options; this.id = String(++nextId); }
    show() {
      notifications.set(this.id, this);
      try {
        getTransport().send({ event: 'show', id: this.id, title: this.options.title, body: this.options.body });
      } catch (error) {
        notifications.delete(this.id);
        throw error;
      }
    }
    close() {
      const transport = getTransport();
      if (notifications.delete(this.id) && transport?.isReady()) transport.send({ event: 'close', id: this.id });
    }
    static dispatch(value) {
      const notification = notifications.get(String(value.id));
      if (!notification) return false;
      if (value.event === 'accepted') notification.emit('show');
      else if (value.event === 'error') {
        notifications.delete(notification.id);
        notification.emit('failed', {}, 'Notification transport rejected the request');
      } else if (value.event === 'activate') {
        notifications.delete(notification.id);
        notification.emit('click');
      } else return false;
      return true;
    }
    static failAll() {
      for (const notification of notifications.values()) {
        notification.emit('failed', {}, 'Notification transport stopped');
      }
      notifications.clear();
    }
  };
}

function startPortalActivation({ spawn, snapRoot, appId, helperPath, iconPath, env,
  activateWithToken, onNotification, onError, onStopped,
  setTimeout: schedule = setTimeout, clearTimeout: cancel = clearTimeout }) {
  const runtime = path.join(snapRoot, 'gnome-platform/usr');
  const child = spawn(path.join(runtime, 'bin/python3.12'), ['-B', helperPath, appId, iconPath], {
    shell: false,
    env: { ...env, GIO_USE_VFS: 'local', GNOTIFICATION_BACKEND: 'portal', PYTHONHOME: runtime,
      PYTHONPATH: path.join(runtime, 'lib/python3/dist-packages'),
      GI_TYPELIB_PATH: path.join(runtime, 'lib/x86_64-linux-gnu/girepository-1.0') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let ready = false;
  let stopped = false;
  let failed = false;
  let resolveReady;
  let rejectReady;
  const readyPromise = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  function fail(message) {
    if (stopped || failed) return;
    failed = true;
    ready = false;
    const error = new Error(message);
    rejectReady(error);
    onError(error);
    cancel(timeout);
    onStopped();
  }
  const timeout = schedule(() => {
    fail('Notification portal startup timed out');
    child.kill();
  }, 5000);
  const lines = createInterface({ input: child.stdout });
  child.once('error', () => { cancel(timeout); fail('Notification portal could not start'); });
  child.stdin.on('error', () => fail('Notification portal input failed'));
  child.stderr.on('data', () => fail('Notification portal reported a runtime error'));
  child.once('exit', () => { cancel(timeout); fail('Notification portal stopped'); });
  lines.on('line', line => {
    if (stopped || failed) return;
    try {
      if (Buffer.byteLength(line) > 32768) throw new Error();
      const value = JSON.parse(line);
      if (!value || typeof value !== 'object') throw new Error();
      if (value.event === 'ready') {
        cancel(timeout);
        ready = true;
        resolveReady();
      } else if (value.event === 'accepted' || value.event === 'error') {
        onNotification(value);
      } else if (value.event === 'activate') {
        const token = value.token;
        if (typeof token !== 'string' || !token.length || token.length > 4096) {
          onError(new Error('Notification activation arrived without a valid token'));
          return;
        }
        if (value.id !== undefined && !onNotification(value)) return;
        activateWithToken(token);
      } else throw new Error();
    } catch {
      // Never include untrusted helper output or activation tokens in logs.
      onError(new Error('Notification portal message could not be handled'));
    }
  });
  return {
    ready: readyPromise,
    isReady: () => ready && !stopped && !failed,
    send(value) {
      if (!ready || stopped || failed) throw new Error('Notification portal is unavailable');
      child.stdin.write(JSON.stringify(value) + '\n');
    },
    stop() {
      stopped = true;
      ready = false;
      cancel(timeout);
      rejectReady(new Error('Notification portal stopped'));
      lines.close();
      child.stdin.end();
      // Give Gio time to withdraw the banner and release its bus name.
      const forceStop = schedule(() => child.kill(), 1500);
      forceStop.unref?.();
      child.once('exit', () => cancel(forceStop));
    },
  };
}

module.exports = { getSnapAppId, createWindowActivator, createPortalNotificationClass, startPortalActivation };
