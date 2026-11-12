import { vi } from 'vitest';
import { initialUpdateChannel, resolveUpdateChannel, fetchChannelReleaseVersion } from './updateChannel';

const native = vi.hoisted(() => ({ platform: 'android', getChannel: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => native.platform },
  registerPlugin: () => ({ getChannel: native.getChannel }),
}));

beforeEach(() => {
  native.platform = 'android';
  native.getChannel.mockReset();
  window.history.replaceState({}, '', '/');
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

test('Android starts pending and reads the current installation instead of a saved preference', async () => {
  expect(initialUpdateChannel()).toBe('pending');
  native.getChannel.mockResolvedValue({ channel: 'play' });
  await expect(resolveUpdateChannel()).resolves.toBe('play');
  native.getChannel.mockResolvedValue({ channel: 'direct' });
  await expect(resolveUpdateChannel()).resolves.toBe('direct');
});

test('web keeps direct downloads, with no native source lookup', async () => {
  native.platform = 'web';
  expect(initialUpdateChannel()).toBe('direct');
  await expect(resolveUpdateChannel()).resolves.toBe('direct');
  expect(native.getChannel).not.toHaveBeenCalled();
});

test('lookup failure, malformed replies and timeout never authorize a GitHub fallback', async () => {
  native.getChannel.mockRejectedValue(new Error('unavailable'));
  await expect(resolveUpdateChannel()).rejects.toThrow('unavailable');
  native.getChannel.mockResolvedValue({ channel: 'unexpected' });
  await expect(resolveUpdateChannel()).rejects.toThrow('Unrecognized');
  vi.useFakeTimers();
  native.getChannel.mockReturnValue(new Promise(() => {}));
  const timeoutCheck = expect(resolveUpdateChannel()).rejects.toThrow('timed out');
  await vi.advanceTimersByTimeAsync(3000);
  await timeoutCheck;
});

test('Play, pending and unknown channels never query GitHub; direct users retain checks', async () => {
  const fetchVersion = vi.fn().mockResolvedValue('3.0.0');
  for (const channel of ['play', 'pending', 'unknown', undefined]) {
    await expect(fetchChannelReleaseVersion(channel, fetchVersion)).resolves.toBeNull();
  }
  expect(fetchVersion).not.toHaveBeenCalled();
  await expect(fetchChannelReleaseVersion('direct', fetchVersion)).resolves.toBe('3.0.0');
  expect(fetchVersion).toHaveBeenCalledTimes(1);
});

test('local preview cannot override native or production installation detection', async () => {
  window.history.replaceState({}, '', '/?previewUpdateChannel=direct');
  native.getChannel.mockResolvedValue({ channel: 'play' });
  expect(initialUpdateChannel()).toBe('pending');
  await expect(resolveUpdateChannel()).resolves.toBe('play');
  native.platform = 'web';
  window.history.replaceState({}, '', '/?previewUpdateChannel=play');
  vi.stubEnv('DEV', true);
  expect(initialUpdateChannel()).toBe('play');
  await expect(resolveUpdateChannel()).resolves.toBe('play');
  vi.stubEnv('DEV', false);
  expect(initialUpdateChannel()).toBe('direct');
  await expect(resolveUpdateChannel()).resolves.toBe('direct');
});
