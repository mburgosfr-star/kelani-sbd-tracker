# itch.io Release Downloads

The Android and Ubuntu itch.io pages mirror already-published GitHub release
assets. They do not build, sign or publish new GitHub releases. Android
installation and Ubuntu package upgrades remain manual on the user's device.

The `Sync published releases to itch.io` GitHub Actions workflow runs after
publication. Stable Android releases go to
`kelburgos/kelani-sbd-tracker-android`; separate Ubuntu prototype prereleases
go to `kelburgos/kelani-sbd-tracker-ubuntu`. Each project has one package
channel and a separate `checksums` channel. Each channel carries one original
file, so direct website downloads are not wrapped in a ZIP.

The workflow checks release type, filenames, sizes, GitHub asset SHA-256
digests and checksum contents. Android uploads also require the published
APK's GitHub provenance attestation. Older releases cannot roll back the
current download. It then checks the public itch.io channel versions.
The original GitHub assets and release tags are never modified.

## Configuration

An owner must authorize the official itch.io Butler client and store its
Wharf token as the encrypted Actions secret `BUTLER_API_KEY`. Never put the
token in source files, command arguments, issues or logs. Authorization and
secret setup are one-time configuration. Revoke and replace the token if
access is removed or the token is compromised.

The workflow pins Butler 15.32.0 and verifies the official Linux archive's
SHA-256 before running it. Review upstream changes and update the checksum
together when upgrading the tool.

After enabling the workflow, run it once from `main` with the latest existing
Android tag and once with the latest Ubuntu prototype tag. The workflow's
manual dispatch only accepts already-published releases and cannot create
GitHub tags or releases.

The project descriptions, cover images and installation guides should avoid
hard-coded current versions. Download channels display their own versions;
link to GitHub release information for details. Existing manually uploaded
files can be hidden once the managed channels have been verified. Leave
pricing and payment settings unchanged when updating downloads.

If an upload fails, the GitHub release stays published. Inspect the failed
workflow and rerun synchronization for the latest applicable release. Package
and checksum uploads are separate operations; do not call synchronization
complete until both public channel versions match.

References: [Butler uploads](https://itch.io/docs/butler/pushing.html),
[single-file downloads](https://itch.io/docs/butler/single-files.html),
[authentication](https://itch.io/docs/butler/login.html).
