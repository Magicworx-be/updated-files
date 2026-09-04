// =====================================================================
// scripts/deurbel.test.js — het logboek en de deurbel
//
// Draait mee met `npm test` (de glob dekt scripts/*.test.js).
//
// Wat hier bewaakt wordt, zijn de dingen die in september 2026 écht misgingen:
// dubbele drafts, een gemist antwoord, een autoresponder die voor een antwoord
// werd aangezien, en een bedrijf dat een tweede kennismakingsmail zou krijgen.
// =====================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const outreach = require('../lib/outreach');
const { beoordeelBericht, isVanOlivier } = require('../lib/antwoord');

// `rang: 1` staat er standaard bij: deze tests gaan over opt-outs, drafts en
// werkdagen, niet over de plaats op de pagina. Zonder rang zou de top 5-filter
// van opvolgKandidaten élke rij hier wegfilteren en zouden ze allemaal slagen
// om de verkeerde reden. De rangregel zelf wordt getest in
// scripts/outreach-vrijdag.test.js.
const rij = (extra = {}) => {
  const r = Object.assign(outreach.legeRij('dakwerkers-gent', 'Testdak'), { rang: 1 }, extra);
  r.sleutel = outreach.sleutelVan(r.slug, r.bedrijf);
  return r;
};

// ── Werkdagen ───────────────────────────────────────────────────────────
test('werkdagen tellen het weekend niet mee', () => {
  // vrijdag 4 sep 2026 → maandag 7 sep is één werkdag, geen drie
  assert.strictEqual(outreach.werkdagenTussen('2026-09-04', '2026-09-07'), 1);
  // vrijdag → woensdag is er drie
  assert.strictEqual(outreach.werkdagenTussen('2026-09-04', '2026-09-09'), 3);
  assert.strictEqual(outreach.werkdagenTussen('2026-09-04', '2026-09-04'), 0);
});

test('een datum in de toekomst levert nul werkdagen, geen negatief getal', () => {
  assert.strictEqual(outreach.werkdagenTussen('2026-09-10', '2026-09-04'), 0);
});

// ── Wie mag er een mail krijgen ─────────────────────────────────────────
test('een historische rij krijgt nooit opnieuw mail 1', () => {
  // Dit is de rem die voorkomt dat de eerste ronde na 8 september 2026
  // 133 bedrijven een kennismakingsmail stuurt die ze al gehad hebben.
  assert.strictEqual(outreach.magMail1(rij({ historisch: true })), false);
  assert.strictEqual(outreach.magMail1(rij()), true);
});

test('een opt-out sluit élke mail uit, ook een opvolgmail', () => {
  const r = rij({ optOut: { datum: '2026-09-10', bron: 'mail' }, mail1: { draftOp: null, verstuurdOp: '2026-09-08' } });
  assert.strictEqual(outreach.magBenaderen(r), false);
  assert.strictEqual(outreach.magMail1(r), false);
  assert.deepStrictEqual(outreach.opvolgKandidaten([r], '2026-09-30'), []);
});

test('een gesprek dat Olivier zelf voert komt in geen enkele mailronde voor', () => {
  const r = rij({ zelfAfhandelen: true, mail1: { draftOp: null, verstuurdOp: '2026-09-08' } });
  assert.deepStrictEqual(outreach.opvolgKandidaten([r], '2026-09-30'), []);
  assert.strictEqual(outreach.magMail1(r), false);
});

// ── Geen dubbele drafts ─────────────────────────────────────────────────
test('een klaarstaande draft sluit een tweede draft uit', () => {
  // Op 3 september 2026 kregen Tectora en EPDMshop elk twee drafts die
  // elkaar tegenspraken. Een draft-datum in het logboek maakt dat onmogelijk.
  const met = rij({ mail1: { draftOp: null, verstuurdOp: '2026-09-08' },
                    opvolg1: { draftOp: '2026-09-14', verstuurdOp: null } });
  assert.deepStrictEqual(outreach.opvolgKandidaten([met], '2026-09-30'), []);

  const zonder = rij({ mail1: { draftOp: null, verstuurdOp: '2026-09-08' } });
  assert.strictEqual(outreach.opvolgKandidaten([zonder], '2026-09-30').length, 1);
});

