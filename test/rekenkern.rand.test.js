// =====================================================================
// test/rekenkern.rand.test.js — de randen van de rekenkern
//
// De golden-tests bewaken de zestien echte pagina's. Die raken lang niet alle
// paden: geen enkele live regio heeft vandaag een bedrijf met exact negen
// reviews, of een review met een datum in de toekomst. Deze tests leggen die
// randen vast met verzonnen data, zodat een refactor ze niet stil verschuift.
//
// Elk geval verwijst naar de paragraaf in METHODIEK.md waar het verwachte
// gedrag staat. Wijkt een test af van dat document, dan is er iets fout — in
// de code of in het document, en dat moet je uitzoeken, niet wegdrukken.
// =====================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('./synthetisch');
const RK = S.RK;

// ---------------------------------------------------------------------
// Opnamecriteria — METHODIEK.md § 2 ("Selectie: wie komt in aanmerking?")
// ---------------------------------------------------------------------

test('§2 — onder de reviewdrempel valt een bedrijf weg, erop komt het erin', () => {
  const negen = S.regio({ extra: [S.bedrijf('Kandidaat', 9, S.reviews(9, 6))] });
  const tien = S.regio({ extra: [S.bedrijf('Kandidaat', 10, S.reviews(10, 6))] });
  assert.strictEqual(S.isEligible(negen, 'Kandidaat'), false, '9 < MIN_REVIEWS (10)');
  assert.strictEqual(S.isEligible(tien, 'Kandidaat'), true, '10 = MIN_REVIEWS');
  assert.strictEqual(RK.MIN_REVIEWS, 10, 'de drempel zelf is publiek en ligt vast');
});

test('§2 — de publicatiedrempel ligt op 15: 14 is "niet publicabel", 15 wel', () => {
  // Opname (≥10) en publicatie (≥15 vanaf v2) zijn twee verschillende drempels.
  const veertien = S.regio({ extra: [S.bedrijf('Kandidaat', 14, S.reviews(14, 6))] });
  const vijftien = S.regio({ extra: [S.bedrijf('Kandidaat', 15, S.reviews(15, 6))] });
  assert.strictEqual(S.isEligible(veertien, 'Kandidaat'), true, '14 ≥ MIN_REVIEWS, dus opgenomen');
  assert.strictEqual(veertien.isPublishable(veertien.eligible.find(c => c.naam === 'Kandidaat')), false);
  assert.strictEqual(vijftien.isPublishable(vijftien.eligible.find(c => c.naam === 'Kandidaat')), true);
  assert.strictEqual(RK.METHODIEK_PARAMS[5].PUBLISH_MIN_REVIEWS, 15);
});

test('§2 — minder dan drie reviews in 24 maanden valt weg', () => {
  const twee = S.regio({ extra: [S.bedrijf('Kandidaat', 12, [...S.reviews(2, 6), ...S.reviews(10, 40)])] });
  const drie = S.regio({ extra: [S.bedrijf('Kandidaat', 13, [...S.reviews(3, 6), ...S.reviews(10, 40)])] });
  assert.strictEqual(S.isEligible(twee, 'Kandidaat'), false, '2 < MIN_RECENT (3)');
  assert.strictEqual(S.isEligible(drie, 'Kandidaat'), true, '3 = MIN_RECENT');
  assert.strictEqual(RK.MIN_RECENT, 3);
});

test('§2 — geen gemeente in de data betekent altijd weglaten', () => {
  const res = S.regio({ extra: [S.bedrijf('Zwever', 40, S.reviews(40, 6), { gemeente: '' })] });
  assert.strictEqual(S.isEligible(res, 'Zwever'), false,
    'zonder locatiegegevens kunnen we niet vaststellen dat het bedrijf in de regio werkt');
});

test('§2 — een gemeente buiten de regiolijst valt weg', () => {
  const res = S.regio({ extra: [S.bedrijf('Buurman', 40, S.reviews(40, 6), { gemeente: 'Anderdorp' })] });
  assert.strictEqual(S.isEligible(res, 'Buurman'), false);
});

test('§2 — zonder entry in beoordeling.json valt een bedrijf weg, mét melding', () => {
  const res = S.regio({ extra: [S.bedrijf('Onbeoordeeld', 40, S.reviews(40, 6))], beoExtra: [] });
  assert.strictEqual(S.isEligible(res, 'Onbeoordeeld'), false);
  assert.ok(res.warnings.some(w => w.includes('Onbeoordeeld') && w.includes('geen entry in beoordeling.json')),
    'het bedrijf haalt de objectieve drempels wél, dus dit kost het een plaats en moet gemeld worden');
});

