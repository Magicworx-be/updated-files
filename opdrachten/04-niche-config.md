# 04 — De niche-definitie uit de code halen

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md`, `METHODIEK.md` (§ vakfocus en § Methodiek-versies),
`prompts/scoring-prompt.md`, `prompts/directory-page-emails-prompt.md` Fase 0,
en `.claude/skills/nieuwe-regio-verwerken/SKILL.md`. Antwoord in het Nederlands.

## Doel

Keurwijzer gaat van 1 niche (dakwerkers) naar 25 niches. Nu moet je per nieuwe
niche op vier plaatsen in code of sjabloon. Na deze opdracht is een nieuwe niche
één bestand plus 27 regio-configs die ernaar verwijzen, zonder code-wijziging.

## Wat gemeten is (3 september 2026)

| Plaats | Wat | Gevolg bij niche 2 |
|---|---|---|
| `build.js` 185–203 `VAKDEF_BY_NICHE` | vakdefinitie (kern/omvat/buiten), enkel dakwerkers (+ alias dakdekkers) | harde stop via `REQUIRE_VAKDEF` (regel 173, 365–369) tenzij `vak.definitie` in elke config staat |
| `build.js` 210–213 `SCHEMA_TYPE_BY_NICHE` | schema.org-type, enkel `RoofingContractor` | stil terug naar `HomeAndConstructionBusiness` |
| `build.js` 363–364 vs 1013–1014 | `VAKDEF_BY_NICHE[norm(config.vak.mv)]` gebruikt `vak.mv` als sleutel, `SCHEMA_TYPE_BY_NICHE[niche]` de mapnaam | twee verschillende sleutels voor "de niche" |
| `build.js` 955 | v4-pad gebruikt `config.vak.kort` ongecontroleerd → "specialisatie in undefined" | stil |
| `build.js` 1000 | fallback hero `'img/' + vak.mv + '.jpg'` is relatief en bestaat niet | stil kapotte afbeelding |
| `build.js` 1246–1247 | tokens `SYN_MV_PAR` en `FAQ_ZOEKTERM` worden berekend maar staan niet in `template.html` | dood |
| alle 16 configs `vak{mv,mvCap,ev,kort,syn}` + `hero{img,alt}` | identiek in 16 bestanden | 27 kopieën per niche |
| `prompts/scoring-prompt.md` rubriek 2 stap 0 | "Voor dakwerkers: een dakvensterinstallateur…", en "lees `VAKDEF_BY_NICHE` in build.js" | beoordelaar moet de definitie zelf opzoeken; voorbeeld is dak-specifiek |
| `scripts/whatsapp-routine.js` 470, 486 | `slug.replace(/^dakwerkers-/, '')` | verkeerde regionaam bij andere niche (cosmetisch) |

Niet gemeten maar bekend: `config/<niche>/` als map = niche, `regio.kern` = regio;
de slug wordt nergens gesplitst (`lib/registry.js` 84–87, 129–140). Dat is goed
en blijft zo.

## Wat te doen

1. **Nichebestand.** Introduceer `config/<niche>/_niche.json` met: `vak`
   (mv, mvCap, ev, kort, syn), `definitie` (kern, omvat, buiten; letterlijk de
   huidige `VAKDEF_BY_NICHE.dakwerkers`), `schemaType`, `hero` (img, alt),
   `zoekwoord` (het ene woord dat in de Google Sheet gaat), en een
   `scoringVoorbeeld` (de niche-specifieke zin voor rubriek 2 stap 0, zie punt 4).
   `lib/registry.js` leest het en levert het als `niche.meta`.
2. **Configs afslanken.** Een regio-config mag `vak` en `hero` nog steeds
   bevatten (override), maar hoeft niet. Verplaats voor dakwerkers de 16 identieke
   blokken naar `_niche.json` en verwijder ze uit de configs. `build.js` en
   `genereer-badges.js` lezen `niche.meta` en overschrijven met wat de config zelf
   zegt. `VAKDEF_BY_NICHE` en `SCHEMA_TYPE_BY_NICHE` verdwijnen uit `build.js`;
   `REQUIRE_VAKDEF` (v5) controleert voortaan op `niche.meta.definitie`.
3. **Sleutelconsistentie**: één begrip "niche" = de mapnaam. Nergens meer
   `norm(config.vak.mv)` als sleutel.
4. **Scoringsprompt per niche genereren.** Maak `scripts/maak-scoringsprompt.js
   <niche>` dat `prompts/scoring-prompt.md` (de generieke bron) invult met de
   definitie en het niche-voorbeeld en het resultaat schrijft naar
   `prompts/generated/scoring-<niche>.md`. In de bron vervang je de dak-specifieke
   zinnen door tokens; de ingevulde dakwerkers-versie moet inhoudelijk gelijk zijn
   aan de huidige prompt. Werk Fase 3 in `directory-page-emails-prompt.md` en de
   skill bij: die verwijzen voortaan naar het gegenereerde bestand.
5. **Schema-validatie.** `lib/registry.js` valideert `_niche.json` en elke config
   tegen een expliciet schema (verplichte velden, types) en faalt hard met
   bestandsnaam en veld. Gebruik geen extra dependency; een handgeschreven
   controle volstaat.
6. Ruim de dode tokens (`SYN_MV_PAR`, `FAQ_ZOEKTERM`) op of gebruik ze; fix de
   relatieve hero-fallback (laat hem gewoon hard falen als geen hero bekend is);
   fix `config.vak.kort` op regel 955; fix de twee regexen in
   `whatsapp-routine.js` (niche uit de registry halen).
7. **Fase 0 herschrijven** in `directory-page-emails-prompt.md` en de skill: "bij
   een nieuwe niche: vraag Olivier het vakblok, de definitie, het zoekwoord en
   de hero; schrijf `_niche.json`". Volgens CLAUDE.md wordt bij twijfel over een
   niche-term of hero gevraagd, niet verzonnen; behoud dat.

## Wat niet

- De uitvoer van alle 16 dakwerkerspagina's en hun badges blijft byte-identiek
  (na opdracht 02 strikt controleerbaar; na opdracht 03 ook via `npm test`).
- Geen nieuwe methodiek-versie, geen `--nieuwe-selectie`, geen versie verhogen.
- Raak `homepage.html`, `hub.html` en `build-site.js` niet aan; dat is opdracht 05.
- Verzin geen tweede niche om te testen; gebruik `config/dakdekkers-test.json`
  (verplaats hem naar `config/dakdekkers-test/` met eigen `_niche.json` als je een
  tweede niche nodig hebt om de validatie te bewijzen, en zorg dat hij buiten de
  registry en de sitemap blijft zoals nu).

## Bewijs

1. md5 van `output/<slug>/index.html` en `badges/<slug>/badges.json` voor alle 16
   slugs vóór en ná: identiek. `npm test` slaagt.
2. `node scripts/maak-scoringsprompt.js dakwerkers` en een diff met de huidige
   `scoring-prompt.md` die alleen de token-invulling toont.
3. Een config met een ontbrekend verplicht veld faalt hard met een leesbare
   melding (in een scratch-kopie).

## Verslag en documentatie

Werk `METHODIEK.md` bij (waar de vakdefinitie leeft, de vakfocus-check, § Methodiek-
versies bij `REQUIRE_VAKDEF`), `CLAUDE.md` (bestandstabel, regel "bij twijfel
over een niche-term vragen"), `ARCHITECTUUR.md` (bestandstabel) en de
werkproces-prompt (Fase 0 en 3). Datum in METHODIEK.md op vandaag. Meld expliciet
wat je bijwerkte.
