# 11 — Fase 3 (LLM-beoordeling) als script via de Claude API

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md` volledig (vooral "Deterministisch", "Zelfde data = zelfde
resultaat" en "Raak beoordeling.json niet aan"), `METHODIEK.md` (§ beoordeling,
§ LLM-run-middeling in `METHODIEK_PARAMS`, § vakfocus), `prompts/scoring-prompt.md`
volledig, Fase 3 van `prompts/directory-page-emails-prompt.md`, de skill
`nieuwe-regio-verwerken`, en één bestaande `data/<slug>/beoordeling.json` (bv.
Gent) om het exacte uitvoerformaat te zien. Laad vóór je code schrijft de skill
`claude-api`. Antwoord in het Nederlands.

## Waarom

Fase 3 is de flessenhals van het hele werkproces. Gemeten: per regio 21 tot 406
bedrijven te beoordelen, 9 tot 122 websitebezoeken, twee tot drie onafhankelijke
runs die gemiddeld worden, alles in een chatsessie met menselijke controle.
Schatting 2 tot 4 uur per regio; bij 675 pagina's is dat alleen al ruim een
voltijds jaar. Bouwen zelf kost seconden.

Een script dat hetzelfde doet via de API blijft volledig binnen de projectregel:
de LLM beoordeelt alleen tekst (reviewkwaliteit, vakfocus, synthese, chips) en
schrijft `beoordeling.json`; alle rekenwerk blijft in `build.js`.

## Wat te doen

1. **`scripts/beoordeel.js <slug>`** dat:
   - `data/<slug>/reviews.json` en de scoringsprompt leest (na opdracht 04:
     `prompts/generated/scoring-<niche>.md`; anders `prompts/scoring-prompt.md`
     met de definitie uit `build.js` erbij);
   - alleen bedrijven beoordeelt die volgens `reviews.json` `rankbaar` zijn
     (controleer in `build.js` welke bedrijven de beoordeling écht nodig hebben;
     niet-rankbare overslaan is wat de skill nu ook doet);
   - per bedrijf de website ophaalt zoals de prompt voorschrijft (welke pagina's,
     hoeveel, time-out, wat bij geen website), met een cache op schijf per URL
     zodat run 2 en 3 dezelfde inhoud zien;
   - per bedrijf N onafhankelijke runs doet (N uit `METHODIEK_PARAMS` van de
     versie die de config draagt of, voor een nieuwe pagina, `METHODIEK_LATEST`),
     elk met `temperature` en instellingen zoals de prompt en METHODIEK.md
     beschrijven; middelt exact zoals de skill dat voorschrijft (lees het na en
     citeer de regel), en de tekstvelden (synthese, chips) kiest zoals daar
     staat;
   - de uitvoer valideert tegen het bestaande formaat van `beoordeling.json`
     (velden, bereik van de scores, Nederlands: weiger Engelse tekst, zie
     CLAUDE.md) en pas dan schrijft, **nooit** over een bestaand
     `beoordeling.json` heen zonder `--overschrijf`;
   - een logboek schrijft per bedrijf (`reports/<slug>/beoordeling-log.jsonl`:
     model, runs, tokens, kosten, afwijking tussen runs) zodat Olivier ziet wat
     het kostte en waar de runs het oneens waren;
   - herstartbaar is (bedrijven die al klaar zijn worden overgeslagen).
2. **Model en kosten**: gebruik het nieuwste Claude-model dat de `claude-api`-
   skill aanraadt; bereken vooraf een kostenschatting per regio en druk die af
   vóór de eerste API-call, met een bevestiging (`--ja` om over te slaan).
   `ANTHROPIC_API_KEY` komt uit `.env`; Olivier zet hem er zelf in (jij vraagt
   erom, je voert hem nooit in).
3. **Validatie op een bestaande regio, zonder iets te vervangen**: draai het
   script voor één v5-regio (Kortrijk of Mechelen) met uitvoer naar de
   scratchpad, en vergelijk met de bestaande `beoordeling.json`: per bedrijf de
   afwijking per rubriek, en wat er met de selectie zou gebeuren als je die
   scratch-beoordeling in een scratch-kopie door `build.js` haalt (verwacht:
   vergelijkbare selectie; het selectieslot mag daar afgaan, dat is precies het
   signaal). Rapporteer de spreiding. Dit is bewijs, geen vervanging: de echte
   `beoordeling.json` blijft onaangeraakt.
4. Werk Fase 3 in de werkproces-prompt en de skill bij: het script is de
   standaardweg; de chat-route blijft beschreven als terugval en als
   steekproefcontrole (Olivier of Claude leest voor 5 bedrijven per regio de
   beoordeling na).

## Wat niet

- Nooit een bestaande `beoordeling.json` overschrijven of verplaatsen.
- Geen wijziging aan de rubrieken, ijkpunten of drempels in de prompt; alleen
  het transport verandert. Verandert er toch iets aan de prompt, dan is dat een
  nieuwe methodiek-versie en stop je om het voor te leggen.
- Geen websitebezoek buiten wat de prompt voorschrijft; respecteer robots en
  time-outs.

## Bewijs

1. Droge run (`--droog`) toont per bedrijf wat er verstuurd zou worden zonder
   API-call.
2. De validatierun uit stap 3, met de vergelijkingstabel en de kosten.
3. `npm test` slaagt; `node build.js <slug>` voor de 16 live slugs geeft
   ongewijzigde md5 (het script raakt ze niet).

## Verslag en documentatie

`METHODIEK.md` (§ beoordeling: hoe de runs tot stand komen, met de datum),
`CLAUDE.md` (bestandstabel; de regel "Draai de LLM-beoordeling niet lichtvaardig
opnieuw" blijft en verwijst naar `--overschrijf`), `ARCHITECTUUR.md`
(gegevensstroom stap 6), Fase 3 van de werkproces-prompt en de skill. Meld
expliciet wat je bijwerkte, wat de validatie op de gekozen regio gaf, en wat
één regio kost.
