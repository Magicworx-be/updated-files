#!/usr/bin/env node
// =====================================================================
// build-all.js — de "systeembrede check". Herbouwt de VOLLEDIGE site uit
// de registry en garandeert dat alle onderlinge links consistent zijn.
//
// Waarom nodig: `build-site.js` vervimt de hubs/homepage/sitemap (die lezen
// enkel de configs), maar de kruislinks (naburige regio's, andere vakgebieden)
// zitten gebakken in élke detailpagina en worden pas vernieuwd bij een rebuild
// van díe pagina. Voeg je een regio/niche toe, dan moeten de buurpagina's dus
// mee herbouwd worden. Dit script doet dat voor alles ineens.
//
// Extra: het vergelijkt de output vóór en ná de build en toont exact welke
// pagina's veranderd of nieuw zijn — dat is je "in GHL bijwerken"-lijst.
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

// ---- GHL-plakbundels: elke gewijzigde pagina opsplitsen in de stukken die
//      GHL nodig heeft, zodat inplakken puur kopiëren/plakken is. -----------
const GHL = path.join(ROOT, 'ghl');
function grijp(re, s) { const m = s.match(re); return m ? m[1].trim() : ''; }
function ghlNaam(rel) {
  const u = relToUrl(rel);
  return u === '/' ? 'home' : u.replace(/^\/|\/$/g, '').replace(/\//g, '-');
}
function ghlPad(rel) {
  const u = relToUrl(rel);
  return u === '/' ? '(leeg laten = homepage)' : u.replace(/^\/|\/$/g, '');
}
function extractMeta(html) {
  return {
    title:     grijp(/<title>([\s\S]*?)<\/title>/i, html),
    meta:      grijp(/<meta name="description" content="([^"]*)"/i, html),
    canonical: grijp(/<link rel="canonical" href="([^"]*)"/i, html),
    ogTitle:   grijp(/property="og:title" content="([^"]*)"/i, html),
    ogDesc:    grijp(/property="og:description" content="([^"]*)"/i, html),
    ogImage:   grijp(/property="og:image" content="([^"]*)"/i, html),
  };
}
function seoVelden(rel, m) {
  return 'GHL Path:         ' + ghlPad(rel) + '\n' +
    'Paginatitel:      ' + m.title + '\n' +
    'Meta-description: ' + m.meta + '\n' +
    'Canonical URL:    ' + m.canonical + '\n' +
    'OG-titel:         ' + m.ogTitle + '\n' +
    'OG-beschrijving:  ' + m.ogDesc + '\n' +
    'OG-afbeelding:    ' + m.ogImage + '\n';
}
function schrijfGhlBundle(rel) {
  const html = fs.readFileSync(path.join(OUT, rel), 'utf8');
  const head = html.split(/<body\b[^>]*>/i)[0] || '';
  const bodyInner = (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [, ''])[1];
  const jsonld = (html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi) || []).join('\n\n');
  const headLinks = (head.match(/<link\b[^>]*>/gi) || [])
    .filter(l => /rel="(preconnect|stylesheet)"/i.test(l)).join('\n');
  const headStyles = (head.match(/<style>[\s\S]*?<\/style>/gi) || []).join('\n');
  const block = [headLinks, headStyles, bodyInner].filter(Boolean).join('\n\n');

  const dir = path.join(GHL, ghlNaam(rel));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SEO-velden.txt'), seoVelden(rel, extractMeta(html)));
  fs.writeFileSync(path.join(dir, 'header-code.txt'), jsonld + '\n');
  fs.writeFileSync(path.join(dir, 'body.txt'), block + '\n');
}
// Altijd-actueel naslagwerk: metadata van ÁLLE live pagina's op één plek.
function schrijfMetadataOverzicht() {
  const paginas = deployFiles(OUT).filter(f => f.endsWith('index.html'))
    .map(f => path.relative(OUT, f).replace(/\\/g, '/')).sort();
  let out = 'KEURWIJZER — METADATA-OVERZICHT VOOR GHL\n' +
    'Gegenereerd: ' + new Date().toISOString().slice(0, 10) + '  ·  ' + paginas.length + ' pagina\'s\n\n' +
    'Vul deze velden in bij elke pagina in de SEO-tab van GHL. NIET in de body plakken —\n' +
    'title/description/canonical worden daar niet gelezen (JSON-LD mag wél in de body).\n' +
    '='.repeat(72) + '\n\n';
  for (const rel of paginas) {
    out += seoVelden(rel, extractMeta(fs.readFileSync(path.join(OUT, rel), 'utf8'))) +
      '-'.repeat(72) + '\n\n';
  }
  fs.mkdirSync(GHL, { recursive: true });
  fs.writeFileSync(path.join(GHL, '_METADATA-overzicht.txt'), out);
}

