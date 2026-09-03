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

module.exports = { maakTijdelijkeMap, schoonRefs, ruimOp };
