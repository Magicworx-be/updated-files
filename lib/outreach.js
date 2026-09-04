// =====================================================================
// lib/outreach.js — het outreach-logboek
//
// WAAROM DIT BESTAAT
//
// Tot 4 september 2026 was er geen enkele plek waar stond wat er met een
// bedrijf gebeurd was. Drie LLM-rondes (de dagelijkse mailronde, de
// opvolgronde en de deurbel) leidden élke keer opnieuw uit Gmail af "wat is
// er te doen", door tientallen threads open te lezen. Dat kostte honderden
// tool-calls, het faalde stil (op 3 september stierf een deurbel-run op een
// API-fout en bleef een antwoord vijf uur onopgemerkt), en het leverde
// tegenstrijdige uitkomsten op: Tectora en EPDMshop kregen elk twee drafts
// die elkaar tegenspraken.
//
// Dit bestand maakt daar één bron van. `data/outreach.json` zegt per bedrijf
// wat er gebeurd is; Gmail blijft de waarheid over de mails zelf, maar het
// logboek is de waarheid over WAT ER AL GEDAAN IS. Wie een draft wil maken,
// kijkt hier eerst.
//
// HET LOGBOEK STAAT BEWUST NIET IN GIT
//
// Er staan mailadressen van bedrijven in. De repo's Magicworx-be/updated-files
// en keurwijzer-data zijn publiek leesbaar (gecontroleerd op 4 september 2026),
// dus `data/outreach.json` staat in .gitignore. Zet het er niet uit zonder dat
// die repo's eerst op privé staan.
//
// HISTORISCHE RIJEN
//
// De mails van vóór 8 september 2026 zijn met de hand geschreven, met drie
// verschillende onderwerpregels en met logica die onderweg veranderde. Die
// geschiedenis is niet betrouwbaar te categoriseren, en dat proberen zou
// schijnzekerheid opleveren. Zulke rijen dragen daarom `historisch: true` en
// een antwoordsoort "onbekend": we weten dát er gemaild is en dát er al dan
// niet geantwoord werd, meer niet. Ze bestaan om één reden — voorkomen dat een
// bedrijf dat al gemaild is, of dat "nee" zei, opnieuw benaderd wordt.
//
// VORM VAN data/outreach.json
//
//   { "bijgewerkt": "2026-09-04",
//     "bedrijven": [
//       { "slug": "dakwerkers-gent",
//         "bedrijf": "Dakwerken Maenhaut",     // exact zoals op de pagina
//         "rang": 1,                           // plaats in selectie.json
//         "email": "info@dakwerkenmaenhaut.be",
//         "threadId": "1a047...",              // null = nog nooit gemaild
//         "historisch": true,
//         "mail1":    { "draftOp": null, "verstuurdOp": "2026-07-23" },
//         "opvolg1":  { "draftOp": null, "verstuurdOp": null },
//         "opvolg2":  { "draftOp": null, "verstuurdOp": null },
//         "antwoord": { "datum": "2026-08-17", "soort": "onbekend" },
//         "whatsapp": { "gevraagdOp": null, "nummer": null, "liveSinds": null },
//         "badge":    { "gevraagdOp": null, "geplaatstOp": null },
//         "nabericht": { "klaargezetOp": null, "nummer": null, "overgeslagen": false },
//         "optOut":   null,                    // of { "datum": …, "bron": … }
//         "zelfAfhandelen": false,
//         "laatstGezien": { "datum": "2026-08-17", "van": "olivier" } } ] }
//
// De sleutel is slug + genormaliseerde bedrijfsnaam — exact dezelfde sleutel
// als data/whatsapp.json en beoordeling.json gebruiken. Staat een bedrijf in
// twee regio's, dan zijn dat twee rijen; dat is bewust expliciet.
//
// ÉÉN BEDRIJF KAN MEER DAN ÉÉN THREAD HEBBEN. Tectora antwoordde vanaf
// info@tectora.be én vanaf Mathias@tectora.be, wat twee aparte Gmail-threads
// oplevert. `threadId` is de thread waarin mail 1 vertrok; `nevenThreads` houdt
// de rest bij, zodat een antwoord in zo'n zijthread niet als een nieuw bedrijf
// wordt gelezen.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

