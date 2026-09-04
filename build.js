#!/usr/bin/env node
// =====================================================================
// build.js — Keurwijzer ranking-engine + paginagenerator
//            >>> VARIANT "TOP 10-CONCEPT" (geen zichtbare score op 10) <<<
//
// Gebruik:  node build.js <slug>
// Voorbeeld: node build.js dakwerkers-gent
//
// Leest:
//   config/<slug>.json            pagina-instellingen (vak, regio, gemeenten, peildatum)
//   data/<slug>/reviews.json      genormaliseerde reviews (via scripts/normalize.js)
//   data/<slug>/beoordeling.json  LLM-output (reviewkwaliteit, vakfocus, synthese, chips)
//   template.html                 design-template
//
// Schrijft:
//   output/<slug>/index.html                     de statische directorypagina (enkel de Top N)
//   data/<slug>/selectie.json                    het selectieslot (de eerste build legt het aan)
//   badges/<slug>/badges.json                    invoer voor scripts/genereer-badges.js
//   reports/<slug>/<slug>-rapport.txt            controlerapport met alle tussenscores
//   reports/<slug>/<slug>-prospectie-dasslim.md  prospectielijst (11–20 + nog-niet-eligible)
//
// WAT VERSCHILT MET HET ORIGINEEL:
//   - De site toont GEEN cijfer op 10 meer. In plaats daarvan een vignet
//     "Top 10" of "Top 5" en een rangnummer (#1..#N). De volgorde blijft
//     behouden (composite), enkel het cijfer verdwijnt van de pagina.
//   - Het aantal getoonde bedrijven is dynamisch: Top 10 bij voldoende
//     diepgang, Top 5 in een dunne regio (weinig eligible bedrijven).
//   - Bedrijven 11–20 en de niet-eligible bedrijven staan NIET meer op de
//     site. Ze blijven in het rapport en komen in een apart prospectie-
//     document voor dasslim.be.
//
// ALLE berekeningen gebeuren in lib/rekenkern.js, deterministisch. Dit bestand
// leest de invoer, laat daar rekenen, bewaakt het selectieslot en rendert. De
// LLM beoordeelt alleen tekst (reviewkwaliteit, vakfocus, synthese) — nooit de
// eindscore, de selectie of de volgorde.
//
// Methodiek (de formules zelf staan in lib/rekenkern.js):
//   - Reviewgewicht:  w = 0.5 ^ (leeftijd_in_jaren / HALFLIFE_JAREN)
//   - Vertrouwen:     tijdsgewogen Bayes  W = v/(v+m)·R + m/(v+m)·C
//                     met v = som van gewichten, R = gewogen gem. score,
//                     C = gem. gewogen score van alle opgenomen bedrijven
//   - Recentheid:     min(aantal reviews laatste 24m / RECENCY_ANCHOR, 1)
//                     (anker 6 in v1, 10 vanaf v2)
//   - Reviewkwaliteit / Vakfocus: (LLM-score − 1) / 4;
//     geen website → mediaan-vakfocus van bedrijven mét website
//   - Composite = 35% vertrouwen + 30% reviewkwaliteit + 15% recentheid + 20% vakfocus
//   - Selectie + volgorde: de bedrijven met de hoogste composite vormen de Top N;
//     er wordt GEEN cijfer meer op 10 gepubliceerd (enkel het rangnummer + vignet).
//   - Opname: gemeente in lijst + ≥ MIN_REVIEWS reviews + ≥ MIN_RECENT in 24m
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

// ---------------- de rekenkern -------------------------------------------
// De gewichten, de drempels, de methodiek-versies en de volledige berekening
// staan in lib/rekenkern.js. Dat is de bindende bron voor élk getal op de
// pagina; build.js leest, laat rekenen en rendert. Zo is de rekenkern los te
// draaien en dus te testen (test/rekenkern.golden.test.js).
const RK = require('./lib/rekenkern');
const { WEIGHTS, MIN_REVIEWS, MIN_RECENT, TRUST_CEIL, METHODIEK_LATEST,
        clamp, norm } = RK;

// Vak-specifiek schema.org-subtype voor de bedrijven in de JSON-LD ItemList (v3+).
// Elk subtype is een afstammeling van HomeAndConstructionBusiness (de veilige
// fallback), dus onbekende niches blijven geldig gemarkeerd. Voeg een niche toe
// zodra je zeker bent van het juiste schema.org-type (bij twijfel: fallback laten
// staan — nooit een type verzinnen). Een config kan dit overrulen via vak.schemaType.
const SCHEMA_TYPE_BY_NICHE = {
  dakwerkers: 'RoofingContractor',
  dakdekkers: 'RoofingContractor'
};

const EXTRA_MAX = 10;         // 11–20: niet op de site, wél in het prospectiedocument (dasslim.be)
const WATCHLIST_MAX = 10;     // niet-eligible in de regio: niet op de site, wél in rapport + prospectie

