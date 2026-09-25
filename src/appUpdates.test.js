import {
  GITHUB_LATEST_RELEASE_API_URL,
  compareReleaseVersions,
  fetchLatestReleaseVersion,
  isFreshUpdateCheck,
  isNewerReleaseVersion,
  normalizeReleaseVersion,
  readUpdateCheckCache,
  shouldShowUpdateNotice,
} from './appUpdates';

describe('app update checks', () => {
  test('normalizes and compares stable release versions', () => {
    expect(normalizeReleaseVersion('v2.0.41')).toBe('2.0.41');
    expect(normalizeReleaseVersion('2.1.0')).toBe('2.1.0');
    expect(normalizeReleaseVersion('2.0.41-beta')).toBeNull();
    expect(compareReleaseVersions('2.1.0', '2.0.99')).toBe(1);
    expect(compareReleaseVersions('2.0.41', '2.0.41')).toBe(0);
    expect(isNewerReleaseVersion('2.0.42', '2.0.41')).toBe(true);
    expect(isNewerReleaseVersion('2.0.40', '2.0.41')).toBe(false);
    expect(shouldShowUpdateNotice({
      latestVersion: '2.0.42',
      currentVersion: '2.0.41',
      dismissedVersion: '2.0.41',
    })).toBe(true);
    expect(shouldShowUpdateNotice({
      latestVersion: '2.0.42',
      currentVersion: '2.0.41',
      dismissedVersion: '2.0.42',
    })).toBe(false);
  });

  test('accepts only a valid cached check within 24 hours', () => {
    const now = Date.UTC(2026, 8, 25, 12);
    const storage = {
      getItem: () => JSON.stringify({
        latestVersion: 'v2.0.42',
        checkedAt: now - 1000,
      }),
    };

    const cache = readUpdateCheckCache(storage);
    expect(cache).toEqual({ latestVersion: '2.0.42', checkedAt: now - 1000 });
    expect(isFreshUpdateCheck(cache, now)).toBe(true);
    expect(isFreshUpdateCheck({ ...cache, checkedAt: now - 24 * 60 * 60 * 1000 }, now))
      .toBe(false);
  });

  test('reads only final public GitHub release metadata', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v2.0.42', draft: false, prerelease: false }),
    });

    await expect(fetchLatestReleaseVersion({ fetchImpl, timeoutMs: 0 }))
      .resolves.toBe('2.0.42');
    expect(fetchImpl).toHaveBeenCalledWith(
      GITHUB_LATEST_RELEASE_API_URL,
      expect.objectContaining({ cache: 'no-store' })
    );

    fetchImpl.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tag_name: 'v2.0.43', draft: false, prerelease: true }),
    });
    await expect(fetchLatestReleaseVersion({ fetchImpl, timeoutMs: 0 }))
      .rejects.toThrow('invalid');
  });
});
