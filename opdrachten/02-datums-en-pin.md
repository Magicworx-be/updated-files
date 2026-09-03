# 02 — "Vandaag" uit de uitvoer halen en de methodiek-pin afdwingen

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md` (vooral de regels over methodiek-versies en het
selectieslot) en `METHODIEK.md` § Methodiek-versies. Antwoord in het Nederlands.

## Waarom

Gemeten op 3 september 2026:

1. **Drie plaatsen krijgen de datum van de build in plaats van de peildatum:**
   - `build.js` regel 1223: `BUILD_TIMESTAMP` (dagniveau) komt in `template.html`
     regel 45 terecht, dus elke pagina "wijzigt" bij de eerste build van een nieuwe
     dag.
   - `build-site.js` regel 261 tot 264: sitemap `lastmod` = vandaag voor álle
     URL's. Live: 34 van 34 URL's dragen 2026-09-03.
   - `build.js` regel 1493: prospectiedocument "Gegenereerd op <vandaag>"; die
     bestanden zijn getrackt in git (`reports/`), dus elke dag 16 gewijzigde
     bestanden.
   Gevolg bij 675 pagina's: elke dagelijkse build meldt 675 wijzigingen aan Google,
   de site-commits worden onleesbaar, en "byte-identiek vergelijken" (het vangnet
   van alle volgende opdrachten) werkt niet over een dagwissel heen.
2. **De pin na publicatie is een afspraak, geen code.** `build.js` regel 355:
   `config.methodiek || METHODIEK_LATEST`. `selectie.json` slaat de versie wél op
   (regel 630) maar de vergelijking op regel 655 kijkt alleen naar `bedrijven`.
   Vergeet iemand de pin, dan verandert bij een latere versie stilzwijgend de
   opnametekst en de JSON-LD van een live pagina.
3. **Sorteren gebruikt `localeCompare(…, 'nl')`** (`build.js` 554, 711, 770;
   `lib/registry.js` 145, 197, 237, 261, 278 zonder locale). Een Node/ICU-upgrade
   kan bij gelijke composite én gelijk gewicht een tiebreak omkeren en het
   selectieslot laten afgaan.

## Wat te doen

Controleer eerst of elk punt nog geldt.

1. Vervang de drie "vandaag"-datums door iets dat alleen verandert als de inhoud
   verandert:
   - Buildstempel in de pagina: gebruik `config.peildatum` (of laat het token weg
     als het geen functie heeft; controleer waar `template.html` regel 45 voor
     dient).
   - Sitemap `lastmod`: houd per slug een datum bij in `data/lastmod.json`
     (slug → datum) die `build-all.js` alleen bijwerkt als de md5 van
     `output/<slug>/index.html` verschilt van de vorige build. Hubs en homepage:
     de jongste datum van hun onderliggende pagina's. Eerste vulling: de huidige
     peildatums.
   - Prospectiedocument: `config.peildatum` in plaats van vandaag.
2. Pin afdwingen: `build.js` stopt met een duidelijke melding als
   `data/<slug>/selectie.json` bestaat én `config.methodiek` ontbreekt of afwijkt
   van `selectie.json.methodiek`. Voeg een vlag `--pin` toe die de versie uit
   `selectie.json` in de config schrijft (dat is de "vaste publicatiestap" uit
   CLAUDE.md, nu als één commando).
3. Stabiele tiebreak: waar composite en gewicht gelijk zijn, sorteer als laatste
   op `slugify(naam)` met gewone `<`-vergelijking in plaats van `localeCompare`.
   Doe dit alleen waar het de rangorde van bedrijven bepaalt; navigatie-sortering
   in `registry.js` mag `localeCompare` houden maar dan mét expliciet `'nl'`.

## Wat niet

- Geen nieuwe methodiek-versie. De tiebreak-wijziging mag de volgorde van geen
  enkele van de 16 pagina's veranderen; verandert ze wél, dan stop je en meld je
  welke pagina en welke twee bedrijven gelijk staan. Niet oplossen met
  `--nieuwe-selectie`.
- Verhoog geen versienummer in een bestaande config.

## Bewijs

1. Kopie van `output/` en `reports/` vóór je begint. Na de wijziging alle 16 slugs
   bouwen en tonen dat de HTML alleen verschilt in de buildstempel (toon de diff;
   die moet leeg zijn of enkel die regel bevatten) en dat de prospectiedocumenten
   alleen in de datumregel verschillen.
2. Toon dat een build met een config zonder `methodiek` (tijdelijk, in een
   scratch-kopie van de config) stopt met de nieuwe melding, en dat `--pin` de
   juiste versie schrijft.
3. Toon dat twee builds op verschillende dagen (simuleer met een gewijzigde
   systeemklok is niet nodig: verwijder de datumafhankelijkheid en toon dat er
   geen `new Date()` zonder peildatum meer in de uitvoerpaden zit, met een grep).

## Verslag en documentatie

Werk `METHODIEK.md` bij (§ Methodiek-versies: de pin wordt nu afgedwongen; de
tiebreak) en zet de datum "Laatst gelijkgezet met de code" op vandaag. Werk
`CLAUDE.md` bij: de publicatiestap "pin vastzetten" verwijst nu naar `--pin`.
Vermeld in `ARCHITECTUUR.md` § "Wat er stilletjes kan stukgaan" dat de
sitemap-lastmod-kwaal is verholpen. Meld in je antwoord expliciet dat je die
drie documenten hebt bijgewerkt.
