#!/usr/bin/env node
/**
 * Het WhatsApp-bericht dat op de bevestigingsmail volgt — klaargezet, niet verstuurd.
 *
 * WAT DIT DOET
 *
 * Zodra een bedrijf zijn WhatsApp-nummer doorgaf en dat nummer live staat,
 * stuurt Olivier de bevestigingsmail ("Ik heb je WhatsApp-nummer toegevoegd").
 * Een uur later hoort daar een kort WhatsApp-bericht bij: dan staat zijn nummer
 * ook bij hén in de telefoon, en heeft het bedrijf de knop één keer zien werken.
 *
 * Dit programma zoekt die bevestigingsmails, wacht het uur af, en zet het
 * bericht klaar als een wa.me-link in één mail aan Olivier. Hij tikt de link
 * aan op zijn telefoon, WhatsApp opent met de tekst er al in, hij drukt op
 * verzenden. Eén tik.
 *
 * WAAROM HET NIET ZELF VERSTUURT
 *
 * Geautomatiseerd versturen kan alleen via de WhatsApp Business Platform van
 * Meta, en die legt drie dingen op: een vooraf goedgekeurd sjabloon, een apart
 * nummer (een nummer kan niet tegelijk in de app en in de API zitten), en een
 * kost per bericht. Bovendien gaf het bedrijf zijn nummer om op de pagina te
 * zetten — dat is geen toestemming om er zélf berichten naartoe te sturen.
 * Klagen ontvangers, dan zakt de quality rating en gaat het nummer uiteindelijk
 * op slot: precies het kanaal waar het hele aanbod op steunt.
 *
 * Eén tik van Olivier lost dat allemaal op. Het bericht vertrekt van zijn eigen
 * nummer, waar het bedrijf hem later ook kan terugvinden.
 *
 * DE REM
 *
 * Nooit twee keer hetzelfde bedrijf — dezelfde regel als bij de mails, en op
 * WhatsApp weegt ze zwaarder. `alNabericht()` in lib/outreach.js is de enige
 * plek waar ze staat; dit script schrijft `nabericht.klaargezetOp` weg zodra het
 * de link gemaild heeft.
 *
 * Gebruik:
 *   node scripts/whatsapp-nabericht.js --droog       toont wat het zou doen, wijzigt niets
 *   node scripts/whatsapp-nabericht.js               zet de berichten klaar en mailt ze
 *   node scripts/whatsapp-nabericht.js --nu          zonder het wachtuur — voor de mailronde,
 *                                                    die de knop naast de draft klaarzet
 *   node scripts/whatsapp-nabericht.js --overslaan   boekt alles wat klaarstaat af zonder
 *                                                    bericht — die bedrijven krijgen niets
 *
 * Eenmalig vooraf: node scripts/google-toegang.js
 */

'use strict';
const fs = require('fs');
const path = require('path');

const gmail = require('../lib/gmail');
const outreach = require('../lib/outreach');
const whatsapp = require('../lib/whatsapp');

const WORTEL = path.join(__dirname, '..');
const DROOG = process.argv.includes('--droog');
// --overslaan: alles wat nu klaarstaat als behandeld wegschrijven, zónder een
// link te maken en zonder iets te mailen. Voor bedrijven die om een goede reden
// geen bericht horen te krijgen — op 4 september 2026 waren dat de twee die hun
// bevestigingsmail nog zonder de aankondiging kregen. Er is geen weg terug in de
// code: wil je er later toch een sturen, dan haal je die rij met de hand uit
// data/outreach.json.
const OVERSLAAN = process.argv.includes('--overslaan');
// --nu: het wachtuur overslaan. Bedoeld voor de mailronde, die de berichten
// klaarzet op hetzelfde moment als de bevestigingsdraft — dan is er nog geen
// uur verstreken en zou de gewone regel niets vinden.
//
// Waarom dat mag: het uur beschermde niet het klaarzetten maar het versturen,
// en versturen doet Olivier zelf. Een klaarstaande knop verstuurt niets. Hij
// vroeg er op 4 september 2026 zelf om — een stap die hij een uur later moet
// onthouden, gebeurt niet, en dan krijgt het bedrijf nooit een bericht.
//
// Wat je hiermee WEL kan breken: tik je de knop aan vóór de bevestigingsmail
// vertrokken is, dan valt het "testberichtje" uit de lucht bij een bedrijf dat
// zijn nummer gaf om het op een pagina te zetten. Daarom noemt zowel de
// knoppenpagina als de verslagmail die volgorde uitdrukkelijk.
const NU = process.argv.includes('--nu');
const VANDAAG = outreach.vandaagISO();

