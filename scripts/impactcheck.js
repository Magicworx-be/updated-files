#!/usr/bin/env node
// =====================================================================
// scripts/impactcheck.js — hangt alles nog aan elkaar?
//
// WAAROM DIT BESTAAT
//
// Olivier stelde op 4 september 2026 vast dat de gevolgen van een wijziging
// pas ter sprake kwamen toen hij er zelf naar vroeg. Dat kan hij niet zelf
// bewaken: hij weet niet altijd waar dingen aan elkaar hangen — daar heeft hij
// deze code voor. En "ik denk er wel aan" is geen rem; dat is precies het soort
// belofte dat op een drukke dag stilzwijgend faalt.
//
// Dit script controleert daarom mechanisch de plekken waar dit project uit
// elkaar kán lopen. Het bewaakt geen stijl en geen inhoud — alleen VERBANDEN:
// een tekst die naar een bestand wijst dat niet bestaat, een commando met een
// vlag die de code niet kent, een getal dat in de code anders staat dan in de
// uitleg, een vaste zin waar een controle op steunt maar die uit het sjabloon
// verdwenen is, en een geplande taak die afwijkt van haar kopie in de repo.
//
// Elk van die vijf heeft dit project al één keer gekost. De vingerafdrukcheck
// is de scherpste: verdwijnt de zin "Ik wou je opname op Keurwijzer graag
// afwerken." uit de opvolgmail, dan valt de rem tegen dubbele mails stil
// zonder dat iemand het merkt.
//
// Gebruik:
//   node scripts/impactcheck.js          alles nakijken
//   node scripts/impactcheck.js --stil   alleen problemen tonen
//
// Draait mee met `npm test` en met `node build-all.js`.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const stil = process.argv.includes('--stil');

const fouten = [];
const waarschuwingen = [];
const fout = (m) => fouten.push(m);
const waarschuw = (m) => waarschuwingen.push(m);
const zegt = (m) => { if (!stil) console.log(m); };

const lees = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Voor vergelijken: regeleinden en regelafbrekingen mogen nooit het verschil
// maken. Een vaste zin die in een prompt over twee regels loopt, is dezelfde
// zin; een bestand met CRLF is hetzelfde bestand als een met LF. Zonder deze
// normalisatie meldt de check verschillen die er niet zijn — en een check die
// loze meldingen geeft, wordt genegeerd, en dan bewaakt ze niets meer.
const plat = (t) => String(t).replace(/\s+/g, ' ').trim();
const bestaat = (p) => fs.existsSync(path.join(ROOT, p));

// De documenten die het project uitleggen. Verandert de code, dan is dit de
// verzameling die mee moet veranderen — en dus ook de verzameling die kan
// verouderen zonder dat iets stukgaat.
function documenten() {
  const uit = [];
  const voegToe = (p) => { if (bestaat(p)) uit.push(p); };
  // WIJZIGINGEN.md staat hier bewust NIET bij: dat is het waarom-logboek en het
  // beschrijft met opzet de oude toestand, inclusief bestandsnamen die sindsdien
  // verdwenen zijn. Die verwijzingen zijn geschiedenis, geen belofte.
  ['CLAUDE.md', 'METHODIEK.md', 'ARCHITECTUUR.md'].forEach(voegToe);
  for (const map of ['prompts', 'scripts', 'test']) {
    if (!bestaat(map)) continue;
    fs.readdirSync(path.join(ROOT, map))
      .filter(f => f.endsWith('.md'))
      .forEach(f => uit.push(map + '/' + f));
  }
  for (const map of ['.claude/skills', 'geplande-taken']) {
    if (!bestaat(map)) continue;
    for (const naam of fs.readdirSync(path.join(ROOT, map))) {
      const p = map + '/' + naam + '/SKILL.md';
      if (bestaat(p)) uit.push(p);
    }
  }
  return uit;
}

const DOCS = documenten();

