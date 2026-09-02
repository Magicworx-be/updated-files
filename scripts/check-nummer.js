#!/usr/bin/env node
/**
 * Controleert WhatsApp-nummers, met of zonder argument.
 *
 *   node scripts/check-nummer.js "0470 49 23 82"
 *       → normaliseert één ruw nummer met lib/whatsapp.js en zegt of het
 *         bruikbaar is, en of het een gsm (32 4xx) of een vast nummer is.
 *
 *   node scripts/check-nummer.js
 *       → leest data/whatsapp.json helemaal na (zelfde controle als de build)
 *         en meldt "ok, N regels" of de fouten.
 *
 * Waarom dit bestaat: de geplande taken deden allebei die controles tot
 * 2 september 2026 met een `node -e`-eenregelaar, waarvoor `Bash(node -e:*)`
 * — willekeurige node-code — op de toestemmingslijst moest staan. Eén vast
 * commando kan wél veilig op die lijst.
 */

const wa = require('../lib/whatsapp');
const path = require('path');

const ruw = process.argv.slice(2).join(' ').trim();

if (!ruw) {
  // Geen argument: het hele bestand nakijken.
  const r = wa.load(path.join(__dirname, '..'));
  if (r.fouten.length) {
    console.log(r.fouten.join('\n'));
    console.log('\nFOUT — zet data/whatsapp.json terug zoals het was en meld het.');
    process.exit(1);
  }
  console.log(`ok, ${r.rijen.length} regels`);
  process.exit(0);
}

const nummer = wa.normaliseerNummer(ruw);
if (!nummer) {
  console.log(`ONBRUIKBAAR — "${ruw}" is geen bruikbaar telefoonnummer. Niets schrijven, wel melden.`);
  process.exit(1);
}

// 324xxxxxxxx is een Belgisch gsm-nummer; al de rest is een vaste lijn, en
// WhatsApp op een vaste lijn is te zeldzaam om te gokken.
const gsm = /^324\d+$/.test(nummer);
console.log(nummer);
console.log(gsm
  ? 'GSM — bruikbaar als WhatsApp-nummer (mits het bedrijf toestemming gaf).'
  : 'VAST NUMMER — niets schrijven, wel melden.');
