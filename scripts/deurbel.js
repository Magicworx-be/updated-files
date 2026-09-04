#!/usr/bin/env node
// =====================================================================
// scripts/deurbel.js — "is er iets binnengekomen?" zonder de mailbox uit te kammen
//
// WAT ER MIS WAS
//
// De deurbel was een prompt die élke run opnieuw tot 34 threads openlas: 100
// tool-calls, negen minuten. Op 3 september stierf de run van 15u20 na 32
// `get_thread`-calls op een API-fout — zonder melding. Heito's antwoord van
// 15u32 ("Dat zou super zijn, bedankt!") bleef daardoor vijf uur liggen. Bij
// 675 pagina's zou dat volledig vastlopen.
//
// HOE HET NU WERKT
//
// Het logboek weet wat er al gezien is. Daaruit volgt één Gmail-zoekopdracht
// die alleen nieuwe berichten kan opleveren, en de beslissing "mens of
// machine" valt in code (lib/antwoord.js), niet in een prompt.
//
// De geplande taak doet daarom nog maar drie dingen:
//
//   1. node scripts/deurbel.js --vraag
//        → drukt de exacte Gmail-zoekopdracht af
//   2. die ene zoekopdracht uitvoeren met de Gmail-tools en het antwoord
//      onbewerkt in een bestand zetten
//   3. node scripts/deurbel.js --verwerk <bestand.json>
//        → werkt het logboek bij en drukt af wat er gemeld moet worden
//
// De LLM komt er alleen aan te pas om de aard van een écht antwoord in één
// zin samen te vatten. Al de rest is code, dus reproduceerbaar en testbaar.
//
// Gebruik:
//   node scripts/deurbel.js --vraag
//   node scripts/deurbel.js --verwerk threads.json [--droog]
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const outreach = require('../lib/outreach');
const { beoordeelBericht, isVanOlivier } = require('../lib/antwoord');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const droog = argv.includes('--droog');

// De onderwerpregels die Keurwijzer-outreach ooit gebruikt heeft. De
// juli-batch gebruikte een ANDERE formulering dan augustus/september; wie
// alleen op "vergeleken" zoekt, ziet 14 threads uit Gent en het Meetjesland
// niet — precies de fout die tot 4 september 2026 in alle prompts zat.
const ONDERWERPEN = [
  'subject:vergeleken',
  'subject:"graag controleren"',
  'subject:"in top 5 dakwerkers"',
];

function stop(bericht) { console.error('\nFOUT: ' + bericht + '\n'); process.exit(1); }

const { bestaat, rijen, fouten } = outreach.load(ROOT);
if (!bestaat) stop('data/outreach.json bestaat nog niet. Leg het aan: node scripts/outreach-seed.js');
if (fouten.length) stop('het logboek is niet in orde:\n  - ' + fouten.join('\n  - '));

// ── Sinds wanneer moeten we kijken? ─────────────────────────────────────
// De jongste datum die het logboek kent. Gmail's `after:` werkt op hele
// dagen, dus we nemen die dag zelf mee: liever één dag dubbel bekijken dan
// een bericht missen dat op de grens viel.
function sindsWanneer() {
  const datums = rijen
    .flatMap(r => [r.laatstGezien && r.laatstGezien.datum, r.mail1.verstuurdOp, r.opvolg1.verstuurdOp])
    .filter(Boolean)
    .sort();
  return datums.length ? datums[datums.length - 1] : null;
}

function gmailVraag() {
  const sinds = sindsWanneer();
  const onderwerp = '{' + ONDERWERPEN.join(' ') + '}';
  // -from:me houdt Oliviers eigen berichten eruit; die zijn nooit een deurbel.
  const delen = ['-from:me', onderwerp];
  if (sinds) delen.push('after:' + sinds.replace(/-/g, '/'));
  else delen.push('newer_than:14d');
  return delen.join(' ');
}

if (argv.includes('--vraag')) {
  console.log(gmailVraag());
  process.exit(0);
}

// ── Verwerken ───────────────────────────────────────────────────────────
const i = argv.indexOf('--verwerk');
const bestand = i >= 0 ? argv[i + 1] : null;
if (!bestand) {
  console.error('\nGebruik:\n  node scripts/deurbel.js --vraag' +
    '\n  node scripts/deurbel.js --verwerk <bestand.json> [--droog]\n');
  process.exit(2);
}
if (!fs.existsSync(bestand)) stop('bestand niet gevonden: ' + bestand);

let doc;
try { doc = JSON.parse(fs.readFileSync(bestand, 'utf8')); }
catch (e) { stop(bestand + ' bevat ongeldige JSON — ' + e.message); }

// Het antwoord van search_threads, of gewoon een lijst threads.
const threads = Array.isArray(doc) ? doc : (doc.threads || []);
if (!Array.isArray(threads)) stop(bestand + ': geen "threads" gevonden');

// Thread-ID → rij. Ook de zijthreads meenemen: Tectora schreef vanaf twee
// adressen, wat twee threads oplevert voor één bedrijf.
const perThread = new Map();
for (const r of rijen) {
  if (r.threadId) perThread.set(r.threadId, r);
  for (const t of r.nevenThreads) perThread.set(t, r);
}
const perEmail = new Map();
for (const r of rijen) if (r.email) perEmail.set(r.email.toLowerCase(), r);

// Op domein koppelen is de redding voor de threads van vóór het logboek: daar
// staat geen mailadres bij, maar info@heitodakwerken.be hoort onmiskenbaar bij
// het bedrijf met website heitodakwerken.be. Staan er twee bedrijven op
// hetzelfde domein (twee regio's, dezelfde firma), dan koppelen we NIET —
// liever "onbekend" melden dan het verkeerde bedrijf aanwijzen.
const perDomein = new Map();
for (const r of rijen) {
  if (!r.domein) continue;
  if (perDomein.has(r.domein)) perDomein.set(r.domein, null);
  else perDomein.set(r.domein, r);
}