// ── 1. Verwijzingen naar bestanden die niet bestaan ─────────────────────
// Een prompt die naar `scripts/outreach-gmail.md` wees terwijl dat bestand niet
// bestond, stond hier maanden ongemerkt. Wie het volgt, loopt vast.
const PAD = /(?:^|[\s(`"'[])((?:scripts|lib|prompts|test|geplande-taken|\.claude)\/[A-Za-z0-9_\-./]+\.(?:js|md|json))/g;
// Paden met een plaatshouder (<slug>, {{SLUG}}, *) slaan we over: die bestaan
// per definitie niet als letterlijk bestand.
const isSjabloon = (p) => /[<>{}*]|SLUG|NICHE|REGIO/.test(p);

function checkVerwijzingen() {
  let gezien = 0;
  for (const doc of DOCS) {
    const tekst = lees(doc);
    for (const m of tekst.matchAll(PAD)) {
      const p = m[1].replace(/[.,;:)`'"\]]+$/, '');
      if (isSjabloon(p)) continue;
      gezien++;
      if (!bestaat(p)) fout(doc + ' verwijst naar ' + p + ', dat bestaat niet');
    }
  }
  zegt('  verwijzingen naar bestanden : ' + gezien + ' gecontroleerd');
}

// ── 2. Commando's met vlaggen die de code niet kent ─────────────────────
// `node scripts/outreach-lijst.js --vrijdag` in een skill is een belofte. Staat
// die vlag niet in het script, dan doet het commando iets anders dan de tekst
// zegt — of niets.
const COMMANDO = /node (scripts\/[a-z0-9-]+\.js)((?:\s+--[a-z0-9-]+)*)/g;

function checkCommandos() {
  let gezien = 0;
  for (const doc of DOCS) {
    for (const m of lees(doc).matchAll(COMMANDO)) {
      const script = m[1];
      gezien++;
      if (!bestaat(script)) { fout(doc + ' roept ' + script + ' aan, dat bestaat niet'); continue; }
      const code = lees(script);
      for (const vlag of (m[2] || '').trim().split(/\s+/).filter(Boolean)) {
        if (!code.includes("'" + vlag + "'") && !code.includes('"' + vlag + '"')) {
          fout(doc + ': ' + script + ' kent de vlag ' + vlag + ' niet');
        }
      }
    }
  }
  zegt('  commando\'s met vlaggen      : ' + gezien + ' gecontroleerd');
}

// ── 3. Getallen die op twee plekken staan ───────────────────────────────
// De code rekent, de tekst legt uit. Lopen die uit elkaar, dan doet het systeem
// iets anders dan wat er aan Olivier én aan Cowork verteld wordt. Dit is de
// congruentieregel uit CLAUDE.md, maar dan afdwingbaar.
const WOORD = { 1: 'een', 2: 'twee', 3: 'drie', 4: 'vier', 5: 'vijf', 10: 'tien' };

function checkGetallen() {
  const outreach = require('../lib/outreach');
  const rekenkern = bestaat('lib/rekenkern.js') ? require('../lib/rekenkern') : null;

  const paren = [
    { wat: 'TOP_N', waarde: outreach.TOP_N,
      moetIn: ['.claude/skills/keurwijzer-opvolgmails/SKILL.md',
               'geplande-taken/keurwijzer-opvolgmails-vrijdag/SKILL.md',
               'METHODIEK.md'],
      zin: (v) => ['top ' + v] },
    { wat: 'WACHT_WERKDAGEN', waarde: outreach.WACHT_WERKDAGEN,
      moetIn: ['.claude/skills/keurwijzer-opvolgmails/SKILL.md', 'METHODIEK.md'],
      // Cijfer of woord: allebei goed Nederlands, allebei even duidelijk.
      zin: (v) => [v + ' werkdagen', WOORD[v] + ' werkdagen'] },
  ];
  if (rekenkern && rekenkern.WEIGHTS) {
    paren.push({ wat: 'BAYES_M', waarde: rekenkern.BAYES_M,
      moetIn: ['METHODIEK.md'], zin: (v) => ['M=' + v] });
    paren.push({ wat: 'MIN_REVIEWS', waarde: rekenkern.MIN_REVIEWS,
      moetIn: ['METHODIEK.md'], zin: (v) => [v + ' reviews'] });
  }

  for (const p of paren) {
    if (p.waarde === undefined) continue;
    const vormen = p.zin(p.waarde).filter(Boolean);
    for (const doc of p.moetIn) {
      if (!bestaat(doc)) continue;
      // Spaties rond '=' weghalen, zodat "M = 16" en "M=16" hetzelfde zijn.
      const tekst = plat(lees(doc)).toLowerCase().replace(/\s*=\s*/g, '=');
      const gevonden = vormen.some(v => tekst.includes(v.toLowerCase().replace(/\s*=\s*/g, '=')));
      if (!gevonden) {
        fout(doc + ' zegt niets over "' + vormen[0] + '" terwijl ' + p.wat + ' = ' + p.waarde +
          '. Code en uitleg lopen uit elkaar.');
      }
    }
  }
  zegt('  getallen code vs uitleg     : ' + paren.length + ' gecontroleerd');
}

