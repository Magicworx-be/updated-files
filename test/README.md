# Tests op de rekenkern

`npm test` draait alles: deze map plus de bestaande tests in `scripts/`.
Zestig tests, ongeveer een halve seconde.

## Wat hier staat

| Bestand | Rol |
|---|---|
| `rekenkern.golden.test.js` | Rekent alle 16 live pagina's opnieuw en vergelijkt met een bevroren momentopname. Elke afwijking is een fout. |
| `golden/<slug>.json` | Die momentopname: de selectie (namen én volgorde), `nListed`, de regiobasis, en per opgenomen bedrijf de vier dimensies en de composite op 6 decimalen. |
| `rekenkern.rand.test.js` | De randgevallen die in de echte data toevallig niet voorkomen: negen reviews in plaats van tien, twee recente in plaats van drie, een vakfocus exact op de vloer, een review met een datum in de toekomst. |
| `rekenkern.versies.test.js` | Eén verzonnen regio door methodiek v1 t/m v5, en de verschillen die `METHODIEK.md` § Methodiek-versies belooft. |
| `synthetisch.js` | Bouwstenen voor die verzonnen regio's. |
| `golden-lib.js` | Leest de echte data in en maakt er een momentopname van. |
| `genereer-golden.js` | Maakt of vernieuwt de momentopnames. Lees eerst de waarschuwing hieronder. |

## Waarom naast het selectieslot

Het selectieslot in `build.js` (`data/<slug>/selectie.json`) bewaakt alleen wat
er op de pagina staat: de Top 10 of Top 5, in volgorde. Deze tests bewaken ook
alles daaronder — de 4 tot 68 opgenomen bedrijven per regio, hun vertrouwen,
reviewkwaliteit, recentheid en vakfocus, en de regiobasis.

Dat verschil is het punt. Een fout die de volgorde van de eerste tien toevallig
niet raakt, glipt langs het slot maar niet langs deze test. Gecontroleerd op
3 september 2026: `BAYES_M` van 16 naar 17 zetten laat 17 tests vallen, terwijl
de gepubliceerde selectie op de meeste pagina's ongemoeid blijft.

## Hoe het werkt

De tests draaien `lib/rekenkern.js` rechtstreeks. Die module doet geen I/O: ze
krijgt de vier invoerbronnen als gewone objecten binnen (config, `reviews.json`,
`beoordeling.json`, de WhatsApp-map) en geeft een gewoon object terug. Er wordt
dus niets gebouwd, niets geschreven en niets gepubliceerd — testen kan de site
niet raken.

`build.js` komt er niet aan te pas. Dat de bouwer de module goed aanroept, is
apart bewezen: na de extractie op 3 september 2026 waren alle 16
`output/<slug>/index.html`, alle 32 rapporten en alle 16 `badges.json`
byte-identiek aan daarvoor.

## Een momentopname vernieuwen

    node test/genereer-golden.js            alle pagina's
    node test/genereer-golden.js <slug>     alleen deze

**Doe dit nooit om een falende test te laten slagen.** Dan meet de test alleen
nog dat de code gelijk is aan zichzelf, en is het vangnet weg. Faalt een test na
een wijziging, dan is er iets aan de rekenkern veranderd wat niet mocht
veranderen: repareer de code.

Vernieuwen mag in precies drie gevallen:

1. **Een nieuwe pagina.** Bouw en publiceer haar eerst, draai dan
   `node test/genereer-golden.js <slug>`.
2. **Een pagina is bewust op een nieuwe methodiek-versie gezet** — met een
   uitdrukkelijke vraag van Olivier, zoals `CLAUDE.md` voorschrijft.
3. **De selectie is bewust herijkt** met `node build.js <slug> --nieuwe-selectie`,
   bij de jaarlijkse update met verse data.

Zet in het commitbericht welk van de drie het was.

## Een randgeval toevoegen

`synthetisch.js` bouwt een regio uit vulbedrijven plus de bedrijven die je wil
onderzoeken; `regio({ extra, beoExtra, methodiek })` rekent hem door. Verwijs in
de testnaam naar de paragraaf in `METHODIEK.md` waar het verwachte gedrag staat.
Klopt de code niet met dat document, dan is dát het onderwerp — niet de test.
