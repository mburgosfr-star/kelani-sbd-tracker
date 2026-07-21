# Kelani SBD Tracker release checklist

Dit is het enige geldige proces voor iedere publieke release.

## Harde regels

- Bestaande tags, GitHub-releases, APK's en checksums worden nooit vervangen.
- Maak geen tags of GitHub-releases handmatig.
- Gebruik `gh release create` nooit rechtstreeks.
- Publiceer uitsluitend met `npm run release:publish`.
- Publieke release notes bevatten alleen gebruikersgerichte wijzigingen.
- Releasevoorbereiding mag pas beginnen na een geslaagde zichtbare webtest.
- De gebruiker moet releasevoorbereiding daarna afzonderlijk en expliciet goedkeuren.
- Een webtestbevestiging is nooit automatisch toestemming voor releasevoorbereiding.
- Versievelden mogen uitsluitend worden gewijzigd met `npm run release:prepare`.
- Elke wijziging aan commit, versie, APK, checksum, release notes of release-automatisering maakt het preflightbewijs ongeldig.

## Verplichte volgorde

1. Rond de codewijziging af en draai alle tests en de productiebuild.
2. Voer daarna een zichtbare webtest uit.
3. Leg de geslaagde webtest vast met `npm run release:web-tested -- --confirmed`.
4. Stop en vraag afzonderlijk toestemming voor releasevoorbereiding.
5. Bereid alleen na toestemming de afgesproken versie voor met `npm run release:prepare -- --version X.Y.Z --version-code N --confirmed`.
6. Maak de release notes en commit uitsluitend de goedgekeurde releasebestanden.
7. Push `main` en wacht op een groene Android release sanity.
8. Voer daarna achtereenvolgens `release:build`, `release:install`, `release:phone-tested`, `release:preflight`, `release:check` en `release:publish` uit.

Verplichte releasecommando’s:
- `npm run release:build`
- `npm run release:install`
- `npm run release:phone-tested -- --confirmed`
- `npm run release:preflight`
- `npm run release:check`
- `npm run release:publish`

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