// ── 4. Vaste zinnen waar een controle op steunt ─────────────────────────
// Twee remmen in de mailrondes herkennen aan één zin of er al iets gestuurd is.
// Verdwijnt die zin uit het sjabloon — bijvoorbeeld omdat Olivier de mail
// herschrijft — dan valt de rem stil zonder foutmelding, en krijgt een bedrijf
// twee keer dezelfde mail. Daarom staat ze hier.
const VINGERAFDRUKKEN = [
  { zin: 'Ik wou je opname op Keurwijzer graag afwerken.',
    sjabloon: '.claude/skills/keurwijzer-opvolgmails/SKILL.md',
    bewaakt: 'de rem tegen een tweede opvolgmail',
    genoemdIn: ['.claude/skills/keurwijzer-opvolgmails/SKILL.md',
                'geplande-taken/keurwijzer-opvolgmails-vrijdag/SKILL.md'] },
  { zin: 'Ik stuur je nog een testberichtje',
    sjabloon: 'prompts/reply-scenarios.md',
    bewaakt: 'de aankondiging van het WhatsApp-bericht — zonder deze zin komt het onaangekondigd aan',
    genoemdIn: ['prompts/reply-scenarios.md', 'scripts/whatsapp-nabericht.js'] },
  { zin: 'Ik heb je WhatsApp-nummer toegevoegd',
    sjabloon: 'prompts/reply-scenarios.md',
    bewaakt: 'het WhatsApp-bericht dat een uur na de bevestigingsmail klaargezet wordt',
    genoemdIn: ['prompts/reply-scenarios.md', 'scripts/whatsapp-nabericht.js'] },
  { zin: 'Gebruik deze badges gerust',
    sjabloon: 'prompts/reply-scenarios.md',
    bewaakt: 'de controle of een bedrijf zijn badge al kreeg (scenario 4)',
    genoemdIn: ['prompts/reply-scenarios.md', '.claude/skills/keurwijzer-mails/SKILL.md'] },
];

function checkVingerafdrukken() {
  for (const v of VINGERAFDRUKKEN) {
    if (!bestaat(v.sjabloon)) { fout('sjabloon ontbreekt: ' + v.sjabloon); continue; }
    if (!plat(lees(v.sjabloon)).includes(plat(v.zin))) {
      fout('DE ZIN "' + v.zin + '" staat niet meer in ' + v.sjabloon + '.\n' +
        '      Daarop steunt ' + v.bewaakt + '. Pas de controle mee aan, of zet de zin terug.');
    }
    for (const doc of v.genoemdIn) {
      if (bestaat(doc) && !plat(lees(doc)).includes(plat(v.zin))) {
        fout(doc + ' hoort de vingerafdruk "' + v.zin + '" te noemen, maar doet dat niet');
      }
    }
  }
  zegt('  vingerafdrukken             : ' + VINGERAFDRUKKEN.length + ' gecontroleerd');
}

