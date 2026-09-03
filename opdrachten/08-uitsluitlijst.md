# 08 — Uitsluitlijst en verwijderprocedure

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md` (selectieslot, methodiek-versies), `METHODIEK.md` volledig,
`build.js` (of `lib/rekenkern.js` als opdracht 03 al is uitgevoerd),
`prompts/reply-scenarios.md`, `prompts/directory-page-emails-prompt.md` Fase 6 en
`.claude/skills/keurwijzer-mails/SKILL.md`. Antwoord in het Nederlands.

## Wat gemeten is (3 september 2026)

- Het woord "uitsluit" komt in `build.js`, `lib/` en `scripts/` niet voor. De
  configs kennen geen uitsluitveld.
- Het selectieslot (`data/<slug>/selectie.json`) stopt elke build die de lijst
  wijzigt. De enige weg om een bedrijf van een pagina te halen is
  `--nieuwe-selectie`, waarna nummer 11 opschuift en de badgeteksten van alle
  anderen veranderen (de tier komt uit de rang).
- `prompts/reply-scenarios.md` stuurt een verwijderverzoek naar "scenario 3:
  Olivier tikt het zelf", zonder vervolgstap.
- Minstens 5 van de 126 aangeschreven adressen zijn privéadressen van
  eenmanszaken (gmail.com, telenet.be). Mail 1 bevat geen zin over de
  gegevensbron of een afmeldmogelijkheid; alleen de opvolgmail biedt een "nee".

Bij 6.750 bedrijven komt een verwijderverzoek zeker. Het moet in minuten kunnen,
zonder de rest van de pagina te herschudden.

## Beslissing die je eerst aan Olivier voorlegt (één vraag, twee opties)

Wat gebeurt er met de plaatsen ná een verwijderd bedrijf?

- **Optie A, plaats blijft leeg**: het bedrijf verdwijnt, de anderen houden hun
  rang en badge; de pagina toont 9 bedrijven. Eenvoudig, eerlijk naar de
  anderen, en het selectieslot blijft gelden voor de rest.
- **Optie B, opschuiven**: nummer 11 komt erbij, iedereen onder de verwijderde
  schuift op, badges veranderen van tekst. Dat is wat `--nieuwe-selectie` doet en
  wat CLAUDE.md juist wil vermijden buiten de jaarlijkse update.

Aanbeveling: A. Bouw wat Olivier kiest.

## Wat te doen

1. **Uitsluitlijst**: `data/uitgesloten.json`, een array van
   `{ slug, bedrijf, datum, reden, bron }` (bron = thread-id of "telefoon"). Een
   entry geldt voor alle methodiek-versies (contact- en rechtenzaken zijn geen
   methodiek, net als WhatsApp-nummers).
2. **Toepassing in de rekenkern**: het bedrijf wordt vóór de selectie verwijderd
   uit de kandidaten, met dezelfde naam-normalisatie en dezelfde harde fout bij
   een niet-matchende naam als `lib/whatsapp.js` (inclusief Levenshtein-
   suggestie). Bij optie A: de overige bedrijven behouden hun rang uit
   `selectie.json`; de pagina rendert de lege plaats niet.
3. **Selectieslot**: de vergelijking negeert uitgesloten bedrijven, met een
   expliciete melding "1 bedrijf uitgesloten op <datum>". Alle andere
   afwijkingen blijven een harde stop.
4. **Badges**: `genereer-badges.js` maakt voor een uitgesloten bedrijf niets meer
   en `push-badges.js` verwijdert de bestaande PNG's van dat bedrijf uit de
   datarepo (de purge-logica voor verwijderde paden bestaat al).
5. **Publieke tekst**: geen vermelding van verwijderingen op de pagina. Wel in
   `METHODIEK.md` een korte paragraaf "Verwijdering op verzoek" die uitlegt dat
   een bedrijf zich kan laten verwijderen en dat de anderen hun plaats houden.
   Als de FAQ op de pagina daar een vraag over moet krijgen, leg de tekst eerst
   aan Olivier voor.
6. **Proces**: een script `node scripts/uitsluiten.js <slug> "<bedrijf>" --reden
   "..." --bron <thread-id>` dat de entry toevoegt, de naam controleert en zegt
   "draai nu node build-all.js". Voeg in `reply-scenarios.md` een scenario
   "verwijderverzoek" toe met de exacte stappen en een draft-tekst die bevestigt
   dat het binnen 24 uur gebeurt; de skill `keurwijzer-mails` verwijst ernaar en
   labelt zo'n thread "3. Zelf antwoorden" (Olivier beslist, het script voert
   uit).
7. **Opt-out in mail 1**: één zin in de handtekening van de outreachmail in
   Fase 6: waarom het bedrijf deze mail krijgt (het staat op een publieke
   Keurwijzer-pagina op basis van publieke Google-reviews) en dat "stop"
   volstaat om nooit meer gemaild te worden. Nederlands, kort, geen juridisch
   jargon. Leg de zin aan Olivier voor vóór je hem in de prompt zet (memory:
   een herschreven tekst is een gespreksstuk tot hij ja zegt).

## Wat niet

- Nooit `--nieuwe-selectie`. Geen nieuwe methodiek-versie: uitsluiting is een
  rechtenzaak buiten de methodiek, zoals WhatsApp.
- Geen test op een echte pagina met een echt bedrijf. Test met
  `config/dakdekkers-test.json` of een scratch-kopie van Gent met een fictieve
  entry; verwijder die na afloop.

## Bewijs

1. Alle 16 slugs: md5 ongewijzigd met een lege uitsluitlijst; `npm test` slaagt.
2. Scratch-test: één bedrijf uitgesloten in een kopie van Gent → pagina toont
   9 bedrijven, de andere 9 houden rang en badgetekst, selectieslot meldt de
   uitsluiting en stopt niet.
3. `uitsluiten.js` weigert een naam die niet matcht en stelt de juiste voor.

## Verslag en documentatie

`METHODIEK.md` (nieuwe paragraaf, § selectieslot, datum op vandaag), `CLAUDE.md`
(regel selectieslot: "behalve uitgesloten bedrijven"; bestandstabel),
`ARCHITECTUUR.md` (bestandstabel), `reply-scenarios.md`, Fase 6 van de
werkproces-prompt en de skill. Meld expliciet wat je bijwerkte en wat Olivier
koos (optie A of B, en de opt-out-zin).
