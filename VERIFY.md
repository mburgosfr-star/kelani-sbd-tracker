# Verify an official Kelani release

Kelani is intentionally offline-first and does not use an account or online activation service. Official releases can instead be identified by their repository, Android package identity, checksum and signing certificate.

## Official project identity

- Official repository: `https://github.com/mburgosfr-star/kelani-sbd-tracker`
- Current Android package: `com.kelani.sbdtracker`
- Official GitHub releases: `https://github.com/mburgosfr-star/kelani-sbd-tracker/releases`
- Official IzzyOnDroid package: `https://apt.izzysoft.de/packages/com.kelani.sbdtracker`
- Official Android download on itch.io: `https://kelburgos.itch.io/kelani-sbd-tracker-android`
- Official Ubuntu test download on itch.io: `https://kelburgos.itch.io/kelani-sbd-tracker-ubuntu`

A site, repository or binary using the Kelani name is not an official Kelani distribution merely because it uses the same name or is based on the open-source code.

## Android signing certificate

Official Kelani 2.x APKs are signed with the release certificate whose SHA-256 certificate digest is:

```text
15d23f2e5ee95ebc2a530b48be6f27dad7a568f722bc819f4571b3470a2ff39d
```

The release tooling in this repository rejects an APK whose signer certificate does not match this value.

To inspect an APK with Android SDK Build Tools installed:

```bash
apksigner verify --verbose --print-certs kelani-sbd-tracker-vX.Y.Z.apk
```

Compare the reported `Signer #1 certificate SHA-256 digest` with the value above. A different digest means the APK is not signed as an official Kelani 2.x release.

## APK checksum

Every Android GitHub release contains exactly two assets:

- `kelani-sbd-tracker-vX.Y.Z.apk`
- `kelani-sbd-tracker-vX.Y.Z.apk.sha256`

Calculate the APK hash locally, for example:

```bash
sha256sum kelani-sbd-tracker-vX.Y.Z.apk
```

Compare the resulting SHA-256 value with the value in the matching `.apk.sha256` release asset.

The Android itch.io page distributes unchanged copies of published GitHub APKs
and their checksum files. Compare the version and APK hash with the matching
GitHub release as well as the downloaded checksum. Published checksum files
may reference the original `release/` directory; the command above works when
the APK is in your current directory. Downloads and updates from itch.io are
manual, and its listed version may differ from the latest GitHub release.

A matching checksum proves that the downloaded APK is byte-for-byte identical to the APK published in that GitHub release. The signing-certificate check independently confirms the Kelani 2.x signing identity.

## Build provenance attestation

Every official Android GitHub release is additionally attested with a [GitHub build provenance attestation](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds). This cryptographically binds the published APK to this repository, the `attest-release` GitHub Actions workflow, and the exact commit it ran at - independently of the checksum and signing-certificate checks above.

With the GitHub CLI installed:

```bash
gh attestation verify kelani-sbd-tracker-vX.Y.Z.apk --repo mburgosfr-star/kelani-sbd-tracker
```

A successful verification confirms the APK's bytes match this repository's attested release workflow output. An unchanged copy can also pass verification after redistribution through another download channel. This check is additional to, not a replacement for, the checksum and signing-certificate checks above.

## Distribution integrity

The repository also runs an automated distribution-integrity check that compares the public GitHub and IzzyOnDroid APKs for the current release. It checks their SHA-256 hash, Android package/version metadata and signing certificate.

If a download is presented as Kelani but points somewhere other than the official channels above, verify it before installing it. When in doubt, use the latest release directly from this repository or IzzyOnDroid.

## Windows prototype

The experimental Windows ZIP is separate from the Android APK release process.
It is not signed with the Android release certificate and is not a stable Store
release. Build it from source using the [prototype guide](docs/windows-prototype.md).
Do not disable Windows security protections if a prototype is blocked.

## Ubuntu Prototype

The [Ubuntu prototype](docs/ubuntu-prototype.md) is a separate local DEB test
package. It installs a dedicated AppArmor profile for its fixed application
path so Electron can use its sandbox. It does not disable global security
settings and is not a stable app-store release.
Its accompanying `.deb.sha256` file verifies download integrity, not a digital
publisher signature. Obtain both files from this official repository or the
official [itch.io page](https://kelburgos.itch.io/kelani-sbd-tracker-ubuntu).
For an itch.io download, compare its package version and DEB SHA-256 with the
matching Ubuntu prerelease published in this repository. Checking only the
downloaded checksum file does not independently establish the publisher's
identity. See the Ubuntu guide for verification and updates.

Ubuntu test releases use tags beginning with `ubuntu-v` and are marked as
prereleases. They do not replace Android's stable **Latest** release or its
existing assets. The Ubuntu publication gate requires an exact source commit,
successful CI, package inspection, a matching user-tested desktop application,
and a clean independent build with identical application bytes.
