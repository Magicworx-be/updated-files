# 12 — Eén outreach-logboek en een deterministische deurbel

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `ARCHITECTUUR.md` (§ Zijstroom WhatsApp en § De werklijst in Gmail),
`CLAUDE.md`, `METHODIEK.md` §7, `.claude/skills/keurwijzer-mails/SKILL.md`,
`.claude/skills/keurwijzer-opvolgmails/SKILL.md`,
`geplande-taken/keurwijzer-mailwacht/SKILL.md` (kopie; de echte staat in
`C:\Users\brain\.claude\scheduled-tasks\keurwijzer-mailwacht\SKILL.md`),
`reports/vastlopen-taken-2026-09-02.md`, `scripts/whatsapp-routine.js` en zijn
test, `lib/whatsapp.js`, `data/whatsapp.json`, `scripts/zoek-bedrijf.js` en
`scripts/check-nummer.js`. Gmail bereik je via de Gmail-MCP-tools (laad ze met
ToolSearch). Antwoord in het Nederlands.

## Wat gemeten is (3 september 2026)

- 126 outreachmails verstuurd (van 133 gepubliceerde bedrijven), 21 echte
  antwoorden (16,7 %), 11 WhatsApp-nummers en alle 11 live. 0 opvolgmails ooit
  verstuurd; 32 threads wachten langer dan drie werkdagen.
- **Er is geen state en geen logboek.** Drie LLM-rondes (mailronde, opvolgronde,
  deurbel) bepalen "wat is er te doen" door met `search_threads` + `get_thread`
  élke thread opnieuw te lezen. De enige waarheid is Gmail zelf (label, laatste
  afzender, bestaat er een draft) plus `data/whatsapp.json`. Op 3 september
  kregen Tectora en EPDMshop elk twee tegenstrijdige drafts.
- **De deurbel faalt stil en schaalt niet.** De run van 15u20 stierf na 32
  `get_thread`-calls op een API-500 zonder melding; Heito's antwoord van 15u32
  bleef vijf uur onopgemerkt. De run van 20u20 opende 34 threads (100
  tool-calls, 9 minuten). Bij 675 pagina's zitten duizenden threads in het
  14-dagenvenster.
- **De uitsluitlijst** (vijf thread-ID's van gesprekken die Olivier zelf voert)
  staat letterlijk in drie promptbestanden.
- **De juli-batch is onzichtbaar**: 15 threads van 23 juli hebben een ander
  onderwerp; alle zoekopdrachten filteren op `subject:vergeleken`.
- **Het deterministische alternatief bestaat al**: `scripts/whatsapp-routine.js`
  (603 regels, 15 regressiegevallen uit echte mails, tests slagen) is nooit in
  dienst genomen (geen `GOOGLE_*` in `.env`). Het gebruikte de Google-API
  rechtstreeks via `scripts/google-toegang.js`.

Memory-regels die gelden: de Gmail-zoeklijst laat soms het nieuwste bericht weg
(altijd `get_thread`); een vaag "ok merci" op de nummervraag is toestemming;
noteren en live zetten zijn twee toestanden; het Gmail-filter archiveert
Keurwijzer-antwoorden bewust.

## Wat te doen

1. **`data/outreach.json`** als bindende bron. Per bedrijf (sleutel: slug +
   genormaliseerde naam, zoals `whatsapp.json`): `threadId`, `mail1` (datum,
   onderwerp, tier-zin), `antwoord` (datum, soort: badge / gratis / nummer /
   lead / nee / autoresponder / anders), `opvolg1`, `opvolg2`, `whatsapp`
   (gevraagd op, nummer, live sinds), `optOut` (datum, bron), `zelfAfhandelen`
   (true voor de vijf threads die nu in de uitsluitlijst staan), `laatstGezien`
   (datum laatste bericht, van wie).
2. **Backfill uit Gmail**, alleen lezend: alle threads van `in:sent
   subject:vergeleken` én de juli-batch (zoek op de handtekening of op de
   afzender+periode; documenteer de query), elk met `get_thread`, en vul het
   logboek. Controleer de 126/21/11 uit de audit; verklaar elk verschil. Leg het
   resultaat aan Olivier voor vóór je het bestand definitief maakt.
3. **Deurbel deterministisch**: `scripts/deurbel.js` doet wat deel A van
   `keurwijzer-mailwacht` doet, maar met code: haalt alleen threads op met een
   bericht nieuwer dan `laatstGezien` (Gmail-query `after:` op de jongste datum
   in het logboek, daarna `get_thread` alleen voor die), beslist "echt antwoord
   of autoresponder" met de bestaande regels uit `whatsapp-routine.js` (tekst,
   nooit de klok), en werkt het logboek bij. De LLM komt er alleen aan te pas
   voor het ene stuk dat code niet kan: de aard van een écht nieuw antwoord
   (lead/badge/nee) samenvatten voor de melding. Kies de toegang tot Gmail: de
   MCP-tools vanuit de geplande taak (dan blijft de taak een prompt die één
   script-uitkomst leest), of de Google-API via `google-toegang.js` (dan heeft
   Olivier een OAuth-credential nodig; vraag het en leg uit hoe). Vraag Olivier
   welke weg; aanbeveling: MCP vanuit de taak met een strikt minimale prompt die
   het script aanroept, omdat de toestemmingsproblematiek uit het rapport van 2
   september daar het kleinst is.
