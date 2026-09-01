#!/usr/bin/env node
/**
 * Regressietest voor de beslisregels van de WhatsApp-routine.
 *
 * Elk geval hieronder is een échte mailwisseling van 27 augustus t/m
 * 1 september 2026, of een variant erop die precies de valkuil raakt waar de
 * oude routine op stukliep. Verandert er iets aan `beoordeel()`, dan moet dit
 * bestand blijven slagen.
 *
 * Draaien:  node scripts/whatsapp-routine.test.js
 */

const { beoordeel, kernTekst, vindNummers, normaliseer } = require('./whatsapp-routine');

const b64 = (t) => Buffer.from(t, 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

let tijd = Date.parse('2026-09-01T08:00:00Z');
const bericht = (van, tekst) => ({
  id: 'm' + (tijd += 600000),
  internalDate: String(tijd),
  payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: van }], body: { data: b64(tekst) } },
});
const OLIVIER = 'Olivier Muys <Olivier@magicworx.net>';

const SLUGS = new Set(['dakwerkers-aalst', 'dakwerkers-oostende', 'dakwerkers-brugge']);

let gezakt = 0;
function test(naam, thread, verwacht) {
  let uitkomst;
  try { uitkomst = beoordeel(thread, SLUGS, new Set()); }
  catch (e) { console.log(`✗ ${naam}\n    fout tijdens beoordelen: ${e.message}`); gezakt++; return; }

  const werkelijk = !uitkomst ? { soort: 'niets' }
    : { soort: uitkomst.soort, nummer: uitkomst.nummer, bevestiging: uitkomst.bevestigingsgeval,
        bedrijf: uitkomst.bedrijf, reden: uitkomst.reden };

  const fouten = [];
  for (const [sleutel, waarde] of Object.entries(verwacht)) {
    if (sleutel === 'redenBevat') {
      if (!String(werkelijk.reden || '').toLowerCase().includes(waarde.toLowerCase())) {
        fouten.push(`reden moest "${waarde}" bevatten, was: "${werkelijk.reden}"`);
      }
    } else if (werkelijk[sleutel] !== waarde) {
      fouten.push(`${sleutel}: verwacht ${JSON.stringify(waarde)}, kreeg ${JSON.stringify(werkelijk[sleutel])}`);
    }
  }
  if (fouten.length) { console.log(`✗ ${naam}\n    ` + fouten.join('\n    ')); gezakt++; }
  else console.log(`✓ ${naam}`);
}

const outreach = (bedrijf, slug) => bericht(OLIVIER,
  `Goedemiddag,\n\nWe hebben alle dakwerkers vergeleken.\n${bedrijf} staat in de top 10.\nZie: keurwijzer.be/${slug}.\n\nGroeten, Olivier`);

// ── 1. Het geval dat op 1 september gemist werd ────────────────────────────
test('DWG Projects geeft zijn nummer in de lopende tekst', {
  id: 't1',
  messages: [
    outreach('DWG Projects specialist platte daken', 'dakwerkers-aalst'),
    bericht(OLIVIER, 'Hi Gregory,\n\nHeb je een zakelijk WhatsApp-nummer?\nDan voeg ik dat graag toe aan je listing.\n\nGroeten,\nOlivier'),
    bericht('DWG -projects <dwgprojects@outlook.com>',
      'Beste,\n\nJa dit is 0471362859\n\nMvg\n\nVerzonden vanaf Outlook voor Android\n________________________________\nFrom: Olivier Muys <Olivier@magicworx.net>\nHeb je een zakelijk WhatsApp-nummer?'),
  ],
}, { soort: 'toevoegen', nummer: '32471362859', bevestiging: false, bedrijf: 'DWG Projects specialist platte daken' });

// ── 2. Bevestiging van een nummer dat Olivier zelf voorstelde ──────────────
test('Vereecke bevestigt het voorgestelde nummer', {
  id: 't2',
  messages: [
    outreach('Buitenschrijnwerk Vereecke Tobias BV', 'dakwerkers-oostende'),
    bericht(OLIVIER, 'Hi Tobias,\n\nIs 0470 49 23 82 je zakelijk WhatsApp-nummer?\n\nGroeten,\nOlivier'),
    bericht('info@buitenschrijnwerken-vereecke-tobias.be',
      'Inderdaad het nummer klopt! Bedankt alvast\n\nMet vriendelijke groet\nTobias Vereecke\nVereecke Tobias BV\n0470492382'),
  ],
}, { soort: 'toevoegen', nummer: '32470492382', bevestiging: true });

