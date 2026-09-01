#!/usr/bin/env node
/**
 * Eenmalige Google-toestemming voor de WhatsApp-routine.
 *
 * Waarom dit bestaat: `scripts/whatsapp-routine.js` leest de mailbox zelf, zonder
 * taalmodel. Daarvoor heeft het een eigen sleutel nodig. Dit script haalt die op,
 * één keer, en schrijft hem in `.env`.
 *
 * Gebruik:
 *   node scripts/google-toegang.js "C:\\Users\\brain\\Downloads\\client_secret_....json"
 *
 * Of zonder pad — dan zoekt hij zelf het nieuwste client_secret-bestand in Downloads.
 *
 * Er wordt niets verstuurd of gewijzigd aan de mailbox; dit vraagt alleen toegang.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const WORTEL = path.join(__dirname, '..');
const ENV = path.join(WORTEL, '.env');

// gmail.modify = threads lezen én labels verplaatsen. gmail.send = het dagverslag.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

function fout(bericht) {
  console.error('\n✗ ' + bericht + '\n');
  process.exit(1);
}

function vindClientBestand(opgegeven) {
  if (opgegeven) {
    if (!fs.existsSync(opgegeven)) fout(`Ik vind dat bestand niet:\n  ${opgegeven}`);
    return opgegeven;
  }
  const downloads = path.join(os.homedir(), 'Downloads');
  let kandidaten = [];
  try {
    kandidaten = fs.readdirSync(downloads)
      .filter((f) => /^client_secret.*\.json$/i.test(f))
      .map((f) => ({ pad: path.join(downloads, f), tijd: fs.statSync(path.join(downloads, f)).mtimeMs }))
      .sort((a, b) => b.tijd - a.tijd);
  } catch {
    fout('Ik kan je Downloads-map niet lezen. Geef het pad naar het JSON-bestand mee als argument.');
  }
  if (!kandidaten.length) {
    fout('Geen client_secret-bestand gevonden in Downloads.\n' +
         '  Download het uit Google Cloud (Inloggegevens → jouw OAuth-client → JSON downloaden),\n' +
         '  of geef het pad mee als argument.');
  }
  return kandidaten[0].pad;
}

function leesClient(bestand) {
  let ruw;
  try { ruw = JSON.parse(fs.readFileSync(bestand, 'utf8')); }
  catch { fout(`Dit bestand is geen geldige JSON:\n  ${bestand}`); }
  const blok = ruw.installed || ruw.web;
  if (!blok || !blok.client_id || !blok.client_secret) {
    fout('Dit lijkt niet op een OAuth-clientbestand.\n' +
         '  Verwacht een sleutel "installed" of "web" met client_id en client_secret erin.\n' +
         '  Kies bij het aanmaken in Google Cloud het type "Desktop-app".');
  }
  return { id: blok.client_id, geheim: blok.client_secret };
}

function vraag(tekst) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(tekst, (a) => { rl.close(); res(a.trim()); }));
}

async function wisselCodeIn(client, code) {
  const antwoord = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.geheim,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
      grant_type: 'authorization_code',
    }),
  });
  const data = await antwoord.json();
  if (!antwoord.ok || !data.refresh_token) {
    fout('Google gaf geen sleutel terug:\n  ' + JSON.stringify(data) +
         '\n\n  Meestal betekent dit dat de code al gebruikt is of verlopen.\n' +
         '  Draai dit script gewoon opnieuw en gebruik een verse code.');
  }
  return data.refresh_token;
}

function schrijfEnv(client, refresh) {
  let inhoud = '';
  try { inhoud = fs.readFileSync(ENV, 'utf8'); } catch { /* .env mag nog niet bestaan */ }
  const zet = (sleutel, waarde) => {
    const regel = `${sleutel}=${waarde}`;
    const patroon = new RegExp('^' + sleutel + '=.*$', 'm');
    inhoud = patroon.test(inhoud) ? inhoud.replace(patroon, regel)
                                  : (inhoud.replace(/\s*$/, '') + '\n' + regel + '\n');
  };
  zet('GOOGLE_CLIENT_ID', client.id);
  zet('GOOGLE_CLIENT_SECRET', client.geheim);
  zet('GOOGLE_REFRESH_TOKEN', refresh);
  fs.writeFileSync(ENV, inhoud.replace(/^\n+/, ''));
}

(async () => {
  const client = leesClient(vindClientBestand(process.argv[2]));

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: client.id,
    redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
  });

  console.log('\n=== Google-toegang voor de WhatsApp-routine ===\n');
  console.log('1. Open deze link in je browser (ik probeer hem zelf te openen):\n');
  console.log('   ' + url + '\n');
  console.log('2. Log in als olivier@magicworx.net en klik op Toestaan.');
  console.log('   Zie je "Google heeft deze app niet geverifieerd"? Klik dan linksonder op');
  console.log('   "Geavanceerd" en daarna op "Ga naar Keurwijzer (onveilig)". Dat is normaal');
  console.log('   voor een eigen script. Klik NIET op "Terug naar veiligheid".');
  console.log('3. Google toont daarna een code. Kopieer die en plak hem hieronder.\n');

  try { execFileSync('cmd', ['/c', 'start', '""', url], { stdio: 'ignore' }); } catch { /* handmatig openen mag ook */ }

  const code = await vraag('Plak de code hier en druk op Enter: ');
  if (!code) fout('Geen code ingevoerd.');

  const refresh = await wisselCodeIn(client, code);
  schrijfEnv(client, refresh);

  console.log('\n✓ Klaar — de toegang staat opgeslagen in .env (dat bestand blijft op je laptop).');
  console.log('  Controleer met:  node scripts/whatsapp-routine.js --droog\n');
})();
