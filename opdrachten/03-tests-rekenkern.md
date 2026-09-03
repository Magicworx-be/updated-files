# 03 — Tests op de rekenkern

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md` en `METHODIEK.md` volledig, daarna `build.js` volledig
(1.539 regels). Antwoord in het Nederlands.

## Waarom

Gemeten op 3 september 2026: de enige tests in het project zijn
`scripts/whatsapp-routine.test.js` en `scripts/watchdog-taken.test.js` (beide
slagen). De rekenkern (eligibility, tijdsweging, Bayes, de vier dimensies,
composite, `pickTop`, publicatiedrempel, selectieslot) zit in één top-level
script zonder functiegrens en is dus niet los uit te voeren. Opdrachten 04 t/m 10
gaan `build.js` en `lib/` verbouwen; zonder tests is het enige vangnet "alle 16
pagina's byte-identiek vergelijken", en dat vangt geen fout in een pad dat de 16
huidige pagina's toevallig niet raken.

De rekenmotor is aantoonbaar deterministisch (twee builds van Gent gaven
byte-identieke HTML) en de formules kloppen; dit is bewaren, niet repareren.

## Wat te doen

1. **Extraheer de rekenkern** naar `lib/rekenkern.js` als pure functie(s):
   `bereken({ config, reviews, beoordeling, params, whatsapp })` →
   `{ bedrijven (met alle tussenresultaten), eligible, selectie, nListed, warnings }`.
   Geen I/O, geen `console.log`, geen `process.exit` in die module. `build.js`
   roept haar aan en doet verder alleen lezen, schrijven en renderen.
   Voorwaarde: de uitvoer van `build.js` voor alle 16 pagina's blijft
   byte-identiek (na opdracht 02 is dat strikt te controleren).
2. **Golden-tests**: `test/rekenkern.golden.test.js` laadt voor elk van de 16 live
   slugs config, `reviews.json`, `beoordeling.json` en `whatsapp.json`, draait
   `bereken` en vergelijkt met een snapshot `test/golden/<slug>.json` dat de
   selectie (namen en volgorde), `nListed`, en per bedrijf composite en de vier
   dimensies (op 6 decimalen) bevat. Snapshots eenmalig genereren met de huidige
   code, vóór stap 1. De test faalt bij elke afwijking. Documenteer hoe je een
   snapshot bewust vernieuwt (alleen bij een nieuwe methodiek-versie of bij
   `--nieuwe-selectie`).
3. **Randgevallen** in `test/rekenkern.rand.test.js`, met synthetische data
   (gebruik `scripts/maak-testdata.js` als inspiratie):
   - 0 bruikbare reviews; `googleReviews` als string; score buiten 1 tot 5; review
     zonder datum; datum in de toekomst t.o.v. peildatum;
   - exact 9, 10, 14 en 15 reviews rond `MIN_REVIEWS` en `PUBLISH_MIN_REVIEWS`;
     exact 2 en 3 recente reviews;
   - twee bedrijven met identieke composite (tiebreak stabiel en gedocumenteerd);
   - bedrijf zonder gemeente (moet wegvallen); naam met dubbele spaties en
     hoofdletters (normalisatie); dubbele naam in reviews.json (moet nu hard
     falen of minstens waarschuwen; kies en documenteer);
   - vakfocus precies op `VAKFOCUS_FLOOR` (2,5) in v4 en v5; bedrijf zonder website
     in v2 versus v3;
   - kleine regio (`SMALL_REGION_THRESHOLD`) → `LISTED_SMALL`; 0 eligible → fout.
   Per geval: verwacht gedrag uit `METHODIEK.md` afleiden en in de test citeren
   (paragraafnummer).
4. **Versietests**: dezelfde synthetische regio door v1 t/m v5 halen en de
   verschillen die `METHODIEK.md` § Methodiek-versies beschrijft bevestigen
   (vertrouwen-vloer, recentheid-anker, publicatiedrempel, vakspecialist-eis,
   diepte op eligible specialisten).
5. `package.json`: script `"test": "node --test test/ scripts/"`. Alle bestaande
   tests blijven meedraaien.

## Wat niet

- Verander geen enkele formule, drempel, constante of volgorde. Vind je tijdens het
  extraheren iets dat volgens jou fout is, meld het apart en laat het staan; de
  golden-tests moeten op de huidige uitkomsten slagen.
- Geen nieuwe methodiek-versie, geen `--nieuwe-selectie`, geen wijziging in
  `data/`.
- Draai `node build-all.js` niet; `node build.js <slug>` volstaat als bewijs.

## Bewijs

1. Snapshots gegenereerd vóór de refactor; `npm test` slaagt ná de refactor op
   dezelfde snapshots.
2. md5 van `output/<slug>/index.html` voor alle 16 slugs vóór en ná: identiek.
3. Aantal tests en doorlooptijd van `npm test`.

## Verslag en documentatie

Werk `METHODIEK.md` bij: onder "Bindende bron" verwijzen naar `lib/rekenkern.js`
en naar de golden-tests als tweede vangnet naast het selectieslot; datum bovenaan
op vandaag. Werk de bestandstabel in `CLAUDE.md` en `ARCHITECTUUR.md` bij
(`lib/rekenkern.js`, `test/`). Meld expliciet dat je dat deed. Als de
regelverwijzingen in `METHODIEK.md` (regel 13, 637, 650 wijzen naar "regels
52–168") door de extractie verschuiven, corrigeer ze.