// ---------------- helpers ---------------------------------------------
function die(msg) { console.error('FOUT: ' + msg); process.exit(1); }
function readJSON(p) {
  if (!fs.existsSync(p)) die('bestand niet gevonden: ' + p);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die('ongeldige JSON in ' + p + ' — ' + e.message); }
}
// De methodiek-pin in de config schrijven. Tekstueel, niet via JSON.stringify:
// de configs gebruiken bewust inline objecten ("syn": { ... }); een herserialisatie
// zou die uit elkaar trekken en het hele bestand als gewijzigd tonen in plaats van
// één regel.
function schrijfPin(configPad, versie) {
  const ruw = fs.readFileSync(configPad, 'utf8');
  const bestaand = /^([ \t]*)"methodiek"([ \t]*):([ \t]*)\d+(,?)[ \t]*$/m;
  if (bestaand.test(ruw)) {
    fs.writeFileSync(configPad, ruw.replace(bestaand,
      (m, i, a, b, komma) => i + '"methodiek"' + a + ':' + b + versie + komma));
    return;
  }
  // Nog geen veld: pal na "slug" invoegen, zoals in alle bestaande configs.
  const naSlug = /^([ \t]*)"slug"[ \t]*:[ \t]*"[^"]*",[ \t]*$/m;
  if (!naSlug.test(ruw))
    die('kan de pin niet schrijven: ' + configPad + ' heeft geen herkenbare "slug"-regel.\n' +
        '       Voeg "methodiek": ' + versie + ' met de hand toe.');
  fs.writeFileSync(configPad, ruw.replace(naSlug,
    (m, i) => m + '\n' + i + '"methodiek": ' + versie + ','));
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function nlNum(x, dec) { return x.toFixed(dec).replace('.', ','); }
// Slug voor chips én badge-bestandsnamen. Eén bron met de navigatie-slugs:
// delegeert naar lib/registry.js `slugify`, zodat beide niet uiteenlopen
// (o.a. identieke accentafhandeling, inclusief ç). R wordt hieronder ingeladen;
// elke aanroep gebeurt ruim ná die require.
function chipSlug(label) { return R.slugify(label); }
function chipLabel(slug) {
  const s = String(slug).replace(/-/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Zoekt de config plat (config/<slug>.json) of in één niche-submap
// (config/<niche>/<slug>.json). Geeft { configPath, niche } terug;
// niche is null bij een platte config.
function findConfig(slug) {
  const flat = path.join(ROOT, 'config', slug + '.json');
  if (fs.existsSync(flat)) return { configPath: flat, niche: null };
  const configDir = path.join(ROOT, 'config');
  if (fs.existsSync(configDir)) {
    for (const entry of fs.readdirSync(configDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = path.join(configDir, entry.name, slug + '.json');
      if (fs.existsSync(p)) return { configPath: p, niche: entry.name };
    }
  }
  die('config niet gevonden: config/' + slug + '.json of config/<niche>/' + slug + '.json');
}

// ---------------- input inlezen ----------------------------------------
// Vlaggen mogen voor of na de slug staan, zodat
// `node build.js <slug> --nieuwe-selectie` en de omgekeerde volgorde allebei werken.
const argv = process.argv.slice(2);
const slug = argv.find(a => !a.startsWith('--'));
// Ontgrendelt het selectieslot: legt de selectie van deze build opnieuw vast in
// plaats van te stoppen bij een verschil. Bedoeld voor de jaarlijkse update met
// verse data. Zie "stap 4a" verderop.
const HERIJK = argv.includes('--nieuwe-selectie');
// Zet de methodiek-versie waarop deze pagina gepubliceerd is vast in de config.
// Dat is de vaste publicatiestap uit CLAUDE.md, nu als één commando: de versie
// komt uit data/<slug>/selectie.json, dus uit wat er daadwerkelijk online staat.
const PIN = argv.includes('--pin');
if (!slug) die('gebruik: node build.js <slug> [--nieuwe-selectie] [--pin]   (bv. node build.js dakwerkers-gent)');

const ROOT = __dirname;
const { configPath, niche } = findConfig(slug);
const config = readJSON(configPath);
const reviewData = readJSON(path.join(ROOT, 'data', slug, 'reviews.json'));
const beoordeling = readJSON(path.join(ROOT, 'data', slug, 'beoordeling.json'));
const template = fs.readFileSync(path.join(ROOT, 'template.html'), 'utf8');

// Centrale paginaregistry (alle config/<niche>/*.json) — bron voor broodkruimel,
// kruislinks, hubs en sitemap. De huidige pagina zoeken we erin op via de slug.
const R = require('./lib/registry');
const registry = R.loadRegistry(ROOT);
const pageEntry = registry.find(e => e.slug === slug) || null;

// WhatsApp-nummers die bedrijven zélf hebben doorgegeven. Puur contactinfo:
// staat volledig buiten de methodiek (geen versieblok, geen invloed op scores,
// selectie of volgorde) en geldt daarom op pagina's van élke methodiek-versie.
const WA = require('./lib/whatsapp');
const { map: waMap, fouten: waFouten } = WA.forSlug(ROOT, slug);
if (waFouten.length) die('WhatsApp-nummers:\n  - ' + waFouten.join('\n  - '));
// Een tikfout in de bedrijfsnaam zou de knop stilzwijgend laten verdwijnen —
// precies wat je niet wil bij een bedrijf dat zijn nummer heeft doorgegeven.
// Dus: harde stop, mét de meest gelijkende naam uit de data als suggestie.
{
  const namen = reviewData.map(c => String(c.bedrijf || '')).filter(Boolean);
  const namenNorm = new Set(namen.map(norm));
  // Afstand op letterniveau (Levenshtein), niet op gedeelde woorden: bijna elke
  // dakwerkersnaam bevat "dakwerken", dus woordoverlap wijst de verkeerde kant op.
  function afstand(a, b) {
    const rij = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let vorig = rij[0]; rij[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = rij[j];
        rij[j] = Math.min(rij[j] + 1, rij[j - 1] + 1, vorig + (a[i - 1] === b[j - 1] ? 0 : 1));
        vorig = tmp;
      }
    }
    return rij[b.length];
  }
  const onbekend = [];
  for (const [naamNorm, rij] of waMap) {
    if (namenNorm.has(naamNorm)) continue;
    const beste = namen
      .map(n => ({ n, d: afstand(naamNorm, norm(n)) }))
      .sort((a, b) => a.d - b.d)[0];
    // Alleen suggereren als het écht op een tikfout lijkt (max ~1 fout per 4 letters).
    const lijkt = beste && beste.d <= Math.max(2, Math.ceil(naamNorm.length / 4));
    onbekend.push('"' + rij.bedrijf + '" komt niet voor in data/' + slug + '/reviews.json' +
      (lijkt ? ' — bedoelde je "' + beste.n + '"?' : ''));
  }
  if (onbekend.length) die('WhatsApp-nummers:\n  - ' + onbekend.join('\n  - '));
}

['vak', 'regio', 'gemeenten', 'peildatum', 'updateDatum'].forEach(k => {
  if (!config[k]) die('config mist veld "' + k + '"');
});
if (!config.vak.mv) die('config mist veld "vak.mv"');
if (!config.regio.naam || !config.regio.kern || !config.regio.provincie)
  die('config.regio mist "naam", "kern" of "provincie"');
const peildatum = new Date(config.peildatum + 'T00:00:00Z');
if (isNaN(peildatum)) die('config.peildatum is geen geldige datum (verwacht JJJJ-MM-DD)');

// ---------------- de methodiek-pin afdwingen ---------------------------
// Een pagina die online staat heeft een data/<slug>/selectie.json, en daarin
// staat op welke methodiek-versie ze gepubliceerd is. Vanaf dat moment MOET de
// config die versie ook dragen: zonder pin bouwt ze mee met METHODIEK_LATEST en
// verandert de rekenwijze stilzwijgend (opnametekst, JSON-LD, drempels). Tot nu
// was dat een afspraak in CLAUDE.md; hier is het een harde stop.
// Een NIEUWE pagina heeft nog geen selectie.json en hoort geen versieveld te
// dragen — die bouwt bewust op de nieuwste logica.
const selectiePad = path.join(ROOT, 'data', slug, 'selectie.json');
const gepubliceerdeVersie = fs.existsSync(selectiePad)
  ? readJSON(selectiePad).methodiek
  : undefined;

if (PIN) {
  if (gepubliceerdeVersie == null)
    die('--pin kan niets vastzetten: data/' + slug + '/selectie.json bestaat nog niet\n' +
        '       (of draagt geen "methodiek"). Pin pas vast zodra de pagina online staat.');
  if (config.methodiek === gepubliceerdeVersie) {
    console.log('· pin ongewijzigd: de config draagt al methodiek v' + gepubliceerdeVersie);
  } else {
    const was = config.methodiek;
    schrijfPin(configPath, gepubliceerdeVersie);
    config.methodiek = gepubliceerdeVersie;
    console.log('✓ pin gezet: methodiek v' + gepubliceerdeVersie + ' in ' + configPath +
                (was == null ? ' (config had nog geen pin)' : ' (was v' + was + ')'));
  }
} else if (gepubliceerdeVersie != null && !HERIJK) {
  if (config.methodiek == null)
    die('deze pagina staat gepubliceerd op methodiek v' + gepubliceerdeVersie + ', maar de\n' +
        '       config draagt geen pin. Zonder pin bouwt ze mee met METHODIEK_LATEST (v' +
        METHODIEK_LATEST + ') en\n' +
        '       verandert de rekenwijze stilzwijgend.\n' +
        '       → Pin vastzetten: node build.js ' + slug + ' --pin');
  if (config.methodiek !== gepubliceerdeVersie)
    die('de config draagt methodiek v' + config.methodiek + ', maar deze pagina is\n' +
        '       gepubliceerd op v' + gepubliceerdeVersie + '. Verhoog het versienummer van een\n' +
        '       bestaande config nooit zonder uitdrukkelijke vraag (CLAUDE.md).\n' +
        '       → Terug naar de gepubliceerde versie: node build.js ' + slug + ' --pin\n' +
        '       → Bewust herijken met verse data:     node build.js ' + slug + ' --nieuwe-selectie');
}

// ---------------- rekenen ------------------------------------------------
// Vanaf hier zijn alle getallen bekend. De berekening zelf staat in
// lib/rekenkern.js; build.js voegt er niets aan toe. Wat hieronder volgt is
// bewaken (het selectieslot), renderen en wegschrijven.
let RES;
try {
  RES = RK.bereken({ config, reviews: reviewData, beoordeling, whatsapp: waMap });
} catch (e) {
  if (e instanceof RK.RekenFout) die(e.message);
  throw e;
}
const { methodiekVersie, P, TRUST_FLOOR, vakDef, nListed, vignet,
        focusMediaan, publishableCount, isPublishable, cappedExports, warnings } = RES;
const C = RES.prior;                 // regiobasis (tijdsgewogen regiogemiddelde)
const companies = RES.bedrijven;     // alle bedrijven uit reviews.json
const eligible = RES.eligible;       // opgenomen bedrijven, gesorteerd op composite
const top = RES.selectie;            // de gepubliceerde Top N, met .positie
const topSet = RES.selectieSet;

// ---------------- stap 4a: het SELECTIESLOT -----------------------------
// Regel van Olivier (03-09-2026): op een pagina die al online staat mogen de
// BEDRIJVEN niet meer veranderen. Aan de pagina zelf — opmaak, tekst, structured
// data — mag wél gesleuteld worden; volgend jaar volgt sowieso een volledige
// herberekening met verse data.
//
// Die regel stond nergens afgedwongen, en het is al één keer stil misgegaan:
// methodiek v5 haalde in Kortrijk twee bedrijven uit de selectie en dat viel pas
// weken later op, aan hun achtergebleven badges. Sinds publiceren rechtstreeks
// live gaat is er geen controlemoment meer dat zoiets opvangt.
//
// Daarom: de eerste build legt de gepubliceerde lijst vast in
// data/<slug>/selectie.json. Elke volgende build vergelijkt en STOPT bij een
// verschil — er wordt dan niets geschreven en niets gepubliceerd.
//
// De volgorde telt mee, niet alleen wie er in staat. De kwaliteitsbadges leiden
// hun tekst af uit de rang (#1 / Top 3 / Top 5 / Top 10), dus wie van #2 naar #4
// zakt heeft ineens een badge op zijn website die iets claimt wat niet meer klopt.
//
// Voor de jaarlijkse update: node build.js <slug> --nieuwe-selectie
{
  const slotPad = path.join(ROOT, 'data', slug, 'selectie.json');
  const nu = top.map(c => c.naam);

  const leggVast = (reden) => {
    fs.writeFileSync(slotPad, JSON.stringify({
      _uitleg: 'De gepubliceerde selectie van deze pagina, bevroren. build.js stopt ' +
               'als een volgende build een andere lijst of volgorde oplevert. ' +
               'Bewust herijken: node build.js ' + slug + ' --nieuwe-selectie',
      vastgelegd: new Date().toISOString().slice(0, 10),
      peildatum: config.peildatum,
      methodiek: methodiekVersie,
      bedrijven: nu,
    }, null, 2) + '\n');
    console.log('✓ selectie vastgelegd (' + nu.length + ' bedrijven) — ' + reden);
  };

  if (!fs.existsSync(slotPad)) {
    leggVast('data/' + slug + '/selectie.json bestond nog niet');
  } else if (HERIJK) {
    const oud = (readJSON(slotPad).bedrijven || []);
    leggVast('herijkt met --nieuwe-selectie (was ' + oud.length + ' bedrijven)');
  } else {
    const oud = (readJSON(slotPad).bedrijven || []).map(String);
    const zelfde = oud.length === nu.length &&
      oud.every((n, i) => norm(n) === norm(nu[i]));
    if (!zelfde) {
      const oudSet = new Set(oud.map(norm));
      const nuSet = new Set(nu.map(norm));
      const rang = (lijst, naam) => lijst.findIndex(n => norm(n) === norm(naam)) + 1;
      const regels = [];
      const verdwenen = oud.filter(n => !nuSet.has(norm(n)));
      const nieuw = nu.filter(n => !oudSet.has(norm(n)));
      const verschoven = nu.filter(n => oudSet.has(norm(n)) && rang(oud, n) !== rang(nu, n));
      if (verdwenen.length) {
        regels.push('  VERDWENEN — staan nu online, zouden van de pagina vallen:');
        verdwenen.forEach(n => regels.push('      · ' + n + '   (stond op #' + rang(oud, n) + ')'));
      }
      if (nieuw.length) {
        regels.push('  NIEUW — staan nog niet online:');
        nieuw.forEach(n => regels.push('      · ' + n + '   (zou op #' + rang(nu, n) + ' komen)'));
      }
      if (verschoven.length) {
        regels.push('  VERSCHOVEN — blijven staan, maar op een andere plaats:');
        verschoven.forEach(n => regels.push('      · ' + n + '   #' + rang(oud, n) + ' → #' + rang(nu, n)));
      }
      die('de selectie van deze pagina zou veranderen.\n\n' +
        '  De pagina staat online met een vastgelegde lijst\n' +
        '  (data/' + slug + '/selectie.json). Deze build levert een andere op:\n\n' +
        regels.join('\n') + '\n\n' +
        '  Er is NIETS gebouwd en NIETS gepubliceerd. De pagina online blijft zoals ze is.\n\n' +
        '  · Onbedoeld? Dan is er iets veranderd aan de data, de gemeentelijst of de\n' +
        '    methodiek-versie van deze pagina. Zet dat terug en bouw opnieuw.\n' +
        '  · Wél de bedoeling (de jaarlijkse update met verse data)? Draai dan:\n' +
        '        node build.js ' + slug + ' --nieuwe-selectie');
    }
  }
}

// ---------------- stap 4b: robuustheidstest (alleen voor het rapport) ----
// Vraag: welke gepubliceerde posities staan écht vast en welke zijn een
// dobbelworp? We verstoren de twee SUBJECTIEVE LLM-dimensies (reviewkwaliteit,
// vakfocus) van élk eligible bedrijf met een toevallige ±0,5 (één volle
// beoordelaarsstap) en tellen hoe vaak elk Top-N-bedrijf in de Top N blijft.
// Vertrouwen en recentheid zijn objectief berekend en blijven onaangeroerd;
// vakfocus uit de regiomediaan (geen website) is geen per-bedrijf LLM-oordeel
// en wordt ook niet verstoord. Determinisme blijft behouden: de PRNG heeft een
// vaste seed, dus zelfde data = exact hetzelfde robuustheidsoordeel. Dit
// verandert NIETS aan de gepubliceerde composite, selectie of volgorde.
{
  const TRIALS = 5000;
  let seed = 0x9e3779b9 >>> 0;                    // vaste seed → reproduceerbaar
  const rnd = () => {                             // mulberry32
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const jit = () => (rnd() - 0.5);                // uniform in [-0,5 ; +0,5]
  const inTopCount = new Array(top.length).fill(0);
  const posSamples = top.map(() => []);
  const scratch = eligible.map(c => ({ ref: c, s: 0 }));
  for (let t = 0; t < TRIALS; t++) {
    for (const o of scratch) {
      const c = o.ref;
      const rq = clamp((clamp(c._rqBase + jit(), 1, 5) - 1) / 4, 0, 1);
      const focus = (c._focusBase == null)
        ? c.focus
        : clamp((clamp(c._focusBase + jit(), 1, 5) - 1) / 4, 0, 1);
      o.s = c._objDeel + WEIGHTS.reviewQuality * rq + WEIGHTS.focus * focus;
    }
    scratch.sort((a, b) => b.s - a.s || b.ref.vw - a.ref.vw ||
      a.ref.naam.localeCompare(b.ref.naam, 'nl'));
    // Rang zoals de bezoeker hem ziet — MOET exact dezelfde ordening zijn als de
    // echte selectie hierboven (zie `top`), anders meet de test een rangschikking
    // die niemand ooit te zien krijgt.
    //   v4:    zuiver op composite — `scratch` is hierboven al zo gesorteerd.
    //   v1–v3: publicabel eerst, sub-drempel vult enkel aan (zoals pickTop). De
    //          publicatiedrempel hangt van het (niet-verstoorde) reviewaantal af,
    //          dus de kandidatenpool ligt vast; enkel de volgorde binnen elke
    //          groep wisselt.
    const ordered = methodiekVersie >= 4
      ? scratch
      : scratch.filter(o => isPublishable(o.ref))
          .concat(scratch.filter(o => !isPublishable(o.ref)));
    const rankOf = new Map();
    ordered.forEach((o, i) => rankOf.set(o.ref, i + 1));
    top.forEach((c, i) => {
      const r = rankOf.get(c);
      if (r <= nListed) inTopCount[i]++;
      posSamples[i].push(r);
    });
  }
  const pct = (arr, q) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };
  top.forEach((c, i) => {
    c.stabiliteit = inTopCount[i] / TRIALS;       // kans om in Top N te blijven
    c.posP05 = pct(posSamples[i], 0.05);
    c.posP95 = pct(posSamples[i], 0.95);
  });
}

// ---------------- stap 5: 11–20 (niet op de site, wél voor prospectie) --
// De sterkste eligible bedrijven die NIET in de selectie staan — in composite-
// volgorde. Dat kan ook een hoog scorend bedrijf zijn dat enkel de publicatie-
// drempel (nog) niet haalt; dat is juist een warme lead ("bijna, u mist alleen
// nog reviews"). We markeren die grond apart in het prospectiedocument.
const naSelectie = eligible.filter(c => !topSet.has(c));   // reeds op composite gesorteerd
const extra = naSelectie.slice(0, EXTRA_MAX);

// ---------------- stap 6: niet-eligible bedrijven binnen de regio -------
// (niet meer op de site; blijven in rapport + prospectiedocument)
const wlReden = c => {
  if (!c.inRegio) return null;
  if (c.googleReviews < MIN_REVIEWS)
    return 'Nog te weinig Google-reviews (' + c.googleReviews + ' van min. ' + MIN_REVIEWS + ') om betrouwbaar te beoordelen.';
  if (c.n24 < MIN_RECENT)
    return 'Nog te weinig recente reviews (' + c.n24 + ' in de laatste 24 maanden, min. ' + MIN_RECENT + ') voor een actuele beoordeling.';
  if (!c.beo) return 'Beoordeling nog niet afgerond.';
  if (methodiekVersie >= 3 && c.beo.vakfocusBron !== 'website')
    return 'Geen geverifieerde eigen website — vereist voor opname (methodiek v3+).';
  if (methodiekVersie >= 4 && !(typeof c.beo.vakfocus === 'number' && c.beo.vakfocus >= P.VAKFOCUS_FLOOR))
    return 'Geen vakspecialist voor deze niche (vakfocus ' +
      String(c.beo.vakfocus).replace('.', ',') + ' < ' + String(P.VAKFOCUS_FLOOR).replace('.', ',') +
      ') — opname vergt vakfocus ≥ ' + String(P.VAKFOCUS_FLOOR).replace('.', ',') + ' (methodiek v4+).';
  return 'Voldoet op dit moment niet aan de opnamecriteria.';
};
const watchlist = companies
  .filter(c => !c.eligible && c.inRegio)
  .sort((a, b) => b.googleReviews - a.googleReviews || a.naam.localeCompare(b.naam, 'nl'))
  .slice(0, WATCHLIST_MAX);

// ---------------- stap 7: HTML-blokken (enkel de Top N) ------------------
function chipsHTML(c) {
  const parts = [];
  const beo = c.beo || {};
  (beo.specialties || []).slice(0, 4).forEach(s =>
    parts.push('<span class="chip" data-specialty="' + esc(chipSlug(s)) + '">' + esc(chipLabel(s)) + '</span>'));
  (beo.chipsSite || []).slice(0, 2).forEach(s =>
    parts.push('<span class="chip tag-site">' + esc(s) + '</span>'));
  (beo.chipsReview || []).slice(0, 2).forEach(s =>
    parts.push('<span class="chip tag-review">' + esc(s) + '</span>'));
  return parts.join('\n              ');
}

function siteHost(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return null; }
}

// Neutraal kwaliteitszegel: identiek op elke kaart (groene cirkel met wit vinkje).
// Geen rangnummer, geen "Top N" — de pagina toont een brede selectie van de best
// beoordeelde vakspecialisten, niet een genummerde ranglijst.
const sealHTML =
  '<div class="seal" role="img" aria-label="Opgenomen in de Keurwijzer-selectie">' +
  '<svg class="seal-check" viewBox="0 0 24 24"><use href="#i-check"/></svg></div>';

// Eén kaart per opgenomen bedrijf. Geen cijfer op 10: links het rangnummer
// (#1..#N) in een medaille, rechtsboven het "Top N"-vignet. De synthese en
// chips blijven zoals voorheen.
function articleHTML(c) {
  const gstar = c.googleScore != null ? '★ ' + nlNum(c.googleScore, 1) : '★ —';
  const actief = c.actiefSinds
    ? '<span class="sep">·</span>\n              <span>Actief sinds ' + esc(c.actiefSinds) + '</span>' : '';
  const host = c.website ? siteHost(c.website) : null;
  const meta = '<span class="co-meta"><svg viewBox="0 0 24 24"><use href="#i-info"/></svg>' +
    esc(c.gemeente) + (host ? ' · ' + esc(host) : '') + '</span>';
  const siteLink = host
    ? '<a class="co-link" href="' + esc(c.website) + '" rel="noopener noreferrer" target="_blank">Naar website <span class="arr">→</span></a>'
    : '';
  // Ingetogen tekstlink, exact hetzelfde gewicht als "Naar website" — een
  // opvallende knop zou bedrijven mét nummer visueel voorrang geven op een
  // pagina die net over onafhankelijke rangschikking gaat.
  const waLink = c.whatsapp
    ? '<a class="co-link co-wa" href="' + esc(c.whatsapp.url) + '" rel="noopener noreferrer" target="_blank"' +
      ' aria-label="Stuur een WhatsApp-bericht naar ' + esc(c.naam) + '">' +
      '<svg viewBox="0 0 24 24"><use href="#i-whatsapp"/></svg>WhatsApp</a>'
    : '';
  // Zonder WhatsApp blijft de voet letterlijk zoals vroeger — dat houdt de
  // build-diff leesbaar: enkel kaarten die écht een nummer kregen veranderen.
  const foot = waLink
    ? meta + '\n              <span class="co-acties">' + waLink + siteLink + '</span>'
    : (siteLink ? meta + '\n              ' + siteLink : meta);
  const desc = (c.beo && c.beo.synthese) || '';
  // Nummerloos vignet: elke kaart draagt dezelfde Top N-medaille (geen rangnummer).
  // De volgorde blijft impliciet zichtbaar via de plaats in de lijst.
  const badge = '<span class="badge ver"><svg viewBox="0 0 24 24"><use href="#i-shield"/></svg>Geverifieerd</span>';

  return `      <article class="company"
        data-google-score="${c.googleScore != null ? c.googleScore : ''}"
        data-google-reviews="${c.googleReviews}"
        data-positie="${c.positie}">
        <div class="co-grid">
          ${sealHTML}
          <div class="co-body">
            <div class="co-top">
              <div>
                <div class="co-name">${esc(c.naam)}</div>
                <div class="co-loc"><svg viewBox="0 0 24 24"><use href="#i-pin"/></svg>${esc(c.gemeente)} · ${esc(config.regio.naam)}</div>
              </div>
              ${badge}
            </div>
            <div class="co-data">
              <span class="gstar">${gstar}</span>
              <span class="rev"><b>${c.googleReviews}</b> Google-reviews</span>
              ${actief}
            </div>
            <div class="chips">
              ${chipsHTML(c)}
            </div>
            <p class="co-desc">${esc(desc)}</p>
            <div class="co-foot">
              ${foot}
            </div>
          </div>
        </div>
      </article>`;
}

const companiesHTML = top.map(c => articleHTML(c)).join('\n\n');

// Gededupliceerde gemeentelijst (synthetische fusienamen als "Merelbeke-Melle"
// weg als beide losse delen ook in de lijst staan — die staan enkel in de config
// voor de matching, niet om te tonen/adverteren). Zie geheugen. Wordt hieronder
// hergebruikt voor zowel de zichtbare lijst als de JSON-LD areaServed.
const gemeentenSet = new Set(config.gemeenten);
function isFusieDuplicaat(naam) {
  for (let p = naam.indexOf('-'); p > 0; p = naam.indexOf('-', p + 1)) {
    if (gemeentenSet.has(naam.slice(0, p)) && gemeentenSet.has(naam.slice(p + 1))) return true;
  }
  return false;
}
const gemeentenUniek = config.gemeenten.filter(g => !isFusieDuplicaat(g));

// areaServed — versie-afhankelijk. v1 (vastgepinde pagina's): enkel de regionaam
// als string, byte-voor-byte identiek aan de vroegere output. v2 (nieuwe pagina's):
// de regio + elke gemeente, zodat zoekmachines de dekking per plaats zien.
const areaServed = methodiekVersie >= 2
  ? [config.regio.naam, ...gemeentenUniek]
  : config.regio.naam;

// v3-only presentatie. v1/v2 blijven byte-voor-byte identiek: alle v3-sleutels
// worden voorwaardelijk toegevoegd, dus voor v1/v2 is het object ongewijzigd.
const isV3 = methodiekVersie >= 3;
// Vak-specifiek schema.org-subtype (v3): config-override → niche-map → veilige
// generieke fallback. v1/v2 houden bewust HomeAndConstructionBusiness.
const bedrijfType = (config.vak && config.vak.schemaType) ||
  SCHEMA_TYPE_BY_NICHE[niche] || 'HomeAndConstructionBusiness';
// Canonical alvast hier (ook nodig voor de @id-verwijzingen in de entiteitengraph
// verderop). De latere const is verwijderd; dit is dezelfde waarde.
const canonical = config.canonical || ('https://keurwijzer.be/' + slug + '/');

const jsonld = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'ItemList',
  ...(isV3 && { '@id': canonical + '#selectie' }),
  name: config.vak.mvCap + ' in ' + config.regio.naam,
  description: config.vak.mvCap + ' in ' + config.regio.naam + ', geselecteerd volgens de Keurwijzer-kwaliteitsmethodiek.',
  ...(isV3 && { numberOfItems: top.length, itemListOrder: 'https://schema.org/ItemListOrderDescending' }),
  itemListElement: top.map((c, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: {
      '@type': isV3 ? bedrijfType : 'HomeAndConstructionBusiness', name: c.naam,
      address: { '@type': 'PostalAddress', addressLocality: c.gemeente, addressRegion: config.regio.provincie, addressCountry: 'BE' },
      areaServed: areaServed,
      ...(c.website && { url: c.website })
    }
  }))
}, null, 1);

