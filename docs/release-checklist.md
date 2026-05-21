# Release checklist

Before releasing:
- Build signed APK locally: `npm run android:release-apk`
- Test Izzy-style build without local signing properties: `npm run android:izzy-test`
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
