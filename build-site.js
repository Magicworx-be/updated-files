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
const crypto = require('crypto');
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

// =====================================================================
// HUB-KAARTEN — serverside gerenderd
//
// Deze kaarten stonden vroeger alleen in het clientside script van hub.html:
// de HTML bevatte enkel een lege <div> en "Navigatie wordt geladen…". Gevolg
// was dat er op de hele site GEEN ENKELE crawlbare link naar een detailpagina
// stond. Google voert JavaScript uit, maar in een tweede, trage golf; Bing,
// DuckDuckGo en de AI-antwoordmachines doen dat niet. De detailpagina's waren
// dus wezen, enkel vindbaar via de sitemap, zonder interne linkwaarde.
//
// De reden waarom het ooit clientside moest — de hubs met de hand in GHL
// plakken — bestaat niet meer sinds lib/push-site.js alles automatisch
// publiceert. De registry zit hier toch al in het geheugen, dus renderen we de
// kaarten gewoon in de HTML. Het script in hub.html blijft staan als
// VERVERSING: het vervangt deze kaarten zodra registry.json geladen is, zodat
// een hub die tussen twee builds door achterloopt zichzelf bijhaalt.
//
// De opmaak hieronder is bewust identiek aan die van de clientside functies in
// hub.html (zelfde klassen, zelfde volgorde, zelfde teksten). Wijk je hier af,
// wijk dan daar mee af — anders springt de pagina zichtbaar om zodra het
// script klaar is.
// =====================================================================
function hubCard(url, name, meta) {
  return '<a class="hubcard" href="' + esc(url) + '">' +
    '<span class="hubcard-body"><span class="hubcard-name">' + esc(name) + '</span>' +
    (meta ? '<span class="hubcard-meta">' + esc(meta) + '</span>' : '') + '</span>' +
    '<span class="hubcard-arr" aria-hidden="true">→</span></a>';
}

// Nog niet gebouwde regio: wél tonen, bewust GEEN link (die zou een 404 geven).
function soonCard(name, meta) {
  return '<div class="hubcard hubcard-soon">' +
    '<span class="hubcard-body"><span class="hubcard-name">' + esc(name) + '</span>' +
    (meta ? '<span class="hubcard-meta">' + esc(meta) + '</span>' : '') + '</span>' +
    '<span class="soon-pill">Binnenkort</span></div>';
}

// De ItemList hoort óók in de HTML te staan, om exact dezelfde reden als de
// kaarten. Enkel LIVE pagina's — een ItemList mag nooit naar een 404 wijzen.
function hubItemList(titel, items) {
  if (!items.length) return '{}';
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: titel,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, url: origin + it.url,
    })),
  }, null, 1);
}

// Niche-hub: alle regio's voor deze niche, gegroepeerd per provincie, met de
// nog niet gebouwde regio's als grijze "binnenkort"-kaart erachter.
function nicheHubCards(pages, planned) {
  const perProv = {};
  const bucket = prov => (perProv[prov || 'Overig'] = perProv[prov || 'Overig'] || []);
  pages.forEach(p => bucket(p.provincie).push({
    kern: p.regioKern || p.regioNaam, live: 1,
    html: hubCard(p.url, p.regioNaam, plural(p.gemeenten.length, 'gemeente', 'gemeenten')),
  }));
  planned.forEach(r => bucket(r.provincie).push({
    kern: r.regioKern || r.regioNaam, live: 0,
    html: soonCard(r.regioNaam, plural(r.gemeenten, 'gemeente', 'gemeenten')),
  }));

  const provs = Object.keys(perProv).sort();
  const meerdereProv = provs.length > 1;
  return provs.map(prov => {
    // live eerst, daarna alfabetisch — beschikbare regio's bovenaan
    const grid = perProv[prov]
      .sort((a, b) => (b.live - a.live) || a.kern.localeCompare(b.kern))
      .map(x => x.html).join('\n');
    return meerdereProv
      ? '<div class="hub-provincie"><h2 class="hub-prov-h">' + esc(prov) + '</h2><div class="hubgrid">' + grid + '</div></div>'
      : '<div class="hubgrid">' + grid + '</div>';
  }).join('\n');
}

