#!/usr/bin/env node
// =====================================================================
// build-site.js — bouwt alles wat NIET per bedrijf is:
//   - niche-hubs     output/<niche>/index.html          (/dakwerkers/)
//   - regio-hubs     output/regio/<regioSlug>/index.html (/regio/gent/)
//   - homepage       output/index.html                   (uit homepage.html)
//   - sitemap.xml    output/sitemap.xml
//
// Alles vertrekt uit lib/registry.js (alle config/<niche>/*.json). De
// detailpagina's zelf blijven via `node build.js <slug>` gebouwd worden;
// draai daarna één keer `node build-site.js` om de navigatie te verversen.
//
// Gebruik:  node build-site.js
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./lib/registry');

const ROOT = __dirname;
const origin = R.SITE_ORIGIN;
const HERO_IMG = 'https://assets.cdn.filesafe.space/fgbjON9EFqwVMZW3nImb/media/6a56552b524a3ec4c67a7cac.png';

const GEO_CODES = R.GEO_CODES;   // gedeelde bron in lib/registry.js

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function write(rel, content) {
  const abs = path.join(ROOT, 'output', rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  console.log('✓ output/' + rel.replace(/\\/g, '/'));
}
function fill(tpl, tokens) {
  let out = tpl;
  for (const [k, v] of Object.entries(tokens)) out = out.split('{{' + k + '}}').join(v);
  const rest = out.match(/{{[A-Z_]+}}/g);
  if (rest) throw new Error('niet-ingevulde tokens: ' + [...new Set(rest)].join(', '));
  return out;
}
function plural(n, ev, mv) { return n + ' ' + (n === 1 ? ev : mv); }

const registry = R.loadRegistry(ROOT);
if (!registry.length) { console.error('Geen configs gevonden in config/<niche>/.'); process.exit(1); }
const hubTpl = fs.readFileSync(path.join(ROOT, 'hub.html'), 'utf8');

function breadcrumb(levels) {
  // levels: [{name, href|null}] — laatste is de huidige pagina.
  const nav = levels.map((l, i) => {
    const last = i === levels.length - 1;
    const el = last
      ? '<span aria-current="page">' + esc(l.name) + '</span>'
      : '<a href="' + esc(l.href) + '">' + esc(l.name) + '</a>';
    return (i ? '<span class="crumb-sep" aria-hidden="true">›</span>' : '') + el;
  }).join('');
  const items = JSON.stringify(levels.map((l, i) => ({
    '@type': 'ListItem', position: i + 1, name: l.name,
    item: l.href ? origin + l.href : l.canonical,
  })));
  return { nav, items };
}

// ---------------- niche-hubs ------------------------------------------
for (const n of R.niches(registry)) {
  const canonical = origin + n.url;
  const crumb = breadcrumb([{ name: 'Keurwijzer', href: '/' }, { name: n.vakMvCap, canonical }]);
  // Bewust ZONDER ItemList: die lijst veranderde bij elke nieuwe regio, waardoor
  // deze hub telkens opnieuw in GHL geplakt moest worden — en een statische kopie
  // veroudert bovendien zodra je een regio toevoegt. hub.html injecteert de
  // ItemList nu clientside uit registry.json (altijd actueel, enkel live pagina's).
  // Wat hier overblijft is stabiel per hub en hoeft dus nooit meer bijgewerkt.
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    '@id': canonical + '#collection', url: canonical,
    name: n.vakMvCap + ' per regio — Keurwijzer',
    inLanguage: 'nl-BE',
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: JSON.parse(crumb.items) },
  }, null, 1);

  const metaDesc = 'Ontdek de best beoordeelde ' + n.vakMv + ' per regio in België. ' +
    'Keurwijzer selecteert per regio de sterkste ' + n.vakMv + ' volgens een vaste, publieke methodiek op basis van Google-reviews en vakspecialiteit.';

  write(path.join(n.niche, 'index.html'), fill(hubTpl, {
    TITLE: n.vakMvCap + ' per regio — Keurwijzer',
    META_DESC: esc(metaDesc), CANONICAL: canonical, GEO_REGION: 'BE-VLG', OG_IMAGE: HERO_IMG,
    JSONLD: jsonld,
    NAV_LINKS: '<a href="/#niches">Vakgebieden</a>\n      <a href="/#methodiek">Methodiek</a>',
    BREADCRUMB_NAV: crumb.nav,
    EYEBROW: 'Vakgebied',
    H1: 'De beste ' + n.vakMv + ' per regio',
    INTRO: 'Kies je regio. Per regio selecteert Keurwijzer de best beoordeelde ' + n.vakMv +
      ' volgens één vaste, publieke methodiek — op basis van klantreviews en vakspecialiteit, zonder betaalde plaatsen.',
    HUB_TYPE: 'niche',
    HUB_KEY: n.niche,
    FOOT_SECTOR_LINKS: '<a href="' + esc(n.url) + '">Alle regio’s voor ' + esc(n.vakMv) + '</a>\n        <a href="/">Alle vakgebieden</a>',
  }));
}

