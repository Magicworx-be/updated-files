#!/usr/bin/env node
// =====================================================================
// scripts/outreach-dashboard.js — het logboek als leesbaar overzicht
//
// Maakt reports/outreach-dashboard.html: één bestand dat je dubbelklikt.
// Geen server, geen internet, geen bibliotheken van buiten — het bestand
// bevat alles wat het nodig heeft. Dat is bewust: er staan mailadressen en
// contactgegevens van bedrijven in, dus het hoort op de laptop te blijven en
// niet op een gehoste pagina of in een publieke repo (het staat om die reden
// in .gitignore, net als data/outreach.json zelf).
//
// Het dashboard rekent NIETS uit wat het logboek niet weet. Wat er niet in
// staat, staat er als "onbekend" — geen schattingen, geen afgeleide percentages
// over historische rijen waarvan we de details niet hebben.
//
// Gebruik:  node scripts/outreach-dashboard.js
//           node scripts/outreach-dashboard.js --open   (en meteen tonen)
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const outreach = require('../lib/outreach');

const ROOT = path.join(__dirname, '..');
const UIT = path.join(ROOT, 'reports', 'outreach-dashboard.html');

const argv = process.argv.slice(2);
const meteenOpenen = argv.includes('--open');

const vandaag = outreach.vandaagISO();

const { bestaat, bijgewerkt, rijen, fouten } = outreach.load(ROOT);
if (!bestaat) {
  console.error('\nFOUT: data/outreach.json bestaat nog niet.' +
    '\nLeg het eerst aan:  node scripts/outreach-seed.js\n');
  process.exit(1);
}
if (fouten.length) {
  console.error('\nFOUT: het logboek is niet in orde:\n  - ' + fouten.join('\n  - ') + '\n');
  process.exit(1);
}

// ── De toestand van één bedrijf, in één woord ───────────────────────────
// De volgorde is de rangorde: het eerste dat waar is, wint. Zo krijgt elk
// bedrijf precies één toestand en tellen de tegels samen op tot het totaal.
function toestand(r) {
  if (r.optOut) return 'optout';
  if (r.whatsapp.nummer) return 'nummer';
  if (r.badge.gevraagdOp && !r.badge.geplaatstOp) return 'badge-open';
  if (r.antwoord && r.antwoord.soort !== 'autoresponder' && r.antwoord.soort !== 'onbekend') return 'antwoord';
  if (r.mail1.verstuurdOp || r.historisch) return 'stil';
  if (r.mail1.draftOp) return 'draft';
  return 'nieuw';
}

const TOESTANDEN = {
  nieuw:        { label: 'Nog niet benaderd', kleur: 'var(--muted)' },
  draft:        { label: 'Draft klaar',       kleur: 'var(--s2)' },
  stil:         { label: 'Gemaild, stil',     kleur: 'var(--s1)' },
  antwoord:     { label: 'Antwoord',          kleur: 'var(--s3)' },
  'badge-open': { label: 'Badge beloofd',     kleur: 'var(--s2)' },
  nummer:       { label: 'WhatsApp live',     kleur: 'var(--s3)' },
  optout:       { label: 'Wil niet',          kleur: 'var(--muted)' },
};

const REGIO = (slug) => slug.replace(/^dakwerkers-/, '').replace(/-/g, ' ');

// ── Cijfers ─────────────────────────────────────────────────────────────
const opvolgOpen = outreach.opvolgKandidaten(rijen, vandaag);
const nummerBeloofd = outreach.wachtOpNummer(rijen);
const badgeOpen = outreach.badgeBeloofd(rijen);

const tegels = [
  { getal: rijen.length, label: 'bedrijven op Keurwijzer',
    hint: 'alle gepubliceerde bedrijven, over ' + new Set(rijen.map(r => r.slug)).size + ' regio\'s' },
  { getal: rijen.filter(r => r.historisch).length, label: 'al benaderd vóór het logboek',
    hint: 'gemaild in de weken vóór 8 september 2026 — details staan alleen in Gmail' },
  { getal: rijen.filter(r => outreach.magMail1(r)).length, label: 'nog te benaderen',
    hint: 'krijgen mail 1 in de volgende ronde' },
  { getal: rijen.filter(r => r.antwoord && r.antwoord.soort !== 'autoresponder' && r.antwoord.soort !== 'onbekend').length,
    label: 'antwoord gekregen', hint: 'echte antwoorden die het logboek gezien heeft; autoresponders tellen niet mee' },
  { getal: rijen.filter(r => r.whatsapp.nummer).length, label: 'WhatsApp-nummer live',
    hint: 'staat als knop op de regiopagina' },
  { getal: badgeOpen.length, label: 'badge beloofd, nog niet geplaatst',
    hint: 'gevraagd maar nog niet op hun eigen site gezien; gelogd vanaf 8 september 2026' },
  { getal: opvolgOpen.length, label: 'opvolgmail open',
    hint: 'meer dan drie werkdagen stil na mail 1; historische rijen tellen niet mee' },
  { getal: rijen.filter(r => r.zelfAfhandelen).length, label: 'gesprekken die Olivier zelf voert',
    hint: 'de mailrondes maken hier nooit een draft; stond vroeger als thread-ID in vier promptbestanden' },
  { getal: rijen.filter(r => r.optOut).length, label: 'wil niet meer gemaild',
    hint: 'permanent; op 4 september 2026 stond er in de hele mailbox geen enkele' },
];