test('§2 — nul opgenomen bedrijven is een harde fout, geen lege pagina', () => {
  assert.throws(
    () => S.regio({ extra: [S.bedrijf('Enige', 3, S.reviews(3, 6))], nVulling: 0 }),
    e => e instanceof RK.RekenFout && /geen enkel bedrijf voldoet/.test(e.message));
});

// ---------------------------------------------------------------------
// De website-eis (v3+) en de vakspecialist-eis (v4+) — § 2 en § Methodiek-versies
// ---------------------------------------------------------------------

test('§2 — geen geverifieerde website: opgenomen in v2, geweerd vanaf v3', () => {
  const zonderSite = [S.bedrijf('Zonder site', 20, S.reviews(20, 6), { website: null })];
  const beo = [{ bedrijf: 'Zonder site', reviewkwaliteit: 4, vakfocus: null, vakfocusBron: 'geen' }];
  assert.strictEqual(S.isEligible(S.regio({ extra: zonderSite, beoExtra: beo, methodiek: 2 }), 'Zonder site'), true);
  assert.strictEqual(S.isEligible(S.regio({ extra: zonderSite, beoExtra: beo, methodiek: 3 }), 'Zonder site'), false);
});

test('§2 — zonder vakfocus krijgt een v1/v2-bedrijf de regiomediaan (§3.4)', () => {
  const res = S.regio({
    extra: [S.bedrijf('Zonder site', 20, S.reviews(20, 6), { website: null })],
    beoExtra: [{ bedrijf: 'Zonder site', reviewkwaliteit: 4, vakfocus: null, vakfocusBron: 'geen' }],
    methodiek: 2,
  });
  const c = res.eligible.find(x => x.naam === 'Zonder site');
  assert.strictEqual(c.focus, res.focusMediaan, 'geen eigen vakfocus → mediaan van wie er wél een heeft');
});

for (const v of [4, 5]) {
  test('§2 — vakfocus exact op de vloer (2,5) telt mee in v' + v + ', 2,4 niet', () => {
    const maak = vakfocus => S.regio({
      extra: [S.bedrijf('Grensgeval', 20, S.reviews(20, 6))],
      beoExtra: [{ bedrijf: 'Grensgeval', reviewkwaliteit: 4, vakfocus, vakfocusBron: 'website' }],
      methodiek: v,
    });
    assert.strictEqual(S.isEligible(maak(2.5), 'Grensgeval'), true, '≥ VAKFOCUS_FLOOR is inclusief');
    assert.strictEqual(S.isEligible(maak(2.4), 'Grensgeval'), false);
    assert.strictEqual(RK.METHODIEK_PARAMS[v].VAKFOCUS_FLOOR, 2.5);
  });
}

test('§2 — v1/v2/v3 kennen de vakspecialist-eis niet', () => {
  for (const v of [1, 2, 3]) {
    const res = S.regio({
      extra: [S.bedrijf('Ander vak', 20, S.reviews(20, 6))],
      beoExtra: [{ bedrijf: 'Ander vak', reviewkwaliteit: 4, vakfocus: 1, vakfocusBron: 'website' }],
      methodiek: v,
    });
    assert.strictEqual(S.isEligible(res, 'Ander vak'), true, 'v' + v + ' heeft geen vakfocus-vloer');
    assert.strictEqual(RK.METHODIEK_PARAMS[v].VAKFOCUS_FLOOR, undefined);
  }
});

// ---------------------------------------------------------------------
// Rommelige data — § 2 en § 3
// ---------------------------------------------------------------------

test('§2 — nul bruikbare reviews valt weg, ook met een hoog Google-aantal', () => {
  // Google meldt 40 reviews, maar geen enkele heeft een bruikbare datum én score.
  // Er valt dan niets te wegen, dus het bedrijf kan niet meedingen.
  const res = S.regio({ extra: [S.bedrijf('Onbruikbaar', 40, [
    { datum: 'geen datum', score: 5 }, { datum: '2025-07-01' }, { score: 4 },
  ])] });
  const c = res.bedrijven.find(x => x.naam === 'Onbruikbaar');
  assert.strictEqual(c.nOK, 0);
  assert.strictEqual(c.vw, 0);
  assert.strictEqual(c.Rw, null, 'zonder gewicht is er geen gewogen gemiddelde');
  assert.strictEqual(S.isEligible(res, 'Onbruikbaar'), false);
  assert.ok(res.warnings.some(w => w.includes('Onbruikbaar') && w.includes('slechts 0 van 40')),
    'zo groot verschil tussen wat Google telt en wat bruikbaar is, hoort gemeld te worden');
});

