#!/usr/bin/env node
// =====================================================================
// scripts/marktbeeld.js — het marktrapport van één regio
//
// Maakt reports/<slug>/<slug>-marktbeeld.html: wat de openbare Google-reviews
// zeggen over de markt waarin een vak in een regio werkt. Eén bestand dat je
// dubbelklikt, geen server, werkt offline.
//
// ---------------------------------------------------------------------
// WAAROVER DIT RAPPORT GAAT — de belangrijkste beslissing in dit bestand
// ---------------------------------------------------------------------
// De scraper haalt alles op wat bovenkomt bij een zoektocht naar het vak.
// Dat zijn lang niet allemaal vakmensen: in Antwerpen zaten er een
// bedrijfskledingzaak, een koffiehuis en een bouwmaterialenhandel tussen. De
// tien bedrijven met de MEESTE reviews in die ruwe verzameling waren er nul
// die daadwerkelijk daken leggen. Een rapport over die verzameling zou dus
// onzin vertellen over "de dakwerkersmarkt".
//
// Daarom gaat dit rapport over precies één groep:
//
//     bedrijven die de reviewdrempels halen (>= MIN_REVIEWS reviews en
//     >= MIN_RECENT in 24 maanden) ÉN vakspecialist zijn
//     (vakfocus >= VAKFOCUS_FLOOR uit beoordeling.json).
//
// Die grens is niet willekeurig — ze is de enige die in élke regio volledig
// gekend is. Gecontroleerd over alle 16 regio's: er is geen enkel bedrijf dat
// de reviewdrempels haalt en niet beoordeeld is. Van wie eronder zit weten we
// vaak níét of het een vakman is, want die is nooit beoordeeld. Zouden we die
// meenemen, dan zou het rapport stilzwijgend scheef staan — en dat is erger
// dan een zichtbare fout, want niemand die het naleest zou het merken.
//
// Over bedrijven onder de drempel doet dit rapport dus GEEN uitspraak. Niet
// hoeveel het er zijn, niet of ze goed werk leveren, zelfs niet of het
// vakmensen zijn. Dat staat ook zo in de verantwoording op de pagina zelf.
//
// ---------------------------------------------------------------------
// WAAROM DIT VEILIG IS OM TE DELEN
// ---------------------------------------------------------------------
// Anders dan het controlerapport en het prospectiedocument in dezelfde map is
// dit rapport bedoeld om buiten de deur te gaan — publiek zelfs. Dat kan om
// precies één reden: er staat geen enkel bedrijf in. Alles is geaggregeerd.
// Daardoor kan het rapport de positie van niemand beïnvloeden en raakt het
// geen van de twee gemeten inputs van de methodiek (de Google-reviews en de
// eigen website van een bedrijf).
//
//   Zet hier dus NOOIT bedrijfsnamen, adressen, mailadressen of losse scores
//   in, ook niet "even" voor intern gebruik. Dan is het rapport niet langer
//   deelbaar en verliest het meteen zijn hele bestaansreden.
//
// Om dezelfde reden weigert het script een regio met minder dan
// MIN_VOOR_RAPPORT specialisten. Bij vier bedrijven is "één scoort onder 4,0"
// geen statistiek meer maar een vingerwijzing, en is elk aandeel per definitie
// 100%. Zwijgen is daar het eerlijke antwoord.
//
// Alle drempels komen uit lib/rekenkern.js en het aantal gemeenten uit
// regions.txt via lib/registry.js. Nooit hier overtypen: verandert de
// methodiek, dan verandert dit rapport mee.
//
// Het rapport leest alleen; het schrijft niets in data/ en publiceert niets.
//
// Gebruik:
//   node scripts/marktbeeld.js dakwerkers-gent
//   node scripts/marktbeeld.js dakwerkers-gent --open    (en meteen tonen)
//   node scripts/marktbeeld.js --alle                    (elke regio die groot genoeg is)
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const rekenkern = require('../lib/rekenkern');
const { loadPlannedRegions, regioSlugFrom } = require('../lib/registry');

const { MIN_REVIEWS, MIN_RECENT, METHODIEK_LATEST, METHODIEK_PARAMS } = rekenkern;
const VAKFOCUS_FLOOR = METHODIEK_PARAMS[METHODIEK_LATEST].VAKFOCUS_FLOOR;

// Onder dit aantal specialisten maken we géén rapport. Zie de kop hierboven.
const MIN_VOOR_RAPPORT = 15;

const ROOT = path.join(__dirname, '..');

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

