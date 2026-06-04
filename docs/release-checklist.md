# Release checklist

Before releasing:
- Build signed APK locally: `npm run android:release-apk`
- Test Izzy-style build without local signing properties and with the same `REACT_APP_VERSION` as the release build: `npm run android:izzy-test`
- Install and smoke-test the APK on phone
- Check version shown in Settings
- Confirm `package.json`, `android/app/build.gradle`, APK filename and tag version match

After releasing:
- Create GitHub release with APK
- Add Fastlane changelog
- Push all commits and tags
- Check GitHub issue notifications
- Watch for IzzyOnDroid / Neo Store build comments
- Verify Neo Store visibility after sync

## Reproducible build notes

- Local release builds inject `REACT_APP_VERSION` from `package.json`.
- Izzy-style builds must use the same version environment, otherwise React generates different `main.*.js` hashes.
- Release signing must stay optional so builds without local keystore secrets still work.
- If IzzyOnDroid reports an RB failure, read the full issue thread before replying or patching.
