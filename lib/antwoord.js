// =====================================================================
// lib/antwoord.js — is dit een écht antwoord of een machine?
//
// De deurbel moet één vraag beantwoorden waar hij niet naast mag zitten:
// heeft er een mens geschreven? Een afwezigheidsbericht of een
// ontvangstbevestiging is géén antwoord — daar mag geen seintje voor komen en
// er mag zeker geen draft op geschreven worden.
//
// TWEE REGELS DIE HIER BEWUST GELDEN
//
// 1. Beoordeel op de TEKST, nooit op de klok. Een mail die twee minuten na
//    de jouwe binnenkomt kan best een echt antwoord zijn (Tectora antwoordde
//    op 2 september binnen de vijf minuten), en een autoresponder kan uren
//    later komen. Wie op snelheid filtert, mist echte leads.
// 2. Bij twijfel: het IS een antwoord. Een gemist afwezigheidsbericht kost
//    één overbodig seintje; een gemist echt antwoord kostte op 3 september
//    vijf uur stilte op een bedrijf dat "dat zou super zijn" schreef.
//
// De voorbeelden in de patronen hieronder komen uit echte mails in de
// Keurwijzer-mailbox; staat er een nieuwe soort tussen, voeg hem hier toe en
// zet er een testgeval bij in scripts/deurbel.test.js.
// =====================================================================
'use strict';

// Onderwerpregels die een machine zet. Gmail en Outlook zetten deze woorden
// vóór het originele onderwerp, dus we kijken naar het begin van de regel.
const ONDERWERP_MACHINE = [
  /^\s*automatisch(e)?\s+(antwoord|reactie|beantwoording)/i,
  /^\s*auto(matic)?[-\s]?reply/i,
  /^\s*out\s+of\s+office/i,
  /^\s*afwezig(heid)?/i,
  /^\s*ontvangst(bevestiging)?\s+e-?mail/i,
  /^\s*bevestiging\s+van\s+ontvangst/i,
  /^\s*vakantie(bericht)?/i,
  /^\s*undeliverable|^\s*delivery\s+status\s+notification|^\s*mail\s+delivery/i,
];

// Zinnen die een afwezigheids- of ontvangstbericht verraden. Bewust
// letterlijke formuleringen uit echte mails, geen losse woorden: "ontvangen"
// alleen zou een echt antwoord ("ik heb je mail goed ontvangen, stuur maar
// door") ten onrechte wegfilteren.
const TEKST_MACHINE = [
  /het is ons automatisch antwoord/i,
  /dit is een automatisch (gegenereerd )?bericht/i,
  /automatische ontvangstbevestiging/i,
  /wij bevestigen hierbij de goede ontvangst/i,
  /bevestigen de goede ontvangst van uw/i,
  /uw (e-?mail|bericht) (is )?goed ontvangen\.?\s*(wij|we)\b/i,
  /ik ben (momenteel )?afwezig/i,
  /wij zijn (momenteel )?gesloten/i,
  /(met|tijdens) (jaarlijks )?verlof\b/i,
  /out of (the )?office/i,
  /je?\s*mail wordt niet doorgestuurd/i,
];

// Een bezorgfout is ook geen antwoord, maar wel iets anders: het adres werkt
// niet. Apart gemeld, want daar moet Olivier iets mee (adres verbeteren).
const TEKST_BEZORGFOUT = [
  /address not found/i,
  /couldn'?t be delivered/i,
  /kon niet worden bezorgd/i,
  /mailbox (is )?full/i,
  /recipient .*(rejected|unknown)/i,
];

// Geeft { soort, reden }. `soort` is 'mens', 'machine' of 'bezorgfout'.
function beoordeelBericht({ onderwerp = '', tekst = '' } = {}) {
  const o = String(onderwerp || '');
  const t = String(tekst || '');

  for (const p of TEKST_BEZORGFOUT) {
    if (p.test(t) || p.test(o)) return { soort: 'bezorgfout', reden: 'bezorgfout: ' + p.source };
  }
  for (const p of ONDERWERP_MACHINE) {
    if (p.test(o)) return { soort: 'machine', reden: 'onderwerp begint met een machineformule' };
  }
  for (const p of TEKST_MACHINE) {
    if (p.test(t)) return { soort: 'machine', reden: 'tekst bevat een machineformule' };
  }
  return { soort: 'mens', reden: 'geen machinekenmerk gevonden' };
}

// De afzender is Olivier zelf? Dan is het geen binnenkomend antwoord. Zowel
// Olivier@magicworx.net als olivier.muys@magicworx.net komen voor.
const VAN_OLIVIER = /(^|[<\s])(olivier|olivier\.muys)@magicworx\.net/i;
const isVanOlivier = (afzender) => VAN_OLIVIER.test(String(afzender || ''));

module.exports = { beoordeelBericht, isVanOlivier, ONDERWERP_MACHINE, TEKST_MACHINE, TEKST_BEZORGFOUT };