// ── 3. De handtekening-valkuil ────────────────────────────────────────────
test('nummer staat alleen in de handtekening → niet publiceren', {
  id: 't3',
  messages: [
    outreach('DWG Projects specialist platte daken', 'dakwerkers-aalst'),
    bericht(OLIVIER, 'Heb je een zakelijk WhatsApp-nummer?'),
    bericht('info@voorbeeld.be',
      'Hallo\n\nStuur gerust info eens door .\n\nMet vriendelijke groeten,\n\nHans De Wolf\nZaakvoerder\n0497 62 39 28'),
  ],
}, { soort: 'aandacht', redenBevat: 'handtekening' });

// ── 4. Een vaag "ok" is geen toestemming ──────────────────────────────────
test('vage bevestiging wordt niet als toestemming gelezen', {
  id: 't4',
  messages: [
    outreach('DWG Projects specialist platte daken', 'dakwerkers-aalst'),
    bericht(OLIVIER, 'Is 0471 36 28 59 je zakelijk WhatsApp-nummer?'),
    bericht('dwgprojects@outlook.com', 'Ok dat mag zeker .\n\nMvg'),
  ],
}, { soort: 'aandacht', redenBevat: 'geen duidelijke bevestiging' });

// ── 5. Naam in de mail is korter dan in de data ("D&G Dakwerken (Brugge)") ─
test('kortere naam in de mail wordt aan de volledige naam gekoppeld', {
  id: 't5',
  messages: [
    outreach('D&G Dakwerken', 'dakwerkers-brugge'),
    bericht(OLIVIER, 'Heb je een zakelijk Whatsapp nummer?'),
    bericht('info@dg-dakwerken.be',
      'Hi Olivier,\n\nHartelijk dank voor deze badges! Ons zakelijk whatsapp nummer is 0497 77 64 51.\n\nMet vriendelijke groet,\nD&G Dakwerken'),
  ],
}, { soort: 'toevoegen', nummer: '32497776451', bedrijf: 'D&G Dakwerken (Brugge)' });

// ── 6. Wij schreven het laatst → er valt niets te doen ────────────────────
test('laatste bericht is van Olivier → geen actie', {
  id: 't6',
  messages: [
    outreach('DWG Projects specialist platte daken', 'dakwerkers-aalst'),
    bericht('dwgprojects@outlook.com', 'Wat houdt dit juist in?'),
    bericht(OLIVIER, 'Heb je een zakelijk WhatsApp-nummer?'),
  ],
}, { soort: 'niets' });

// ── 7. Nooit naar een nummer gevraagd → geen actie ────────────────────────
test('zonder vraag naar een nummer gebeurt er niets', {
  id: 't7',
  messages: [
    outreach('DWG Projects specialist platte daken', 'dakwerkers-aalst'),
    bericht('dwgprojects@outlook.com', 'Bedankt, stuur de badge maar door. Mijn gsm is 0471362859'),
  ],
}, { soort: 'niets' });

// ── 8. Twee nummers in één antwoord → niet raden ──────────────────────────
test('twee nummers in het antwoord → naar Olivier', {
  id: 't8',
  messages: [
    outreach('DWG Projects specialist platte daken', 'dakwerkers-aalst'),
    bericht(OLIVIER, 'Heb je een zakelijk WhatsApp-nummer?'),
    bericht('dwgprojects@outlook.com', 'Je kan me bereiken op 0471362859 of 0475 12 34 56.\n\nMvg'),
  ],
}, { soort: 'aandacht', redenBevat: 'meerdere nummers' });

// ── losse bouwstenen ──────────────────────────────────────────────────────
const stuk = [
  ['normaliseer +32', normaliseer('+32 495 34 27 88'), '32495342788'],
  ['normaliseer 0-vorm', normaliseer('0468/56.01.62'), '32468560162'],
  ['normaliseer 0032', normaliseer('0032470060729'), '32470060729'],
  ['vast nummer telt niet mee', normaliseer('09 234 56 78'), null],
  ['te kort telt niet mee', normaliseer('0471 36 28'), null],
  ['citaat en handtekening eraf', kernTekst('Ja dit is 0471362859\n\nMvg\n\nVan: Olivier\nblabla 0475123456'), 'Ja dit is 0471362859'],
  ['nummer uit citaat telt niet', vindNummers(kernTekst('Bedankt!\n\n> ons nummer is 0475 12 34 56')).length, 0],
];
for (const [naam, werkelijk, verwacht] of stuk) {
  if (werkelijk === verwacht) console.log(`✓ ${naam}`);
  else { console.log(`✗ ${naam}\n    verwacht ${JSON.stringify(verwacht)}, kreeg ${JSON.stringify(werkelijk)}`); gezakt++; }
}

console.log(gezakt ? `\n${gezakt} test(s) gezakt.` : '\nAlle tests geslaagd.');
process.exit(gezakt ? 1 : 0);
