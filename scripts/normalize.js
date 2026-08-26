#!/usr/bin/env node
// =====================================================================
// normalize.js — zet ruwe reviewdata om naar data/<slug>/reviews.json
//
// MODUS A — Apify (aanbevolen):
//   node scripts/normalize.js apify <slug> data/<slug>/apify-export.json [places.json]
//   Werkt met de export van de Apify-actor "Google Maps Reviews Scraper"
//   (compass/google-maps-reviews-scraper) én met "Google Maps Scraper"
//   (compass/crawler-google-places) wanneer reviews meegescraped worden.
//   Exporteer de dataset als JSON (niet CSV).
//   Optioneel 4e argument: een place-details export (Apify "Google Maps Scraper")
//   met de website per bedrijf. Ontbrekende websites én gemeenten worden daaruit
//   aangevuld (match op bedrijfsnaam) — nodig voor de vakfocus-beoordeling.
//   Schrijft per bedrijf ook `recent24` en `rankbaar` (gemeente in de lijst
//   + ≥10 reviews + ≥3 in de laatste 24 maanden): informatieve velden voor de
//   LLM-stap, zodat die zelf geen datums hoeft te tellen. build.js rekent
//   altijd zelf en negeert deze velden.
//
// MODUS B — Manueel (fallback):
//   node scripts/normalize.js manueel <slug>
//   Leest alle .txt-bestanden uit data/<slug>/manueel/ (één per bedrijf).
//   Formaat per bestand — kopregels, dan reviews:
//
//     Bedrijf: Dakwerken Ivens & Zonen
//     Gemeente: Gent
//     Website: https://dakwerken-ivens.be
//     Score: 4.9
//     Reviews: 87
//     ---
//     [5] 3 maanden geleden
//     Zeer professioneel team, dak volledig vernieuwd...
//     ---
//     [4] een jaar geleden
//     Goede prijs-kwaliteit, kleine vertraging maar netjes opgelost.
//     ---
//
//   Relatieve datums ("3 maanden geleden", "a year ago") worden omgezet
//   naar een datum t.o.v. de peildatum in config/<slug>.json.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const [mode, slug, inputArg, placesArg] = process.argv.slice(2);

function die(msg) { console.error('FOUT: ' + msg); process.exit(1); }
if (!mode || !slug) die('gebruik: node scripts/normalize.js <apify|manueel> <slug> [inputbestand] [places.json]');

