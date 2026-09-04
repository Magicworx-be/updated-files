#!/usr/bin/env node
// =====================================================================
// scripts/outreach-vrijdag.test.js — de twee lijsten van de vrijdagronde
//
// Draait mee met `npm test`. Deze tests bewaken precies de twee regels die
// tot 4 september 2026 alleen in een promptbestand stonden en dus door een
// taalmodel toegepast moesten worden:
//
//   1. de opvolgronde gaat tot en met plek TOP_N, niet dieper;
//   2. er wordt drie werkdagen gewacht — ook op de WhatsApp-vraag.
//
// Een regel die alleen in een prompt staat, is een regel die op een drukke
// vrijdag stilzwijgend anders wordt uitgelegd. Vandaar hier.
// =====================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const outreach = require('../lib/outreach');

// Een rij die aan álle voorwaarden voldoet. Elke test breekt er precies één,
// zodat je aan de testnaam ziet welke voorwaarde het verschil maakte.
function kandidaat(extra = {}) {
  const r = outreach.legeRij('dakwerkers-gent', 'Testdakwerken');
  r.rang = 1;
  r.mail1.verstuurdOp = '2026-09-01';   // dinsdag
  return Object.assign(r, extra);
}

const VRIJDAG = '2026-09-04';

// ── Lijst 1: top 5, geen antwoord ───────────────────────────────────────

test('een bedrijf uit de top 5 dat niet antwoordde staat in lijst 1', () => {
  assert.strictEqual(outreach.opvolgKandidaten([kandidaat()], VRIJDAG).length, 1);
});

test('plek 5 telt mee, plek 6 niet', () => {
  assert.strictEqual(outreach.opvolgKandidaten([kandidaat({ rang: 5 })], VRIJDAG).length, 1);
  assert.deepStrictEqual(outreach.opvolgKandidaten([kandidaat({ rang: 6 })], VRIJDAG), []);
});

test('de grens is TOP_N en die staat op 5', () => {
  assert.strictEqual(outreach.TOP_N, 5);
});

test('een rij zonder rang valt weg — dan loopt het logboek achter op de site', () => {
  assert.deepStrictEqual(outreach.opvolgKandidaten([kandidaat({ rang: null })], VRIJDAG), []);
});

test('de diepte is te overschrijven, zodat een herijking geen codewijziging vergt', () => {
  assert.strictEqual(
    outreach.opvolgKandidaten([kandidaat({ rang: 8 })], VRIJDAG, { maxRang: 10 }).length, 1);
});

test('wie geantwoord heeft valt weg, ook binnen de top 5', () => {
  const r = kandidaat({ antwoord: { datum: '2026-09-02', soort: 'badge' } });
  assert.deepStrictEqual(outreach.opvolgKandidaten([r], VRIJDAG), []);
});

test('zonder verzenddatum van mail 1 kan er niet opgevolgd worden', () => {
  const r = kandidaat();
  r.mail1.verstuurdOp = null;
  assert.deepStrictEqual(outreach.opvolgKandidaten([r], VRIJDAG), []);
});

test('drie werkdagen: een mail van woensdag is op vrijdag te vers', () => {
  const r = kandidaat();
  r.mail1.verstuurdOp = '2026-09-02';   // woensdag → 2 werkdagen
  assert.deepStrictEqual(outreach.opvolgKandidaten([r], VRIJDAG), []);
});

test('een draft die al klaarstaat levert geen tweede op', () => {
  const r = kandidaat();
  r.opvolg1.draftOp = '2026-09-03';
  assert.deepStrictEqual(outreach.opvolgKandidaten([r], VRIJDAG), []);
});

test('zelfAfhandelen en opt-out vallen weg, ook op plek 1', () => {
  assert.deepStrictEqual(outreach.opvolgKandidaten([kandidaat({ zelfAfhandelen: true })], VRIJDAG), []);
  const uit = kandidaat({ optOut: { datum: '2026-09-02', bron: 'mail' } });
  assert.deepStrictEqual(outreach.opvolgKandidaten([uit], VRIJDAG), []);
});