const melden = [];
const genegeerd = [];
const onbekend = [];
const vandaag = outreach.vandaagISO();

for (const thread of threads) {
  const berichten = Array.isArray(thread.messages) ? thread.messages : [];
  // Alleen binnenkomende berichten; het laatste telt.
  const binnen = berichten.filter(m => !isVanOlivier(m.sender));
  if (!binnen.length) continue;
  const laatste = binnen[binnen.length - 1];

  const oordeel = beoordeelBericht({
    onderwerp: laatste.subject || thread.subject || '',
    tekst: laatste.plaintextBody || laatste.snippet || '',
  });

  const datum = outreach.lokaleDatum(laatste.date) || vandaag;
  const tijdstip = outreach.lokaleTijd(laatste.date) || datum;   // Belgische tijd, zoals in Gmail
  const afzender = String(laatste.sender || '').toLowerCase();
  const adres = (afzender.match(/[^<\s]+@[^>\s]+/) || [''])[0];
  const rij = perThread.get(thread.id) ||
    perEmail.get(adres) ||
    perDomein.get(outreach.domeinVan(adres)) || null;

  const kaart = {
    threadId: thread.id,
    bedrijf: rij ? rij.bedrijf : null,
    slug: rij ? rij.slug : null,
    afzender: laatste.sender,
    onderwerp: laatste.subject || thread.subject || '',
    datum,
    tijdstip,
    snippet: (laatste.snippet || '').slice(0, 200),
    soort: oordeel.soort,
    reden: oordeel.reden,
  };

  if (oordeel.soort !== 'mens') { genegeerd.push(kaart); continue; }
  if (!rij) { onbekend.push(kaart); continue; }

  // Zelf afhandelen? Dan wél melden (het is Oliviers eigen gesprek en juist
  // dáár zitten de waardevolle antwoorden), maar nooit een draft laten maken.
  melden.push(Object.assign(kaart, { zelfAfhandelen: rij.zelfAfhandelen }));

  if (!droog) {
    rij.laatstGezien = { datum, van: 'bedrijf' };
    // 'anders' = een echt antwoord waarvan de inhoud nog niet ingedeeld is; de
    // mailronde verfijnt het naar badge/lead/nummer/nee. Bewust NIET 'onbekend':
    // dat betekent "er is nooit naar gekeken", en de deurbel heeft er wél naar
    // gekeken — hij zag dat er een mens schreef.
    if (!rij.antwoord) rij.antwoord = { datum, soort: 'anders' };
    if (!rij.email && adres) rij.email = adres;
    if (!rij.threadId) rij.threadId = thread.id;
    else if (rij.threadId !== thread.id && !rij.nevenThreads.includes(thread.id)) {
      rij.nevenThreads.push(thread.id);
    }
  }
}


// ── Het dashboard meteen mee bijwerken ──────────────────────────────────
// Het dashboard is een momentopname van het logboek. Wie het logboek schrijft,
// ververst het scherm meteen — anders staat er dagen later nog een oud beeld en
// weet niemand meer of het klopt. Faalt het, dan is dat geen reden om de rest
// te laten mislukken: het logboek is de bron, het dashboard is maar een venster.
function verversDashboard() {
  try {
    const { execFileSync } = require('child_process');
    execFileSync(process.execPath, [path.join(__dirname, 'outreach-dashboard.js')], { stdio: 'ignore' });
    console.log('Dashboard bijgewerkt: reports/outreach-dashboard.html');
  } catch (e) {
    console.error('LET OP: het dashboard kon niet ververst worden (' + e.message + ').');
    console.error('Draai het zelf met: node scripts/outreach-dashboard.js');
  }
}

if (!droog && melden.length) {
  outreach.schrijf(ROOT, rijen, vandaag);
  verversDashboard();
}

// ── Verslag ─────────────────────────────────────────────────────────────
console.log('');
console.log('Deurbel — ' + threads.length + ' thread(s) bekeken' + (droog ? ' (droogloop)' : ''));
console.log('  echt antwoord     : ' + melden.length);
console.log('  machine/genegeerd : ' + genegeerd.length);
console.log('  afzender onbekend : ' + onbekend.length);

if (melden.length) {
  console.log('\nMELDEN:');
  for (const m of melden) {
    console.log('  • ' + (m.bedrijf || '?') + (m.slug ? ' (' + m.slug.replace('dakwerkers-', '') + ')' : '') +
      (m.zelfAfhandelen ? '  [Olivier zelf — geen draft]' : ''));
    console.log('    ' + m.tijdstip + ' · ' + m.afzender);
    console.log('    "' + m.snippet.replace(/\s+/g, ' ') + '"');
    console.log('    thread: ' + m.threadId);
  }
}
if (genegeerd.length) {
  console.log('\nNiet gemeld (machine):');
  genegeerd.forEach(m => console.log('  - ' + (m.bedrijf || m.afzender) + ' — ' + m.reden));
}
if (onbekend.length) {
  console.log('\nLET OP — afzender staat niet in het logboek:');
  onbekend.forEach(m => console.log('  - ' + m.afzender + ' · ' + m.onderwerp + ' · thread ' + m.threadId));
  console.log('  (waarschijnlijk een thread van vóór het logboek; zoek het bedrijf op met');
  console.log('   scripts/zoek-bedrijf.js en vul "email" en "threadId" aan in data/outreach.json)');
}
console.log('');