// ---------------- stap 8: template invullen ------------------------------
const gemeentenKort = config.gemeenten.length > 4
  ? config.gemeenten.slice(0, 3).join(', ') + ' en ' + (config.gemeenten.length - 3) + ' andere gemeenten'
  : config.gemeenten.join(', ');

// Volledige, zichtbare gemeentelijst voor het samenvattingsblok (SEO: elke
// gemeentenaam als crawlbare tekst). gemeentenUniek is hierboven al afgeleid.
const gemeentenVolledig = gemeentenUniek.length > 1
  ? gemeentenUniek.slice(0, -1).join(', ') + ' en ' + gemeentenUniek[gemeentenUniek.length - 1]
  : gemeentenUniek.join(', ');

// Waar tonen we de volledige gemeentelijst? — versie-afhankelijk (SEO-vindbaarheid
// per plaats, bv. iemand die zoekt op "dakwerker Berlare"). De regionaam blijft
// altijd het zwaarste SEO-signaal (titel + H1 + start van de meta); de gemeenten
// zijn een subtiele, aanvullende laag.
//   v1 (bestaande, vastgepinde pagina's): lijst enkel INGEKLAPT in het cijferpaneel
//       → GEMEENTEN_ZICHTBAAR leeg, GEMEENTEN_COLLAPSED = de bestaande regel.
//       Output blijft byte-voor-byte identiek — gepubliceerde pagina's veranderen niet.
//   v2 (nieuwe pagina's): lijst één keer ZICHTBAAR onder de samenvatting, en dus
//       weggelaten uit het ingeklapte paneel (geen dubbele lijst).
const toonGemeentenZichtbaar = methodiekVersie >= 2;
// De kern (bv. "Dendermonde") is al het zwaarste SEO-term (titel/H1/hero); we
// laten hem uit de opsomming zodat de zin natuurlijk leest ("heel Dendermonde en
// omstreken — waaronder <de rest>"). Elke overige gemeente verschijnt zo één keer
// zichtbaar. Valt de lijst zonder kern leeg, dan tonen we toch de volledige lijst.
const gemeentenOmstreken = gemeentenUniek.filter(g => norm(g) !== norm(config.regio.kern));
const gemeentenLijst = gemeentenOmstreken.length ? gemeentenOmstreken : gemeentenUniek;
const gemeentenOmstrekenTekst = gemeentenLijst.length > 1
  ? gemeentenLijst.slice(0, -1).join(', ') + ' en ' + gemeentenLijst[gemeentenLijst.length - 1]
  : gemeentenLijst.join(', ');
