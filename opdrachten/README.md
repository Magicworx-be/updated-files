# Opdrachten na de fundamentaudit van 3 september 2026

Elke opdracht in deze map is een zelfstandige prompt voor één Claude Code-sessie
(Opus 5.0). Open een nieuwe sessie in de projectmap en typ:

    Voer opdrachten/01-stille-faalpaden.md uit.

De sessie leest dan zelf het bestand. Plakken hoeft niet, maar mag ook.

Volledig auditrapport: https://claude.ai/code/artifact/fe00b1b1-252d-4dd8-b900-3f5ac71964fc

## Spelregels voor élke opdracht

1. **Eén opdracht per sessie, en niet twee tegelijk.** De meeste opdrachten raken
   `build.js`, `build-all.js` of `lib/`. Twee sessies naast elkaar overschrijven
   elkaars werk.
2. **Na elke opdracht syncen** met `/sync-keurwijzer` (of
   `node .claude/skills/sync-keurwijzer/sync.mjs -m "…"`), zodat de volgende sessie
   op de nieuwste code werkt.
3. **`node build-all.js` gaat meteen live.** Elke opdracht die aan de bouwcode raakt,
   moet eerst bewijzen dat alle 16 pagina's byte-identiek blijven
   (`node build.js <slug>` per slug, vergelijken met een kopie van `output/`).
   Pas daarna, en alleen als de opdracht dat zegt, `node build-all.js`.
4. **Nooit `--nieuwe-selectie`**, nooit `beoordeling.json` herschrijven, nooit het
   versienummer van een bestaande config verhogen. Dat staat ook in `CLAUDE.md`.
5. **Eerst hercontroleren, dan handelen.** Elke opdracht begint met "controleer of
   de bevinding nog geldt". Is ze intussen opgelost, dan meldt de sessie dat en stopt.
6. **METHODIEK.md meebijwerken** als een opdracht iets aan de logica, constanten of
   prompts verandert. De congruentieregel in `CLAUDE.md` geldt onverkort.

## Volgorde

| Nr | Opdracht | Wie | Waarom deze plaats |
|---|---|---|---|
| 00 | [Handmatige stappen](00-handmatig-olivier.md) | **Olivier zelf** | Publieke repo en mailauthenticatie: vandaag, los van alle code. |
| 01 | [Stille faalpaden dichten](01-stille-faalpaden.md) | Claude | Vangnet vóór elke andere wijziging. |
| 02 | [Datums deterministisch, pin afdwingen](02-datums-en-pin.md) | Claude | Klein, maakt "byte-identiek vergelijken" betrouwbaar voor alles hierna. |
| 03 | [Tests op de rekenkern](03-tests-rekenkern.md) | Claude | Golden-tests als vangnet voor de refactors 04 t/m 10. |
| 04 | [Niche-definitie uit de code](04-niche-config.md) | Claude | Kern van "25 niches". |
| 05 | [Homepage en hubs generiek](05-homepage-hubs-generiek.md) | Claude | Volgt op 04. |
| 06 | [Regio's één keer definiëren](06-regios-centraal.md) | Claude | Voorkomt 25 kopieën van dezelfde gemeentelijst. |
| 07 | [Badges op schaal](07-badges-schaal.md) | Claude | Anders drie uur per build bij 675 pagina's. |
| 08 | [Uitsluitlijst en verwijderprocedure](08-uitsluitlijst.md) | Claude | Nodig vóór 6.750 bedrijven aangeschreven worden. |
| 09 | [Ruwe scrapes uit git](09-scrapes-uit-git.md) | Claude + Olivier beslist | Raakt n8n; begint met een keuze. |
| 10 | [Landparameter voor Nederland](10-landparameter-nl.md) | Claude | Voorbereiding; uitvoer voor België blijft identiek. |
| 11 | [Fase 3 via een API-script](11-fase3-api-script.md) | Claude | De grootste hefboom op het werkproces. Onafhankelijk van 01–10. |
| 12 | [Outreach-logboek en deterministische deurbel](12-outreach-logboek.md) | Claude | Mailkant. Onafhankelijk van de bouwcode. |
| 13 | [Opvolgreeks en antwoordscenario's](13-opvolgreeks-en-scenarios.md) | Claude | Mailkant, volgt op 12. |
| 14 | [Opruimen en documentatie gelijkzetten](14-opruimen-en-docs.md) | Claude | Kan op elk moment; het best als laatste. |

Opdrachten 11, 12 en 13 (mailkant) mogen naast 01 t/m 10 lopen; ze raken andere
bestanden. Binnen elke reeks: één tegelijk.

## Geparkeerd tot de jaarlijkse herbouw (niet nu)

- **Dendermonde** mist Wetteren en Laarne in de config (staan in de Gent-config).
  8 bedrijven met ≥10 reviews vielen stil weg. Herstellen kan alleen met
  `--nieuwe-selectie`, dus bij de herbouw met verse data.
- **Gent**: het controlerapport meldt een vermoedelijk afgekapte review-export
  (exact 100 reviews) voor negen bedrijven, waaronder Schiettecatte op plaats 2.
