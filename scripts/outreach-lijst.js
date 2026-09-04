#!/usr/bin/env node
// =====================================================================
// scripts/outreach-lijst.js — de werklijst uit het logboek
//
// De mailrondes hoeven Gmail niet langer af te struinen om te weten wat er te
// doen is. Ze stellen hier één vraag en krijgen een korte lijst terug. Pas
// dáárna openen ze per kandidaat de thread met `get_thread` — want de
// Gmail-zoeklijst laat soms het nieuwste bericht weg, dus vóór een draft moet
// de thread zelf altijd nog eens bekeken worden.
//
// Eén vast commando per vraag, zodat er geen `node -e` met vrije code op de
// toestemmingslijst hoeft te staan (dezelfde reden als scripts/zoek-bedrijf.js).
//
// Gebruik:
//   node scripts/outreach-lijst.js --vrijdag      de volledige vrijdagronde (2 lijsten)
//   node scripts/outreach-lijst.js --zelf         gesprekken die Olivier zelf voert
//   node scripts/outreach-lijst.js --opvolg       klaar voor een opvolgmail
//   node scripts/outreach-lijst.js --nieuw        moeten mail 1 nog krijgen
//   node scripts/outreach-lijst.js --adres <mail> kreeg dit adres al een mail 1?
//   node scripts/outreach-lijst.js --nummer-open  nummer beloofd, niet gekregen
//   node scripts/outreach-lijst.js --badge-open   badge beloofd, niet geplaatst
//   node scripts/outreach-lijst.js --bedrijf <naam>   alles over één bedrijf
//   node scripts/outreach-lijst.js                samenvatting
// =====================================================================
'use strict';
const path = require('path');
const outreach = require('../lib/outreach');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const vandaag = outreach.vandaagISO();

const { bestaat, rijen, fouten } = outreach.load(ROOT);
if (!bestaat) {
  console.error('data/outreach.json bestaat nog niet. Leg het aan: node scripts/outreach-seed.js');
  process.exit(1);
}
if (fouten.length) {
  console.error('Het logboek is niet in orde:\n  - ' + fouten.join('\n  - '));
  process.exit(1);
}

const regio = (r) => r.slug.replace('dakwerkers-', '');

// Eén regel per bedrijf, met alles wat een mailronde nodig heeft om te
// beslissen — en met de thread erbij, zodat de ronde meteen kan controleren.
function regel(r) {
  const delen = [r.bedrijf + '  (' + regio(r) + (r.rang !== null ? ' #' + r.rang : '') + ')'];
  if (r.email) delen.push('mail: ' + r.email);
  if (r.threadId) delen.push('thread: ' + r.threadId);
  if (r.mail1.verstuurdOp) delen.push('mail1: ' + r.mail1.verstuurdOp);
  if (r.opvolg1.draftOp) delen.push('opvolg1-draft: ' + r.opvolg1.draftOp);
  if (r.antwoord) delen.push('antwoord: ' + r.antwoord.datum + ' (' + r.antwoord.soort + ')');
  if (r.whatsapp.nummer) delen.push('whatsapp: live');
  else if (r.whatsapp.gevraagdOp) delen.push('whatsapp: gevraagd ' + r.whatsapp.gevraagdOp);
  if (r.historisch) delen.push('historisch');
  return '- ' + delen.join(' · ');
}

function toon(titel, lijst, leeg) {
  console.log('\n' + titel + ' — ' + lijst.length);
  if (!lijst.length) { console.log('  ' + leeg); return; }
  lijst.forEach(r => console.log(regel(r)));
}

const heeft = (v) => argv.includes(v);