// ---------------- regio-hubs ------------------------------------------
for (const r of R.regios(registry)) {
  const canonical = origin + r.url;
  const crumb = breadcrumb([{ name: 'Keurwijzer', href: '/' }, { name: 'Regio ' + r.regioKern, canonical }]);
  const geo = GEO_CODES[R.norm(r.provincie || '')] || 'BE';
  // Zelfde reden als bij de niche-hub: ItemList clientside (zie hub.html), zodat
  // deze hub niet opnieuw geplakt hoeft te worden als er een niche bijkomt.
  const jsonld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'CollectionPage',
    '@id': canonical + '#collection', url: canonical,
    name: 'Vakspecialisten in ' + r.regioNaam + ' — Keurwijzer',
    inLanguage: 'nl-BE',
    breadcrumb: { '@type': 'BreadcrumbList', itemListElement: JSON.parse(crumb.items) },
  }, null, 1);

  const metaDesc = 'De best beoordeelde vakspecialisten in ' + r.regioNaam + ', per vakgebied. ' +
    'Keurwijzer selecteert per regio de sterkste bedrijven volgens een vaste, publieke methodiek.';

  write(path.join('regio', r.regioSlug, 'index.html'), fill(hubTpl, {
    TITLE: 'Vakspecialisten in ' + r.regioNaam + ' — Keurwijzer',
    META_DESC: esc(metaDesc), CANONICAL: canonical, GEO_REGION: geo, OG_IMAGE: HERO_IMG,
    JSONLD: jsonld,
    NAV_LINKS: '<a href="/#niches">Vakgebieden</a>\n      <a href="/#methodiek">Methodiek</a>',
    BREADCRUMB_NAV: crumb.nav,
    EYEBROW: 'Regio',
    H1: 'Vakspecialisten in ' + r.regioNaam,
    INTRO: 'Kies een vakgebied. Voor ' + r.regioNaam + ' toont Keurwijzer per vakgebied de best beoordeelde ' +
      'bedrijven, geselecteerd volgens één vaste, publieke methodiek.',
    HUB_TYPE: 'regio',
    HUB_KEY: r.regioSlug,
    FOOT_SECTOR_LINKS: '<a href="' + esc(r.url) + '">Alles in ' + esc(r.regioNaam) + '</a>\n        <a href="/">Alle vakgebieden</a>',
  }));
}

// ---------------- homepage: kopiëren naar output (navigatie is nu clientside) --
const homepagePath = path.join(ROOT, 'homepage.html');
if (fs.existsSync(homepagePath)) {
  let hp = fs.readFileSync(homepagePath, 'utf8');
  const rest = hp.match(/{{[A-Z_]+}}/g);
  if (rest) console.warn('! WAARSCHUWING: homepage.html bevat niet-ingevulde tokens: ' +
    [...new Set(rest)].join(', ') + ' — controleer homepage.html');
  fs.mkdirSync(path.join(ROOT, 'output'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'output', 'index.html'), hp);
  console.log('✓ output/index.html  (homepage)');
}

// ---------------- sitemap.xml -----------------------------------------
const urls = [origin + '/'];
for (const n of R.niches(registry)) urls.push(origin + n.url);
for (const r of R.regios(registry)) urls.push(origin + r.url);
for (const p of registry) urls.push(origin + p.url);
const today = new Date().toISOString().slice(0, 10);
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => '  <url><loc>' + esc(u) + '</loc><lastmod>' + today + '</lastmod></url>').join('\n') +
  '\n</urlset>\n';
write('sitemap.xml', sitemap);

// ---------------- robots.txt ------------------------------------------
// Keurwijzer wil maximaal vindbaar zijn: in klassieke zoekmachines én in
// AI-assistenten. De Content-Signal-regel maakt die toestemming expliciet in
// plaats van ze aan de standaardinstelling van de host over te laten.
//   search   = opgenomen worden in een zoekindex
//   ai-input = gebruikt worden om een vraag van een gebruiker te beantwoorden
//   ai-train = gebruikt worden om modellen te trainen
write('robots.txt',
  'User-agent: *\n' +
  'Allow: /\n' +
  'Content-Signal: search=yes,ai-input=yes,ai-train=yes\n\n' +
  'Sitemap: ' + origin + '/sitemap.xml\n');

console.log('\nKlaar: ' + R.niches(registry).length + ' niche-hub(s), ' +
  R.regios(registry).length + ' regio-hub(s), ' + registry.length + ' detailpagina(\'s) in de sitemap.');
