function createDesktopNotifier({ Notification, platform, icon, soundPath, spawn, onError }) {
  let active = null;
  let audio = null;

  function close() {
    active?.close();
    active = null;
    if (audio) {
      audio.kill();
      audio = null;
    }
  }

  function show(value, onClick) {
    if (!Notification.isSupported()) throw new Error('Notifications unavailable');
    close();
    const notification = new Notification({
      title: value.title, body: value.body, icon,
      // Linux has no Electron sound-name option. One main-process sound owns
      // audio; the OS banner and renderer must not add a second sound.
      silent: platform === 'linux',
    });
    active = notification;
    notification.on('click', onClick);
    notification.on('failed', (_event, error) => onError(new Error(`Desktop notification failed: ${error}`)));
    notification.show();
    if (platform === 'linux') {
      const child = spawn('/usr/bin/paplay', [
        '--client-name=Kelani SBD Tracker', `--stream-name=${value.title}`,
        '--property=media.role=event', soundPath,
      ], { shell: false, stdio: 'ignore' });
      audio = child;
      child.once('error', onError);
      child.once('exit', (code, signal) => {
        if (audio === child) audio = null;
        if (code !== 0 && !signal) onError(new Error(`Desktop timer sound failed (${code})`));
      });
    }
    return notification;
  }

  return { show, close };
}

module.exports = { createDesktopNotifier };
