#!/usr/bin/env node
// =====================================================================
// detecteer-nieuwe-regios.js — vindt regio's met verse scrapedata die
// nog gebouwd (of herbouwd) moeten worden. PUUR detectie: leest alleen,
// wijzigt niets. Gebruikt door de dagelijkse cloud-routine én bruikbaar
// als Stap 1 van de nieuwe-regio-verwerken skill.
//
// Een regio is "klaar om te (her)bouwen" als data/<slug>/ zowel een
// *-places.json als een *-reviews.json bevat, én:
//   • NIEUW      : er is nog géén config/<niche>/<slug>.json, óf
//   • HERSCRAPE  : de datum in de nieuwste scrapebestandsnaam (YYYY-MM-DD)
//                  is later dan de peildatum in de config (= de vorige build).
//
// Waarom de datum uit de BESTANDSNAAM en niet de mtime: in een verse
// git-checkout (zoals de cloud-routine draait) zijn alle mtimes gelijk aan
// het clone-moment. De datum in de naam is inhoudelijk en dus betrouwbaar.
//
// Uitvoer (machine- én mensleesbaar):
//   READY_COUNT=<n>
//   READY: <slug> | <reden> | <places-bestand> + <reviews-bestand>
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const CONFIG = path.join(ROOT, 'config');

// config plat (config/<slug>.json) of in een niche-submap (config/<niche>/<slug>.json)
function findConfig(slug) {
  const flat = path.join(CONFIG, slug + '.json');
  if (fs.existsSync(flat)) return flat;
  if (fs.existsSync(CONFIG)) {
    for (const e of fs.readdirSync(CONFIG, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = path.join(CONFIG, e.name, slug + '.json');
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

const ready = [];
if (fs.existsSync(DATA)) {
  for (const e of fs.readdirSync(DATA, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const slug = e.name;
    const dir = path.join(DATA, slug);
    const files = fs.readdirSync(dir);
    const places = files.filter(f => /-places\.json$/i.test(f)).sort();
    const reviews = files.filter(f => /-reviews\.json$/i.test(f)).sort();
    if (!places.length || !reviews.length) continue; // geen compleet scrapepaar

    const newestPlaces = places[places.length - 1];
    const newestReviews = reviews[reviews.length - 1];
    const m = newestPlaces.match(/(\d{4}-\d{2}-\d{2})/);
    const scrapeDate = m ? m[1] : null;

    const cfg = findConfig(slug);
    if (!cfg) {
      ready.push({ slug, reden: 'nieuwe regio (nog geen config)', newestPlaces, newestReviews });
      continue;
    }
    // config bestaat → alleen melden als de scrape nieuwer is dan de vorige build
    if (scrapeDate) {
      let peildatum = null;
      try { peildatum = JSON.parse(fs.readFileSync(cfg, 'utf8')).peildatum || null; } catch { /* corrupte config → overslaan */ }
      // ISO-datums (YYYY-MM-DD) zijn lexicografisch vergelijkbaar
      if (peildatum && scrapeDate > peildatum) {
        ready.push({ slug, reden: 'nieuwere scrape (' + scrapeDate + ') dan laatste build (peildatum ' + peildatum + ')', newestPlaces, newestReviews });
      }
    }
  }
}

console.log('READY_COUNT=' + ready.length);
for (const r of ready) {
  console.log('READY: ' + r.slug + ' | ' + r.reden + ' | ' + r.newestPlaces + ' + ' + r.newestReviews);
}
