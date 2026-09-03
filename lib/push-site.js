#!/usr/bin/env node
// =====================================================================
// lib/push-site.js — publiceert de statische site (output/) naar een
// GitHub-repo die Cloudflare Workers automatisch uitrolt.
//
// Dit vervangt het handmatig plakken in GHL. De gegenereerde HTML bevat al
// title, meta description, canonical, OG/twitter en JSON-LD — op een statische
// host is het bestand dus de volledige pagina, zonder losse SEO-tab.
//
// De repo krijgt een vaste vorm die Cloudflare begrijpt:
//   public/          → alle pagina's (de "assets directory")
//   wrangler.jsonc   → vertelt Cloudflare waar die map staat
//   README.md        → waarschuwing dat de map automatisch gevuld wordt
//
// Leest uit .env (of omgevingsvariabelen):
//   GITHUB_TOKEN      — nodig om te pushen
//   GITHUB_SITE_REPO  — bv. 'Magicworx-be/keurwijzer-site'
//   CF_PROJECT_NAME   — optioneel; standaard de naam van de repo. MOET gelijk
//                       zijn aan de projectnaam in je Cloudflare-dashboard,
//                       anders maakt de deploy daar een tweede project aan.
//
// Ontbreekt GITHUB_SITE_REPO, dan doet dit script NIETS en slaagt de build
// gewoon — precies zoals lib/push-registry.js zich gedraagt zonder token.
//
// Wat er gepubliceerd wordt, komt uit de registry (niet uit "alles wat in
// output/ staat"), zodat testmappen en OS-rommel als desktop.ini nooit
// meeliften naar de live site.
//
// Gebruik:  node lib/push-site.js            → publiceren
//           node lib/push-site.js --dry-run  → enkel tonen wat er zou gaan
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const R = require('./registry');
const { uitleg } = require('./veilig-fout');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'output');
const DRY = process.argv.includes('--dry-run');

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
const REPO  = process.env.GITHUB_SITE_REPO;

// ---- 1) Bepalen wat er gepubliceerd hoort te worden -------------------
// Exact dezelfde verwachting als de weespagina-opruiming in build-all.js,
// aangevuld met de bestanden die naast de pagina's live moeten staan.
function tePubliceren() {
  const registry = R.loadRegistry(ROOT);
  const wil = ['index.html', 'sitemap.xml', 'robots.txt', 'registry.json'];
  for (const n of R.niches(registry))  wil.push(n.niche + '/index.html');
  for (const r of R.regios(registry))  wil.push('regio/' + r.regioSlug + '/index.html');
  for (const p of registry)            wil.push(p.slug + '/index.html');

  const aanwezig = [], ontbreekt = [];
  for (const rel of wil) {
    (fs.existsSync(path.join(OUT, rel)) ? aanwezig : ontbreekt).push(rel);
  }
  return { aanwezig, ontbreekt };
}

// ---- 2) Bestanden die dit script zelf aanmaakt ------------------------
const HEADERS = [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Cache-Control: public, max-age=600, must-revalidate',
  ''
].join('\n');

function wranglerConfig() {
  const naam = process.env.CF_PROJECT_NAME || (REPO || 'keurwijzer-site').split('/').pop();
  return JSON.stringify({
    name: naam,
    compatibility_date: '2026-08-28',
    assets: { directory: './public' }
  }, null, 2) + '\n';
}

const LEESMIJ = [
  '# keurwijzer-site',
  '',
  'Deze map wordt **automatisch** gevuld door `node build-all.js` in het',
  'Keurwijzer-project. Bewerk hier niets met de hand — bij de volgende build',
  'wordt alles overschreven.',
  '',
  '- `public/` — de gepubliceerde pagina\'s',
  '- `wrangler.jsonc` — vertelt Cloudflare waar die pagina\'s staan',
  ''
].join('\n');

// ---- 3) Controle vooraf ----------------------------------------------
const { aanwezig, ontbreekt } = tePubliceren();

if (ontbreekt.length) {
  console.error('⚠  Deze pagina\'s staan in de registry maar niet in output/:');
  for (const rel of ontbreekt) console.error('     ' + rel);
  console.error('   Draai eerst `node build-all.js`. Er is NIETS gepubliceerd.');
  // Exitcode 1, niet 0: een ontbrekende pagina is een echte storing. Zou dit
  // stilzwijgend slagen, dan zou build-all.js denken dat de site geldig
  // gepubliceerd is terwijl er een pagina mist.
  process.exit(1);
}