4. **Skills lezen en schrijven het logboek**: `keurwijzer-mails` en
   `keurwijzer-opvolgmails` halen de kandidaten uit `outreach.json` (geen
   Gmail-brede zoektochten meer), controleren per kandidaat wél met `get_thread`
   vóór ze een draft maken (zoeklijst-regel), en schrijven na elke draft de
   uitkomst terug. De uitsluitlijst verdwijnt uit de drie prompts en wordt
   `zelfAfhandelen` in het logboek. "Nee/stop" wordt `optOut` en is permanent.
5. **Dubbele drafts onmogelijk maken**: een draft wordt alleen gemaakt als het
   logboek geen draft-datum heeft voor die stap én `list_drafts` er geen toont;
   na aanmaak wordt de datum geschreven.
6. **Melding bij falen**: de deurbel stuurt bij een API-fout één melding
   "deurbel faalde", in plaats van te zwijgen.

## Wat niet

- Verstuur niets. Maak in deze opdracht geen enkele draft. Wijzig geen labels.
  Alle Gmail-toegang is lezen, behalve als Olivier expliciet een testdraft wil.
- Raak `data/whatsapp.json` niet aan (het logboek verwijst ernaar; het blijft de
  bron voor de knop op de pagina, zie METHODIEK.md §7).
- De geplande taak zelf wijzig je in `C:\Users\brain\.claude\scheduled-tasks\…`
  én kopieer je naar `geplande-taken/` (zie `geplande-taken/README.md`), met een
  sync `--scope geplande-taken`.

## Bewijs

1. `outreach.json` met alle threads, en een tabel: verstuurd / beantwoord /
   nummer / opvolg / opt-out / zelf, die de auditcijfers reproduceert of het
   verschil verklaart.
2. `node scripts/deurbel.js --droog` op de huidige mailbox: welke threads het
   zou melden (verwacht op 3 september: Heito).
3. Tests: het logboek-schema en de "geen dubbele draft"-regel in
   `scripts/deurbel.test.js`; `npm test` slaagt.

## Verslag en documentatie

`ARCHITECTUUR.md` (§ Zijstroom en § werklijst herschrijven rond het logboek),
`CLAUDE.md` (bestandstabel), `METHODIEK.md` §7 alleen als de WhatsApp-tekst
verandert (zeg expliciet of), de drie prompts, `geplande-taken/README.md`.
Meld welke weg Olivier koos voor Gmail-toegang.
