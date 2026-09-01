#!/usr/bin/env node
/**
 * De WhatsApp-routine als programma.
 *
 * Waarom dit bestaat: tot 1 september 2026 deed een taalmodel de hele keten —
 * mailbox lezen, oordelen, publiceren, controleren, rapporteren. Twee keer op
 * één dag ging dat mis: een Gmail-opdracht bleef hangen (de hele avond viel
 * stil), en de Gmail-zoeklijst liet een antwoord weg (een doorgegeven nummer
 * werd gemist en er werd ten onrechte "nog niet geantwoord" gemeld).
 *
 * Van die keten vraagt maar één stap echt om taalbegrip. Al de rest is
 * mechanisch, en mechanisch werk hoort in een programma. Dit is dat programma.
 *
 * Het uitgangspunt is behoudend: liever een geval doorschuiven naar Olivier dan
 * een nummer verkeerd publiceren. Alles wat niet onbetwistbaar is, komt in het
 * dagverslag terecht in plaats van op de site.
 *
 * Gebruik:
 *   node scripts/whatsapp-routine.js --droog    toont wat het zou doen, wijzigt niets
 *   node scripts/whatsapp-routine.js            doet het werk
 *
 * Eenmalig vooraf: node scripts/google-toegang.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const WORTEL = path.join(__dirname, '..');
const DROOG = process.argv.includes('--droog');
const VANDAAG = new Date().toISOString().slice(0, 10);

const WHATSAPP_JSON = path.join(WORTEL, 'data', 'whatsapp.json');
const MARKERING = path.join(WORTEL, 'reports', 'whatsapp-dagelijks.json');
const LOGBESTAND = path.join(WORTEL, 'reports', 'whatsapp-routine.log');
const VERSLAG_NAAR = 'olivier@magicworx.net';

// Hoeveel dagen terug we in de mailbox kijken. Ruim genomen: een bedrijf dat pas
// na een week antwoordt mag niet buiten beeld vallen.
const DAGEN_TERUG = 14;

const ZOEKOPDRACHTEN = [
  `in:inbox -in:sent newer_than:${DAGEN_TERUG}d subject:vergeleken`,
  `in:inbox -in:sent newer_than:${DAGEN_TERUG}d subject:keurwijzer`,
  `in:inbox -in:sent newer_than:${DAGEN_TERUG}d {whatsapp "whats app" "zakelijk nummer"}`,
];

// ───────────────────────────────────────────── logboek

const logregels = [];
function log(bericht) {
  const regel = `${new Date().toISOString()}  ${bericht}`;
  logregels.push(regel);
  console.log(bericht);
}
function schrijfLog() {
  try { fs.appendFileSync(LOGBESTAND, logregels.join('\n') + '\n'); }
  catch { /* een logboek mag de routine nooit breken */ }
}

// ───────────────────────────────────────────── .env

