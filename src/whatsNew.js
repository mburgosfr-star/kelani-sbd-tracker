export const LATEST_WHATS_NEW_VERSION = '2.0.41';

export const WHATS_NEW_LAST_SEEN_KEY = 'kelani-whats-new-last-seen-version';

export function shouldAutoShowWhatsNew({
  currentVersion,
  contentVersion = LATEST_WHATS_NEW_VERSION,
  enabled = true,
  hasExistingProfile = false,
  lastSeenVersion = null,
} = {}) {
  return Boolean(
    enabled &&
    hasExistingProfile &&
    currentVersion &&
    currentVersion !== 'dev' &&
    currentVersion === contentVersion &&
    lastSeenVersion !== currentVersion
  );
}
