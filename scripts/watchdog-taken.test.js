#!/usr/bin/env node
/**
 * Controleert `hangtVast()` op echte transcripts van 1 en 2 september 2026.
 *
 * De verwachtingen komen niet uit de lucht: elke sessie hieronder is met de hand
 * nagekeken. De "vast"-gevallen eindigen op een tool-opdracht waar nooit een
 * antwoord op kwam; de "klaar"-gevallen hebben hun verslag afgeleverd en werden
 * door de oude watchdog ten onrechte als vastgelopen afgesloten.
 *
 *   node scripts/watchdog-taken.test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { hangtVast } = require('./watchdog-taken.js');

const PROJECTEN = path.join(os.homedir(), '.claude', 'projects');

const gevallen = [
  // vastgelopen: laatste tool-opdracht kreeg nooit antwoord
  ['a6c96456-ba71-4de7-9871-4c68a3a4bb18', true, '02-09 08:04 — Bash watchdog, geen resultaat'],
  ['8a1c8d7c-d343-439b-9476-94743f579599', true, '02-09 07:29 — PowerShell watchdog, geen resultaat'],
  ['49b2a585-153d-473e-9800-61386120a4bd', true, '01-09 18:05 — PowerShell watchdog + ToolSearch'],
  ['486492bc-2249-4fcb-b316-e8c18a6bdc8c', true, '01-09 16:12 — PowerShell node -e'],
  ['95f30c8b-0f01-4922-8a38-88605be331d3', true, '01-09 17:05 — Bash node -e'],
  ['3efbeda0-32db-483a-af39-5b5d97db1b6f', true, '01-09 15:32 — get_thread'],
  // klaar en stil: verslag afgeleverd, door de oude watchdog toch afgesloten
  ['48115027-babb-4f71-90a5-99a498e1ace8', false, '01-09 15:47 — verslag "geen nieuwe antwoorden"'],
  ['4039bbcb-1237-43b1-bf7c-f5676217a807', false, '01-09 15:52 — verslag afgeleverd'],
  ['b552c190-b568-4bf4-bd2f-20ca17a4dd50', false, '01-09 16:02 — draft gemaakt, verslag afgeleverd'],
];

function zoek(sessionId) {
  for (const map of fs.readdirSync(PROJECTEN)) {
    const p = path.join(PROJECTEN, map, `${sessionId}.jsonl`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

let goed = 0;
let fout = 0;
let ontbreekt = 0;

for (const [sessionId, verwacht, wat] of gevallen) {
  const transcript = zoek(sessionId);
  if (!transcript) {
    console.log(`?  ${sessionId.slice(0, 8)}  transcript niet gevonden — overgeslagen (${wat})`);
    ontbreekt++;
    continue;
  }
  const kreeg = hangtVast(transcript);
  const ok = kreeg === verwacht;
  if (ok) goed++; else fout++;
  console.log(
    `${ok ? 'ok' : 'FOUT'}  ${sessionId.slice(0, 8)}  verwacht ${verwacht ? 'vast' : 'klaar'}, ` +
    `kreeg ${kreeg ? 'vast' : 'klaar'}  — ${wat}`
  );
}

console.log(`\n${goed} goed, ${fout} fout, ${ontbreekt} overgeslagen`);
process.exit(fout === 0 ? 0 : 1);
