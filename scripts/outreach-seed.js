#!/usr/bin/env node
// =====================================================================
// scripts/outreach-seed.js — het logboek aanleggen en bijwerken
//
// Legt voor elk gepubliceerd bedrijf een rij aan in data/outreach.json.
// Draait zo vaak als je wil: bestaande rijen worden NOOIT overschreven, er
// worden alleen ontbrekende rijen bijgemaakt. Nieuwe regio's gebouwd? Draai
// dit script en ze staan in het logboek.
//
// Wat er zonder Gmail al bekend is:
//   • wie er gepubliceerd staat        → data/<slug>/selectie.json
//   • wie een WhatsApp-nummer gaf      → data/whatsapp.json
//   • welke gesprekken Olivier zelf voert → de uitsluitlijst hieronder
//
// Wat er uit Gmail moet komen (thread, verzenddatum, of er geantwoord is)
// voeg je toe met `--gmail <bestand.json>`; zie scripts/outreach-gmail.md.
//
// Gebruik:
//   node scripts/outreach-seed.js              (aanleggen/aanvullen)
//   node scripts/outreach-seed.js --gmail x.json
//   node scripts/outreach-seed.js --droog      (alleen tonen, niets schrijven)
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const outreach = require('../lib/outreach');
const whatsapp = require('../lib/whatsapp');

const ROOT = path.join(__dirname, '..');

// De vijf gesprekken die Olivier zelf voert. Stonden tot 4 september 2026
// letterlijk in vier promptbestanden; vanaf nu staan ze hier één keer en
// vertalen ze zich naar `zelfAfhandelen` in het logboek.
const ZELF_AFHANDELEN = [
  { threadId: '1a047f391d4505d7', slug: 'dakwerkers-brugge', bedrijf: 'Dakwerken Vermeersch' },
  { threadId: '1a0436f627b19643', slug: 'dakwerkers-dendermonde', bedrijf: 'Dakwerken Hofman bvba' },
  { threadId: '1a0436f303053a93', slug: 'dakwerkers-dendermonde', bedrijf: 'Dakwerken SD Projects' },
  { threadId: '1a0470a8d2d8490c', slug: 'dakwerkers-oudenaarde', bedrijf: 'Dakwerken Devlin' },
  { threadId: '1a047f329442ed6a', slug: 'dakwerkers-brugge', bedrijf: 'D&G Dakwerken (Brugge)' },
];

const argv = process.argv.slice(2);
const droog = argv.includes('--droog');
const gmailPad = (() => { const i = argv.indexOf('--gmail'); return i >= 0 ? argv[i + 1] : null; })();

const vandaagISO = outreach.vandaagISO;

function stop(bericht) { console.error('\nFOUT: ' + bericht + '\n'); process.exit(1); }

// ── 1. Wie staat er gepubliceerd ────────────────────────────────────────
function gepubliceerd() {
  const uit = [];
  const dataDir = path.join(ROOT, 'data');
  for (const slug of fs.readdirSync(dataDir).sort()) {
    const p = path.join(dataDir, slug, 'selectie.json');
    if (!fs.existsSync(p)) continue;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { stop('data/' + slug + '/selectie.json bevat ongeldige JSON — ' + e.message); }
    if (!Array.isArray(doc.bedrijven)) stop('data/' + slug + '/selectie.json: "bedrijven" ontbreekt of is geen lijst');
    doc.bedrijven.forEach((bedrijf, i) => uit.push({ slug, bedrijf, rang: i + 1 }));
  }
  return uit;
}

// ── 2. Samenvoegen ──────────────────────────────────────────────────────
const bestaand = outreach.load(ROOT);
if (bestaand.fouten.length) {
  stop('het bestaande logboek is niet in orde:\n  - ' + bestaand.fouten.join('\n  - '));
}

const rijen = bestaand.rijen.slice();
const opSleutel = outreach.index(rijen);
const nieuw = [];

