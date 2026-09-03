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
//   node sync.mjs -m "bericht" --scope geplande-taken --scope prompts
//
// Untracked bestanden worden NOOIT automatisch meegenomen (behalve met
// --all-untracked): standaard toont het script ze en stopt de agent om te
// vragen welke mee moeten. desktop.ini/Thumbs.db e.d. staan al in .gitignore
// en verschijnen dus niet.
//
// --scope: commit ALLEEN wat onder de opgegeven map(pen) valt.
//
// Zonder --scope staged dit script élke gewijzigde bestand in de map (`git add -u`).
// Dat is prima als jij zelf bewust "sync alles" bedoelt, maar het gaat mis wanneer
// iemand aan één onderdeel werkt terwijl er nog ander werk in de map ligt: dat werk
// glijdt dan mee een commit in met een boodschap waar het niets mee te maken heeft.
// Dat is op 03-09-2026 gebeurd — de volledige SEO-omzetting van de hub-pagina's
// belandde in een commit met als boodschap "Antwoordmails: WhatsApp-vraag valt
// nooit weg". Niets ging verloren, maar de geschiedenis klopt niet meer, en bij
// een ongelukkiger samenloop had er ook een half afgewerkte wijziging of een
// zwaar databestand in gekund.
//
// Werk je aan één onderdeel, geef dan --scope mee. Wat erbuiten valt blijft
// gewoon liggen en wordt aan het eind opgesomd, zodat je nooit vergeet dat het
// er nog staat. Zonder --scope verandert er niets aan het oude gedrag.
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
const scopes = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry-run' || a === '-n') dryRun = true;
  else if (a === '-m' || a === '--message') message = args[++i];
  else if (a === '--include') includes.push(args[++i]);
  else if (a === '--scope') scopes.push(args[++i]);
  else if (a === '--all-untracked') allUntracked = true;
  else { console.error('Onbekend argument: ' + a); process.exit(2); }
}

// Scope-paden normaliseren: git meldt altijd met schuine strepen, de gebruiker
// mag backslashes en een sluitende slash typen.
const scopePaden = scopes
  .map(s => String(s).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''))
  .filter(Boolean);
