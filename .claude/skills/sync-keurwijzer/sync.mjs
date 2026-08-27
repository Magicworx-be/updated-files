#!/usr/bin/env node
// sync.mjs — Keurwijzer working-tree → GitHub sync driver.
//
// Detecteert wijzigingen in de Keurwijzer-map en pusht ze naar de
// `updated-files` GitHub-repo (git@github.com:Magicworx-be/updated-files.git).
// Volgorde: fetch → (stage) → commit → rebase op de remote → push.
//
// Waarom een aparte remote: `origin` is de DATA-repo (keurwijzer-data) die
// jsDelivr serveert (registry.json + badges, gepusht door lib/push-*.js). De
// bronbestanden horen NIET in origin — die gaan naar `updated-files`. Dit
// script pusht daarom altijd expliciet naar `updated-files`, nooit naar origin.
//
// Gebruik:
//   node sync.mjs --dry-run                 # toon wat er zou gebeuren, wijzig niets
//   node sync.mjs -m "bericht"              # stage tracked wijzigingen, commit, rebase, push
//   node sync.mjs -m "bericht" --include "Apify scrape/geolocation.txt" [--include ...]
//   node sync.mjs -m "bericht" --all-untracked   # neem álle untracked bestanden mee
//
// Untracked bestanden worden NOOIT automatisch meegenomen (behalve met
// --all-untracked): standaard toont het script ze en stopt de agent om te
// vragen welke mee moeten. desktop.ini/Thumbs.db e.d. staan al in .gitignore
// en verschijnen dus niet.
//
// Config-override (voor tests): KW_SYNC_REMOTE / KW_SYNC_BRANCH.

import { execFileSync } from 'node:child_process';

const REMOTE = process.env.KW_SYNC_REMOTE || 'updated-files';
const BRANCH = process.env.KW_SYNC_BRANCH || 'main';

// ---- argumenten ---------------------------------------------------------
const args = process.argv.slice(2);
let message = null;
let dryRun = false;
let allUntracked = false;
const includes = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry-run' || a === '-n') dryRun = true;
  else if (a === '-m' || a === '--message') message = args[++i];
  else if (a === '--include') includes.push(args[++i]);
  else if (a === '--all-untracked') allUntracked = true;
  else { console.error('Onbekend argument: ' + a); process.exit(2); }
}