// Subtiele, zichtbare regel — inline gestyled zodat de gedeelde stylesheet (en
// dus de v1-pagina's) ongemoeid blijft. Leeg op v1: de token verdwijnt spoorloos
// (staat direct achter </p>), zodat de v1-HTML byte-voor-byte identiek blijft.
const gemeentenZichtbaar = toonGemeentenZichtbaar
  ? '\n      <p style="font-size:14px;color:var(--faint);line-height:1.7;margin:12px 0 0;max-width:100%">' +
    'Deze selectie geldt voor heel ' + esc(config.regio.kern) +
    ' en omstreken — waaronder ' + esc(gemeentenOmstrekenTekst) + '.</p>'
  : '';
// v1-pad gebruikt bewust de ruwe waarden (net als de vroegere tokens), zodat de
// gepubliceerde pagina's byte-voor-byte identiek blijven.
const gemeentenCollapsed = toonGemeentenZichtbaar
  ? ''
  : '<p class="summary-gemeenten"><strong>Opgenomen gemeenten (' + gemeentenUniek.length +
    '):</strong> ' + gemeentenVolledig + '.</p>';

// ---- afgeleide feiten voor het samenvattingsblok (deterministisch) -----
const inRegioComps = companies.filter(c => c.inRegio);
const totaalReviews = inRegioComps.reduce((s, c) => s + c.nOK, 0);
const gScores = inRegioComps.filter(c => c.googleScore != null).map(c => c.googleScore);
const regioGemiddelde = gScores.length
  ? nlNum(gScores.reduce((s, x) => s + x, 0) / gScores.length, 1) : '—';

