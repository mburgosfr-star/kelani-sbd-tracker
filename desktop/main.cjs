const { app, BrowserWindow, protocol, net, ipcMain, shell, dialog, Notification, powerMonitor, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { APP_ORIGIN, isAppUrl, resolveAssetPath, isAllowedExternalUrl, writeVerifiedBackup, normalizeTimer, createTimerController } = require('./runtime.cjs');

app.setName('Kelani SBD Tracker Desktop Prototype');
// Keep the prototype separate from both Android and any later desktop release.
const userData = path.join(app.getPath('appData'), 'Kelani SBD Tracker Desktop Prototype');
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
const appUserModelId = 'com.kelani.sbdtracker.desktop.prototype';
if (process.platform === 'win32') app.setAppUserModelId(appUserModelId);
if (process.platform === 'linux') app.setDesktopName('kelani-desktop-prototype.desktop');
protocol.registerSchemesAsPrivileged([{ scheme: 'kelani', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let window;
let activeNotification;
let backupQueue = Promise.resolve();
const statePath = path.join(app.getPath('userData'), 'rest-timer.json');
const backupPath = path.join(app.getPath('userData'), 'Backups', 'kelani-sbd-tracker-v2-autosave.json');
const assetRoot = path.join(__dirname, '..', 'build');

function revealWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function showNotification(value, timer = false) {
  if (!Notification.isSupported()) throw new Error('Notifications unavailable');
  activeNotification?.close();
  activeNotification = new Notification({ title: value.title, body: value.body, icon: path.join(assetRoot, 'kelani-icon.png') });
  activeNotification.on('click', () => {
    revealWindow();
    if (timer) window?.webContents.send('kelani:timer-click', { id: value.id });
  });
  activeNotification.on('failed', (_event, error) => {
    console.error('Desktop notification failed:', error);
  });
  activeNotification.show();
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

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', revealWindow);
  app.whenReady().then(async () => {
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
      if (!Notification.isSupported()) throw new Error('Notifications unavailable');
      return timer.schedule(value);
    });
    handle('kelani:timer-cancel', () => { timer.cancel(); activeNotification?.close(); });
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
    if (window && !window.isDestroyed()) window.webContents.session.flushStorageData();
  });
}