// Per regio.
const perRegio = [...new Set(rijen.map(r => r.slug))].sort().map(slug => {
  const rr = rijen.filter(r => r.slug === slug);
  const telling = {};
  for (const k of Object.keys(TOESTANDEN)) telling[k] = rr.filter(r => toestand(r) === k).length;
  return { slug, regio: REGIO(slug), aantal: rr.length, telling };
});

// ── HTML ────────────────────────────────────────────────────────────────
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const datumOf = (w) => w ? esc(w) : '<span class="leeg">—</span>';

// Het WhatsApp-nummer als klikbare link naar WhatsApp Desktop.
//
// Het nummer staat genormaliseerd in het logboek ("32475123456", zie
// lib/whatsapp.js). Hier tonen we het zoals een Belg het schrijft — 0475 12 34 56 —
// want dit dashboard leest een mens, geen machine.
//
// `whatsapp://send?phone=` opent de geïnstalleerde WhatsApp Desktop meteen in het
// gesprek met dat nummer. Bewust NIET `wa.me`: dat gaat eerst langs de browser en
// WhatsApp Web, en dat is een omweg van twee klikken. Op de publieke pagina blijft
// wa.me wél de juiste keuze — daar weet je niet wat de bezoeker geïnstalleerd heeft.
// Staat WhatsApp niet geïnstalleerd, dan gebeurt er bij het klikken niets.
function waLink(nummer) {
  const cijfers = String(nummer).replace(/\D/g, '');
  const leesbaar = /^32\d{9}$/.test(cijfers)
    ? '0' + cijfers.slice(2, 5) + ' ' + cijfers.slice(5, 7) + ' ' + cijfers.slice(7, 9) + ' ' + cijfers.slice(9)
    : '+' + cijfers;
  return '<a class="wa" href="whatsapp://send?phone=' + esc(cijfers) + '"' +
    ' title="Opent WhatsApp Desktop in het gesprek met ' + esc(leesbaar) + '">' + esc(leesbaar) + '</a>';
}

function balk(telling, totaal) {
  // Eén staaf per regio, opgedeeld in toestanden. 2px tussenruimte tussen de
  // stukken, zoals de mark-specs voorschrijven, zodat de grenzen leesbaar
  // blijven ook als twee kleuren dicht bij elkaar liggen.
  const stukken = Object.keys(TOESTANDEN)
    .filter(k => telling[k] > 0)
    .map(k => '<span class="stuk" style="flex:' + telling[k] +
      ';background:' + TOESTANDEN[k].kleur + '" title="' + esc(TOESTANDEN[k].label) +
      ': ' + telling[k] + ' van ' + totaal + '"></span>').join('');
  return '<span class="balk">' + stukken + '</span>';
}

const rijHtml = (r) => {
  const t = toestand(r);
  return '<tr data-toestand="' + t + '" data-zoek="' +
    esc((r.bedrijf + ' ' + REGIO(r.slug) + ' ' + (r.email || '') + ' ' + (r.whatsapp.nummer || '') + (r.zelfAfhandelen ? ' olivier zelf' : '') + (r.historisch ? ' historisch' : '')).toLowerCase()) + '">' +
    '<td class="naam">' + esc(r.bedrijf) +
      (r.historisch ? ' <span class="vlag" title="Benaderd vóór het logboek bestond; details staan alleen in Gmail">historisch</span>' : '') +
      (r.zelfAfhandelen ? ' <span class="vlag zelf" title="Olivier voert dit gesprek zelf — de mailrondes maken hier nooit een draft">Olivier zelf</span>' : '') +
    '</td>' +
    '<td>' + esc(REGIO(r.slug)) + '</td>' +
    '<td><span class="stip" style="background:' + TOESTANDEN[t].kleur + '"></span>' + esc(TOESTANDEN[t].label) + '</td>' +
    '<td>' + datumOf(r.mail1.verstuurdOp) + '</td>' +
    '<td>' + (r.antwoord ? esc(r.antwoord.datum) + ' <span class="soort">' + esc(r.antwoord.soort) + '</span>' : '<span class="leeg">—</span>') + '</td>' +
    '<td>' + datumOf(r.opvolg1.verstuurdOp) + '</td>' +
    '<td>' + (r.whatsapp.nummer ? waLink(r.whatsapp.nummer) : '<span class="leeg">—</span>') + '</td>' +
    '<td>' + (r.badge.geplaatstOp ? '<span class="ja">geplaatst</span>'
              : r.badge.gevraagdOp ? '<span class="wacht">beloofd</span>' : '<span class="leeg">—</span>') + '</td>' +
    '</tr>';
};

