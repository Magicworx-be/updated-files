#!/usr/bin/env node
// =====================================================================
// lib/push-registry.js — push registry.json naar de keurwijzer-data repo
//
// Leest GITHUB_TOKEN en GITHUB_REPO uit .env (of omgevingsvariabelen).
// Wordt aangeroepen door build-all.js na het genereren van registry.json.
//
// Gebruik:  node lib/push-registry.js [pad-naar-registry.json]
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// .env inlezen (simpel, geen extra dependency)
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
  console.error('⚠  GITHUB_TOKEN of GITHUB_REPO niet gevonden in .env — registry.json NIET gepusht.');
  console.error('   (De build is verder volledig geslaagd; push handmatig of vul .env aan.)');
  process.exit(0); // geen harde fout: build mag slagen zonder push
}

const registryFile = process.argv[2] || path.join(ROOT, 'output', 'registry.json');
if (!fs.existsSync(registryFile)) {
  console.error('⚠  ' + registryFile + ' niet gevonden — niets te pushen.');
  process.exit(0);
}

// ---- Kloon de data-repo in een tijdelijke map, kopieer registry.json, commit+push ----
const tmp = path.join(ROOT, '.registry-push-tmp');

function run(cmd, args, opts) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
}

function cleanup() {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
}

try {
  cleanup();
  const remote = 'https://x-access-token:' + TOKEN + '@github.com/' + REPO + '.git';

  console.log('› registry.json pushen naar ' + REPO + '...');
  run('git', ['clone', '--depth', '1', remote, tmp]);

  // registry.json kopiëren
  fs.copyFileSync(registryFile, path.join(tmp, 'registry.json'));

  // Kijken of er iets veranderd is
  const status = run('git', ['status', '--porcelain'], { cwd: tmp }).trim();
  if (!status) {
    console.log('  ✓ registry.json is ongewijzigd — geen push nodig.');
    cleanup();
    process.exit(0);
  }

  run('git', ['config', 'user.email', 'build@keurwijzer.be'], { cwd: tmp });
  run('git', ['config', 'user.name', 'Keurwijzer Build'], { cwd: tmp });
  run('git', ['add', 'registry.json'], { cwd: tmp });
  run('git', ['commit', '-m', 'registry.json bijgewerkt — ' + new Date().toISOString().slice(0, 10)], { cwd: tmp });
  run('git', ['push', 'origin', 'main'], { cwd: tmp });

  console.log('  ✓ registry.json gepusht naar ' + REPO);

  // jsDelivr-cache purgen zodat de update direct beschikbaar is.
  // BEIDE varianten purgen: de hubs lezen '@main' (vastgepind, zie hub.html /
  // homepage.html), maar de ref-loze URL blijft bestaan in oudere, al geplakte
  // GHL-pagina's. Op 2026-08-28 bleef precies die ref-loze URL een verouderde
  // registry.json serveren (7 i.p.v. 11 pagina's) terwijl '@main' correct was,
  // waardoor live regio's als "binnenkort" op de hubs verschenen.
  const purgeUrls = [
    'https://purge.jsdelivr.net/gh/' + REPO + '@main/registry.json',
    'https://purge.jsdelivr.net/gh/' + REPO + '/registry.json'
  ];
  try {
    const https = require('https');
    for (const purgeUrl of purgeUrls) {
      const label = purgeUrl.includes('@main') ? '@main' : 'ref-loos';
      https.get(purgeUrl, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
          if (res.statusCode === 200) console.log('  ✓ jsDelivr-cache gepurged (' + label + ')');
          else console.log('  ⚠ jsDelivr-purge ' + label + ' status ' + res.statusCode + ' (niet kritiek)');
        });
      }).on('error', () => console.log('  ⚠ jsDelivr-purge ' + label + ' mislukt (niet kritiek)'));
    }
  } catch { /* negeren */ }
} catch (err) {
  console.error('⚠  Push mislukt: ' + (err.stderr || err.message));
  console.error('   (De build is verder volledig geslaagd; push handmatig.)');
} finally {
  cleanup();
}