test('een leeg reviews-veld laat de build niet struikelen', () => {
  const res = S.regio({ extra: [S.bedrijf('Leeg', 12, undefined)] });
  assert.strictEqual(S.isEligible(res, 'Leeg'), false);
  assert.strictEqual(res.bedrijven.find(x => x.naam === 'Leeg').nOK, 0);
});

test('een review zonder datum of zonder score telt niet mee', () => {
  const res = S.regio({ extra: [S.bedrijf('Kandidaat', 20, [
    ...S.reviews(18, 6), { score: 5 }, { datum: '2025-07-01' },
  ])] });
  const c = res.eligible.find(x => x.naam === 'Kandidaat');
  assert.strictEqual(c.nOK, 18, 'alleen reviews met datum én score zijn bruikbaar');
});

test('een review met een datum ná de peildatum telt als vers, niet als fout', () => {
  const res = S.regio({ extra: [S.bedrijf('Kandidaat', 20, [
    ...S.reviews(2, 6), ...S.reviews(17, 40), { datum: '2027-06-01', score: 5 },
  ])] });
  const c = res.eligible.find(x => x.naam === 'Kandidaat');
  assert.strictEqual(c.n24, 3, 'de leeftijd wordt op 0 afgekapt, dus de review is "vandaag"');
  assert.strictEqual(S.isEligible(res, 'Kandidaat'), true);
});

test('googleReviews als tekst valt terug op het aantal bruikbare reviews', () => {
  const res = S.regio({ extra: [S.bedrijf('Kandidaat', '20', S.reviews(20, 6))] });
  const c = res.eligible.find(x => x.naam === 'Kandidaat');
  assert.strictEqual(c.googleReviews, 20, 'geen getal in de data → tellen wat er ligt (nOK)');
});

test('een afgekapte review-export (exact 100) wordt apart gemeld', () => {
  const res = S.regio({ extra: [S.bedrijf('Grote speler', 582, S.reviews(100, 6))] });
  assert.deepStrictEqual(res.cappedExports, [{ naam: 'Grote speler', nOK: 100, rawCount: 582 }],
    'de Apify-standaardlimiet treft juist de grootste spelers en drukt hun vertrouwen');
});

test('een LLM-score buiten 1–5 wordt afgekapt en gemeld', () => {
  const res = S.regio({
    extra: [S.bedrijf('Kandidaat', 20, S.reviews(20, 6))],
    beoExtra: [{ bedrijf: 'Kandidaat', reviewkwaliteit: 7, vakfocus: 4, vakfocusBron: 'website' }],
  });
  const c = res.eligible.find(x => x.naam === 'Kandidaat');
  assert.strictEqual(c.rq, 1, 'reviewkwaliteit 7 → afgekapt op 5 → genormaliseerd 1');
  assert.ok(res.warnings.some(w => w.includes('valt buiten 1–5')));
});

test('een ontbrekende reviewkwaliteit valt terug op 3 en wordt gemeld', () => {
  const res = S.regio({
    extra: [S.bedrijf('Kandidaat', 20, S.reviews(20, 6))],
    beoExtra: [{ bedrijf: 'Kandidaat', vakfocus: 4, vakfocusBron: 'website' }],
  });
  const c = res.eligible.find(x => x.naam === 'Kandidaat');
  assert.strictEqual(c.rq, 0.5, 'terugval 3 → (3−1)/4 = 0,5');
  assert.ok(res.warnings.some(w => w.includes('teruggevallen op 3.0')));
});

test('de bedrijfsnaam wordt genormaliseerd: hoofdletters en dubbele spaties', () => {
  const res = S.regio({
    extra: [S.bedrijf('DAK   Werken  BV', 20, S.reviews(20, 6))],
    beoExtra: [{ bedrijf: 'dak werken bv', reviewkwaliteit: 5, vakfocus: 5, vakfocusBron: 'website' }],
  });
  const c = res.eligible.find(x => x.naam === 'DAK   Werken  BV');
  assert.ok(c, 'de beoordeling hoort gekoppeld te worden ondanks de schrijfwijze');
  assert.strictEqual(c.rq, 1, 'de gekoppelde beoordeling is echt gebruikt');
});