const LOGBESTAND = path.join(WORTEL, 'reports', 'whatsapp-nabericht.log');
const KNOPPEN = path.join(WORTEL, 'reports', 'whatsapp-berichten.html');
const VERSLAG_NAAR = 'olivier@magicworx.net';

// DE VINGERAFDRUK. De openingszin van de bevestigingsmail, zoals ze letterlijk
// in prompts/reply-scenarios.md staat (§ Na publicatie). Daar hangt dit hele
// programma aan: die zin is het signaal dat de mail vertrokken is.
//
// Verdwijnt of verandert ze, dan vindt dit script niets meer en zwijgt het —
// zonder foutmelding. Daarom staat ze ook in scripts/impactcheck.js, die hard
// faalt zodra de zin uit het sjabloon verdwijnt.
const VINGERAFDRUK = 'Ik heb je WhatsApp-nummer toegevoegd';

// Hoe ver terug we kijken. Twee dagen, en dat is bewust kort.
//
// Het bericht verwijst naar een mail die het bedrijf net gelezen heeft. Een
// verwijzing naar een mail van vorige week klopt niet meer, en een bericht dat
// niet klopt is erger dan geen bericht. Ligt het programma drie dagen stil, dan
// vallen die gevallen weg — dat is de veilige kant van de fout.
const ZOEK_DAGEN = 2;

const ZOEKOPDRACHTEN = [
  `in:sent newer_than:${ZOEK_DAGEN}d "${VINGERAFDRUK}"`,
  `in:anywhere newer_than:${ZOEK_DAGEN}d "${VINGERAFDRUK}"`,
];

// ───────────────────────────────────────────── logboek

const logregels = [];
function log(bericht) {
  logregels.push(`${new Date().toISOString()}  ${bericht}`);
  console.log(bericht);
}
function schrijfLog() {
  try {
    fs.mkdirSync(path.dirname(LOGBESTAND), { recursive: true });
    fs.appendFileSync(LOGBESTAND, logregels.join('\n') + '\n');
  } catch { /* een logboek mag de routine nooit breken */ }
}

// ───────────────────────────────────────────── de bevestigingsmail herkennen

/**
 * De LAATSTE bevestigingsmail van Olivier in deze thread, of null.
 *
 * De laatste en niet de eerste: staat een bedrijf in twee regio's, of werd het
 * nummer ooit gecorrigeerd, dan is de recentste de mail waar het bedrijf nu
 * naar kijkt.
 */
function bevestigingIn(berichten) {
  for (let i = berichten.length - 1; i >= 0; i--) {
    const b = berichten[i];
    if (!gmail.VAN_OLIVIER.test(b.van)) continue;
    if (!b.tekst.includes(VINGERAFDRUK)) continue;
    return b;
  }
  return null;
}

/**
 * De voornaam uit diezelfde zin plukken: "Ik heb je WhatsApp-nummer toegevoegd,
 * Mathias." → "Mathias". Zo staat er in het WhatsApp-bericht precies dezelfde
 * naam als in de mail een uur eerder; een tweede bron zou daar vanzelf van gaan
 * afwijken.
 *
 * Geen naam in de mail (die kan ook weggelaten worden) → null, en dan valt de
 * naam ook uit het bericht weg.
 */