const html = `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Keurwijzer — outreach</title>
<style>
  :root {
    color-scheme: light;
    --surface: #fcfcfb; --kaart: #ffffff; --rand: #e4e3de;
    --ink: #0b0b0b; --ink2: #52514e; --muted: #9a9891;
    --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --surface: #1a1a19; --kaart: #232322; --rand: #3a3a38;
      --ink: #ffffff; --ink2: #c3c2b7; --muted: #85847c;
      --s1: #3987e5; --s2: #d95926; --s3: #199e70;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px 24px 64px;
    background: var(--surface); color: var(--ink);
    font: 15px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif;
  }
  .breed { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .onderkop { color: var(--ink2); margin: 0 0 28px; font-size: 14px; }

  .tegels { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); margin-bottom: 32px; }
  .tegel { background: var(--kaart); border: 1px solid var(--rand); border-radius: 10px; padding: 16px 18px; }
  .tegel .getal { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }
  .tegel .label { font-size: 13px; color: var(--ink); margin-top: 2px; }
  .tegel .hint { font-size: 12px; color: var(--muted); margin-top: 6px; }

  h2 { font-size: 15px; margin: 32px 0 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink2); }

  .kaart { background: var(--kaart); border: 1px solid var(--rand); border-radius: 10px; overflow: hidden; }
  .schuif { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  th { text-align: left; font-weight: 600; color: var(--ink2); padding: 10px 14px; border-bottom: 1px solid var(--rand); white-space: nowrap; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 9px 14px; border-bottom: 1px solid var(--rand); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  .naam { font-weight: 500; }
  .leeg { color: var(--muted); }
  .soort, .vlag { font-size: 11px; padding: 1px 6px; border-radius: 20px; border: 1px solid var(--rand); color: var(--ink2); white-space: nowrap; }
  .vlag.zelf { border-color: var(--s2); color: var(--s2); }
  .ja { color: var(--s3); font-weight: 600; }
  .wa { color: var(--s3); font-weight: 600; text-decoration: none; white-space: nowrap;
        border-bottom: 1px dotted var(--s3); }
  .wa:hover { border-bottom-style: solid; }
  .wacht { color: var(--s2); font-weight: 600; }
  .stip { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; vertical-align: baseline; }

  .balk { display: flex; gap: 2px; height: 10px; min-width: 130px; border-radius: 4px; overflow: hidden; }
  .stuk { display: block; }

  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 12px; }
  input[type="search"] { flex: 1 1 220px; min-width: 200px; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--rand); background: var(--kaart); color: var(--ink); font: inherit; font-size: 14px; }
  .knop { padding: 7px 12px; border-radius: 999px; border: 1px solid var(--rand); background: var(--kaart); color: var(--ink2); font: inherit; font-size: 13px; cursor: pointer; }
  .knop[aria-pressed="true"] { background: var(--ink); color: var(--surface); border-color: var(--ink); }
  .telling { color: var(--muted); font-size: 13px; margin-left: auto; }

  .voet { margin-top: 36px; color: var(--muted); font-size: 12.5px; line-height: 1.6; }
  .voet code { background: var(--kaart); border: 1px solid var(--rand); padding: 1px 5px; border-radius: 4px; }
</style>
</head>
<body>
<div class="breed">

  <h1>Keurwijzer — outreach</h1>
  <p class="onderkop">Gemaakt op ${esc(vandaag)} · logboek bijgewerkt ${esc(bijgewerkt || 'onbekend')} · ${rijen.length} bedrijven</p>

  <div class="tegels">
    ${tegels.map(t => `<div class="tegel">
      <div class="getal">${t.getal}</div>
      <div class="label">${esc(t.label)}</div>
      <div class="hint">${esc(t.hint)}</div>
    </div>`).join('\n    ')}
  </div>

  <h2>Per regio</h2>
  <div class="kaart schuif">
    <table>
      <thead><tr><th>Regio</th><th>Bedrijven</th><th style="width:38%">Verdeling</th><th>Antwoord</th><th>WhatsApp</th><th>Stil</th></tr></thead>
      <tbody>
        ${perRegio.map(g => `<tr>
          <td class="naam">${esc(g.regio)}</td>
          <td>${g.aantal}</td>
          <td>${balk(g.telling, g.aantal)}</td>
          <td>${g.telling.antwoord || '<span class="leeg">—</span>'}</td>
          <td>${g.telling.nummer || '<span class="leeg">—</span>'}</td>
          <td>${g.telling.stil || '<span class="leeg">—</span>'}</td>
        </tr>`).join('\n        ')}
      </tbody>
    </table>
  </div>

  <h2>Alle bedrijven</h2>
  <div class="filters">
    <input type="search" id="zoek" placeholder="Zoek op bedrijf, regio of mailadres…" aria-label="Zoeken">
    <button class="knop" data-filter="alle" aria-pressed="true">Alle</button>
    ${Object.entries(TOESTANDEN).map(([k, v]) =>
      `<button class="knop" data-filter="${k}" aria-pressed="false">${esc(v.label)}</button>`).join('\n    ')}
    <span class="telling" id="telling"></span>
  </div>
  <div class="kaart schuif">
    <table id="tabel">
      <thead><tr><th>Bedrijf</th><th>Regio</th><th>Toestand</th><th>Mail 1</th><th>Antwoord</th><th>Opvolging</th><th>WhatsApp</th><th>Badge</th></tr></thead>
      <tbody>
        ${rijen.slice().sort((a, b) => a.slug.localeCompare(b.slug, 'nl') || a.bedrijf.localeCompare(b.bedrijf, 'nl')).map(rijHtml).join('\n        ')}
      </tbody>
    </table>
  </div>

  <p class="voet">
    <strong>historisch</strong> = benaderd vóór het logboek bestond (vóór 8 september 2026). Toen werden de mails met de hand
    geschreven en veranderde de onderwerpregel meermaals; het logboek weet dát ze benaderd zijn, niet wanneer of met welk
    resultaat. Die details staan alleen nog in Gmail. Ze krijgen daarom nooit opnieuw een kennismakingsmail.<br>
    Bijwerken: <code>node scripts/outreach-seed.js</code> — daarna <code>node scripts/outreach-dashboard.js</code>.
    Dit bestand en het logboek staan bewust niet in git: er staan bedrijfsgegevens in.
  </p>
</div>

<script>
  // Filteren gebeurt in de browser op rijen die er al staan — geen server, en
  // het werkt dus ook als je het bestand naar een stick kopieert.
  var zoek = document.getElementById('zoek');
  var tellingEl = document.getElementById('telling');
  var rijen = Array.prototype.slice.call(document.querySelectorAll('#tabel tbody tr'));
  var knoppen = Array.prototype.slice.call(document.querySelectorAll('.knop'));
  var actief = 'alle';

  function pas() {
    var term = zoek.value.trim().toLowerCase();
    var zichtbaar = 0;
    rijen.forEach(function (tr) {
      var okFilter = actief === 'alle' || tr.dataset.toestand === actief;
      var okZoek = !term || tr.dataset.zoek.indexOf(term) !== -1;
      var toon = okFilter && okZoek;
      tr.hidden = !toon;
      if (toon) zichtbaar++;
    });
    tellingEl.textContent = zichtbaar + ' van ' + rijen.length + ' bedrijven';
  }

  knoppen.forEach(function (k) {
    k.addEventListener('click', function () {
      actief = k.dataset.filter;
      knoppen.forEach(function (b) { b.setAttribute('aria-pressed', String(b === k)); });
      pas();
    });
  });
  zoek.addEventListener('input', pas);
  pas();
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(UIT), { recursive: true });
fs.writeFileSync(UIT, html, 'utf8');
console.log('\nDashboard geschreven: ' + path.relative(ROOT, UIT));
console.log('Dubbelklik het bestand, of: node scripts/outreach-dashboard.js --open\n');

if (meteenOpenen) {
  // Windows: `start` zit in cmd, niet als eigen programma.
  execFile('cmd', ['/c', 'start', '', UIT], (err) => {
    if (err) console.error('Openen mislukte — dubbelklik het bestand zelf. (' + err.message + ')');
  });
}