// Zelfde normalisatie als lib/whatsapp.js — de sleutels moeten gelijk lopen.
function norm(naam) { return String(naam).toLowerCase().replace(/\s+/g, ' ').trim(); }
function sleutelVan(slug, bedrijf) { return slug + '|' + norm(bedrijf); }

// De soorten antwoord die het logboek kent. "onbekend" is alleen toegestaan op
// een historische rij: voor alles vanaf 8 september 2026 moet de mailronde een
// echte soort invullen, anders weten we het volgende week weer niet.
const ANTWOORDSOORTEN = [
  'badge',          // wil de kwaliteitsbadge
  'gratis',         // vraagt of het echt gratis is / wat de bedoeling is
  'nummer',         // geeft een WhatsApp-nummer door
  'lead',           // vraagt naar samenwerking, tarieven, meer klanten
  'nee',            // wil niet meedoen of niet meer gemaild worden
  'autoresponder',  // afwezigheidsbericht — telt niet als antwoord
  'anders',
  'onbekend',       // enkel op historische rijen
];

const STAPPEN = ['mail1', 'opvolg1', 'opvolg2'];
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

// Hoe diep in de gepubliceerde lijst de opvolgronde gaat. Plek 1 t.e.m. 5.
//
// De rang is GEEN oordeel van een mailronde: hij is de plaats van het bedrijf
// in data/<slug>/selectie.json, dus exact wat er op de pagina staat, en hij
// komt via scripts/outreach-seed.js in het logboek terecht. Zo hoeft geen
// enkele ronde nog de rangzin uit een oude mail te lezen om te weten of een
// bedrijf in aanmerking komt — dat was tot 4 september 2026 wél zo, en het
// betekende dat een mail met een afwijkende formulering stilzwijgend afviel.
//
// Waarom 5 en niet 3: Olivier heeft dat op 4 september 2026 zo bepaald. De
// meting van 2 september (top 3 antwoordt op 21% van de eerste mail, plek 4
// t.e.m. 10 op 11%) blijft gelden — plek 4 en 5 antwoorden dus minder vaak,
// dat is een bewuste keuze en geen vergetelheid.
const TOP_N = 5;

// De wachttijd vóór een opvolgmail, in werkdagen. Geldt voor allebei de
// vrijdaglijsten: wie nooit antwoordde én wie zijn WhatsApp-nummer nog niet
// gaf. Drie werkdagen, zodat een mail van vrijdag pas woensdag opgevolgd wordt.
const WACHT_WERKDAGEN = 3;

// De wachttijd tussen Oliviers bevestigingsmail ("Ik heb je WhatsApp-nummer
// toegevoegd") en het WhatsApp-bericht dat erop volgt, in minuten.
//
// Een uur. Twee berichten die tegelijk binnenkomen lezen als één verzending —
// dan is de tweede overbodig. Een uur later leest als iemand die er nog eens
// aan dacht, en dat is ook wat het is: het bedrijf heeft de mail dan gelezen en
// weet waar het bericht over gaat.
//
// Het is een ONDERGRENS, geen afspraak. Het bericht wordt klaargezet zodra het
// uur om is; wanneer Olivier het effectief verstuurt bepaalt hij zelf.
const NABERICHT_WACHT_MINUTEN = 60;

const LEGE_STAP = () => ({ draftOp: null, verstuurdOp: null });

