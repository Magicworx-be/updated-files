// =====================================================================
// test/rekenkern.versies.test.js — v1 t/m v5 op dezelfde verzonnen regio
//
// Elke live pagina staat vastgepind op de methodiek-versie waarop ze
// gepubliceerd is, en die versies moeten blijven doen wat METHODIEK.md
// § Methodiek-versies belooft. De golden-tests bewaken dat per pagina, maar
// alleen voor de versie die die pagina toevallig draagt. Hier gaat één en
// dezelfde regio door alle vijf, zodat de verschillen zélf vastliggen.
//
// De publieke belofte staat voorop en wordt als eerste getest: de gewichten,
// de halveringstijd, Bayes M en de opnamedrempels zijn in élke versie gelijk.
// Wat verschilt is interne kalibratie.
// =====================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('./synthetisch');
const RK = S.RK;

const VERSIES = [1, 2, 3, 4, 5];

test('de publieke belofte: gewichten en drempels zijn in elke versie gelijk', () => {
  for (const v of VERSIES) {
    const P = RK.METHODIEK_PARAMS[v];
    assert.ok(P, 'versie ' + v + ' bestaat');
    // Geen enkele versie mag een eigen gewicht, halveringstijd, Bayes-M of
    // opnamedrempel introduceren — die staan buiten het versieblok.
    for (const verboden of ['WEIGHTS', 'HALFLIFE_JAREN', 'BAYES_M', 'MIN_REVIEWS', 'MIN_RECENT']) {
      assert.strictEqual(P[verboden], undefined,
        'v' + v + ' mag ' + verboden + ' niet per versie overschrijven — dat is de publieke belofte');
    }
  }
  assert.strictEqual(RK.METHODIEK_LATEST, 5);
  assert.deepStrictEqual(Object.keys(RK.METHODIEK_PARAMS).map(Number), VERSIES);
});

test('een config zonder versieveld bouwt op de nieuwste logica', () => {
  const res = S.regio({ configOver: { methodiek: undefined } });
  assert.strictEqual(res.methodiekVersie, RK.METHODIEK_LATEST,
    'een NIEUWE pagina hoort automatisch de beste logica te krijgen (CLAUDE.md)');
});

test('een onbekende versie is een harde fout', () => {
  assert.throws(() => S.regio({ methodiek: 99 }),
    e => e instanceof RK.RekenFout && /onbekende methodiek-versie/.test(e.message));
});

// ---------------------------------------------------------------------
// v1 → v2: vertrouwen-vloer, recentheid-anker, publicatiedrempel
// ---------------------------------------------------------------------

test('v1 → v2: de vertrouwen-vloer gaat van 3,5 naar 4,0', () => {
  assert.strictEqual(RK.METHODIEK_PARAMS[1].TRUST_FLOOR, 3.5);
  for (const v of [2, 3, 4, 5]) assert.strictEqual(RK.METHODIEK_PARAMS[v].TRUST_FLOOR, 4.0);

  const trust = v => S.regio({ extra: [S.bedrijf('Kandidaat', 30, S.reviews(30, 6, 4.6))], methodiek: v })
    .eligible.find(c => c.naam === 'Kandidaat').trust;
  assert.ok(trust(1) > trust(2),
    'dezelfde Bayes-score levert onder een lagere vloer een hoger vertrouwen op');
});

test('v1 → v2: recentheid is pas vol bij tien reviews in 24 maanden', () => {
  assert.strictEqual(RK.METHODIEK_PARAMS[1].RECENCY_ANCHOR, 6);
  for (const v of [2, 3, 4, 5]) assert.strictEqual(RK.METHODIEK_PARAMS[v].RECENCY_ANCHOR, 10);

  const rec = v => S.regio({
    extra: [S.bedrijf('Kandidaat', 20, [...S.reviews(6, 6), ...S.reviews(14, 40)])], methodiek: v,
  }).eligible.find(c => c.naam === 'Kandidaat').recency;
  assert.strictEqual(rec(1), 1, 'v1: zes recente reviews is de volle score');
  assert.strictEqual(rec(2), 0.6, 'v2: zes van de tien');
});

