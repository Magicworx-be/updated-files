#!/usr/bin/env node
// =====================================================================
// scripts/whatsapp-nabericht.test.js — het WhatsApp-bericht na de bevestigingsmail
//
// Draait mee met `npm test`. Bewaakt de vier plekken waar dit stuk stil kan
// falen, en stil falen is hier het echte gevaar: er komt geen foutmelding als
// er níéts klaargezet wordt, en er komt ook geen waarschuwing als er te véél
// klaargezet wordt — dan staat het bericht al bij het bedrijf op de telefoon.
//
//   1. de bevestigingsmail herkennen (en een citaat ervan NIET aanzien voor
//      een tweede mail);
//   2. de voornaam uit diezelfde zin halen, zodat mail en bericht dezelfde
//      naam gebruiken;
//   3. het uur wachten, en de rem tegen een tweede bericht;
//   4. de thread aan het juiste bedrijf koppelen — nooit raden.
// =====================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const outreach = require('../lib/outreach');
const na = require('./whatsapp-nabericht');

// ── hulpjes ─────────────────────────────────────────────────────────────

const OLIVIER = 'Olivier Muys <Olivier@magicworx.net>';
const BEDRIJF = 'Mathias <mathias@tectora.be>';

let klok = Date.parse('2026-09-04T08:00:00Z');
const bericht = (van, tekst, naar = 'mathias@tectora.be') =>
  ({ id: 'm' + (klok += 600000), van, naar, datum: new Date(klok), tekst });

const BEVESTIGING = (naam) =>
  `Ik heb je WhatsApp-nummer toegevoegd${naam ? ', ' + naam : ''}.\n` +
  'Ik stuur je nog een testberichtje.\n\n' +
  'En mocht je ooit hulp nodig hebben met (meer) leads en klanten, laat t mij weten.\n\n' +
  'Groeten en alle succes,\nOlivier\n0470 12 44 61';

function rij(extra = {}) {
  const r = outreach.legeRij('dakwerkers-gent', 'Tectora');
  r.sleutel = outreach.sleutelVan(r.slug, r.bedrijf);
  r.email = 'info@tectora.be';
  r.threadId = 'draad-1';
  return Object.assign(r, extra);
}

// ── 1. de bevestigingsmail herkennen ────────────────────────────────────

test('herkent de bevestigingsmail van Olivier', () => {
  const gevonden = na.bevestigingIn([
    bericht(BEDRIJF, 'Mijn nummer is 0475 12 34 56'),
    bericht(OLIVIER, BEVESTIGING('Mathias')),
  ]);
  assert.ok(gevonden, 'de mail hoort gevonden te worden');
  assert.match(gevonden.tekst, /toegevoegd, Mathias\./);
});

test('een citaat van die zin in het antwoord van het bedrijf telt niet', () => {
  // Het bedrijf antwoordt en zijn mailprogramma hangt de hele geschiedenis
  // eronder. Zonder de afzendercontrole zou dat als een tweede bevestigingsmail
  // gelezen worden, met een tweede WhatsApp-bericht tot gevolg.
  const berichten = [
    bericht(OLIVIER, BEVESTIGING('Mathias')),
    bericht(BEDRIJF, 'Merci Olivier\n\n> Ik heb je WhatsApp-nummer toegevoegd, Mathias.'),
  ];
  const gevonden = na.bevestigingIn(berichten);
  assert.strictEqual(gevonden.id, berichten[0].id, 'de mail van Olivier hoort te winnen');
});

test('geen bevestigingsmail in de thread → niets', () => {
  assert.strictEqual(na.bevestigingIn([
    bericht(OLIVIER, 'Wat is je zakelijk WhatsApp-nummer?'),
    bericht(BEDRIJF, 'Dat is 0475 12 34 56'),
  ]), null);
});

test('twee bevestigingsmails: de laatste wint', () => {
  const berichten = [
    bericht(OLIVIER, BEVESTIGING('Mathias')),
    bericht(BEDRIJF, 'Sorry, verkeerd nummer doorgegeven'),
    bericht(OLIVIER, BEVESTIGING('Mathias')),
  ];
  assert.strictEqual(na.bevestigingIn(berichten).id, berichten[2].id);
});

