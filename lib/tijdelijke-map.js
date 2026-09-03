// =====================================================================
// lib/tijdelijke-map.js — werkmappen voor de push-scripts
//
// De drie push-scripts klonen hun doelrepo naar een tijdelijke map. Die stond
// vroeger IN de projectmap (.registry-push-tmp, .badges-push-tmp, .site-push-tmp).
// Twee problemen daarmee:
//
//  1) De projectmap staat onder Desktop en wordt door Windows/OneDrive beheerd.
//     Die schrijft `desktop.ini`-bestanden in mappen — óók, tijdens het klonen,
//     in de verse `.git/refs` van de kloon. Git ziet dat als een kapotte ref en
//     stopt:  fatal: bad object refs/desktop.ini
//     Op 03-09-2026 mislukte daardoor de push van registry.json. Het is een
//     race: dezelfde build was een paar uur eerder nog gelukt.
//
//  2) Zo'n kloon bevat het GITHUB_TOKEN in .git/config. Binnen de projectmap is
//     dat één onderbroken build verwijderd van "staat mee in versiebeheer".
//     De .gitignore-regels vangen dat af, maar niet-aanwezig is veiliger dan
//     genegeerd.
//
// Allebei opgelost door in de tijdelijke map van het systeem te werken
// (%TEMP%), buiten OneDrive. `schoonRefs` blijft als extra vangnet: het
// artefact kan ook van een andere synchronisatietool komen.
// =====================================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// Een verse, unieke map in %TEMP%. Uniek omdat twee builds tegelijk kunnen
// draaien (een geplande taak naast een sessie) en ze elkaars kloon niet mogen
// overschrijven.
function maakTijdelijkeMap(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Verwijdert Windows-rommel uit .git/refs van een kloon. Alleen desktop.ini en
// Thumbs.db — echte refs blijven onaangeroerd. Zelfde reparatie als in
// .claude/skills/sync-keurwijzer/sync.mjs.
function schoonRefs(repoDir) {
  const refs = path.join(repoDir, '.git', 'refs');
  let verwijderd = 0;
  const loop = (d) => {
    let items;
    try { items = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of items) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) loop(p);
      else if (/^(desktop\.ini|Thumbs\.db)$/i.test(e.name)) {
        try { fs.rmSync(p); verwijderd++; } catch { /* niet erg */ }
      }
    }
  };
  loop(refs);
  return verwijderd;
}

// Opruimen mag nooit de reden zijn dat een build faalt.
function ruimOp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

// =====================================================================
// Bouw-lock: geen twee gelijktijdige build-all.js-processen.
//
// Een geplande taak en een handmatige sessie kunnen elkaar overlappen. Draaien
// ze samen, dan wordt de tweede `git push` als non-fast-forward geweigerd; die
// fout verdween vroeger in een lege catch en de build eindigde alsnog met
// exitcode 0. De lock ligt in %TEMP% (buiten OneDrive, net als de klonen) en
// bevat pid + starttijd. Een lock ouder dan 30 minuten wordt genegeerd —
// vermoedelijk een vastgelopen of hard afgebroken build.
// =====================================================================
const LOCK_PAD = path.join(os.tmpdir(), 'keurwijzer-build-all.lock');
const LOCK_MAX_MS = 30 * 60 * 1000;

// Probeert de lock te claimen. Lukt dat, dan { ok: true } (met `.genegeerd` als
// er een verouderde lock is overschreven). Draait er al een verse build, dan
// { ok: false } met pid en leeftijd, zodat de aanroeper een nette melding geeft.
function claimLock() {
  let genegeerd = null;
  try {
    const bestaand = JSON.parse(fs.readFileSync(LOCK_PAD, 'utf8'));
    const leeftijd = Date.now() - (Number(bestaand.tijd) || 0);
    if (leeftijd < LOCK_MAX_MS) {
      return { ok: false, pid: bestaand.pid, sinds: bestaand.iso, minuten: Math.round(leeftijd / 60000) };
    }
    genegeerd = { pid: bestaand.pid, minuten: Math.round(leeftijd / 60000) };
  } catch { /* geen (leesbare) lock — vrije baan */ }
  fs.writeFileSync(LOCK_PAD,
    JSON.stringify({ pid: process.pid, tijd: Date.now(), iso: new Date().toISOString() }));
  return { ok: true, pad: LOCK_PAD, genegeerd };
}

// Laat de lock los, maar alleen als hij van óns is (zelfde pid) — nooit die van
// een ander levend proces weghalen.
function laatLockLos() {
  try {
    const bestaand = JSON.parse(fs.readFileSync(LOCK_PAD, 'utf8'));
    if (bestaand.pid === process.pid) fs.rmSync(LOCK_PAD, { force: true });
  } catch { /* al weg of onleesbaar — niets te doen */ }
}

module.exports = { maakTijdelijkeMap, schoonRefs, ruimOp, claimLock, laatLockLos };
