#!/usr/bin/env node
/**
 * Watchdog voor de geplande Keurwijzer-taken.
 *
 * Waarom dit bestaat: op 1 september 2026 liep de run van `keurwijzer-replies`
 * vast — het proces bleef leven maar schreef niets meer. Zolang die beurt hing,
 * startte er geen enkele volgende beurt meer. Een antwoord van een bedrijf bleef
 * daardoor twee uur onbeantwoord liggen.
 *
 * Wat het doet: kijken of er een taakrun bestaat die al langer dan
 * STIL_MINUTEN niets meer geschreven heeft. Zo ja: dat proces afsluiten, zodat
 * het schema weer kan lopen.
 *
 * Wat het NOOIT doet: een gewone sessie van Olivier afsluiten. Alleen sessies
 * waarvan de eerste regel van het transcript `<scheduled-task name="keurwijzer-…"`
 * bevat komen in aanmerking — dat is precies wat de planner erin schrijft.
 *
 * Zelf testen zonder iets af te sluiten:  node scripts/watchdog-taken.js --droog
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const STIL_MINUTEN = 10;
const DROOG = process.argv.includes('--droog'); // toont wat hij zou doen, sluit niets af
const CLAUDE = path.join(os.homedir(), '.claude');
const SESSIES = path.join(CLAUDE, 'sessions');
const PROJECTEN = path.join(CLAUDE, 'projects');
const LOG = path.join(__dirname, '..', 'reports', 'watchdog-taken.log');

const log = (m) => {
  try { fs.appendFileSync(LOG, `${new Date().toISOString()}  ${m}\n`); } catch { /* een log mag de watchdog nooit breken */ }
};

function transcriptVan(sessionId) {
  let mappen = [];
  try { mappen = fs.readdirSync(PROJECTEN); } catch { return null; }
  for (const map of mappen) {
    const p = path.join(PROJECTEN, map, `${sessionId}.jsonl`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function isTaakrun(transcript) {
  let fd;
  try {
    fd = fs.openSync(transcript, 'r');
    const buf = Buffer.alloc(2048);
    const n = fs.readSync(fd, buf, 0, 2048, 0);
    // Let op: het transcript is JSONL, dus het aanhalingsteken staat er als \" in.
    return /<scheduled-task name=\\?"keurwijzer-/.test(buf.slice(0, n).toString('utf8'));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

function leeft(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

let bestanden = [];
try { bestanden = fs.readdirSync(SESSIES).filter((f) => f.endsWith('.json')); } catch { process.exit(0); }

for (const bestand of bestanden) {
  let sessie;
  try { sessie = JSON.parse(fs.readFileSync(path.join(SESSIES, bestand), 'utf8')); } catch { continue; }
  const { pid, sessionId } = sessie;
  if (!pid || !sessionId || pid === process.pid) continue;
  if (!leeft(pid)) continue;

  const transcript = transcriptVan(sessionId);
  if (!transcript || !isTaakrun(transcript)) continue;

  const stilMinuten = (Date.now() - fs.statSync(transcript).mtimeMs) / 60000;
  if (DROOG) {
    console.log(`taakrun pid ${pid} — ${Math.round(stilMinuten)} min stil` +
      (stilMinuten >= STIL_MINUTEN ? '  → zou afgesloten worden' : '  → met rust gelaten'));
    continue;
  }
  if (stilMinuten < STIL_MINUTEN) continue;

  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    log(`vastgelopen taakrun afgesloten: pid ${pid}, sessie ${sessionId}, ${Math.round(stilMinuten)} min stil`);
  } catch (e) {
    log(`kon pid ${pid} niet afsluiten: ${e.message}`);
  }
}
