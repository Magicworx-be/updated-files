#!/usr/bin/env node
// =====================================================================
// scripts/outreach-noteer.js — een gemaakte draft vastleggen in het logboek
//
// WAAROM DIT BESTAAT
//
// De rem tegen een tweede opvolgmail is `opvolg1.draftOp` in het logboek. Tot
// 4 september 2026 moest de opvolgronde dat veld MET DE HAND in
// data/outreach.json zetten. Dat is de zwakste schakel van de hele ketting: een
// ronde die halverwege stopt, een naam net anders schrijft of de stap gewoon
// vergeet, laat het bedrijf de week erna opnieuw in de lijst komen. Dan krijgt
// een bedrijf twee keer dezelfde vraag, en dat is precies de fout die Keurwijzer
// zijn geloofwaardigheid kost bij de bedrijven die het meest opleveren.
//
// Dit script neemt die stap over. Het zoekt de rij op, weigert een tweede
// notitie, en schrijft het logboek in één keer weg. Draaien is veilig: hetzelfde
// commando twee keer geeft de tweede keer een nette weigering, geen dubbele rij.
//
// Gebruik:
//   node scripts/outreach-noteer.js --thread <threadId> --lijst 1
//   node scripts/outreach-noteer.js --thread <threadId> --lijst 2
//   node scripts/outreach-noteer.js --bedrijf "<naam>" --slug <slug> --lijst 1
//   node scripts/outreach-noteer.js --controleer          (alleen tonen)
//
// `--thread` heeft de voorkeur: dat is het ID dat je net van create_draft
// terugkreeg, dus er kan geen naamverwarring optreden.
//
// Wat er genoteerd wordt:
//   lijst 1 → opvolg1.draftOp = vandaag, whatsapp.gevraagdOp = vandaag
//             (die mail vraagt zelf naar het nummer — vanaf nu staat de vraag open)
//   lijst 2 → opvolg1.draftOp = vandaag
//             (whatsapp.gevraagdOp blijft staan: dat is de oorspronkelijke vraag)
// =====================================================================
'use strict';
const path = require('path');
const outreach = require('../lib/outreach');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const vandaag = outreach.vandaagISO();

const waarde = (vlag) => { const i = argv.indexOf(vlag); return i >= 0 ? argv[i + 1] : null; };
const heeft = (vlag) => argv.includes(vlag);

function stop(bericht, code = 1) { console.error('\nFOUT: ' + bericht + '\n'); process.exit(code); }

const { bestaat, rijen, fouten } = outreach.load(ROOT);
if (!bestaat) stop('data/outreach.json bestaat nog niet. Leg het aan: node scripts/outreach-seed.js');
if (fouten.length) stop('het logboek is niet in orde:\n  - ' + fouten.join('\n  - '));

// ── Alleen tonen ────────────────────────────────────────────────────────
// Bedoeld als sluitstuk van de ronde: klopt wat er nu in het logboek staat met
// wat je zonet hebt aangemaakt? Elke rij met een draft van vandaag hoort in je
// verslag terug te komen, en omgekeerd.
if (heeft('--controleer')) {
  const vandaagGenoteerd = rijen.filter(r => r.opvolg1.draftOp === vandaag || r.opvolg2.draftOp === vandaag);
  console.log('\nOpvolgdrafts genoteerd op ' + vandaag + ': ' + vandaagGenoteerd.length);
  vandaagGenoteerd.forEach(r => console.log('  - ' + r.bedrijf + '  (' + r.slug.replace('dakwerkers-', '') +
    ' #' + r.rang + ')' + (r.email ? ' · ' + r.email : '')));

  const open = outreach.opvolgKandidaten(rijen, vandaag).length + outreach.wachtOpNummer(rijen, vandaag).length;
  console.log('\nNog open kandidaten na deze ronde: ' + open);
  if (open > 0) {
    console.log('  LET OP: dat hoort 0 te zijn als je de ronde volledig hebt afgewerkt.');
    console.log('  Staat er nog iets open, dan is er een draft gemaakt die niet genoteerd is.');
  }
  console.log('');
  process.exit(0);
}