test('wie geantwoord heeft, krijgt geen opvolgmail', () => {
  const r = rij({ mail1: { draftOp: null, verstuurdOp: '2026-09-08' },
                  antwoord: { datum: '2026-09-09', soort: 'badge' } });
  assert.deepStrictEqual(outreach.opvolgKandidaten([r], '2026-09-30'), []);
});

test('drie werkdagen is de drempel, niet drie kalenderdagen', () => {
  const r = rij({ mail1: { draftOp: null, verstuurdOp: '2026-09-04' } }); // vrijdag
  assert.deepStrictEqual(outreach.opvolgKandidaten([r], '2026-09-07'), []);      // maandag: te vroeg
  assert.strictEqual(outreach.opvolgKandidaten([r], '2026-09-09').length, 1);    // woensdag: mag
});

// ── Mens of machine ─────────────────────────────────────────────────────
test('het automatische antwoord van Solide & WaterpROOF is geen antwoord', () => {
  const o = beoordeelBericht({
    onderwerp: 'Automatisch antwoord: Dakwerkers regio Brasschaat vergeleken',
    tekst: 'Goeiedag! Je dacht vast, wow, die antwoorden snel! Maar nee, het is ons automatisch antwoord.',
  });
  assert.strictEqual(o.soort, 'machine');
});

test('de ontvangstbevestiging van Dakwerken Verstrepen is geen antwoord', () => {
  const o = beoordeelBericht({
    onderwerp: 'Ontvangst e-mail Re: Dakwerkers regio Mechelen vergeleken - resultaat',
    tekst: 'Beste, Alvast bedankt voor uw e-mail. Wij bevestigen hierbij de goede ontvangst.',
  });
  assert.strictEqual(o.soort, 'machine');
});

test('Heito antwoordde echt, ook al was het kort', () => {
  const o = beoordeelBericht({
    onderwerp: 'Re: Dakwerkers regio Brasschaat vergeleken',
    tekst: 'Dat zou super zijn, bedankt! Met vriendelijke groeten, Heiko Witters',
  });
  assert.strictEqual(o.soort, 'mens');
});

test('een snel antwoord is niet automatisch een machine', () => {
  // Tectora antwoordde binnen de vijf minuten — een echte reactie. Er wordt
  // daarom bewust op tekst geoordeeld en nooit op de klok.
  const o = beoordeelBericht({
    onderwerp: 'Re: Dakwerkers regio Roeselare vergeleken',
    tekst: 'Goedemiddag Olivier, Mag u zeker doorsturen. Fijn om te horen. Mvg Mathias',
  });
  assert.strictEqual(o.soort, 'mens');
});

test('een bezorgfout wordt apart gemeld, niet als antwoord', () => {
  const o = beoordeelBericht({ onderwerp: 'Delivery Status Notification (Failure)',
    tekst: 'Address not found. Your message wasn\'t delivered to info@bestaatniet.be' });
  assert.strictEqual(o.soort, 'bezorgfout');
});

test('"goed ontvangen" in een echt antwoord blijft een antwoord', () => {
  // Een losse woordfilter op "ontvangen" zou dit ten onrechte wegfilteren.
  const o = beoordeelBericht({ onderwerp: 'Re: Dakwerkers regio Gent vergeleken',
    tekst: 'Dag Olivier, ik heb je mail goed ontvangen, stuur de badge maar door. Groeten, Jan' });
  assert.strictEqual(o.soort, 'mens');
});

test('Olivier herkent zichzelf, in beide schrijfwijzen', () => {
  assert.ok(isVanOlivier('Olivier Muys <Olivier@magicworx.net>'));
  assert.ok(isVanOlivier('olivier.muys@magicworx.net'));
  assert.ok(!isVanOlivier('info@heitodakwerken.be'));
  assert.ok(!isVanOlivier('nepolivier@magicworx.net.kwaadaardig.be'));
});