// Een volledige, lege rij. Elke plek die een bedrijf toevoegt gebruikt deze
// functie, zodat er nooit een rij ontstaat waarin een veld ontbreekt — code die
// `rij.whatsapp.nummer` leest mag niet hoeven controleren of `whatsapp` bestaat.
function legeRij(slug, bedrijf) {
  return {
    slug, bedrijf,
    rang: null,          // plaats in data/<slug>/selectie.json — 1 = bovenaan
    email: null,
    domein: null,        // het domein van hun eigen website, uit reviews.json
    threadId: null,
    nevenThreads: [],
    historisch: false,
    mail1: LEGE_STAP(),
    opvolg1: LEGE_STAP(),
    opvolg2: LEGE_STAP(),
    antwoord: null,
    whatsapp: { gevraagdOp: null, nummer: null, liveSinds: null },
    badge: { gevraagdOp: null, geplaatstOp: null },
    nabericht: { klaargezetOp: null, nummer: null, overgeslagen: false },
    optOut: null,
    zelfAfhandelen: false,
    laatstGezien: null,
  };
}

// Het kale domein uit een website-URL of een mailadres, zonder "www." en
// zonder hoofdletters. Hiermee koppelt de deurbel een binnenkomend antwoord
// aan een bedrijf, ook als er nog nooit een mailadres genoteerd is:
// info@heitodakwerken.be hoort bij www.heitodakwerken.be.
//
// Gedeelde postbussen (gmail, telenet, outlook, ...) zeggen niets over wélk
// bedrijf het is — daar geeft deze functie bewust null op, anders zou het
// eerste gmail-bedrijf alle gmail-antwoorden opeisen.
const GEDEELD = new Set([
  'gmail.com', 'googlemail.com', 'telenet.be', 'skynet.be', 'outlook.com',
  'outlook.be', 'hotmail.com', 'hotmail.be', 'live.be', 'live.com',
  'yahoo.com', 'proximus.be', 'scarlet.be', 'icloud.com', 'me.com',
]);

function domeinVan(waarde) {
  if (!waarde) return null;
  let s = String(waarde).trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at >= 0) s = s.slice(at + 1);
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split(/[/:?#<>,;\s]/)[0];
  if (!s || !s.includes('.')) return null;
  if (GEDEELD.has(s)) return null;
  return s;
}

// Datums: altijd Belgische tijd, nooit UTC.
//
// Gmail geeft tijdstempels in UTC ("2026-09-04T06:51:38Z"). In september is dat
// twee uur vroeger dan bij ons: dat bericht kwam hier om 08u51 binnen. Wie de
// eerste tien tekens afknipt, krijgt meestal de juiste dag — maar niet voor
// berichten tussen middernacht en 2 uur 's nachts: die belanden een dag te vroeg.
// Dat is precies de dag die de "drie werkdagen"-regel telt, dus dat moet kloppen.
const BRUSSEL = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
});

function lokaleDatum(waarde) {
  const d = waarde == null ? new Date() : new Date(waarde);
  if (isNaN(d.getTime())) return null;
  return BRUSSEL.format(d);
}

const vandaagISO = () => lokaleDatum();

// Datum én uur in Belgische tijd, om aan een mens te tonen: "2026-09-04 08:51".
// Gmail toont het uur in zijn tijdzone, dus een melding die 06:51 zegt terwijl er
// 08:51 in de mailbox staat, laat iemand naar de verkeerde mail zoeken.
const BRUSSEL_TIJD = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

function lokaleTijd(waarde) {
  const d = waarde == null ? new Date() : new Date(waarde);
  if (isNaN(d.getTime())) return null;
  return BRUSSEL_TIJD.format(d).replace(' ', ' ');
}

function isDatumOfNull(w) { return w === null || (typeof w === 'string' && DATUM.test(w)); }

