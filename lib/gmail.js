// =====================================================================
// lib/gmail.js — de mailbox lezen en één mail versturen, zonder taalmodel
//
// WAAROM DIT BESTAAT
//
// scripts/whatsapp-routine.js las de mailbox al zelf: sleutel vernieuwen,
// threads zoeken, berichten uitpakken, een verslag mailen. Toen daar op
// 4 september 2026 een tweede programma bij kwam (scripts/whatsapp-nabericht.js)
// stond dat werk op het punt gekopieerd te worden. Twee kopieën van dezelfde
// netwerkcode betekent dat een verbetering aan de ene stilzwijgend langs de
// andere gaat — en juist die code moet betrouwbaar zijn, want ze draait
// onbemand.
//
// Alles hier is mechanisch: geen enkele functie beslist iets. Wat een bericht
// betekent, staat in het script dat deze module gebruikt.
//
// DE HARDE TIJDSLIMIET IS DE KERN
//
// Op 2 september 2026 bleef een Gmail-opdracht hangen en viel een hele
// avondronde stil, zonder foutmelding. Sindsdien geldt: geen enkele oproep mag
// oneindig wachten. `haal()` breekt af, probeert opnieuw, en faalt daarna hard.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

// ── .env ────────────────────────────────────────────────────────────────

function leesEnv(wortel) {
  const uit = {};
  let ruw = '';
  try { ruw = fs.readFileSync(path.join(wortel, '.env'), 'utf8'); }
  catch { return uit; }
  for (const regel of ruw.split(/\r?\n/)) {
    const m = regel.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) uit[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return uit;
}

// De drie sleutels die elk onbemand script nodig heeft. Ontbreekt er een, dan
// stopt het script met een uitleg in plaats van met een netwerkfout.
const NODIG = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];

function keurEnv(env) {
  return NODIG.filter((n) => !env[n]);
}

// ── netwerk met tijdslimiet ─────────────────────────────────────────────

/**
 * fetch met een harde tijdslimiet en herhalingen. Geen enkele oproep mag ooit
 * blijven hangen; dat is precies wat de oude routine deed vastlopen.
 *
 * `log` is optioneel: zonder logger blijft een mislukte poging stil, maar een
 * mislukte reeks faalt altijd hard.
 */
async function haal(url, opties = {}, { pogingen = 3, limiet = 20000, naam = 'oproep', log = null } = {}) {
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
      if (log) log(`  ⚠ ${naam}: poging ${poging} van ${pogingen} mislukt (${oorzaak})`);
      if (poging < pogingen) await new Promise((r) => setTimeout(r, 1500 * poging));
    }
  }
  throw new Error(`${naam} bleef mislukken: ${laatsteFout && laatsteFout.message}`);
}

// ── Gmail ───────────────────────────────────────────────────────────────

async function verseSleutel(env, opties = {}) {
  const antwoord = await haal('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  }, { naam: 'Google-sleutel vernieuwen', ...opties });
  const data = await antwoord.json();
  if (!data.access_token) {
    throw new Error('Google gaf geen toegangssleutel: ' + JSON.stringify(data));
  }
  return data.access_token;
}

function gmailKop(sleutel) {
  return { Authorization: `Bearer ${sleutel}`, 'Content-Type': 'application/json' };
}

async function zoekThreadIds(sleutel, zoekopdrachten, opties = {}) {
  const ids = new Set();
  for (const q of zoekopdrachten) {
    const url = 'https://gmail.googleapis.com/gmail/v1/users/me/threads?'
      + new URLSearchParams({ q, maxResults: '100' });
    const antwoord = await haal(url, { headers: gmailKop(sleutel) }, { naam: 'threads zoeken', ...opties });
    const data = await antwoord.json();
    for (const t of data.threads || []) ids.add(t.id);
  }
  return [...ids];
}

/**
 * Let op: haal élke thread volledig op. De zoekopdracht dient alleen om
 * kandidaten te VINDEN, nooit om te beoordelen wat erin staat — die lijst kan
 * berichten weglaten. Op 1 september 2026 ontbrak zo het antwoord van DWG
 * Projects, met een gemist nummer tot gevolg.
 */
async function haalThread(sleutel, id, opties = {}) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?format=full`;
  const antwoord = await haal(url, { headers: gmailKop(sleutel) }, { naam: `thread ${id}`, ...opties });
  return antwoord.json();
}

async function verstuurMail(sleutel, naar, onderwerp, tekst, opties = {}) {
  const rfc822 = [
    `To: ${naar}`,
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
  }, { naam: 'mail versturen', ...opties });
  if (!antwoord.ok) throw new Error('mail versturen mislukte: HTTP ' + antwoord.status);
  return antwoord.json();
}

// ── een bericht uitpakken ───────────────────────────────────────────────

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
    naar: kop(bericht, 'To'),
    datum: new Date(Number(bericht.internalDate)),
    tekst: platteTekst(bericht.payload),
  };
}

// Alle berichten van een thread, op tijd gesorteerd.
function berichtenVan(thread) {
  return (thread.messages || []).map(pakBericht).sort((a, b) => a.datum - b.datum);
}

const VAN_OLIVIER = /olivier@magicworx\.net/i;

module.exports = {
  NODIG, leesEnv, keurEnv, haal,
  verseSleutel, gmailKop, zoekThreadIds, haalThread, verstuurMail,
  decodeer, platteTekst, kop, pakBericht, berichtenVan, VAN_OLIVIER,
};
