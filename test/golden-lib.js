// =====================================================================
// test/golden-lib.js — één plek die weet HOE je de rekenkern uitleest
//
// Vandaag doet dat via `node build.js <slug>` met KEURWIJZER_GOLDEN_OUT gezet:
// build.js schrijft dan zijn tussenresultaten weg en stopt vóór het schrijven
// van de pagina, selectie.json, het rapport of de badges. Een snapshot maken
// raakt dus niets wat gepubliceerd wordt.
//
// Zodra de rekenkern een eigen module is (opdracht 03 stap B, lib/rekenkern.js)
// verandert alleen `berekenSnapshot` hieronder: die roept dan de pure functie
// rechtstreeks aan. De snapshots en de tests blijven ongewijzigd — dat is
// precies waarom ze eerst gemaakt zijn.
// =====================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GOLDEN_DIR = path.join(__dirname, 'golden');

// Alle live slugs, in dezelfde volgorde als de registry ze kent.
function alleSlugs() {
  const R = require(path.join(ROOT, 'lib', 'registry'));
  return R.loadRegistry(ROOT).map(e => e.slug);
}

// Draait de rekenkern voor één slug en geeft de momentopname terug.
function berekenSnapshot(slug) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-golden-'));
  const uit = path.join(tmp, slug + '.json');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'build.js'), slug], {
      cwd: ROOT,
      env: { ...process.env, KEURWIJZER_GOLDEN_OUT: uit },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (!fs.existsSync(uit)) {
      throw new Error('build.js schreef geen momentopname voor ' + slug +
        ' — staat het KEURWIJZER_GOLDEN_OUT-blok er nog in?');
    }
    return JSON.parse(fs.readFileSync(uit, 'utf8'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function goldenPad(slug) { return path.join(GOLDEN_DIR, slug + '.json'); }

function leesGolden(slug) {
  const p = goldenPad(slug);
  if (!fs.existsSync(p)) {
    throw new Error('geen snapshot voor ' + slug + ' — draai: node test/genereer-golden.js ' + slug);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function schrijfGolden(slug, snapshot) {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  fs.writeFileSync(goldenPad(slug), JSON.stringify(snapshot, null, 2) + '\n');
}

// Leesbaar verschil tussen twee snapshots: welke velden wijken af, en hoeveel.
// Bedoeld voor de foutmelding van een falende test, niet voor volledigheid —
// de eerste tien afwijkingen zeggen genoeg om te weten wat er gebeurd is.
function verschillen(verwacht, gekregen, pad = '', uit = []) {
  if (uit.length >= 10) return uit;
  const beide = new Set([
    ...(verwacht && typeof verwacht === 'object' ? Object.keys(verwacht) : []),
    ...(gekregen && typeof gekregen === 'object' ? Object.keys(gekregen) : []),
  ]);
  if (!beide.size || verwacht === null || gekregen === null ||
      typeof verwacht !== 'object' || typeof gekregen !== 'object') {
    if (JSON.stringify(verwacht) !== JSON.stringify(gekregen)) {
      uit.push('  ' + (pad || '(geheel)') + ': verwacht ' + JSON.stringify(verwacht) +
        ', gekregen ' + JSON.stringify(gekregen));
    }
    return uit;
  }
  for (const k of beide) {
    const sub = pad ? pad + '.' + k : k;
    verschillen(verwacht ? verwacht[k] : undefined, gekregen ? gekregen[k] : undefined, sub, uit);
    if (uit.length >= 10) break;
  }
  return uit;
}

module.exports = { ROOT, GOLDEN_DIR, alleSlugs, berekenSnapshot, leesGolden, schrijfGolden, goldenPad, verschillen };