// Opnamecriteria in de publiekstekst — versie-afhankelijk. v3 voegt de
// website-eis toe, v4 daarbovenop de vakspecialisatie-eis (zie de eligible-
// berekening hierboven); oudere versies houden hun bestaande, kortere
// formulering zodat hun output identiek blijft.
const opnameCriteria = methodiekVersie >= 5
  ? 'minstens ' + MIN_REVIEWS + ' Google-reviews, minstens ' + MIN_RECENT +
    ' reviews in de laatste 24 maanden, een eigen website én een aantoonbare specialisatie in ' +
    vakDef.kern
  : methodiekVersie >= 4
  ? 'minstens ' + MIN_REVIEWS + ' Google-reviews, minstens ' + MIN_RECENT +
    ' reviews in de laatste 24 maanden, een eigen website én een aantoonbare specialisatie in ' +
    config.vak.kort
  : methodiekVersie >= 3
  ? 'minstens ' + MIN_REVIEWS + ' Google-reviews, minstens ' + MIN_RECENT +
    ' reviews in de laatste 24 maanden én een eigen website'
  : 'minstens ' + MIN_REVIEWS + ' Google-reviews én minstens ' + MIN_RECENT +
    ' reviews in de laatste 24 maanden';
// LET OP het woord "bedrijven" in de eerste zin — dat was ooit config.vak.mv
// ("119 dakwerkers"), en dat klopte niet. Die telling is het aantal ZOEKRESULTATEN
// binnen de gemeentefilter, en daar zitten geen vakmensen tussen: bij een controle
// op 4 september 2026 bleken van de 69 "dakwerkers" op de Veurne-pagina er 65 iets
// anders te doen (asbestattesten, totaalrenovatie, ontmossing, zelfs een fotostudio).
// In Antwerpen waren de tien bedrijven met de meeste reviews er nul die daken leggen.
// De ranking zelf heeft daar nooit last van gehad — die filtert niet-vakmensen weg
// via de vakfocus-eis — maar deze ene zin overdreef, tot een factor 17.
// Zet er dus nooit weer een vaknaam op die telling. Het getal dat WEL iets over
// vakmensen zegt, is eligible.length in de tweede zin.
const samenvatting =
  'Keurwijzer analyseerde ' + totaalReviews + ' Google-reviews van ' +
  inRegioComps.length + ' bedrijven die in ' + config.regio.naam + ' als ' +
  config.vak.ev + ' te vinden zijn (peildatum ' + config.peildatum + '). ' +
  eligible.length +
  ' bedrijven voldoen aan de opnamecriteria (' + opnameCriteria + '). ' +
  'De ' + nListed + ' sterkste daarvan vormen de selectie die op deze pagina verschijnt, ' +
  'geselecteerd volgens onze vaste, publieke kwaliteitsmethodiek.';

// canonical is hierboven al gedefinieerd (bij de JSON-LD ItemList).
const heroImg = (config.hero && config.hero.img) || ('img/' + config.vak.mv + '.jpg');
const heroAlt = (config.hero && config.hero.alt) ||
  (config.vak.ev ? 'Een ' + config.vak.ev + ' aan het werk in ' + config.regio.naam
                 : config.vak.mv + ' aan het werk in ' + config.regio.naam);

const syn = (config.vak && config.vak.syn) || null;
const vakEv = config.vak.ev || '';
const synMvPar = (syn && syn.mv) ? ' (ook wel ' + syn.mv + ')' : '';
const faqZoekterm = (syn && syn.ev && vakEv) ? (vakEv + ' of ' + syn.ev)
                  : (vakEv || 'vakspecialist');

// Backend-tekst (meta/OG/Twitter/JSON-LD) — bewust dezelfde boodschap als de
// frontend-hero: "de best beoordeelde ... volgens een vaste, publieke methodiek op
// basis van klantgetuigenissen en vakspecialiteit". Vertrekt van de frontend-copy.
let metaDesc = 'De best beoordeelde ' + config.vak.mv + ' in ' + config.regio.naam +
  ', geselecteerd volgens een vaste, publieke methodiek op basis van de getuigenissen van ' +
  'klanten en de vakspecialiteit van het bedrijf. Onafhankelijk — een plaats is niet te koop.';
// Nieuwe pagina's (v2): de gemeenten óók in de meta, ná de kernboodschap. De
// regionaam staat vooraan (zwaarste signaal); de gemeentelijst is aanvullend en
// mag door de zoekmachine ingekort worden — hij staat sowieso in de HTML voor
// zoekmachines en taalmodellen. v1-pagina's houden hun bestaande, kortere meta.
if (toonGemeentenZichtbaar)
  metaDesc += ' Ook actief in ' + gemeentenOmstrekenTekst + '.';

const geoRegion = R.GEO_CODES[norm(config.regio.provincie)] || 'BE';
if (geoRegion === 'BE')
  warnings.push('provincie "' + config.regio.provincie + '" niet herkend voor geo.region — teruggevallen op "BE"');

const sector = (config.vak.kort || config.vak.mv).charAt(0).toUpperCase() +
               (config.vak.kort || config.vak.mv).slice(1);

const ogImage = new URL(heroImg, canonical).href;

// ===== Navigatie-architectuur: broodkruimel + kruislinks =================
// Alles hieronder komt uit lib/registry.js en verschijnt automatisch zodra er
// meer configs bijkomen — geen enkele link wordt handmatig onderhouden.
//   - naburige regio's (zelfde niche) : voor SEO-clustering én de bezoeker
//   - andere vakgebieden (zelfde regio): de tweede funnel
//   - broodkruimel (zichtbaar + JSON-LD): 3 niveaus, Home › niche-hub › regio
const origin = R.SITE_ORIGIN;
let BREADCRUMB_ITEMS, BREADCRUMB_NAV, CROSSLINKS, NAV_LINKS, FOOT_SECTOR_LINKS;

if (pageEntry) {
  const p = pageEntry;

  BREADCRUMB_NAV =
    '<a href="/">Keurwijzer</a>' +
    '<span class="crumb-sep" aria-hidden="true">›</span>' +
    '<a href="' + esc(p.nicheUrl) + '">' + esc(p.vakMvCap) + '</a>' +
    '<span class="crumb-sep" aria-hidden="true">›</span>' +
    '<span aria-current="page">' + esc(p.regioNaam) + '</span>';

  BREADCRUMB_ITEMS = JSON.stringify([
    { '@type': 'ListItem', position: 1, name: 'Keurwijzer', item: origin + '/' },
    { '@type': 'ListItem', position: 2, name: p.vakMvCap, item: origin + p.nicheUrl },
    { '@type': 'ListItem', position: 3, name: p.vakMvCap + ' in ' + p.regioNaam, item: p.canonical },
  ]);

  NAV_LINKS =
    '<a href="' + esc(p.nicheUrl) + '">' + esc(p.vakMvCap) + '</a>\n' +
    '<a href="' + esc(p.regioUrl) + '">Regio ' + esc(p.regioKern) + '</a>';
  FOOT_SECTOR_LINKS =
    '<a href="' + esc(p.nicheUrl) + '">' + esc(p.vakMvCap) + '</a>\n' +
    '          <a href="' + esc(p.regioUrl) + '">Regio ' + esc(p.regioKern) + '</a>';

  // "Verder kijken" — bewust ALLEEN naar de twee hubs (niche + regio). Deze
  // links hangen enkel af van de eigen niche/regio van de pagina, nóóit van
  // andere pagina's. Gevolg: een detailpagina verandert niet meer wanneer je
  // elders een regio of niche toevoegt — je hoeft ze dus niet te heruploaden.
  // De volledige, actuele lijst van zusterpagina's staat op de hubs zelf.
  const colA = '<div class="verder-col">\n' +
    '<h3 class="verder-h">' + esc(p.vakMvCap) + ' in andere regio’s</h3>\n' +
    '<p class="verder-empty">Bekijk onze selectie van ' + esc(p.vakMv) + ' per regio.</p>\n' +
    '<a class="verder-all" href="' + esc(p.nicheUrl) + '">Alle regio’s voor ' + esc(p.vakMv) +
    '<span class="arr" aria-hidden="true">→</span></a>\n</div>';

  const colB = '<div class="verder-col">\n' +
    '<h3 class="verder-h">Andere vakspecialisten in ' + esc(p.regioNaam) + '</h3>\n' +
    '<p class="verder-empty">Ontdek alle vakgebieden die we in ' + esc(p.regioNaam) + ' beoordeelden.</p>\n' +
    '<a class="verder-all" href="' + esc(p.regioUrl) + '">Alles in ' + esc(p.regioNaam) +
    '<span class="arr" aria-hidden="true">→</span></a>\n</div>';

  CROSSLINKS =
    '<section class="section verder">\n  <div class="container">\n' +
    '    <div class="sec-head" style="margin-bottom:26px">\n' +
    '      <span class="eyebrow">Verder kijken</span>\n' +
    '      <h2 style="margin-top:14px">Andere regio’s en vakgebieden</h2>\n' +
    '    </div>\n' +
    '    <div class="verder-grid">\n' + colA + '\n' + colB + '\n    </div>\n' +
    '  </div>\n</section>';
} else {
  // Pagina niet in de registry (bv. platte testconfig): geen kruislinks, 2-niveau broodkruimel.
  const naam = (config.vak.mvCap || config.vak.mv) + ' in ' + config.regio.naam;
  BREADCRUMB_ITEMS = JSON.stringify([
    { '@type': 'ListItem', position: 1, name: 'Keurwijzer', item: origin + '/' },
    { '@type': 'ListItem', position: 2, name: naam, item: canonical },
  ]);
  BREADCRUMB_NAV = '<a href="/">Keurwijzer</a>' +
    '<span class="crumb-sep" aria-hidden="true">›</span>' +
    '<span aria-current="page">' + esc(naam) + '</span>';
  CROSSLINKS = '';
  NAV_LINKS = '<a href="#register">' + esc(sector) + '</a>';
  FOOT_SECTOR_LINKS = '<a href="#register">' + esc(sector) + '</a>';
}