// Streng valideren, in de geest van opdracht 01: een kapot logboek moet hard
// falen, niet stilzwijgend een lege lijst opleveren. Anders denkt de opvolgronde
// dat er niets te doen is, of erger, dat niemand ooit gemaild is.
function keurRij(r, waar, fouten) {
  if (!r || typeof r !== 'object') { fouten.push(waar + ': geen object'); return null; }
  if (!r.slug || !r.bedrijf) { fouten.push(waar + ': "slug" en "bedrijf" zijn allebei verplicht'); return null; }

  const rij = Object.assign(legeRij(r.slug, r.bedrijf), r);
  rij.nevenThreads = Array.isArray(r.nevenThreads) ? r.nevenThreads.slice() : [];
  rij.historisch = r.historisch === true;
  rij.zelfAfhandelen = r.zelfAfhandelen === true;

  // De rang is afgeleid van selectie.json en wordt bij elke seed opnieuw
  // overschreven. Een kapotte waarde moet hier stuk lopen: een rang die als
  // tekst ("3") of als 0 binnenkomt zou de top 5-filter stilzwijgend
  // veranderen, en dan mailt de vrijdagronde de verkeerde bedrijven.
  if (rij.rang !== null && !(Number.isInteger(rij.rang) && rij.rang >= 1)) {
    fouten.push(waar + ': rang moet een geheel getal vanaf 1 zijn, of null');
  }

  for (const stap of STAPPEN) {
    const s = Object.assign(LEGE_STAP(), r[stap] || {});
    if (!isDatumOfNull(s.draftOp)) fouten.push(waar + ': ' + stap + '.draftOp is geen datum (JJJJ-MM-DD)');
    if (!isDatumOfNull(s.verstuurdOp)) fouten.push(waar + ': ' + stap + '.verstuurdOp is geen datum (JJJJ-MM-DD)');
    rij[stap] = s;
  }

  if (rij.antwoord !== null) {
    const a = rij.antwoord;
    if (!isDatumOfNull(a.datum) || a.datum === null) fouten.push(waar + ': antwoord.datum is geen datum');
    if (!ANTWOORDSOORTEN.includes(a.soort)) {
      fouten.push(waar + ': antwoord.soort "' + a.soort + '" kent het logboek niet (' + ANTWOORDSOORTEN.join(', ') + ')');
    }
    if (a.soort === 'onbekend' && !rij.historisch) {
      fouten.push(waar + ': antwoord.soort "onbekend" mag alleen op een historische rij');
    }
  }

  const w = Object.assign({ gevraagdOp: null, nummer: null, liveSinds: null }, rij.whatsapp || {});
  if (!isDatumOfNull(w.gevraagdOp)) fouten.push(waar + ': whatsapp.gevraagdOp is geen datum');
  if (!isDatumOfNull(w.liveSinds)) fouten.push(waar + ': whatsapp.liveSinds is geen datum');
  if (w.liveSinds && !w.nummer) fouten.push(waar + ': whatsapp.liveSinds ingevuld zonder nummer');
  rij.whatsapp = w;

  const b = Object.assign({ gevraagdOp: null, geplaatstOp: null }, rij.badge || {});
  if (!isDatumOfNull(b.gevraagdOp)) fouten.push(waar + ': badge.gevraagdOp is geen datum');
  if (!isDatumOfNull(b.geplaatstOp)) fouten.push(waar + ': badge.geplaatstOp is geen datum');
  if (b.geplaatstOp && !b.gevraagdOp) fouten.push(waar + ': badge.geplaatstOp ingevuld zonder gevraagdOp');
  rij.badge = b;

  const nb = Object.assign({ klaargezetOp: null, nummer: null, overgeslagen: false }, rij.nabericht || {});
  if (!isDatumOfNull(nb.klaargezetOp)) fouten.push(waar + ': nabericht.klaargezetOp is geen datum');
  if (nb.nummer !== null && !/^d{10,15}$/.test(String(nb.nummer))) {
    fouten.push(waar + ': nabericht.nummer moet enkel cijfers zijn, met landcode (het wa.me-formaat)');
  }
  if (nb.nummer && !nb.klaargezetOp) fouten.push(waar + ': nabericht.nummer ingevuld zonder klaargezetOp');
  nb.overgeslagen = nb.overgeslagen === true;
  if (nb.overgeslagen && !nb.klaargezetOp) fouten.push(waar + ': nabericht.overgeslagen zonder klaargezetOp');
  rij.nabericht = nb;

  if (rij.optOut !== null) {
    if (!isDatumOfNull(rij.optOut.datum) || rij.optOut.datum === null) {
      fouten.push(waar + ': optOut.datum is geen datum');
    }
  }

  if (rij.laatstGezien !== null) {
    const l = rij.laatstGezien;
    if (!isDatumOfNull(l.datum) || l.datum === null) fouten.push(waar + ': laatstGezien.datum is geen datum');
    if (l.van !== 'bedrijf' && l.van !== 'olivier') {
      fouten.push(waar + ': laatstGezien.van moet "bedrijf" of "olivier" zijn');
    }
  }

  rij.sleutel = sleutelVan(rij.slug, rij.bedrijf);
  return rij;
}