// ── 5. Geplande taken: draait er wat er in de repo staat? ───────────────
// De taak die 's avonds vanzelf loopt, leest het bestand in ~/.claude. Wat in
// de repo staat is een kopie. Lopen die uit elkaar, dan doet de automatische
// run iets anders dan wat je hier leest — en dat merk je pas achteraf.
function checkGeplandeTaken() {
  const live = path.join(os.homedir(), '.claude', 'scheduled-tasks');
  if (!bestaat('geplande-taken') || !fs.existsSync(live)) { zegt('  geplande taken              : geen'); return; }
  let gezien = 0;
  for (const naam of fs.readdirSync(path.join(ROOT, 'geplande-taken'))) {
    const repo = path.join(ROOT, 'geplande-taken', naam, 'SKILL.md');
    const draait = path.join(live, naam, 'SKILL.md');
    if (!fs.existsSync(repo) || !fs.existsSync(draait)) continue;
    gezien++;
    if (plat(fs.readFileSync(repo, 'utf8')) !== plat(fs.readFileSync(draait, 'utf8'))) {
      fout('geplande taak "' + naam + '" wijkt af van haar kopie in de repo.\n' +
        '      Wat er draait: ' + draait + '\n' +
        '      Kopieer de juiste versie over vóór de taak weer loopt.');
    }
  }
  zegt('  geplande taken              : ' + gezien + ' gecontroleerd');
}

// ── 6. Is METHODIEK.md nog gelijkgezet? (waarschuwing) ──────────────────
// Geen harde fout: de datum kan om een goede reden achterlopen. Wel iets om te
// zien, want METHODIEK.md is wat Cowork leest.
function checkMethodiekDatum() {
  if (!bestaat('METHODIEK.md')) return;
  const m = /Laatst gelijkgezet met de code\**\s*\|\s*(\d{1,2}) (\w+) (\d{4})/.exec(lees('METHODIEK.md'));
  if (!m) { waarschuw('METHODIEK.md: de regel "Laatst gelijkgezet met de code" is niet leesbaar'); return; }
  const MAAND = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli',
    'augustus', 'september', 'oktober', 'november', 'december'];
  const maand = MAAND.indexOf(m[2].toLowerCase());
  if (maand < 0) { waarschuw('METHODIEK.md: maand "' + m[2] + '" niet herkend'); return; }
  const gelijk = new Date(Date.UTC(+m[3], maand, +m[1]));
  for (const bron of ['lib/rekenkern.js', 'lib/outreach.js']) {
    if (!bestaat(bron)) continue;
    const gewijzigd = fs.statSync(path.join(ROOT, bron)).mtime;
    if (gewijzigd > new Date(gelijk.getTime() + 24 * 3600 * 1000)) {
      waarschuw(bron + ' is later gewijzigd dan de datum bovenaan METHODIEK.md (' +
        m[1] + ' ' + m[2] + ' ' + m[3] + ').\n' +
        '      Controleer of de uitleg nog klopt en zet de datum bij als dat zo is.');
    }
  }
}

// ── Uitvoeren ───────────────────────────────────────────────────────────
zegt('\nImpactcheck — hangt alles nog aan elkaar?');
checkVerwijzingen();
checkCommandos();
checkGetallen();
checkVingerafdrukken();
checkGeplandeTaken();
checkMethodiekDatum();

if (waarschuwingen.length) {
  console.log('\nLET OP (' + waarschuwingen.length + '):');
  waarschuwingen.forEach(w => console.log('  - ' + w));
}

if (fouten.length) {
  console.error('\nDE KETTING IS ERGENS GEBROKEN (' + fouten.length + '):');
  fouten.forEach(f => console.error('  - ' + f));
  console.error('\nDit zijn verbanden, geen stijlfouten. Elk ervan betekent dat een tekst');
  console.error('iets belooft wat de code niet meer doet, of omgekeerd.\n');
  process.exit(1);
}

zegt('\nAlles hangt nog aan elkaar.\n');
