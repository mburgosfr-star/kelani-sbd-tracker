# Kelani project identity and branding

Kelani SBD Tracker is open-source software released under the MIT License. The MIT License permits broad use, modification and redistribution of the source code, subject to its terms.

This document is intended to keep the official Kelani project identity clear for users. It does not replace or narrow the MIT License.

## Official Kelani project

The official Kelani project is maintained by Kel at:

`https://github.com/mburgosfr-star/kelani-sbd-tracker`

The current official Android application identity is:

`com.kelani.sbdtracker`

Official public Android releases are distributed through:

- GitHub Releases from the official repository;
- IzzyOnDroid for `com.kelani.sbdtracker`.

See [VERIFY.md](VERIFY.md) for the signing-certificate fingerprint and release-verification steps.

## Third-party builds and redistributions

Third parties may exercise the rights granted by the MIT License. To avoid misleading users, modified builds, independent redistributions and derivative projects should clearly state that they are unofficial and are not maintained, endorsed or distributed by the official Kelani project unless that is actually true.

Third-party projects should not present their repository, website, binaries or version numbers as an official Kelani release channel when they are not one.

In particular, an unofficial binary should not be represented as an official Kelani APK solely because it uses Kelani source code, screenshots, descriptions, names or other project material.

## How users can identify official releases

For the Kelani 2.x Android line, users should check all of the following when authenticity matters:

1. Android package name: `com.kelani.sbdtracker`.
2. Release source: the official GitHub repository or IzzyOnDroid package listed above.
3. APK SHA-256 checksum published with the GitHub release.
4. Android signing-certificate SHA-256 fingerprint published in [VERIFY.md](VERIFY.md).
5. GitHub build provenance attestation, verifiable with `gh attestation verify`; see [VERIFY.md](VERIFY.md).

If a project or download uses the Kelani name but fails these checks, it should be treated as an independent third-party distribution unless explicitly confirmed otherwise by the official repository.
