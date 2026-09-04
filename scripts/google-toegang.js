#!/usr/bin/env node
/**
 * Eenmalige Google-toestemming voor de programma's die de mailbox lezen.
 *
 * Waarom dit bestaat: `scripts/whatsapp-routine.js` en
 * `scripts/whatsapp-nabericht.js` lezen Gmail zelf, zonder taalmodel. Daarvoor
 * hebben ze een eigen sleutel nodig. Dit script haalt die op, één keer, en
 * schrijft hem in `.env`.
 *
 * Gebruik:
 *   node scripts/google-toegang.js "C:\\Users\\brain\\Downloads\\client_secret_....json"
 *
 * Of zonder pad — dan zoekt hij zelf het nieuwste client_secret-bestand in Downloads.
 *
 * Er wordt niets verstuurd of gewijzigd aan de mailbox; dit vraagt alleen toegang.
 *
 * WAAROM ER GEEN CODE MEER GEPLAKT MOET WORDEN (4 september 2026)
 *
 * Dit script vroeg vroeger een code die Google op het scherm toonde, via de
 * "out-of-band"-manier (`urn:ietf:wg:oauth:2.0:oob`). Google heeft die manier
 * uitgezet: sinds oktober 2022 weigert ze het voor nieuw aangemaakte clients,
 * met een kale foutmelding in de browser en geen code om te plakken. Wie het
 * script toen draaide, kon het onmogelijk afmaken.
 *
 * Nu luistert het script zelf even op 127.0.0.1 — dat is je eigen laptop, niet
 * het internet — en vangt het antwoord van Google daar op. Er valt niets meer
 * te kopiëren: je klikt op Toestaan en het venster zegt dat je het mag sluiten.
 * Google staat die manier uitdrukkelijk toe voor een client van het type
 * "Desktop-app", op elke poort, zonder dat je iets hoeft te registreren.
 */

const fs = require('fs');
const os = require('os');
const http = require('http');
const path = require('path');
const { execFileSync } = require('child_process');

const WORTEL = path.join(__dirname, '..');
const ENV = path.join(WORTEL, '.env');

// gmail.modify = threads lezen én labels verplaatsen. gmail.send = het dagverslag.
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

// Hoe lang we op de browser wachten voor we opgeven. Ruim: inloggen, twee
// waarschuwingsschermen wegklikken en Toestaan duurt bij Google soms even.
const WACHT_MINUTEN = 5;

function fout(bericht) {
  console.error('\n✗ ' + bericht + '\n');
  process.exit(1);
}