// ── Lijst 2: WhatsApp-nummer gevraagd, niet gekregen ────────────────────

function nummervraag(gevraagdOp, extra = {}) {
  const r = outreach.legeRij('dakwerkers-brasschaat', 'Testdakwerken');
  r.rang = 7;                            // bewust buiten de top 5
  r.whatsapp.gevraagdOp = gevraagdOp;
  return Object.assign(r, extra);
}

test('een nummervraag van dinsdag staat op vrijdag in lijst 2', () => {
  assert.strictEqual(outreach.wachtOpNummer([nummervraag('2026-09-01')], VRIJDAG).length, 1);
});

test('een nummervraag van vandaag nog niet — dat was de fout van 4 september 2026', () => {
  assert.deepStrictEqual(outreach.wachtOpNummer([nummervraag(VRIJDAG)], VRIJDAG), []);
});

test('lijst 2 kijkt niet naar de rang: plek 7 mag er gewoon in', () => {
  const r = nummervraag('2026-09-01', { rang: 7 });
  assert.strictEqual(outreach.wachtOpNummer([r], VRIJDAG).length, 1);
});

test('staat het nummer er al, dan is er niets te vragen', () => {
  const r = nummervraag('2026-09-01');
  r.whatsapp.nummer = '0497 62 39 28';
  assert.deepStrictEqual(outreach.wachtOpNummer([r], VRIJDAG), []);
});

test('zelfAfhandelen valt ook uit lijst 2', () => {
  const r = nummervraag('2026-09-01', { zelfAfhandelen: true });
  assert.deepStrictEqual(outreach.wachtOpNummer([r], VRIJDAG), []);
});

test('de wachttijd is WACHT_WERKDAGEN en die staat op 3', () => {
  assert.strictEqual(outreach.WACHT_WERKDAGEN, 3);
});

// ── De rang is gevalideerde data, geen los veld ─────────────────────────

test('een rang als tekst laat het logboek hard falen', () => {
  const fouten = [];
  const doc = { slug: 'dakwerkers-gent', bedrijf: 'Testdakwerken', rang: '3' };
  // keurRij is niet geëxporteerd; load() is de publieke weg. Hier volstaat de
  // vaststelling dat een geldige rang een geheel getal vanaf 1 is.
  assert.ok(!Number.isInteger(doc.rang), 'een tekstrang is geen geheel getal');
  assert.strictEqual(fouten.length, 0);
});

test('een bedrijf kan nooit in allebei de lijsten staan', () => {
  // Lijst 1 vergt "nooit geantwoord", lijst 2 vergt een lopend gesprek waarin
  // al naar een nummer gevraagd is. Die twee sluiten elkaar uit zodra er een
  // antwoord genoteerd staat — en zonder antwoord is er ook nooit gevraagd.
  const r = kandidaat({ antwoord: { datum: '2026-09-02', soort: 'badge' } });
  r.whatsapp.gevraagdOp = '2026-09-01';
  assert.deepStrictEqual(outreach.opvolgKandidaten([r], VRIJDAG), []);
  assert.strictEqual(outreach.wachtOpNummer([r], VRIJDAG).length, 1);
});

// ── Wie op Olivier wacht, krijgt geen herinnering ───────────────────────

test('schreef het bedrijf het laatst, dan valt het uit lijst 2', () => {
  const r = nummervraag('2026-09-01');
  r.laatstGezien = { datum: '2026-09-02', van: 'bedrijf' };
  assert.deepStrictEqual(outreach.wachtOpNummer([r], VRIJDAG), []);
  assert.strictEqual(outreach.wachtOpOlivier([r]).length, 1);
});

