# Ubuntu Desktop Prototype

This is the same experimental desktop app as the Windows prototype, packaged
for Ubuntu 24.04 or newer on an amd64 (x86-64) computer. It lets you test the
shared screens, training logic, local data, JSON backup/restore and notifications
without switching to Windows. It does not prove Windows-specific behavior.

## Install and Open

Open `Kelani-Ubuntu-Prototype-amd64.deb` with your Ubuntu software installer and
install it. Installing a local package requires your normal administrator
authorization. Then open **Kelani SBD Tracker Prototype** from the applications
menu. No development server or terminal is needed to use the installed app.

On GNOME, pinning the app to the dock can hide it from the applications grid.
It remains installed and can be opened from the dock or application search.
Unpin it if you prefer to see it in the grid.

For an update, close Kelani and install the newer DEB over the existing app.
Do not uninstall or delete its data folder. Some Ubuntu App Center versions
show an installed local package without offering an update. In that case,
open a terminal in the download folder and run:

```sh
sudo apt install ./Kelani-Ubuntu-Prototype-amd64.deb
```

The package manager asks for administrator authorization and preserves the
desktop profile. Package revisions, such as `2.0.59~prototype.4`, distinguish
desktop fixes without changing the Android app version. There is no automatic
update service. Keep an independent JSON backup before updating.

The package installs the app in `/opt/kelani-desktop-prototype`, an application
menu entry, an icon and a dedicated AppArmor profile. The profile allows user
namespaces for this fixed application path so that Electron can run its sandbox
on current Ubuntu. It does not turn off AppArmor or change system-wide namespace
settings. The package does not install a setuid sandbox helper. Never launch
with `--no-sandbox` or disable system security if a launch is blocked; report
the message instead.

## Test

Start with a disposable profile. Check the five screens, window resizing,
unfinished sets after a restart, JSON export/import and a timer while the
window is minimized. Send a test notification through Settings → Rest timer
alerts. Your Ubuntu notification settings can suppress its sound or display.

Each timer alert plays one short sound from the desktop process, including
when the window is minimized. The Ubuntu banner is silent, and the in-app
ready message adds no second sound. Sound uses the normal system audio output
and volume; muted output remains silent. The DEB installs `paplay` through
Ubuntu's `pulseaudio-utils` package for sound playback.

Keep the app running for timer notifications. Closing its window quits it.
Notifications during sleep are not guaranteed; the deadline is checked on
resume. Windows notification registration and Microsoft Store packaging still
need a separate Windows test later.

## Data

The prototype uses its own local data folder. On a default Ubuntu installation:

```text
~/.config/Kelani SBD Tracker Desktop Prototype
```

Automatic JSON backups and the previous copy are in its `Backups` folder.
Manual exports can be saved to a folder you choose. These are separate from
your Android installation and browser profile. Import replaces the desktop
prototype profile; it does not merge histories or synchronize with your phone.
Keep an independent exported copy for recovery.

Android calendar synchronization, automatic desktop updates and Store purchases
are not implemented. The app has no Kelani account, backend or automatic
analytics. Choosing a cloud-backed export folder may let that provider sync
the exported file.

## Feedback and Support

Report problems through the repository's GitHub Issues. Include the Ubuntu and
package versions and steps to reproduce the problem. Do not attach personal
training backups to a public issue.

If Kelani helps your training, you can optionally
[support development ($5 once)](https://github.com/sponsors/mburgosfr-star/sponsorships?amount=5&frequency=one-time).
Support is not required to use the app.

## Remove

Remove `kelani-desktop-prototype` through your package manager. Its program,
menu entry and AppArmor profile are removed. Your personal prototype data is
left intact; removal does not delete training records or backups.

## Build from Source

After `npm ci`, run `npm run desktop:package:ubuntu` on Ubuntu. This downloads
the pinned official Linux Electron runtime when it is not cached, creates the
desktop package, checks its executable/archive and builds the DEB using
`dpkg-deb`. Building does not install the package or load the AppArmor profile.
The package checks also require `desktop-file-validate` from Ubuntu's
`desktop-file-utils` package.
The final DEB is inspected for its menu entry, real Kelani icon, runtime files,
ownership, permissions and checksum. The same check runs in GitHub CI.

The output folder also contains a `.deb.sha256` file. Verify a downloaded
package before installation, from the folder containing both files:

```sh
sha256sum --check Kelani-Ubuntu-Prototype-amd64.deb.sha256
```
