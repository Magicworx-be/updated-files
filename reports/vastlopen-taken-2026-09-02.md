# Waarom de geplande taken vastliepen — en wat er op 2 september 2026 aan veranderd is

Handover-notitie. Geschreven na een debugsessie op 2 september 2026 waarin is
uitgezocht waarom `keurwijzer-replies` elke beurt vastliep.

## Waar alles staat

| Wat | Waar |
|---|---|
| Projectmap | `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website` |
| Taak "replies" (elk uur 07-18u) | `C:\Users\brain\.claude\scheduled-tasks\keurwijzer-replies\SKILL.md` |
| Taak "whatsapp-dagelijks" (18u30-21u30) | `C:\Users\brain\.claude\scheduled-tasks\keurwijzer-whatsapp-dagelijks\SKILL.md` |
| Toestemmingen (allowlist) | `<projectmap>\.claude\settings.local.json` |
| Watchdog | `<projectmap>\scripts\watchdog-taken.js` |
| Watchdog-log | `<projectmap>\reports\watchdog-taken.log` |
| Transcripts van taakruns | `C:\Users\brain\.claude\projects\C--Users-brain-Desktop-Projecten-Magicworx-Keurwijzer-Keurwijzer-website\*.jsonl` |
| Externe watchdog-planning | Windows-taak `\Keurwijzer watchdog`, draait elke 10 min via `scripts\watchdog-taken.vbs` |

## De oorzaak

De taken liepen niet vast door een bug en crashten ook niet. **Ze bleven hangen op een
toestemmingsvraag die niemand beantwoordde.**

Draait een geplande beurt zonder dat Olivier erbij zit, en geeft die beurt een commando
of MCP-tool die niet in `settings.local.json` staat, dan verschijnt er een
toestemmingsvraag die nooit beantwoord wordt. De beurt blijft dan voor altijd wachten:
het proces leeft, maar het transcript stopt midden in een `tool_use` zonder dat er ooit
een `tool_result` op volgt.

Het kenmerk in het transcript is exact dit: **een uitgedeelde tool-opdracht waar nooit
een antwoord op kwam.** Een afgewerkte beurt heeft op elke opdracht een antwoord.

### Het bewijs

9 van de 17 `keurwijzer-replies`-beurten hadden zo'n open opdracht. Precies dezelfde
commando's liepen soms wél goed af — namelijk op de momenten dat Olivier aan het toestel
zat en de vraag wegklikte:

    09-01T13:47 RETURNED  node scripts/watchdog-taken.js
    09-01T16:05 HUNG      node scripts/watchdog-taken.js
    09-02T05:29 HUNG      node scripts/watchdog-taken.js

Hij klikte daarbij telkens "één keer toestaan" en nooit "altijd", waardoor er nooit iets
in `settings.local.json` belandde. Sinds 1 september 18u05 hing élke onbemande beurt.

De dagelijkse WhatsApp-taak had onafhankelijk hetzelfde: die hing op `Edit` van
`data/whatsapp.json` en op `list_labels`.

### Waarom dit zo lang onzichtbaar bleef

In `SKILL.md` stonden drie losse regels die elk een symptoom van deze ene oorzaak
bestreden, zonder dat de oorzaak zelf gezien was:

1. "Roep `list_labels` nooit aan" — die tool stond niet in de allowlist.
2. "Geef Gmail-opdrachten één voor één" — worden er meerdere tegelijk uitgedeeld en zit
   er één niet-toegestane bij, dan hangt de beurt.
3. "Draai als allereerste de watchdog" — dat commando stond zélf niet in de allowlist en
   werd zo het eerste struikelblok van élke beurt.

Regel 3 was het ergst: de watchdog die het vastlopen moest oplossen, werd de reden dat
elke beurt vastliep nog voor er één mail gelezen was.

## Wat er veranderd is

**1. `settings.local.json` — ontbrekende toestemmingen toegevoegd**

    Bash(cd:*)
    Bash(node -e:*)
    Bash(node scripts/watchdog-taken.js)
    mcp__3a85549b-1330-4d53-9965-5a49f7e23796__get_thread
    mcp__3a85549b-1330-4d53-9965-5a49f7e23796__get_message
    mcp__3a85549b-1330-4d53-9965-5a49f7e23796__label_thread
    mcp__3a85549b-1330-4d53-9965-5a49f7e23796__unlabel_thread
    mcp__3a85549b-1330-4d53-9965-5a49f7e23796__update_draft
    Edit(data/whatsapp.json)
    Write(data/whatsapp.json)

`list_labels` staat er bewust niet bij: de label-ID's staan in de instructie, dus dat
verbod mag blijven. Deze toestemmingen gelden voor allebei de taken.

**2. `keurwijzer-replies/SKILL.md` — stap 0 draait geen watchdog meer**

De Windows-taak doet dat toch al elke tien minuten, ook als er geen beurt loopt. De
in-beurt-kopie was dubbelop en was het eerste struikelblok. De frontmatter-`description`
is meegewijzigd.

**3. `scripts/watchdog-taken.js` — sluit alleen nog écht vastgelopen beurten af**

Voorheen keek de watchdog alleen naar hoe lang een transcript stil was. Een beurt die
zijn verslag had afgeleverd en stil wachtte zag er identiek uit als een vastgelopen
beurt; op 1 september sloot hij daardoor drie afgewerkte beurten af en schreef die als
"vastgelopen" in het log.