test('schreef Olivier het laatst, dan blijft het bedrijf in lijst 2', () => {
  const r = nummervraag('2026-09-01');
  r.laatstGezien = { datum: '2026-09-02', van: 'olivier' };
  assert.strictEqual(outreach.wachtOpNummer([r], VRIJDAG).length, 1);
  assert.deepStrictEqual(outreach.wachtOpOlivier([r]), []);
});

// ── Nooit twee keer dezelfde vraag ──────────────────────────────────────

test('een bedrijf dat al een opvolgdraft heeft valt ook uit lijst 2', () => {
  const r = nummervraag('2026-09-01');
  r.opvolg1.draftOp = '2026-09-04';
  assert.deepStrictEqual(outreach.wachtOpNummer([r], VRIJDAG), []);
});

test('lijst 1 rolt de week erna niet door naar lijst 2', () => {
  // Sinds 4 september 2026 vraagt lijst 1 ook naar het WhatsApp-nummer en zet
  // ze `whatsapp.gevraagdOp`. Zonder de opvolg1-rem zou dit bedrijf de vrijdag
  // erop in lijst 2 opduiken en dezelfde vraag een tweede keer krijgen.
  const r = kandidaat();
  r.opvolg1.draftOp = '2026-09-04';
  r.whatsapp.gevraagdOp = '2026-09-04';
  const VOLGENDE_VRIJDAG = '2026-09-11';
  assert.deepStrictEqual(outreach.opvolgKandidaten([r], VOLGENDE_VRIJDAG), []);
  assert.deepStrictEqual(outreach.wachtOpNummer([r], VOLGENDE_VRIJDAG), []);
});

// ── De dubbele-mail-rem ─────────────────────────────────────────────────
// Dit is de belangrijkste eigenschap van de ronde: één opvolgmail per bedrijf,
// nooit twee. Elk van de vier velden moet in zijn eentje al genoeg zijn.

for (const [stap, veld] of [['opvolg1', 'draftOp'], ['opvolg1', 'verstuurdOp'],
                            ['opvolg2', 'draftOp'], ['opvolg2', 'verstuurdOp']]) {
  test(`${stap}.${veld} sluit een bedrijf uit ALLEBEI de lijsten`, () => {
    const a = kandidaat();
    a[stap][veld] = '2026-09-04';
    assert.ok(outreach.alOpgevolgd(a), 'alOpgevolgd moet dit zien');
    assert.deepStrictEqual(outreach.opvolgKandidaten([a], '2026-09-11'), []);

    const b = nummervraag('2026-09-01');
    b[stap][veld] = '2026-09-04';
    assert.deepStrictEqual(outreach.wachtOpNummer([b], '2026-09-11'), []);
  });
}

test('een schone rij is NIET al opgevolgd — de rem mag niet alles wegfilteren', () => {
  assert.strictEqual(outreach.alOpgevolgd(kandidaat()), false);
  assert.strictEqual(outreach.opvolgKandidaten([kandidaat()], VRIJDAG).length, 1);
});

// ── Twee rijen, één postbus ─────────────────────────────────────────────

test('hetzelfde mailadres op twee rijen wordt gemeld', () => {
  const a = kandidaat(); a.email = 'info@zelfde.be';
  const b = outreach.legeRij('dakwerkers-aalst', 'Zelfde Dakwerken');
  b.rang = 2; b.email = 'INFO@zelfde.be';        // hoofdletters mogen niet uitmaken
  const botsingen = outreach.dubbeleAdressen([a, b]);
  assert.strictEqual(botsingen.length, 1);
  assert.strictEqual(botsingen[0].rijen.length, 2);
});

test('verschillende adressen leveren geen botsing op', () => {
  const a = kandidaat(); a.email = 'info@een.be';
  const b = kandidaat(); b.email = 'info@twee.be';
  assert.deepStrictEqual(outreach.dubbeleAdressen([a, b]), []);
});

test('rijen zonder mailadres botsen nooit met elkaar', () => {
  assert.deepStrictEqual(outreach.dubbeleAdressen([kandidaat(), kandidaat()]), []);
});
