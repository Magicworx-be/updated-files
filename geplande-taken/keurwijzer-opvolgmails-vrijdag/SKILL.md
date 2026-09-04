---
name: keurwijzer-opvolgmails-vrijdag
description: Zet elke vrijdag om 17u de opvolgmails klaar - top 5-bedrijven die na drie werkdagen niet reageerden op de outreachmail, plus bedrijven die hun WhatsApp-nummer niet doorgaven of bevestigden. Allebei vragen ze naar het zakelijk WhatsApp-nummer.
---

Draai de wekelijkse Keurwijzer-opvolgronde.

Projectmap: C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website

Roep de skill `keurwijzer-opvolgmails` aan en volg ze letterlijk, stap voor stap. Staat
die skill niet in je lijst, lees dan het bestand
`.claude/skills/keurwijzer-opvolgmails/SKILL.md` in de projectmap en volg dat.
Lukt geen van beide, stop dan en meld dat — improviseer niet.

De ronde bestaat uit twee losse lijsten met eigen regels. Behandel ze allebei.

**Begin met dit commando. Het geeft je allebei de lijsten in één keer:**

```
node scripts/outreach-lijst.js --vrijdag
```

Dat is de enige bron voor wie er in aanmerking komt. Zoek niet zelf in Gmail naar
kandidaten: het logboek past de regels al toe (top 5, drie werkdagen, geen antwoord,
geen bestaande draft, geen opt-out, geen `zelfAfhandelen`, nummer nog niet live, en
het bedrijf schreef niet het laatst). Is een lijst leeg, dan is er voor die lijst
niets te doen — dat is een geldige uitkomst.

De uitvoer heeft drie blokken:

- **LIJST 1** — top 5, nooit geantwoord op mail 1. Deze krijgen de **open vraag** naar
  hun WhatsApp-nummer. Er is nooit een nummer genoemd, dus er valt niets te bevestigen.
  (Sinds 4 september 2026 vraagt deze mail niet meer naar de badge maar naar het
  WhatsApp-nummer: een andere call to action, met een kleinere drempel.)
- **LIJST 2** — WhatsApp-nummer gevraagd, niet gekregen of bevestigd. Deze krijgen de
  **bevestigingsmail** met het nummer uit jouw eigen vraag in die thread — of de open
  vraag als daar geen leesbaar nummer in stond.
- **NIET MAILEN** — deze bedrijven wachten op Oliviers antwoord. Nooit een draft, wel
  vermelden in je verslag; dat is werk voor `/keurwijzer-mails`.

Daarna, per kandidaat:

- Open de thread met `get_thread`. Nooit beoordelen op de zoeklijst — die laat soms het
  nieuwste bericht weg. Wijkt de thread af van het logboek, sla over en meld het.
- Controleer met `list_drafts` dat er nog geen draft in die thread staat, en dat de
  thread nog geen `Label_5` draagt.
- **De vingerafdruk.** Zoek in de volledige thread naar de zin *"Ik wou je opname op
  Keurwijzer graag afwerken."* Staat die er al — verstuurd of als draft — dan is er al
  opgevolgd: overslaan en melden. Dit is de enige rem die ook werkt als het logboek
  achterloopt, en bij lijst 2 is het de enige echte tweede rem, want de opvolgmail
  bevat zelf een nummervraag.
- Een autoresponder telt niet als antwoord.
- Neem de aanhef **letterlijk** over uit de outreachmail in die thread. Verzin nooit een
  naam of een telefoonnummer. Bezoek geen enkele website: bij de eerste mail is een naam
  al gezocht, en een toestemmingsvraag laat een geplande run vastlopen.
- Geen van beide mails vermeldt een rang. Je hoeft dus geen rangzin te zoeken.
- Maak één draft als antwoord in die thread, met de tekst uit de skill, en label de
  thread met `Label_5` (Keurwijzer/4. Weekend opvolgen).
- **Noteer de draft meteen**, vóór je aan de volgende kandidaat begint:
  `node scripts/outreach-noteer.js --thread <threadId> --lijst 1` (of `--lijst 2`).
  Bewerk `data/outreach.json` nooit met de hand. Zonder die notitie maakt de ronde van
  volgende week er nóg een.

Sluit de ronde af met `node scripts/outreach-noteer.js --controleer`. Dat toont wat er
vandaag genoteerd is en hoeveel kandidaten er nog openstaan — **dat laatste hoort 0 te
zijn**. Is het dat niet, dan staat er een draft die niet genoteerd is; zoek uit welke en
noteer alsnog vóór je je verslag schrijft.

Harde regels:

- VERSTUUR NOOIT een mail. Uitsluitend drafts — Olivier verstuurt ze zelf in het weekend.
- Verstuur ook geen verslagmail aan Olivier. Het verslag komt in het gesprek.
- Geen enkele link in een opvolgmail.
- Wie ooit "nee" of "stop" antwoordde, valt permanent af. Meld dat zodat Olivier het als
  `optOut` laat noteren, doe verder niets.
- ÉÉN opvolgmail per bedrijf. Ooit — niet per lijst, niet per week. Twee keer dezelfde
  vraag kost Keurwijzer zijn geloofwaardigheid bij precies de bedrijven die het meest
  opleveren. Staat er in de uitvoer een blok `!! STOP — hetzelfde mailadres staat twee
  keer in deze ronde`, maak er dan maar één draft voor en meld het.

Sluit af met een verslag waarin de twee lijsten **streng gescheiden** staan — ze dragen
hetzelfde label, dus het verslag is de enige plek waar Olivier ziet welke draft waarover
gaat. Begin met één samenvattende regel ("8 koude opvolgingen + 3 WhatsApp-vragen = 11
drafts"), daarna per lijst een tabel en wat er afviel met de reden. Meld apart welke
bedrijven op Oliviers eigen antwoord wachten.