// Bij de ALLEREERSTE aanleg is alles wat er al gepubliceerd staat ook al
// benaderd — op 4 september 2026 waren dat 133 bedrijven, en de mailbox telde
// 113 threads met de onderwerpregel "vergeleken" plus 14 uit de juli-batch.
// Die rijen krijgen daarom `historisch: true`: ze worden nooit opnieuw voor
// mail 1 aangeboden. Draai je het script later opnieuw omdat er een regio bij
// gebouwd is, dan zijn díe rijen wél gewoon nieuw en mogen ze gemaild worden.
const eersteAanleg = !bestaand.bestaat;

// De rang is afgeleide data: hij hoort altijd gelijk te lopen met wat er op de
// pagina staat, ook op rijen die hier al stonden. Daarom wordt hij bij elke
// seed opnieuw overschreven en niet alleen op nieuwe rijen gezet. Verandert de
// selectie ooit bewust (`node build.js <slug> --nieuwe-selectie`), dan volstaat
// één seed om de vrijdagronde weer op de juiste bedrijven te richten.
let rangGezet = 0;
let rangGewijzigd = [];
for (const { slug, bedrijf, rang } of gepubliceerd()) {
  const sleutel = outreach.sleutelVan(slug, bedrijf);
  let rij = opSleutel.get(sleutel);
  if (!rij) {
    rij = outreach.legeRij(slug, bedrijf);
    rij.sleutel = sleutel;
    rij.historisch = eersteAanleg;
    rijen.push(rij);
    opSleutel.set(sleutel, rij);
    nieuw.push(sleutel);
  }
  if (rij.rang !== null && rij.rang !== rang) {
    rangGewijzigd.push(slug.replace('dakwerkers-', '') + ' / ' + bedrijf + ': ' + rij.rang + ' → ' + rang);
  }
  rij.rang = rang;
  rangGezet++;
}

// Een rij die géén rang kreeg staat niet (meer) in een selectie.json. Dat mag
// gebeuren — een bedrijf kan bij een herijking van de pagina vallen — maar de
// vrijdagronde slaat zo'n rij dan wel over, dus het hoort zichtbaar te zijn.
const zonderRang = rijen.filter(r => r.rang === null);

// Het websitedomein per bedrijf, uit de scrapedata. Daarmee kan de deurbel een
// binnenkomend antwoord aan een bedrijf koppelen zonder dat er ooit een
// mailadres genoteerd is: info@heitodakwerken.be hoort bij heitodakwerken.be.
// Gedeelde postbussen (gmail, telenet, ...) leveren null en worden overgeslagen.
let domeinGevonden = 0;
const zonderDomein = [];
for (const slug of new Set(rijen.map(r => r.slug))) {
  const p = path.join(ROOT, 'data', slug, 'reviews.json');
  if (!fs.existsSync(p)) continue;
  let doc;
  try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { stop('data/' + slug + '/reviews.json bevat ongeldige JSON — ' + e.message); }
  const lijst = Array.isArray(doc) ? doc : (doc.bedrijven || []);
  const opNaam = new Map(lijst.map(b => [outreach.norm(b.bedrijf), b]));
  for (const rij of rijen.filter(r => r.slug === slug)) {
    if (rij.domein) { domeinGevonden++; continue; }
    const b = opNaam.get(outreach.norm(rij.bedrijf));
    const d = b ? outreach.domeinVan(b.website) : null;
    if (d) { rij.domein = d; domeinGevonden++; }
    else zonderDomein.push(rij.slug.replace('dakwerkers-', '') + ' / ' + rij.bedrijf);
  }
}

// WhatsApp-nummers: data/whatsapp.json blijft de bron voor de knop op de
// pagina (METHODIEK.md §7). Het logboek spiegelt ze alleen, zodat het
// dashboard en de opvolgronde niet twee bestanden hoeven te openen.
const wa = whatsapp.load(ROOT);
if (wa.fouten.length) stop('data/whatsapp.json is niet in orde:\n  - ' + wa.fouten.join('\n  - '));
//
// `toestemming` in whatsapp.json is een vrije toelichting die met een datum
// BEGINT ("2026-09-01, dwgprojects@outlook.com - Olivier vroeg ..."). Alleen
// die datum hoort in het logboek; de toelichting zelf blijft staan waar ze
// hoort, in whatsapp.json.
const DATUM_VOORAAN = /^(\d{4}-\d{2}-\d{2})/;
const datumUit = (tekst) => {
  const m = DATUM_VOORAAN.exec(String(tekst || '').trim());
  return m ? m[1] : null;
};