function voornaamUit(tekst) {
  const m = new RegExp(VINGERAFDRUK + '(?:,\\s*([^.,\\n]{1,30}))?\\s*\\.').exec(tekst);
  if (!m || !m[1]) return null;
  const naam = m[1].trim();
  return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*$/.test(naam) ? naam : null;
}

// ───────────────────────────────────────────── het bericht

/**
 * De tekst die in WhatsApp komt te staan. Oliviers stem: kort, één gedachte per
 * regel, geen druk, geen uitroeptekens. Zie de skill keurwijzer-toon.
 *
 * Er wordt niets gevraagd. Het bedrijf heeft zijn pagina, zijn badge en zijn
 * knop; dit bericht bevestigt alleen dat het werkt en laat een nummer achter.
 *
 * Het noemt zichzelf een testberichtje, en dat is geen bescheidenheid maar de
 * hele reden van bestaan: de bevestigingsmail een uur eerder kondigt het
 * letterlijk aan ("Ik stuur je nog een testberichtje"). Zo komt het bericht
 * niet uit de lucht vallen bij een bedrijf dat zijn nummer gaf om het op de
 * pagina te zetten. Verdwijnt die aankondiging uit prompts/reply-scenarios.md,
 * dan klopt dit bericht niet meer — scripts/impactcheck.js bewaakt die zin.
 *
 * Tekst van Olivier zelf, 4 september 2026.
 */
function bouwBericht(voornaam) {
  // De naam staat achteraan, niet in een aanhef. Is hij onbekend, dan valt de
  // komma mee weg — nooit "Je kan me hier altijd bereiken, ." laten staan.
  const bereikbaar = voornaam
    ? `Je kan me hier altijd bereiken, ${voornaam}.`
    : 'Je kan me hier altijd bereiken.';
  return [
    'Testberichtje via Keurwijzer.be. Je nummer staat online.',
    'Dit is om te zien of het werkt.',
    '',
    bereikbaar,
    '',
    'Groeten,',
    'Olivier',
  ].join('\n');
}

// ───────────────────────────────────────────── rij zoeken bij een thread

/**
 * Welke rij uit het logboek hoort bij deze thread?
 *
 * Eerst op threadId — dat is exact. Lukt dat niet, dan op het domein van de
 * geadresseerde: info@heitodakwerken.be hoort bij heitodakwerken.be. Gedeelde
 * postbussen (gmail, telenet, ...) geven bewust niets terug; die zouden het
 * eerste gmail-bedrijf alle gmail-threads laten opeisen.
 *
 * Twee mogelijke rijen → geen keuze maken. Dan gaat het geval naar Olivier.
 */
function rijBijThread(rijen, threadId, naarAdres) {
  const opId = rijen.filter(r => r.threadId === threadId || (r.nevenThreads || []).includes(threadId));
  if (opId.length === 1) return { rij: opId[0] };
  if (opId.length > 1) return { fout: 'meerdere bedrijven hangen aan deze thread' };

  const domein = outreach.domeinVan(naarAdres);
  if (!domein) return { fout: 'geen bedrijf te koppelen aan deze thread (geen threadId in het logboek, geen bruikbaar domein)' };

  const opDomein = rijen.filter(r => r.domein === domein || outreach.domeinVan(r.email) === domein);
  if (opDomein.length === 1) return { rij: opDomein[0] };
  if (opDomein.length > 1) return { fout: `meerdere bedrijven op domein ${domein}` };
  return { fout: `geen bedrijf gevonden voor ${domein}` };
}

// ───────────────────────────────────────────── de knoppenpagina

