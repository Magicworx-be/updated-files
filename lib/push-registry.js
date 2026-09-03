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
const { uitleg } = require('./veilig-fout');

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

// Waarop controleren we de CDN? Op de VERZAMELING PAGINA-SLUGS, niet op
// `_generated`.
//
// build-all.js zet in `_generated` bij élke build een nieuwe timestamp, ook als
// er inhoudelijk niets wijzigt. Daarop controleren zou betekenen dat we bij
// iedere build een verse CDN-fetch eisen; jsDelivr ververst niet zo agressief,
// dus die controle zou vrijwel altijd falen. Een alarm dat altijd afgaat, wordt
// genegeerd — en dan is het middel erger dan de kwaal.
//
// Wat wél telt is de slug-verzameling: precies díé bepaalt of een regio op de
// hub een klikbare kaart wordt of een grijze "binnenkort"-kaart. Beide echte
// storingen vallen hiermee door de mand (28-08: 7 i.p.v. 11 pagina's; 31-08:
// dakwerkers-tielt ontbrak), terwijl een louter achterlopende timestamp met
// identieke inhoud terecht geen alarm geeft.
const VERWACHTE_SLUGS = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    return new Set((j.pages || []).map(p => p.slug));
  } catch { return null; }
})();

function zelfdeSlugs(body) {
  try {
    const j = JSON.parse(body);
    const gekregen = new Set((j.pages || []).map(p => p.slug));
    if (gekregen.size !== VERWACHTE_SLUGS.size) return false;
    for (const s of VERWACHTE_SLUGS) if (!gekregen.has(s)) return false;
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------
// jsDelivr purgen ÉN verifiëren.
//
// Waarom verifiëren? Een 200 van purge.jsdelivr.net betekent alleen dat de
// purge is AANVAARD, niet dat de edge zijn kopie al heeft laten vallen — dat
// gebeurt asynchroon aan hun kant. Op 2026-08-31 gaven beide purges netjes 200
// terwijl de '@main'-variant — precies de URL die hub.html en homepage.html
// ophalen — nog ruim drie minuten een oudere registry.json bleef serveren. Niets
// faalde, geen fallback sprong in, en de nieuwe regio bleef stil een grijze
// "binnenkort"-kaart. Daarom vragen we na het purgen net zo lang op tot de CDN
// dezelfde pagina-slugs teruggeeft als wat we net pushten, en purgen we
// tussendoor opnieuw.
// ---------------------------------------------------------------------
const https = require('https');
const VARIANTEN = [
  { label: '@main',    purge: 'https://purge.jsdelivr.net/gh/' + REPO + '@main/registry.json',
                       cdn:   'https://cdn.jsdelivr.net/gh/' + REPO + '@main/registry.json' },
  { label: 'ref-loos', purge: 'https://purge.jsdelivr.net/gh/' + REPO + '/registry.json',
                       cdn:   'https://cdn.jsdelivr.net/gh/' + REPO + '/registry.json' },
];

function haal(url) {
  return new Promise(resolve => {
    const req = https.get(url, {
      headers: {
        // Unieke User-Agent + no-cache: houdt onze eigen kant van de lijn schoon,
        // zodat we echt meten wat de CDN-edge serveert.
        'User-Agent': 'keurwijzer-build/' + process.pid + '-' + Date.now(),
        'Cache-Control': 'no-cache',
      },
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: 0, body: '' }); });
  });
}

const wacht = ms => new Promise(r => setTimeout(r, ms));

// Serveert deze variant al dezelfde pagina's als wat we net pushten?
async function isActueel(v) {
  const { status, body } = await haal(v.cdn);
  if (status !== 200) return false;
  return zelfdeSlugs(body);
}