const scopeActief = scopePaden.length > 0;
// Een bestand valt binnen de scope als het het scope-pad zelf is, of eronder ligt.
// Bewust op padgrens vergelijken: "prompts" mag nooit ook "promptsmap/x" pakken.
function binnenScope(bestand) {
  if (!scopeActief) return true;
  const f = String(bestand).replace(/\\/g, '/');
  return scopePaden.some(s => f === s || f.startsWith(s + '/'));
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

// Getrackte wijzigingen splitsen in "gaat mee" en "blijft liggen".
// Zonder --scope gaat alles mee, precies zoals vroeger.
const tracked = trackedChanges.filter(c => binnenScope(c.file));
const trackedBuiten = trackedChanges.filter(c => !binnenScope(c.file));

section('Getrackte wijzigingen (' + trackedChanges.length + ')' +
  (scopeActief ? ' — scope: ' + scopePaden.join(', ') : ''));
tracked.forEach(c => console.log('  ' + c.status.padEnd(2) + ' ' + c.file));
if (!tracked.length) console.log('  (geen binnen de scope)');
if (trackedBuiten.length) {
  console.log('  — buiten de scope, blijft liggen:');
  trackedBuiten.forEach(c => console.log('    ' + c.status.padEnd(2) + ' ' + c.file));
}

const untrackedBinnen = untracked.filter(binnenScope);
section('Nieuwe (untracked) bestanden (' + untracked.length + ')');
untrackedBinnen.forEach(f => console.log('  ?? ' + f));
if (!untrackedBinnen.length) console.log('  (geen' + (scopeActief ? ' binnen de scope' : '') + ')');

// welke untracked nemen we mee?
let untrackedToAdd = [];
if (allUntracked) untrackedToAdd = untrackedBinnen.slice();
else if (includes.length) untrackedToAdd = includes.slice();

// Een expliciete --include buiten de scope is een tegenstrijdige opdracht.
// Stil negeren zou het ergste van twee werelden zijn (je denkt dat het meegaat),
// dus liever hard stoppen met uitleg.
const includeBuiten = untrackedToAdd.filter(f => !binnenScope(f));
if (includeBuiten.length) {
  console.error('\n--include valt buiten --scope: ' + includeBuiten.join(', '));
  console.error('   Laat --scope weg, of breid hem uit, of laat deze bestanden weg.');
  process.exit(2);
}

if (untrackedBinnen.length && !allUntracked && !includes.length) {
  console.log('\n⚠  Er zijn nieuwe bestanden. Ze worden NIET automatisch meegenomen.');
  console.log('   Kies welke mee moeten en draai opnieuw met --include "<pad>" (of --all-untracked).');
}

// Wat er ná deze sync nog onopgeslagen op de laptop achterblijft. Bewust altijd
// tonen: werk dat blijft liggen is werk dat nergens geback-upt staat, en dat is
// precies het soort ding dat je pas mist als het te laat is.
function toonStapel() {
  const untrackedRest = untracked.filter(f => !untrackedToAdd.includes(f));
  if (!trackedBuiten.length && !untrackedRest.length) return;
  section('Blijft liggen op deze laptop (niet meegecommit)');
  if (trackedBuiten.length) console.log('  ' + trackedBuiten.length + ' gewijzigd(e) bestand(en)' +
    (scopeActief ? ' buiten de scope' : ''));
  if (untrackedRest.length) console.log('  ' + untrackedRest.length + ' nieuw(e) bestand(en)');
  console.log('  Deze staan nergens geback-upt. Syncen wanneer je eraan toe bent:');
  console.log('      node .claude/skills/sync-keurwijzer/sync.mjs -m "korte beschrijving"');
}

const nothingToDo = !tracked.length && !untrackedToAdd.length && ahead === 0 && behind === 0;
if (nothingToDo) {
  console.log('\n✓ Niets te syncen — alles is up-to-date.');
  toonStapel();
  process.exit(0);
}

// ---- dry-run stopt hier -------------------------------------------------
if (dryRun) {
  section('DRY-RUN — plan');
  console.log('Zou stagen: ' + tracked.length + ' getrackte + ' + untrackedToAdd.length + ' nieuwe bestand(en)');
  console.log('Zou committen met bericht: ' + JSON.stringify(message || '(vereist: -m "bericht")'));
  console.log('Zou rebasen op ' + REMOTE + '/' + BRANCH + ' en pushen naar ' + REMOTE + ' ' + BRANCH + '.');
  console.log('\n(geen wijzigingen doorgevoerd)');
  toonStapel();
  process.exit(0);
}

// ---- 4. stagen ----------------------------------------------------------
const willCommit = tracked.length || untrackedToAdd.length;
if (willCommit && !message) {
  console.error('\nEr zijn wijzigingen om te committen maar geen bericht. Geef -m "bericht".');
  process.exit(2);
}
// Met --scope stagen we uitsluitend de paden binnen de scope; zonder scope
// blijft het `git add -u` over de hele map, exact zoals voorheen.
if (tracked.length) {
  git(scopeActief
    ? ['add', '-u', '--', ...tracked.map(c => c.file)]
    : ['add', '-u'], { capture: false });
}
if (untrackedToAdd.length) git(['add', '--', ...untrackedToAdd], { capture: false });

// ---- 5. committen -------------------------------------------------------
if (willCommit) {
  const staged = git(['diff', '--cached', '--name-only']);
  if (staged) { section('Committen'); git(['commit', '-m', message], { capture: false }); }
  else console.log('Niets gestaged — commit overgeslagen.');
}

// ---- 6. rebase op de remote (fetch + rebase) ---------------------------
section('Rebase op ' + REMOTE + '/' + BRANCH);
// --autostash is NOODZAKELIJK sinds --scope bestaat: git weigert te rebasen
// zolang er niet-gestagede wijzigingen liggen ("cannot rebase: You have unstaged
// changes"), en met een scope blijft er per definitie werk buiten de commit
// liggen. Autostash zet die stapel even opzij en plaatst hem er daarna weer op.
// Zonder scope is de werkmap na de commit toch al schoon, dus daar is het een
// no-op — het oude gedrag verandert niet.
const reb = git(['rebase', '--autostash', REMOTE + '/' + BRANCH], { allowFail: true });
if (reb.failed) {
  const uitvoer = ((reb.stdout || '') + '\n' + (reb.stderr || '')).toString();
  console.error('Rebase mislukt — je lokale werk botst met de remote, of git struikelde.');
  console.error(uitvoer);

  // Autostash-vangnet. Bij --autostash zet git de niet-gecommitte stapel apart
  // en plaatst hem normaal gezien zelf terug. Struikelt de rebase echter hard
  // (op Windows bijvoorbeeld op een te lang pad), dan kan die stapel achterblijven
  // in .git/rebase-merge/autostash — en die map is precies wat mensen weggooien
  // om "de rebase los te krijgen". Dan is het werk weg.
  // Daarom: het commit-id dat git noemde altijd doorgeven, zodat er ALTIJD een
  // weg terug is, ook als iemand de rebase-map opruimt.
  const m = /Created autostash:\s*([0-9a-f]{7,40})/.exec(uitvoer);
  const abort = git(['rebase', '--abort'], { allowFail: true });

  if (m) {
    console.error('\n⚠  Je niet-gecommitte wijzigingen waren tijdelijk opzijgezet door git.');
    console.error('   Staan ze na het afbreken niet terug in je map, haal ze dan op met:');
    console.error('       git stash apply ' + m[1]);
    console.error('   (noteer dat commit-id — het overleeft het opruimen van .git/rebase-merge niet)');
  }
  if (abort.failed) {
    console.error('\n⚠  "git rebase --abort" is óók mislukt; er kan een halve rebase achterblijven.');
    console.error('   Verwijder .git/rebase-merge NIET zomaar — zet eerst je werk veilig met de');
    console.error('   regel hierboven. Vraag hulp voor je iets weggooit.');
  } else {
    console.error('\nRebase afgebroken; je lokale commit blijft staan.');
  }
  console.error('\nDaarna: git status → bekijk de conflicten en los ze op.');
  process.exit(1);
}
console.log('OK — lokaal werk staat nu boven op ' + REMOTE + '/' + BRANCH + '.');

// ---- 7. pushen ----------------------------------------------------------
section('Pushen naar ' + REMOTE + ' ' + BRANCH);
git(['push', REMOTE, 'HEAD:' + BRANCH], { capture: false });
console.log('\n✓ Klaar — bronbestanden gesynct naar ' + REMOTE + ' (' + BRANCH + ').');
toonStapel();
