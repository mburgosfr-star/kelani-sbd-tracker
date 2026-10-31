const { app, BrowserWindow, protocol, net, ipcMain, shell, dialog, Notification, powerMonitor, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createDesktopNotifier } = require('./notifications.cjs');
const { getSnapAppId, createWindowActivator, createPortalNotificationClass, startPortalActivation } = require('./snap-notifications.cjs');
const snapAppId = getSnapAppId(process.platform, process.env);
const { pathToFileURL } = require('node:url');
const { APP_ORIGIN, isAppUrl, resolveAssetPath, isAllowedExternalUrl, writeVerifiedBackup, normalizeTimer, createTimerController } = require('./runtime.cjs');

app.setName('Kelani SBD Tracker Desktop Prototype');
// Keep the prototype separate from both Android and any later desktop release.
const userData = path.join(app.getPath('appData'), 'Kelani SBD Tracker Desktop Prototype');
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
const appUserModelId = 'com.kelani.sbdtracker.desktop.prototype';
if (process.platform === 'win32') app.setAppUserModelId(appUserModelId);
if (process.platform === 'linux') app.setDesktopName(snapAppId ? `${snapAppId}.desktop` : 'kelani-desktop-prototype.desktop');
protocol.registerSchemesAsPrivileged([{ scheme: 'kelani', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let window;
let portalActivation;
const PortalNotification = createPortalNotificationClass(() => portalActivation);
const DesktopNotification = snapAppId ? PortalNotification : Notification;
let backupQueue = Promise.resolve();
const statePath = path.join(app.getPath('userData'), 'rest-timer.json');
const backupPath = path.join(app.getPath('userData'), 'Backups', 'kelani-sbd-tracker-v2-autosave.json');
const assetRoot = path.join(__dirname, '..', 'build');
const notifier = createDesktopNotifier({
  Notification: DesktopNotification, platform: process.platform, spawn,
  audioPlayerPath: snapAppId ? path.join(process.env.SNAP, 'bin/paplay') : '/usr/bin/paplay',
  icon: path.join(assetRoot, 'kelani-icon.png'),
  soundPath: app.isPackaged
    ? path.join(process.resourcesPath, 'rest-timer.wav')
    : path.join(__dirname, 'assets', 'rest-timer.wav'),
  onError: error => console.error('Desktop alert failed:', error),
});

function revealWindow() {
  if (!window || window.isDestroyed()) return;
  if (snapAppId) {
    // A single show consumes the portal token once, without a second GNOME alert.
    window.show();
  } else {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }
}

function showNotification(value, timer = false) {
  notifier.show(value, () => {
    if (!snapAppId) revealWindow();
    if (timer) window?.webContents.send('kelani:timer-click', { id: value.id });
  });
}

const timer = createTimerController({
  save(value) {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporary = statePath + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temporary, statePath);
  },
  notify(value) {
    try { showNotification(value, true); }
    catch (error) { console.error('Could not display desktop timer notification:', error); }
  },
});

function handle(channel, callback) {
  ipcMain.handle(channel, (event, value) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !isAppUrl(event.senderFrame.url)) {
      throw new Error('Untrusted sender');
    }
    return callback(value);
  });
}

function openExternal(value) {
  if (isAllowedExternalUrl(value)) shell.openExternal(value).catch(error => console.error('Could not open external link:', error));
}

