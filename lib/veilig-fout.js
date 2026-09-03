// =====================================================================
// lib/veilig-fout.js — foutmeldingen van git tonen ZONDER het token
//
// De drie push-scripts klonen met het token in de URL:
//   https://x-access-token:<TOKEN>@github.com/<REPO>.git
//
// Faalt zo'n commando, dan zet Node de volledige commandoregel in
// `err.message`. Dat ziet er zo uit:
//
//   Command failed: git clone --depth 1 https://x-access-token:ghp_ECHT@github.com/...
//
// Die tekst werd letterlijk naar de console geschreven. Alles wat de
// build-uitvoer opvangt — een terminal-scrollback, een logbestand, een
// chatvenster waarin `node build-all.js` draait — kreeg daarmee het token te
// zien. Een token dat schrijfrechten heeft op de site- én de data-repo.
//
// Deze module maakt daar één plek van: haal de foutuitleg altijd via
// `uitleg(err)` op, dan is het token er gegarandeerd uit. Voeg je later een
// vierde push-script toe, gebruik dan deze functie in plaats van
// `err.stderr || err.message`.
// =====================================================================
'use strict';

// Alles tussen "://" en "@" is een inloggegeven — token, wachtwoord of beide.
// Bewust op de VORM gezocht en niet op de tokenwaarde zelf: zo werkt het ook
// als het token uit een andere bron komt of van formaat verandert.
const GEHEIM = /(https?:\/\/)[^/\s@]+@/gi;

function schoon(tekst) {
  return String(tekst == null ? '' : tekst).replace(GEHEIM, '$1***@');
}

// De leesbare uitleg bij een mislukt git-commando, zonder geheimen.
// git schrijft zijn uitleg soms naar stdout in plaats van stderr, dus we nemen
// alle drie de bronnen mee en houden de eerste die iets zegt.
function uitleg(err) {
  if (!err) return 'onbekende fout';
  const delen = [err.stderr, err.stdout, err.message]
    .map(schoon).map(s => s.trim()).filter(Boolean);
  return delen.length ? [...new Set(delen)].join('\n') : 'onbekende fout';
}

module.exports = { schoon, uitleg };
