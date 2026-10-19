# Windows Prototype

Kelani's Windows prototype runs the existing training app as a standalone,
offline desktop program. It is an experimental test build, not a stable Windows
release or a Microsoft Store product.

## Start

1. Extract the **entire** ZIP into a folder on a Windows 10 or Windows 11 x64 PC.
2. Open `Kelani SBD Tracker Prototype.exe` from that folder. Keep the other files
   and folders alongside it.
3. Create a test profile, or import a JSON backup through Settings → Data & backups.
   Import replaces the profile in this prototype; it does not merge two histories.

On its first Windows launch, the packaged prototype creates or refreshes a
`Kelani SBD Tracker Prototype` shortcut in your user Start Menu. Windows uses
this identity for desktop notifications. If you move the extracted folder,
open the EXE from its new location to refresh that shortcut. To remove the
prototype later, delete its extracted folder and that Start Menu shortcut;
your data folder remains until you explicitly remove it.

The prototype uses its own data folder. It does not read or replace your Android
installation or browser profile. A Windows prototype profile is separate from
any later stable desktop version unless an explicit migration is provided.

This test build is not code-signed. Windows may warn about an unfamiliar program.
Verify where the ZIP came from. Do not disable Windows security protections to
run it; report a blocked launch instead.

## What to test

- Visit all five screens and resize the window, including a narrow window.
- Record sets using a disposable test profile. Close and reopen the app and check
  that progress is retained.
- Export a JSON file, then import it and check that history and unfinished work
  are retained. Keep your original backup outside the prototype.
- In Settings → Rest timer alerts, send a test notification. Windows must allow
  notifications for Kelani. A sent notification is not proof it was displayed.
- Start a rest timer and minimize the window. Check the Windows notification and
  click it to return to the Workout screen.
- Complete a test workout and check the automatic backup status. The previous
  automatic backup is retained alongside the latest file.

Keep Kelani running for timer notifications. Closing the window exits the app.
Notifications are not guaranteed during sleep or while the app is closed. On
resume, or when reopening with a saved timer, the prototype checks the deadline.
Windows notification settings can suppress its sound or display.

## Data and privacy

Training data is stored in the prototype's local Chromium profile under:

```text
%APPDATA%\Kelani SBD Tracker Desktop Prototype
```

Automatic JSON backups are written to `Backups` inside that folder. These files
are separate from browser storage, but remain on the same device. They do not
protect against loss of the device or deletion of the entire prototype data
folder. Export a separate copy for recovery.

There are no Kelani accounts, backend, automatic analytics or automatic
phone-to-PC synchronization. An exported file goes only to the location you
choose. A cloud-backed folder or a sharing application you choose may transmit
it under that provider's settings. External project and support links open in
your normal browser and are subject to those services' privacy policies.

## Current limitations

- Android calendar synchronization is not implemented for Windows.
- No automatic desktop updates, Microsoft Store purchasing or Store licensing.
- No automatic synchronization or history merging with your phone.
- Actual Windows behavior must be tested; building a package alone does not
  establish that notifications, file dialogs or recovery work on your PC.

## Build from source

Use Node.js 22 or newer, install the dependencies with `npm ci`, then run:

```sh
npm run desktop:test
npm run desktop:package:windows
```

The output is in `desktop-out/`. Windows x64 packaging is supported from Linux
as well as Windows. No installer or MSIX is produced by this prototype.
The packaging tool may download the pinned Windows Electron runtime from its
official distribution. It includes only the production web build, desktop
runtime, package metadata, license and this guide in the application archive.

For local desktop development after a production web build, run
`npm run desktop:start`. This opens a desktop window; it is not part of the
automated tests.
