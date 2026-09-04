#!/usr/bin/env node
// =====================================================================
// scripts/marktbeeld.js — het marktrapport van één regio
//
// Maakt reports/<slug>/<slug>-marktbeeld.html: één bestand dat je dubbelklikt,
// met wat de openbare Google-reviews zeggen over de MARKT waarin een vak in een
// regio werkt. Omvang, reviewvolume, sterren, activiteit, groei, seizoen en
// spreiding over de gemeenten.
//
// WAAROM DIT VEILIG IS OM TE DELEN — en waarom dat zo moet blijven.
// Anders dan de twee andere bestanden in reports/<slug>/ (het controlerapport
// en het prospectiedocument) is dít rapport wél bedoeld om buiten de deur te
// gaan. Dat kan om precies één reden: er staat geen enkel bedrijf in. Alles is
// geaggregeerd — tellingen, medianen, verdelingen. Daardoor kan het rapport de
// positie van niemand beïnvloeden en raakt het geen van de twee gemeten inputs
// van de methodiek (de Google-reviews en de eigen website van een bedrijf).
//
//   Zet hier dus NOOIT bedrijfsnamen, adressen, mailadressen of losse scores
//   in, ook niet "even" voor intern gebruik. Dan is het rapport niet langer
//   deelbaar en verliest het meteen zijn hele bestaansreden.
//
// De drempels (minimaal aantal reviews, minimaal aantal recente) worden NIET
// hier opgeschreven maar uit lib/rekenkern.js gehaald. Verandert de methodiek,
// dan verandert dit rapport mee — er is geen tweede plek waar die getallen
// staan en dus niets dat uit de pas kan lopen.
//
// Het rapport leest alleen; het schrijft niets in data/ en publiceert niets.
//
// Gebruik:
//   node scripts/marktbeeld.js dakwerkers-gent
//   node scripts/marktbeeld.js dakwerkers-gent --open    (en meteen tonen)
//   node scripts/marktbeeld.js --alle                    (elke regio met data)
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { MIN_REVIEWS, MIN_RECENT } = require('../lib/rekenkern');
const { loadPlannedRegions, regioSlugFrom } = require('../lib/registry');

const ROOT = path.join(__dirname, '..');

// Hoeveel gemeenten een regio écht telt, uit regions.txt — de bindende lijst met
// de officiële fusienamen. NIET uit config.gemeenten: daar staan bewust álle
// schrijfwijzen in (fusienaam, oude namen én deelgemeenten), omdat die lijst
// vergelijkt met wat Google in het adres schrijft. Voor Gent zijn dat er 26
// tegenover 9 echte gemeenten. Zie CLAUDE.md § De drie gemeentelijsten.
function officieelAantalGemeenten(config) {
  const slug = regioSlugFrom(config);
  const regio = loadPlannedRegions(ROOT).find((r) => r.regioSlug === slug);
  return regio ? regio.gemeenten : null;
}

// ---------------------------------------------------------------------
// Kleine hulpjes
// ---------------------------------------------------------------------
const nl = (n) => Number(n).toLocaleString('nl-BE');
const dec = (n, k = 1) => Number(n).toFixed(k).replace('.', ',');
const pct = (deel, geheel, k = 0) => (geheel ? dec((deel / geheel) * 100, k) : '0');