const pad = (root) => path.join(root, 'data', 'outreach.json');

// Leest het logboek. Bestaat het niet, dan is dat géén fout: dat is de toestand
// vóór de eerste seed. De aanroeper ziet dat aan `bestaat: false`.
function load(root) {
  const p = pad(root);
  if (!fs.existsSync(p)) return { bestaat: false, bijgewerkt: null, rijen: [], fouten: [] };

  let doc;
  try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { bestaat: true, bijgewerkt: null, rijen: [], fouten: ['data/outreach.json bevat ongeldige JSON — ' + e.message] }; }

  const lijst = Array.isArray(doc) ? doc : (doc.bedrijven || []);
  if (!Array.isArray(lijst)) {
    return { bestaat: true, bijgewerkt: null, rijen: [], fouten: ['data/outreach.json: verwacht een lijst onder "bedrijven"'] };
  }

  const fouten = [];
  const rijen = [];
  const gezien = new Set();
  lijst.forEach((r, i) => {
    const waar = 'data/outreach.json, regel ' + (i + 1) + (r && r.bedrijf ? ' ("' + r.bedrijf + '")' : '');
    const rij = keurRij(r, waar, fouten);
    if (!rij) return;
    if (gezien.has(rij.sleutel)) { fouten.push(waar + ': staat twee keer in de lijst voor dezelfde regio'); return; }
    gezien.add(rij.sleutel);
    rijen.push(rij);
  });

  return { bestaat: true, bijgewerkt: doc.bijgewerkt || null, rijen, fouten };
}

// Schrijven gebeurt via een tijdelijk bestand: valt de stroom uit halverwege,
// dan blijft het oude logboek staan in plaats van een half bestand.
function schrijf(root, rijen, vandaag) {
  const p = pad(root);
  const uit = {
    _uitleg: 'Outreach-logboek: wat er per bedrijf gemaild, geantwoord en opgevolgd is. ' +
      'Bindende bron voor de mailronde, de opvolgronde en de deurbel. Staat bewust NIET in git ' +
      '(bevat mailadressen; de repo\'s zijn publiek). Zie lib/outreach.js.',
    bijgewerkt: vandaag,
    bedrijven: rijen.map(schoonRij),
  };
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(uit, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
  return p;
}

// `sleutel` is afgeleid en hoort niet in het bestand — anders raakt hij uit de
// pas zodra iemand een bedrijfsnaam corrigeert.
function schoonRij(r) {
  const { sleutel, ...rest } = r;
  return rest;
}

const index = (rijen) => new Map(rijen.map(r => [r.sleutel, r]));

// ── Afgeleide vragen ────────────────────────────────────────────────────
// Deze staan hier en niet in de scripts, zodat de deurbel, de skills en het
// dashboard gegarandeerd hetzelfde antwoord geven op dezelfde vraag.

// Werkdagen tussen twee datums (zaterdag en zondag tellen niet mee). De
// opvolgregel is "na drie werkdagen"; met kalenderdagen zou een mail van
// vrijdag al op maandag opgevolgd worden.
function werkdagenTussen(vanISO, totISO) {
  const van = new Date(vanISO + 'T00:00:00Z');
  const tot = new Date(totISO + 'T00:00:00Z');
  if (isNaN(van) || isNaN(tot) || tot <= van) return 0;
  let n = 0;
  const d = new Date(van);
  while (d < tot) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dag = d.getUTCDay();
    if (dag !== 0 && dag !== 6) n++;
  }
  return n;
}