// De twee lijsten van de vrijdagronde, in één keer en streng gescheiden.
// De skill leest hier, en alleen hier: zo staat de regel op één plek en kan
// een ronde niet per ongeluk een eigen definitie van "top 5" hanteren.
function vrijdag() {
  const koud = outreach.opvolgKandidaten(rijen, vandaag);
  const nummer = outreach.wachtOpNummer(rijen, vandaag);
  console.log('\n=================================================================');
  console.log(' VRIJDAGRONDE — ' + vandaag);
  console.log(' ' + koud.length + ' koude opvolging(en) + ' + nummer.length +
    ' WhatsApp-vraag/vragen = ' + (koud.length + nummer.length) + ' draft(s)');
  console.log('=================================================================');
  toon('LIJST 1 — top ' + outreach.TOP_N + ', geen antwoord op mail 1 (> ' +
    outreach.WACHT_WERKDAGEN + ' werkdagen)', koud,
    'niemand — er staat geen bedrijf uit de top ' + outreach.TOP_N + ' lang genoeg te wachten');
  toon('LIJST 2 — WhatsApp-nummer gevraagd, niet gekregen (> ' +
    outreach.WACHT_WERKDAGEN + ' werkdagen)', nummer,
    'niemand — geen enkele nummervraag staat lang genoeg open');

  // Geen derde lijst om te mailen, maar wel om te melden: hier wacht het
  // bedrijf op Olivier. Een herinnering sturen aan wie net geschreven heeft is
  // het slechtste wat deze ronde kan doen.
  const opOlivier = outreach.wachtOpOlivier(rijen);
  toon('NIET MAILEN — deze bedrijven wachten op JOUW antwoord (werk voor /keurwijzer-mails)',
    opOlivier, 'geen');

  // Twee kandidaten, één postbus. Kan alleen als een bedrijf in twee regio's
  // gepubliceerd staat of als twee bedrijven één adres delen. Dan mag er maar
  // één mail uit, anders krijgt de ontvanger twee bijna identieke berichten.
  const botsingen = outreach.dubbeleAdressen(koud.concat(nummer));
  if (botsingen.length) {
    console.log('\n!! STOP — hetzelfde mailadres staat twee keer in deze ronde: ' + botsingen.length);
    botsingen.forEach(b => {
      console.log('   ' + b.email);
      b.rijen.forEach(r => console.log('     - ' + r.bedrijf + ' (' + regio(r) + ' #' + r.rang + ')'));
    });
    console.log('   Maak er MAAR ÉÉN draft voor en meld het aan Olivier.');
  }
  console.log('');
}