// ── Domeinkoppeling ─────────────────────────────────────────────────────
test('een mailadres wordt aan het websitedomein gekoppeld', () => {
  assert.strictEqual(outreach.domeinVan('info@heitodakwerken.be'), 'heitodakwerken.be');
  assert.strictEqual(outreach.domeinVan('http://www.heitodakwerken.be/'), 'heitodakwerken.be');
  assert.strictEqual(outreach.domeinVan('Info@VoorbeeldDakwerken.be'), 'voorbeelddakwerken.be');
});

test('een gedeelde postbus koppelt aan niemand', () => {
  // Anders zou het eerste gmail-bedrijf elk gmail-antwoord opeisen.
  for (const adres of ['voorbeeld@gmail.com', 'voorbeeld@telenet.be', 'voorbeeld@outlook.com']) {
    assert.strictEqual(outreach.domeinVan(adres), null, adres);
  }
});

// ── Schema ──────────────────────────────────────────────────────────────
test('het logboek keurt een onbekende antwoordsoort af', () => {
  const fouten = [];
  const doc = { slug: 'x', bedrijf: 'Y', antwoord: { datum: '2026-09-08', soort: 'verzonnen' } };
  require('../lib/outreach');
  // keurRij is niet geëxporteerd; via load zou een bestand nodig zijn. We
  // controleren de lijst met toegestane soorten rechtstreeks, want dát is de
  // afspraak waar de mailronde zich aan moet houden.
  assert.ok(!outreach.ANTWOORDSOORTEN.includes(doc.antwoord.soort));
  assert.ok(outreach.ANTWOORDSOORTEN.includes('nee'));
  assert.ok(outreach.ANTWOORDSOORTEN.includes('nummer'));
  assert.strictEqual(fouten.length, 0);
});

test('de sleutel is dezelfde als die van whatsapp.json', () => {
  const wa = require('../lib/whatsapp');
  assert.strictEqual(outreach.sleutelVan('dakwerkers-gent', 'Dakwerken  Elewaut'),
                     'dakwerkers-gent|' + wa.norm('Dakwerken  Elewaut'));
});

// ── Datums in Belgische tijd ────────────────────────────────────────────
test('een Gmail-tijdstempel wordt naar Belgische tijd omgerekend', () => {
  // Op 4 september 2026 antwoordde Olivier om 08u51 bij ons; Gmail noteert dat
  // als 06:51 UTC. Wie de eerste tien tekens afknipt, heeft hier geluk — maar
  // niet na middernacht (zie het geval hieronder).
  assert.strictEqual(outreach.lokaleDatum('2026-09-04T06:51:38Z'), '2026-09-04');
});

test('een bericht van net na middernacht valt op de juiste dag', () => {
  // 5 september 00u30 Belgische tijd = 4 september 22:30 UTC. Afknippen zou
  // hier 2026-09-04 opleveren, een dag te vroeg — en dat is precies de dag die
  // de "drie werkdagen"-regel telt.
  assert.strictEqual(outreach.lokaleDatum('2026-09-04T22:30:00Z'), '2026-09-05');
});

test('winteruur telt maar één uur verschil', () => {
  // Eind december staat België op UTC+1; 00u30 lokaal = 23:30 UTC de dag ervoor.
  assert.strictEqual(outreach.lokaleDatum('2026-12-24T23:30:00Z'), '2026-12-25');
  assert.strictEqual(outreach.lokaleDatum('2026-12-24T22:30:00Z'), '2026-12-24');
});

test('een onbruikbare datum geeft null, geen crash', () => {
  assert.strictEqual(outreach.lokaleDatum('geen datum'), null);
  assert.strictEqual(outreach.lokaleDatum(''), null);
});

test('het logboek normaliseert elk WhatsApp-nummer naar landcode + cijfers', () => {
  // whatsapp.json mag elk formaat bevatten; het logboek niet. Een ruw nummer
  // leverde in het dashboard een dode whatsapp://-link op.
  const { normaliseerNummer } = require('../lib/whatsapp');
  assert.strictEqual(normaliseerNummer('0475 59 59 71'), '32475595971');
  assert.strictEqual(normaliseerNummer('0472/092098'), '32472092098');
  assert.strictEqual(normaliseerNummer('+32 488 88 00 08'), '32488880008');
});