// ---- git-helpers --------------------------------------------------------
function git(cmdArgs, { capture = true, allowFail = false } = {}) {
  try {
    const out = execFileSync('git', cmdArgs, {
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    // Alleen achteraan trimmen: leading spaties zijn betekenisvol in
    // `git status --porcelain` (kolom X/Y), enkeltwaardige outputs (rev-parse)
    // hebben geen leading spatie, dus dit is overal veilig.
    return capture ? out.replace(/[\r\n]+$/, '') : '';
  } catch (e) {
    if (allowFail) return { failed: true, stdout: e.stdout || '', stderr: e.stderr || '' };
    console.error('git ' + cmdArgs.join(' ') + '  → mislukt');
    if (e.stdout) console.error(e.stdout.toString());
    if (e.stderr) console.error(e.stderr.toString());
    process.exit(1);
  }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

// ---- 0. in een git-repo? naar de root ----------------------------------
const root = git(['rev-parse', '--show-toplevel'], { allowFail: true });
if (root.failed) { console.error('Geen git-repo gevonden. Draai dit binnen de Keurwijzer-map.'); process.exit(1); }
process.chdir(root);

// Windows-artefact: een desktop.ini die in .git/refs belandt is GEEN geldige ref
// en laat `git fetch` volledig falen ("fatal: bad object .../desktop.ini"). Dit
// is dus een noodzakelijke REPARATIE, geen luxe — hij draait altijd (ook in
// --dry-run), want zonder deze opschoning werkt geen enkele git-operatie. Er
// worden alleen junk-bestanden (desktop.ini/Thumbs.db) uit .git/refs verwijderd;
// echte refs blijven onaangeroerd.
try {
  const gitDir = git(['rev-parse', '--git-dir']);
  execFileSync('node', ['-e', `
    const fs=require('fs'),p=require('path');
    function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);
    if(e.isDirectory())walk(f);else if(/^(desktop\\.ini|Thumbs\\.db)$/i.test(e.name)){try{fs.unlinkSync(f)}catch{}}}}
    try{walk(p.join(${JSON.stringify(gitDir)},'refs'))}catch{}
  `]);
} catch { /* best effort */ }

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);

// ---- 1. fetch (read-only) ----------------------------------------------
section('Ophalen van ' + REMOTE + ' (fetch, wijzigt niets)');
const fetchRes = git(['fetch', REMOTE], { allowFail: true });
if (fetchRes.failed) {
  console.error('Kon ' + REMOTE + ' niet bereiken. Staat de SSH-sleutel klaar en bestaat de remote?');
  console.error(fetchRes.stderr.toString());
  process.exit(1);
}
console.log('OK — remote ' + REMOTE + '/' + BRANCH + ' opgehaald.');

// ---- 2. divergentie t.o.v. remote --------------------------------------
let behind = 0, ahead = 0;
const rl = git(['rev-list', '--left-right', '--count', REMOTE + '/' + BRANCH + '...HEAD'], { allowFail: true });
if (!rl.failed) { const [b, a] = rl.split(/\s+/).map(Number); behind = b; ahead = a; }
section('Stand t.o.v. ' + REMOTE + '/' + BRANCH);
console.log('Lokale branch : ' + branch);
console.log('Achter remote : ' + behind + ' commit(s)  → worden via rebase onder je werk gezet');
console.log('Voor  remote  : ' + ahead + ' commit(s)  → worden gepusht');

// ---- 3. wijzigingen inventariseren -------------------------------------
const porcelain = git(['status', '--porcelain=v1']);
const lines = porcelain ? porcelain.split('\n') : [];
const trackedChanges = [];   // gewijzigd/verwijderd, al getrackt
const untracked = [];        // ?? — nieuw, nog niet getrackt
for (const raw of lines) {
  const ln = raw.replace(/\r$/, '');
  if (!ln) continue;
  const x = ln.slice(0, 2);
  const file = ln.slice(3).replace(/^"|"$/g, '');
  if (x === '??') untracked.push(file);
  else trackedChanges.push({ status: x.trim(), file });
}

section('Getrackte wijzigingen (' + trackedChanges.length + ')');
trackedChanges.forEach(c => console.log('  ' + c.status.padEnd(2) + ' ' + c.file));
if (!trackedChanges.length) console.log('  (geen)');

section('Nieuwe (untracked) bestanden (' + untracked.length + ')');
untracked.forEach(f => console.log('  ?? ' + f));
if (!untracked.length) console.log('  (geen)');

// welke untracked nemen we mee?
let untrackedToAdd = [];
if (allUntracked) untrackedToAdd = untracked.slice();
else if (includes.length) untrackedToAdd = includes.slice();

if (untracked.length && !allUntracked && !includes.length) {
  console.log('\n⚠  Er zijn nieuwe bestanden. Ze worden NIET automatisch meegenomen.');
  console.log('   Kies welke mee moeten en draai opnieuw met --include "<pad>" (of --all-untracked).');
}

const nothingToDo = !trackedChanges.length && !untrackedToAdd.length && ahead === 0 && behind === 0;
if (nothingToDo) { console.log('\n✓ Niets te syncen — alles is up-to-date.'); process.exit(0); }

// ---- dry-run stopt hier -------------------------------------------------
if (dryRun) {
  section('DRY-RUN — plan');
  console.log('Zou stagen: ' + trackedChanges.length + ' getrackte + ' + untrackedToAdd.length + ' nieuwe bestand(en)');
  console.log('Zou committen met bericht: ' + JSON.stringify(message || '(vereist: -m "bericht")'));
  console.log('Zou rebasen op ' + REMOTE + '/' + BRANCH + ' en pushen naar ' + REMOTE + ' ' + BRANCH + '.');
  console.log('\n(geen wijzigingen doorgevoerd)');
  process.exit(0);
}

// ---- 4. stagen ----------------------------------------------------------
const willCommit = trackedChanges.length || untrackedToAdd.length;
if (willCommit && !message) {
  console.error('\nEr zijn wijzigingen om te committen maar geen bericht. Geef -m "bericht".');
  process.exit(2);
}
if (trackedChanges.length) git(['add', '-u'], { capture: false });
if (untrackedToAdd.length) git(['add', '--', ...untrackedToAdd], { capture: false });

// ---- 5. committen -------------------------------------------------------
if (willCommit) {
  const staged = git(['diff', '--cached', '--name-only']);
  if (staged) { section('Committen'); git(['commit', '-m', message], { capture: false }); }
  else console.log('Niets gestaged — commit overgeslagen.');
}

// ---- 6. rebase op de remote (fetch + rebase) ---------------------------
section('Rebase op ' + REMOTE + '/' + BRANCH);
const reb = git(['rebase', REMOTE + '/' + BRANCH], { allowFail: true });
if (reb.failed) {
  console.error('Rebase-conflict — je lokale werk botst met de remote.');
  console.error((reb.stdout || '').toString());
  console.error((reb.stderr || '').toString());
  console.error('\nRebase afgebroken zodat je map onaangeroerd blijft. Los het handmatig op:');
  console.error('  git status   → bekijk de conflicten');
  console.error('  (of)  git rebase --abort  om terug te keren');
  git(['rebase', '--abort'], { allowFail: true });
  process.exit(1);
}
console.log('OK — lokaal werk staat nu boven op ' + REMOTE + '/' + BRANCH + '.');

// ---- 7. pushen ----------------------------------------------------------
section('Pushen naar ' + REMOTE + ' ' + BRANCH);
git(['push', REMOTE, 'HEAD:' + BRANCH], { capture: false });
console.log('\n✓ Klaar — bronbestanden gesynct naar ' + REMOTE + ' (' + BRANCH + ').');