const registry = R.loadRegistry(ROOT);
if (!registry.length) { console.error('Geen configs in config/<niche>/.'); process.exit(1); }

const before = snapshot();

// 1) alle detailpagina's herbouwen (dit vernieuwt hun kruislinks + broodkruimel)
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

// 4) diff: wat moet er in GHL bijgewerkt worden?
const after = snapshot();
const nieuw = [], gewijzigd = [];
for (const [rel, h] of after) {
  if (!before.has(rel)) nieuw.push(rel);
  else if (before.get(rel) !== h) gewijzigd.push(rel);
}
const verwijderd = [...before.keys()].filter(rel => !after.has(rel));

// 5) GHL-plakbundels vernieuwen: ghl/ bevat na de build enkel de pagina's die
//    je moet in-/bijwerken — elk opgesplitst in SEO-velden, header-code en body.
fs.rmSync(GHL, { recursive: true, force: true });
const teplakken = [...nieuw, ...gewijzigd].filter(rel => rel !== 'sitemap.xml');
for (const rel of teplakken) schrijfGhlBundle(rel);
schrijfMetadataOverzicht(); // altijd: volledige metadata van álle pagina's
fs.writeFileSync(path.join(GHL, '_LEES-MIJ.txt'),
  'ghl/ = werkmap voor het overzetten naar GHL (NIET uploaden). Bij elke build-all opnieuw gemaakt.\n\n' +
  '_METADATA-overzicht.txt → metadata (SEO-velden) van ÁLLE live pagina\'s, altijd actueel.\n\n' +
  'Per pagina die je moet aanmaken/bijwerken staat er ook een mapje met drie bestanden:\n' +
  '  SEO-velden.txt   → GHL Path + titel + meta-description + canonical + OG (SEO-tab van de pagina)\n' +
  '  header-code.txt  → in de Header/Tracking-code van de pagina plakken (JSON-LD schema)\n' +
  '  body.txt         → in één Custom HTML/Code-element op de pagina plakken (bevat ook de CSS)\n\n' +
  'Let op: title/description/canonical MOETEN in de SEO-tab (niet in de body — daar leest GHL ze niet).\n' +
  'sitemap.xml en robots.txt staan in output/ en publiceer je apart (zie WIJZIGINGEN.md).\n');

const fmt = list => list.map(relToUrl).sort().map(u => '    ' + u).join('\n');

console.log('\n' + '='.repeat(64));
console.log('KLAAR — ' + after.size + ' pagina\'s. In GHL bijwerken:');
console.log('='.repeat(64));
if (nieuw.length)      console.log('\n  NIEUW (pagina aanmaken in GHL):\n' + fmt(nieuw));
if (gewijzigd.length)  console.log('\n  GEWIJZIGD (HTML opnieuw plakken):\n' + fmt(gewijzigd));
if (verwijderd.length) console.log('\n  VERWIJDERD (pagina uit GHL halen):\n' + fmt(verwijderd));
if (!nieuw.length && !gewijzigd.length && !verwijderd.length) console.log('\n  Niets veranderd — geen actie nodig.');
if (mislukt.length) console.log('\n  ! Niet gebouwd (data ontbreekt): ' + mislukt.join(', '));
if (teplakken.length) console.log('\n  → Kant-en-klare plakbestanden:  ghl/  (' + teplakken.length + ' pagina\'s)');
console.log('  → Metadata van álle pagina\'s:   ghl/_METADATA-overzicht.txt');
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

// 8) de statische site publiceren (vervangt het handmatig plakken in GHL).
//    Doet niets zolang GITHUB_SITE_REPO niet in .env staat — de build blijft
//    dan exact werken zoals voorheen.
try {
  execFileSync('node', [path.join(ROOT, 'lib', 'push-site.js')], { stdio: 'inherit' });
} catch { /* fout wordt al gemeld door push-site.js */ }

if (pushMislukt) {
  console.error('\n⚠⚠  ACTIE VEREIST: node lib/push-registry.js  (zie boven)\n');
  process.exitCode = 1;
}
