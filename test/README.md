# Tests op de rekenkern

`npm test` draait alles: deze map plus de bestaande tests in `scripts/`.
Duur: ongeveer twee seconden.

## Wat hier staat

| Bestand | Rol |
|---|---|
| `golden/<slug>.json` | Bevroren momentopname van de rekenkern per live pagina: de selectie (namen én volgorde), `nListed`, de regiobasis, en per eligible bedrijf de vier dimensies en de composite op 6 decimalen. |
| `rekenkern.golden.test.js` | Rekent alle 16 pagina's opnieuw en vergelijkt met de momentopname. Elke afwijking is een fout. |
| `genereer-golden.js` | Maakt of vernieuwt de momentopnames. Lees eerst de waarschuwing hieronder. |
| `golden-lib.js` | De enige plek die weet *hoe* de rekenkern uitgelezen wordt. |

## Waarom naast het selectieslot

Het selectieslot in `build.js` (`data/<slug>/selectie.json`) bewaakt alleen wat
er op de pagina staat: de Top 10 of Top 5, in volgorde. Deze tests bewaken ook
alles daaronder — de 4 tot 68 eligible bedrijven per regio, hun vertrouwen,
reviewkwaliteit, recentheid en vakfocus, en de prior van de regio.

Dat verschil is het punt. Een fout die de volgorde van de eerste tien toevallig
niet raakt, glipt langs het slot maar niet langs deze test. Gecontroleerd op
3 september 2026: `BAYES_M` van 16 naar 17 zetten laat 16 van de 17 tests vallen,
terwijl de gepubliceerde selectie op de meeste pagina's ongemoeid blijft.

## Hoe het werkt

`golden-lib.js` draait `node build.js <slug>` met de omgevingsvariabele
`KEURWIJZER_GOLDEN_OUT`. `build.js` schrijft dan zijn tussenresultaten naar dat
pad en **stopt daar**: geen pagina, geen `selectie.json`, geen rapport, geen
badges. Een test uitvoeren raakt dus niets wat gepubliceerd wordt.

Zodra de rekenkern een eigen module is (`lib/rekenkern.js`) verandert alleen
`berekenSnapshot` in `golden-lib.js`; de momentopnames en de tests blijven
ongewijzigd. Daarom zijn ze eerst gemaakt.

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
