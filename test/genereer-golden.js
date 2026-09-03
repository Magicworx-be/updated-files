// =====================================================================
// test/genereer-golden.js — snapshots (her)aanmaken
//
//   node test/genereer-golden.js            alle 16 live slugs
//   node test/genereer-golden.js <slug> …   alleen deze
//
// LEES DIT VOOR JE HET DRAAIT. Een snapshot is het bewijsstuk waartegen elke
// latere wijziging aan de rekenkern wordt gehouden. Hem opnieuw maken omdat een
// test faalt, maakt het vangnet stuk — dan meet je alleen nog dat de code
// gelijk is aan zichzelf.
//
// Een snapshot vernieuwen mag in precies twee gevallen:
//   1. de pagina is bewust op een nieuwe methodiek-versie gezet;
//   2. de selectie is bewust herijkt met `node build.js <slug> --nieuwe-selectie`
//      (de jaarlijkse update met verse data).
// In beide gevallen: eerst de pagina bouwen en publiceren, dan pas de snapshot,
// en zeg in het commitbericht welke van de twee het was.
// =====================================================================
'use strict';
const G = require('./golden-lib');

const gevraagd = process.argv.slice(2).filter(a => !a.startsWith('--'));
const slugs = gevraagd.length ? gevraagd : G.alleSlugs();

let gewijzigd = 0;
for (const slug of slugs) {
  let oud = null;
  try { oud = G.leesGolden(slug); } catch { /* nog geen snapshot */ }
  const nieuw = G.berekenSnapshot(slug);
  const zelfde = oud && JSON.stringify(oud) === JSON.stringify(nieuw);
  G.schrijfGolden(slug, nieuw);
  if (!zelfde) gewijzigd++;
  console.log(
    (oud === null ? '+ nieuw   ' : zelfde ? '= gelijk  ' : '~ GEWIJZIGD') + '  ' +
    slug.padEnd(28) + 'v' + nieuw.methodiek + '  ' +
    nieuw.aantalEligible + ' eligible → ' + nieuw.vignet
  );
}
console.log('\n' + slugs.length + ' snapshot(s) geschreven, ' + gewijzigd + ' gewijzigd of nieuw.');
