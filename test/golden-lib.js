// =====================================================================
// test/golden-lib.js — de data inlezen en de rekenkern uitlezen
//
// De tests draaien `lib/rekenkern.js` rechtstreeks: dezelfde bestanden die
// build.js leest gaan erin, en de momentopname komt eruit. Er wordt niets
// geschreven, niets gepubliceerd en build.js komt er niet aan te pas — de
// rekenkern doet immers geen I/O.
//
// Wat er in een momentopname staat, staat hieronder in `snapshotVan`. Dat is
// bewust ruimer dan de gepubliceerde Top N: álle eligible bedrijven, met hun
// vier dimensies en hun composite. Zie test/README.md.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const RK = require(path.join(ROOT, 'lib', 'rekenkern'));
const R = require(path.join(ROOT, 'lib', 'registry'));
const WA = require(path.join(ROOT, 'lib', 'whatsapp'));

// Alle live slugs, in dezelfde volgorde als de registry ze kent.
function alleSlugs() {
  return R.loadRegistry(ROOT).map(e => e.slug);
}

// Dezelfde vier invoerbronnen als build.js, op dezelfde plaatsen.
function invoerVoor(slug) {
  const entry = R.loadRegistry(ROOT).find(e => e.slug === slug);
  if (!entry) throw new Error('onbekende slug: ' + slug);
  const configPad = path.join(ROOT, 'config', entry.niche, slug + '.json');
  const lees = p => JSON.parse(fs.readFileSync(p, 'utf8'));
  return {
    config: lees(configPad),
    reviews: lees(path.join(ROOT, 'data', slug, 'reviews.json')),
    beoordeling: lees(path.join(ROOT, 'data', slug, 'beoordeling.json')),
    whatsapp: WA.forSlug(ROOT, slug).map,
  };
}

// De momentopname zelf. Getallen op zes decimalen, zodat drijvende-kommaruis
// tussen machines geen vals alarm geeft maar een echte verschuiving wel.
function snapshotVan(slug, res, config) {
  const r6 = x => (typeof x === 'number' && isFinite(x)) ? Number(x.toFixed(6)) : null;
  return {
    slug,
    methodiek: res.methodiekVersie,
    peildatum: config.peildatum,
    aantalBedrijven: res.bedrijven.length,
    aantalEligible: res.eligible.length,
    aantalPublicabel: res.publishableCount,
    nListed: res.nListed,
    vignet: res.vignet,
    prior: r6(res.prior),
    focusMediaan: r6(res.focusMediaan),
    selectie: res.selectie.map(c => c.naam),
    eligible: res.eligible.map(c => ({
      naam: c.naam,
      gemeente: c.gemeente,
      googleReviews: c.googleReviews,
      bruikbareReviews: c.nOK,
      n24: c.n24,
      vw: r6(c.vw),
      Rw: r6(c.Rw),
      bayes: r6(c.bayes),
      trust: r6(c.trust),
      rq: r6(c.rq),
      recency: r6(c.recency),
      focus: r6(c.focus),
      composite: r6(c.composite),
      publicabel: res.isPublishable(c),
      positie: c.positie || null,
    })),
    waarschuwingen: res.warnings.slice().sort(),
  };
}

// Rekent één live pagina door en geeft de momentopname terug.
function berekenSnapshot(slug) {
  const invoer = invoerVoor(slug);
  return snapshotVan(slug, RK.bereken(invoer), invoer.config);
}

function goldenPad(slug) { return path.join(GOLDEN_DIR, slug + '.json'); }

function leesGolden(slug) {
  const p = goldenPad(slug);
  if (!fs.existsSync(p)) {
    throw new Error('geen snapshot voor ' + slug + ' — draai: node test/genereer-golden.js ' + slug);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function schrijfGolden(slug, snapshot) {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  fs.writeFileSync(goldenPad(slug), JSON.stringify(snapshot, null, 2) + '\n');
}

// Leesbaar verschil tussen twee snapshots: welke velden wijken af, en hoeveel.
// Bedoeld voor de foutmelding van een falende test, niet voor volledigheid —
// de eerste tien afwijkingen zeggen genoeg om te weten wat er gebeurd is.
function verschillen(verwacht, gekregen, pad = '', uit = []) {
  if (uit.length >= 10) return uit;
  const beide = new Set([
    ...(verwacht && typeof verwacht === 'object' ? Object.keys(verwacht) : []),
    ...(gekregen && typeof gekregen === 'object' ? Object.keys(gekregen) : []),
  ]);
  if (!beide.size || verwacht === null || gekregen === null ||
      typeof verwacht !== 'object' || typeof gekregen !== 'object') {
    if (JSON.stringify(verwacht) !== JSON.stringify(gekregen)) {
      uit.push('  ' + (pad || '(geheel)') + ': verwacht ' + JSON.stringify(verwacht) +
        ', gekregen ' + JSON.stringify(gekregen));
    }
    return uit;
  }
  for (const k of beide) {
    const sub = pad ? pad + '.' + k : k;
    verschillen(verwacht ? verwacht[k] : undefined, gekregen ? gekregen[k] : undefined, sub, uit);
    if (uit.length >= 10) break;
  }
  return uit;
}

module.exports = {
  ROOT, GOLDEN_DIR, RK,
  alleSlugs, invoerVoor, snapshotVan, berekenSnapshot,
  leesGolden, schrijfGolden, goldenPad, verschillen,
};