let waGekoppeld = 0;
const waVerweesd = [];
for (const r of wa.rijen) {
  const rij = opSleutel.get(r.sleutel);
  if (!rij) { waVerweesd.push(r.slug + ' / ' + r.bedrijf); continue; }
  const op = datumUit(r.toestemming);
  rij.whatsapp.nummer = r.nummer;
  if (!rij.whatsapp.liveSinds) rij.whatsapp.liveSinds = op;
  if (!rij.whatsapp.gevraagdOp) rij.whatsapp.gevraagdOp = op;
  waGekoppeld++;
}

// De uitsluitlijst.
const zelfVerweesd = [];
for (const z of ZELF_AFHANDELEN) {
  const rij = opSleutel.get(outreach.sleutelVan(z.slug, z.bedrijf));
  if (!rij) { zelfVerweesd.push(z.slug + ' / ' + z.bedrijf); continue; }
  rij.zelfAfhandelen = true;
  if (!rij.threadId) rij.threadId = z.threadId;
  rij.historisch = true;
}

// ── 3. Gmail-feiten (optioneel) ─────────────────────────────────────────
// Vorm: [{ slug, bedrijf, email, threadId, nevenThreads, mail1Op, opvolg1Op,
//          antwoordOp, laatstGezienOp, laatstGezienVan, optOutOp }]
// Uitsluitend feiten, geen interpretatie: zie scripts/outreach-gmail.md.
//
// Een regel wijst een bedrijf aan op één van twee manieren:
//   • `slug` + `bedrijf` — exact, zoals op de pagina;
//   • `email` — dan zoekt dit script zelf de rij op via het domein.
// De tweede vorm bestaat omdat Gmail geen bedrijfsnamen kent: een export uit
// de mailbox levert adressen op. Levert het domein meer dan één rij op (een
// bedrijf dat in twee regio's gepubliceerd staat), dan gebeurt er niets en
// wordt dat gemeld — welke van de twee pagina's er gemaild is, weet alleen de
// mail zelf, en gokken zou de opvolgronde op de verkeerde rang zetten.
const opDomein = new Map();
for (const r of rijen) {
  if (!r.domein) continue;
  if (!opDomein.has(r.domein)) opDomein.set(r.domein, []);
  opDomein.get(r.domein).push(r);
}
const opEmail = new Map(rijen.filter(r => r.email).map(r => [r.email.toLowerCase(), r]));

function zoekRij(g) {
  if (g.slug && g.bedrijf) return opSleutel.get(outreach.sleutelVan(g.slug, g.bedrijf)) || null;
  if (!g.email) return null;
  const direct = opEmail.get(String(g.email).toLowerCase());
  if (direct) return direct;
  const d = outreach.domeinVan(g.email);
  const kandidaten = d ? (opDomein.get(d) || []) : [];
  return kandidaten.length === 1 ? kandidaten[0] : null;
}

