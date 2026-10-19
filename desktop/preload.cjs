const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kelaniDesktop', {
  platform: 'desktop',
  writeBackup: json => ipcRenderer.invoke('kelani:backup', json),
  exportBackup: request => ipcRenderer.invoke('kelani:export', request),
  scheduleTimer: request => ipcRenderer.invoke('kelani:timer-schedule', request),
  cancelTimer: () => ipcRenderer.invoke('kelani:timer-cancel'),
  getPendingTimer: () => ipcRenderer.invoke('kelani:timer-pending'),
  testNotification: request => ipcRenderer.invoke('kelani:notification-test', request),
  onTimerClick: callback => {
    const listener = (_event, request) => callback(request);
    ipcRenderer.on('kelani:timer-click', listener);
    return () => ipcRenderer.removeListener('kelani:timer-click', listener);
  },
});
