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

/**
 * Hangt deze beurt echt vast, of is hij gewoon klaar en stil?
 *
 * Stilte alleen zegt niets: een beurt die zijn verslag heeft afgeleverd schrijft ook
 * niets meer. Op 1 september 2026 sloot deze watchdog daardoor drie beurten af die
 * hun werk al af hadden — die stonden als "vastgelopen" in het log terwijl er niets
 * mis was.
 *
 * Het echte kenmerk van een vastgelopen beurt staat in het transcript zelf: het laatste
 * assistant-bericht eindigt op `stop_reason: "tool_use"` en op minstens één van die
 * tool-opdrachten is nooit een `tool_result` gekomen. Zo'n beurt wacht op een antwoord
 * dat nooit komt — in de praktijk een toestemmingsvraag die niemand beantwoordt.
 * Een afgewerkte beurt eindigt op een gewoon tekstbericht (`stop_reason: "end_turn"`).
 */
function hangtVast(transcript) {
  let staart;
  try {
    const grootte = fs.statSync(transcript).size;
    const vanaf = Math.max(0, grootte - 262144); // laatste 256 KB volstaat ruim
    const fd = fs.openSync(transcript, 'r');
    const buf = Buffer.alloc(grootte - vanaf);
    fs.readSync(fd, buf, 0, buf.length, vanaf);
    try { fs.closeSync(fd); } catch {}
    staart = buf.toString('utf8');
    if (vanaf > 0) staart = staart.slice(staart.indexOf('\n') + 1); // halve eerste regel weg
  } catch {
    return false; // niet te lezen → met rust laten
  }

  const gegeven = new Set(); // uitgedeelde tool_use-id's
  const gekregen = new Set(); // tool_use-id's waar een resultaat voor terugkwam

  for (const regel of staart.split('\n')) {
    if (!regel.trim()) continue;
    let o;
    try { o = JSON.parse(regel); } catch { continue; }
    const m = o.message;
    if (!m || !Array.isArray(m.content)) continue;

    for (const c of m.content) {
      if (c.type === 'tool_use' && c.id) gegeven.add(c.id);
      if (c.type === 'tool_result' && c.tool_use_id) gekregen.add(c.tool_use_id);
    }
  }

  // Elke uitgedeelde tool-opdracht moet beantwoord zijn voor het gesprek verder kan.
  // Blijft er één open, dan staat de beurt stil op dat antwoord. Let op: kijk naar
  // álle opdrachten, niet alleen die van het laatste bericht — worden er meerdere
  // tegelijk uitgedeeld, dan komt het antwoord op de ene soms wél en op de andere
  // niet. Precies dat gebeurde op 1 september 2026 bij twee `get_thread`-opdrachten.
  for (const id of gegeven) if (!gekregen.has(id)) return true;
  return false;
}

function leeft(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function main() {
let bestanden = [];
try { bestanden = fs.readdirSync(SESSIES).filter((f) => f.endsWith('.json')); } catch { return; }

for (const bestand of bestanden) {
  let sessie;
  try { sessie = JSON.parse(fs.readFileSync(path.join(SESSIES, bestand), 'utf8')); } catch { continue; }
  const { pid, sessionId } = sessie;
  // NB: `process.pid` is de pid van dít node-script, nooit die van een Claude-sessie.
  // Deze vergelijking beschermt dus niets — de echte beveiliging is `hangtVast()`
  // hieronder: een gezonde sessie voldoet daar nooit aan.
  if (!pid || !sessionId || pid === process.pid) continue;
  if (!leeft(pid)) continue;

  const transcript = transcriptVan(sessionId);
  if (!transcript || !isTaakrun(transcript)) continue;

  const stilMinuten = (Date.now() - fs.statSync(transcript).mtimeMs) / 60000;
  const vast = hangtVast(transcript);

  if (DROOG) {
    const reden = !vast ? '  → met rust gelaten (klaar of nog bezig, wacht op niets)'
      : stilMinuten < STIL_MINUTEN ? '  → met rust gelaten (wacht nog geen tien minuten)'
      : '  → zou afgesloten worden';
    console.log(`taakrun pid ${pid} — ${Math.round(stilMinuten)} min stil, ` +
      `${vast ? 'wacht op een tool-antwoord dat niet komt' : 'geen open tool-opdracht'}${reden}`);
    continue;
  }

  // Allebei nodig: lang stil én wachtend op een tool-antwoord dat nooit kwam.
  // Alleen stilte betekent meestal "verslag afgeleverd, verder niets te doen".
  if (!vast || stilMinuten < STIL_MINUTEN) continue;

  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    log(`vastgelopen taakrun afgesloten: pid ${pid}, sessie ${sessionId}, ${Math.round(stilMinuten)} min stil, wachtte op een tool-antwoord`);
  } catch (e) {
    log(`kon pid ${pid} niet afsluiten: ${e.message}`);
  }
}
}

// Alleen opruimen wanneer het script zelf gestart wordt; `require` levert de
// functies zodat scripts/watchdog-taken.test.js ze op echte transcripts kan nakijken.
if (require.main === module) main();

module.exports = { hangtVast, isTaakrun, transcriptVan };