/**
 * Waarom deze pagina bestaat.
 *
 * Een `wa.me`-link is perfect op de telefoon: één tik en WhatsApp staat open.
 * Op de laptop zit er een scherm van WhatsApp zelf tussen ("Chatten op
 * WhatsApp", met een knop "WhatsApp openen"). Dat is elke keer twee klikken
 * extra, en Olivier werkt vaak op zijn laptop.
 *
 * Een `whatsapp://`-link slaat dat scherm over en opent WhatsApp Desktop
 * meteen. Maar zo'n link werkt niet vanuit een mail — Gmail maakt er geen
 * klikbare link van, want het is geen http-adres. Vandaar dit bestandje:
 * dubbelklikken, op een knop drukken, klaar. De eerste keer vraagt je browser
 * nog één keer of hij WhatsApp mag openen; vink daar "altijd toestaan" aan en
 * daarna is het één klik.
 *
 * De `wa.me`-link staat er ook bij, als tweede regel. Die heb je nodig zodra je
 * dit op je telefoon opent, en als vangnet wanneer WhatsApp Desktop niet draait.
 *
 * Het bestand wordt elke ronde overschreven en bevat alleen wat er nu klaarstaat.
 * Het is géén logboek — dat is data/outreach.json. Het staat om die reden ook
 * niet in git: er staan bedrijfsnamen en telefoonnummers in.
 */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function bouwPagina(klaar, vandaag) {
  const kaarten = klaar.map((k) => {
    const direct = 'whatsapp://send?phone=' + k.nummer + '&text=' + encodeURIComponent(k.bericht);
    return `  <article>
    <h2>${esc(k.bedrijf)}</h2>
    <p class="onder">regio ${esc(regioVan(k.slug))} — ${esc(leesbaar(k.nummer))} — je mail vertrok ${esc(k.mailOm)}</p>
    <pre>${esc(k.bericht)}</pre>
    <p><a class="knop" href="${esc(direct)}">Openen in WhatsApp</a>
       <a class="klein" href="${esc(k.url)}">of via de browser</a></p>
  </article>`;
  }).join('\n');

  const hoeveel = klaar.length === 1 ? 'Eén bericht staat klaar' : klaar.length + ' berichten staan klaar';

  return `<!doctype html>
<html lang="nl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Keurwijzer — WhatsApp-berichten</title>
<style>
  :root { color-scheme: light dark; --rand: #d8d8d2; --grond: #fbfbf9; --kaart: #fff;
          --inkt: #1a1a18; --zacht: #6b6b64; --groen: #128c7e; }
  @media (prefers-color-scheme: dark) {
    :root { --rand: #33332f; --grond: #161614; --kaart: #1e1e1b; --inkt: #eceae4; --zacht: #9b9b93; --groen: #25d366; }
  }
  body { margin: 0; padding: 2rem 1.25rem 4rem; background: var(--grond); color: var(--inkt);
         font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 40rem; margin: 0 auto; }
  h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
  .kop { color: var(--zacht); margin: 0 0 2rem; }
  article { background: var(--kaart); border: 1px solid var(--rand); border-radius: 10px;
            padding: 1.25rem 1.35rem; margin-bottom: 1.25rem; }
  h2 { font-size: 1.05rem; margin: 0; }
  .onder { color: var(--zacht); font-size: .9rem; margin: .15rem 0 1rem; }
  pre { white-space: pre-wrap; font: inherit; background: transparent; border-left: 3px solid var(--rand);
        margin: 0 0 1.25rem; padding: 0 0 0 1rem; color: var(--zacht); }
  .knop { display: inline-block; background: var(--groen); color: #fff; text-decoration: none;
          padding: .6rem 1.1rem; border-radius: 8px; font-weight: 600; }
  .klein { color: var(--zacht); font-size: .9rem; margin-left: .9rem; }
  .volgorde { border-left: 3px solid var(--groen); padding: .1rem 0 .1rem 1rem; margin: 0 0 1.75rem; }
  footer { color: var(--zacht); font-size: .9rem; margin-top: 2rem; }
</style>
<main>
  <h1>${hoeveel}</h1>
  <p class="kop">Klaargezet op ${esc(vandaag)}. Klik op de knop, kijk het bericht na in WhatsApp en verstuur het zelf.</p>
  <p class="volgorde">Verstuur eerst de bevestigingsmail. Die kondigt dit testberichtje aan &mdash;
  komt het bericht eerst, dan valt het uit de lucht.</p>
${kaarten}
  <footer>Elk bedrijf staat hier één keer, ooit. Verstuur je er een niet, dan blijft dat bedrijf
  verder met rust — dat is met opzet zo. Deze pagina wordt bij de volgende ronde overschreven.</footer>
</main>
</html>
`;
}