const activationOnly = process.argv.includes('--kelani-activate-existing');
const hasInstanceLock = app.requestSingleInstanceLock();
if (activationOnly) {
  // An activation helper must never replace a closed app with a new window.
  if (hasInstanceLock) app.releaseSingleInstanceLock();
  app.exit(hasInstanceLock ? 2 : 0);
} else if (!hasInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', revealWindow);
  app.whenReady().then(async () => {
    if (snapAppId) {
      const helperPath = path.join(__dirname, 'portal-notifications.py').replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
      const activateWithToken = createWindowActivator({ app, spawn, execPath: process.execPath,
        env: process.env, revealWindow, onError: error => console.error('Desktop activation failed:', error.message) });
      portalActivation = startPortalActivation({ spawn, snapRoot: process.env.SNAP, appId: snapAppId,
        helperPath, iconPath: path.join(process.resourcesPath, 'kelani-icon.png'), env: process.env,
        activateWithToken, onNotification: value => PortalNotification.dispatch(value),
        onStopped: () => PortalNotification.failAll(),
        onError: error => console.error('Desktop notification portal failed:', error.message) });
      // A broken notification service must not prevent offline training.
      await portalActivation.ready.catch(() => {});
    }
    // Unpackaged Windows toasts require a shortcut with matching identity.
    if (process.platform === 'win32' && app.isPackaged) {
      const programs = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
      fs.mkdirSync(programs, { recursive: true });
      const written = shell.writeShortcutLink(path.join(programs, 'Kelani SBD Tracker Prototype.lnk'), 'create', {
        target: process.execPath, cwd: path.dirname(process.execPath),
        appUserModelId, toastActivatorClsid: '9a716b0c-8b32-4e7d-b67d-3d324b20a420',
      });
      if (!written) console.error('Could not create the desktop notification shortcut');
    }
    protocol.handle('kelani', request => {
      const target = resolveAssetPath(assetRoot, request.url);
      if (!target || request.method !== 'GET') return new Response('', { status: 403 });
      return net.fetch(pathToFileURL(target).href).then(response => {
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.github.com; object-src 'none'; frame-src 'none'; base-uri 'none'");
        return new Response(response.body, { status: response.status, headers });
      });
    });

    window = new BrowserWindow({
      width: 460, height: 960, minWidth: 360, minHeight: 640,
      backgroundColor: '#000000', icon: path.join(assetRoot, 'kelani-icon.png'),
      title: 'Kelani SBD Tracker',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, backgroundThrottling: false },
    });
    Menu.setApplicationMenu(null);
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
    window.webContents.on('will-navigate', (event, url) => { if (!isAppUrl(url)) { event.preventDefault(); openExternal(url); } });
    window.webContents.on('will-attach-webview', event => event.preventDefault());

    handle('kelani:backup', json => {
      const next = backupQueue.catch(() => {}).then(() => writeVerifiedBackup(backupPath, json, { keepPrevious: true }));
      backupQueue = next;
      return next;
    });
    handle('kelani:export', async value => {
      if (!value || typeof value.filename !== 'string' || typeof value.title !== 'string') throw new Error('Invalid export request');
      const result = await dialog.showSaveDialog(window, { title: value.title.slice(0, 160), defaultPath: path.join(app.getPath('documents'), path.basename(value.filename)), filters: [{ name: 'JSON', extensions: ['json'] }] });
      if (result.canceled || !result.filePath) return { saved: false };
      await writeVerifiedBackup(result.filePath, value.json);
      return { saved: true };
    });
    handle('kelani:timer-schedule', value => {
      if (!DesktopNotification.isSupported()) throw new Error('Notifications unavailable');
      return timer.schedule(value);
    });
    handle('kelani:timer-cancel', () => { timer.cancel(); notifier.close(); });
    handle('kelani:timer-pending', () => timer.getPending());
    handle('kelani:notification-test', value => {
      const request = normalizeTimer({ ...value, id: 0, at: Date.now() });
      if (!request) throw new Error('Invalid notification');
      showNotification(request);
      return { sent: true };
    });
    powerMonitor.on('resume', () => {
      try { timer.resume(); } catch (error) { console.error('Could not resume desktop timer:', error); }
    });
    window.on('closed', () => { window = null; });
    await window.loadURL(APP_ORIGIN + '/index.html');
    try {
      const pending = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (normalizeTimer(pending)) timer.schedule(pending);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Could not restore desktop timer:', error);
    }
  }).catch(error => { console.error('Desktop startup failed:', error); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    notifier.close();
    portalActivation?.stop();
    if (window && !window.isDestroyed()) window.webContents.session.flushStorageData();
  });
}
