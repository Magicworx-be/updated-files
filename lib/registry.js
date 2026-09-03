// =====================================================================
// lib/registry.js — centrale paginaregistry voor Keurwijzer
//
// Leest ALLE config/<niche>/<slug>.json en bouwt daaruit één lijst van
// pagina's (niche × regio). Alles wat met navigatie te maken heeft —
// niche-hubs, regio-hubs, kruislinks, broodkruimels, sitemap — vertrekt
// van deze ene bron. Eén config toevoegen + rebuilden = de pagina
// verschijnt overal in de navigatie, zonder handmatig links te leggen.
//
// URL-schema (bewust plat voor de detailpagina's — folder-diepte is geen
// rankingfactor, en zo blijven de money-pages ongewijzigd in de root):
//   detailpagina : /<slug>/                bv. /dakwerkers-gent/
//   niche-hub    : /<niche>/               bv. /dakwerkers/
//   regio-hub    : /regio/<regioSlug>/     bv. /regio/gent/
//
// "Naburige regio's" worden afgeleid uit de data zélf: twee regio's die
// gemeenten delen (grensoverlap) of in dezelfde provincie liggen, zijn
// naburig. Geen aparte adjacency-tabel nodig.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const SITE_ORIGIN = 'https://keurwijzer.be';

// Basis-URL waar de kwaliteitsbadges (PNG) geserveerd worden. EEN plek, zodat
// verhuizen naar een eigen domein een wijziging van deze regel (of van
// BADGE_BASE_URL in .env) is — en niet een zoek-en-vervang door prompts en
// mails. build.js schrijft de volledige badge-URL's hiermee in badges.json,
// zodat de outreach-stap ze uitleest in plaats van zelf samen te stellen.
// Geen trailing slash.
const BADGE_BASE_URL = (process.env.BADGE_BASE_URL ||
  'https://cdn.jsdelivr.net/gh/Magicworx-be/keurwijzer-data/badges').replace(/[/]+$/, '');

// ISO 3166-2-codes per provincie voor de <meta name="geo.region">. Eén bron,
// gedeeld door build.js (detailpagina's) en build-site.js (hubs).
const GEO_CODES = {
  'oost-vlaanderen': 'BE-VOV', 'west-vlaanderen': 'BE-VWV', 'antwerpen': 'BE-VAN',
  'limburg': 'BE-VLI', 'vlaams-brabant': 'BE-VBR', 'waals-brabant': 'BE-WBR',
  'henegouwen': 'BE-WHT', 'luik': 'BE-WLG', 'luxemburg': 'BE-WLX',
  'namen': 'BE-WNA', 'brussel': 'BE-BRU',
};

// Provincie per regio. `regions.txt` is de bindende bron voor WELKE regio's
// bestaan (29 stuks), maar bevat zelf geen provincie — die staat hier, zodat de
// hub de "binnenkort"-kaarten per provincie kan groeperen zoals de live kaarten.
// Voeg je een regio toe aan regions.txt, voeg ze dan hier ook toe;
// loadPlannedRegions() faalt hard als een regio hier ontbreekt.
const PROVINCIE_PER_REGIO = {
  // Oost-Vlaanderen
  'gent': 'Oost-Vlaanderen', 'meetjesland': 'Oost-Vlaanderen', 'aalst': 'Oost-Vlaanderen',
  'dendermonde': 'Oost-Vlaanderen', 'sint-niklaas': 'Oost-Vlaanderen', 'oudenaarde': 'Oost-Vlaanderen',
  // West-Vlaanderen
  'brugge': 'West-Vlaanderen', 'oostende': 'West-Vlaanderen', 'veurne-diksmuide': 'West-Vlaanderen',
  'ieper': 'West-Vlaanderen', 'roeselare': 'West-Vlaanderen', 'tielt': 'West-Vlaanderen',
  'kortrijk': 'West-Vlaanderen',
  // Antwerpen
  'antwerpen': 'Antwerpen', 'brasschaat': 'Antwerpen', 'mechelen': 'Antwerpen',
  'turnhout': 'Antwerpen', 'geel-mol': 'Antwerpen', 'herentals-westerlo': 'Antwerpen',
  // Vlaams-Brabant
  'leuven': 'Vlaams-Brabant', 'aarschot-diest': 'Vlaams-Brabant', 'tienen': 'Vlaams-Brabant',
  'vilvoorde': 'Vlaams-Brabant', 'halle': 'Vlaams-Brabant', 'asse': 'Vlaams-Brabant',
  // Limburg
  'hasselt-genk': 'Limburg', 'noord-limburg': 'Limburg', 'maasland': 'Limburg',
  'sint-truiden-tongeren': 'Limburg',
};

