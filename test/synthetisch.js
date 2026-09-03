// =====================================================================
// test/synthetisch.js — verzonnen regio's om randgevallen mee te testen
//
// Geen echte data: die staat in de golden-tests. Hier bouwen we precies de
// situatie die we willen onderzoeken — negen reviews in plaats van tien, twee
// recente in plaats van drie, een vakfocus die exact op de vloer ligt.
//
// Alles hangt aan één peildatum, zodat "zes maanden geleden" en "veertig
// maanden geleden" vaste, reproduceerbare datums zijn.
// =====================================================================
'use strict';
const path = require('path');
const RK = require(path.join(__dirname, '..', 'lib', 'rekenkern'));

const PEILDATUM = '2026-01-01';

// Een datum, uitgedrukt in hele maanden vóór de peildatum.
function maandenGeleden(m) {
  const d = new Date(Date.UTC(2026, 0, 1));
  d.setUTCMonth(d.getUTCMonth() - m);
  return d.toISOString().slice(0, 10);
}

// n reviews van dezelfde ouderdom en score.
function reviews(n, m, score = 5) {
  return Array.from({ length: n }, () => ({ datum: maandenGeleden(m), score }));
}

function config(over = {}) {
  return Object.assign({
    slug: 'test-regio',
    vak: { mv: 'dakwerkers', mvCap: 'Dakwerkers', ev: 'dakwerker', kort: 'dakwerken' },
    regio: { naam: 'Testregio', kern: 'Testdorp', provincie: 'Oost-Vlaanderen' },
    gemeenten: ['Testdorp'],
    peildatum: PEILDATUM,
    updateDatum: PEILDATUM,
    methodiek: 5,
  }, over);
}

// Eén bedrijf zoals normalize.js het in reviews.json zet.
function bedrijf(naam, googleReviews, revs, over = {}) {
  return Object.assign({
    bedrijf: naam,
    gemeente: 'Testdorp',
    website: 'https://voorbeeld.be',
    googleScore: 5,
    googleReviews,
    reviews: revs,
  }, over);
}

// Een beoordeling.json voor een lijst namen, allemaal met dezelfde cijfers.
function beoordeling(namen, over = {}) {
  return {
    bedrijven: namen.map(n => Object.assign({
      bedrijf: typeof n === 'string' ? n : n.bedrijf,
      reviewkwaliteit: 4,
      vakfocus: 4,
      vakfocusBron: 'website',
      synthese: 'Testtekst.',
      chips: [],
    }, over)),
  };
}

// Vulbedrijven: identiek, ruim boven elke drempel, zodat de regio diep genoeg is
// om een Top 10 te tonen en het onderzochte bedrijf de enige variabele blijft.
function vulling(n, score = 4) {
  return Array.from({ length: n }, (_, i) =>
    bedrijf('Vulbedrijf ' + String(i).padStart(2, '0'), 20, reviews(20, 6, score)));
}

// Rekent een verzonnen regio door. `extra` zijn de bedrijven die je onderzoekt;
// ze worden vóór de vulling gezet en krijgen desgewenst een eigen beoordeling.
function regio({ extra = [], nVulling = 11, methodiek = 5, beoExtra = null,
                 configOver = {}, vulScore = 4 } = {}) {
  const vul = vulling(nVulling, vulScore);
  const alle = [...extra, ...vul];
  const beo = beoordeling(vul.map(c => c.bedrijf));
  beo.bedrijven = (beoExtra || beoordeling(extra.map(c => c.bedrijf)).bedrijven).concat(beo.bedrijven);
  return RK.bereken({
    config: config(Object.assign({ methodiek }, configOver)),
    reviews: alle,
    beoordeling: beo,
  });
}

// Staat dit bedrijf tussen de opgenomen bedrijven?
const isEligible = (res, naam) => res.eligible.some(c => c.naam === naam);
// Op welke plaats staat het op de pagina? 0 = staat er niet op.
const positie = (res, naam) => res.selectie.findIndex(c => c.naam === naam) + 1;

module.exports = {
  RK, PEILDATUM, maandenGeleden, reviews, config, bedrijf, beoordeling,
  vulling, regio, isEligible, positie,
};
