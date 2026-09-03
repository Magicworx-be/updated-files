# 01 — Stille faalpaden dichten in de bouw- en publicatieketen

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md` en `ARCHITECTUUR.md` volledig. Dit is een Node.js-project
zonder framework. Antwoord in het Nederlands.

## Waarom

Uit de audit van 3 september 2026 (gemeten, niet vermoed):

1. **Een kapotte config haalt een live pagina stil offline.** `lib/registry.js`
   regel 129 tot 133 doet `try { JSON.parse } catch { continue }` en slaat een config
   zonder `vak` of `regio` zonder melding over. `build-all.js` (rond regel 209 tot
   221) verwijdert daarna `output/<slug>/` als "weespagina", en `lib/push-site.js`
   (regel 143 tot 147) spiegelt dat naar Cloudflare. Exitcode 0. Getest in een
   scratch-kopie met twee configs waarvan één met een syntaxfout: `loadRegistry()`
   gaf er stil één terug.
2. **Een mislukte pagina in build-all geeft exitcode 0** en de oude
   `output/<slug>/index.html` wordt gewoon mee herpubliceerd (`build-all.js` regel
   137 tot 148: `mislukt.push(...)` zonder `process.exitCode`). Faalt een nieuwe
   pagina, dan stopt `push-site.js` (regel 99 tot 104) de hele publicatie met
   `process.exit(0)` en slikt `build-all.js` (regel 296) dat in.
3. **Een mislukte site- of badge-push eindigt met exitcode 0.**
   `lib/push-site.js` regel 190 tot 197 en `lib/push-badges.js` regel 148 tot 154
   loggen de fout maar zetten geen exitcode; `build-all.js` regel 293 tot 302 vangt
   ze met een lege catch. Alleen een registry-fout geeft exitcode 1.
4. **Geen vergrendeling.** Een geplande taak en een sessie kunnen tegelijk
   `build-all.js` draaien; de tweede push wordt non-fast-forward geweigerd en
   verdwijnt via punt 3.
5. **Volgorde registry → badges → site geeft een 404-venster.** `build-all.js`
   pusht de registry (regel 277, met tot 85 s CDN-verificatie) vóór de site (regel
   301, plus ~30 s Cloudflare-deploy). `hub.html` vervangt de serverside kaarten
   clientside door de CDN-registry, dus de hub linkt 1 tot 3 minuten naar een 404.
6. **De GitHub-token verloopt op 17 november 2026** (bevestigd via de API-header
   `github-authentication-token-expiration`) en niets waarschuwt vooraf.

## Wat te doen

Controleer eerst of elk punt nog geldt (lees de genoemde regels). Meld wat al
opgelost is en sla dat over.

1. `lib/registry.js`: laat `loadRegistry()` hard falen (throw met bestandsnaam en
   reden) bij ongeldige JSON, bij ontbrekend `vak` of `regio`, en bij een slug die
   niet overeenkomt met `<niche>-<regioSlug>` (zie `regioSlugFrom`). Precies zoals
   `loadPlannedRegions()` al doet bij een ontbrekende provincie.
2. `build-all.js`: `process.exitCode = 1` zodra `mislukt.length > 0` of zodra één
   van de drie pushes faalt. Druk aan het einde een duidelijke samenvatting af
   (welke pagina's faalden, welke push faalde) die ook in een geplande taak
   opvalt.
3. `lib/push-site.js` en `lib/push-badges.js`: exitcode ≠ 0 bij een gefaalde push
   en bij ontbrekende pagina's; geen `process.exit(0)` na een fout.
4. Lockfile: `build-all.js` maakt bij de start een lockbestand (buiten OneDrive,
   gebruik `lib/tijdelijke-map.js`) met pid en tijdstip en weigert te starten als
   er een verse lock staat (ouder dan 30 minuten mag genegeerd worden, met
   melding). Ruim de lock op in een `finally`.
5. Volgorde: site pushen vóór registry en badges. Controleer of `push-registry.js`
   iets nodig heeft uit de site-push; volgens de audit niet. Werk de
   stappenvolgorde in `ARCHITECTUUR.md` (§ "De gegevensstroom") mee bij.
6. Tokenwaarschuwing: bij de start van `build-all.js` één HEAD/GET naar
   `https://api.github.com/user` met de token, lees de header
   `github-authentication-token-expiration`, en druk een waarschuwing af als de
   vervaldatum binnen 30 dagen ligt. Faalt de aanvraag, dan alleen een melding,
   nooit een stop. Lek de token nooit in de uitvoer (zie `lib/veilig-fout.js`).

## Wat niet

- Raak `build.js`, de rekenlogica, `data/`, `config/` en de templates niet aan.
- Draai `node build-all.js` pas als stap "Bewijs" volledig geslaagd is.
- Verander niets aan wát er gepubliceerd wordt, alleen aan wanneer het stopt.

## Bewijs

1. Maak in de scratchpad een kopie van `config/` met één opzettelijk kapotte config
   en toon dat `loadRegistry()` nu hard faalt met een leesbare melding. Herstel de
   kopie; raak de echte `config/` niet.
2. Simuleer een gefaalde pagina (bijvoorbeeld door tijdelijk een niet-bestaande slug
   in een testlijst) en toon exitcode 1. Zorg dat de test de echte output niet
   aanraakt.
3. Bewaar vóór je begint een kopie van `output/` in de scratchpad. Draai daarna
   `node build.js <slug>` voor alle 16 slugs en toon dat elke
   `output/<slug>/index.html` byte-identiek is (md5 per bestand).
4. Start `build-all.js` twee keer tegelijk in twee shells en toon dat de tweede
   weigert. Doe dit met een omgevingsvariabele of vlag die de pushes overslaat
   (voeg die toe: `--geen-push`), zodat niets live gaat.
5. Pas daarna één echte `node build-all.js`. Meld wat er live ging (verwacht: niets
   inhoudelijks).

## Verslag

Sluit af met: welke van de zes punten nog golden, wat je veranderde per bestand,
de bewijsuitvoer van de vijf stappen, en of `ARCHITECTUUR.md` is bijgewerkt.
METHODIEK.md hoeft niet aangepast (geen wijziging aan de logica); zeg dat expliciet.