// Bewuste keuze, vastgelegd zodat ze niet ongemerkt omslaat: een dubbele naam
// is een WAARSCHUWING, geen harde stop. Drie live pagina's (Antwerpen,
// Brasschaat, Mechelen) bevatten vandaag zulke dubbels — twee vestigingen van
// hetzelfde bedrijf. Hard falen zou die pagina's onbouwbaar maken zonder dat er
// iets mis is met wat er online staat. Het opruimen hoort thuis in
// scripts/normalize.js, vóór de data hier binnenkomt (opdracht 14).
test('een dubbele bedrijfsnaam waarschuwt, maar stopt de build niet', () => {
  const res = S.regio({ extra: [
    S.bedrijf('Dubbel', 20, S.reviews(20, 6)),
    S.bedrijf('Dubbel', 20, S.reviews(20, 6)),
  ], beoExtra: [{ bedrijf: 'Dubbel', reviewkwaliteit: 4, vakfocus: 4, vakfocusBron: 'website' }] });
  assert.ok(res.warnings.some(w => w.includes('dubbele bedrijfsnaam')));
  assert.strictEqual(res.eligible.filter(c => c.naam === 'Dubbel').length, 2,
    'beide vestigingen blijven meedingen en delen dezelfde beoordeling');
});

// ---------------------------------------------------------------------
// Volgorde en aantal — METHODIEK.md § 3 en § 4
// ---------------------------------------------------------------------

test('§3 — gelijke composite: eerst het grotere gewogen volume, dan de naam', () => {
  // Twee identieke bedrijven verschillen alleen in naam → alfabetisch (nl).
  const res = S.regio({ extra: [
    S.bedrijf('Zeta', 20, S.reviews(20, 6)),
    S.bedrijf('Alfa', 20, S.reviews(20, 6)),
  ], beoExtra: [
    { bedrijf: 'Zeta', reviewkwaliteit: 5, vakfocus: 5, vakfocusBron: 'website' },
    { bedrijf: 'Alfa', reviewkwaliteit: 5, vakfocus: 5, vakfocusBron: 'website' },
  ] });
  const z = res.eligible.find(c => c.naam === 'Zeta');
  const a = res.eligible.find(c => c.naam === 'Alfa');
  assert.strictEqual(z.composite, a.composite, 'de opzet klopt alleen als ze echt gelijk scoren');
  assert.ok(S.positie(res, 'Alfa') < S.positie(res, 'Zeta'), 'gelijke stand → naam oplopend');

  // Bij een groter gewogen volume wint dat, ongeacht de naam. Om de composite
  // écht gelijk te houden krijgt iedereen hier vijf sterren: dan is het
  // regiogemiddelde ook 5, corrigeert Bayes niets meer en is het vertrouwen
  // voor iedereen 1 — het volume is dan de enige overgebleven verschilmaker.
  const res2 = S.regio({ vulScore: 5, extra: [
    S.bedrijf('Zeta', 40, S.reviews(40, 6)),
    S.bedrijf('Alfa', 20, S.reviews(20, 6)),
  ], beoExtra: [
    { bedrijf: 'Zeta', reviewkwaliteit: 5, vakfocus: 5, vakfocusBron: 'website' },
    { bedrijf: 'Alfa', reviewkwaliteit: 5, vakfocus: 5, vakfocusBron: 'website' },
  ] });
  const z2 = res2.eligible.find(c => c.naam === 'Zeta');
  const a2 = res2.eligible.find(c => c.naam === 'Alfa');
  assert.strictEqual(z2.composite, a2.composite);
  assert.ok(z2.vw > a2.vw);
  assert.ok(S.positie(res2, 'Zeta') < S.positie(res2, 'Alfa'), 'meer gewogen volume gaat voor');
});

test('§4 — een dunne regio krijgt een Top 5, een diepe een Top 10', () => {
  const dun = S.regio({ extra: [], nVulling: 9 });
  const diep = S.regio({ extra: [], nVulling: 10 });
  assert.strictEqual(dun.nListed, RK.LISTED_SMALL, '< SMALL_REGION_THRESHOLD eligible → Top 5');
  assert.strictEqual(dun.vignet, 'Top 5');
  assert.strictEqual(diep.nListed, RK.LISTED_FULL);
  assert.strictEqual(diep.vignet, 'Top 10');
  assert.strictEqual(RK.SMALL_REGION_THRESHOLD, 10);
});

