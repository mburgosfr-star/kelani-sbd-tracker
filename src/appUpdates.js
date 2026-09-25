export const GITHUB_LATEST_RELEASE_API_URL =
  'https://api.github.com/repos/mburgosfr-star/kelani-sbd-tracker/releases/latest';

export const GITHUB_RELEASES_URL =
  'https://github.com/mburgosfr-star/kelani-sbd-tracker/releases/latest';

export const IZZY_ON_DROID_URL =
  'https://apt.izzysoft.de/packages/com.kelani.sbdtracker';

export const UPDATE_CHECK_CACHE_KEY = 'kelani-update-check-cache-v1';
export const UPDATE_DISMISSED_VERSION_KEY = 'kelani-update-dismissed-version';
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function normalizeReleaseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number).join('.') : null;
}

export function compareReleaseVersions(left, right) {
  const normalizedLeft = normalizeReleaseVersion(left);
  const normalizedRight = normalizeReleaseVersion(right);

  if (!normalizedLeft || !normalizedRight) return null;

  const leftParts = normalizedLeft.split('.').map(Number);
  const rightParts = normalizedRight.split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }

  return 0;
}

export function isNewerReleaseVersion(latestVersion, currentVersion) {
  return compareReleaseVersions(latestVersion, currentVersion) === 1;
}

export function shouldShowUpdateNotice({
  latestVersion,
  currentVersion,
  dismissedVersion = null,
  enabled = true,
} = {}) {
  return Boolean(
    enabled &&
    isNewerReleaseVersion(latestVersion, currentVersion) &&
    normalizeReleaseVersion(dismissedVersion) !== normalizeReleaseVersion(latestVersion)
  );
}

export function readUpdateCheckCache(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(UPDATE_CHECK_CACHE_KEY) || 'null');
    const latestVersion = normalizeReleaseVersion(value?.latestVersion);
    const checkedAt = Number(value?.checkedAt);

    if (!latestVersion || !Number.isFinite(checkedAt) || checkedAt <= 0) return null;
    return { latestVersion, checkedAt };
  } catch (error) {
    return null;
  }
}

export function isFreshUpdateCheck(cache, now = Date.now()) {
  return Boolean(
    cache &&
    Number.isFinite(cache.checkedAt) &&
    cache.checkedAt <= now &&
    now - cache.checkedAt < UPDATE_CHECK_INTERVAL_MS
  );
}

export async function fetchLatestReleaseVersion({
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  const controller = new AbortController();
  const timeoutId = timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(GITHUB_LATEST_RELEASE_API_URL, {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response?.ok) {
      throw new Error(`Update check failed with status ${response?.status || 'unknown'}.`);
    }

    const payload = await response.json();
    const latestVersion = normalizeReleaseVersion(payload?.tag_name);

    if (!latestVersion || payload?.draft === true || payload?.prerelease === true) {
      throw new Error('Latest public release metadata is invalid.');
    }

    return latestVersion;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}