// ───────────────────────────────────────────── verslag

function leesbaar(genormaliseerd) {
  const n = genormaliseerd.replace(/^32/, '0');
  return `${n.slice(0, 4)} ${n.slice(4, 6)} ${n.slice(6, 8)} ${n.slice(8)}`;
}

// De regionaam uit de slug, met hoofdletters zoals een mens ze schrijft:
// 'dakwerkers-sint-niklaas' → 'Sint-Niklaas'.
const regioVan = (slug) => slug.replace(/^[a-z]+-/, '')
  .split('-').map(d => d.charAt(0).toUpperCase() + d.slice(1)).join('-');

function stelVerslagOp(klaar, aandacht, storingen) {
  const datum = new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' });
  const hoeveel = klaar.length;
  const onderwerp = hoeveel
    ? `Keurwijzer WhatsApp — ${hoeveel === 1 ? 'één bericht' : hoeveel + ' berichten'} klaar (${datum})`
    : `Keurwijzer WhatsApp — geen berichten klaar (${datum})`;

  const r = ['Dag Olivier,', ''];

  if (hoeveel) {
    r.push(hoeveel === 1
      ? 'Eén WhatsApp-bericht staat klaar. Tik de link aan op je telefoon: WhatsApp opent met de tekst er al in, jij drukt op verzenden.'
      : `${hoeveel} WhatsApp-berichten staan klaar. Tik een link aan op je telefoon: WhatsApp opent met de tekst er al in, jij drukt op verzenden.`);
    r.push('');
    klaar.forEach((k, i) => {
      r.push(`${i + 1}. ${k.bedrijf} — regio ${regioVan(k.slug)} — ${leesbaar(k.nummer)}`);
      const [dag, uur] = String(k.mailOm).split(" ");
      r.push(`   Je bevestigingsmail vertrok op ${dag} om ${uur}.`);
      r.push('');
      r.push(`   ${k.url}`);
      r.push('');
      for (const regel of k.bericht.split('\n')) r.push('   > ' + regel);
      r.push('');
    });
    r.push('Verstuur eerst de bevestigingsmail, dan pas het WhatsApp-bericht. Die mail kondigt');
    r.push('het testberichtje aan; komt het bericht eerst, dan valt het uit de lucht.');
    r.push('');
    r.push('Zit je aan je laptop? Dubbelklik dan reports\\whatsapp-berichten.html in de');
    r.push('projectmap. Daar staat per bedrijf een knop die WhatsApp Desktop meteen opent,');
    r.push('zonder het tussenscherm van de browser.');
    r.push('');
    r.push('Ze staan in het logboek, dus ze komen geen tweede keer terug. Verstuur je er een niet,');
    r.push('dan blijft dat bedrijf verder met rust — dat is met opzet zo.');
  } else {
    r.push('Er staat geen enkel WhatsApp-bericht klaar. Dat betekent dat er de voorbije twee dagen');
    r.push(NU
      ? 'geen bevestigingsmail klaarstond of vertrok voor een bedrijf dat er nog geen bericht van kreeg.'
      : 'geen bevestigingsmail vertrok waarvan het uur al om is.');
  }
  r.push('');

  if (aandacht.length) {
    r.push('Voor jou om te bekijken', '');
    for (const a of aandacht) r.push(`- ${a}`);
    r.push('');
    r.push('Deze heb ik met opzet niet klaargezet: bij twijfel doe ik niets.');
    r.push('');
  }

  if (storingen.length) {
    r.push('Storingen', '');
    for (const s of storingen) r.push(`- ${s}`);
    r.push('');
  }

  r.push('Groeten,', 'Keurwijzer');
  return { onderwerp, tekst: r.join('\n') };
}