// ── De rij zoeken ───────────────────────────────────────────────────────
const threadId = waarde('--thread');
const naam = waarde('--bedrijf');
const slug = waarde('--slug');
const lijst = waarde('--lijst');

if (!threadId && !naam) {
  stop('geef --thread <threadId> op (aanbevolen), of --bedrijf "<naam>" --slug <slug>.\n' +
    'Alleen kijken wat er genoteerd staat: --controleer', 2);
}
if (lijst !== '1' && lijst !== '2') stop('--lijst moet 1 of 2 zijn (welke van de twee vrijdaglijsten)', 2);

let rij = null;
if (threadId) {
  const treffers = rijen.filter(r => r.threadId === threadId || r.nevenThreads.includes(threadId));
  if (treffers.length === 0) stop('geen bedrijf met thread ' + threadId + ' in het logboek.\n' +
    'Klopt het ID? Anders: --bedrijf "<naam>" --slug <slug>');
  if (treffers.length > 1) stop('thread ' + threadId + ' hangt aan meer dan één bedrijf:\n  - ' +
    treffers.map(r => r.bedrijf + ' (' + r.slug + ')').join('\n  - ') + '\nGebruik --bedrijf en --slug');
  rij = treffers[0];
} else {
  const zoek = outreach.norm(naam);
  const treffers = rijen.filter(r => outreach.norm(r.bedrijf) === zoek && (!slug || r.slug === slug));
  if (treffers.length === 0) stop('geen bedrijf "' + naam + '"' + (slug ? ' in ' + slug : '') +
    ' in het logboek. Exacte schrijfwijze: node scripts/zoek-bedrijf.js');
  if (treffers.length > 1) stop('"' + naam + '" staat in meer dan één regio:\n  - ' +
    treffers.map(r => r.slug).join('\n  - ') + '\nGeef --slug erbij');
  rij = treffers[0];
}

// ── Weigeren wat geweigerd moet worden ──────────────────────────────────
// Deze controles zijn de reden dat dit script bestaat. Ze staan hier en niet in
// de prompt, want een prompt kan overgeslagen worden.
if (!outreach.magBenaderen(rij)) {
  stop(rij.bedrijf + ' mag geen mail krijgen: ' +
    (rij.optOut ? 'opt-out op ' + rij.optOut.datum : 'Olivier handelt dit gesprek zelf af') +
    '.\nEr staat nu een draft klaar die niet verstuurd mag worden — gooi hem weg.');
}
if (outreach.alOpgevolgd(rij)) {
  const wanneer = rij.opvolg1.draftOp || rij.opvolg1.verstuurdOp || rij.opvolg2.draftOp || rij.opvolg2.verstuurdOp;
  stop(rij.bedrijf + ' kreeg al een opvolgmail (' + wanneer + ').\n' +
    'Er staat nu een TWEEDE draft klaar. Gooi die weg — één opvolging per bedrijf.');
}

// ── Noteren ─────────────────────────────────────────────────────────────
rij.opvolg1.draftOp = vandaag;
if (lijst === '1') {
  // Lijst 1 vraagt zelf naar het WhatsApp-nummer. Vanaf nu staat die vraag
  // open, en dat moet het logboek weten — anders leest de dagelijkse mailronde
  // een binnenkomend nummer als een antwoord uit het niets.
  if (!rij.whatsapp.gevraagdOp) rij.whatsapp.gevraagdOp = vandaag;
}
rij.laatstGezien = { datum: vandaag, van: 'olivier' };

const p = outreach.schrijf(ROOT, rijen, vandaag);
console.log('Genoteerd: ' + rij.bedrijf + ' (' + rij.slug.replace('dakwerkers-', '') + ' #' + rij.rang +
  ') — lijst ' + lijst + ', opvolg1.draftOp = ' + vandaag);
console.log('  ' + path.relative(ROOT, p));