// ===== Tweede JSON-LD-blok: entiteitengraph (WebSite/WebPage/Breadcrumb/FAQ) ====
// Stond vroeger statisch in template.html. Nu versie-gestuurd zodat nieuwe pagina's
// een rijkere graph krijgen ZONDER dat bestaande (v1/v2) pagina's veranderen:
//   • v1/v2 → GRAPH_LEGACY: byte-voor-byte identiek aan het oude statische blok.
//   • v3    → een eerste-klas Organization-uitgever met @id, en WebPage die
//             publisher/breadcrumb/mainEntity via @id koppelt (mainEntity wijst
//             naar de ItemList #selectie in het eerste blok). Rijkere entiteiten =
//             beter leesbaar voor zoekmachines én AI-antwoordmachines (GEO).
// De FAQ is in beide versies identiek en wordt één keer gedefinieerd.
const escCanon = esc(canonical);
const FAQ_MAINENTITY = `[
    {
     "@type": "Question",
     "name": "Hoe bepaalt Keurwijzer welke bedrijven geselecteerd worden?",
     "acceptedAnswer": { "@type": "Answer", "text": "De selectie wordt bepaald op basis van vier criteria: vertrouwen (35%), reviewkwaliteit (30%), recentheid (15%) en specialiteit (20%). De bedrijven met de hoogste gecombineerde beoordeling vormen samen de selectie van een regio. Alle gegevens waarop we ons baseren zijn publiek: Google-reviews en de eigen website van het bedrijf. Dezelfde methode geldt voor elk bedrijf in elke regio. Onze methodologie en de AI-prompt die gebruikt wordt om bedrijven te beoordelen kunnen op eenvoudig verzoek opgevraagd worden." }
    },
    {
     "@type": "Question",
     "name": "Kan een bedrijf betalend opgenomen worden op Keurwijzer?",
     "acceptedAnswer": { "@type": "Answer", "text": "Nee. Een betaalde opname bestaat niet." }
    },
    {
     "@type": "Question",
     "name": "Hoe vaak wordt de lijst met bedrijven geüpdatet?",
     "acceptedAnswer": { "@type": "Answer", "text": "We herberekenen jaarlijks alles opnieuw met verse data. Een plaats in de selectie is dus nooit verworven." }
    },
    {
     "@type": "Question",
     "name": "Is Keurwijzer gratis?",
     "acceptedAnswer": { "@type": "Answer", "text": "Ja. Keurwijzer is en blijft een gratis initiatief, dat bezoekers wil helpen een geschikte vakspecialist in hun buurt te vinden. Keurwijzer is een initiatief van Magicworx bv, dat ook het marketingbureau dasslim.be uitbaat. Bedrijven kunnen ervoor kiezen om, los van hun opname, met ons samen te werken voor hun marketing; zo'n samenwerking heeft geen enkele invloed op hun opname." }
    }
   ]`;

// v1/v2 — verbatim reproductie van het oude statische blok. Wijzig deze string
// NIET: hij houdt de gepubliceerde pagina's byte-voor-byte identiek.
const GRAPH_LEGACY = `{
 "@context": "https://schema.org",
 "@graph": [
  {
   "@type": "WebSite",
   "@id": "https://keurwijzer.be/#website",
   "url": "https://keurwijzer.be/",
   "name": "Keurwijzer",
   "description": "Onafhankelijke kwaliteitsselectie van vakspecialisten per regio in België.",
   "inLanguage": "nl-BE",
   "publisher": { "@type": "Organization", "name": "Magicworx bv" }
  },
  {
   "@type": "WebPage",
   "@id": "${escCanon}#webpage",
   "url": "${escCanon}",
   "name": "De best beoordeelde ${config.vak.mv} in ${config.regio.naam} — Keurwijzer",
   "description": "${esc(metaDesc)}",
   "isPartOf": { "@id": "https://keurwijzer.be/#website" },
   "inLanguage": "nl-BE",
   "datePublished": "${config.peildatum}",
   "dateModified": "${config.peildatum}"
  },
  {
   "@type": "BreadcrumbList",
   "itemListElement": ${BREADCRUMB_ITEMS}
  },
  {
   "@type": "FAQPage",
   "mainEntity": ${FAQ_MAINENTITY}
  }
 ]
}`;

// v3 — rijkere entiteitengraph. Organization is een eerste-klas node met @id;
// WebSite/WebPage verwijzen ernaar als publisher; WebPage koppelt breadcrumb en
// mainEntity (de ItemList #selectie) via @id.
const GRAPH_V3 = `{
 "@context": "https://schema.org",
 "@graph": [
  {
   "@type": "Organization",
   "@id": "https://keurwijzer.be/#organization",
   "name": "Keurwijzer",
   "legalName": "Magicworx bv",
   "url": "https://keurwijzer.be/",
   "description": "Onafhankelijke kwaliteitsselectie van vakspecialisten per regio in België, op basis van Google-reviews en de eigen website van elk bedrijf."
  },
  {
   "@type": "WebSite",
   "@id": "https://keurwijzer.be/#website",
   "url": "https://keurwijzer.be/",
   "name": "Keurwijzer",
   "description": "Onafhankelijke kwaliteitsselectie van vakspecialisten per regio in België.",
   "inLanguage": "nl-BE",
   "publisher": { "@id": "https://keurwijzer.be/#organization" }
  },
  {
   "@type": "WebPage",
   "@id": "${escCanon}#webpage",
   "url": "${escCanon}",
   "name": "De best beoordeelde ${config.vak.mv} in ${config.regio.naam} — Keurwijzer",
   "description": "${esc(metaDesc)}",
   "isPartOf": { "@id": "https://keurwijzer.be/#website" },
   "publisher": { "@id": "https://keurwijzer.be/#organization" },
   "breadcrumb": { "@id": "${escCanon}#breadcrumb" },
   "mainEntity": { "@id": "${escCanon}#selectie" },
   "inLanguage": "nl-BE",
   "datePublished": "${config.peildatum}",
   "dateModified": "${config.peildatum}"
  },
  {
   "@type": "BreadcrumbList",
   "@id": "${escCanon}#breadcrumb",
   "itemListElement": ${BREADCRUMB_ITEMS}
  },
  {
   "@type": "FAQPage",
   "mainEntity": ${FAQ_MAINENTITY}
  }
 ]
}`;

// De literals hierboven gebruiken LF; het template-bestand is CRLF (Windows).
// Emit de graph met exact dezelfde regeleinde als het template, zodat het oude
// statische blok byte-voor-byte gereproduceerd wordt (v1/v2 blijven identiek).
const graphEOL = template.includes('\r\n') ? '\r\n' : '\n';
const JSONLD_GRAPH = (isV3 ? GRAPH_V3 : GRAPH_LEGACY).replace(/\n/g, graphEOL);

const tokens = {
  SLUG: slug,
  BREADCRUMB_ITEMS: BREADCRUMB_ITEMS,
  BREADCRUMB_NAV: BREADCRUMB_NAV,
  CROSSLINKS: CROSSLINKS,
  NAV_LINKS: NAV_LINKS,
  FOOT_SECTOR_LINKS: FOOT_SECTOR_LINKS,
  META_DESC: esc(metaDesc),
  CANONICAL: esc(canonical),
  REGIO_KERN: esc(config.regio.kern),
  ISO_DATUM: config.peildatum,
  HERO_IMG: esc(heroImg),
  HERO_IMG_ALT: esc(heroAlt),
  GEO_REGION: geoRegion,
  SECTOR: esc(sector),
  OG_IMAGE: esc(ogImage),
  SAMENVATTING: esc(samenvatting),
  GEMEENTEN_AANTAL: String(config.gemeenten.length),
  AANTAL_BEOORDEELD: String(inRegioComps.length),
  TOTAAL_REVIEWS: String(totaalReviews),
  REGIO_GEMIDDELDE: regioGemiddelde,
  VAK_MV: config.vak.mv,
  VAK_MV_CAP: config.vak.mvCap || (config.vak.mv.charAt(0).toUpperCase() + config.vak.mv.slice(1)),
  VAK_EV: vakEv,
  SYN_MV_PAR: synMvPar,
  FAQ_ZOEKTERM: faqZoekterm,
  REGIO: config.regio.naam,
  UPDATE_DATUM: config.updateDatum,
  GEMEENTEN_KORT: gemeentenKort,
  GEMEENTEN_VOLLEDIG: gemeentenVolledig,
  GEMEENTEN_UNIEK_AANTAL: String(gemeentenUniek.length),
  GEMEENTEN_ZICHTBAAR: gemeentenZichtbaar,
  GEMEENTEN_COLLAPSED: gemeentenCollapsed,
  MIN_REVIEWS: String(MIN_REVIEWS),
  MIN_RECENT: String(MIN_RECENT),
  AANTAL_TOP: String(nListed),
  VIGNET: esc(vignet),
  COMPANIES: companiesHTML,
  JSONLD: jsonld,
  JSONLD_GRAPH: JSONLD_GRAPH
};
let out = template;
for (const [k, v] of Object.entries(tokens)) out = out.split('{{' + k + '}}').join(v);

const rest = out.match(/{{[A-Z_]+}}/g);
if (rest) die('template bevat niet-ingevulde tokens: ' + [...new Set(rest)].join(', '));

// output/ spiegelt de live-URL-structuur (pretty URLs):
//   /dakwerkers-gent/  ->  output/dakwerkers-gent/index.html
// Zo is "upload output/ naar de root" een 1-op-1 mapping en klopt de canonical.
const outDir = path.join(ROOT, 'output', slug);
const outRel = 'output/' + slug + '/';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), out);