function verdeling(waarden, schijven) {
  const rijen = schijven.map(([label, test]) => ({ label, aantal: waarden.filter(test).length }));
  return { rijen, max: Math.max(1, ...rijen.map((r) => r.aantal)) };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Het echte aantal gemeenten van een regio, uit regions.txt — de bindende lijst
// met officiële fusienamen. NIET uit config.gemeenten: daar staan bewust álle
// schrijfwijzen in (fusienaam, oude namen én deelgemeenten), omdat die lijst
// vergelijkt met wat Google in het adres schrijft. Voor Gent zijn dat er 26
// tegenover 9 echte. Zie CLAUDE.md § De drie gemeentelijsten.
function officieelAantalGemeenten(config) {
  const slug = regioSlugFrom(config);
  const regio = loadPlannedRegions(ROOT).find((r) => r.regioSlug === slug);
  return regio ? regio.gemeenten : null;
}

function vindConfig(slug) {
  const configDir = path.join(ROOT, 'config');
  for (const niche of fs.readdirSync(configDir)) {
    const p = path.join(configDir, niche, slug + '.json');
    if (fs.existsSync(p)) return { niche, config: JSON.parse(fs.readFileSync(p, 'utf8')) };
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
      if (fs.existsSync(path.join(ROOT, 'data', slug, 'reviews.json')) &&
          fs.existsSync(path.join(ROOT, 'data', slug, 'beoordeling.json'))) uit.push(slug);
    }
  }
  return uit.sort();
}

