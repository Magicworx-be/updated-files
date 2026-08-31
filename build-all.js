#!/usr/bin/env node
// =====================================================================
// build-all.js — de "systeembrede check". Herbouwt de VOLLEDIGE site uit
// de registry en garandeert dat alle onderlinge links consistent zijn.
//
// Waarom nodig: `build-site.js` ververst enkel de hubs, de homepage en de
// sitemap. De detailpagina's blijven staan zoals ze ooit gebouwd zijn, terwijl
// ze wél meeveranderen met het sjabloon, de methodiek en de WhatsApp-lijst.
// Dit script herbouwt daarom álles uit dezelfde registry, zodat de site nooit
// half oud en half nieuw is.
//
// Let op — dit stond hier ooit anders beschreven: detailpagina's linken sinds
// de herziening van "Verder kijken" bewust alleen naar hun eigen twee hubs,
// nooit meer naar zusterpagina's. Een regio of niche toevoegen kán hun links
// dus niet doen verouderen; de volledige, actuele lijst staat op de hubs, die
// clientside uit registry.json laden.
//
// Extra: het vergelijkt de output vóór en ná de build en toont exact welke
// pagina's veranderd of nieuw zijn — dat is wat er bij het publiceren live gaat.
//
// Gebruik:  node build-all.js
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const R = require('./lib/registry');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'output');

function deployFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return deployFiles(p);
    return (e.name.endsWith('.html') || e.name === 'sitemap.xml') ? [p] : [];
  });
}
function snapshot() {
  const m = new Map();
  for (const f of deployFiles(OUT)) {
    m.set(path.relative(OUT, f).replace(/\\/g, '/'),
      crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex'));
  }
  return m;
}
function relToUrl(rel) {
  if (rel === 'sitemap.xml') return '/sitemap.xml';
  if (rel === 'index.html') return '/';
  return '/' + rel.replace(/\/index\.html$/, '') + '/';
}

const registry = R.loadRegistry(ROOT);
if (!registry.length) { console.error('Geen configs in config/<niche>/.'); process.exit(1); }

// WhatsApp-nummers: build.js controleert per pagina of de bedrijfsnaam bestaat,
// maar een tikfout in de *slug* ziet hij nooit — die regel hoort dan bij geen
// enkele pagina en verdwijnt stil. Hier, waar alle slugs bekend zijn, wél.
{
  const WA = require('./lib/whatsapp');
  const { rijen, fouten } = WA.load(ROOT);
  const bekend = new Set(registry.map(p => p.slug));
  const zoek = rijen.filter(r => !bekend.has(r.slug))
    .map(r => '"' + r.bedrijf + '": regio-slug "' + r.slug + '" bestaat niet');
  const alles = fouten.concat(zoek);
  if (alles.length) {
    console.error('FOUT in data/whatsapp.json:\n  - ' + alles.join('\n  - '));
    process.exit(1);
  }
}

// Het vakgebiedenraster op homepage.html is het enige stuk navigatie dat NIET
// uit de registry komt: elke kaart heeft een eigen icoon, naam en onderschrift,
// en die staan nergens in een config. Gaat een niche live zonder kaart, dan
// ontbreekt ze stil op de homepage terwijl ze wél in het menu en de sitemap
// staat. Staat er omgekeerd een kaart op "live" voor een niche die niet bestaat,
// dan linkt de homepage naar een 404. Geen van beide zie je aan de pagina zelf.
// Waarschuwing, geen harde stop: de rest van de site is volledig geldig.
function homepageKaarten() {
  const bestand = path.join(ROOT, 'homepage.html');
  if (!fs.existsSync(bestand)) return null;
  // uitgecommentarieerde kaarten tellen niet mee — die staan niet op de pagina
  const html = fs.readFileSync(bestand, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const kaarten = new Map();
  const re = /<[a-z]+\b[^>]*\bdata-niche="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const status = (m[0].match(/\bdata-status="([^"]+)"/) || [])[1] || 'soon';
    kaarten.set(m[1], status);
  }
  return kaarten;
}

const homepageMeldingen = [];
{
  const kaarten = homepageKaarten();
  if (kaarten) {
    for (const n of R.niches(registry)) {
      if (kaarten.has(n.niche)) continue;
      homepageMeldingen.push([
        'Niche "' + n.niche + '" (' + n.vakMvCap + ') staat live, maar heeft GEEN kaart in het',
        '  vakgebiedenraster van homepage.html. Bezoekers zien ze daar dus niet staan.',
        '  → Voeg een kaart toe met data-niche="' + n.niche + '". De uitleg staat vlak boven',
        '    <section id="niches"> in homepage.html; de kaart zet zichzelf op "Online".',
      ].join('\n'));
    }
    const bestaandeNiches = new Set(registry.map(p => p.niche));
    for (const [niche, status] of kaarten) {
      if (status !== 'live' || bestaandeNiches.has(niche)) continue;
      homepageMeldingen.push([
        'De kaart data-niche="' + niche + '" op homepage.html staat op "live", maar er is geen',
        '  config/' + niche + '/ — die link geeft een 404.',
        '  → Zet ze terug op data-status="soon", of controleer de spelling van de mapnaam.',
      ].join('\n'));
    }
  }
}

const before = snapshot();

// 1) alle detailpagina's herbouwen (sjabloon, scores, broodkruimel, WhatsApp)
console.log('› ' + registry.length + ' detailpagina\'s herbouwen...');
const mislukt = [];
for (const p of registry) {
  try {
    execFileSync('node', [path.join(ROOT, 'build.js'), p.slug], { stdio: ['ignore', 'ignore', 'inherit'] });
  } catch {
    mislukt.push(p.slug);
    console.error('  ! ' + p.slug + ' faalde (ontbrekende data?) — overgeslagen');
  }
}

// 2) hubs, homepage en sitemap
console.log('› hubs, homepage en sitemap...');
execFileSync('node', [path.join(ROOT, 'build-site.js')], { stdio: ['ignore', 'ignore', 'inherit'] });

// 2b) registry.json genereren — compacte JSON-export van alle navigatiedata,
//     zodat hub- en homepage-navigatie clientside uit dit bestand kan laden.
console.log('› registry.json genereren...');
const gepland = R.loadPlannedRegions(ROOT);
const registryJson = {
  // VOLLEDIGE tijdstempel, niet enkel de datum. De hubs halen registry.json bij
  // twee bronnen op (jsDelivr + raw GitHub) en kiezen de VERSTE op dit veld; met
  // dagprecisie zijn twee versies van dezelfde dag niet te onderscheiden — precies
  // het geval op 2026-08-28, toen jsDelivr een oudere kopie van diezelfde dag
  // serveerde. Bijkomend voordeel: registry.json verschilt nu bij élke build, dus
  // push-registry.js commit + purget altijd (voorheen sloeg hij bij identieke
  // inhoud over, waardoor de CDN-cache nooit ververst werd).
  _generated: new Date().toISOString(),
  _origin: R.SITE_ORIGIN,
  pages: registry.map(p => ({
    slug:       p.slug,
    niche:      p.niche,
    url:        p.url,
    vakMv:      p.vakMv,
    vakMvCap:   p.vakMvCap,
    regioSlug:  p.regioSlug,
    regioKern:  p.regioKern,
    regioNaam:  p.regioNaam,
    regioUrl:   p.regioUrl,
    nicheUrl:   p.nicheUrl,
    provincie:  p.provincie,
    gemeenten:  p.gemeenten.length,
  })),
  niches: R.niches(registry).map(n => ({
    niche:    n.niche,
    url:      n.url,
    vakMv:    n.vakMv,
    vakMvCap: n.vakMvCap,
    count:    n.count,
  })),
  regios: R.regios(registry).map(r => ({
    regioSlug: r.regioSlug,
    url:       r.url,
    regioKern: r.regioKern,
    regioNaam: r.regioNaam,
    provincie: r.provincie,
    count:     r.count,
  })),
  // Volledige regio-indeling uit regions.txt (alle 29, óók de al gebouwde).
  // De hub trekt hier clientside `pages` van af; wat overblijft toont hij als
  // "Binnenkort". Zo verdwijnt dat label vanzelf zodra een regio live gaat —
  // er is geen label om weg te halen. Zie lib/registry.js § loadPlannedRegions.
  planned: gepland,
  plannedMinLive: R.PLANNED_MIN_LIVE,
};
fs.writeFileSync(path.join(OUT, 'registry.json'), JSON.stringify(registryJson));
console.log('✓ output/registry.json  (' + registry.length + ' pagina\'s, ' +
  registryJson.niches.length + ' niches, ' + registryJson.regios.length + ' regio\'s, ' +
  gepland.length + ' geplande regio\'s)');

// 2c) weesbadges opruimen — badges/<slug> voor slugs die niet meer in de
//     registry zitten (bv. na verwijderen/hernoemen van een regio). Analoog aan
//     de output-opruiming hieronder; zo blijft badges/ (en de live CDN na de
//     push) exact gelijk aan wat de registry beschrijft.
const badgesDir = path.join(ROOT, 'badges');
if (fs.existsSync(badgesDir)) {
  const geldig = new Set(registry.map(p => p.slug));
  for (const e of fs.readdirSync(badgesDir, { withFileTypes: true })) {
    if (e.isDirectory() && !geldig.has(e.name)) {
      fs.rmSync(path.join(badgesDir, e.name), { recursive: true, force: true });
      console.log('  · weesbadges verwijderd: badges/' + e.name);
    }
  }
}

// 2d) kwaliteitsbadges genereren — build.js schreef per pagina badges/<slug>/
//     badges.json weg; de generator maakt daaruit 2 PNG's per gepubliceerd
//     bedrijf (donker/licht). Faalt dit (bv. dependencies niet geïnstalleerd),
//     dan blijft de rest van de build geldig.
console.log('› kwaliteitsbadges genereren...');
try {
  execFileSync('node', [path.join(ROOT, 'scripts', 'genereer-badges.js')], { stdio: 'inherit' });
} catch {
  console.error('  ⚠ badge-generatie mislukt (npm install uitgevoerd?) — build blijft geldig.');
}

// 3) weespagina's opruimen — output die niet meer bij een config hoort
//    (bv. na het verwijderen of hernoemen van een regio/niche). Zo blijft
//    output/ exact gelijk aan wat de registry beschrijft.
const verwacht = new Set(['index.html', 'sitemap.xml', 'registry.json']);
for (const n of R.niches(registry)) verwacht.add(n.niche + '/index.html');
for (const r of R.regios(registry)) verwacht.add('regio/' + r.regioSlug + '/index.html');
for (const p of registry) verwacht.add(p.slug + '/index.html');

for (const f of deployFiles(OUT)) {
  const rel = path.relative(OUT, f).replace(/\\/g, '/');
  if (verwacht.has(rel)) continue;
  fs.rmSync(f);
  const dir = path.dirname(f);
  try { if (dir !== OUT && !fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch { /* niet leeg */ }
}

// 4) diff: wat is er veranderd sinds de vorige build?
const after = snapshot();
const nieuw = [], gewijzigd = [];
for (const [rel, h] of after) {
  if (!before.has(rel)) nieuw.push(rel);
  else if (before.get(rel) !== h) gewijzigd.push(rel);
}
const verwijderd = [...before.keys()].filter(rel => !after.has(rel));

const fmt = list => list.map(relToUrl).sort().map(u => '    ' + u).join('\n');

console.log('\n' + '='.repeat(64));
console.log('KLAAR — ' + after.size + ' pagina\'s. Dit gaat live:');
console.log('='.repeat(64));
if (nieuw.length)      console.log('\n  NIEUW:\n' + fmt(nieuw));
if (gewijzigd.length)  console.log('\n  GEWIJZIGD:\n' + fmt(gewijzigd));
if (verwijderd.length) console.log('\n  VERWIJDERD (gaat offline):\n' + fmt(verwijderd));
if (!nieuw.length && !gewijzigd.length && !verwijderd.length) console.log('\n  Niets veranderd — geen actie nodig.');
if (mislukt.length) console.log('\n  ! Niet gebouwd (data ontbreekt): ' + mislukt.join(', '));
console.log('');

// 6) registry.json pushen naar GitHub (zodat jsDelivr de nieuwe navigatie serveert)
let pushMislukt = false;
try {
  execFileSync('node', [path.join(ROOT, 'lib', 'push-registry.js')], { stdio: 'inherit' });
} catch {
  pushMislukt = true;
  console.error('\n  !! registry.json NIET gepusht naar GitHub.');
  console.error('     → Run handmatig: node lib/push-registry.js');
  console.error('     → Zonder push zien bezoekers de binnenkort-kaarten NIET.');
}

// 7) badge-PNG's pushen naar dezelfde data-repo (jsDelivr serveert de badges)
try {
  execFileSync('node', [path.join(ROOT, 'lib', 'push-badges.js')], { stdio: 'inherit' });
} catch { /* fout wordt al gemeld door push-badges.js */ }

// 8) de statische site publiceren naar Cloudflare (via de site-repo op GitHub).
//    Doet niets zolang GITHUB_SITE_REPO niet in .env staat — de build blijft
//    dan exact werken zoals voorheen.
try {
  execFileSync('node', [path.join(ROOT, 'lib', 'push-site.js')], { stdio: 'inherit' });
} catch { /* fout wordt al gemeld door push-site.js */ }

// 9) als laatste, zodat het niet wegscrollt tussen de push-uitvoer: ontbreekt er
//    een kaart in het vakgebiedenraster van de homepage?
if (homepageMeldingen.length) {
  console.error('\n' + '='.repeat(64));
  console.error('LET OP — vakgebiedenraster op de homepage');
  console.error('='.repeat(64));
  for (const m of homepageMeldingen) console.error('  · ' + m);
  console.error('');
}

if (pushMislukt) {
  console.error('\n⚠⚠  ACTIE VEREIST: node lib/push-registry.js  (zie boven)\n');
  process.exitCode = 1;
}
