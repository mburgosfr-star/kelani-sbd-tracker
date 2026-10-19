export function getDesktopBridge() {
  const bridge = typeof window !== 'undefined' ? window.kelaniDesktop : null;
  return bridge?.platform === 'desktop' ? bridge : null;
}

export function isDesktopRuntime() {
  return Boolean(getDesktopBridge());
}

export const DESKTOP_AUTOMATIC_BACKUP_PATH = 'Backups/kelani-sbd-tracker-v2-autosave.json';