// Vanaf hoeveel LIVE regio's een niche-hub ook de nog-niet-gebouwde regio's als
// "binnenkort" toont. Onder deze drempel oogt een hub met 1 live + 28 grijze
// kaarten verlaten in plaats van ambitieus, dus tonen we dan enkel wat bestaat.
const PLANNED_MIN_LIVE = 3;

function norm(name) { return String(name).toLowerCase().replace(/\s+/g, ' ').trim(); }

function slugify(label) {
  return String(label).toLowerCase()
    .replace(/[àáâä]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Regio-slug = de kern zonder "regio "-voorvoegsel, ge-slugd.
// "regio Gent" → "gent" ; kern "Meetjesland" → "meetjesland".
function regioSlugFrom(config) {
  const bron = (config.regio && (config.regio.kern || config.regio.naam)) || '';
  return slugify(String(bron).replace(/^regio\s+/i, ''));
}

// ---------------------------------------------------------------------
// Eén pagina-descriptor uit een config bouwen.
// ---------------------------------------------------------------------
function toEntry(niche, slug, config) {
  const regioSlug = regioSlugFrom(config);
  const gemeenten = Array.isArray(config.gemeenten) ? config.gemeenten : [];
  return {
    slug,                                   // 'dakwerkers-gent'
    niche,                                  // 'dakwerkers' (config-submap)
    url: '/' + slug + '/',                  // '/dakwerkers-gent/'
    canonical: SITE_ORIGIN + '/' + slug + '/', // pretty URL met trailing slash
    // vak
    vakMv:    config.vak && config.vak.mv,
    vakMvCap: (config.vak && config.vak.mvCap) ||
              (config.vak && config.vak.mv
                ? config.vak.mv.charAt(0).toUpperCase() + config.vak.mv.slice(1) : niche),
    vakEv:    (config.vak && config.vak.ev) || '',
    // regio
    regioNaam: config.regio && config.regio.naam,       // 'regio Gent'
    regioKern: config.regio && config.regio.kern,       // 'Gent'
    regioSlug,                                           // 'gent'
    regioUrl: '/regio/' + regioSlug + '/',
    provincie: config.regio && config.regio.provincie,  // 'Oost-Vlaanderen'
    // niche-hub
    nicheUrl: '/' + niche + '/',
    // gemeenten
    gemeenten,
    gemeentenNorm: new Set(gemeenten.map(norm)),
  };
}

// ---------------------------------------------------------------------
// De volledige registry inlezen: alle config/<niche>/<slug>.json.
// Platte configs (config/<slug>.json, bv. testdata) worden bewust
// overgeslagen — die horen niet in de publieke navigatie.
// ---------------------------------------------------------------------
function loadRegistry(ROOT) {
  const configDir = path.join(ROOT, 'config');
  const entries = [];
  if (!fs.existsSync(configDir)) return entries;
  for (const nicheDir of fs.readdirSync(configDir, { withFileTypes: true })) {
    if (!nicheDir.isDirectory()) continue;
    const niche = nicheDir.name;
    const dir = path.join(configDir, niche);
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const slug = f.slice(0, -5);
      let config;
      try { config = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
      catch { continue; } // ongeldige JSON hier stil overslaan; build.js meldt het per slug
      if (!config.vak || !config.regio) continue;
      entries.push(toEntry(niche, slug, config));
    }
  }
  // stabiele volgorde: niche, dan regio
  entries.sort((a, b) =>
    a.niche.localeCompare(b.niche, 'nl') || String(a.regioKern).localeCompare(String(b.regioKern), 'nl'));
  return entries;
}

// ---------------------------------------------------------------------
// De GEPLANDE regio-indeling inlezen uit `new page - how to/regions.txt`.
//
// Dat bestand is de definitieve lijst van alle 29 Vlaamse Keurwijzer-regio's
// (tab-gescheiden: "Regio<TAB..>Gemeente, Gemeente, ..."). Hij zegt niets over
// wat al gebouwd is — dat weet de registry zelf. De hub trekt clientside het ene
// van het andere af:
//
//     binnenkort = alle regio's hier  −  regio's die live staan in registry.json
//
// Daardoor is "binnenkort" nooit een opgeslagen label dat iemand moet weghalen:
// zodra een regio een config krijgt en gebouwd wordt, valt ze vanzelf uit deze
// verzameling en wordt de kaart klikbaar. Geen handwerk, geen GHL-actie.
// ---------------------------------------------------------------------
function loadPlannedRegions(ROOT) {
  const bron = path.join(ROOT, 'new page - how to', 'regions.txt');
  if (!fs.existsSync(bron)) {
    console.warn('! regions.txt niet gevonden (' + bron + ') — geen "binnenkort"-kaarten.');
    return [];
  }
  const regels = fs.readFileSync(bron, 'utf8').split(/\r?\n/);
  const out = [];
  const ontbrekendeProvincie = [];
  for (const regel of regels) {
    if (!regel.trim()) continue;
    const velden = regel.split(/\t+/).map(s => s.trim()).filter(Boolean);
    if (velden.length < 2) continue;
    const kern = velden[0];
    if (norm(kern) === 'region') continue;          // kopregel overslaan
    const gemeenten = velden[1].split(',').map(s => s.trim()).filter(Boolean);
    const regioSlug = slugify(kern);
    const provincie = PROVINCIE_PER_REGIO[regioSlug];
    if (!provincie) { ontbrekendeProvincie.push(kern); continue; }
    out.push({
      regioSlug,
      regioKern: kern,
      regioNaam: 'regio ' + kern,
      url: '/regio/' + regioSlug + '/',
      provincie,
      gemeenten: gemeenten.length,
    });
  }
  if (ontbrekendeProvincie.length) {
    throw new Error('regions.txt bevat regio(\'s) zonder provincie in PROVINCIE_PER_REGIO ' +
      '(lib/registry.js): ' + ontbrekendeProvincie.join(', ') +
      ' — vul de provincie aan, anders vallen ze uit de hub-navigatie.');
  }
  return out.sort((a, b) =>
    a.provincie.localeCompare(b.provincie, 'nl') || a.regioKern.localeCompare(b.regioKern, 'nl'));
}

// ---------------------------------------------------------------------
// Afgeleide views over de registry.
// ---------------------------------------------------------------------

// Alle pagina's van één niche (voor de niche-hub).
function pagesForNiche(reg, niche) {
  return reg.filter(e => e.niche === niche);
}

// Alle pagina's in één regio (voor de regio-hub) — over alle niches heen.
function pagesForRegio(reg, regioSlug) {
  return reg.filter(e => e.regioSlug === regioSlug);
}

// Aantal gedeelde gemeenten tussen twee pagina's (grensoverlap = naburigheid).
function sharedGemeenten(a, b) {
  let n = 0;
  for (const g of a.gemeentenNorm) if (b.gemeentenNorm.has(g)) n++;
  return n;
}

// Naburige regio's binnen DEZELFDE niche, gerangschikt op relevantie:
//   1) meeste gedeelde gemeenten (echte grensoverlap)
//   2) zelfde provincie
//   3) rest (alfabetisch)
// Geeft max `limit` pagina's terug (zonder de pagina zelf).
function neighbours(reg, page, limit = 6) {
  return pagesForNiche(reg, page.niche)
    .filter(e => e.slug !== page.slug)
    .map(e => ({
      e,
      shared: sharedGemeenten(page, e),
      zelfdeProvincie: norm(e.provincie || '') === norm(page.provincie || '') ? 1 : 0,
    }))
    .sort((x, y) =>
      y.shared - x.shared ||
      y.zelfdeProvincie - x.zelfdeProvincie ||
      String(x.e.regioKern).localeCompare(String(y.e.regioKern), 'nl'))
    .slice(0, limit)
    .map(x => x.e);
}

// Andere niches die in dezelfde regio beschikbaar zijn (voor de detailpagina
// en de regio-hub). Zonder de pagina zelf.
function otherNichesInRegio(reg, page) {
  return pagesForRegio(reg, page.regioSlug).filter(e => e.slug !== page.slug);
}

// Unieke niches (voor de homepage-nichegrid en het overzicht).
function niches(reg) {
  const seen = new Map();
  for (const e of reg) {
    if (!seen.has(e.niche)) {
      seen.set(e.niche, {
        niche: e.niche, url: e.nicheUrl,
        vakMv: e.vakMv, vakMvCap: e.vakMvCap, vakEv: e.vakEv,
        count: 0,
      });
    }
    seen.get(e.niche).count++;
  }
  return [...seen.values()].sort((a, b) => a.vakMvCap.localeCompare(b.vakMvCap, 'nl'));
}

// Unieke regio's (voor het regio-overzicht), gegroepeerd per provincie.
function regios(reg) {
  const seen = new Map();
  for (const e of reg) {
    if (!seen.has(e.regioSlug)) {
      seen.set(e.regioSlug, {
        regioSlug: e.regioSlug, url: e.regioUrl,
        regioKern: e.regioKern, regioNaam: e.regioNaam,
        provincie: e.provincie, count: 0,
      });
    }
    seen.get(e.regioSlug).count++;
  }
  return [...seen.values()].sort((a, b) =>
    String(a.provincie).localeCompare(String(b.provincie), 'nl') ||
    String(a.regioKern).localeCompare(String(b.regioKern), 'nl'));
}

module.exports = {
  SITE_ORIGIN, BADGE_BASE_URL, GEO_CODES, PROVINCIE_PER_REGIO, PLANNED_MIN_LIVE,
  norm, slugify, regioSlugFrom,
  loadRegistry, loadPlannedRegions, pagesForNiche, pagesForRegio, neighbours,
  otherNichesInRegio, niches, regios, sharedGemeenten,
};
