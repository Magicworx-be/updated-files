#!/usr/bin/env node
/**
 * Zoekt de exacte bedrijfsnaam op in data/<slug>/reviews.json.
 *
 * Waarom dit bestaat: de naam in data/whatsapp.json moet letterlijk gelijk zijn
 * aan het veld `bedrijf` in reviews.json — anders slaat build-all.js die hele
 * regiopagina over. De naam in een mail is bijna altijd korter ("D&G Dakwerken"
 * tegenover "D&G Dakwerken (Brugge)"), dus moet hij opgezocht worden.
 *
 * De geplande taken deden dat tot 2 september 2026 met een `node -e`-eenregelaar.
 * Daarvoor moest `Bash(node -e:*)` op de toestemmingslijst staan — willekeurige
 * node-code, terwijl er maar één ding nodig was. Vandaar dit script: één vaste
 * opdracht die wél op de lijst mag.
 *
 * Gebruik:  node scripts/zoek-bedrijf.js <slug> <zoekterm>
 * Bijvoorbeeld:  node scripts/zoek-bedrijf.js dakwerkers-aalst "DWG Projects"
 */

const fs = require('fs');
const path = require('path');

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

const [slug, ...rest] = process.argv.slice(2);
const zoekterm = rest.join(' ');

if (!slug || !zoekterm) {
  console.error('Gebruik: node scripts/zoek-bedrijf.js <slug> <zoekterm>');
  process.exit(2);
}

const bestand = path.join(__dirname, '..', 'data', slug, 'reviews.json');
if (!fs.existsSync(bestand)) {
  console.error(`GEEN DATA — data/${slug}/reviews.json bestaat niet. Klopt de slug?`);
  process.exit(2);
}

let doc;
try { doc = JSON.parse(fs.readFileSync(bestand, 'utf8')); }
catch (e) {
  console.error(`ONLEESBAAR — data/${slug}/reviews.json bevat ongeldige JSON: ${e.message}`);
  process.exit(2);
}

// reviews.json is normaal een kale lijst; oudere regio's hadden { bedrijven: [...] }.
const lijst = Array.isArray(doc) ? doc : (doc.bedrijven || []);
const treffers = lijst.filter((b) => b && b.bedrijf && norm(b.bedrijf).includes(norm(zoekterm)));

treffers.forEach((b) => console.log(`${b.bedrijf}  |  ${b.gemeente || 'geen gemeente'}`));

if (treffers.length === 1) {
  console.log('\nTREFFERS: 1 — neem deze schrijfwijze letterlijk over.');
} else if (treffers.length === 0) {
  console.log('\nTREFFERS: 0 — niets toevoegen, wel melden.');
} else {
  console.log(`\nTREFFERS: ${treffers.length} — te veel om te kiezen. Niets toevoegen, wel melden met de kandidaten erbij.`);
}
