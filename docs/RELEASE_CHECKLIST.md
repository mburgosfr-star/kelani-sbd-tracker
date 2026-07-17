# Kelani SBD Tracker release checklist

Dit is het enige geldige proces voor iedere publieke release.

## Harde regels

- Bestaande tags, GitHub-releases, APK's en checksums worden nooit vervangen.
- Maak geen tags of GitHub-releases handmatig.
- Gebruik `gh release create` nooit rechtstreeks.
- Publiceer uitsluitend met `npm run release:publish`.
- Publieke release notes bevatten alleen gebruikersgerichte wijzigingen.
- Android volgt pas na een geslaagde zichtbare webtest.
- Elke wijziging aan commit, versie, APK, checksum, release notes of release-automatisering maakt het preflightbewijs ongeldig.

## Verplichte volgorde

1. Codewijziging, tests, productiebuild en zichtbare webtest.
2. Capacitor-sync, Android-releasebuild, installatie en telefoontest.
3. Code en versiebump committen, inclusief `release-notes-vX.Y.Z.md`.
4. Voer daarna uitsluitend deze commando's uit:

```bash
npm run release:build
npm run release:install
npm run release:phone-tested -- --confirmed
npm run release:preflight
npm run release:check
npm run release:publish
```

## Wat de automatisering afdwingt

`release:build` draait alle tests, maakt de productiebuild, synchroniseert Android, bouwt de definitieve signed APK, maakt de SHA-256 en schrijft een commitgebonden buildmanifest.

`release:phone-tested -- --confirmed` controleert via ADB de geïnstalleerde package, versionName en versionCode en koppelt de telefoontest aan exact dezelfde APK-checksum.

`release:preflight` vereist een echte clean clone, `npm ci`, alle tests, productiebuild, Capacitor-sync, Java 21, geïsoleerde Gradle-home, geen private signinggegevens, geen buildcache, geen configuratiecache, een clean unsigned APK, geldige v2-signing van de lokale APK, correcte metadata, byte-identieke publieke assets en geen verdachte assets of sourcemaps.

Een geslaagde preflight schrijft:

```text
release/preflight-proof.json
```

Dat bewijs is gekoppeld aan commit, versie, versionCode, APK-SHA, release-notes-SHA en de hashes van de release-automatisering.

`release:check` controleert publicatie zonder iets te wijzigen.

`release:publish` weigert wanneer HEAD, versie, APK, checksum, telefoonbewijs, release notes, scripts, tag of GitHub-release niet exact overeenkomen. Alleen dit commando mag `main` pushen, de tag maken en de release publiceren.

## Veilige fouten

Alle releasecommando's draaien als kindproces. Een fout geeft een niet-nul exitcode, maar zet geen `set -e` in de interactieve shell en sluit de terminaltab niet.