// Mag deze rij überhaupt nog een mail krijgen? Eén plek, zodat een opt-out
// nooit ergens vergeten wordt.
function magBenaderen(r) {
  return !r.optOut && !r.zelfAfhandelen;
}

// Mag deze rij mail 1 (de eerste kennismaking) krijgen?
//
// `historisch` is hier het beslissende veld. Die rijen zijn vóór 8 september
// 2026 benaderd, in de weken waarin de mails met de hand geschreven werden en
// de onderwerpregel drie keer veranderde. Het logboek weet niet wanneer of wat
// er precies gestuurd is — dat staat alleen in Gmail — maar wel dát het gebeurd
// is. Zonder deze rem zou de eerste mailronde van volgende week 133 bedrijven
// een "kennismakingsmail" sturen die ze allemaal al gehad hebben.
function magMail1(r) {
  return magBenaderen(r) && !r.historisch && !r.mail1.verstuurdOp && !r.mail1.draftOp;
}

// DE DUBBELE-MAIL-REM. Eén functie, gebruikt door allebei de vrijdaglijsten.
//
// Dit is de belangrijkste regel van de hele ronde: een bedrijf dat al een
// opvolgmail kreeg — verstuurd óf als draft klaargezet — krijgt er nooit een
// tweede. Twee mails met dezelfde vraag binnen een week kosten Keurwijzer
// geloofwaardigheid bij precies de bedrijven die het meest opleveren.
//
// De rem kijkt naar allebei de opvolgstappen, niet alleen naar de eerste. De
// wekelijkse ronde maakt zelf nooit een opvolg2 (die komt met de hand, uit
// fase 7 van prompts/directory-page-emails-prompt.md), maar een rij die er wél
// een draagt moet hier evengoed uitvallen.
//
// `draftOp` telt even zwaar als `verstuurdOp`. Een draft die klaarstaat is
// werk dat Olivier nog moet versturen; er een tweede naast zetten levert twee
// tegenstrijdige mails op. Dat gebeurde op 3 september 2026 met Tectora en
// EPDMshop. Keerzijde: gooit Olivier een draft weg zonder te versturen, dan
// blijft het bedrijf uitgesloten tot iemand de datum uit het logboek haalt.
// Dat is de veilige kant van de fout.
function alOpgevolgd(r) {
  return Boolean(r.opvolg1.verstuurdOp || r.opvolg1.draftOp ||
                 r.opvolg2.verstuurdOp || r.opvolg2.draftOp);
}

// LIJST 1 van de vrijdagronde — wie nooit antwoordde op de eerste mail.
//
// Gemaild, minstens `werkdagen` werkdagen geleden, nooit geantwoord, nog geen
// opvolgmail en geen draft klaar, en binnen de top `maxRang` van zijn regio.
//
// Een rij zónder rang valt weg. Dat is bewust streng: elke gepubliceerde rij
// hoort een rang te krijgen van scripts/outreach-seed.js, dus `rang: null`
// betekent dat het logboek achterloopt op de site. Dan liever niemand mailen
// dan iemand die misschien op plek 30 staat.
function opvolgKandidaten(rijen, vandaag, opties = {}) {
  const werkdagen = opties.werkdagen ?? WACHT_WERKDAGEN;
  const maxRang = opties.maxRang ?? TOP_N;
  return rijen.filter(r =>
    magBenaderen(r) &&
    r.rang !== null && r.rang <= maxRang &&
    r.mail1.verstuurdOp &&
    !r.antwoord &&
    !alOpgevolgd(r) &&
    werkdagenTussen(r.mail1.verstuurdOp, vandaag) >= werkdagen);
}