// =====================================================================
// DE BEREKENING — leest niets van schijf, zodat ze los te testen valt.
// =====================================================================
function bereken({ ruw, vakfocusVan, config, gepubliceerd, gemeentenOfficieel }) {
  const inFilter = new Set((config.gemeenten || []).map((g) => g.toLowerCase()));
  const gevonden = ruw.filter((b) => inFilter.has(String(b.gemeente || '').toLowerCase()));
  const peildatum = config.peildatum;
  const peilJaar = Number(String(peildatum).slice(0, 4));

  const haaltDrempels = (b) => b.googleReviews >= MIN_REVIEWS && b.recent24 >= MIN_RECENT;
  const beoordeelbaar = gevonden.filter(haaltDrempels);
  const S = beoordeelbaar.filter((b) => (vakfocusVan.get(b.bedrijf) || 0) >= VAKFOCUS_FLOOR);
  const geenSpecialist = beoordeelbaar.length - S.length;

  // Afgekapte exports: minder reviews opgehaald dan Google er heeft. Ze tellen
  // wel mee in het volume (googleReviews is het echte totaal) maar niet in de
  // tijdreeksen, want daar zou hun ontbrekende verleden de oudere jaren
  // platdrukken.
  const isAfgekapt = (b) => b.reviews.length < b.googleReviews;
  const volledig = S.filter((b) => !isAfgekapt(b));
  const afgekapt = S.length - volledig.length;

  // --- reviewvolume -------------------------------------------------
  const volumes = S.map((b) => b.googleReviews);
  const totaalReviews = volumes.reduce((a, c) => a + c, 0);
  const aflopend = [...volumes].sort((a, b) => b - a);
  // Een aandeel dat schaalt met de grootte van de regio. Een vaste "top 10"
  // zegt niets meer zodra er maar 17 bedrijven zijn — dan is het bijna alles.
  const kwartGrootte = Math.max(1, Math.ceil(S.length / 4));
  const aandeelDrukste = totaalReviews
    ? aflopend.slice(0, kwartGrootte).reduce((a, c) => a + c, 0) / totaalReviews * 100 : 0;

  const volumeVerdeling = verdeling(volumes, [
    [`${MIN_REVIEWS} &ndash; 19`, (v) => v < 20],
    ['20 &ndash; 34', (v) => v >= 20 && v < 35],
    ['35 &ndash; 49', (v) => v >= 35 && v < 50],
    ['50 &ndash; 99', (v) => v >= 50 && v < 100],
    ['100 of meer', (v) => v >= 100],
  ]);

  // --- sterren ------------------------------------------------------
  const sterVerdeling = verdeling(S.map((b) => b.googleScore), [
    ['5,0', (s) => s >= 4.95],
    ['4,8 &ndash; 4,9', (s) => s >= 4.75 && s < 4.95],
    ['4,5 &ndash; 4,7', (s) => s >= 4.45 && s < 4.75],
    ['4,0 &ndash; 4,4', (s) => s >= 3.95 && s < 4.45],
    ['onder 4,0', (s) => s < 3.95],
  ]);
  const perfect = S.filter((b) => b.googleScore >= 4.95).length;
  const perfectStevig = S.filter((b) => b.googleReviews >= 25 && b.googleScore >= 4.95).length;

  // --- activiteit ---------------------------------------------------
  // Iedereen in deze groep haalt per definitie MIN_RECENT. De vraag is dus
  // niet wie stilvalt, maar hoe ver de actieven uiteenlopen.
  const recent = S.map((b) => b.recent24);
  const activiteitVerdeling = verdeling(recent, [
    [`${MIN_RECENT} &ndash; 5`, (v) => v < 6],
    ['6 &ndash; 9', (v) => v >= 6 && v < 10],
    ['10 &ndash; 19', (v) => v >= 10 && v < 20],
    ['20 of meer', (v) => v >= 20],
  ]);

  // --- tijdreeksen (enkel volledige exports) -------------------------
  const perJaar = {};
  const perMaand = {};
  for (const b of volledig) {
    for (const r of b.reviews) {
      const d = String(r.datum || '');
      if (!d) continue;
      perJaar[d.slice(0, 4)] = (perJaar[d.slice(0, 4)] || 0) + 1;
      perMaand[d.slice(5, 7)] = (perMaand[d.slice(5, 7)] || 0) + 1;
    }
  }
  let zonderTekst = 0; let opgehaald = 0; let oudste = null;
  for (const b of S) {
    for (const r of b.reviews) {
      opgehaald++;
      if (!String(r.tekst || '').trim()) zonderTekst++;
      const d = String(r.datum || '');
      if (d && (!oudste || d < oudste)) oudste = d;
    }
  }

  const jaarStart = new Date(peilJaar + '-01-01');
  const verstreken = Math.max(0.02, Math.min(1, (new Date(peildatum) - jaarStart) / (365 * 864e5)));
  const dit = perJaar[String(peilJaar)] || 0;
  const raming = verstreken < 0.97 ? Math.round(dit / verstreken) : null;
  const vorig = perJaar[String(peilJaar - 1)] || 0;
  const jaren = Object.keys(perJaar)
    .map(Number).filter((j) => j >= peilJaar - 8 && j <= peilJaar).sort();
  const jaarMax = Math.max(1, raming || 0, ...jaren.map((j) => perJaar[String(j)]));

  const maandNamen = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const maandTotaal = Object.values(perMaand).reduce((a, c) => a + c, 0);
  const maanden = maandNamen.map((naam, i) => {
    const aantal = perMaand[String(i + 1).padStart(2, '0')] || 0;
    return { naam, aantal, aandeel: maandTotaal ? aantal / maandTotaal * 100 : 0 };
  });
  const maandMax = maanden.reduce((a, m) => (m.aandeel > a.aandeel ? m : a), maanden[0]);
  const maandMin = maanden.reduce((a, m) => (m.aandeel < a.aandeel ? m : a), maanden[0]);

  // --- gemeenten ----------------------------------------------------
  const perGemeente = {};
  for (const b of S) (perGemeente[b.gemeente] = perGemeente[b.gemeente] || []).push(b);
  const gemeenten = Object.entries(perGemeente)
    .map(([naam, lijst]) => ({ naam, specialisten: lijst.length }))
    .sort((a, b) => b.specialisten - a.specialisten || a.naam.localeCompare(b.naam, 'nl'));
  const gemeenteMax = Math.max(1, ...gemeenten.map((g) => g.specialisten));

  return {
    slug: config.slug, peildatum, peilJaar,
    vakMv: config.vak.mv, vakEv: config.vak.ev, vakMvCap: config.vak.mvCap || config.vak.mv,
    regio: config.regio.naam, kern: config.regio.kern,
    gemeentenOfficieel, gemeentenMetSpecialist: gemeenten.length,
    drempelReviews: MIN_REVIEWS, drempelRecent: MIN_RECENT, vakfocusVloer: VAKFOCUS_FLOOR,
    gevonden: gevonden.length, beoordeelbaar: beoordeelbaar.length,
    aantal: S.length, geenSpecialist, gepubliceerd,
    totaalReviews,
    medianeVolume: mediaan(volumes),
    gemiddeldVolume: volumes.length ? totaalReviews / volumes.length : 0,
    hoogsteVolume: volumes.length ? Math.max(...volumes) : 0,
    volumeVerdeling, kwartGrootte, aandeelDrukste,
    medianeScore: mediaan(S.map((b) => b.googleScore)),
    sterVerdeling, perfect, perfectStevig,
    medianRecent: mediaan(recent), activiteitVerdeling,
    drukste: Math.max(0, ...recent),
    jaren: jaren.map((j) => ({ jaar: j, aantal: perJaar[String(j)] })),
    jaarMax, raming, verstreken, vorig, dit,
    maanden, maandMax, maandMin, maandTotaal,
    gemeenten, gemeenteMax,
    afgekapt, opgehaald, zonderTekst, oudste,
  };
}

// =====================================================================
// DE ZINNEN — afgeleid uit de cijfers, nooit vastgeschreven. Anders klopt de
// kop van de ene regio niet voor de andere.
// =====================================================================
const VOLUIT = { jan: 'januari', feb: 'februari', mrt: 'maart', apr: 'april', mei: 'mei',
  jun: 'juni', jul: 'juli', aug: 'augustus', sep: 'september', okt: 'oktober',
  nov: 'november', dec: 'december' };