Nu zijn er twee voorwaarden nodig: tien minuten stil **én** een open tool-opdracht
(`hangtVast()`). Let op de subtiliteit: kijk naar *alle* uitgedeelde opdrachten, niet
alleen die van het laatste bericht. Worden er meerdere tegelijk uitgedeeld, dan komt het
antwoord op de ene soms wel en op de andere niet — dat gebeurde op 1 september bij twee
`get_thread`-opdrachten, en een controle op enkel het laatste bericht mist dat geval.

De hoofdlus zit nu in `main()` achter `require.main === module`, zodat de functies te
testen zijn. `scripts/watchdog-taken.test.js` controleert `hangtVast()` tegen negen echte
transcripts (zes vastgelopen, drie afgewerkte): `node scripts/watchdog-taken.test.js`,
9 goed / 0 fout.

Bekende beperking, ongevaarlijk: de zelfbescherming `pid === process.pid` vergelijkt de
pid van het node-script met die van een Claude-sessie en klopt dus nooit. De echte
beveiliging is `hangtVast()` — een gezonde sessie voldoet daar niet aan.

## Wat wel en niet nagekeken is

- Watchdog-logica: 9/9 op echte transcripts, plus bevestigd op een live vastgelopen beurt.
- Stap 0 weg: bevestigd in de beurt van 09u06, die voor het eerst sinds 1 september
  echt aan het werk kwam (labels opruimen, threads zoeken, drafts opvragen).
- Toestemmingen: JSON is geldig, alle tien de regels staan erin.
- **Nog niet nagekeken:** een volledige beurt die tot het eindverslag komt. De beurt van
  09u06 liep nog zonder de toestemmingen en hing op `get_thread` — precies zoals
  voorspeld. De eerste beurt met alles erin is die van 10u04.

Nakijken of een beurt goed liep: zoek in het transcript naar een `tool_use` zonder
bijbehorend `tool_result`. Blijft er één open, dan heeft die beurt op een
toestemmingsvraag staan wachten.

## Nog te doen

- **~~`Bash(node -e:*)` is breed~~ — opgelost.** Het stond willekeurige node-code toe.
  Opgelost op 2 september 2026: de eenregelaars staan nu in `scripts/zoek-bedrijf.js`
  (exacte bedrijfsnaam uit `reviews.json`) en `scripts/check-nummer.js` (nummer
  normaliseren én `data/whatsapp.json` nakijken). Zonder argument doet `check-nummer.js`
  de bestandscontrole van stap 4c en van de avondtaak; met een nummer als argument die
  van stap 4a. Toegestaan staan nu alleen `node scripts/zoek-bedrijf.js …`
  en `node scripts/check-nummer.js …`; `Bash(node -e:*)` én het oudere `Bash(node -e ' *)`
  zijn geschrapt. Beide taak-SKILL.md-bestanden verwijzen naar de scripts.
- **De twee overgebleven volksremedies in `SKILL.md`** (het `list_labels`-verbod en
  "Gmail-opdrachten één voor één") mogen blijven staan — ze zijn onschadelijk — maar ze
  zijn geen verklaring meer. De echte regel is: staat een tool niet in de allowlist, dan
  hangt een onbemande beurt erop.
- **Nieuwe tools of commando's in een taak-SKILL.md** vragen altijd om een bijpassende
  regel in `settings.local.json`. Zonder dat hangt de eerstvolgende onbemande beurt.
- **Een toestemmingsregel geldt per tool, niet per commando.** `Bash(node
  scripts/check-nummer.js)` dekt diezelfde opdracht niet wanneer de beurt de
  PowerShell-tool kiest — en dat deed ze in 4 van de 18 nagekeken beurten, zonder
  aanwijsbare reden. Zet elke shell-regel daarom dubbel: `Bash(...)` én
  `PowerShell(...)`. Op 2 september 2026 gedaan voor `cd`, `zoek-bedrijf.js`,
  `check-nummer.js` en `watchdog-taken.js`.

## Beurt van 10u04 — vierde oorzaak: een zelfbedacht commando

De eerste beurt met alle toestemmingen erin liep alsnog vast, en wel op de nieuwe
strengheid zelf. Verloop: labels opgeruimd, `search_threads` en `list_drafts` gelukt,
vier kandidaten gevonden, vier keer `get_thread` gelukt — en dan wilde ze
`badges/…/badges.json` van twee regio's uitlezen met een zelfbedachte `node -e` van
acht regels. Dat commando staat op geen enkele lijst, dus hing de beurt.

Alle acht Gmail-opdrachten werkten. De les is dus niet dat de toestemmingen fout staan,
maar dat een lijst per definitie achterloopt op wat een beurt kan verzinnen. De
oplossing is niet nog een regel toevoegen: het is de beurt geen commando's laten
verzinnen. `badges.json` lezen kan met de Read-tool, en die vraagt nooit toestemming.

Sindsdien staat bovenaan `SKILL.md`: verzin nooit zelf een shell-commando, lees
bestanden met de Read-tool, en er bestaan precies twee toegestane commando's
(`zoek-bedrijf.js` en `check-nummer.js`). Stap 2 zegt er nu uitdrukkelijk "met de
Read-tool" bij.
