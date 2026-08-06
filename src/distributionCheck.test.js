const {
  parseArguments,
  expectedGithubAssets,
  assertIzzyPage,
  assertSameMetadata,
} = require('../scripts/check-distribution');

const repository = 'mburgosfr-star/kelani-sbd-tracker';

test('uses the transitional legacy release only for the current local v2.0.0', () => {
  expect(parseArguments([], { localVersion: '2.0.0' })).toEqual({
    version: '2.0.0',
    githubRepository: 'mburgosfr-star/kelani-sbd-tracker-legacy-compromised',
  });
});

test('current and explicit future releases default to the trusted repository', () => {
  expect(parseArguments([], { localVersion: '2.0.1' })).toEqual({
    version: '2.0.1',
    githubRepository: repository,
  });
  expect(parseArguments(
    ['--version', '2.0.1'],
    { localVersion: '2.0.0' }
  )).toEqual({
    version: '2.0.1',
    githubRepository: repository,
  });
});

test('requires exactly the expected immutable GitHub release assets', () => {
  const apk = {
    name: 'kelani-sbd-tracker-v2.0.1.apk',
    browser_download_url: 'https://example.test/app.apk',
  };
  const checksum = {
    name: 'kelani-sbd-tracker-v2.0.1.apk.sha256',
    browser_download_url: 'https://example.test/app.apk.sha256',
  };

  expect(expectedGithubAssets({ assets: [apk, checksum] }, '2.0.1')).toEqual({
    apk,
    checksum,
  });
  expect(() => expectedGithubAssets({ assets: [apk] }, '2.0.1')).toThrow();
  expect(() => expectedGithubAssets({ assets: [apk, checksum, { name: 'extra' }] }, '2.0.1')).toThrow();
});

test('requires Izzy version, package and links to the trusted repository', () => {
  const html = [
    '<tr><td><b>AppID:</b></td><td>com.kelani.sbdtracker</td></tr>',
    '<h4>Version 2.0.1 (2026-08-07)</h4>',
    `<a href='https://github.com/${repository}'>Source</a>`,
    `<a href='https://github.com/${repository}/issues'>Issues</a>`,
    `<a href='https://github.com/${repository}/releases'>ChangeLog</a>`,
    "<a href='/fdroid/repo/com.kelani.sbdtracker_101.apk'>Download</a>",
  ].join('\n');

  expect(assertIzzyPage(html, '2.0.1', repository)).toBe(
    'https://apt.izzysoft.de/fdroid/repo/com.kelani.sbdtracker_101.apk'
  );
  expect(() => assertIzzyPage(html, '2.0.2', repository)).toThrow();
  expect(() => assertIzzyPage(html, '2.0.1', 'attacker/repository')).toThrow();
});

test('requires matching package, versionName and versionCode in both APKs', () => {
  const metadata = {
    name: 'com.kelani.sbdtracker',
    versionName: '2.0.1',
    versionCode: '101',
  };

  expect(() => assertSameMetadata(metadata, metadata, '2.0.1')).not.toThrow();
  expect(() => assertSameMetadata(
    metadata,
    { ...metadata, versionCode: '102' },
    '2.0.1'
  )).toThrow();
  expect(() => assertSameMetadata(
    metadata,
    { ...metadata, name: 'com.kel.powerlifting' },
    '2.0.1'
  )).toThrow();
});