// De geplande regio-indeling (regions.txt) — één keer inlezen, hergebruikt door
// elke niche-hub. Ontbreekt het bestand, dan geeft loadPlannedRegions [] terug.
const geplandeRegios = R.loadPlannedRegions(ROOT);

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

  // "Binnenkort" = de volledige regio-indeling MIN wat live staat. Puur
  // afgeleid, nooit opgeslagen: gaat een regio live, dan valt ze vanzelf uit
  // deze lijst en wordt haar kaart klikbaar. Onder PLANNED_MIN_LIVE live
  // regio's oogt 1 live + 28 grijze kaarten verlaten i.p.v. ambitieus.
  const nichePages = R.pagesForNiche(registry, n.niche);
  const liveSlugs = new Set(nichePages.map(p => p.regioSlug));
  const planned = nichePages.length < R.PLANNED_MIN_LIVE ? []
    : geplandeRegios.filter(r => !liveSlugs.has(r.regioSlug));
  const titel = n.vakMvCap + ' per regio — Keurwijzer';

  write(path.join(n.niche, 'index.html'), fill(hubTpl, {
    TITLE: titel,
    HUB_CARDS: nicheHubCards(nichePages, planned),
    HUB_COUNT: esc(planned.length
      ? nichePages.length + ' van ' + (nichePages.length + planned.length) + ' regio’s beschikbaar'
      : plural(nichePages.length, 'regio beschikbaar', 'regio’s beschikbaar')),
    HUB_ITEMLIST: hubItemList(titel, nichePages.map(p =>
      ({ name: p.vakMvCap + ' in ' + p.regioNaam, url: p.url }))),
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

  // Alle niches die in deze regio bestaan. Geen "binnenkort" hier: een niche
  // zonder pagina in deze regio zegt de bezoeker niets — de nichehub doet dat.
  const regioPages = R.pagesForRegio(registry, r.regioSlug)
    .sort((a, b) => String(a.vakMvCap || '').localeCompare(String(b.vakMvCap || '')));
  const titel = 'Vakspecialisten in ' + r.regioNaam + ' — Keurwijzer';

  write(path.join('regio', r.regioSlug, 'index.html'), fill(hubTpl, {
    TITLE: titel,
    HUB_CARDS: '<div class="hubgrid">' +
      regioPages.map(p => hubCard(p.url, p.vakMvCap, 'in ' + p.regioNaam)).join('\n') + '</div>',
    HUB_COUNT: esc(plural(regioPages.length, 'vakgebied beschikbaar', 'vakgebieden beschikbaar')),
    HUB_ITEMLIST: hubItemList(titel, regioPages.map(p =>
      ({ name: p.vakMvCap + ' in ' + p.regioNaam, url: p.url }))),
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
// lastmod moet zeggen wanneer de PAGINA veranderde, niet wanneer de build liep.
// Stond hier "vandaag" voor alle URL's, dan meldde elke build elke pagina als
// gewijzigd — een signaal dat zichzelf waardeloos maakt, en bij 675 pagina's
// ruis richting Google. Daarom houdt data/lastmod.json per slug de md5 van
// output/<slug>/index.html bij: verandert die, dan (en alleen dan) schuift de
// datum op naar vandaag. Hubs en homepage erven de jongste datum van wat
// eronder hangt.
const lastmodPad = path.join(ROOT, 'data', 'lastmod.json');
const vandaag = new Date().toISOString().slice(0, 10);

function leesLastmod() {
  if (!fs.existsSync(lastmodPad)) return {};
  try {
    const j = JSON.parse(fs.readFileSync(lastmodPad, 'utf8'));
    return (j && j.paginas) || {};
  } catch (e) {
    console.error('  ! data/lastmod.json is onleesbaar (' + e.message + ') — opnieuw opgebouwd.');
    return {};
  }
}
function md5Bestand(pad) {
  if (!fs.existsSync(pad)) return null;
  return crypto.createHash('md5').update(fs.readFileSync(pad)).digest('hex');
}
function peildatumVan(entry) {
  try {
    const cfg = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'config', entry.niche, entry.slug + '.json'), 'utf8'));
    return cfg.peildatum || vandaag;
  } catch (e) { return vandaag; }
}

const vorige = leesLastmod();
const nieuweLastmod = {};
const datumPerSlug = new Map();
let verschoven = 0;
for (const e of registry) {
  const md5 = md5Bestand(path.join(ROOT, 'output', e.slug, 'index.html'));
  const oud = vorige[e.slug];
  let datum;
  if (!oud) {
    // Eerste vulling: de peildatum van de pagina, niet de dag waarop deze
    // wijziging toevallig werd doorgevoerd.
    datum = peildatumVan(e);
  } else if (md5 && oud.md5 && md5 !== oud.md5) {
    datum = vandaag;
    verschoven++;
  } else {
    datum = oud.datum || peildatumVan(e);
  }
  nieuweLastmod[e.slug] = { md5: md5 || (oud && oud.md5) || null, datum };
  datumPerSlug.set(e.slug, datum);
}
fs.writeFileSync(lastmodPad, JSON.stringify({
  _uitleg: 'Per pagina: de md5 van output/<slug>/index.html bij de vorige build en de ' +
           'datum waarop die voor het laatst veranderde. build-site.js gebruikt dat als ' +
           'sitemap-lastmod, zodat alleen echt gewijzigde pagina\'s een nieuwe datum ' +
           'krijgen. Niet met de hand bijwerken.',
  paginas: nieuweLastmod,
}, null, 2) + '\n');

const jongste = (slugs) => slugs.map(x => datumPerSlug.get(x)).filter(Boolean)
  .sort().slice(-1)[0] || vandaag;

const urls = [];
urls.push({ loc: origin + '/', lastmod: jongste(registry.map(e => e.slug)) });
for (const n of R.niches(registry))
  urls.push({ loc: origin + n.url,
              lastmod: jongste(registry.filter(e => e.niche === n.niche).map(e => e.slug)) });
for (const r of R.regios(registry))
  urls.push({ loc: origin + r.url,
              lastmod: jongste(registry.filter(e => e.regioSlug === r.regioSlug).map(e => e.slug)) });
for (const e of registry)
  urls.push({ loc: origin + e.url, lastmod: datumPerSlug.get(e.slug) });

const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => '  <url><loc>' + esc(u.loc) + '</loc><lastmod>' + u.lastmod + '</lastmod></url>').join('\n') +
  '\n</urlset>\n';
write('sitemap.xml', sitemap);
if (verschoven) console.log('  · lastmod bijgewerkt naar ' + vandaag + ' voor ' + verschoven +
                            ' gewijzigde pagina(\'s)');

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