// ---------------- stap 8b: badge-export (badges.json) --------------------
// Additieve export voor de badge-generator. Per gepubliceerd bedrijf de velden
// die op de kwaliteitsbadge komen (naam, niche, regio, tier, jaar), plus de
// stabiele slugs voor de bestandsnaam en de canonical landingspagina voor de
// klikbare embed-snippet. Dit is PUUR presentatie van al berekende data — geen
// enkele constante, dimensie, selectie of volgorde wordt geraakt, dus de
// rekenmethodiek (en METHODIEK.md) blijft ongemoeid.
//
// Bewust NIET in output/ (dat is de webroot die naar de site gaat) maar in
// badges/<slug>/ — de werkmap die lib/push-badges.js naar de keurwijzer-data-
// repo pusht. Geen timestamp of andere vluchtige velden: zelfde data = exact
// dezelfde badges.json, zodat de push net zo deterministisch blijft als
// registry.json (geen dagelijkse herpush zonder inhoudelijke wijziging).
//
// Tier-tekst volgt de RANG (c.positie), niet het paginalabel:
//   #1 → "#1" · #2–3 → "Top 3" · #4–5 → "Top 5" · #6–10 → "Top 10".
function tierLabel(pos) {
  if (pos <= 1) return '#1';
  if (pos <= 3) return 'Top 3';
  if (pos <= 5) return 'Top 5';
  return 'Top 10';
}
// Stabiele, botsingsvrije bedrijf-slug voor de bestandsnaam. Twee bedrijven die
// naar dezelfde slug herleiden krijgen een oplopend suffix (-2, -3, …), in de
// deterministische top-volgorde, zodat de mapping bedrijf → bestand vastligt.
const badgeSlugTeller = new Map();
function uniekBedrijfSlug(naam) {
  const base = chipSlug(naam) || 'bedrijf';
  const n = (badgeSlugTeller.get(base) || 0) + 1;
  badgeSlugTeller.set(base, n);
  return n === 1 ? base : base + '-' + n;
}
// Eén Nederlandse zin per gepubliceerd bedrijf: wélke van de vier dimensies zijn
const badgesData = {
  slug,
  niche,
  vakMv:     config.vak.mv,
  vakMvCap:  config.vak.mvCap || (config.vak.mv.charAt(0).toUpperCase() + config.vak.mv.slice(1)),
  regioNaam: config.regio.naam,
  jaar:      config.peildatum.slice(0, 4),
  landingsUrl: canonical,
  // Basis-URL van de badge-host, meegeschreven zodat afnemers (outreach-stap,
  // mails) NOOIT zelf een URL samenstellen. Verhuist de badge-hosting, dan
  // wijzigt R.BADGE_BASE_URL (of BADGE_BASE_URL in .env) en volgt de rest vanzelf.
  badgeBaseUrl: R.BADGE_BASE_URL,
  bedrijven: top.map(c => {
    const bslug = uniekBedrijfSlug(c.naam);
    const basis = R.BADGE_BASE_URL + '/' + slug + '/' + bslug;
    return {
      rang:        c.positie,
      tier:        tierLabel(c.positie),
      naam:        c.naam,
      bedrijfSlug: bslug,
      gemeente:    c.gemeente,
      // Kant-en-klare URL's — dit is wat je in een mail plakt.
      badgeDonker: basis + '--donker.png',
      badgeLicht:  basis + '--licht.png',
    };
  }),
};
const badgesDir = path.join(ROOT, 'badges', slug);
fs.mkdirSync(badgesDir, { recursive: true });
fs.writeFileSync(path.join(badgesDir, 'badges.json'), JSON.stringify(badgesData, null, 2));

// Interne documenten (rapport + prospectie) horen NIET in de webroot:
//   reports/<slug>/  — deze map upload je bewust niet.
const repDir = path.join(ROOT, 'reports', slug);
const repRel = 'reports/' + slug + '/';
fs.mkdirSync(repDir, { recursive: true });

// ---------------- stap 9: controlerapport --------------------------------
const fmt = (x, d) => (x == null ? '—' : x.toFixed(d));
let rap = 'KEURWIJZER CONTROLERAPPORT — ' + slug + '  (variant: Top 10-concept, geen zichtbare score)\n';
rap += 'Peildatum: ' + config.peildatum + ' · Prior C (regiogemiddelde, tijdsgewogen): ' + C.toFixed(3) + '\n';
rap += 'Methodiek-versie: ' + methodiekVersie + (config.methodiek ? ' (vastgepind in config)' : ' (nieuwste, standaard)') +
  '  ·  vertrouwen-vloer ' + TRUST_FLOOR.toFixed(1) + '→0, ' + TRUST_CEIL.toFixed(1) + '→1' +
  '  ·  recentheid vol bij ' + P.RECENCY_ANCHOR + ' reviews/24m' +
  '  ·  publicatiedrempel ≥' + P.PUBLISH_MIN_REVIEWS + ' reviews\n';
rap += 'Opnamecriteria: gemeente in lijst, ≥' + MIN_REVIEWS + ' reviews, ≥' + MIN_RECENT + ' in 24m\n';
if (methodiekVersie >= 5 && vakDef) {
  rap += 'Vakdefinitie (v5+, bindend voor vakfocus):\n';
  rap += '    KERN   ' + vakDef.kern + '\n';
  (vakDef.buiten || []).forEach(x => { rap += '    BUITEN ' + x + '\n'; });
}
rap += 'Gewichten: 35% vertrouwen / 30% reviewkwaliteit / 15% recentheid / 20% vakfocus\n';
rap += 'Eligible bedrijven: ' + eligible.length + ' (waarvan ' + publishableCount +
  ' publicabel, ≥' + P.PUBLISH_MIN_REVIEWS + ' reviews) → gepubliceerd: ' + vignet + ' (' + nListed + ' bedrijven)\n\n';

// --- DATA-INTEGRITEIT: mogelijk afgekapte review-export (bovenaan, prominent) --
// Een op 100 afgekapte export treft systematisch de grootste spelers en verlaagt
// hun gewogen volume → sterkere Bayes-krimp → onterecht lager vertrouwen. Controle
// vóór publicatie: staat een afgekapt bedrijf in of net buiten de selectie?
if (cappedExports.length) {
  const topNamen = new Set(top.map(c => norm(c.naam)));
  const eligNamen = new Set(eligible.map(c => norm(c.naam)));
  rap += '⚠ DATA-INTEGRITEIT — MOGELIJK AFGEKAPTE REVIEW-EXPORT (exact 100 bruikbare reviews)\n';
  rap += '  Vermoedelijke exportlimiet. Dit vertekent het VERTROUWEN van grote spelers naar beneden.\n';
  rap += '  Actie: her-scrape zonder limiet en draai normalize opnieuw vóór publicatie.\n';
  cappedExports
    .sort((a, b) => b.rawCount - a.rawCount)
    .forEach(c => {
      const n = norm(c.naam);
      const status = topNamen.has(n) ? '  ← STAAT IN DE GEPUBLICEERDE SELECTIE'
        : eligNamen.has(n) ? '  (eligible, niet gepubliceerd)'
        : '  (niet eligible)';
      rap += '    ' + c.naam + ' — ' + c.nOK + ' van ' + c.rawCount + ' reviews gebruikt' + status + '\n';
    });
  rap += '\n';
}

rap += vignet.toUpperCase() + '  (dit staat op de site — zonder cijfer)\n';
rap += 'pos  comp   trust  rq    rec   focus  bayes  Rw    v_w    n24  reviews  bedrijf\n';
top.forEach((c, i) => {
  rap += ('#' + (i + 1)).padStart(3) + '  ' +
    c.composite.toFixed(3) + '  ' + c.trust.toFixed(3) + '  ' + c.rq.toFixed(2) + '  ' +
    c.recency.toFixed(2) + '  ' + c.focus.toFixed(2) + '   ' + c.bayes.toFixed(2) + '   ' +
    fmt(c.Rw, 2) + '  ' + c.vw.toFixed(1).padStart(5) + '  ' + String(c.n24).padStart(3) + '  ' +
    String(c.googleReviews).padStart(7) + '  ' + c.naam + '\n';
});
rap += '\nVAKFOCUS-AUDIT (bron van de specialiteitsdimensie, per gerankt bedrijf)\n';
top.forEach(c => {
  const b = c.beo || {};
  const url = b.websiteBezocht || c.website || null;
  rap += '    ' + c.naam + ' — ' + (typeof b.vakfocus === 'number'
    ? b.vakfocus.toFixed(1) + ' via ' + (url || 'ONBEKENDE BRON — controleer!')
    : 'regiomediaan (' + (focusMediaan * 4 + 1).toFixed(1) + '), geen website') + '\n';
});
const breuken = top.filter(c => c.beo && c.beo.breuk);
if (breuken.length) {
  rap += '\nBREUKSIGNALEN (tijdspatroon gedetecteerd door de LLM)\n';
  breuken.forEach(c => { rap += '    ' + c.naam + ' — ' + c.beo.breuk + '\n'; });
}