function vindClientBestand(opgegeven) {
  if (opgegeven) {
    if (!fs.existsSync(opgegeven)) fout(`Ik vind dat bestand niet:\n  ${opgegeven}`);
    return opgegeven;
  }
  // Downloads én bureaublad, in beide talen en ook de OneDrive-varianten. Het
  // bestand belandt waar de browser het zet, en dat is lang niet altijd Downloads:
  // op 4 september 2026 stond het op het bureaublad en zag dit script het niet.
  const mappen = ['Downloads', 'Desktop', 'Bureaublad',
    path.join('OneDrive', 'Desktop'), path.join('OneDrive', 'Bureaublad')]
    .map((m) => path.join(os.homedir(), m));

  const kandidaten = [];
  for (const map of mappen) {
    let namen = [];
    try { namen = fs.readdirSync(map); } catch { continue; }   // map bestaat niet: geen probleem
    for (const f of namen) {
      if (!/^client_secret.*\.json$/i.test(f)) continue;
      const volledig = path.join(map, f);
      try { kandidaten.push({ pad: volledig, tijd: fs.statSync(volledig).mtimeMs }); } catch { /* intussen weg */ }
    }
  }
  kandidaten.sort((a, b) => b.tijd - a.tijd);

  if (!kandidaten.length) {
    fout('Geen client_secret-bestand gevonden in Downloads of op je bureaublad.\n\n' +
         '  Dit script heeft een OAuth-clientbestand van Google nodig. Dat maak je één\n' +
         '  keer aan in de Google Cloud Console:\n\n' +
         '    1. console.cloud.google.com — maak bovenaan een project (of kies er een).\n' +
         '    2. Zoek bovenaan op "Gmail API" en klik op INSCHAKELEN.\n' +
         '    3. Menu links: APIs en services -> OAuth-toestemmingsscherm.\n' +
         '       Kies Extern, vul een naam in, en zet jezelf bij Testgebruikers.\n' +
         '    4. Menu links: Inloggegevens -> Inloggegevens maken -> OAuth-client-ID.\n' +
         '       Type: Desktop-app. Naam mag alles zijn.\n' +
         '    5. Klik daarna rechts op het downloadpictogram (JSON downloaden).\n\n' +
         '  Laat het bestand gewoon in Downloads of op je bureaublad staan en draai dit\n' +
         '  script opnieuw, of geef het pad mee als argument.');
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
  if (ruw.web && !ruw.installed) {
    console.log('\nLet op: dit is een client van het type "Web". Dat werkt hier meestal niet —\n' +
                'kies in Google Cloud het type "Desktop-app". Ik probeer het toch.\n');
  }
  return { id: blok.client_id, geheim: blok.client_secret };
}

// ── de browser en het antwoord opvangen ─────────────────────────────────

const PAGINA = (titel, tekst) =>
  '<!doctype html><meta charset="utf-8"><title>Keurwijzer</title>' +
  '<div style="font:16px/1.6 system-ui,sans-serif;max-width:34em;margin:15vh auto;padding:0 1.5em">' +
  `<h1 style="font-size:1.3em">${titel}</h1><p>${tekst}</p></div>`;

/**
 * De browser openen op een lange link.
 *
 * NIET via `cmd /c start`. Dat lijkt te werken, maar cmd.exe leest een &-teken
 * als "hier begint een nieuw commando" en kapt het webadres daar af. Google
 * kreeg op 4 september 2026 alleen het stuk tot de eerste & binnen en
 * antwoordde met "Error 400: invalid_request — Required parameter is missing:
 * response_type". Het adres was niet fout; het was afgeknipt.
 *
 * rundll32 geeft het adres ongemoeid door aan de standaardbrowser. Lukt dat
 * niet, dan proberen we cmd alsnog, met elke & ontsnapt.
 */
function openBrowser(url) {
  const pogingen = process.platform === 'win32'
    ? [['rundll32', ['url.dll,FileProtocolHandler', url]],
       ['cmd', ['/c', 'start', '', url.replace(/&/g, '^&')]]]
    : [['open', [url]], ['xdg-open', [url]]];
  for (const [commando, argumenten] of pogingen) {
    try { execFileSync(commando, argumenten, { stdio: 'ignore' }); return true; }
    catch { /* volgende manier proberen */ }
  }
  return false;
}

/**
 * Start een klein servertje op 127.0.0.1 en wacht tot Google er de code
 * naartoe stuurt. Geeft { code, redirect } terug, of faalt hard.
 *
 * 127.0.0.1 is je eigen laptop: er komt niets van dit servertje op het
 * internet, en het stopt zodra de code binnen is.
 */
function wachtOpCode() {
  return new Promise((klaar, mis) => {
    const server = http.createServer((verzoek, antwoord) => {
      const url = new URL(verzoek.url, 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      const geweigerd = url.searchParams.get('error');

      if (!code && !geweigerd) { antwoord.writeHead(404).end(); return; }

      antwoord.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      antwoord.end(code
        ? PAGINA('Toegang gegeven', 'Je mag dit venster sluiten en terugkeren naar het scherm waar je het script gestart hebt.')
        : PAGINA('Geen toegang gegeven', `Google meldde: ${geweigerd}. Sluit dit venster en draai het script opnieuw.`));

      // Even wachten zodat de pagina zeker verstuurd is voor we afsluiten.
      setTimeout(() => server.close(), 250);
      if (code) klaar({ code, redirect: `http://127.0.0.1:${server.address().port}` });
      else mis(new Error('je hebt op Weigeren geklikt, of Google gaf: ' + geweigerd));
    });

    server.on('error', (e) => mis(new Error('kan niet luisteren op 127.0.0.1 — ' + e.message)));

    // Poort 0 = Windows kiest zelf een vrije poort. Voor een Desktop-client
    // aanvaardt Google elke poort op 127.0.0.1.
    server.listen(0, '127.0.0.1', () => {
      const redirect = `http://127.0.0.1:${server.address().port}`;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: HUIDIGE_CLIENT.id,
        redirect_uri: redirect,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
      });

      console.log('\n=== Google-toegang voor de Keurwijzer-programma\'s ===\n');
      console.log('Ik open nu je browser. Lukt dat niet, open dan zelf deze link:\n');
      console.log('   ' + url + '\n');
      console.log('1. Log in als olivier@magicworx.net en klik op Toestaan.');
      console.log('2. Zie je "Google heeft deze app niet geverifieerd"? Klik linksonder op');
      console.log('   "Geavanceerd" en daarna op "Ga naar ... (onveilig)". Dat is normaal voor');
      console.log('   een eigen script. Klik NIET op "Terug naar veiligheid".');
      console.log('3. Daarna zegt de pagina dat je het venster mag sluiten. Meer moet je niet doen.\n');
      console.log(`Ik wacht ${WACHT_MINUTEN} minuten...\n`);

      if (!openBrowser(url)) {
        console.log('(Ik kreeg je browser niet open. Kopieer de link hierboven en plak hem zelf.)\n');
      }

      setTimeout(() => {
        server.close();
        mis(new Error(`er kwam ${WACHT_MINUTEN} minuten lang geen antwoord uit de browser`));
      }, WACHT_MINUTEN * 60000).unref();
    });
  });
}

let HUIDIGE_CLIENT = null;

async function wisselCodeIn(client, code, redirect) {
  const antwoord = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.geheim,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
  });
  const data = await antwoord.json();
  if (!antwoord.ok || !data.refresh_token) {
    fout('Google gaf geen sleutel terug:\n  ' + JSON.stringify(data) +
         '\n\n  Meestal betekent dit dat de code al gebruikt is of verlopen.\n' +
         '  Draai dit script gewoon opnieuw.');
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
  HUIDIGE_CLIENT = leesClient(vindClientBestand(process.argv[2]));

  let uit;
  try { uit = await wachtOpCode(); }
  catch (e) { fout('De toestemming is niet afgerond: ' + e.message); }

  const refresh = await wisselCodeIn(HUIDIGE_CLIENT, uit.code, uit.redirect);
  schrijfEnv(HUIDIGE_CLIENT, refresh);

  console.log('\n✓ Klaar — de toegang staat opgeslagen in .env (dat bestand blijft op je laptop).');
  console.log('  Controleer met:  node scripts/whatsapp-nabericht.js --droog\n');
  process.exit(0);
})();