// ── 2. de voornaam ──────────────────────────────────────────────────────

test('haalt de voornaam uit de bevestigingsmail', () => {
  assert.strictEqual(na.voornaamUit(BEVESTIGING('Mathias')), 'Mathias');
});

test('mail zonder naam → geen naam in het bericht', () => {
  assert.strictEqual(na.voornaamUit(BEVESTIGING(null)), null);
  // Zonder naam valt de komma mee weg: nooit 'bereiken, .'
  assert.match(na.bouwBericht(null), /Je kan me hier altijd bereiken\./);
  assert.doesNotMatch(na.bouwBericht(null), /bereiken,/);
});

test('geen naam verzinnen uit een halve zin', () => {
  // Alles wat niet één woord met letters is, is geen voornaam.
  assert.strictEqual(na.voornaamUit('Ik heb je WhatsApp-nummer toegevoegd, en de badge staat erbij.'), null);
  assert.strictEqual(na.voornaamUit('Ik heb je WhatsApp-nummer toegevoegd op de pagina.'), null);
});

test('het bericht is Nederlands, zonder druk en zonder uitroepteken', () => {
  const b = na.bouwBericht('Mathias');
  assert.match(b, /^Testberichtje via Keurwijzer\.be\. Je nummer staat online\./);
  assert.match(b, /Je kan me hier altijd bereiken, Mathias\./, 'de naam staat achteraan, niet in een aanhef');
  assert.doesNotMatch(b, /[!]/, 'geen uitroeptekens — dat is Oliviers stem niet');
  assert.doesNotMatch(b, /\b(gratis nu|laatste kans|vandaag nog)\b/i, 'geen schaarste');
  assert.ok(b.length < 400, 'een WhatsApp blijft kort');
});

// ── 3. het uur wachten, en de rem ───────────────────────────────────────

const NU = new Date('2026-09-04T12:00:00Z');
const geleden = (minuten) => new Date(NU.getTime() - minuten * 60000);

function kandidaten(r, minutenGeleden, opties) {
  return outreach.naberichtKandidaten([r], new Map([[r.sleutel, geleden(minutenGeleden)]]), NU, opties);
}

test('binnen het uur nog niet, na het uur wel', () => {
  assert.strictEqual(kandidaten(rij(), 59).length, 0, '59 minuten is te vroeg');
  assert.strictEqual(kandidaten(rij(), 61).length, 1, 'na een uur mag het');
});

test('de wachttijd komt uit lib/outreach.js, niet uit een prompt', () => {
  assert.strictEqual(outreach.NABERICHT_WACHT_MINUTEN, 60);
  assert.strictEqual(kandidaten(rij(), 30, { minuten: 15 }).length, 1);
});

test('nooit een tweede bericht naar hetzelfde bedrijf', () => {
  const r = rij({ nabericht: { klaargezetOp: '2026-09-03', nummer: '32475123456' } });
  assert.strictEqual(outreach.alNabericht(r), true);
  assert.strictEqual(kandidaten(r, 120).length, 0);
});

test('opt-out en eigen gesprekken van Olivier vallen weg', () => {
  assert.strictEqual(kandidaten(rij({ optOut: { datum: '2026-09-01', bron: 'mail' } }), 120).length, 0);
  assert.strictEqual(kandidaten(rij({ zelfAfhandelen: true }), 120).length, 0);
});

test('geen bevestigingsmail gevonden → geen kandidaat', () => {
  assert.strictEqual(outreach.naberichtKandidaten([rij()], new Map(), NU).length, 0);
});

// ── 4. de thread aan het juiste bedrijf koppelen ────────────────────────

test('koppelt op threadId', () => {
  const r = rij();
  assert.strictEqual(na.rijBijThread([r], 'draad-1', 'info@tectora.be').rij, r);
});

test('koppelt op nevenThread — één bedrijf kan twee threads hebben', () => {
  const r = rij({ threadId: 'draad-1', nevenThreads: ['draad-2'] });
  assert.strictEqual(na.rijBijThread([r], 'draad-2', 'mathias@tectora.be').rij, r);
});