// --- ROBUUSTHEID: overleeft de selectie een halve punt beoordelaarsonzekerheid? -
// Per gepubliceerd bedrijf: de kans dat het in de Top N blijft wanneer élke
// LLM-deelscore (reviewkwaliteit + vakfocus) toevallig ±0,5 verschuift, plus de
// gebruikelijke positieband (5e–95e percentiel) over 5000 trials met vaste seed.
// "vast" ≥ 95%, "waarschijnlijk" 80–95%, "WANKEL" < 80%. Verandert niets aan de
// publicatie — het scheidt de zekere posities van de dobbelworpen.
rap += '\nROBUUSTHEID VAN DE SELECTIE (±0,5 op reviewkwaliteit + vakfocus, 5000 trials, vaste seed)\n';
rap += '  kans = P(blijft in Top ' + nListed + ')   ·   band = 5e–95e percentiel van de positie\n';
{
  const oordeel = p => p >= 0.95 ? 'vast' : p >= 0.80 ? 'waarschijnlijk' : 'WANKEL';
  let vast = 0, wankel = 0;
  top.forEach((c, i) => {
    if (c.stabiliteit >= 0.95) vast++;
    if (c.stabiliteit < 0.80) wankel++;
    rap += ('#' + (i + 1)).padStart(4) + '  kans ' + (c.stabiliteit * 100).toFixed(0).padStart(3) +
      '%   band #' + c.posP05 + '–#' + c.posP95 + '   ' +
      oordeel(c.stabiliteit).padEnd(13) + ' ' + c.naam + '\n';
  });
  // De echte concurrent voor de laatste plek — opnieuw versie-afhankelijk, zodat
  // de marge meet wat de selectie ook écht doet:
  //   v4:    het sterkste ELIGIBLE bedrijf dat net buiten de selectie viel; de
  //          publicatiedrempel stuurt hier niets meer.
  //   v1–v3: het sterkste PUBLICABELE bedrijf (sub-bar bedrijven dingen niet mee,
  //          ze vullen enkel op).
  // Zo is de marge altijd ≥ 0 en betekenisvol.
  const nextPub = (methodiekVersie >= 4 ? naSelectie[0] : naSelectie.find(isPublishable)) || null;
  const margeLabel = methodiekVersie >= 4 ? 'eerstvolgende eligible' : 'eerstvolgende publicabele';
  const marge = (nextPub && top.length) ? (top[top.length - 1].composite - nextPub.composite) : null;
  rap += '  Samengevat: ' + vast + ' vast, ' + (top.length - vast - wankel) +
    ' waarschijnlijk, ' + wankel + ' wankel (van ' + top.length + ').\n';
  if (marge != null)
    rap += '  Marge #' + nListed + ' → ' + margeLabel + ' (' + nextPub.naam + '): ' +
      marge.toFixed(3) + '.\n';
}
if (extra.length) {
  rap += '\nBEDRIJVEN ' + (nListed + 1) + '–' + (nListed + extra.length) + ' — NIET OP DE SITE (zie prospectiedocument voor dasslim.be)\n';
  extra.forEach((c, i) => {
    const merk = !isPublishable(c) ? '  [< ' + P.PUBLISH_MIN_REVIEWS + ' reviews: eligible, niet publicabel]' : '';
    rap += '    #' + String(nListed + i + 1).padStart(2) + '  comp ' + c.composite.toFixed(3) + '  ' + c.naam + merk + '\n';
  });
}
const buitenLijst = naSelectie.slice(EXTRA_MAX);
if (buitenLijst.length) {
  rap += '\nELIGIBLE MAAR VOORBIJ PLEK ' + (nListed + EXTRA_MAX) + ' (niet getoond, niet in prospectie)\n';
  buitenLijst.forEach(c => { rap += '    comp ' + c.composite.toFixed(3) + '  ' + c.naam + '\n'; });
}
if (watchlist.length) {
  rap += '\nNOG NIET ELIGIBLE — NIET OP DE SITE (wél in prospectiedocument, max ' + WATCHLIST_MAX + ')\n';
  watchlist.forEach(c => { rap += '    ' + c.naam + ' — ' + wlReden(c) + '\n'; });
}
const zonderGemeente = companies.filter(c => !c.gemeente || !String(c.gemeente).trim());
if (zonderGemeente.length) {
  rap += '\nGEEN LOCATIEDATA (geen gemeente → altijd weggelaten, niet geraden)\n';
  zonderGemeente.forEach(c => { rap += '    ' + c.naam + (c.website ? ' — ' + c.website : '') + '\n'; });
}
const buitenRegio = companies.filter(c => c.gemeente && String(c.gemeente).trim() && !c.inRegio);
if (buitenRegio.length) {
  rap += '\nBUITEN DE GEMEENTELIJST (volledig weggelaten)\n';
  buitenRegio.forEach(c => { rap += '    ' + c.naam + ' (' + c.gemeente + ')\n'; });
}
if (warnings.length) {
  rap += '\nWAARSCHUWINGEN\n';
  warnings.forEach(w => { rap += '  ! ' + w + '\n'; });
}
fs.writeFileSync(path.join(repDir, slug + '-rapport.txt'), rap);

// ---------------- stap 10: prospectiedocument voor dasslim.be ------------
// Bevat de bedrijven die NIET op de site staan maar wél waardevolle leads zijn:
//   A) plek 11–20: eligible, kwaliteitsvol, net buiten de gepubliceerde Top N
//   B) nog-niet-eligible bedrijven in de regio: langeretermijnprospects
// Bewust een apart bestand — deze lijst is intern en hoort niet op de site.
function prospectRegel(c, positie) {
  const beo = c.beo || {};
  const specs = (beo.specialties || []).map(chipLabel).join(', ');
  let s = '### ' + (positie ? positie + '. ' : '') + c.naam + '\n';
  s += '- **Gemeente:** ' + (c.gemeente || '—') + '\n';
  s += '- **Website:** ' + (c.website ? c.website : '_geen website bekend_') + '\n';
  s += '- **Google:** ' + (c.googleScore != null ? nlNum(c.googleScore, 1) + ' ★' : '—') +
       ' · ' + c.googleReviews + ' reviews' +
       (typeof c.n24 === 'number' ? ' (' + c.n24 + ' in laatste 24m)' : '') + '\n';
  if (typeof c.composite === 'number') s += '- **Interne kwaliteitsindex (composite):** ' + c.composite.toFixed(3) + '\n';
  if (specs) s += '- **Specialiteiten:** ' + specs + '\n';
  if (beo.synthese) s += '- **Synthese:** ' + beo.synthese + '\n';
  return s + '\n';
}

let pros = '# Prospectielijst — ' + config.vak.mvCap + ' in ' + config.regio.naam + '\n\n';
pros += '_Intern document voor dasslim.be. Niet publiceren. Peildatum ' +
        config.peildatum + '._\n\n';
pros += 'Deze bedrijven staan **niet** op de publieke Keurwijzer-pagina, maar zijn ' +
        'waardevolle prospects. De publieke pagina toont enkel de ' + vignet + '.\n\n';
pros += '---\n\n';
pros += '## A. Net buiten de ' + vignet + ' — plek ' + (nListed + 1) + ' t.e.m. ' + (nListed + extra.length) + '\n\n';
if (extra.length) {
  pros += '_Warme leads: deze bedrijven zijn eligible en kwaliteitsvol, ze vielen net ' +
          'buiten de gepubliceerde selectie. Openingszin: "u staat net buiten onze publieke ' +
          vignet + ' — dit is wat er nog voor nodig is, en toevallig helpen wij daar ook bij."_\n\n';
  extra.forEach((c, i) => {
    pros += prospectRegel(c, nListed + i + 1);
    if (!isPublishable(c))
      pros += (methodiekVersie >= 4
        // v4: ≥15 is GEEN publicatiepoort meer — dit bedrijf viel op composite net
        // buiten de selectie. Meer reviews helpen wél, maar via de score (Bayes-
        // krimp + recentheid), niet via een drempel. Beloof dus geen automatisme.
        ? '- **Nog dun onderbouwd:** sterke score, maar met ' + c.googleReviews +
          ' reviews (< ' + P.PUBLISH_MIN_REVIEWS + ') weegt de Bayes-krimp nog zwaar door. ' +
          'Openingszin: "uw kwaliteit zit goed; met wat meer recente reviews wint uw ' +
          'score aan gewicht en komt de ' + vignet + ' in bereik."\n\n'
        : '- **Bijna publicabel:** sterke score, maar nog onder de publicatiedrempel van ' +
          P.PUBLISH_MIN_REVIEWS + ' reviews (nu ' + c.googleReviews + '). Openingszin: "uw kwaliteit ' +
          'zit goed; u mist enkel nog reviews om in onze publieke ' + vignet + ' te verschijnen."\n\n');
  });
} else {
  pros += '_Geen bedrijven in deze categorie._\n\n';
}
pros += '---\n\n';
pros += '## B. Nog niet eligible — langeretermijnprospects\n\n';
if (watchlist.length) {
  pros += '_Deze bedrijven voldoen nog niet aan de opnamecriteria (te weinig of te oude ' +
          'reviews). Openingszin: "u komt nog niet in aanmerking voor onze ' + vignet + '; ' +
          'dit is wat er nog voor nodig is."_\n\n';
  watchlist.forEach(c => {
    pros += prospectRegel(c, null);
    pros += '- **Reden nog niet opgenomen:** ' + wlReden(c) + '\n\n';
  });
} else {
  pros += '_Geen bedrijven in deze categorie._\n\n';
}
fs.writeFileSync(path.join(repDir, slug + '-prospectie-dasslim.md'), pros);

console.log('✓ ' + outRel + 'index.html  (' + vignet + ' — ' + nListed + ' op de site, geen cijfer)');
console.log('✓ ' + repRel + slug + '-rapport.txt — controleer dit rapport vóór publicatie');
console.log('✓ ' + repRel + slug + '-prospectie-dasslim.md — ' + extra.length + ' warme + ' +
  watchlist.length + ' langeretermijnprospects (intern, niet publiceren)');
if (warnings.length) console.log('! ' + warnings.length + ' waarschuwing(en) — zie rapport');
