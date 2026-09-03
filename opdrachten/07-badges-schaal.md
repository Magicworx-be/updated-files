# 07 — Badges op schaal: alleen renderen wat veranderde, en niet alles klonen

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md`, `ARCHITECTUUR.md`, `scripts/genereer-badges.js`,
`lib/push-badges.js`, `lib/push-registry.js`, `build-all.js` en
`lib/tijdelijke-map.js`. Antwoord in het Nederlands.

## Wat gemeten is (3 september 2026)

- `scripts/genereer-badges.js` 156–170: `genereerSlug` rendert onvoorwaardelijk 2
  PNG's per bedrijf, zonder vergelijking met wat er al staat. `build-all.js`
  196–201 roept dit voor álle slugs aan bij elke build.
- Gemeten: 16,6 s voor 20 PNG's (Gent) = 0,83 s per PNG. Bij 675 pagina's ≈
  13.500 PNG's ≈ **3,1 uur per build**, ook als er alleen een WhatsApp-nummer bij
  kwam.
- `badges/` = 266 PNG's, 49,5 MB, gemiddeld 191 KB, max 359 KB. Oorzaak:
  `D.scale: 3` (regel 39). `keurwijzer-data` op GitHub = 57 MB. Extrapolatie
  naar 675 pagina's: ±11.200 PNG's ≈ **2,1 GB** in een publieke git-repo.
- `lib/push-registry.js` 191 en `lib/push-badges.js` 99 doen elk
  `git clone --depth 1` van die repo → bij 675 pagina's ±4 GB download per build.
- `lib/push-badges.js` 145–147: jsDelivr-purge één HTTPS-call per gewijzigd
  bestand, sequentieel. Eerste publicatie van een niche met 27 regio's = 540
  purges op rij.

## Randvoorwaarde die alles bepaalt

Badges worden door bedrijven op hun eigen website ingesloten via de jsDelivr-URL
in de outreachmail. **Bestaande URL's en pixelafmetingen blijven identiek**;
een bedrijf mag geen ander plaatje of een kapotte afbeelding krijgen. Kleiner
renderen kan alleen voor nieuwe niches, of na een uitdrukkelijke keuze van
Olivier; leg hem dat als vraag voor vóór je de schaal aanraakt.

## Wat te doen

1. **Incrementeel renderen.** Bewaar per PNG een hash van (badges.json-entry +
   ontwerptokens `D` + fontbestanden + zegel + versie van `genereer-badges.js`) in
   `badges/<slug>/.hashes.json`. Render alleen bij verschil of ontbrekend bestand.
   Bewijs: een tweede `node scripts/genereer-badges.js` op alle slugs rendert 0
   bestanden en duurt seconden.
2. **Registry pushen zonder de badges te klonen.** `push-registry.js` schrijft
   één bestand. Gebruik een blobless/sparse clone
   (`git clone --filter=blob:none --no-checkout --depth 1` + `git sparse-checkout
   set registry.json`) of de GitHub Contents API (PUT met sha; registry.json is
   12 KB nu, ±250 KB bij 675 pagina's, ver onder 1 MB). Kies, en meet de
   downloadgrootte vóór en ná.
3. **Badges pushen zonder de hele historie te klonen**: idem sparse, alleen de
   mappen van slugs die veranderd zijn (uit stap 1 weet je welke).
4. **Purge batchen**: jsDelivr's purge-endpoint accepteert meerdere paden per
   aanvraag (controleer in de documentatie en meet); anders purges parallel met
   een limiet van 5. Houd de bestaande verificatie op slug-verzameling
   (`push-registry.js`) intact.
5. **Groottepad voor nieuwe niches** (alleen na Oliviers ja): een tweede
   ontwerpprofiel met `scale` 1,5 of WebP naast PNG, alleen gebruikt voor niches
   zonder bestaande badges. Bestaande dakwerkers-badges blijven bit-identiek.
6. Overweeg en beschrijf (niet bouwen zonder vraag): badges buiten git op
   Cloudflare R2 met een eigen subdomein (`badges.keurwijzer.be`), met de
   jsDelivr-URL's als 301 daarheen. Dat is de duurzame weg bij 2 GB, maar het is
   een infrastructuurkeuze van Olivier.

## Wat niet

- Bestaande PNG's mogen niet veranderen: md5 van alle 266 bestanden vóór en ná
  gelijk. Geen enkele bestaande badge-URL mag een 404 of een ander plaatje geven.
- Raak `build.js`, de rekenlogica en de detailpagina's niet aan.

## Bewijs

1. md5-lijst van `badges/**/*.png` vóór en ná: identiek. Tweede run rendert 0.
2. Downloadgrootte van de registry-push vóór (volledige shallow clone, meet met
   `du` op de tijdelijke map) en ná.
3. Eén echte `node build-all.js` aan het einde; toon dat de badges van één
   bestaand bedrijf (kies er twee) via de jsDelivr-URL nog steeds 200 geven met
   dezelfde bytes (md5 van de download).

## Verslag en documentatie

Werk `ARCHITECTUUR.md` bij (stappen 9 en 10 van de gegevensstroom, § "Wat er
stilletjes kan stukgaan"), de bestandstabellen in `CLAUDE.md`, en `.gitignore`
als `.hashes.json` binnen `badges/` valt (badges/ is al genegeerd; controleer).
METHODIEK.md hoeft niet; zeg dat expliciet. Vermeld apart welke vraag je Olivier
stelde over de schaal en wat hij antwoordde.