test('v1 → v2: de publicatiedrempel (≥15) houdt een dun onderbouwd bedrijf van de pagina', () => {
  assert.strictEqual(RK.METHODIEK_PARAMS[1].PUBLISH_MIN_REVIEWS, RK.MIN_REVIEWS,
    'v1 kent geen aparte publicatiedrempel');
  for (const v of [2, 3, 4, 5]) assert.strictEqual(RK.METHODIEK_PARAMS[v].PUBLISH_MIN_REVIEWS, 15);

  // Eén bedrijf met 14 reviews, maar met de beste cijfers van de regio.
  const dun = v => S.regio({
    methodiek: v,
    extra: [S.bedrijf('Dun bewijs', 14, S.reviews(14, 6, 5))],
    beoExtra: [{ bedrijf: 'Dun bewijs', reviewkwaliteit: 5, vakfocus: 5, vakfocusBron: 'website' }],
  });
  const v1 = dun(1), v2 = dun(2);

  assert.strictEqual(S.positie(v1, 'Dun bewijs'), 1, 'v1 publiceert het gewoon');
  assert.strictEqual(S.positie(v2, 'Dun bewijs'), 0,
    'v2 houdt het van de pagina zolang er genoeg beter onderbouwde bedrijven zijn');
  assert.strictEqual(S.isEligible(v2, 'Dun bewijs'), true,
    'het blijft wél opgenomen — opname en publicatie zijn twee dingen (§2)');
});

test('v2 → v3: dezelfde selectie, dezelfde volgorde, dezelfde cijfers', () => {
  const maak = v => S.regio({
    methodiek: v,
    extra: [
      S.bedrijf('Alfa', 30, S.reviews(30, 6, 4.8)),
      S.bedrijf('Beta', 18, S.reviews(18, 12, 4.9)),
      S.bedrijf('Gamma', 14, S.reviews(14, 6, 5)),
    ],
    beoExtra: [
      { bedrijf: 'Alfa', reviewkwaliteit: 4.2, vakfocus: 4.6, vakfocusBron: 'website' },
      { bedrijf: 'Beta', reviewkwaliteit: 4.8, vakfocus: 3.9, vakfocusBron: 'website' },
      { bedrijf: 'Gamma', reviewkwaliteit: 5, vakfocus: 5, vakfocusBron: 'website' },
    ],
  });
  const a = maak(2), b = maak(3);
  assert.deepStrictEqual(b.selectie.map(c => c.naam), a.selectie.map(c => c.naam));
  assert.deepStrictEqual(b.eligible.map(c => c.composite), a.eligible.map(c => c.composite),
    'v3 is een presentatie-verbetering (JSON-LD), geen rekenwijziging');
  assert.strictEqual(b.nListed, a.nListed);
});

// ---------------------------------------------------------------------
// v3 → v4: vakspecialist-eis en diepte op eligible specialisten
// ---------------------------------------------------------------------

test('v3 → v4: een bedrijf van een ander vak valt weg', () => {
  const maak = v => S.regio({
    methodiek: v,
    extra: [S.bedrijf('Ander vak', 60, S.reviews(60, 6, 5))],
    beoExtra: [{ bedrijf: 'Ander vak', reviewkwaliteit: 5, vakfocus: 2, vakfocusBron: 'website' }],
  });
  assert.strictEqual(S.isEligible(maak(3), 'Ander vak'), true,
    'v3 kent de vakfocus-vloer niet — precies het gat dat v4 dicht');
  assert.strictEqual(S.isEligible(maak(4), 'Ander vak'), false);
});

test('v3 → v4: de diepte telt eligible specialisten, niet alleen ≥15 reviews', () => {
  // Tien opgenomen bedrijven, waarvan er vier maar 12 reviews hebben.
  const dun = Array.from({ length: 4 }, (_, i) =>
    S.bedrijf('Klein ' + i, 12, S.reviews(12, 6, 4.7)));
  const maak = v => S.regio({
    methodiek: v, nVulling: 6, extra: dun,
    beoExtra: dun.map(c => ({ bedrijf: c.bedrijf, reviewkwaliteit: 4, vakfocus: 4, vakfocusBron: 'website' })),
  });
  const v3 = maak(3), v4 = maak(4);
  assert.strictEqual(v3.eligible.length, 10);
  assert.strictEqual(v4.eligible.length, 10);
  assert.strictEqual(v3.publishableCount, 6, 'zes bedrijven halen ≥15 reviews');
  assert.strictEqual(v3.nListed, RK.LISTED_SMALL,
    'v1–v3 meten de diepte aan het aantal goed onderbouwde bedrijven → Top 5');
  assert.strictEqual(v4.nListed, RK.LISTED_FULL,
    'v4 meet aan het aantal eligible specialisten → Top 10');
});