test('valt terug op het domein als de thread onbekend is', () => {
  const r = rij({ threadId: null });
  assert.strictEqual(na.rijBijThread([r], 'draad-9', 'Mathias <mathias@tectora.be>').rij, r);
});

test('een gedeelde postbus koppelt nooit', () => {
  // Anders eist het eerste gmail-bedrijf alle gmail-threads op.
  const r = rij({ threadId: null, email: 'tectora@gmail.com' });
  const uit = na.rijBijThread([r], 'draad-9', 'tectora@gmail.com');
  assert.ok(uit.fout, 'hier hoort geen koppeling te ontstaan');
});

test('twee bedrijven op één domein → geen keuze maken', () => {
  const a = rij({ threadId: null });
  const b = rij({ threadId: null });
  b.bedrijf = 'Tectora Dakwerken';
  b.sleutel = outreach.sleutelVan(b.slug, b.bedrijf);
  const uit = na.rijBijThread([a, b], 'draad-9', 'info@tectora.be');
  assert.ok(uit.fout, 'bij twijfel niets klaarzetten');
  assert.match(uit.fout, /meerdere/);
});

// ── het verslag ─────────────────────────────────────────────────────────

test('het verslag telt bij één in enkelvoud', () => {
  const klaar = [{ slug: 'dakwerkers-gent', bedrijf: 'Tectora', nummer: '32475123456',
    mailOm: '2026-09-04 10:12', bericht: na.bouwBericht('Mathias'),
    url: 'https://wa.me/32475123456?text=x' }];
  const { onderwerp, tekst } = na.stelVerslagOp(klaar, [], []);
  assert.match(onderwerp, /één bericht/);
  assert.match(tekst, /Eén WhatsApp-bericht staat klaar/);
  assert.match(tekst, /0475 12 34 56/, 'het nummer hoort leesbaar in het verslag');
  assert.match(tekst, /https:\/\/wa\.me\/32475123456/);
});

test('het verslag telt bij twee in meervoud', () => {
  const k = (naam) => ({ slug: 'dakwerkers-gent', bedrijf: naam, nummer: '32475123456',
    mailOm: '2026-09-04 10:12', bericht: 'x', url: 'https://wa.me/32475123456' });
  const { onderwerp, tekst } = na.stelVerslagOp([k('A'), k('B')], [], []);
  assert.match(onderwerp, /2 berichten/);
  assert.match(tekst, /2 WhatsApp-berichten staan klaar/);
});

// ── de knoppenpagina ────────────────────────────────────────────────────

const KLAAR = [{
  slug: 'dakwerkers-sint-niklaas',
  bedrijf: 'D&G Dakwerken <BV>',            // & en punthaken: moeten ontsnapt worden
  nummer: '32475123456',
  mailOm: '2026-09-04 10:12',
  bericht: na.bouwBericht('Mathias'),
  url: 'https://wa.me/32475123456?text=x',
}];

test('de knop opent WhatsApp Desktop rechtstreeks', () => {
  const html = na.bouwPagina(KLAAR, '2026-09-04');
  assert.match(html, /href="whatsapp:\/\/send\?phone=32475123456&amp;text=/,
    'de knop hoort een whatsapp://-link te zijn, anders komt het tussenscherm terug');
  assert.match(html, /https:\/\/wa\.me\/32475123456/, 'de wa.me-link blijft erbij voor de telefoon');
});

test('een bedrijfsnaam met & of punthaken breekt de pagina niet', () => {
  const html = na.bouwPagina(KLAAR, '2026-09-04');
  assert.match(html, /D&amp;G Dakwerken &lt;BV&gt;/);
  assert.doesNotMatch(html, /<BV>/, 'onontsnapte punthaken zouden hier html worden');
});

test('de pagina telt bij één in enkelvoud', () => {
  assert.match(na.bouwPagina(KLAAR, '2026-09-04'), /Eén bericht staat klaar/);
  assert.match(na.bouwPagina([KLAAR[0], KLAAR[0]], '2026-09-04'), /2 berichten staan klaar/);
});
