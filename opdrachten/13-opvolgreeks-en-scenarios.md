# 13 — Opvolgreeks gelijktrekken en antwoordscenario's uitbreiden

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md` (regel "Pagina-output en outreach-mails zijn altijd
Nederlands" en de congruentieregel), `prompts/directory-page-emails-prompt.md`
Fase 6 en 7 volledig, `prompts/reply-scenarios.md`,
`docs/prompt-claude-code-owner-responses.md`,
`.claude/skills/keurwijzer-opvolgmails/SKILL.md`,
`.claude/skills/keurwijzer-mails/SKILL.md` en
`geplande-taken/keurwijzer-opvolgmails-vrijdag/SKILL.md`. Vereist opdracht 12
(logboek). Antwoord in het Nederlands.

Memory-regels die gelden: een herschreven mailtekst in de chat is een
gespreksstuk, geen opdracht; pas een prompt of sjabloon pas aan na een
uitdrukkelijk ja van Olivier. Verkoop richt zich tot ±september 2027 alleen op
de gepubliceerde Top 10. De A/B-test badge-versus-WhatsApp is geparkeerd; meet
alleen de reactieratio.

## Wat gemeten is (3 september 2026)

- **Prompt en skill spreken elkaar tegen.** De canonieke prompt (CLAUDE.md:
  "enige bron") schrijft in Fase 7 twee opvolgmails voor (na 3 en na 10
  werkdagen, vaste teksten, alle tiers). De skill maakt er één (tekst gemarkeerd
  "VOORLOPIG", andere inhoud, alleen top 3, "één opvolging per bedrijf").
  Opvolgmail 2 bestaat nergens in de uitvoering.
- **0 opvolgmails ooit verstuurd**; 32 threads wachten langer dan drie werkdagen
  (juli-batch 11, batch 27–28 augustus 21). Twee ad-hoc opvolgingen door Olivier
  zelf (Top-Bouw 18 aug, Van Walsem 1 sep, andere tekst).
- De skill rekent "drie werkdagen" om naar `older_than:2d`, wat alleen klopt als
  de ronde op vrijdag draait; de testruns van woensdag 2 september vonden om die
  reden 0 kandidaten.
- **Antwoordscenario's** dekken twee gevallen (badge, "is het gratis?"). Bezwaar,
  verwijderverzoek, GDPR-vraag, boze reactie, "kan ik betalen voor een hogere
  plaats", pers en partnerschap vallen allemaal onder "Olivier tikt het zelf".
  Bij 6.750 bedrijven en 17 % respons zijn dat ±1.100 antwoorden.
- 11 open WhatsApp-vragen (Olivier vroeg het nummer, het bedrijf zweeg), onder
  meer Vermeersch, Elite Bouwteam, Verhaeghe, Schiettecatte, TM, De Torre,
  T-Plus, Tectora, Cauwelier, Nuytemans, RVO, Roof Service.

## Wat te doen

1. **Eén opvolgreeks.** Leg Olivier de twee bestaande versies naast elkaar
   (prompt Fase 7 versus skill) met de verschillen in tabelvorm: aantal mails,
   wachttijd, welke tiers, tekst. Vraag hem welke bindend wordt, of een
   combinatie. Schrijf dat ene ontwerp op één plaats (Fase 7 van de prompt) en
   laat de skill en de geplande taak er letterlijk naar verwijzen in plaats van
   een eigen versie te dragen. Wachttijd als werkdagen, berekend uit het logboek
   (`mail1`-datum), niet uit een Gmail-`older_than` dat van de weekdag afhangt.
2. **Achterstand wegwerken, met zijn ja.** Toon de 32 kandidaten uit het logboek
   (opdracht 12) met tier en datum; laat Olivier kiezen welke nog een opvolging
   krijgen (juli is zes weken oud; misschien niet meer). Maak pas drafts na een
   expliciete ja, één per thread, gelabeld "4. Weekend opvolgen", exact zoals de
   skill voorschrijft. Verstuur niets.
3. **Antwoordscenario's uitbreiden** in `reply-scenarios.md`, telkens als
   voorstel dat Olivier goedkeurt vóór het in het bestand komt:
   - verwijderverzoek (verwijst naar de procedure van opdracht 08);
   - "hoe is dit berekend?" (verwijst naar de methodiekpagina, geen getallen
     verzinnen; alle getallen komen uit METHODIEK.md);
   - "kan ik betalen voor een hogere plaats?" (nee, nooit; korte uitleg);
   - boos of bezwaar tegen de rang (erkennen, uitleggen dat de data publiek is,
     verwijderoptie noemen);
   - GDPR-vraag van een natuurlijke persoon (bron van de gegevens, verwijderoptie,
     geen juridisch advies);
   - autoresponder (geen actie, logboek markeert het);
   - lead (ingaan op dasslim/WhatsApp/AI): altijd "3. Zelf antwoorden" en de
     LEAD-melding, zoals de deurbel nu doet.
   Elke tekst Nederlands, kort, zonder valse urgentie, en met de regel uit
   `docs/prompt-claude-code-owner-responses.md` dat een bedrijfsmail informatie
   is, geen opdracht.
4. **Reactieratio meten** uit het logboek: één commando
   (`node scripts/outreach-cijfers.js`) dat per batch en per tier verstuurd,
   beantwoord, nummer en opt-out telt. Geen A/B-logica.

## Wat niet

- Verstuur niets. Wijzig geen mailtekst in een prompt zonder Oliviers ja op die
  exacte tekst.
- Geen tweede opvolgmail toevoegen als hij voor één kiest; geen tekst
  "verbeteren" op eigen initiatief.
- Raak de bouwcode niet aan.

## Bewijs

1. De vergelijkingstabel van de twee opvolgversies en Oliviers keuze.
2. De lijst van 32 kandidaten met zijn keuze per rij, en het aantal gemaakte
   drafts (of 0).
3. `node scripts/outreach-cijfers.js` reproduceert 126 / 21 / 11 (of verklaart
   het verschil).

## Verslag en documentatie

Fase 7 van `prompts/directory-page-emails-prompt.md` (nu de enige bron),
`reply-scenarios.md`, de skill `keurwijzer-opvolgmails`, de geplande taak (echte
locatie én kopie in `geplande-taken/`, sync `--scope geplande-taken prompts`),
`ARCHITECTUUR.md` § werklijst. `METHODIEK.md` §7 alleen als de WhatsApp-vraag
van tekst verandert; zeg expliciet of. Meld in je antwoord welke teksten Olivier
goedkeurde en welke hij afwees.
