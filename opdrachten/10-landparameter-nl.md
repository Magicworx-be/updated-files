# 10 — Eén codebase, één landparameter (voorbereiding Nederland)

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md`, `ARCHITECTUUR.md`, `lib/registry.js`, `build-site.js`,
`build.js` (de JSON-LD- en canonical-delen), `template.html`, `hub.html`,
`homepage.html`, `lib/whatsapp.js`, `scripts/normalize.js`,
`scripts/genereer-badges.js`, `Apify scrape/geolocation.txt` en
`prompts/directory-page-emails-prompt.md` Fase 6 en 7. Vereist opdrachten 04, 05
en 06. Antwoord in het Nederlands.

## Doel

Olivier wil hetzelfde platform in Nederland (keurwijzer.nl, aanname). Niets in de
code is structureel Belgisch, maar land, domein, taal en geografie staan in een
twaalftal bestanden hardcoded. Een kopie van de repo verdubbelt elke
methodiek-fix en botst met de congruentieregel in CLAUDE.md. Deze opdracht
centraliseert alles in één plek zodat een tweede land een tweede configuratie
is, geen tweede codebase. **De uitvoer voor België blijft byte-identiek.**

## Wat gemeten is (3 september 2026)

| Bestand:regel | Wat |
|---|---|
| `lib/registry.js` 24, 32–33 | `SITE_ORIGIN = 'https://keurwijzer.be'`, `BADGE_BASE_URL` → keurwijzer-data |
| `lib/registry.js` 37–42, 49–66, 164 | `GEO_CODES` (alleen BE-…), `PROVINCIE_PER_REGIO` (29 Vlaamse regio's), pad naar `regions.txt` |
| `build-site.js` 160, 164, 185, 211 | `inLanguage 'nl-BE'`, "per regio in België", `GEO_REGION 'BE-VLG'` |
| `build.js` 890, 902, 1104–1125, 1132–1194 | canonical keurwijzer.be, `addressCountry 'BE'`, FAQ-tekst "in België", JSON-LD met domein en nl-BE |
| `template.html` 2, 451, 712, 724, 734 | `lang="nl"`, info@keurwijzer.be, logo-suffix `.be`, telefoonnummer |
| `hub.html` 2, 188–202, 221–232 | `lang="nl-BE"`, footer/contact, registry-URL's, `ORIGIN` |
| `homepage.html` 6–68, 944–979 | titel/canonical/og/JSON-LD met keurwijzer.be, `areaServed: België`, footer, registry-URL's |
| `lib/whatsapp.js` 41–58 | telefoonnormalisatie gaat uit van +32 (9 cijfers → 32…) |
| `scripts/normalize.js` 96–100 | gemeente uit adres via `\d{4}\s+([^,]+)` = Belgische postcode; NL "1234 AB Amsterdam" geeft "AB Amsterdam" (alleen als Apify `city` leeg is) |
| `Apify scrape/geolocation.txt` 73–78 | projectie EPSG 31370 (Lambert 72), `"{town}, Belgium"` |
| `scripts/genereer-badges.js` 110 | badge-tekst `'Keurwijzer.be'` letterlijk |
| `prompts/directory-page-emails-prompt.md` | "Goeiedag,", handtekening "Dorp 81 - Berlare (O-Vl)", "Flemish companies" |
| `.env` | `GITHUB_REPO`, `GITHUB_SITE_REPO`, `CF_PROJECT_NAME` bestaan al (goed) |

Vlaamse toon in de vaste teksten ("vakman", "Goeiedag", "dakwerker" versus NL
"dakdekker"): de vakterm vangt de bestaande `syn`-structuur al op; de toon van
de sjablonen en mails niet.

## Wat te doen

1. Maak `sites/be.json` (en een lege, gedocumenteerde `sites/nl.json` als
   voorbeeld) met: `origin`, `domeinSuffix`, `land` (ISO), `taal` (nl-BE / nl-NL),
   `geoRegion`, `geoCodes`, `provincies`, `regiosPad`, `telefoonPrefix`,
   `postcodeRegex`, `crs` (voor geolocation), `landnaam` (voor de scraper),
   `contact` (mail, telefoon, adres), `badgeTekst`, `dataRepo`, `siteRepo`,
   `cfProject`, en de mail-toon (`aanhef`, `handtekening`) voor de outreach.
2. `lib/site.js` laadt het juiste bestand op basis van `KEURWIJZER_SITE` in `.env`
   (standaard `be`), en elk hierboven genoemd bestand leest zijn waarden daaruit
   in plaats van hardcoded. Templates krijgen tokens (`{{ORIGIN}}`, `{{LANG}}`,
   `{{LAND}}`, `{{CONTACT_MAIL}}` …) die `build.js`/`build-site.js` invullen;
   `hub.html` en `homepage.html` krijgen hun registry-URL's en `ORIGIN` als
   ingevulde token in plaats van hardcoded.
3. `config/` en `data/` per land: `config/<land>/<niche>/…` en
   `data/<land>/<slug>/…`, of één extra niveau via een pad in `sites/<land>.json`.
   Kies wat de minste breuk geeft voor de bestaande skills en documenteer het;
   de 16 Belgische pagina's mogen niet van slug of URL veranderen.
4. `normalize.js`: postcode-regex uit de site-config; `whatsapp.js`: prefix uit de
   site-config; `geolocation.txt`: CRS en landnaam als variabelen bovenaan.
5. Mailsjablonen in Fase 6 en 7: aanhef en handtekening als tokens uit de
   site-config; de Vlaamse teksten blijven de BE-waarden.
6. Schrijf `docs/tweede-land.md`: de checklist om NL op te zetten (nieuwe
   `sites/nl.json`, `regios/nl/…`, aparte data- en site-repo, Cloudflare-worker,
   `.env`-set, wat gedeeld blijft). Geen NL-data aanmaken.

## Wat niet

- Geen NL-pagina bouwen. Geen tweede repo aanmaken. Geen DNS.
- Uitvoer voor België byte-identiek: md5 van alle 16 detailpagina's, alle hubs,
  homepage, sitemap, robots en registry.json ongewijzigd. `npm test` slaagt.
- Geen wijziging aan de methodiek of de publieke methodiektekst.

## Bewijs

1. md5-vergelijking van de volledige `output/` vóór en ná (na `node build.js` per
   slug en `node build-site.js`, zonder `build-all.js`).
2. Een droge run met `KEURWIJZER_SITE=nl` en een lege `sites/nl.json`-invulling
   faalt met een leesbare melding over wat ontbreekt (geen data), niet met een
   stacktrace.
3. `grep -rn "keurwijzer.be\|BE-VLG\|nl-BE\|België\|+32\|Belgium" build.js
   build-site.js lib scripts template.html hub.html homepage.html` levert alleen
   nog treffers in `sites/be.json` of in commentaar.

## Verslag en documentatie

`ARCHITECTUUR.md` (nieuw hoofdstuk "Meerdere landen", bestandstabel,
§ Configuratie), `CLAUDE.md` (bestandstabel, regel over URL-structuur als het
pad per land verandert), `docs/tweede-land.md`. METHODIEK.md alleen als de
gemeentefilter-beschrijving een landpad krijgt; zeg expliciet of je het
bijwerkte.
