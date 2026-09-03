// =====================================================================
// test/rekenkern.golden.test.js — het vangnet onder de rekenkern
//
// Voor elk van de live slugs: draai de rekenkern op de echte data en vergelijk
// met de bevroren momentopname in test/golden/<slug>.json. Elke afwijking is
// een fout — een cijfer dat verschuift, een bedrijf dat van plaats wisselt, een
// eligible-drempel die anders uitpakt.
//
// Dit is de tweede verdedigingslinie naast het selectieslot in build.js. Het
// slot bewaakt alleen de gepubliceerde Top N; deze test bewaakt óók alles
// eronder — de 4 tot 68 eligible bedrijven per regio, hun vier dimensies en hun
// composite. Zo valt een fout op in een rekenpad dat de huidige selectie
// toevallig niet raakt.
//
// Faalt een test na een wijziging? Dan is er iets aan de rekenkern veranderd
// wat niet mocht veranderen. Repareer de code — vernieuw de snapshot niet.
// De twee gevallen waarin vernieuwen wél mag, staan in test/genereer-golden.js.
// =====================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('./golden-lib');

for (const slug of G.alleSlugs()) {
  test('rekenkern ongewijzigd: ' + slug, () => {
    const verwacht = G.leesGolden(slug);
    const gekregen = G.berekenSnapshot(slug);

    // Eerst de twee dingen die publiek zichtbaar zijn, met een eigen melding:
    // wie er op de pagina staat en hoeveel er getoond worden.
    assert.deepStrictEqual(gekregen.selectie, verwacht.selectie,
      'de gepubliceerde selectie van ' + slug + ' zou veranderen');
    assert.strictEqual(gekregen.nListed, verwacht.nListed,
      'het aantal getoonde bedrijven van ' + slug + ' zou veranderen');

    // Daarna alles: dimensies, composite, eligible-verzameling, prior,
    // waarschuwingen. Bij een verschil een leesbare opsomming in plaats van
    // twee JSON-blokken van duizenden regels.
    if (JSON.stringify(gekregen) !== JSON.stringify(verwacht)) {
      const d = G.verschillen(verwacht, gekregen);
      assert.fail('rekenkern wijkt af voor ' + slug + ':\n' + d.join('\n') +
        (d.length >= 10 ? '\n  … (eerste tien getoond)' : '') +
        '\n\n  Repareer de code, vernieuw de snapshot niet. Zie test/README.md.');
    }
  });
}

// Het aantal snapshots moet gelijk lopen met het aantal live pagina's. Anders
// glipt een nieuwe regio ongemerkt langs de tests heen, of blijft een snapshot
// achter van een pagina die niet meer bestaat.
test('elke live pagina heeft precies één snapshot', () => {
  const fs = require('fs');
  const bestanden = fs.existsSync(G.GOLDEN_DIR)
    ? fs.readdirSync(G.GOLDEN_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
    : [];
  assert.deepStrictEqual(bestanden.slice().sort(), G.alleSlugs().slice().sort(),
    'draai `node test/genereer-golden.js` voor een nieuwe pagina, of verwijder de snapshot van een pagina die weg is');
});