function mediaan(getallen) {
  if (!getallen.length) return 0;
  const s = [...getallen].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function kwantiel(getallen, p) {
  if (!getallen.length) return 0;
  const s = [...getallen].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

// Verdeling over schijven: [{ label, aantal }], plus de hoogste telling zodat
// de staven in de HTML op één schaal staan.
function verdeling(waarden, schijven) {
  const rijen = schijven.map(([label, test]) => ({ label, aantal: waarden.filter(test).length }));
  return { rijen, max: Math.max(1, ...rijen.map((r) => r.aantal)) };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------------
// De config van een slug opzoeken. We scannen config/*/ in plaats van de
// niche uit de slug te snijden: regionamen bevatten zelf streepjes
// (dakwerkers-veurne-diksmuide), dus afsnijden op het eerste streepje werkt
// wel, maar breekt zodra er ooit een niche met een streepje bij komt.
// ---------------------------------------------------------------------
function vindConfig(slug) {
  const configDir = path.join(ROOT, 'config');
  for (const niche of fs.readdirSync(configDir)) {
    const p = path.join(configDir, niche, slug + '.json');
    if (fs.existsSync(p)) return { niche, pad: p, config: JSON.parse(fs.readFileSync(p, 'utf8')) };
  }
  return null;
}

function alleSlugs() {
  const configDir = path.join(ROOT, 'config');
  const uit = [];
  for (const niche of fs.readdirSync(configDir)) {
    const dir = path.join(configDir, niche);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const slug = f.slice(0, -5);
      if (fs.existsSync(path.join(ROOT, 'data', slug, 'reviews.json'))) uit.push(slug);
    }
  }
  return uit.sort();
}

// =====================================================================
// DE BEREKENING — leest niets van schijf, zodat ze los te testen valt.
// =====================================================================
function bereken(bedrijvenRuw, config, gepubliceerd, gemeentenOfficieel) {
  const inFilter = new Set((config.gemeenten || []).map((g) => g.toLowerCase()));
  const B = bedrijvenRuw.filter((b) => inFilter.has(String(b.gemeente || '').toLowerCase()));
  const peildatum = config.peildatum;
  const peilJaar = Number(String(peildatum).slice(0, 4));

  // Een export is afgekapt als er minder reviews zijn opgehaald dan Google er
  // volgens de plaatsgegevens heeft. Die bedrijven tellen wél mee in het
  // volume (googleReviews is het echte totaal) maar niet in de tijdreeksen,
  // want daar zou hun ontbrekende verleden de oudere jaren platdrukken.
  const isAfgekapt = (b) => b.reviews.length < b.googleReviews;
  const volledig = B.filter((b) => !isAfgekapt(b));
  const afgekapt = B.length - volledig.length;

  // --- omvang -------------------------------------------------------
  const genoegReviews = B.filter((b) => b.googleReviews >= MIN_REVIEWS).length;
  const genoegRecent = B.filter((b) => b.recent24 >= MIN_RECENT).length;
  const rankbaar = B.filter((b) => b.googleReviews >= MIN_REVIEWS && b.recent24 >= MIN_RECENT).length;

  // --- reviewvolume -------------------------------------------------
  const volumes = B.map((b) => b.googleReviews);
  const totaalReviews = volumes.reduce((a, c) => a + c, 0);
  const aflopend = [...volumes].sort((a, b) => b - a);
  const som = (arr) => arr.reduce((a, c) => a + c, 0);
  const aandeelTop = (n) => (totaalReviews ? som(aflopend.slice(0, n)) / totaalReviews * 100 : 0);
  const helft = Math.ceil(B.length / 2);

  const volumeVerdeling = verdeling(volumes, [
    ['0 &ndash; 4', (v) => v < 5],
    ['5 &ndash; 9', (v) => v >= 5 && v < 10],
    ['10 &ndash; 24', (v) => v >= 10 && v < 25],
    ['25 &ndash; 49', (v) => v >= 25 && v < 50],
    ['50 &ndash; 99', (v) => v >= 50 && v < 100],
    ['100 of meer', (v) => v >= 100],
  ]);

  // --- sterren (alleen wie de reviewdrempel haalt) -------------------
  const beoordeelbaar = B.filter((b) => b.googleReviews >= MIN_REVIEWS);
  const sterVerdeling = verdeling(beoordeelbaar.map((b) => b.googleScore), [
    ['5,0', (s) => s >= 4.95],
    ['4,8 &ndash; 4,9', (s) => s >= 4.75 && s < 4.95],
    ['4,5 &ndash; 4,7', (s) => s >= 4.45 && s < 4.75],
    ['4,0 &ndash; 4,4', (s) => s >= 3.95 && s < 4.45],
    ['onder 4,0', (s) => s < 3.95],
  ]);
  const perfect = beoordeelbaar.filter((b) => b.googleScore >= 4.95).length;
  const perfectStevig = B.filter((b) => b.googleReviews >= 25 && b.googleScore >= 4.95).length;

  // --- activiteit ---------------------------------------------------
  const recent = B.map((b) => b.recent24);
  const activiteitVerdeling = verdeling(recent, [
    ['geen enkele', (v) => v === 0],
    ['1 &ndash; 2', (v) => v >= 1 && v < 3],
    ['3 &ndash; 9', (v) => v >= 3 && v < 10],
    ['10 of meer', (v) => v >= 10],
  ]);
  const stil = recent.filter((v) => v === 0).length;
  const traag = recent.filter((v) => v < MIN_RECENT).length;

  // --- groei per jaar -----------------------------------------------
  const perJaar = {};
  const perMaand = {};
  let zonderTekst = 0;
  let opgehaald = 0;
  let oudste = null;
  for (const b of volledig) {
    for (const r of b.reviews) {
      const d = String(r.datum || '');
      if (!d) continue;
      perJaar[d.slice(0, 4)] = (perJaar[d.slice(0, 4)] || 0) + 1;
      perMaand[d.slice(5, 7)] = (perMaand[d.slice(5, 7)] || 0) + 1;
    }
  }
  for (const b of B) {
    for (const r of b.reviews) {
      opgehaald++;
      if (!String(r.tekst || '').trim()) zonderTekst++;
      const d = String(r.datum || '');
      if (d && (!oudste || d < oudste)) oudste = d;
    }
  }

  // Het lopende jaar is nooit compleet. We tonen wat er staat én, gearceerd,
  // wat het bij gelijk tempo zou worden — nooit als feit, altijd als raming.
  const jaarStart = new Date(peilJaar + '-01-01');
  const verstreken = Math.max(0.02, Math.min(1, (new Date(peildatum) - jaarStart) / (365 * 864e5)));
  const dit = perJaar[String(peilJaar)] || 0;
  const raming = verstreken < 0.97 ? Math.round(dit / verstreken) : null;
  const vorig = perJaar[String(peilJaar - 1)] || 0;

  const jaren = Object.keys(perJaar)
    .map(Number).filter((j) => j >= peilJaar - 8 && j <= peilJaar).sort();
  const jaarMax = Math.max(1, raming || 0, ...jaren.map((j) => perJaar[String(j)]));

  // --- seizoen ------------------------------------------------------
  const maandNamen = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const maandTotaal = Object.values(perMaand).reduce((a, c) => a + c, 0);
  const maanden = maandNamen.map((naam, i) => {
    const sleutel = String(i + 1).padStart(2, '0');
    const aantal = perMaand[sleutel] || 0;
    return { naam, aantal, aandeel: maandTotaal ? aantal / maandTotaal * 100 : 0 };
  });
  const maandMax = maanden.reduce((a, m) => (m.aandeel > a.aandeel ? m : a), maanden[0]);
  const maandMin = maanden.reduce((a, m) => (m.aandeel < a.aandeel ? m : a), maanden[0]);

  // --- gemeenten ----------------------------------------------------
  const perGemeente = {};
  for (const b of B) (perGemeente[b.gemeente] = perGemeente[b.gemeente] || []).push(b);
  const gemeenten = Object.entries(perGemeente)
    .map(([naam, lijst]) => ({
      naam,
      bedrijven: lijst.length,
      rankbaar: lijst.filter((b) => b.googleReviews >= MIN_REVIEWS && b.recent24 >= MIN_RECENT).length,
    }))
    .sort((a, b) => b.bedrijven - a.bedrijven || a.naam.localeCompare(b.naam, 'nl'));

  return {
    slug: config.slug, config, peildatum, peilJaar,
    vakMv: config.vak.mv, vakEv: config.vak.ev, vakMvCap: config.vak.mvCap || config.vak.mv,
    regio: config.regio.naam, kern: config.regio.kern,
    gemeentenOfficieel,                  // uit regions.txt, of null als onbekend
    gemeentenMetBedrijf: gemeenten.length,
    drempelReviews: MIN_REVIEWS, drempelRecent: MIN_RECENT,
    aantal: B.length, genoegReviews, genoegRecent, rankbaar, gepubliceerd,
    totaalReviews,
    medianeVolume: mediaan(volumes),
    gemiddeldVolume: volumes.length ? totaalReviews / volumes.length : 0,
    hoogsteVolume: volumes.length ? Math.max(...volumes) : 0,
    onderKwart: kwantiel(volumes, 0.25), bovenKwart: kwantiel(volumes, 0.75),
    volumeVerdeling,
    aandeelTop10: aandeelTop(10), aandeelTop25: aandeelTop(25),
    aandeelOnderhelft: 100 - aandeelTop(helft), onderhelft: B.length - helft,
    beoordeelbaar: beoordeelbaar.length,
    medianeScore: mediaan(beoordeelbaar.map((b) => b.googleScore)),
    sterVerdeling, perfect, perfectStevig,
    medianRecent: mediaan(recent), stil, traag, activiteitVerdeling,
    jaren: jaren.map((j) => ({ jaar: j, aantal: perJaar[String(j)] })),
    jaarMax, raming, verstreken, vorig, dit,
    maanden, maandMax, maandMin, maandTotaal,
    gemeenten,
    afgekapt, volledigAantal: volledig.length,
    opgehaald, zonderTekst, oudste,
    zonderWebsite: B.filter((b) => !b.website).length,
  };
}

// =====================================================================
// DE ZINNEN — koppen en duiding worden uit de cijfers afgeleid, nooit
// vastgeschreven. Anders klopt de kop van de ene regio niet voor de andere.
// =====================================================================
function koppen(m) {
  const k = {};

  k.omvang = `Van ${nl(m.aantal)} bedrijven blijven er ${nl(m.rankbaar)} over`;

  k.volume = m.aandeelTop10 >= 50
    ? `Tien bedrijven bezitten meer dan de helft van alle reviews`
    : `De tien drukste bedrijven hebben ${dec(m.aandeelTop10, 0)}% van alle reviews`;

  k.sterren = m.medianeScore >= 4.6
    ? 'Een hoge score is de norm, geen uitzondering'
    : 'De scores lopen sterk uiteen';

  const eenOp = m.aantal ? Math.round(m.aantal / Math.max(1, m.stil)) : 0;
  k.activiteit = m.stil === 0
    ? `Elk bedrijf kreeg de voorbije twee jaar reviews`
    : `Bijna één op ${eenOp} kreeg twee jaar lang geen enkele review`;

  if (m.raming === null) k.groei = 'Hoeveel reviews er per jaar bij komen';
  else if (m.raming > m.vorig * 1.1) k.groei = `${m.peilJaar} zet de groei door`;
  else if (m.raming < m.vorig * 0.9) k.groei = `${m.peilJaar} loopt terug`;
  else k.groei = `Na jaren klimmen vlakt ${m.peilJaar} af`;

  const ratio = m.maandMin.aandeel ? m.maandMax.aandeel / m.maandMin.aandeel : 0;
  const volMaand = { jan: 'januari', feb: 'februari', mrt: 'maart', apr: 'april', mei: 'mei',
    jun: 'juni', jul: 'juli', aug: 'augustus', sep: 'september', okt: 'oktober',
    nov: 'november', dec: 'december' };
  k.seizoen = ratio >= 1.8
    ? `${volMaand[m.maandMax.naam][0].toUpperCase()}${volMaand[m.maandMax.naam].slice(1)} levert ruim dubbel zoveel reviews op als ${volMaand[m.maandMin.naam]}`
    : `${volMaand[m.maandMax.naam][0].toUpperCase()}${volMaand[m.maandMax.naam].slice(1)} is de drukste maand`;

  k.spreiding = `Waar de ${m.vakMv} zitten`;
  return k;
}

// =====================================================================
// DE HTML — één bestand, geen bibliotheken van buiten, werkt offline.
// =====================================================================
function staafRij(label, aantal, max) {
  return `    <div class="hbar"><span class="cat">${label}</span>` +
    `<span class="track"><span class="fill" style="width:${dec(aantal / max * 100, 1)}%"></span></span>` +
    `<span class="val">${nl(aantal)}</span></div>`;
}

function render(m) {
  const k = koppen(m);
  const datumNL = new Date(m.peildatum).toLocaleDateString('nl-BE',
    { day: 'numeric', month: 'long', year: 'numeric' });

  // --- trechter -----------------------------------------------------
  const trechter = [
    [`${m.vakMvCap} gevonden in de regio`, m.aantal, false],
    [`Minstens ${m.drempelRecent} reviews in 24 maanden`, m.genoegRecent, false],
    [`Minstens ${m.drempelReviews} reviews in totaal`, m.genoegReviews, false],
    ['Beide drempels &mdash; rankbaar', m.rankbaar, false],
  ];
  if (m.gepubliceerd) trechter.push([`Gepubliceerd op Keurwijzer`, m.gepubliceerd, true]);
  const trechterHTML = trechter.map(([t, v, laatste]) =>
    `    <div class="frow"><span class="fill" style="width:${dec(v / m.aantal * 100, 1)}%` +
    `${laatste ? ';border-left-color:var(--ink)' : ''}"></span>` +
    `<div class="f"><span class="t">${t}</span><span class="v">${nl(v)}</span></div></div>`).join('\n');

  // --- jaren --------------------------------------------------------
  const jaarKolommen = m.jaren.map((j) => {
    const isLopend = j.jaar === m.peilJaar;
    const hoogte = j.aantal / m.jaarMax * 100;
    if (isLopend && m.raming !== null) {
      const totaal = m.raming / m.jaarMax * 100;
      const echt = totaal ? hoogte / totaal * 100 : 0;
      return `      <div class="vcol"><span class="stack" style="height:${dec(totaal, 1)}%">` +
        `<span class="lab" style="bottom:${dec(echt, 1)}%">${nl(j.aantal)}</span>` +
        `<span class="ghost" style="height:${dec(100 - echt, 1)}%"></span>` +
        `<span class="bar" style="height:${dec(echt, 1)}%"></span></span></div>`;
    }
    const label = j.jaar === m.peilJaar - 1
      ? `<span class="lab strong">${nl(j.aantal)}</span>` : '';
    return `      <div class="vcol"><span class="stack" style="height:${dec(hoogte, 1)}%">` +
      `${label}<span class="bar"></span></span></div>`;
  }).join('\n');
  const jaarLabels = m.jaren.map((j) =>
    `<span${j.jaar >= m.peilJaar - 1 ? ' class="on"' : ''}>${j.jaar}</span>`).join('');

  // --- maanden ------------------------------------------------------
  const maandKolommen = m.maanden.map((mm) => {
    const hoogte = mm.aandeel / m.maandMax.aandeel * 100;
    const toon = mm.naam === m.maandMax.naam || mm.naam === m.maandMin.naam;
    return `      <div class="vcol"><span class="stack" style="height:${dec(hoogte, 1)}%">` +
      `${toon ? `<span class="lab strong">${dec(mm.aandeel, 1)}%</span>` : ''}` +
      `<span class="bar"></span></span></div>`;
  }).join('\n');
  const maandLabels = m.maanden.map((mm) => {
    const uit = mm.naam === m.maandMax.naam || mm.naam === m.maandMin.naam;
    return `<span${uit ? ' class="on"' : ''}>${mm.naam}</span>`;
  }).join('');

  // --- gemeenten ----------------------------------------------------
  const gemeenteRijen = m.gemeenten.map((g) =>
    `        <tr><td class="name">${esc(g.naam)}</td>` +
    `<td class="num r">${g.bedrijven}</td><td class="num r">${g.rankbaar}</td>` +
    `<td class="share"><span class="minibar"><i style="width:${dec(g.rankbaar / g.bedrijven * 100, 0)}%"></i></span></td></tr>`
  ).join('\n');

  // --- verantwoording -----------------------------------------------
  const caveats = [];
  caveats.push(`<strong>De groeicurve overdrijft de klim.</strong> We zien alleen bedrijven die ` +
    `vandaag nog bestaan. Wie in het verleden stopte, telt in die oudere jaren niet mee &mdash; ` +
    `waardoor die kunstmatig laag ogen. De vergelijking tussen ${m.peilJaar - 1} en ${m.peilJaar} ` +
    `is w&eacute;l betrouwbaar: dat zijn dezelfde bedrijven.`);
  if (m.afgekapt > 0) {
    caveats.push(`<strong>${m.afgekapt === 1 ? 'E&eacute;n export is' : nl(m.afgekapt) + ' exports zijn'} ` +
      `afgekapt.</strong> Bij ${m.afgekapt === 1 ? 'één groot bedrijf' : nl(m.afgekapt) + ' grote spelers'} ` +
      `werden minder reviews opgehaald dan er bestaan. Voor de volumecijfers maakt dat niets uit &mdash; ` +
      `daar telt het echte totaal van Google. Uit de jaar- en maandgrafieken ` +
      `${m.afgekapt === 1 ? 'is dat bedrijf' : 'zijn die bedrijven'} weggelaten.`);
  }
  if (m.zonderWebsite === 0) {
    caveats.push(`<strong>${m.vakMvCap} zonder website ontbreken.</strong> Alle ${nl(m.aantal)} ` +
      `gevonden bedrijven hebben er een. Over vakmensen die enkel via mond-tot-mondreclame ` +
      `werken, zegt dit rapport niets.`);
  }
  if (m.opgehaald) {
    caveats.push(`<strong>Een deel van de reviews is enkel een sterrenscore.</strong> Van de ` +
      `${nl(m.opgehaald)} opgehaalde reviews bevatten er ${nl(m.zonderTekst)} ` +
      `(${pct(m.zonderTekst, m.opgehaald)}%) geen geschreven tekst. Ze tellen mee in het aantal, ` +
      `maar ze vertellen niets over het werk.`);
  }

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Marktbeeld ${esc(m.vakMv)} ${esc(m.kern)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@500;600&display=swap">
<style>
  :root{
    --ground:#F5F7F6; --ink:#182226; --ink-2:#3D4B50; --muted:#66727A;
    --rule:#DCE3E2; --rule-soft:#E9EEED; --accent:#0E7C6B; --accent-soft:#DCEAE6; --track:#E4EAE9;
    --serif:"IBM Plex Serif",Georgia,"Times New Roman",serif;
    --sans:"IBM Plex Sans","Segoe UI",Helvetica,Arial,sans-serif;
    --mono:"IBM Plex Mono",ui-monospace,"Cascadia Mono",Consolas,monospace;
  }
  /* Donker thema. Twee keer opgeschreven, met opzet: de mediaquery vangt wie zijn
     toestel op donker heeft staan, het [data-theme]-blok vangt een lezer die het
     zelf omzet. De :not() zorgt dat een bewuste keuze voor licht altijd wint. */
  @media (prefers-color-scheme:dark){
    :root:not([data-theme="light"]){
      --ground:#10171A; --ink:#E5EBEA; --ink-2:#BAC6C7; --muted:#8E9CA1;
      --rule:#2A3639; --rule-soft:#212C2F; --accent:#3DB6A2; --accent-soft:#1D3B38; --track:#263235;
    }
  }
  :root[data-theme="dark"]{
    --ground:#10171A; --ink:#E5EBEA; --ink-2:#BAC6C7; --muted:#8E9CA1;
    --rule:#2A3639; --rule-soft:#212C2F; --accent:#3DB6A2; --accent-soft:#1D3B38; --track:#263235;
  }
  *{box-sizing:border-box}
  body{background:var(--ground);color:var(--ink);font-family:var(--sans);
       font-size:16px;line-height:1.62;margin:0;-webkit-font-smoothing:antialiased}
  .wrap{max-width:920px;margin:0 auto;padding:0 28px 96px}
  .col{max-width:64ch}
  header.top{padding:56px 0 0}
  .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;
           text-transform:uppercase;color:var(--muted);margin:0 0 18px}
  h1{font-family:var(--serif);font-weight:600;font-size:clamp(34px,5.2vw,50px);
     line-height:1.1;letter-spacing:-.015em;text-wrap:balance;margin:0 0 18px}
  .standfirst{font-size:19px;line-height:1.55;color:var(--ink-2);max-width:56ch;margin:0}
  .meta{display:flex;flex-wrap:wrap;gap:8px 26px;font-family:var(--mono);font-size:12px;
        color:var(--muted);margin:26px 0 0;padding:16px 0 0;border-top:1px solid var(--rule)}
  .meta b{color:var(--ink-2);font-weight:500}
  .keyfig{display:grid;grid-template-columns:repeat(4,1fr);margin:44px 0 0;
          border-top:2px solid var(--ink);border-bottom:1px solid var(--rule)}
  .keyfig div{padding:22px 20px 20px;border-left:1px solid var(--rule-soft)}
  .keyfig div:first-child{border-left:0;padding-left:0}
  .keyfig .n{font-family:var(--mono);font-size:34px;font-weight:500;line-height:1;
             letter-spacing:-.02em;font-variant-numeric:tabular-nums;display:block}
  .keyfig .l{font-size:13.5px;color:var(--muted);line-height:1.35;margin-top:9px;display:block}
  @media(max-width:720px){
    .keyfig{grid-template-columns:repeat(2,1fr)}
    .keyfig div:nth-child(3){border-left:0;padding-left:0}
    .keyfig div:nth-child(n+3){border-top:1px solid var(--rule-soft)}
  }
  section{margin:64px 0 0}
  h2{font-family:var(--serif);font-weight:600;font-size:26px;line-height:1.25;
     letter-spacing:-.01em;margin:0 0 12px;text-wrap:balance}
  .sec-label{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
             color:var(--accent);margin:0 0 10px;padding-top:22px;border-top:1px solid var(--rule)}
  p{margin:0 0 16px}
  p.lede{color:var(--ink-2)}
  .note{font-size:14.5px;color:var(--muted);line-height:1.55;
        border-left:2px solid var(--rule);padding-left:14px;margin:20px 0 0;max-width:60ch}
  strong{font-weight:600;color:var(--ink-2)}
  .fig{font-family:var(--mono);font-variant-numeric:tabular-nums;font-weight:500;color:var(--ink)}
  .hbars{margin:28px 0 0;display:flex;flex-direction:column;gap:9px;max-width:640px}
  .hbar{display:grid;grid-template-columns:112px 1fr 46px;align-items:center;gap:14px}
  .hbar .cat{font-family:var(--mono);font-size:12.5px;color:var(--ink-2);text-align:right;
             font-variant-numeric:tabular-nums}
  .hbar .track{background:var(--track);height:22px;border-radius:2px;overflow:hidden}
  .hbar .fill{display:block;background:var(--accent);height:100%;border-radius:0 3px 3px 0}
  .hbar .val{font-family:var(--mono);font-size:13px;color:var(--ink);font-weight:500;
             font-variant-numeric:tabular-nums}
  .axis-note{font-family:var(--mono);font-size:11px;color:var(--muted);margin:14px 0 0;
             letter-spacing:.02em;line-height:1.6}
  .vchart{margin:30px 0 0;overflow-x:auto;padding-bottom:4px}
  .vcols{display:flex;align-items:flex-end;gap:10px;height:212px;min-width:520px;
         padding-top:24px;border-bottom:1px solid var(--rule)}
  .vcol{flex:1;display:flex;align-items:flex-end;height:100%}
  .stack{position:relative;width:100%;display:flex;flex-direction:column;
         justify-content:flex-end;min-height:2px}
  .stack .bar{display:block;width:100%;height:100%;flex:none;background:var(--accent);
              border-radius:3px 3px 0 0}
  .stack .ghost{display:block;width:100%;flex:none;border-radius:3px 3px 0 0;opacity:.6;
                background:repeating-linear-gradient(135deg,var(--accent) 0 2px,transparent 2px 6px)}
  .stack .ghost + .bar{border-radius:0}
  .lab{position:absolute;left:0;right:0;bottom:100%;margin-bottom:5px;text-align:center;
       font-family:var(--mono);font-size:11px;color:var(--muted);
       font-variant-numeric:tabular-nums;white-space:nowrap}
  .lab.strong{color:var(--ink);font-weight:500}
  .vlabels{display:flex;gap:10px;min-width:520px;margin-top:8px}
  .vlabels span{flex:1;text-align:center;font-family:var(--mono);font-size:11.5px;color:var(--muted)}
  .vlabels span.on{color:var(--ink);font-weight:500}
  .funnel{margin:28px 0 0;display:flex;flex-direction:column;gap:3px;max-width:640px}
  .frow{position:relative;background:var(--track);border-radius:2px;overflow:hidden}
  .frow .fill{position:absolute;top:0;bottom:0;left:0;background:var(--accent-soft);
              border-left:3px solid var(--accent)}
  .frow .f{position:relative;padding:13px 16px;display:flex;
           justify-content:space-between;align-items:baseline;gap:16px}
  .frow .f .t{font-size:14.5px;color:var(--ink-2)}
  .frow .f .v{font-family:var(--mono);font-size:16px;font-weight:500;color:var(--ink);
              font-variant-numeric:tabular-nums;white-space:nowrap}
  .tablewrap{overflow-x:auto;margin:28px 0 0}
  table{border-collapse:collapse;width:100%;min-width:480px;font-size:14.5px}
  th{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
     color:var(--muted);text-align:left;font-weight:400;padding:0 12px 9px 0;
     border-bottom:1px solid var(--ink)}
  th.r,td.r{text-align:right;padding-right:16px}
  td{padding:9px 12px 9px 0;border-bottom:1px solid var(--rule-soft);font-variant-numeric:tabular-nums}
  td.name{color:var(--ink)}
  td.num{font-family:var(--mono);font-size:13.5px;color:var(--ink-2)}
  td.share{width:160px;padding-right:0}
  .minibar{display:block;background:var(--track);height:7px;border-radius:2px;overflow:hidden}
  .minibar i{display:block;height:100%;background:var(--accent);border-radius:0 2px 2px 0}
  tbody tr:last-child td{border-bottom:0}
  .caveats{margin:20px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;
           gap:15px;max-width:62ch}
  .caveats li{padding-left:20px;position:relative;font-size:15px;color:var(--ink-2);line-height:1.55}
  .caveats li::before{content:"";position:absolute;left:0;top:.66em;width:9px;height:1px;
                      background:var(--accent)}
  footer{margin:76px 0 0;padding:22px 0 0;border-top:1px solid var(--rule);
         font-family:var(--mono);font-size:11.5px;color:var(--muted);line-height:1.75}
</style>
</head>
<body>
<div class="wrap">

<header class="top">
  <p class="eyebrow">Keurwijzer &middot; marktrapport</p>
  <h1>${esc(m.vakMvCap)} in de ${esc(m.regio)}</h1>
  <p class="standfirst">Wat de Google-reviews van ${nl(m.aantal)} ${esc(m.vakMv)} zeggen over de
  markt waarin ze werken &mdash; omvang, activiteit, en hoe scheef het speelveld ligt.</p>
  <div class="meta">
    <span>Peildatum <b>${datumNL}</b></span>
    <span>Bron <b>openbare Google-reviews</b></span>
    <span>Bereik <b>${m.gemeentenOfficieel ? m.gemeentenOfficieel + ' gemeenten' : esc(m.regio)}</b></span>
    <span>Bedrijven <b>${nl(m.aantal)}</b></span>
  </div>
</header>

<div class="keyfig">
  <div><span class="n">${nl(m.aantal)}</span><span class="l">${esc(m.vakMv)} gevonden in de regio</span></div>
  <div><span class="n">${nl(m.medianeVolume)}</span><span class="l">reviews heeft de doorsnee ${esc(m.vakEv)}</span></div>
  <div><span class="n">${dec(m.medianeScore, 2)}</span><span class="l">mediaan Google-score vanaf ${m.drempelReviews}&nbsp;reviews</span></div>
  <div><span class="n">${pct(m.traag, m.aantal)}%</span><span class="l">haalt geen ${m.drempelRecent} reviews per 2&nbsp;jaar</span></div>
</div>

<section>
  <p class="sec-label">Omvang</p>
  <div class="col">
    <h2>${k.omvang}</h2>
    <p class="lede">Niet elk bedrijf dat in de regio als ${esc(m.vakEv)} te vinden is, valt te
    beoordelen. Zonder voldoende reviews, of zonder recente, is er te weinig om op te steunen.
    Wie beide drempels haalt, is rankbaar.</p>
  </div>
  <div class="funnel">
${trechterHTML}
  </div>
  <p class="note">${m.genoegReviews < m.aantal / 2
    ? `De helft van de ${esc(m.vakMv)} in de regio haalt de drempel van ${m.drempelReviews} reviews niet.`
    : `${nl(m.aantal - m.genoegReviews)} van de ${nl(m.aantal)} ${esc(m.vakMv)} halen de drempel van ${m.drempelReviews} reviews niet.`}
  Dat betekent niet dat ze slecht werk leveren &mdash; het betekent dat er publiek te weinig over
  hen te vinden is om er iets zinnigs over te zeggen.</p>
</section>

<section>
  <p class="sec-label">Reviewvolume</p>
  <div class="col">
    <h2>${k.volume}</h2>
    <p class="lede">Samen verzamelden de ${nl(m.aantal)} ${esc(m.vakMv)}
    <span class="fig">${nl(m.totaalReviews)}</span> reviews. Die liggen bijzonder ongelijk
    verdeeld: het gemiddelde bedrijf heeft er ${nl(Math.round(m.gemiddeldVolume))}, de
    d&oacute;&oacute;rsnee ${esc(m.vakEv)} ${nl(m.medianeVolume)}. Dat verschil is het hele verhaal.</p>
  </div>
  <div class="hbars">
${m.volumeVerdeling.rijen.map((r) => staafRij(r.label, r.aantal, m.volumeVerdeling.max)).join('\n')}
  </div>
  <p class="axis-note">Aantal bedrijven per schijf &middot; schaal 0 &ndash; ${m.volumeVerdeling.max} &middot; de drukst beoordeelde ${esc(m.vakEv)} telt ${nl(m.hoogsteVolume)} reviews</p>
  <p class="note">De tien drukst beoordeelde bedrijven hebben samen <strong>${dec(m.aandeelTop10, 0)}%</strong>
  van alle reviews in de regio. De 25 drukste hebben er <strong>${dec(m.aandeelTop25, 0)}%</strong>.
  De helft van de bedrijven met de minste reviews heeft er samen <strong>${dec(m.aandeelOnderhelft, 0)}%</strong>.</p>
</section>

<section>
  <p class="sec-label">Sterren</p>
  <div class="col">
    <h2>${k.sterren}</h2>
    <p class="lede">Onder de ${nl(m.beoordeelbaar)} bedrijven met minstens ${m.drempelReviews} reviews
    ligt de mediaan op <span class="fig">${dec(m.medianeScore, 2)}</span>.
    ${m.perfect} bedrijven staan op een perfecte 5,0 &mdash; maar slechts ${m.perfectStevig} daarvan
    halen die met 25 reviews of meer. Een vlekkeloze score zegt vooral iets zolang er genoeg
    reviews onder liggen.</p>
  </div>
  <div class="hbars">
${m.sterVerdeling.rijen.map((r) => staafRij(r.label, r.aantal, m.sterVerdeling.max)).join('\n')}
  </div>
  <p class="axis-note">Aantal bedrijven per scoreschijf &middot; enkel bedrijven vanaf ${m.drempelReviews} reviews (n = ${nl(m.beoordeelbaar)}) &middot; schaal 0 &ndash; ${m.sterVerdeling.max}</p>
</section>

<section>
  <p class="sec-label">Activiteit</p>
  <div class="col">
    <h2>${k.activiteit}</h2>
    <p class="lede">Reviews vergaan niet, maar ze verouderen wel. Over de 24 maanden tot de
    peildatum kreeg de doorsnee ${esc(m.vakEv)} er <span class="fig">${nl(m.medianRecent)}</span> bij.
    ${nl(m.stil)} bedrijven kregen er nul.</p>
  </div>
  <div class="hbars">
${m.activiteitVerdeling.rijen.map((r) => staafRij(r.label, r.aantal, m.activiteitVerdeling.max)).join('\n')}
  </div>
  <p class="axis-note">Nieuwe reviews in de 24 maanden tot de peildatum &middot; alle ${nl(m.aantal)} bedrijven &middot; schaal 0 &ndash; ${m.activiteitVerdeling.max}</p>
</section>

<section>
  <p class="sec-label">Groei</p>
  <div class="col">
    <h2>${k.groei}</h2>
    <p class="lede">Er komen elk jaar reviews bij over ${esc(m.vakMv)} in deze regio. Hoeveel
    precies, en of dat tempo aanhoudt, staat hieronder.</p>
  </div>
  <div class="vchart">
    <div class="vcols">
${jaarKolommen}
    </div>
    <div class="vlabels">${jaarLabels}</div>
  </div>
  <p class="axis-note">Nieuwe reviews per jaar &middot; schaal 0 &ndash; ${nl(m.jaarMax)}${m.raming !== null ? ' &middot; gearceerd = raming voor de rest van ' + m.peilJaar : ''}</p>
${m.raming !== null ? `  <p class="note">Op de peildatum was ${pct(m.verstreken, 1)}% van ${m.peilJaar} verstreken,
  met ${nl(m.dit)} reviews. Doorgetrokken komt dat op ongeveer <strong>${nl(m.raming)}</strong> &mdash;
  tegenover ${nl(m.vorig)} in ${m.peilJaar - 1}.</p>` : ''}
</section>

<section>
  <p class="sec-label">Seizoen</p>
  <div class="col">
    <h2>${k.seizoen}</h2>
    <p class="lede">Over alle jaren heen samengeteld zit er een duidelijk ritme in wanneer
    klanten hun ${esc(m.vakEv)} beoordelen.</p>
  </div>
  <div class="vchart">
    <div class="vcols">
${maandKolommen}
    </div>
    <div class="vlabels">${maandLabels}</div>
  </div>
  <p class="axis-note">Aandeel van alle reviews per maand &middot; alle jaren samen (n = ${nl(m.maandTotaal)}) &middot; schaal 0 &ndash; ${dec(m.maandMax.aandeel, 1)}%</p>
</section>

<section>
  <p class="sec-label">Spreiding</p>
  <div class="col">
    <h2>${k.spreiding}</h2>
    <p class="lede">Waar de bedrijven gevestigd zijn, en hoeveel er per gemeente genoeg
    reviews hebben om beoordeeld te kunnen worden.</p>
  </div>
  <div class="tablewrap">
    <table>
      <thead><tr>
        <th>Gemeente</th><th class="r">Bedrijven</th><th class="r">Rankbaar</th>
        <th style="width:160px">Aandeel rankbaar</th>
      </tr></thead>
      <tbody>
${gemeenteRijen}
      </tbody>
    </table>
  </div>
  <p class="note">De ${nl(m.aantal)} bedrijven zijn gevestigd in
  <strong>${m.gemeentenMetBedrijf} gemeenten</strong>${m.gemeentenOfficieel
    ? `, terwijl de regio er ${m.gemeentenOfficieel} telt` : ''}. Het zoekgebied loopt bewust
  iets ruimer dan de regio zelf, want een ${esc(m.vakEv)} uit een buurgemeente werkt hier net zo
  goed &mdash; daardoor duiken hier ook gemeenten op die net buiten de regio vallen.</p>
</section>

<section>
  <p class="sec-label">Verantwoording</p>
  <div class="col">
    <h2>Wat deze cijfers niet zeggen</h2>
    <p class="lede">Elke meting heeft randen. Deze staan hier omdat een cijfer zonder zijn
    beperking makkelijk meer belooft dan het waarmaakt.</p>
  </div>
  <ul class="caveats">
${caveats.map((c) => '    <li>' + c + '</li>').join('\n')}
  </ul>
</section>

<footer>
  Marktbeeld ${esc(m.vakMv)} ${esc(m.regio)} &middot; peildatum ${datumNL}<br>
  Samengesteld uit openbare Google-reviews van ${nl(m.aantal)} bedrijven in ${m.gemeentenMetBedrijf} gemeenten${m.oudste ? `.
  Oudste review in de reeks: ${new Date(m.oudste).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.<br>
  Keurwijzer &mdash; onafhankelijke kwaliteitsranking per vak en regio.
</footer>

</div>
</body>
</html>
`;
}

// =====================================================================
// Terminalsamenvatting — zodat je niet hoeft te openen om te weten wat eruit kwam.
// =====================================================================
function samenvatting(m) {
  const k = koppen(m);
  console.log('');
  console.log(`MARKTBEELD ${m.slug}  —  peildatum ${m.peildatum}`);
  console.log(`  bedrijven in de regio     ${nl(m.aantal)}   (gevestigd in ${m.gemeentenMetBedrijf} gemeenten` +
    `${m.gemeentenOfficieel ? `; de regio telt er ${m.gemeentenOfficieel}` : ''})`);
  console.log(`  rankbaar                  ${nl(m.rankbaar)}   (>=${m.drempelReviews} reviews en >=${m.drempelRecent} recent)`);
  if (m.gepubliceerd) console.log(`  gepubliceerd              ${nl(m.gepubliceerd)}`);
  console.log(`  reviews totaal            ${nl(m.totaalReviews)}   mediaan ${nl(m.medianeVolume)} per bedrijf`);
  console.log(`  top 10 heeft samen        ${dec(m.aandeelTop10, 0)}% van alle reviews`);
  console.log(`  mediane score             ${dec(m.medianeScore, 2)}   (${m.perfect} bedrijven op 5,0)`);
  console.log(`  stil (0 reviews in 24m)   ${nl(m.stil)}   = ${pct(m.stil, m.aantal)}%`);
  console.log(`  ${m.peilJaar - 1} -> ${m.peilJaar}              ${nl(m.vorig)} -> ${m.raming !== null ? nl(m.raming) + ' (raming)' : nl(m.dit)}`);
  console.log(`  drukste maand             ${m.maandMax.naam} (${dec(m.maandMax.aandeel, 1)}%), stilste ${m.maandMin.naam} (${dec(m.maandMin.aandeel, 1)}%)`);
  if (m.afgekapt) console.log(`  ! afgekapte exports       ${m.afgekapt}  (weggelaten uit jaar- en maandgrafiek)`);
  console.log(`  koppen: "${k.volume}" / "${k.groei}"`);
}

// =====================================================================
// Uitvoeren
// =====================================================================
function maak(slug) {
  const gevonden = vindConfig(slug);
  if (!gevonden) {
    console.error(`Geen config gevonden voor "${slug}". Verwacht: config/<niche>/${slug}.json`);
    process.exit(1);
  }
  const config = { slug, ...gevonden.config };

  const reviewsPad = path.join(ROOT, 'data', slug, 'reviews.json');
  if (!fs.existsSync(reviewsPad)) {
    console.error(`data/${slug}/reviews.json bestaat niet. Draai eerst: node scripts/normalize.js ${slug}`);
    process.exit(1);
  }
  const bedrijven = JSON.parse(fs.readFileSync(reviewsPad, 'utf8'));
  if (!Array.isArray(bedrijven)) {
    console.error(`data/${slug}/reviews.json heeft niet de verwachte vorm (een lijst bedrijven).`);
    process.exit(1);
  }
  if (!config.gemeenten || !config.gemeenten.length) {
    console.error(`config van ${slug} heeft geen gemeentelijst — zonder die filter klopt het rapport niet.`);
    process.exit(1);
  }

  // Hoeveel er gepubliceerd staan weten we uit het selectieslot, niet uit een
  // herberekening: dit rapport mag nooit zelf een selectie uitrekenen.
  let gepubliceerd = null;
  const selectiePad = path.join(ROOT, 'data', slug, 'selectie.json');
  if (fs.existsSync(selectiePad)) {
    const sel = JSON.parse(fs.readFileSync(selectiePad, 'utf8'));
    if (Array.isArray(sel.bedrijven)) gepubliceerd = sel.bedrijven.length;
  }

  const m = bereken(bedrijven, config, gepubliceerd, officieelAantalGemeenten(config));
  if (!m.aantal) {
    console.error(`Geen enkel bedrijf van ${slug} valt binnen de gemeentelijst van de config.`);
    process.exit(1);
  }

  const uitDir = path.join(ROOT, 'reports', slug);
  fs.mkdirSync(uitDir, { recursive: true });
  const uit = path.join(uitDir, slug + '-marktbeeld.html');
  fs.writeFileSync(uit, render(m), 'utf8');

  samenvatting(m);
  console.log(`  geschreven: reports/${slug}/${slug}-marktbeeld.html`);
  return uit;
}

const argv = process.argv.slice(2);
const open = argv.includes('--open');
const slugs = argv.filter((a) => !a.startsWith('--'));

if (argv.includes('--alle')) {
  const alle = alleSlugs();
  if (!alle.length) { console.error('Geen enkele regio met data gevonden.'); process.exit(1); }
  for (const s of alle) maak(s);
  console.log(`\n${alle.length} marktrapporten gemaakt.`);
} else if (!slugs.length) {
  console.error('Gebruik: node scripts/marktbeeld.js <slug> [--open]   of   --alle');
  console.error('Beschikbaar: ' + alleSlugs().join(', '));
  process.exit(1);
} else {
  const laatste = maak(slugs[0]);
  if (open) execFile('cmd', ['/c', 'start', '', laatste], () => {});
}
