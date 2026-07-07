# Kelani SBD Tracker release checklist

Source of truth for every public release.

## Non-negotiable release rules

- Never replace an existing GitHub release APK after code changes.
- Never overwrite an existing tag or release to publish new code.
- Every public release needs:
  - higher `package.json` version
  - higher Android `versionName`
  - higher Android `versionCode`
- Run the Izzy/NeoStore preflight before creating the GitHub release.
- Do not put Izzy/NeoStore preflight details in public release notes.
- Public release notes must contain only user-facing app changes.

## Standard release order

1. Commit and push all app-code changes.
2. Bump version in:
   - `package.json`
   - `android/app/build.gradle` `versionCode`
   - `android/app/build.gradle` `versionName`
3. Run web build.
4. Run Capacitor sync.
5. Build release APK with Java 21.
6. Install APK on phone.
7. Run phone test.
8. Run Izzy/NeoStore preflight.
9. Create release assets.
10. Create GitHub release.

## Phone test minimum

Check:

- Version shown in app.
- Dashboard.
- Smart Program fewer/more.
- Program left lift rows.
- Program compact plan rows.
- Workout warm-ups.
- Recovery smart modal.
- No premature meet day.
- Settings.
- Stats.
- Export / Last backup.
- Support link.

## Izzy/NeoStore risks to prevent

Past issues to prevent:

- Release signing must remain optional. Izzy must be able to build without private signing secrets.
- Generated public web assets must be reproducible between local signed APK and clean unsigned APK.
- No unintended backup/original/broken assets may be packaged in the APK.

## Izzy/NeoStore preflight

Run from the committed release commit.

### 1. Basic checks

    cd ~/kel-powerlifting

    grep -n "\"version\"\|versionCode\|versionName" package.json android/app/build.gradle
    git status --short
    grep -RIn "signingConfig\|storePassword\|keyPassword\|storeFile" android/app/build.gradle android/app 2>/dev/null
    find public android/app/src/main/assets/public -type f | sort

    APK=$(find android/app/build/outputs/apk/release -name "*.apk" -type f | head -n 1)
    echo "$APK"
    unzip -l "$APK" | grep -Ei "original|backup|broken|scope|before-current|manifest.json|main\..*\.js|index.html|kelani-wordmark|kelani-banner"

### 2. Clean clone build

    cd ~/kel-powerlifting

    rm -rf /tmp/kelani-izzy-preflight /tmp/kelani-izzy-gradle-home
    git clone . /tmp/kelani-izzy-preflight

    cd /tmp/kelani-izzy-preflight

    npm ci
    npm run build
    npx cap sync android

    export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
    export PATH="$JAVA_HOME/bin:$PATH"

    export ANDROID_HOME=/home/kel/Android/Sdk
    export ANDROID_SDK_ROOT=/home/kel/Android/Sdk
    export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

    cd android
    ./gradlew --no-daemon -g /tmp/kelani-izzy-gradle-home assembleRelease
    cd ..

### 3. Compare local signed APK with clean unsigned APK

    cd ~/kel-powerlifting

    export ANDROID_HOME=/home/kel/Android/Sdk
    export ANDROID_SDK_ROOT=/home/kel/Android/Sdk

    LOCAL_APK=$(find android/app/build/outputs/apk/release -name "*.apk" -type f | head -n 1)
    CLEAN_APK=/tmp/kelani-izzy-preflight/android/app/build/outputs/apk/release/app-release-unsigned.apk

    rm -rf /tmp/kelani-apk-compare
    mkdir -p /tmp/kelani-apk-compare/local /tmp/kelani-apk-compare/clean

    unzip -q "$LOCAL_APK" 'assets/public/*' -d /tmp/kelani-apk-compare/local
    unzip -q "$CLEAN_APK" 'assets/public/*' -d /tmp/kelani-apk-compare/clean

    diff -qr /tmp/kelani-apk-compare/local/assets/public /tmp/kelani-apk-compare/clean/assets/public

    AAPT=$(find "$ANDROID_HOME/build-tools" -name aapt -type f | sort -V | tail -n 1)
    "$AAPT" dump badging "$LOCAL_APK" | head -n 3
    "$AAPT" dump badging "$CLEAN_APK" | head -n 3

    APKSIGNER=$(find "$ANDROID_HOME/build-tools" -name apksigner -type f | sort -V | tail -n 1)
    "$APKSIGNER" verify --verbose "$LOCAL_APK"

Required result:

- Public asset diff prints no differences.
- VersionCode and versionName match the intended release.
- Local APK verifies.
- No backup/original/broken assets exist.

## Release assets

Replace `X.Y.Z` with the release version.

    cd ~/kel-powerlifting

    rm -rf release
    mkdir -p release

    cp android/app/build/outputs/apk/release/app-release.apk release/kelani-sbd-tracker-vX.Y.Z.apk
    sha256sum release/kelani-sbd-tracker-vX.Y.Z.apk > release/kelani-sbd-tracker-vX.Y.Z.apk.sha256

## GitHub release notes

Do not mention:

- Izzy preflight
- NeoStore preflight
- clean clone build
- APK asset comparison
- internal release process

Only list user-facing app changes.