// LIJST 2 van de vrijdagronde — wie zijn WhatsApp-nummer niet gaf of bevestigde.
//
// Er is naar een nummer gevraagd, er staat er nog geen, en die vraag is
// minstens `werkdagen` werkdagen oud. Die wachttijd stond tot 4 september 2026
// alleen in de prompt en niet hier; daardoor bood het logboek Heito Dakwerken
// aan op de dag zelf dat de vraag vertrok. De regel hoort in de code, want
// alleen dan geven het dashboard, de lijst en de ronde hetzelfde antwoord.
//
// Geen rangfilter: dit zijn bedrijven die al geantwoord hebben en hun badge
// kregen. Waar ze staan doet dan niet meer ter zake — het gesprek loopt al.
//
// Schreef het bedrijf het laatst, dan valt het weg: dan wacht het op Olivier
// en niet omgekeerd. Zo'n thread is werk voor de dagelijkse mailronde, niet
// voor een herinnering in het weekend. Ook die regel stond tot 4 september
// 2026 alleen in de prompt.
// Eén herinnering per bedrijf, nooit twee. `opvolg1` telt daarom ook hier mee,
// en niet alleen in lijst 1. Sinds 4 september 2026 vraagt lijst 1 óók naar het
// WhatsApp-nummer en zet ze `whatsapp.gevraagdOp`; zonder deze rem zou zo'n
// bedrijf de week daarop vanzelf in lijst 2 opduiken en een tweede keer
// dezelfde vraag krijgen.
function wachtOpNummer(rijen, vandaag = vandaagISO(), opties = {}) {
  const werkdagen = opties.werkdagen ?? WACHT_WERKDAGEN;
  return rijen.filter(r =>
    magBenaderen(r) &&
    r.whatsapp.gevraagdOp && !r.whatsapp.nummer &&
    !alOpgevolgd(r) &&
    !(r.laatstGezien && r.laatstGezien.van === 'bedrijf') &&
    werkdagenTussen(r.whatsapp.gevraagdOp, vandaag) >= werkdagen);
}

// Twee rijen, één postbus. Het logboek denkt per bedrijf-in-een-regio, maar een
// mail gaat naar een ADRES. Staat hetzelfde bedrijf in twee regio's, of delen
// twee bedrijven één postbus, dan zou één ronde er twee mails naartoe sturen —
// en de ontvanger ziet twee bijna identieke berichten van dezelfde afzender.
//
// Op 4 september 2026 kwam dat nergens voor (133 rijen, 133 verschillende
// adressen), maar dat verandert vanzelf zodra een bedrijf in een tweede regio
// gepubliceerd wordt. Daarom controleert de ronde het élke keer, in plaats van
// erop te vertrouwen dat het niet gebeurt.
function dubbeleAdressen(rijen) {
  const perAdres = new Map();
  for (const r of rijen) {
    if (!r.email) continue;
    const k = r.email.toLowerCase();
    if (!perAdres.has(k)) perAdres.set(k, []);
    perAdres.get(k).push(r);
  }
  return [...perAdres.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([email, v]) => ({ email, rijen: v }));
}

// Bedrijven die wél op Olivier wachten: er is een nummer gevraagd, ze hebben
// daarna geschreven, en er staat nog geen nummer. De vrijdagronde meldt deze
// apart in plaats van er een herinnering naartoe te sturen.
function wachtOpOlivier(rijen) {
  return rijen.filter(r =>
    magBenaderen(r) &&
    r.whatsapp.gevraagdOp && !r.whatsapp.nummer &&
    r.laatstGezien && r.laatstGezien.van === 'bedrijf');
}