test('§4 — met minder eligible bedrijven dan een Top 5 tonen we er precies zoveel', () => {
  const res = S.regio({ extra: [], nVulling: 4 });
  assert.strictEqual(res.nListed, 4);
  assert.strictEqual(res.vignet, 'Top 4', 'de lijst wordt nooit opgevuld met wie er niet is');
});

// ---------------------------------------------------------------------
// De vier dimensies — METHODIEK.md § 3.1 t/m 3.4
// ---------------------------------------------------------------------

test('§3 — de composite is precies 35/30/15/20 van de vier dimensies', () => {
  const res = S.regio({ extra: [S.bedrijf('Kandidaat', 20, S.reviews(20, 6))] });
  const c = res.eligible.find(x => x.naam === 'Kandidaat');
  const verwacht = 0.35 * c.trust + 0.30 * c.rq + 0.15 * c.recency + 0.20 * c.focus;
  assert.ok(Math.abs(c.composite - verwacht) < 1e-12);
  assert.deepStrictEqual(RK.WEIGHTS, { trust: 0.35, reviewQuality: 0.30, recency: 0.15, focus: 0.20 });
});

test('§3.1 — een oudere review weegt minder: halveringstijd twee jaar', () => {
  const vers = S.regio({ extra: [S.bedrijf('Kandidaat', 20, S.reviews(20, 0))] });
  const oud = S.regio({ extra: [S.bedrijf('Kandidaat', 20, [...S.reviews(3, 6), ...S.reviews(17, 24)])] });
  const a = vers.eligible.find(c => c.naam === 'Kandidaat');
  const b = oud.eligible.find(c => c.naam === 'Kandidaat');
  assert.strictEqual(RK.HALFLIFE_JAREN, 2);
  assert.ok(a.vw > b.vw, 'verse reviews leveren meer gewogen volume dan even veel oude');
  assert.ok(Math.abs(a.vw - 20) < 0.01, 'reviews van de peildatum zelf wegen elk 1');
});

test('§3.3 — recentheid verzadigt op het anker van de versie (6 in v1, 10 vanaf v2)', () => {
  const zes = c => S.regio({ extra: [S.bedrijf('Kandidaat', 20, [...S.reviews(6, 6), ...S.reviews(14, 40)])], methodiek: c })
    .eligible.find(x => x.naam === 'Kandidaat').recency;
  assert.strictEqual(zes(1), 1, 'v1: zes recente reviews is de volle score');
  assert.strictEqual(zes(2), 0.6, 'v2: zes van de tien');
  assert.strictEqual(RK.METHODIEK_PARAMS[1].RECENCY_ANCHOR, 6);
  assert.strictEqual(RK.METHODIEK_PARAMS[2].RECENCY_ANCHOR, 10);
});

test('§3.1 — de vertrouwen-vloer verschilt per versie (3,5 in v1, 4,0 vanaf v2)', () => {
  const trust = v => S.regio({ extra: [S.bedrijf('Kandidaat', 20, S.reviews(20, 6, 4.6))], methodiek: v })
    .eligible.find(x => x.naam === 'Kandidaat').trust;
  assert.ok(trust(1) > trust(2), 'een lagere vloer geeft dezelfde Bayes-score een hoger vertrouwen');
  assert.strictEqual(RK.METHODIEK_PARAMS[1].TRUST_FLOOR, 3.5);
  assert.strictEqual(RK.METHODIEK_PARAMS[2].TRUST_FLOOR, 4.0);
  assert.strictEqual(RK.TRUST_CEIL, 5.0);
});

test('§3.1 — Bayes trekt een dun onderbouwd gemiddelde naar het regiogemiddelde', () => {
  const res = S.regio({ extra: [
    S.bedrijf('Dun perfect', 10, S.reviews(10, 6, 5)),
    S.bedrijf('Dik perfect', 200, S.reviews(200, 6, 5)),
  ] });
  const dun = res.eligible.find(c => c.naam === 'Dun perfect');
  const dik = res.eligible.find(c => c.naam === 'Dik perfect');
  assert.ok(Math.abs(dun.Rw - 5) < 1e-9);
  assert.ok(Math.abs(dik.Rw - 5) < 1e-9, 'beide hebben een perfect gemiddelde');
  assert.ok(dun.bayes < dik.bayes, 'maar het dunne profiel wordt sterker naar de prior getrokken');
  assert.strictEqual(RK.BAYES_M, 16);
});