let gmailGekoppeld = 0;
const gmailVerweesd = [];
if (gmailPad) {
  if (!fs.existsSync(gmailPad)) stop('bestand niet gevonden: ' + gmailPad);
  let lijst;
  try { lijst = JSON.parse(fs.readFileSync(gmailPad, 'utf8')); }
  catch (e) { stop(gmailPad + ' bevat ongeldige JSON — ' + e.message); }
  if (!Array.isArray(lijst)) stop(gmailPad + ': verwacht een lijst');

  for (const g of lijst) {
    // Regels zonder aanwijzing zijn toelichting in het bestand zelf, geen feit.
    if (!g.email && !g.slug) continue;
    const rij = zoekRij(g);
    if (!rij) { gmailVerweesd.push((g.slug ? g.slug + ' / ' + g.bedrijf + ' ' : '') + '(' + (g.email || '?') + ')'); continue; }
    rij.historisch = true;
    if (g.opvolg1Op) rij.opvolg1.verstuurdOp = g.opvolg1Op;
    if (g.whatsappGevraagdOp) rij.whatsapp.gevraagdOp = g.whatsappGevraagdOp;
    if (g.email) rij.email = g.email;
    if (g.threadId) rij.threadId = g.threadId;
    if (Array.isArray(g.nevenThreads) && g.nevenThreads.length) {
      rij.nevenThreads = [...new Set(rij.nevenThreads.concat(g.nevenThreads))];
    }
    if (g.mail1Op) rij.mail1.verstuurdOp = g.mail1Op;
    if (g.antwoordOp) rij.antwoord = { datum: g.antwoordOp, soort: g.antwoordSoort || 'onbekend' };
    if (g.optOutOp) rij.optOut = { datum: g.optOutOp, bron: g.optOutBron || 'mail' };
    if (g.laatstGezienOp) {
      rij.laatstGezien = { datum: g.laatstGezienOp, van: g.laatstGezienVan === 'bedrijf' ? 'bedrijf' : 'olivier' };
    }
    gmailGekoppeld++;
  }
}

// ── 4. Verslag ──────────────────────────────────────────────────────────
const gemaild = rijen.filter(r => r.mail1.verstuurdOp).length;
const beantwoord = rijen.filter(r => r.antwoord).length;
const optOut = rijen.filter(r => r.optOut).length;

console.log('');
console.log('Outreach-logboek' + (droog ? ' (droogloop — er wordt niets geschreven)' : ''));
console.log('  bedrijven in het logboek : ' + rijen.length + (nieuw.length ? '  (+' + nieuw.length + ' nieuw)' : ''));
console.log('  rang uit selectie.json   : ' + rangGezet + ' van ' + rijen.length +
  '  (top ' + outreach.TOP_N + ': ' + rijen.filter(r => r.rang !== null && r.rang <= outreach.TOP_N).length + ')');
console.log('  al benaderd (historisch) : ' + rijen.filter(r => r.historisch).length);
console.log('  mail 1 verstuurd (gelogd): ' + gemaild);
console.log('  nog te benaderen         : ' + rijen.filter(r => outreach.magMail1(r)).length);
console.log('  antwoord ontvangen       : ' + beantwoord);
console.log('  opt-out                  : ' + optOut);
console.log('  WhatsApp-nummer          : ' + waGekoppeld);
console.log('  met websitedomein        : ' + domeinGevonden + ' van ' + rijen.length);
console.log('  zelf afhandelen          : ' + rijen.filter(r => r.zelfAfhandelen).length);
if (gmailPad) console.log('  uit Gmail gekoppeld      : ' + gmailGekoppeld);

if (rangGewijzigd.length) {
  console.log('\n  LET OP — ' + rangGewijzigd.length + ' bedrijf(en) staan nu op een andere plaats dan in het logboek:');
  rangGewijzigd.forEach(s => console.log('    - ' + s));
  console.log('    (de nieuwe plaats is overgenomen uit selectie.json — dat is de bron)');
}

if (zonderRang.length) {
  console.log('\n  LET OP — ' + zonderRang.length + ' rij(en) staan in geen enkele selectie.json:');
  zonderRang.forEach(r => console.log('    - ' + r.slug.replace('dakwerkers-', '') + ' / ' + r.bedrijf));
  console.log('    (die worden nooit voor een opvolgmail aangeboden)');
}

for (const [naam, lijst] of [['WhatsApp', waVerweesd], ['uitsluitlijst', zelfVerweesd], ['Gmail', gmailVerweesd]]) {
  if (!lijst.length) continue;
  console.log('\n  LET OP — ' + lijst.length + ' regel(s) uit ' + naam + ' horen bij geen enkel gepubliceerd bedrijf:');
  lijst.forEach(s => console.log('    - ' + s));
  console.log('    (naam anders geschreven dan op de pagina? gebruik scripts/zoek-bedrijf.js)');
}

if (droog) { console.log('\nNiets geschreven.\n'); process.exit(0); }


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

const p = outreach.schrijf(ROOT, rijen, vandaagISO());
console.log('\nGeschreven: ' + path.relative(ROOT, p) + '\n');
verversDashboard();
