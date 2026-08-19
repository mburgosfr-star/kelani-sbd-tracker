# Verify an official Kelani release

Kelani is intentionally offline-first and does not use an account or online activation service. Official releases can instead be identified by their repository, Android package identity, checksum and signing certificate.

## Official project identity

- Official repository: `https://github.com/mburgosfr-star/kelani-sbd-tracker`
- Current Android package: `com.kelani.sbdtracker`
- Official GitHub releases: `https://github.com/mburgosfr-star/kelani-sbd-tracker/releases`
- Official IzzyOnDroid package: `https://apt.izzysoft.de/packages/com.kelani.sbdtracker`

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

Every GitHub release contains exactly two assets:

- `kelani-sbd-tracker-vX.Y.Z.apk`
- `kelani-sbd-tracker-vX.Y.Z.apk.sha256`

Calculate the APK hash locally, for example:

```bash
sha256sum kelani-sbd-tracker-vX.Y.Z.apk
```

Compare the resulting SHA-256 value with the value in the matching `.apk.sha256` release asset.

A matching checksum proves that the downloaded APK is byte-for-byte identical to the APK published in that GitHub release. The signing-certificate check independently confirms the Kelani 2.x signing identity.

## Build provenance attestation

Every official GitHub release is additionally attested with a [GitHub build provenance attestation](https://docs.github.com/en/actions/security-guides/using-artifact-attestations-to-establish-provenance-for-builds). This cryptographically binds the published APK to this repository, the `attest-release` GitHub Actions workflow, and the exact commit it ran at - independently of the checksum and signing-certificate checks above.

With the GitHub CLI installed:

```bash
gh attestation verify kelani-sbd-tracker-vX.Y.Z.apk --repo mburgosfr-star/kelani-sbd-tracker
```

A successful verification confirms the APK was published by this repository's release workflow and has not been altered or re-uploaded elsewhere. This check is additional to, not a replacement for, the checksum and signing-certificate checks above.

## Distribution integrity

The repository also runs an automated distribution-integrity check that compares the public GitHub and IzzyOnDroid APKs for the current release. It checks their SHA-256 hash, Android package/version metadata and signing certificate.

If a download is presented as Kelani but points somewhere other than the official channels above, verify it before installing it. When in doubt, use the latest release directly from this repository or IzzyOnDroid.