const hoofd = (s) => s[0].toUpperCase() + s.slice(1);

function koppen(m) {
  const k = {};
  k.omvang = `${nl(m.aantal)} ${m.vakMv} met een aantoonbaar spoor`;

  // Geen oordeel in de kop, alleen het cijfer. Bij een gelijke verdeling zou een
  // kwart van de bedrijven 25% van de reviews hebben; de lezer ziet zelf hoever
  // het daarvan af ligt. Een woord als "gelijkmatig" plakken op 53% zou de
  // werkelijkheid gladstrijken.
  k.volume = `Een kwart van de ${m.vakMv} heeft ${dec(m.aandeelDrukste, 0)}% van alle reviews`;

  k.sterren = m.medianeScore >= 4.6
    ? 'Een hoge score is de norm, geen uitzondering'
    : 'De scores lopen sterk uiteen';

  k.activiteit = `De doorsnee ${m.vakEv} krijgt ${nl(m.medianRecent)} reviews per twee jaar`;

  if (m.raming === null) k.groei = 'Hoeveel reviews er per jaar bij komen';
  else if (m.raming > m.vorig * 1.1) k.groei = `${m.peilJaar} zet de groei door`;
  else if (m.raming < m.vorig * 0.9) k.groei = `${m.peilJaar} loopt terug`;
  else k.groei = `Na jaren klimmen vlakt ${m.peilJaar} af`;

  const ratio = m.maandMin.aandeel ? m.maandMax.aandeel / m.maandMin.aandeel : 0;
  k.seizoen = ratio >= 1.8
    ? `${hoofd(VOLUIT[m.maandMax.naam])} levert ruim dubbel zoveel reviews op als ${VOLUIT[m.maandMin.naam]}`
    : `${hoofd(VOLUIT[m.maandMax.naam])} is de drukste maand`;

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

  const trechter = [
    ['Zoekresultaten in het zoekgebied', m.gevonden, false],
    [`Genoeg reviews om te beoordelen`, m.beoordeelbaar, false],
    [`Daarvan echte ${esc(m.vakMv)}`, m.aantal, false],
  ];
  if (m.gepubliceerd) trechter.push(['Gepubliceerd op Keurwijzer', m.gepubliceerd, true]);
  const trechterHTML = trechter.map(([t, v, laatste]) =>
    `    <div class="frow"><span class="fill" style="width:${dec(v / m.gevonden * 100, 1)}%` +
    `${laatste ? ';border-left-color:var(--ink)' : ''}"></span>` +
    `<div class="f"><span class="t">${t}</span><span class="v">${nl(v)}</span></div></div>`).join('\n');

  const jaarKolommen = m.jaren.map((j) => {
    const hoogte = j.aantal / m.jaarMax * 100;
    if (j.jaar === m.peilJaar && m.raming !== null) {
      const totaal = m.raming / m.jaarMax * 100;
      const echt = totaal ? hoogte / totaal * 100 : 0;
      return `      <div class="vcol"><span class="stack" style="height:${dec(totaal, 1)}%">` +
        `<span class="lab" style="bottom:${dec(echt, 1)}%">${nl(j.aantal)}</span>` +
        `<span class="ghost" style="height:${dec(100 - echt, 1)}%"></span>` +
        `<span class="bar" style="height:${dec(echt, 1)}%"></span></span></div>`;
    }
    const label = j.jaar === m.peilJaar - 1 ? `<span class="lab strong">${nl(j.aantal)}</span>` : '';
    return `      <div class="vcol"><span class="stack" style="height:${dec(hoogte, 1)}%">` +
      `${label}<span class="bar"></span></span></div>`;
  }).join('\n');
  const jaarLabels = m.jaren.map((j) =>
    `<span${j.jaar >= m.peilJaar - 1 ? ' class="on"' : ''}>${j.jaar}</span>`).join('');

  const maandKolommen = m.maanden.map((mm) => {
    const toon = mm.naam === m.maandMax.naam || mm.naam === m.maandMin.naam;
    return `      <div class="vcol"><span class="stack" style="height:${dec(mm.aandeel / m.maandMax.aandeel * 100, 1)}%">` +
      `${toon ? `<span class="lab strong">${dec(mm.aandeel, 1)}%</span>` : ''}` +
      `<span class="bar"></span></span></div>`;
  }).join('\n');
  const maandLabels = m.maanden.map((mm) =>
    `<span${mm.naam === m.maandMax.naam || mm.naam === m.maandMin.naam ? ' class="on"' : ''}>${mm.naam}</span>`).join('');

  const gemeenteRijen = m.gemeenten.map((g) =>
    `        <tr><td class="name">${esc(g.naam)}</td><td class="num r">${g.specialisten}</td>` +
    `<td class="share"><span class="minibar"><i style="width:${dec(g.specialisten / m.gemeenteMax * 100, 0)}%"></i></span></td></tr>`
  ).join('\n');

  // --- verantwoording -----------------------------------------------
  const caveats = [];
  caveats.push(`<strong>Dit rapport gaat over ${nl(m.aantal)} bedrijven, niet over de hele ` +
    `sector.</strong> Om erin te staan moet een bedrijf minstens ${m.drempelReviews} Google-reviews ` +
    `hebben, waarvan ${m.drempelRecent} in de voorbije twee jaar, én bij beoordeling van zijn eigen ` +
    `website blijken dat ${esc(m.vakEv)} zijn echte vak is. Bedrijven met minder reviews vallen ` +
    `erbuiten &mdash; en over hen zeggen we bewust niets, ook niet hoeveel het er zijn. Ze zijn nooit ` +
    `beoordeeld, dus we weten van hen niet eens of het ${esc(m.vakMv)} zijn.`);
  if (m.geenSpecialist > 0) {
    caveats.push(`<strong>${nl(m.geenSpecialist)} bedrijven met genoeg reviews vielen af omdat ze iets ` +
      `anders doen.</strong> Bij een zoektocht naar ${esc(m.vakMv)} komen ook aannemers, ` +
      `dakgootreinigers, groothandels en winkels bovendrijven. Zij tellen hier niet mee, want ` +
      `anders zou dit rapport iets beweren over een markt die het niet meet.`);
  }
  caveats.push(`<strong>De groeicurve overdrijft de klim.</strong> We zien alleen bedrijven die vandaag ` +
    `nog bestaan. Wie in het verleden stopte, telt in die oudere jaren niet mee &mdash; waardoor die ` +
    `kunstmatig laag ogen. De vergelijking tussen ${m.peilJaar - 1} en ${m.peilJaar} is w&eacute;l ` +
    `betrouwbaar: dat zijn dezelfde bedrijven.`);
  if (m.afgekapt > 0) {
    caveats.push(`<strong>${m.afgekapt === 1 ? 'Bij één bedrijf is de reviewlijst' : 'Bij ' + nl(m.afgekapt) +
      ' bedrijven is de reviewlijst'} afgekapt.</strong> Er werden minder reviews opgehaald dan er ` +
      `bestaan. Voor de aantallen maakt dat niets uit &mdash; daar telt het echte totaal van Google. ` +
      `Uit de jaar- en maandgrafieken ${m.afgekapt === 1 ? 'is dat bedrijf' : 'zijn die bedrijven'} weggelaten.`);
  }
  if (m.opgehaald) {
    caveats.push(`<strong>Een deel van de reviews is enkel een sterrenscore.</strong> Van de ` +
      `${nl(m.opgehaald)} opgehaalde reviews bevatten er ${nl(m.zonderTekst)} ` +
      `(${pct(m.zonderTekst, m.opgehaald)}%) geen geschreven tekst. Ze tellen mee in het aantal, ` +
      `maar ze vertellen niets over het werk.`);
  }
  caveats.push(`<strong>Het vak wordt beoordeeld op de eigen website.</strong> Een vakman zonder ` +
    `website kan op dat punt niet beoordeeld worden en valt dus buiten dit rapport, hoe goed hij ` +
    `ook werkt.`);

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
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
  /* Donker thema, twee keer opgeschreven met opzet: de mediaquery vangt wie zijn
     toestel op donker heeft staan, het [data-theme]-blok een lezer die het zelf
     omzet. De :not() zorgt dat een bewuste keuze voor licht altijd wint. */
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
  .scope{font-size:14.5px;color:var(--muted);line-height:1.55;max-width:60ch;
         border-left:2px solid var(--accent);padding-left:14px;margin:24px 0 0}
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
  table{border-collapse:collapse;width:100%;min-width:420px;font-size:14.5px}
  th{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
     color:var(--muted);text-align:left;font-weight:400;padding:0 12px 9px 0;
     border-bottom:1px solid var(--ink)}
  th.r,td.r{text-align:right;padding-right:16px}
  td{padding:9px 12px 9px 0;border-bottom:1px solid var(--rule-soft);font-variant-numeric:tabular-nums}
  td.name{color:var(--ink)}
  td.num{font-family:var(--mono);font-size:13.5px;color:var(--ink-2)}
  td.share{width:200px;padding-right:0}
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
  <p class="standfirst">Wat de openbare Google-reviews zeggen over de ${nl(m.aantal)}
  ${esc(m.vakMv)} in deze regio die genoeg sporen nalaten om te beoordelen.</p>
  <p class="scope">Dit rapport telt alleen bedrijven mee met minstens ${m.drempelReviews} reviews,
  waarvan ${m.drempelRecent} in de voorbije twee jaar, en waarvan hun eigen website bevestigt dat
  ${esc(m.vakEv)} hun echte vak is. Wie daaronder valt, komt hier niet in voor &mdash; en daarover
  doen we ook geen uitspraak.</p>
  <div class="meta">
    <span>Peildatum <b>${datumNL}</b></span>
    <span>Bron <b>openbare Google-reviews</b></span>
    ${m.gemeentenOfficieel ? `<span>Regio <b>${m.gemeentenOfficieel} gemeenten</b></span>` : ''}
    <span>Bedrijven <b>${nl(m.aantal)}</b></span>
  </div>
</header>

<div class="keyfig">
  <div><span class="n">${nl(m.aantal)}</span><span class="l">${esc(m.vakMv)} in het rapport</span></div>
  <div><span class="n">${nl(m.medianeVolume)}</span><span class="l">reviews heeft de doorsnee ${esc(m.vakEv)}</span></div>
  <div><span class="n">${dec(m.medianeScore, 2)}</span><span class="l">mediaan Google-score</span></div>
  <div><span class="n">${nl(m.medianRecent)}</span><span class="l">nieuwe reviews per 2&nbsp;jaar, mediaan</span></div>
</div>

<section>
  <p class="sec-label">Afbakening</p>
  <div class="col">
    <h2>${k.omvang}</h2>
    <p class="lede">Een zoektocht naar ${esc(m.vakMv)} in deze regio levert ${nl(m.gevonden)}
    bedrijven op. Lang niet allemaal leggen ze daadwerkelijk daken, en lang niet allemaal laten
    ze genoeg publiek spoor na om er iets over te kunnen zeggen. Zo blijft de groep over waar
    dit rapport over gaat.</p>
  </div>
  <div class="funnel">
${trechterHTML}
  </div>
  <p class="note">De grootste stap is de eerste: ${nl(m.gevonden - m.beoordeelbaar)} bedrijven hebben
  te weinig reviews om te beoordelen. Dat betekent niet dat ze slecht werk leveren &mdash; het
  betekent dat er publiek te weinig over hen te vinden is${m.geenSpecialist > 0
    ? `. Van wie wél genoeg reviews heeft, vielen er nog eens ${nl(m.geenSpecialist)} af omdat hun
  eigen website laat zien dat ze hoofdzakelijk iets anders doen` : ''}.</p>
</section>

<section>
  <p class="sec-label">Reviewvolume</p>
  <div class="col">
    <h2>${k.volume}</h2>
    <p class="lede">Samen verzamelden deze ${nl(m.aantal)} ${esc(m.vakMv)}
    <span class="fig">${nl(m.totaalReviews)}</span> reviews. Het gemiddelde bedrijf heeft er
    ${nl(Math.round(m.gemiddeldVolume))}, de d&oacute;&oacute;rsnee ${esc(m.vakEv)}
    ${nl(m.medianeVolume)} &mdash; en de drukste ${nl(m.hoogsteVolume)}.</p>
  </div>
  <div class="hbars">
${m.volumeVerdeling.rijen.map((r) => staafRij(r.label, r.aantal, m.volumeVerdeling.max)).join('\n')}
  </div>
  <p class="axis-note">Aantal bedrijven per schijf &middot; schaal 0 &ndash; ${m.volumeVerdeling.max}</p>
  <p class="note">De drukste ${nl(m.kwartGrootte)} bedrijven &mdash; een kwart van de groep &mdash;
  hebben samen <strong>${dec(m.aandeelDrukste, 0)}%</strong> van alle reviews in dit rapport.
  Bij een gelijke verdeling zou dat 25% zijn.</p>
</section>

<section>
  <p class="sec-label">Sterren</p>
  <div class="col">
    <h2>${k.sterren}</h2>
    <p class="lede">De mediaan ligt op <span class="fig">${dec(m.medianeScore, 2)}</span>.
    ${m.perfect === 0 ? 'Geen enkel bedrijf staat op een perfecte 5,0.'
      : `${nl(m.perfect)} ${m.perfect === 1 ? 'bedrijf staat' : 'bedrijven staan'} op een perfecte 5,0
    &mdash; waarvan ${nl(m.perfectStevig)} met 25 reviews of meer. Een vlekkeloze score zegt vooral
    iets zolang er genoeg reviews onder liggen.`}</p>
  </div>
  <div class="hbars">
${m.sterVerdeling.rijen.map((r) => staafRij(r.label, r.aantal, m.sterVerdeling.max)).join('\n')}
  </div>
  <p class="axis-note">Aantal bedrijven per scoreschijf &middot; n = ${nl(m.aantal)} &middot; schaal 0 &ndash; ${m.sterVerdeling.max}</p>
</section>

<section>
  <p class="sec-label">Activiteit</p>
  <div class="col">
    <h2>${k.activiteit}</h2>
    <p class="lede">Reviews vergaan niet, maar ze verouderen wel. Iedereen in dit rapport haalt
    minstens ${m.drempelRecent} nieuwe reviews in twee jaar &mdash; dat is de toegangseis. De vraag
    is hoe ver de actieven onderling uiteenlopen. De drukste haalde er ${nl(m.drukste)}.</p>
  </div>
  <div class="hbars">
${m.activiteitVerdeling.rijen.map((r) => staafRij(r.label, r.aantal, m.activiteitVerdeling.max)).join('\n')}
  </div>
  <p class="axis-note">Nieuwe reviews in de 24 maanden tot de peildatum &middot; n = ${nl(m.aantal)} &middot; schaal 0 &ndash; ${m.activiteitVerdeling.max}</p>
</section>

<section>
  <p class="sec-label">Groei</p>
  <div class="col">
    <h2>${k.groei}</h2>
    <p class="lede">Hoeveel reviews klanten er elk jaar bij schrijven over de ${esc(m.vakMv)} in
    dit rapport, en of dat tempo aanhoudt.</p>
  </div>
  <div class="vchart">
    <div class="vcols">
${jaarKolommen}
    </div>
    <div class="vlabels">${jaarLabels}</div>
  </div>
  <p class="axis-note">Nieuwe reviews per jaar &middot; schaal 0 &ndash; ${nl(m.jaarMax)}${m.raming !== null ? ' &middot; gearceerd = raming voor de rest van ' + m.peilJaar : ''}</p>
${m.raming !== null ? `  <p class="note">Op de peildatum was ${pct(m.verstreken, 1)}% van ${m.peilJaar}
  verstreken, met ${nl(m.dit)} reviews. Doorgetrokken komt dat op ongeveer
  <strong>${nl(m.raming)}</strong> &mdash; tegenover ${nl(m.vorig)} in ${m.peilJaar - 1}.</p>` : ''}
</section>

<section>
  <p class="sec-label">Seizoen</p>
  <div class="col">
    <h2>${k.seizoen}</h2>
    <p class="lede">Over alle jaren heen samengeteld zit er een ritme in wanneer klanten hun
    ${esc(m.vakEv)} beoordelen.</p>
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
    <p class="lede">In welke gemeenten de ${nl(m.aantal)} ${esc(m.vakMv)} uit dit rapport
    gevestigd zijn.</p>
  </div>
  <div class="tablewrap">
    <table>
      <thead><tr>
        <th>Gemeente</th><th class="r">${esc(m.vakMvCap)}</th><th style="width:200px">&nbsp;</th>
      </tr></thead>
      <tbody>
${gemeenteRijen}
      </tbody>
    </table>
  </div>
  <p class="note">Het zoekgebied loopt bewust iets ruimer dan de regio zelf, want een
  ${esc(m.vakEv)} uit een buurgemeente werkt hier net zo goed. Daardoor duiken hier ook
  gemeenten op die net buiten de regio vallen.</p>
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
  Samengesteld uit openbare Google-reviews van ${nl(m.aantal)} bedrijven in
  ${m.gemeentenMetSpecialist} gemeenten${m.oudste ? `. Oudste review in de reeks: ` +
    new Date(m.oudste).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}.<br>
  Keurwijzer &mdash; onafhankelijke kwaliteitsranking per vak en regio.
</footer>

</div>
</body>
</html>
`;
}

// =====================================================================
// Terminalsamenvatting
// =====================================================================
function samenvatting(m) {
  const k = koppen(m);
  console.log('');
  console.log(`MARKTBEELD ${m.slug}  —  peildatum ${m.peildatum}`);
  console.log(`  zoekresultaten            ${nl(m.gevonden)}`);
  console.log(`  genoeg reviews            ${nl(m.beoordeelbaar)}   (>=${m.drempelReviews} reviews en >=${m.drempelRecent} recent)`);
  console.log(`  daarvan vakspecialist     ${nl(m.aantal)}   (vakfocus >= ${dec(m.vakfocusVloer, 1)}; ${nl(m.geenSpecialist)} doen iets anders)`);
  if (m.gepubliceerd) console.log(`  gepubliceerd              ${nl(m.gepubliceerd)}`);
  console.log(`  reviews totaal            ${nl(m.totaalReviews)}   mediaan ${nl(m.medianeVolume)} per bedrijf`);
  console.log(`  drukste kwart (${String(m.kwartGrootte).padStart(2)}) heeft  ${dec(m.aandeelDrukste, 0)}% van alle reviews`);
  console.log(`  mediane score             ${dec(m.medianeScore, 2)}   (${m.perfect} op 5,0)`);
  console.log(`  mediaan recent (24m)      ${nl(m.medianRecent)}   drukste ${nl(m.drukste)}`);
  console.log(`  ${m.peilJaar - 1} -> ${m.peilJaar}              ${nl(m.vorig)} -> ${m.raming !== null ? nl(m.raming) + ' (raming)' : nl(m.dit)}`);
  console.log(`  drukste maand             ${m.maandMax.naam} (${dec(m.maandMax.aandeel, 1)}%), stilste ${m.maandMin.naam} (${dec(m.maandMin.aandeel, 1)}%)`);
  if (m.afgekapt) console.log(`  ! afgekapte reviewlijsten ${m.afgekapt}  (weg uit jaar- en maandgrafiek)`);
  console.log(`  kop: "${k.volume}"`);
}

// =====================================================================
// Uitvoeren
// =====================================================================
function maak(slug, { stil = false } = {}) {
  const gevondenConfig = vindConfig(slug);
  if (!gevondenConfig) {
    console.error(`Geen config gevonden voor "${slug}". Verwacht: config/<niche>/${slug}.json`);
    process.exit(1);
  }
  const config = { slug, ...gevondenConfig.config };
  if (!config.gemeenten || !config.gemeenten.length) {
    console.error(`config van ${slug} heeft geen gemeentelijst — zonder die filter klopt het rapport niet.`);
    process.exit(1);
  }

  const reviewsPad = path.join(ROOT, 'data', slug, 'reviews.json');
  const beoordelingPad = path.join(ROOT, 'data', slug, 'beoordeling.json');
  if (!fs.existsSync(reviewsPad)) {
    console.error(`data/${slug}/reviews.json bestaat niet. Draai eerst: node scripts/normalize.js ${slug}`);
    process.exit(1);
  }
  // Zonder beoordeling kennen we de vakfocus niet, en dan valt de enige eerlijke
  // afbakening weg. Dan liever geen rapport dan een rapport over koffiehuizen.
  if (!fs.existsSync(beoordelingPad)) {
    console.error(`data/${slug}/beoordeling.json bestaat niet — zonder vakfocus kan dit rapport ` +
      `niet weten wie een ${config.vak.ev} is. Geen rapport gemaakt.`);
    process.exit(1);
  }

  const ruw = JSON.parse(fs.readFileSync(reviewsPad, 'utf8'));
  if (!Array.isArray(ruw)) {
    console.error(`data/${slug}/reviews.json heeft niet de verwachte vorm (een lijst bedrijven).`);
    process.exit(1);
  }
  const beoordeling = JSON.parse(fs.readFileSync(beoordelingPad, 'utf8'));
  const vakfocusVan = new Map((beoordeling.bedrijven || []).map((b) => [b.bedrijf, b.vakfocus]));

  // Hoeveel er gepubliceerd staan komt uit het selectieslot, niet uit een
  // herberekening: dit rapport mag nooit zelf een selectie uitrekenen.
  let gepubliceerd = null;
  const selectiePad = path.join(ROOT, 'data', slug, 'selectie.json');
  if (fs.existsSync(selectiePad)) {
    const sel = JSON.parse(fs.readFileSync(selectiePad, 'utf8'));
    if (Array.isArray(sel.bedrijven)) gepubliceerd = sel.bedrijven.length;
  }

  const m = bereken({
    ruw, vakfocusVan, config, gepubliceerd,
    gemeentenOfficieel: officieelAantalGemeenten(config),
  });

  if (m.aantal < MIN_VOOR_RAPPORT) {
    const regel = `${slug}: ${m.aantal} ${config.vak.mv} — te weinig voor een rapport ` +
      `(ondergrens ${MIN_VOOR_RAPPORT}). Bij zo'n kleine groep wijst elk cijfer naar een ` +
      `herkenbaar bedrijf en is elk aandeel bijna 100%.`;
    if (stil) { console.log('  overgeslagen — ' + regel); return null; }
    console.error(regel);
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
  let gemaakt = 0;
  for (const s of alle) if (maak(s, { stil: true })) gemaakt++;
  console.log(`\n${gemaakt} marktrapporten gemaakt, ${alle.length - gemaakt} overgeslagen (te klein).`);
} else if (!slugs.length) {
  console.error('Gebruik: node scripts/marktbeeld.js <slug> [--open]   of   --alle');
  console.error('Beschikbaar: ' + alleSlugs().join(', '));
  process.exit(1);
} else {
  const laatste = maak(slugs[0]);
  if (open && laatste) execFile('cmd', ['/c', 'start', '', laatste], () => {});
}