test('v4 rangschikt zuiver op composite, zonder publicabel-eerst', () => {
  const extra = [S.bedrijf('Dun bewijs', 14, S.reviews(14, 6, 5))];
  const beoExtra = [{ bedrijf: 'Dun bewijs', reviewkwaliteit: 5, vakfocus: 5, vakfocusBron: 'website' }];
  const v3 = S.regio({ methodiek: 3, extra, beoExtra });
  const v4 = S.regio({ methodiek: 4, extra, beoExtra });
  assert.strictEqual(S.positie(v3, 'Dun bewijs'), 0, 'v3 zet publicabele bedrijven eerst');
  assert.strictEqual(S.positie(v4, 'Dun bewijs'), 1, 'v4 laat de composite beslissen');
  assert.strictEqual(v4.isPublishable(v4.eligible.find(c => c.naam === 'Dun bewijs')), false,
    '≥15 blijft bestaan als "goed onderbouwd"-label, maar stuurt de v4-selectie niet');
});

// ---------------------------------------------------------------------
// v4 → v5: het vak moet afgebakend zijn
// ---------------------------------------------------------------------

test('v4 → v5: zonder vakdefinitie stopt de build', () => {
  const zonderDefinitie = { vak: { mv: 'onbekende-niche', mvCap: 'X', ev: 'x', kort: 'x' } };
  assert.strictEqual(RK.METHODIEK_PARAMS[5].REQUIRE_VAKDEF, true);
  assert.strictEqual(RK.METHODIEK_PARAMS[4].REQUIRE_VAKDEF, undefined);

  assert.doesNotThrow(() => S.regio({ methodiek: 4, configOver: zonderDefinitie }),
    'v4 kent de eis niet');
  assert.throws(() => S.regio({ methodiek: 5, configOver: zonderDefinitie }),
    e => e instanceof RK.RekenFout && /vereist een vakdefinitie/.test(e.message));
});

test('v5 aanvaardt een vakdefinitie uit de config zelf', () => {
  const eigenDefinitie = {
    vak: {
      mv: 'onbekende-niche', mvCap: 'X', ev: 'x', kort: 'x',
      definitie: { kern: 'het zelf uitvoeren van X', omvat: [], buiten: ['iets anders'] },
    },
  };
  const res = S.regio({ methodiek: 5, configOver: eigenDefinitie });
  assert.strictEqual(res.vakDef.kern, 'het zelf uitvoeren van X');
});

test('v4 → v5: de rekenkalibratie is identiek; alleen de definitie verschilt', () => {
  const P4 = RK.METHODIEK_PARAMS[4], P5 = RK.METHODIEK_PARAMS[5];
  for (const k of ['TRUST_FLOOR', 'RECENCY_ANCHOR', 'PUBLISH_MIN_REVIEWS', 'EXPECT_HALF_STEPS', 'VAKFOCUS_FLOOR']) {
    assert.strictEqual(P5[k], P4[k], k + ' hoort in v4 en v5 gelijk te zijn');
  }
  const maak = v => S.regio({
    methodiek: v,
    extra: [S.bedrijf('Alfa', 30, S.reviews(30, 6, 4.8)), S.bedrijf('Beta', 18, S.reviews(18, 12, 4.9))],
    beoExtra: [
      { bedrijf: 'Alfa', reviewkwaliteit: 4.2, vakfocus: 4.6, vakfocusBron: 'website' },
      { bedrijf: 'Beta', reviewkwaliteit: 4.8, vakfocus: 3.9, vakfocusBron: 'website' },
    ],
  });
  assert.deepStrictEqual(maak(5).selectie.map(c => c.naam), maak(4).selectie.map(c => c.naam),
    'op dezelfde beoordeling geven v4 en v5 dezelfde uitkomst — het verschil zit in de LLM-prompt');
});

// ---------------------------------------------------------------------
// LLM-run-middeling: v1 verwacht halve stappen, v2+ niet
// ---------------------------------------------------------------------

test('v1 meldt een score die niet op een 0,5-stap ligt; v2+ niet', () => {
  const maak = v => S.regio({
    methodiek: v,
    extra: [S.bedrijf('Kandidaat', 20, S.reviews(20, 6))],
    beoExtra: [{ bedrijf: 'Kandidaat', reviewkwaliteit: 4.3, vakfocus: 4, vakfocusBron: 'website' }],
  });
  assert.strictEqual(RK.METHODIEK_PARAMS[1].EXPECT_HALF_STEPS, true);
  assert.ok(maak(1).warnings.some(w => w.includes('0,5-stap')),
    'v1 scoorde in vaste halve stappen — een 4,3 wijst daar op een fout');
  assert.ok(!maak(2).warnings.some(w => w.includes('0,5-stap')),
    'v2+ middelt meerdere runs, dus fijnere waarden zijn juist gewenst');
});