function leesEnv() {
  const uit = {};
  let ruw = '';
  try { ruw = fs.readFileSync(path.join(WORTEL, '.env'), 'utf8'); }
  catch { return uit; }
  for (const regel of ruw.split(/\r?\n/)) {
    const m = regel.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) uit[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return uit;
}

// ───────────────────────────────────────────── netwerk met tijdslimiet

/**
 * fetch met een harde tijdslimiet en herhalingen. Dit is de kern van de
 * robuustheid: geen enkele oproep mag ooit oneindig blijven hangen, want dat is
 * precies wat de oude routine deed vastlopen.
 */
async function haal(url, opties = {}, { pogingen = 3, limiet = 20000, naam = 'oproep' } = {}) {
  let laatsteFout;
  for (let poging = 1; poging <= pogingen; poging++) {
    const afbreker = new AbortController();
    const klok = setTimeout(() => afbreker.abort(), limiet);
    try {
      const antwoord = await fetch(url, { ...opties, signal: afbreker.signal });
      clearTimeout(klok);
      if (antwoord.status >= 500 || antwoord.status === 429) {
        throw new Error(`HTTP ${antwoord.status}`);
      }
      return antwoord;
    } catch (e) {
      clearTimeout(klok);
      laatsteFout = e;
      const oorzaak = e.name === 'AbortError' ? `geen antwoord binnen ${limiet / 1000}s` : e.message;
      log(`  ⚠ ${naam}: poging ${poging} van ${pogingen} mislukt (${oorzaak})`);
      if (poging < pogingen) await new Promise((r) => setTimeout(r, 1500 * poging));
    }
  }
  throw new Error(`${naam} bleef mislukken: ${laatsteFout && laatsteFout.message}`);
}

// ───────────────────────────────────────────── Gmail

async function verseSleutel(env) {
  const antwoord = await haal('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  }, { naam: 'Google-sleutel vernieuwen' });
  const data = await antwoord.json();
  if (!data.access_token) {
    throw new Error('Google gaf geen toegangssleutel: ' + JSON.stringify(data));
  }
  return data.access_token;
}

function gmailKop(sleutel) {
  return { Authorization: `Bearer ${sleutel}`, 'Content-Type': 'application/json' };
}

async function zoekThreadIds(sleutel) {
  const ids = new Set();
  for (const q of ZOEKOPDRACHTEN) {
    const url = 'https://gmail.googleapis.com/gmail/v1/users/me/threads?'
      + new URLSearchParams({ q, maxResults: '100' });
    const antwoord = await haal(url, { headers: gmailKop(sleutel) }, { naam: 'threads zoeken' });
    const data = await antwoord.json();
    for (const t of data.threads || []) ids.add(t.id);
  }
  return [...ids];
}

/**
 * Let op: we halen élke thread volledig op. De zoekopdracht dient alleen om
 * kandidaten te vínden, nooit om te beoordelen wat erin staat — die lijst kan
 * berichten weglaten. Op 1 september 2026 ontbrak zo het antwoord van DWG
 * Projects, met een gemist nummer tot gevolg.
 */
async function haalThread(sleutel, id) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=full`;
  const antwoord = await haal(url, { headers: gmailKop(sleutel) }, { naam: `thread ${id}` });
  return antwoord.json();
}

async function verstuurMail(sleutel, onderwerp, tekst) {
  const rfc822 = [
    `To: ${VERSLAG_NAAR}`,
    `Subject: =?UTF-8?B?${Buffer.from(onderwerp, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(tekst, 'utf8').toString('base64'),
  ].join('\r\n');
  const raw = Buffer.from(rfc822, 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const antwoord = await haal('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: gmailKop(sleutel), body: JSON.stringify({ raw }),
  }, { naam: 'verslag mailen' });
  if (!antwoord.ok) throw new Error('mail versturen mislukte: HTTP ' + antwoord.status);
  return antwoord.json();
}

// ───────────────────────────────────────────── bericht uitpakken

function decodeer(data) {
  if (!data) return '';
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function platteTekst(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
    return decodeer(payload.body.data);
  }
  for (const deel of payload.parts || []) {
    const gevonden = platteTekst(deel);
    if (gevonden) return gevonden;
  }
  // Geen platte tekst? Dan de HTML ontdoen van opmaak.
  if (payload.mimeType === 'text/html' && payload.body && payload.body.data) {
    return decodeer(payload.body.data)
      .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  }
  return '';
}

function kop(bericht, naam) {
  const h = (bericht.payload && bericht.payload.headers) || [];
  const gevonden = h.find((x) => x.name.toLowerCase() === naam.toLowerCase());
  return gevonden ? gevonden.value : '';
}

function pakBericht(bericht) {
  return {
    id: bericht.id,
    van: kop(bericht, 'From'),
    datum: new Date(Number(bericht.internalDate)),
    tekst: platteTekst(bericht.payload),
  };
}

const VAN_OLIVIER = /olivier@magicworx\.net/i;

// ───────────────────────────────────────────── tekst opschonen

/**
 * Alles vanaf het eerste citaat-teken weghalen. Wat een bedrijf zelf schrijft
 * staat bovenaan; daaronder hangt de hele geschiedenis, vol nummers uit oudere
 * berichten en handtekeningen. Die mogen nooit meetellen.
 */
function zonderCitaat(tekst) {
  const grenzen = [
    /^\s*>/m,
    /^\s*On .+ wrote:/m,
    /^\s*Op .+(schreef|het volgende geschreven)/m,
    /^\s*(Van|From):\s*.+/m,
    /^\s*-{5,}/m,
    /^\s*_{5,}/m,
    /^\s*Verzonden vanaf/m,
  ];
  let einde = tekst.length;
  for (const g of grenzen) {
    const m = tekst.match(g);
    if (m && m.index < einde) einde = m.index;
  }
  return tekst.slice(0, einde);
}

/**
 * De handtekening eraf. Dit is wezenlijk: een nummer dat alleen in de
 * handtekening staat is géén doorgegeven nummer — het staat er bij elk bericht,
 * ook als het bedrijf niets toezegde. Elite Bouwteam is daar het voorbeeld van.
 */
function kernTekst(tekst) {
  const schoon = zonderCitaat(tekst);
  const grenzen = [
    /^\s*(met vriendelijke groet(en)?|mvg|vriendelijke groeten|groeten|gr\.|hoogachtend)\b/im,
    /^\s*--\s*$/m,
  ];
  let einde = schoon.length;
  for (const g of grenzen) {
    const m = schoon.match(g);
    if (m && m.index < einde) einde = m.index;
  }
  return schoon.slice(0, einde).trim();
}

// ───────────────────────────────────────────── nummers

/** Belgische gsm-nummers in elk gangbaar formaat → 324xxxxxxxx, of null. */
function normaliseer(ruw) {
  let cijfers = String(ruw).replace(/[^\d+]/g, '');
  if (cijfers.startsWith('+')) cijfers = cijfers.slice(1);
  if (cijfers.startsWith('0032')) cijfers = cijfers.slice(2);
  if (cijfers.startsWith('32')) cijfers = cijfers.slice(2);
  else if (cijfers.startsWith('0')) cijfers = cijfers.slice(1);
  else return null;
  if (!/^4\d{8}$/.test(cijfers)) return null;   // Belgisch mobiel: 4xx xx xx xx
  return '32' + cijfers;
}

function vindNummers(tekst) {
  const patroon = /(?:\+?32|0032|0)[\s./-]*4[\s./-]*\d{2}(?:[\s./-]*\d{2}){3}/g;
  const uniek = new Set();
  for (const treffer of tekst.match(patroon) || []) {
    const g = normaliseer(treffer);
    if (g) uniek.add(g);
  }
  return [...uniek];
}

function leesbaar(genormaliseerd) {
  const n = genormaliseerd.replace(/^32/, '0');
  return `${n.slice(0, 4)} ${n.slice(4, 6)} ${n.slice(6, 8)} ${n.slice(8)}`;
}

const BEVESTIGING = /\b(ja+\b|jazeker|jawel|klopt|correct|inderdaad|dat is (het|hem)|is juist|is correct)/i;

// ───────────────────────────────────────────── regio en bedrijf

function bekendeSlugs() {
  const uit = new Set();
  const configMap = path.join(WORTEL, 'config');
  for (const niche of fs.readdirSync(configMap)) {
    const nicheMap = path.join(configMap, niche);
    if (!fs.statSync(nicheMap).isDirectory()) continue;
    for (const bestand of fs.readdirSync(nicheMap)) {
      if (bestand.endsWith('.json')) uit.add(bestand.replace(/\.json$/, ''));
    }
  }
  return uit;
}

function bedrijvenVan(slug) {
  const p = path.join(WORTEL, 'data', slug, 'reviews.json');
  if (!fs.existsSync(p)) return [];
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return (Array.isArray(d) ? d : d.bedrijven || []).map((b) => b.bedrijf).filter(Boolean);
}

function staatOpPagina(slug, bedrijf) {
  const p = path.join(WORTEL, 'output', slug, 'index.html');
  if (!fs.existsSync(p)) return false;
  return fs.readFileSync(p, 'utf8').includes(bedrijf);
}

const sleutelVan = (slug, bedrijf) =>
  slug + '||' + String(bedrijf).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * De regio komt uit de link in Oliviers eigen outreach-mail; de bedrijfsnaam uit
 * die mail vergeleken met de namen in reviews.json. Levert dat niet precies één
 * naam op, dan raden we niet — dan gaat het geval naar Olivier.
 */
function bepaalBedrijf(berichten, slugs) {
  let slug = null;
  for (const b of berichten) {
    if (!VAN_OLIVIER.test(b.van)) continue;
    for (const m of b.tekst.matchAll(/keurwijzer\.be\/([a-z0-9-]+)/gi)) {
      if (slugs.has(m[1].toLowerCase())) { slug = m[1].toLowerCase(); break; }
    }
    if (slug) break;
  }
  if (!slug) return { fout: 'geen regio gevonden in de mail' };

  const outreach = berichten.filter((b) => VAN_OLIVIER.test(b.van)).map((b) => b.tekst).join('\n');
  const genormaliseerd = outreach.toLowerCase().replace(/\s+/g, ' ');
  const treffers = bedrijvenVan(slug).filter((naam) => {
    const n = naam.toLowerCase().replace(/\s+/g, ' ');
    if (genormaliseerd.includes(n)) return true;
    // Ook de omgekeerde kant: de mail schrijft "D&G Dakwerken", de data
    // "D&G Dakwerken (Brugge)".
    const kaal = n.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    return kaal.length > 6 && genormaliseerd.includes(kaal);
  });

  const langste = treffers.sort((a, b) => b.length - a.length);
  if (!langste.length) return { slug, fout: 'bedrijfsnaam niet teruggevonden in de regiodata' };
  // Meerdere treffers waarvan de een in de ander zit: neem de langste.
  const gekozen = langste[0];
  const echtAnders = langste.filter((n) => !gekozen.toLowerCase().includes(n.toLowerCase()));
  if (echtAnders.length) {
    return { slug, fout: `meerdere mogelijke bedrijven (${langste.join(', ')})` };
  }
  if (!staatOpPagina(slug, gekozen)) {
    return { slug, bedrijf: gekozen, fout: 'staat niet op de gepubliceerde pagina' };
  }
  return { slug, bedrijf: gekozen };
}

// ───────────────────────────────────────────── beoordelen

/**
 * De enige plek waar iets beslist wordt. Behoudend: alleen als het bericht van
 * het bedrijf zelf onmiskenbaar een nummer geeft, of onmiskenbaar het nummer
 * bevestigt dat Olivier voorstelde. Al de rest → naar Olivier.
 */
function beoordeel(thread, slugs, alGedaan) {
  const berichten = (thread.messages || []).map(pakBericht)
    .sort((a, b) => a.datum - b.datum);
  if (!berichten.length) return null;

  const laatste = berichten[berichten.length - 1];
  if (VAN_OLIVIER.test(laatste.van)) return null;          // wij schreven het laatst

  const vraag = [...berichten].reverse()
    .find((b) => VAN_OLIVIER.test(b.van) && /whats\s?app/i.test(b.tekst));
  if (!vraag) return null;                                  // nooit naar een nummer gevraagd

  const wie = bepaalBedrijf(berichten, slugs);
  const basis = {
    threadId: thread.id,
    afzender: (laatste.van.match(/[\w.+-]+@[\w.-]+/) || [laatste.van])[0],
    datum_mail: laatste.datum.toISOString().slice(0, 10),
    slug: wie.slug || null,
    bedrijf: wie.bedrijf || null,
  };
  if (wie.fout) return { ...basis, soort: 'aandacht', reden: wie.fout };
  if (alGedaan.has(sleutelVan(wie.slug, wie.bedrijf))) return null;   // al eerder gedaan

  const kern = kernTekst(laatste.tekst);
  const nummers = vindNummers(kern);

  if (nummers.length === 1) {
    return { ...basis, soort: 'toevoegen', nummer: nummers[0], bevestigingsgeval: false,
      citaat: kern.slice(0, 200) };
  }
  if (nummers.length > 1) {
    return { ...basis, soort: 'aandacht',
      reden: `meerdere nummers in het antwoord (${nummers.map(leesbaar).join(', ')})` };
  }

  // Geen nummer in hun tekst: is het een bevestiging van wat Olivier voorstelde?
  const voorgesteld = vindNummers(zonderCitaat(vraag.tekst));
  if (BEVESTIGING.test(kern) && voorgesteld.length === 1) {
    return { ...basis, soort: 'toevoegen', nummer: voorgesteld[0], bevestigingsgeval: true,
      citaat: kern.slice(0, 200) };
  }
  if (voorgesteld.length === 1) {
    return { ...basis, soort: 'aandacht',
      reden: `antwoord is geen duidelijke bevestiging van ${leesbaar(voorgesteld[0])} — "${kern.slice(0, 80)}"` };
  }
  // Een nummer dat alleen in de handtekening stond, of helemaal geen nummer.
  const inHeleBericht = vindNummers(zonderCitaat(laatste.tekst));
  if (inHeleBericht.length) {
    return { ...basis, soort: 'aandacht',
      reden: `nummer staat alleen in de handtekening (${inHeleBericht.map(leesbaar).join(', ')}), niet in de tekst zelf` };
  }
  return null;                                              // gewoon een antwoord zonder nummer
}

// ───────────────────────────────────────────── publiceren

function voegToe(voorstellen) {
  const d = JSON.parse(fs.readFileSync(WHATSAPP_JSON, 'utf8'));
  for (const v of voorstellen) {
    d.nummers.push({
      slug: v.slug,
      bedrijf: v.bedrijf,
      whatsapp: leesbaar(v.nummer),
      bron: 'mail',
      toestemming: `${v.datum_mail}, ${v.afzender} — ` +
        (v.bevestigingsgeval
          ? `bevestiging van het nummer dat Olivier voorstelde: "${v.citaat.replace(/\s+/g, ' ')}"`
          : `"${v.citaat.replace(/\s+/g, ' ')}"`),
    });
  }
  fs.writeFileSync(WHATSAPP_JSON, JSON.stringify(d, null, 2) + '\n');
}

function bouwEnPubliceer() {
  const uit = execFileSync('node', ['build-all.js'], {
    cwd: WORTEL, encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 32 * 1024 * 1024,
  });
  const mislukt = /FOUT: WhatsApp|faalde .* overgeslagen/i.test(uit);
  const gepubliceerd = /✓ gepubliceerd:/.test(uit);
  return { uit, mislukt, gepubliceerd };
}

async function staatLive(slug, nummer) {
  try {
    const antwoord = await haal(`https://keurwijzer.be/${slug}/`, {}, { naam: `live-controle ${slug}`, pogingen: 5, limiet: 15000 });
    return (await antwoord.text()).includes(`wa.me/${nummer}`);
  } catch { return false; }
}

// ───────────────────────────────────────────── verslag

function stelVerslagOp(toegevoegd, aandacht, storingen) {
  const datum = new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long' });
  const onderwerp = toegevoegd.length
    ? `Keurwijzer WhatsApp — ${toegevoegd.length} nummer${toegevoegd.length > 1 ? 's' : ''} toegevoegd (${datum})`
    : `Keurwijzer WhatsApp — niets nieuws (${datum})`;

  const r = ['Dag Olivier,', ''];
  if (toegevoegd.length) {
    r.push('Toegevoegd vandaag', '');
    for (const t of toegevoegd) {
      r.push(`- ${t.bedrijf} — regio ${t.slug.replace(/^dakwerkers-/, '')} — ${leesbaar(t.nummer)}`
        + ` (${t.bevestigingsgeval ? 'bevestigd door' : 'doorgegeven door'} ${t.afzender} op ${t.datum_mail})`
        + (t.live ? '' : '  ⚠ STAAT NOG NIET LIVE'));
    }
    r.push('');
    r.push(toegevoegd.every((t) => t.live)
      ? 'Alle knoppen staan live op de pagina; ik heb dat nagekeken.'
      : 'Let op: niet alles staat live. Zie de waarschuwing hierboven.');
  } else {
    r.push('Vandaag heeft geen enkel bedrijf een nieuw WhatsApp-nummer doorgegeven.');
  }
  r.push('');

  if (aandacht.length) {
    r.push('Voor jou om te bekijken', '');
    for (const a of aandacht) {
      r.push(`- ${a.bedrijf || 'onbekend bedrijf'}${a.slug ? ` (regio ${a.slug.replace(/^dakwerkers-/, '')})` : ''}`
        + ` — ${a.reden}. Mail van ${a.afzender} op ${a.datum_mail}.`);
    }
    r.push('');
    r.push('Deze heb ik met opzet niet zelf toegevoegd: bij twijfel publiceer ik niets.');
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
    const env = leesEnv();
    for (const nodig of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN']) {
      if (!env[nodig]) {
        console.error(`\n✗ ${nodig} ontbreekt in .env.\n  Draai eerst:  node scripts/google-toegang.js\n`);
        process.exit(2);
      }
    }

    log(`— WhatsApp-routine ${VANDAAG}${DROOG ? ' (DROOG — er wordt niets gewijzigd)' : ''}`);
    sleutel = await verseSleutel(env);

    const ids = await zoekThreadIds(sleutel);
    log(`  ${ids.length} gesprekken om na te kijken`);

    const slugs = bekendeSlugs();
    const alGedaan = new Set(
      JSON.parse(fs.readFileSync(WHATSAPP_JSON, 'utf8')).nummers.map((n) => sleutelVan(n.slug, n.bedrijf))
    );

    const toevoegen = [];
    const aandacht = [];
    for (const id of ids) {
      let thread;
      try { thread = await haalThread(sleutel, id); }
      catch (e) { storingen.push(`gesprek ${id} kon niet opgehaald worden: ${e.message}`); continue; }
      const oordeel = beoordeel(thread, slugs, alGedaan);
      if (!oordeel) continue;
      if (oordeel.soort === 'toevoegen') {
        // Twee bedrijven in één ronde mogen elkaar niet dubbelen.
        if (toevoegen.some((t) => sleutelVan(t.slug, t.bedrijf) === sleutelVan(oordeel.slug, oordeel.bedrijf))) continue;
        toevoegen.push(oordeel);
        log(`  + ${oordeel.bedrijf} (${oordeel.slug}) — ${leesbaar(oordeel.nummer)}`);
      } else {
        aandacht.push(oordeel);
        log(`  ? ${oordeel.bedrijf || 'onbekend'} — ${oordeel.reden}`);
      }
    }

    if (DROOG) {
      log(`\nDROOG: zou ${toevoegen.length} nummer(s) toevoegen en ${aandacht.length} geval(len) melden.`);
      log('Er is niets gewijzigd, gebouwd, gepubliceerd of gemaild.');
      schrijfLog();
      return;
    }

    if (toevoegen.length) {
      voegToe(toevoegen);
      log(`  ${toevoegen.length} nummer(s) in data/whatsapp.json gezet — bouwen en publiceren...`);
      const bouw = bouwEnPubliceer();
      if (bouw.mislukt) storingen.push('de build meldde een fout; controleer reports/whatsapp-routine.log');
      if (!bouw.gepubliceerd) storingen.push('de build heeft niet gepubliceerd');
      for (const t of toevoegen) {
        t.live = await staatLive(t.slug, t.nummer);
        if (!t.live) storingen.push(`${t.bedrijf} staat na publicatie niet live op /${t.slug}/`);
      }
    }

    const { onderwerp, tekst } = stelVerslagOp(toevoegen, aandacht, storingen);
    await verstuurMail(sleutel, onderwerp, tekst);
    log(`  verslag gemaild: "${onderwerp}"`);

    fs.writeFileSync(MARKERING, JSON.stringify({
      datum: VANDAAG,
      status: 'gepubliceerd',
      gemaild: true,
      toegevoegd: toevoegen.map(({ threadId, citaat, ...rest }) => rest),
      aandacht: aandacht.map((a) => `${a.bedrijf || 'onbekend'}: ${a.reden}`),
      storingen,
    }, null, 2) + '\n');

    log('— klaar');
    schrijfLog();
  } catch (e) {
    log(`✗ AFGEBROKEN: ${e.message}`);
    schrijfLog();
    // Een storing mag nooit stil blijven. Lukt zelfs mailen niet meer, dan blijft
    // het logboek over en blijft het dagverslag uit — ook dat is een signaal.
    if (sleutel) {
      try {
        await verstuurMail(sleutel, 'Keurwijzer WhatsApp — ROUTINE AFGEBROKEN',
          `Dag Olivier,\n\nDe WhatsApp-routine is vandaag afgebroken met deze fout:\n\n  ${e.message}\n\n`
          + `Er is mogelijk niets gepubliceerd. Laat dit nakijken.\n\nGroeten,\nKeurwijzer`);
      } catch { /* dan rest alleen het logboek */ }
    }
    process.exit(1);
  }
}

// Alleen draaien als dit script rechtstreeks wordt aangeroepen. Wordt het
// ingelezen (door de test), dan komen enkel de functies beschikbaar.
if (require.main === module) hoofdlijn();

module.exports = { kernTekst, zonderCitaat, vindNummers, normaliseer, leesbaar, beoordeel, BEVESTIGING };
