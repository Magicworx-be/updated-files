# 14 — Opruimen en documentatie gelijkzetten

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md`, `ARCHITECTUUR.md`, `METHODIEK.md`, `WIJZIGINGEN.md` en
`geplande-taken/README.md`. Antwoord in het Nederlands. Doe dit het liefst als
laatste, na de andere opdrachten; controleer per punt of het nog geldt, want
eerdere opdrachten kunnen het al hebben opgelost.

## Eerst hercontroleren, dan opruimen

Alles hieronder is gemeten op 3 september 2026. Voor elk punt: kijk of het nog
zo is, en meld wat al weg is.

### A. Verkeerde of dubbele databestanden

| Bestand | Bevinding | Actie |
|---|---|---|
| `data/dakwerkers-oudenaarde/apify-places.json` | 3,2 MB, getrackt, byte-identiek (md5 f63c341b…) aan `data/dakwerkers-sint-niklaas/apify-export.json`; bevat Sint-Niklaas-bedrijven. Wordt niet meer gelezen. | verwijderen uit de repo met een duidelijk commitbericht; noteren in WIJZIGINGEN.md dat de Oudenaarde-bron `apify-export.json` in dezelfde map is |
| `data/dakwerkers-ieper/ieper-dataset_…2026-09-01….json` | 18,5 MB, gitignored, byte-identiek aan de Mechelen-raw | lokaal verwijderen |
| `data/dakwerkers-brasschaat/brasschaat  - dataset_….json` | 12,7 MB, gitignored, identiek aan de eigen raw | lokaal verwijderen |
| `data/dakwerkers-antwerpen/…dataset_….json` | 37,6 MB, gitignored, aparte scrape | laten staan of verwijderen; vraag Olivier niet, het wordt nergens gelezen: verwijderen |
| Sint-Niklaas- en Aalst-scrapes van 27 augustus | nooit verwerkt (pagina's waren al live op oudere data) | laten staan; één regel in WIJZIGINGEN.md |
| `output/dakdekkers-test/`, `output/logo-test/` | lege restmappen met alleen `desktop.ini` | verwijderen |

### B. Dode bestanden (nul verwijzingen, gecontroleerd met grep)

- `reports/whatsapp-dagelijks.json` (ARCHITECTUUR.md noemt het zelf dood).
- `scripts/whatsapp-routine.js`, `scripts/whatsapp-routine.test.js`,
  `scripts/google-toegang.js`: **alleen verwijderen als opdracht 12 ze niet
  hergebruikt heeft**; anders laten staan.
- `scripts/detecteer-nieuwe-regios.js`: nul verwijzingen; de skill roept hem niet
  aan. Verwijderen of in de skill inzetten (opdracht 09 kan dit al gedaan
  hebben).
- `prompts/nieuw-regio-prompt.md`: 110-regelige kopieer-prompt die naar
  `directory-page-emails-prompt.md` doorverwijst; verwijderen.
- `ghl/` (gitignored, twee tekstbestanden): niets schrijft er nog naar.
  Verwijderen.
- `docs/scope-01…`, `scope-02…`, `prompt-claude-code-owner-responses.md`:
  historisch; laten staan maar bovenaan één regel "historisch, zie
  ARCHITECTUUR.md".
- Verdwaalde branch `statische-publicatie` op `updated-files` (31 augustus): met
  Oliviers ja verwijderen (`git push updated-files --delete statische-publicatie`).

### C. Documentatie-drift

| Bestand | Wat klopt niet | Fix |
|---|---|---|
| `ARCHITECTUUR.md` regel 14 en 63 | "n8n pusht naar keurwijzer-data" | de Scrape-commits staan op `updated-files/main`; keurwijzer-data bevat geen `data/` (mogelijk al gedaan in opdracht 09) |
| `ARCHITECTUUR.md` kop | "Laatst gelijkgezet 31 augustus" maar beschrijft 1–2 september | datum op vandaag |
| `ARCHITECTUUR.md` bestandstabel | `data/whatsapp.json` "wordt automatisch bijgewerkt uit de mailbox" versus § Zijstroom "sinds 2 september in een gesprek, niet vanzelf" | herformuleren |
| `WIJZIGINGEN.md` regel 1–15 | "Deze map is een zelfstandige kopie van het project"; "Nu staan er 24 URLs in" (sitemap telt 34) | inleiding herschrijven als "chronologisch logboek van beslissingen" |
| `METHODIEK.md` regel 13, 637, 650 | verwijzen naar "regels 52–168" / `sed -n '52,112p'`; het constantenblok loopt tot regel 231 (of is verhuisd na opdracht 03) | regelnummers vervangen door functienamen of bestandsnamen, zodat ze niet meer verschuiven |
| `METHODIEK.md` regel 44 | "halfjaarlijkse update" versus "jaarlijks" overal elders | "jaarlijks" |
| `METHODIEK.md` regel 436–438 | "Geen website? Dan krijgt het bedrijf de mediaan-vakfocus" zonder voorbehoud | "alleen v1 en v2; vanaf v3 is een geverifieerde website een opnamevoorwaarde" |
| `template.html` regel 632 en 530 | publieke tekst "Bedrijven zonder website krijgen een neutrale score" spreekt v3+ tegen; subregel op 530 noemt alleen "≥10 reviews en ≥3 recent" terwijl v3+/v4+ ook website en specialisatie eisen | maak beide versie-gestuurd via een token uit `build.js` (zoals de bestaande `opnameCriteria`/`SAMENVATTING`); v1- en v2-pagina's behouden hun huidige tekst byte-identiek, v3+ krijgen de juiste. Dit is een tekstcorrectie, geen selectiewijziging. |
| `build.js` regel 15–18, 39, 72–74 | verouderde headercommentaren (uitvoerpaden `output/<slug>.html`, "laatste 24m / 6", "v1 voor gent/aalst/…") | corrigeren |
| `lib/whatsapp.js` kop | beschrijft de Google Sheet nog als tweede bron; buiten gebruik sinds 1 september | corrigeren |
| `CLAUDE.md` | zegt nergens hoeveel regio's er zijn (regions.txt: 29; Olivier spreekt van 27) | vraag Olivier welke twee regio's afvallen of dat 29 klopt, en zet het getal op één plaats |
| `.claude/skills/nieuwe-regio-verwerken` versus `anthropic-skills:nieuwe-regio-verwerken` | twee registraties met verschillende beschrijving ("Fase 0-6" vs "Fase 1-6"); de tweede staat nergens op schijf | meld het aan Olivier; de projectversie is de actuele |

### D. Kleine techniek

- `package.json`: `"engines": { "node": ">=22" }` toevoegen; `npm test`-script
  als opdracht 03 dat nog niet deed; `sharp` naar 0.35.4 (patch), `opentype.js`
  **niet** naar 2.0 (major).
- `lib/push-site.js`: een `public/404.html` in de huisstijl (kort, link naar
  homepage en hubs) en in `wrangler.jsonc` `"not_found_handling": "404-page"`;
  `X-Frame-Options: DENY` in `_headers`.
- Dubbele bedrijfsnamen in `reviews.json` (Antwerpen: Brabo Dakwerken ×2, De
  Ontmosser ×2; Brasschaat EVM Dakwerken; Mechelen Dakwerken Johann): vandaag
  onschadelijk, maar de naam is de sleutel. `normalize.js` krijgt een harde stop
  bij een dubbele genormaliseerde naam met een melding hoe het op te lossen
  (opdracht 03 kan dat al hebben gedaan; controleer).
- `desktop.ini`: 256 stuks in `.git/objects`, 113 in de werkmap (Google Drive).
  Verwijder ze uit `.git/` (`find .git -name desktop.ini -delete`) en beschrijf in
  `ARCHITECTUUR.md` de duurzame oplossing (projectmap buiten de gesynchroniseerde
  map, of `.git` uitsluiten) als een keuze voor Olivier; voer die niet zelf uit.

## Wat niet

- Geen wijziging aan de rekenlogica. De template-tekstcorrectie (C, regel 632)
  is de enige wijziging die de pagina's raakt: bewijs dat v1- en v2-pagina's
  byte-identiek blijven en toon de diff van één v3+-pagina.
- Verwijder niets uit `data/` dat door `build.js` gelezen wordt (`reviews.json`,
  `beoordeling.json`, `selectie.json`) en geen n8n-raw die nog niet verwerkt is
  zonder de regel in WIJZIGINGEN.md.

## Bewijs

1. Per punt: "gold nog" / "al opgelost door opdracht N" / "gedaan".
2. md5 van alle 16 pagina's: alleen v3+-pagina's verschillen, en alleen op de
   tekstregels 530/632.
3. `npm test` slaagt; `node build-all.js` aan het einde (gaat live; meld wat).

## Verslag en documentatie

Datum "Laatst gelijkgezet met de code" in `METHODIEK.md` op vandaag; meld
expliciet elke wijziging aan `METHODIEK.md`, `CLAUDE.md`, `ARCHITECTUUR.md` en
`WIJZIGINGEN.md`.
