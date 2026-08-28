#!/usr/bin/env node
// =====================================================================
// lib/push-site.js — publiceert de statische site (output/) naar een
// GitHub-repo die door de host (Cloudflare Pages / Netlify) uitgerold wordt.
//
// Dit vervangt het handmatig plakken in GHL. De gegenereerde HTML bevat al
// title, meta description, canonical, OG/twitter en JSON-LD — op een statische
// host is het bestand dus de volledige pagina, zonder losse SEO-tab.
//
// Leest GITHUB_TOKEN en GITHUB_SITE_REPO uit .env (of omgevingsvariabelen).
// Ontbreekt GITHUB_SITE_REPO, dan doet dit script NIETS en slaagt de build
// gewoon — precies zoals lib/push-registry.js zich gedraagt zonder token.
// Zolang die variabele niet is ingevuld, verandert er dus niets aan je site.
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
const REPO  = process.env.GITHUB_SITE_REPO;   // bv. 'Magicworx-be/keurwijzer-site'

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

// _headers werkt zowel op Cloudflare Pages als op Netlify. We schrijven hem
// in de push-map en niet in output/, zodat output/ exact blijft wat de build
// ervan maakt.
const HEADERS = [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Cache-Control: public, max-age=600, must-revalidate',
  ''
].join('\n');

const { aanwezig, ontbreekt } = tePubliceren();

if (ontbreekt.length) {
  console.error('⚠  Deze pagina\'s staan in de registry maar niet in output/:');
  for (const rel of ontbreekt) console.error('     ' + rel);
  console.error('   Draai eerst `node build-all.js`. Er is NIETS gepubliceerd.');
  process.exit(0);
}

if (DRY) {
  console.log('DRY RUN — dit zou gepubliceerd worden (' + aanwezig.length + ' bestanden):');
  for (const rel of aanwezig.sort()) console.log('  ' + rel);
  console.log('  _headers  (caching/beveiliging, door dit script gegenereerd)');
  console.log('\nDoelrepo: ' + (REPO || '(GITHUB_SITE_REPO nog niet ingesteld in .env)'));
  process.exit(0);
}

if (!TOKEN || !REPO) {
  console.log('› site-publicatie overgeslagen — GITHUB_SITE_REPO niet ingesteld in .env.');
  console.log('  (De build is volledig geslaagd. Zet de variabele pas als de host klaarstaat.)');
  process.exit(0);
}

// ---- 2) Repo klonen, inhoud vervangen, pushen -------------------------
const tmp = path.join(ROOT, '.site-push-tmp');

function run(cmd, args, opts) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });
}
function cleanup() {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
}

try {
  cleanup();
  const remote = 'https://x-access-token:' + TOKEN + '@github.com/' + REPO + '.git';

  console.log('› site publiceren naar ' + REPO + ' (' + aanwezig.length + ' bestanden)...');
  run('git', ['clone', '--depth', '1', remote, tmp]);

  // Oude inhoud weg (behalve .git), zodat verwijderde regio's ook echt
  // offline gaan in plaats van als weespagina te blijven staan.
  for (const e of fs.readdirSync(tmp)) {
    if (e === '.git') continue;
    fs.rmSync(path.join(tmp, e), { recursive: true, force: true });
  }

  for (const rel of aanwezig) {
    const doel = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(doel), { recursive: true });
    fs.copyFileSync(path.join(OUT, rel), doel);
  }
  fs.writeFileSync(path.join(tmp, '_headers'), HEADERS);

  const status = run('git', ['status', '--porcelain'], { cwd: tmp }).trim();
  if (!status) {
    console.log('  ✓ site is ongewijzigd — geen publicatie nodig.');
    cleanup();
    process.exit(0);
  }

  run('git', ['config', 'user.email', 'build@keurwijzer.be'], { cwd: tmp });
  run('git', ['config', 'user.name', 'Keurwijzer Build'], { cwd: tmp });
  run('git', ['add', '-A'], { cwd: tmp });
  run('git', ['commit', '-m', 'Site bijgewerkt — ' + new Date().toISOString().slice(0, 10)], { cwd: tmp });
  run('git', ['push', 'origin', 'main'], { cwd: tmp });

  const gewijzigd = status.split('\n').length;
  console.log('  ✓ gepubliceerd (' + gewijzigd + ' bestand(en) gewijzigd) — live binnen ~30 s.');
} catch (err) {
  console.error('⚠  Publiceren mislukt: ' + (err.stderr || err.message));
  console.error('   (De build is verder volledig geslaagd; de live site is onveranderd.)');
} finally {
  cleanup();
}