// ───────────────────────────────────────────── hoofdlijn

async function hoofdlijn() {
  const storingen = [];
  let sleutel = null;

  try {
    const env = gmail.leesEnv(WORTEL);
    const ontbreekt = gmail.keurEnv(env);
    if (ontbreekt.length) {
      console.error(`\n✗ ${ontbreekt.join(', ')} ontbreekt in .env.\n  Draai eerst:  node scripts/google-toegang.js\n`);
      process.exit(2);
    }

    log(`— WhatsApp-nabericht ${VANDAAG}${DROOG ? ' (DROOG — er wordt niets gewijzigd)' : ''}`);

    // Het logboek is de bron voor "wat is er al gedaan". Ontbreekt het, dan is
    // er geen rem, en dan sturen we liever niets.
    const boek = outreach.load(WORTEL);
    if (!boek.bestaat) {
      console.error('\n✗ data/outreach.json bestaat niet.\n  Draai eerst:  node scripts/outreach-seed.js\n');
      process.exit(2);
    }
    if (boek.fouten.length) {
      console.error('\n✗ Het outreach-logboek is niet in orde:\n');
      boek.fouten.forEach(f => console.error('  - ' + f));
      console.error('\nEr is niets klaargezet.\n');
      process.exit(1);
    }

    const nummers = whatsapp.load(WORTEL);
    if (nummers.fouten.length) {
      console.error('\n✗ data/whatsapp.json is niet in orde:\n');
      nummers.fouten.forEach(f => console.error('  - ' + f));
      process.exit(1);
    }
    const nummerPer = new Map(nummers.rijen.map(n => [n.sleutel, n]));

    sleutel = await gmail.verseSleutel(env, { log });
    const ids = await gmail.zoekThreadIds(sleutel, ZOEKOPDRACHTEN, { log });
    log(`  ${ids.length} gesprek${ids.length === 1 ? '' : 'ken'} met een bevestigingsmail`);

    // Per rij: wanneer vertrok de bevestigingsmail, en welke naam stond erin?
    const momenten = new Map();
    const extra = new Map();
    const aandacht = [];

    for (const id of ids) {
      let thread;
      try { thread = await gmail.haalThread(sleutel, id, { log }); }
      catch (e) { storingen.push(`gesprek ${id} kon niet opgehaald worden: ${e.message}`); continue; }

      const berichten = gmail.berichtenVan(thread);
      const mail = bevestigingIn(berichten);
      if (!mail) continue;                       // de zoekopdracht vond hem, de thread niet — dan telt de thread

      const gevonden = rijBijThread(boek.rijen, id, mail.naar);
      if (gevonden.fout) { aandacht.push(`${gevonden.fout} (mail van ${outreach.lokaleTijd(mail.datum)} aan ${mail.naar})`); continue; }

      const rij = gevonden.rij;
      // Twee bevestigingsmails in twee threads van hetzelfde bedrijf: de laatste wint.
      const eerder = momenten.get(rij.sleutel);
      if (eerder && eerder >= mail.datum) continue;
      momenten.set(rij.sleutel, mail.datum);
      extra.set(rij.sleutel, { voornaam: voornaamUit(mail.tekst), mailOm: outreach.lokaleTijd(mail.datum) });
    }

    const kandidaten = outreach.naberichtKandidaten(
      boek.rijen, momenten, new Date(), NU ? { minuten: 0 } : {});

    const klaar = [];
    for (const rij of kandidaten) {
      const n = nummerPer.get(rij.sleutel);
      if (!n) {
        aandacht.push(`${rij.bedrijf} (regio ${regioVan(rij.slug)}) — de bevestigingsmail vertrok, maar er staat geen nummer in data/whatsapp.json. Zonder nummer kan ik geen bericht klaarzetten.`);
        continue;
      }
      const { voornaam, mailOm } = extra.get(rij.sleutel);
      const bericht = bouwBericht(voornaam);
      klaar.push({
        rij, slug: rij.slug, bedrijf: rij.bedrijf, nummer: n.nummer, mailOm, bericht,
        url: whatsapp.waUrl(n.nummer, bericht),
      });
      log(`  + ${rij.bedrijf} (${rij.slug}) — ${leesbaar(n.nummer)}`);
    }
    for (const a of aandacht) log(`  ? ${a}`);

    if (OVERSLAAN) {
      if (!klaar.length) { log('  niets om over te slaan'); schrijfLog(); return; }
      for (const k of klaar) {
        k.rij.nabericht = { klaargezetOp: VANDAAG, nummer: null, overgeslagen: true };
        log(`  overgeslagen: ${k.bedrijf} (${k.slug}) — krijgt geen bericht, komt niet meer terug`);
      }
      outreach.schrijf(WORTEL, boek.rijen, VANDAAG);
      log(`  ${klaar.length} rij(en) afgeboekt zonder bericht. Er is niets gemaild.`);
      schrijfLog();
      return;
    }

    if (DROOG) {
      log(`\nDROOG: zou ${klaar.length} bericht(en) klaarzetten en ${aandacht.length} geval(len) melden.`);
      for (const k of klaar) log(`\n  ${k.bedrijf}\n  ${k.url}\n\n${k.bericht.split('\n').map(r => '    ' + r).join('\n')}`);
      if (klaar.length) log(`\nEr zou ook een knoppenpagina komen: ${KNOPPEN}`);
      log('\nEr is niets gewijzigd, niets geschreven en niets gemaild.');
      schrijfLog();
      return;
    }

    // Eerst de knoppenpagina, dan pas de mail: die mail verwijst ernaar, dus
    // ze moet er al staan tegen de tijd dat hij hem opent.
    if (klaar.length) {
      fs.mkdirSync(path.dirname(KNOPPEN), { recursive: true });
      fs.writeFileSync(KNOPPEN, bouwPagina(klaar, VANDAAG), 'utf8');
      log(`  knoppenpagina geschreven: ${KNOPPEN}`);
    }

    const { onderwerp, tekst } = stelVerslagOp(klaar, aandacht, storingen);

    // Eerst mailen, dan pas het logboek bijwerken. Andersom zou een mislukte
    // mail een bedrijf uitsluiten van een bericht dat nooit vertrokken is.
    if (klaar.length || aandacht.length || storingen.length) {
      await gmail.verstuurMail(sleutel, VERSLAG_NAAR, onderwerp, tekst, { log });
      log(`  verslag gemaild: "${onderwerp}"`);
    } else {
      log('  niets te melden, geen mail gestuurd');
    }

    if (klaar.length) {
      for (const k of klaar) {
        k.rij.nabericht = { klaargezetOp: VANDAAG, nummer: k.nummer };
      }
      outreach.schrijf(WORTEL, boek.rijen, VANDAAG);
      log(`  ${klaar.length} rij(en) in het logboek gezet`);
    }

    log('— klaar');
    schrijfLog();
  } catch (e) {
    log(`✗ AFGEBROKEN: ${e.message}`);
    schrijfLog();
    if (sleutel) {
      try {
        await gmail.verstuurMail(sleutel, VERSLAG_NAAR, 'Keurwijzer WhatsApp — NABERICHT AFGEBROKEN',
          `Dag Olivier,\n\nHet klaarzetten van de WhatsApp-berichten is afgebroken met deze fout:\n\n  ${e.message}\n\n`
          + `Er staat mogelijk niets klaar. Laat dit nakijken.\n\nGroeten,\nKeurwijzer`);
      } catch { /* dan rest alleen het logboek */ }
    }
    process.exit(1);
  }
}

if (require.main === module) hoofdlijn();

module.exports = { VINGERAFDRUK, ZOEK_DAGEN, bevestigingIn, voornaamUit, bouwBericht, rijBijThread, stelVerslagOp, bouwPagina };