// Badge toegezegd of bezorgd, maar hij staat nog niet op hun site. `geplaatstOp`
// wordt door scripts/badge-check.js ingevuld, niet door een mailronde.
//
// `gevraagdOp` betekende oorspronkelijk "zij vroegen erom". Sinds 4 september
// 2026 dekt het ook "wij bezorgden hem ongevraagd": scenario 4 in
// prompts/reply-scenarios.md stuurt de badge mee aan bedrijven die op de
// opvolgmail een WhatsApp-nummer doorgaven. Die hebben er nooit om gevraagd —
// de opvolgmail bood hem niet meer aan — maar ze krijgen hem wél, en dan hoort
// ook bij hen bijgehouden te worden of hij ooit op hun site verschijnt.
function badgeBeloofd(rijen) {
  return rijen.filter(r => r.badge.gevraagdOp && !r.badge.geplaatstOp);
}

// DE DUBBELE-BERICHT-REM — het WhatsApp-equivalent van alOpgevolgd().
//
// Dezelfde regel, een ander kanaal: een bedrijf krijgt nooit twee keer hetzelfde
// bericht. Op WhatsApp weegt dat zwaarder dan in de mail. Een mail te veel
// verdwijnt in een postvak; een bericht te veel staat op hun telefoon, naast de
// berichten van hun klanten, en is niet weg te denken.
//
// `klaargezetOp` telt, niet "verstuurd". Of Olivier het bericht daadwerkelijk
// wegstuurt weet dit logboek niet — WhatsApp vertelt ons niets terug. Dat is
// bewust de veilige kant van de fout: laat hij het liggen, dan blijft het
// bedrijf uitgesloten tot iemand de datum uit het logboek haalt. Andersom zou
// elke ronde hetzelfde bericht opnieuw aanbieden.
// `overgeslagen` telt hier even zwaar mee: een rij die bewust overgeslagen is,
// draagt een klaargezetOp zonder nummer en valt dus vanzelf weg. Dat is met
// opzet dezelfde toestand — of het bericht nu klaargezet werd of bewust niet,
// het bedrijf is behandeld en komt niet meer terug.
function alNabericht(r) {
  return Boolean(r.nabericht.klaargezetOp);
}

// Voor welke rijen mag er een WhatsApp-bericht klaargezet worden?
//
// `momenten` is een Map(sleutel -> tijdstip waarop de bevestigingsmail vertrok),
// gevuld uit Gmail door scripts/whatsapp-nabericht.js. Die datum staat bewust
// NIET in het logboek: het is een tijdstip op de minuut, en het logboek denkt
// in dagen. Gmail is daar de waarheid over, zoals Gmail de waarheid is over de
// mails zelf.
//
// Deze functie doet geen enkele uitspraak over het nummer. Dat komt uit
// data/whatsapp.json — wat er werkelijk op de pagina staat — en wordt door de
// aanroeper gecontroleerd. Zou het hier staan, dan viel een rij waarvan het
// logboek achterloopt stilzwijgend weg, en stil wegvallen is precies wat dit
// project niet meer wil.
function naberichtKandidaten(rijen, momenten, nu = new Date(), opties = {}) {
  const wacht = (opties.minuten ?? NABERICHT_WACHT_MINUTEN) * 60000;
  const nuMs = (nu instanceof Date ? nu : new Date(nu)).getTime();
  return rijen.filter(r => {
    if (!magBenaderen(r) || alNabericht(r)) return false;
    const moment = momenten.get(r.sleutel);
    if (!moment) return false;
    const ms = (moment instanceof Date ? moment : new Date(moment)).getTime();
    if (!Number.isFinite(ms)) return false;
    return nuMs - ms >= wacht;
  });
}

module.exports = {
  ANTWOORDSOORTEN, STAPPEN, TOP_N, WACHT_WERKDAGEN, NABERICHT_WACHT_MINUTEN,
  norm, sleutelVan, legeRij, pad, domeinVan, lokaleDatum, lokaleTijd, vandaagISO,
  load, schrijf, index,
  werkdagenTussen, magBenaderen, magMail1, alOpgevolgd, alNabericht, naberichtKandidaten, opvolgKandidaten, wachtOpNummer, wachtOpOlivier, badgeBeloofd,
  dubbeleAdressen,
};