if (DRY) {
  console.log('DRY RUN — dit zou gepubliceerd worden (' + aanwezig.length + ' pagina\'s):');
  for (const rel of aanwezig.sort()) console.log('  public/' + rel);
  console.log('\nDaarnaast genereert dit script zelf:');
  console.log('  public/_headers   (caching en beveiliging)');
  console.log('  wrangler.jsonc    (Cloudflare-configuratie)');
  console.log('  README.md         (waarschuwing: map wordt automatisch gevuld)');
  console.log('\nDoelrepo:        ' + (REPO || '(GITHUB_SITE_REPO nog niet ingesteld in .env)'));
  console.log('Cloudflare-naam: ' + (process.env.CF_PROJECT_NAME || (REPO || 'keurwijzer-site').split('/').pop()));
  process.exit(0);
}

if (!TOKEN || !REPO) {
  console.log('› site-publicatie overgeslagen — GITHUB_SITE_REPO niet ingesteld in .env.');
  console.log('  (De build is volledig geslaagd. Zet de variabele pas als de host klaarstaat.)');
  process.exit(0);
}

// ---- 4) Repo klonen, inhoud vervangen, pushen -------------------------
const T = require('./tijdelijke-map');
// Buiten de projectmap (dus buiten OneDrive) — zie lib/tijdelijke-map.js.
const tmp = T.maakTijdelijkeMap('kw-site-');

function run(cmd, args, opts) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
}
function cleanup() {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
}

try {
  cleanup();
  const remote = 'https://x-access-token:' + TOKEN + '@github.com/' + REPO + '.git';

  console.log('› site publiceren naar ' + REPO + ' (' + aanwezig.length + ' pagina\'s)...');
  // core.autocrlf staat op deze machine op true. Zonder de override hieronder
  // krijgen de gekloonde bestanden Windows-regeleindes terwijl wij ze met Unix-
  // regeleindes wegschrijven — dan lijkt élk bestand gewijzigd en publiceert
  // elke build opnieuw, ook als er niets veranderd is.
  run('git', ['clone', '-c', 'core.autocrlf=false', '--depth', '1', remote, tmp]);
  T.schoonRefs(tmp);

  // Oude inhoud weg (behalve .git), zodat verwijderde regio's ook echt
  // offline gaan in plaats van als weespagina te blijven staan.
  for (const e of fs.readdirSync(tmp)) {
    if (e === '.git') continue;
    fs.rmSync(path.join(tmp, e), { recursive: true, force: true });
  }

  const publicDir = path.join(tmp, 'public');
  for (const rel of aanwezig) {
    const doel = path.join(publicDir, rel);
    fs.mkdirSync(path.dirname(doel), { recursive: true });
    fs.copyFileSync(path.join(OUT, rel), doel);
  }
  fs.writeFileSync(path.join(publicDir, '_headers'), HEADERS);
  fs.writeFileSync(path.join(tmp, 'wrangler.jsonc'), wranglerConfig());
  fs.writeFileSync(path.join(tmp, 'README.md'), LEESMIJ);

  const status = run('git', ['status', '--porcelain'], { cwd: tmp }).trim();
  if (!status) {
    console.log('  ✓ site is ongewijzigd — geen publicatie nodig.');
    cleanup();
    process.exit(0);
  }

  // Een gloednieuwe, lege repo heeft nog geen branch; afhankelijk van de
  // git-instelling zou de eerste commit op 'master' belanden. Forceer 'main'.
  run('git', ['checkout', '-B', 'main'], { cwd: tmp });
  run('git', ['config', 'user.email', 'build@keurwijzer.be'], { cwd: tmp });
  run('git', ['config', 'user.name', 'Keurwijzer Build'], { cwd: tmp });
  run('git', ['add', '-A'], { cwd: tmp });
  run('git', ['commit', '-m', 'Site bijgewerkt — ' + new Date().toISOString().slice(0, 10)], { cwd: tmp });
  run('git', ['push', 'origin', 'main'], { cwd: tmp });

  console.log('  ✓ gepubliceerd: ' + aanwezig.length + ' pagina\'s + configuratie — live binnen ~30 s.');
} catch (err) {
  // git schrijft zijn uitleg soms naar stdout in plaats van stderr; uitleg() neemt
  // beide mee én haalt het token uit de melding — zie lib/veilig-fout.js.
  console.error('⚠  Publiceren mislukt:\n' +
    uitleg(err).split('\n').map(r => '   ' + r).join('\n'));
  console.error('   (De live site is onveranderd; los de fout op en draai opnieuw.)');
  // Exitcode 1, zodat build-all.js dit als gefaalde publicatie meldt in plaats
  // van stil met exitcode 0 door te gaan.
  process.exitCode = 1;
} finally {
  cleanup();
}