if (heeft('--vrijdag')) {
  vrijdag();
} else if (heeft('--zelf')) {
  toon('Gesprekken die Olivier zelf voert (nooit een draft schrijven)',
    rijen.filter(r => r.zelfAfhandelen), 'geen');
} else if (heeft('--opvolg')) {
  toon('Klaar voor een opvolgmail (top ' + outreach.TOP_N + ', mail 1 > ' +
    outreach.WACHT_WERKDAGEN + ' werkdagen geleden, geen antwoord, geen draft)',
    outreach.opvolgKandidaten(rijen, vandaag),
    'niemand — rijen zonder rang en rijen zonder verzenddatum tellen niet mee');
} else if (heeft('--nieuw')) {
  toon('Moeten mail 1 nog krijgen', rijen.filter(r => outreach.magMail1(r)),
    'niemand — alle gepubliceerde bedrijven zijn benaderd');
} else if (heeft('--nummer-open')) {
  toon('WhatsApp-nummer gevraagd, nog niet gekregen (> ' + outreach.WACHT_WERKDAGEN + ' werkdagen)',
    outreach.wachtOpNummer(rijen, vandaag), 'geen');
} else if (heeft('--badge-open')) {
  toon('Badge beloofd, nog niet op hun site gezien', outreach.badgeBeloofd(rijen), 'geen');
} else if (heeft('--adres')) {
  // De rem tegen een TWEEDE kennismakingsmail naar dezelfde postbus.
  //
  // Het logboek denkt per bedrijf-in-een-regio. Een bedrijf dat in twee regio's
  // gepubliceerd staat, heeft dus twee rijen — en de tweede rij ziet er voor
  // `magMail1()` uit als iemand die nog nooit gemaild is. Fase 6 zou er dan een
  // "we hebben alle dakwerkers vergeleken"-mail naartoe sturen die ze al gehad
  // hebben. Dat is precies de fout die Keurwijzer geloofwaardigheid kost.
  //
  // Daarom controleert Fase 6 elk adres hier vóór ze een draft maakt. Het adres
  // is bekend op dat moment: het is net van de website gehaald.
  const adres = argv[argv.indexOf('--adres') + 1] || '';
  if (!adres) { console.error('Gebruik: node scripts/outreach-lijst.js --adres "<mailadres>"'); process.exit(2); }
  const k = adres.toLowerCase().trim();
  const dom = outreach.domeinVan(k);
  const opAdres = rijen.filter(r => r.email && r.email.toLowerCase() === k);
  const opDomein = dom ? rijen.filter(r => r.domein === dom && !opAdres.includes(r)) : [];

  console.log('\nAdres: ' + adres + (dom ? '   (domein: ' + dom + ')' : '   (gedeelde postbus — enkel exacte match)'));
  toon('Rijen met exact dit mailadres', opAdres, 'geen');
  toon('Rijen met hetzelfde websitedomein', opDomein, 'geen');

  const gemaild = opAdres.concat(opDomein).filter(r => r.mail1.verstuurdOp || r.mail1.draftOp);
  if (gemaild.length) {
    console.log('\n!! NIET MAILEN — dit adres kreeg al een kennismakingsmail:');
    gemaild.forEach(r => console.log('   - ' + r.bedrijf + ' (' + regio(r) + ' #' + r.rang + ') op ' +
      (r.mail1.verstuurdOp || r.mail1.draftOp + ' (draft)')));
    console.log('   Sla dit bedrijf over in Fase 6 en meld het aan Olivier.\n');
    process.exit(3);
  }
  const uit = opAdres.concat(opDomein).filter(r => !outreach.magBenaderen(r));
  if (uit.length) {
    console.log('\n!! NIET MAILEN — dit adres hoort bij een bedrijf dat geen mail mag krijgen:');
    uit.forEach(r => console.log('   - ' + r.bedrijf + ': ' +
      (r.optOut ? 'opt-out op ' + r.optOut.datum : 'Olivier handelt dit zelf af')));
    console.log('');
    process.exit(3);
  }
  console.log('\nOK — dit adres kreeg nog geen kennismakingsmail.\n');
} else if (heeft('--bedrijf')) {
  const naam = argv[argv.indexOf('--bedrijf') + 1] || '';
  const zoek = outreach.norm(naam);
  const treffers = rijen.filter(r => outreach.norm(r.bedrijf).includes(zoek));
  if (!zoek) { console.error('Gebruik: node scripts/outreach-lijst.js --bedrijf "<naam>"'); process.exit(2); }
  toon('Bedrijven die lijken op "' + naam + '"', treffers,
    'niets gevonden — probeer scripts/zoek-bedrijf.js voor de exacte schrijfwijze');
  treffers.forEach(r => console.log('\n' + JSON.stringify(r, null, 2)));
} else {
  console.log('\nOutreach-logboek — ' + rijen.length + ' bedrijven');
  console.log('  al benaderd vóór het logboek : ' + rijen.filter(r => r.historisch).length);
  console.log('  moeten mail 1 nog krijgen    : ' + rijen.filter(r => outreach.magMail1(r)).length);
  console.log('  klaar voor een opvolgmail    : ' + outreach.opvolgKandidaten(rijen, vandaag).length);
  console.log('  antwoord gekregen            : ' + rijen.filter(r => r.antwoord).length);
  console.log('  WhatsApp-nummer live         : ' + rijen.filter(r => r.whatsapp.nummer).length);
  console.log('  nummer gevraagd, niet gekregen: ' + outreach.wachtOpNummer(rijen, vandaag).length);
  console.log('  badge beloofd, niet geplaatst: ' + outreach.badgeBeloofd(rijen).length);
  console.log('  Olivier handelt zelf af      : ' + rijen.filter(r => r.zelfAfhandelen).length);
  console.log('  wil niet meer gemaild        : ' + rijen.filter(r => r.optOut).length);
  console.log('\nMeer: --vrijdag --zelf --opvolg --nieuw --nummer-open --badge-open --bedrijf "<naam>"\n');
}