// Config mag plat staan (config/<slug>.json) of in een niche-submap
// (config/<niche>/<slug>.json). De reviews.json-output blijft altijd plat: data/<slug>/.
function findConfigPath(slug) {
  const flat = path.join(ROOT, 'config', slug + '.json');
  if (fs.existsSync(flat)) return flat;
  const configDir = path.join(ROOT, 'config');
  if (fs.existsSync(configDir)) {
    for (const entry of fs.readdirSync(configDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = path.join(configDir, entry.name, slug + '.json');
      if (fs.existsSync(p)) return p;
    }
  }
  die('config niet gevonden: config/' + slug + '.json of config/<niche>/' + slug + '.json');
}

const config = JSON.parse(fs.readFileSync(findConfigPath(slug), 'utf8'));
const peildatum = new Date(config.peildatum + 'T00:00:00Z');
const outPath = path.join(ROOT, 'data', slug, 'reviews.json');

// ---------------- relatieve datum → ISO-datum (NL + EN) ----------------
function parseRelativeDate(txt) {
  const t = String(txt).toLowerCase().trim();
  const abs = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (abs) return abs[0];
  let n = 0, unit = null;
  const m = t.match(/(\d+|een|a|an)\s+(second|minute|hour|day|week|month|year|seconde|minuut|uur|uren|dag|dagen|week|weken|maand|maanden|jaar|jaren)/);
  if (m) {
    n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : 1;
    unit = m[2];
  } else if (/vandaag|today|zojuist|just now/.test(t)) { n = 0; unit = 'dag'; }
  else if (/gisteren|yesterday/.test(t)) { n = 1; unit = 'dag'; }
  else return null;

  const d = new Date(peildatum);
  if (/^(second|minute|hour|seconde|minuut|uur|uren)/.test(unit)) { /* vandaag */ }
  else if (/^(dag|day)/.test(unit)) d.setUTCDate(d.getUTCDate() - n);
  else if (/^(week|weken)/.test(unit) || unit === 'week') d.setUTCDate(d.getUTCDate() - 7 * n);
  else if (/^(maand|month)/.test(unit)) d.setUTCMonth(d.getUTCMonth() - n);
  else if (/^(jaar|jaren|year)/.test(unit)) d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString().slice(0, 10);
}

// ---------------- gemeente uit adres halen ------------------------------
function cityFromAddress(item) {
  if (item.city) return item.city;
  const addr = item.address || (item.location && item.location.address) || '';
  // Belgisch formaat: "Straat 1, 9000 Gent, België"
  const m = String(addr).match(/\d{4}\s+([^,]+)/);
  return m ? m[1].trim() : '';
}

// ---------------- coördinaten uit een item halen ------------------------
// Google/Apify geeft per plaats een pin ({lat,lng}). Die is authoritatief,
// ook als de tekstuele adres-/stadvelden leeg zijn (een bekend Apify-gat).
function coordsFrom(item) {
  const l = item && item.location;
  if (l && typeof l.lat === 'number' && typeof l.lng === 'number') {
    return { lat: l.lat, lng: l.lng };
  }
  return null;
}

let result = [];

if (mode === 'apify') {
  if (!inputArg) die('geef het pad naar de Apify JSON-export mee');
  const raw = JSON.parse(fs.readFileSync(inputArg, 'utf8'));
  const items = Array.isArray(raw) ? raw : [raw];

  // Twee mogelijke vormen:
  //  a) place-items met een ingesloten reviews-array (crawler-google-places)
  //  b) losse review-items met placeId/title per review (google-maps-reviews-scraper)
  const looksLikeLooseReviews = items.length > 0 && items[0].stars != null && !items[0].reviews;

  if (looksLikeLooseReviews) {
    const byPlace = new Map();
    for (const r of items) {
      const key = r.placeId || r.title;
      if (!byPlace.has(key)) {
        byPlace.set(key, {
          bedrijf: r.title, gemeente: cityFromAddress(r),
          website: r.website || null,
          googleScore: r.totalScore != null ? r.totalScore : null,
          googleReviews: r.reviewsCount != null ? r.reviewsCount : null,
          coords: coordsFrom(r),
          reviews: []
        });
      }
      const p = byPlace.get(key);
      // vul plaatsvelden aan als een later item ze wél bevat
      if (!p.gemeente) p.gemeente = cityFromAddress(r);
      if (!p.coords) p.coords = coordsFrom(r);
      if (!p.website && r.website) p.website = r.website;
      if (p.googleScore == null && r.totalScore != null) p.googleScore = r.totalScore;
      if (p.googleReviews == null && r.reviewsCount != null) p.googleReviews = r.reviewsCount;
      const datum = r.publishedAtDate ? String(r.publishedAtDate).slice(0, 10)
        : (r.publishAt ? parseRelativeDate(r.publishAt) : null);
      if (r.stars != null && datum) {
        p.reviews.push({ score: r.stars, datum, tekst: r.text || '', auteur: r.name || '', reactie: r.responseFromOwnerText || '' });
      }
    }
    result = [...byPlace.values()];
  } else {
    for (const it of items) {
      const reviews = (it.reviews || []).map(r => {
        const datum = r.publishedAtDate ? String(r.publishedAtDate).slice(0, 10)
          : (r.publishAt ? parseRelativeDate(r.publishAt) : null);
        return (r.stars != null && datum)
          ? { score: r.stars, datum, tekst: r.text || '', auteur: r.name || '', reactie: r.responseFromOwnerText || '' }
          : null;
      }).filter(Boolean);
      result.push({
        bedrijf: it.title, gemeente: cityFromAddress(it),
        website: it.website || null,
        googleScore: it.totalScore != null ? it.totalScore : null,
        googleReviews: it.reviewsCount != null ? it.reviewsCount : null,
        coords: coordsFrom(it),
        reviews
      });
    }
  }
  // vul googleReviews aan waar Apify het niet meegaf
  result.forEach(p => { if (p.googleReviews == null) p.googleReviews = p.reviews.length; });

} else if (mode === 'manueel') {
  const dir = path.join(ROOT, 'data', slug, 'manueel');
  if (!fs.existsSync(dir)) die('map niet gevonden: ' + dir);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
  if (!files.length) die('geen .txt-bestanden in ' + dir);

  for (const f of files) {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const head = k => {
      const m = txt.match(new RegExp('^' + k + ':\\s*(.+)$', 'mi'));
      return m ? m[1].trim() : null;
    };
    const bedrijf = head('Bedrijf');
    if (!bedrijf) { console.warn('! ' + f + ': geen "Bedrijf:"-regel, overgeslagen'); continue; }

    const reviews = [];
    const blocks = txt.split(/^---\s*$/m).slice(1);
    for (const b of blocks) {
      const m = b.match(/\[\s*([1-5](?:[.,]\d)?)\s*\]\s*([^\n]+)\n?([\s\S]*)/);
      if (!m) continue;
      const datum = parseRelativeDate(m[2]);
      if (!datum) { console.warn('! ' + f + ': datum niet begrepen: "' + m[2].trim() + '"'); continue; }
      reviews.push({
        score: parseFloat(m[1].replace(',', '.')),
        datum, tekst: m[3].trim(), auteur: ''
      });
    }
    result.push({
      bedrijf,
      gemeente: head('Gemeente') || '',
      website: head('Website'),
      googleScore: head('Score') ? parseFloat(head('Score').replace(',', '.')) : null,
      googleReviews: head('Reviews') ? parseInt(head('Reviews'), 10) : reviews.length,
      reviews
    });
    console.log('  ' + f + ' → ' + bedrijf + ' (' + reviews.length + ' reviews)');
  }
} else {
  die('onbekende modus "' + mode + '" — gebruik apify of manueel');
}

// ---- optioneel: websites/gemeenten mergen uit een place-details export --
// De review-scraper geeft vaak geen website terug; de "Google Maps Scraper"
// (place-details) wel. Vul die hier aan, gematcht op bedrijfsnaam.
if (placesArg) {
  if (!fs.existsSync(placesArg)) die('place-details bestand niet gevonden: ' + placesArg);
  let praw;
  try { praw = JSON.parse(fs.readFileSync(placesArg, 'utf8')); }
  catch (e) { die('ongeldige JSON in ' + placesArg + ' — ' + e.message); }
  const pitems = Array.isArray(praw) ? praw : [praw];
  const nrm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const byName = new Map();
  for (const p of pitems) {
    if (p.title) byName.set(nrm(p.title), { website: p.website || null, city: cityFromAddress(p), coords: coordsFrom(p) });
  }
  let filledW = 0, filledG = 0;
  for (const c of result) {
    const rec = byName.get(nrm(c.bedrijf));
    if (!rec) continue;
    if (!c.website && rec.website) { c.website = rec.website; filledW++; }
    if (!c.gemeente && rec.city)   { c.gemeente = rec.city; filledG++; }
    if (!c.coords && rec.coords)   { c.coords = rec.coords; }
  }
  console.log('✓ place-details gemerged: ' + filledW + ' website(s) en ' +
    filledG + ' gemeente(n) aangevuld (' + byName.size + ' bedrijven in place-details)');
}

// ---- coördinaten-fallback: gemeente afleiden uit de pin --------------------
// Apify geeft soms géén adres/stad terug, maar wél de pin-coördinaten. Die zijn
// authoritatief (Google's eigen locatie). We reverse-geocoden ze naar een
// gemeente en laten daarna de gewone gemeentelijst-filter beslissen — dat is
// geen giswerk, want het is de echte zetel, en buiten-regio bedrijven vallen
// nog steeds weg. Het resultaat wordt BEVROREN in data/<slug>/geocache.json:
// na de eerste run gebeurt er geen netwerkoproep meer, zodat "zelfde data =
// zelfde resultaat" gegarandeerd blijft. Zonder gemeente én zonder coördinaten
// blijft de harde regel: weglaten.
function reverseGeocode(lat, lng) {
  return new Promise(resolve => {
    const u = 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=10' +
      '&addressdetails=1&lat=' + lat + '&lon=' + lng;
    const req = https.get(u, { headers: { 'User-Agent': 'Keurwijzer/1.0 (locatie-fallback; olivier@magicworx.net)' } }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        try {
          const a = (JSON.parse(d).address) || {};
          resolve(a.municipality || a.city || a.town || a.village || a.county || null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}
async function geocodeMissing(list, slug) {
  const cachePath = path.join(ROOT, 'data', slug, 'geocache.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch { /* nog geen cache */ }
  const todo = list.filter(p => !p.gemeente && p.coords);
  if (!todo.length) return;
  const key = c => c.lat.toFixed(6) + ',' + c.lng.toFixed(6);
  let netCalls = 0, changed = false;
  for (const p of todo) {
    const k = key(p.coords);
    if (!(k in cache)) {
      if (netCalls > 0) await new Promise(r => setTimeout(r, 1200)); // Nominatim-beleid: max ~1/s
      cache[k] = await reverseGeocode(p.coords.lat, p.coords.lng);
      netCalls++; changed = true;
    }
    if (cache[k]) {
      p.gemeente = cache[k];
      p.gemeenteBron = 'coordinaten';
      console.log('~ "' + p.bedrijf + '": geen adres in de export — gemeente afgeleid uit de pin-coördinaten → "' + cache[k] + '"');
    } else {
      console.warn('! "' + p.bedrijf + '": geen adres én reverse-geocoding gaf geen gemeente — weggelaten.');
    }
  }
  if (changed) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    console.log('✓ geocache bijgewerkt (' + netCalls + ' nieuwe reverse-geocode-oproep(en)): ' + cachePath);
  }
}

(async () => {
await geocodeMissing(result, slug);

// ---- kwaliteitscontrole vóór het wegschrijven --------------------------
// Een lege gemeente betekent dat build.js het bedrijf STIL weglaat
// ("buiten de gemeentelijst"). Dat mag nooit onopgemerkt gebeuren.
const gemeentenNorm = new Set((config.gemeenten || []).map(g => String(g).toLowerCase().trim()));
// spiegel van build.js (dáár staat de bron van waarheid voor deze drempels)
const MIN_REVIEWS = 10, MIN_RECENT = 3;
const MS_JAAR = 365.25 * 24 * 3600 * 1000;
let inLijst = 0, nRankbaar = 0;
for (const p of result) {
  const inDeLijst = !!p.gemeente && gemeentenNorm.has(String(p.gemeente).toLowerCase().trim());
  p.recent24 = (p.reviews || []).filter(r => {
    const d = new Date(r.datum + 'T00:00:00Z');
    return !isNaN(d) && (peildatum - d) / MS_JAAR <= 2;
  }).length;
  const totaal = p.googleReviews != null ? p.googleReviews : (p.reviews || []).length;
  p.rankbaar = inDeLijst && totaal >= MIN_REVIEWS && p.recent24 >= MIN_RECENT;
  if (p.rankbaar) nRankbaar++;

  if (!p.gemeente) {
    console.warn('! "' + p.bedrijf + '": geen gemeente gevonden in de export — dit bedrijf valt buiten de ranking. Vul de gemeente handmatig aan in reviews.json.');
  } else if (gemeentenNorm.size && !inDeLijst) {
    console.warn('~ "' + p.bedrijf + '" ligt in "' + p.gemeente + '" — niet in de gemeentelijst van de config (wordt weggelaten; voeg de gemeente toe als dit onterecht is).');
  } else {
    inLijst++;
  }
  if (p.rankbaar && !p.website) {
    console.warn('~ "' + p.bedrijf + '": rankbaar maar geen website in de export — de LLM moet de site opzoeken en verifiëren, anders wordt de vakfocus de regiomediaan.');
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log('✓ ' + outPath + ' — ' + result.length + ' bedrijven, ' +
  result.reduce((s, p) => s + p.reviews.length, 0) + ' reviews (' +
  inLijst + ' binnen de gemeentelijst, ' + nRankbaar + ' rankbaar)');
})().catch(e => die('onverwachte fout tijdens locatie-fallback/wegschrijven — ' + e.message));
