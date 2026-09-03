#!/usr/bin/env node
// =====================================================================
// lib/push-badges.js — push de gegenereerde badge-PNG's naar de keurwijzer-data
// repo (dezelfde repo als registry.json), geserveerd via jsDelivr-CDN.
//
// Analoog aan lib/push-registry.js: leest GITHUB_TOKEN en GITHUB_REPO uit .env,
// kloont de repo ondiep, spiegelt de badges/-map, commit + pusht enkel bij een
// echte wijziging, en purget de jsDelivr-cache van de gewijzigde bestanden.
//
// Stabiele CDN-URL's:
//   https://cdn.jsdelivr.net/gh/<REPO>/badges/<slug>/<bedrijf-slug>--donker.png
//   https://cdn.jsdelivr.net/gh/<REPO>/badges/<slug>/<bedrijf-slug>--licht.png
//
// Gebruik:  node lib/push-badges.js
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { uitleg } = require('./veilig-fout');

const ROOT = path.resolve(__dirname, '..');
const BADGES = path.join(ROOT, 'badges');

// .env inlezen (zelfde simpele parser als push-registry.js)
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const TOKEN = process.env.GITHUB_TOKEN;
const REPO  = process.env.GITHUB_REPO;   // 'Magicworx-be/keurwijzer-data'

if (!TOKEN || !REPO) {
  console.error('⚠  GITHUB_TOKEN of GITHUB_REPO niet gevonden in .env — badges NIET gepusht.');
  console.error('   Vul .env aan en draai opnieuw: node lib/push-badges.js');
  // Exitcode 1, niet 0. Beide variabelen staan sinds de eerste publicatie in .env;
  // ontbreken ze, dan is er iets stuk (verkeerde werkmap, .env kwijt) en zijn de
  // badges niet gepubliceerd. Met exitcode 0 zag build-all.js dat als geslaagd en
  // bleef de melding uit de eindsamenvatting — precies het stille faalpad dat
  // opdracht 01 dichtte voor de pagina's zelf.
  process.exit(1);
}

if (!fs.existsSync(BADGES)) {
  console.error('⚠  badges/ niet gevonden — badges NIET gepusht.');
  console.error('   Draai eerst de generator: node scripts/genereer-badges.js');
  // Exitcode 1: build-all.js draait de generator vlak vóór deze push, dus een
  // ontbrekende badges/-map betekent dat die generator faalde. Dat hoort in de
  // eindsamenvatting te staan, niet stil voorbij te gaan.
  process.exit(1);
}

// Alle badge-bestanden lokaal, relatief t.o.v. de repo-root: de PNG's plus het
// badges.json van elke pagina. Dat JSON-bestand is de opzoektabel bij het
// beantwoorden van badge-vragen (naam, gemeente, tier, badge-URL's); badges/ staat
// lokaal in .gitignore, dus dit is meteen ook de enige duurzame kopie ervan.
// Het bevat uitsluitend gegevens die al publiek op de pagina staan — geen
// mailadressen of andere contactgegevens.
function badgeFiles(dir, rel = 'badges') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const r = rel + '/' + e.name;
    if (e.isDirectory()) out.push(...badgeFiles(p, r));
    else if (e.name.endsWith('.png') || e.name === 'badges.json') out.push(r);
  }
  return out;
}

const T = require('./tijdelijke-map');
// Buiten de projectmap (dus buiten OneDrive) — zie lib/tijdelijke-map.js.
const tmp = T.maakTijdelijkeMap('kw-badges-');
function run(cmd, args, opts) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
}
function cleanup() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ } }

// jsDelivr-cache purgen voor één pad (niet kritiek als het faalt).
function purge(relPath) {
  return new Promise((resolve) => {
    https.get('https://purge.jsdelivr.net/gh/' + REPO + '/' + relPath, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

(async () => {
  const lokaal = badgeFiles(BADGES);
  if (!lokaal.length) {
    console.error('⚠  Geen badge-bestanden in badges/ — badges NIET gepusht.');
    console.error('   Draai eerst de generator: node scripts/genereer-badges.js');
    T.ruimOp(tmp);
    process.exit(1);   // zelfde reden als de ontbrekende badges/-map hierboven
  }

  try {
    cleanup();
    const remote = 'https://x-access-token:' + TOKEN + '@github.com/' + REPO + '.git';

    console.log('› badges pushen naar ' + REPO + '...');
    run('git', ['clone', '--depth', '1', remote, tmp]);
    T.schoonRefs(tmp);

    // Spiegelen: bestaande badges/-map in de repo wissen en vervangen door de
    // lokale set. Zo verdwijnen ook badges van bedrijven/pagina's die niet meer
    // gepubliceerd worden — de CDN blijft exact gelijk aan de laatste build.
    const destBadges = path.join(tmp, 'badges');
    fs.rmSync(destBadges, { recursive: true, force: true });
    for (const rel of lokaal) {
      const dest = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), dest);
    }

    // Wat is er veranderd? (voor de commit-check én de gerichte cache-purge)
    run('git', ['add', '-A', 'badges'], { cwd: tmp });
    const staged = run('git', ['diff', '--cached', '--name-only'], { cwd: tmp })
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (!staged.length) {
      console.log('  ✓ badges ongewijzigd — geen push nodig.');
      cleanup();
      process.exit(0);
    }

    run('git', ['config', 'user.email', 'build@keurwijzer.be'], { cwd: tmp });
    run('git', ['config', 'user.name', 'Keurwijzer Build'], { cwd: tmp });
    run('git', ['commit', '-m', 'badges bijgewerkt — ' + new Date().toISOString().slice(0, 10)], { cwd: tmp });
    run('git', ['push', 'origin', 'main'], { cwd: tmp });
    console.log('  ✓ ' + staged.length + ' badge-bestand(en) gepusht naar ' + REPO);

    // ALLE gewijzigde paden purgen — óók de verwijderde.
    //
    // Hier stond ooit een `fs.existsSync`-filter, met de redenering dat een
    // verwijderd bestand geen purge nodig heeft. Dat is precies verkeerd om: uit
    // de repo halen zegt de CDN niets. jsDelivr blijft een verwijderd pad uit
    // zijn edge-cache serveren tot die vanzelf verloopt (bij een ref-loze URL
    // dagen). Gemeten op 03-09-2026: de zes badges van drie bedrijven die niet
    // meer in de selectie stonden waren uit de repo verdwenen en gaven op de CDN
    // nog altijd HTTP 200.
    //
    // Dat is nu net het geval dat ertoe doet: een bedrijf dat uit de Top 10 valt
    // mag geen werkende badge houden die "Top 3" claimt.
    //
    // badges.json hoort er uitdrukkelijk bij: een verouderde opzoektabel op de CDN
    // zou naar badges verwijzen die niet meer bestaan.
    const teZuiveren = staged.filter(f => f.endsWith('.png') || f.endsWith('.json'));
    let ok = 0;
    for (const rel of teZuiveren) if (await purge(rel)) ok++;
    console.log('  ✓ jsDelivr-cache gepurged voor ' + ok + '/' + teZuiveren.length + ' bestand(en)');
  } catch (err) {
    // uitleg() haalt het token uit de foutmelding — zie lib/veilig-fout.js.
    console.error('⚠  Badge-push mislukt: ' + uitleg(err));
    console.error('   (Los de fout op en draai opnieuw.)');
    // Exitcode 1, zodat build-all.js de gefaalde badge-push meldt in plaats van
    // stil met exitcode 0 door te gaan.
    process.exitCode = 1;
  } finally {
    cleanup();
  }
})();