async function purgeEnVerifieer() {
  if (!VERWACHTE_SLUGS || !VERWACHTE_SLUGS.size) {
    console.log('  ⚠ geen pagina\'s in registry.json — CDN niet te verifiëren, enkel gepurged.');
    for (const v of VARIANTEN) await haal(v.purge);
    return true;
  }
  // Escalerende wachttijden: samen ~85 s in het slechtste geval. Een build duurt
  // toch al minuten, en een stille verouderde CDN kost een halve dag zoekwerk.
  const PAUZES = [3000, 6000, 10000, 15000, 20000, 30000];
  let open = VARIANTEN.slice();

  for (let poging = 0; poging <= PAUZES.length; poging++) {
    for (const v of open) {
      const { status } = await haal(v.purge);
      if (status !== 200 && poging === 0) {
        console.log('  ⚠ jsDelivr-purge ' + v.label + ' gaf status ' + status + ' — we blijven verifiëren.');
      }
    }
    if (poging < PAUZES.length) await wacht(PAUZES[poging]);

    const nogOpen = [];
    for (const v of open) {
      if (await isActueel(v)) {
        console.log('  ✓ jsDelivr serveert alle ' + VERWACHTE_SLUGS.size + ' pagina\'s (' + v.label + ', geverifieerd)');
      } else nogOpen.push(v);
    }
    open = nogOpen;
    if (!open.length) return true;
  }

  // Laten zien wát er ontbreekt — dat scheelt raden.
  for (const v of open) {
    const { body } = await haal(v.cdn);
    let mist = [];
    try {
      const gekregen = new Set((JSON.parse(body).pages || []).map(p => p.slug));
      mist = [...VERWACHTE_SLUGS].filter(s => !gekregen.has(s));
    } catch { /* onleesbaar */ }
    console.error('  !! jsDelivr (' + v.label + ') mist: ' + (mist.length ? mist.join(', ') : 'onleesbare registry.json'));
  }
  console.error('     De purge werd aanvaard maar de edge is niet ververst.');
  console.error('     hub.html en homepage.html lezen de @main-variant, dus zolang die');
  console.error('     achterloopt blijven die regio\'s als grijze "binnenkort"-kaart staan.');
  console.error('     → Draai over een paar minuten opnieuw: node build-all.js');
  return false;
}

// ---- Kloon de data-repo in een tijdelijke map, kopieer registry.json, commit+push ----
const T = require('./tijdelijke-map');
// Buiten de projectmap (dus buiten OneDrive) — zie lib/tijdelijke-map.js.
const tmp = T.maakTijdelijkeMap('kw-registry-');

function run(cmd, args, opts) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
}

function cleanup() {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
}

(async () => {
  let cdnOk = true;
  let pushFout = false;
  try {
    cleanup();
    const remote = 'https://x-access-token:' + TOKEN + '@github.com/' + REPO + '.git';

    console.log('› registry.json pushen naar ' + REPO + '...');
    run('git', ['clone', '--depth', '1', remote, tmp]);
    T.schoonRefs(tmp);

    // registry.json kopiëren
    fs.copyFileSync(registryFile, path.join(tmp, 'registry.json'));

    // Kijken of er iets veranderd is
    const status = run('git', ['status', '--porcelain'], { cwd: tmp }).trim();
    if (!status) {
      // Ongewijzigd betekent NIET automatisch dat de CDN klopt: als een vorige
      // push wél landde maar de purge niet, staat er nog steeds een oude kopie
      // op de edge. Daarom ook hier verifiëren in plaats van blind afsluiten.
      console.log('  ✓ registry.json is ongewijzigd — geen push nodig.');
      cdnOk = await purgeEnVerifieer();
      cleanup();
      process.exit(cdnOk ? 0 : 2);
    }

    run('git', ['config', 'user.email', 'build@keurwijzer.be'], { cwd: tmp });
    run('git', ['config', 'user.name', 'Keurwijzer Build'], { cwd: tmp });
    run('git', ['add', 'registry.json'], { cwd: tmp });
    run('git', ['commit', '-m', 'registry.json bijgewerkt — ' + new Date().toISOString().slice(0, 10)], { cwd: tmp });
    run('git', ['push', 'origin', 'main'], { cwd: tmp });

    console.log('  ✓ registry.json gepusht naar ' + REPO);

    // BEIDE varianten purgen én verifiëren: de hubs lezen '@main' (vastgepind,
    // zie hub.html / homepage.html), maar de ref-loze URL blijft bestaan in
    // oudere, al geplakte GHL-pagina's. Op 2026-08-28 bleef de ref-loze URL een
    // verouderde registry.json serveren, op 2026-08-31 juist de '@main'-variant.
    // Beide keren zag je dat pas aan de live hub — vandaar de harde controle.
    cdnOk = await purgeEnVerifieer();
  } catch (err) {
    // uitleg() haalt het token uit de foutmelding — zie lib/veilig-fout.js.
    pushFout = true;
    console.error('⚠  Push mislukt: ' + uitleg(err));
    console.error('   (Niets gepubliceerd; los de fout op en draai opnieuw.)');
  } finally {
    cleanup();
  }
  // Exitcodes, in volgorde van ernst:
  //   1 = de push naar GitHub is ECHT mislukt (kloon/commit/push wierp een fout).
  //       Dit gaf vroeger stil exitcode 0 omdat cdnOk `true` bleef in de catch —
  //       waardoor build-all.js dacht dat de push geslaagd was. Nu hard 1.
  //   2 = de push landde WEL, maar jsDelivr serveert nog niet alle pagina's.
  //       build-all.js maakt daar een ander (en juist) advies van dan bij 1.
  if (pushFout) process.exitCode = 1;
  else if (!cdnOk) process.exitCode = 2;
})();
