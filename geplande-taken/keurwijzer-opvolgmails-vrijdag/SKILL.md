---
name: keurwijzer-opvolgmails-vrijdag
description: Zet elke vrijdag om 17u de opvolgmails klaar: top 3-bedrijven die na drie werkdagen niet reageerden op de outreachmail, plus bedrijven die de vraag naar hun WhatsApp-nummer onbeantwoord lieten.
---

Draai de wekelijkse Keurwijzer-opvolgronde.

Projectmap: C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website

Roep de skill `keurwijzer-opvolgmails` aan en volg ze letterlijk, stap voor stap. Staat
die skill niet in je lijst, lees dan het bestand
`.claude/skills/keurwijzer-opvolgmails/SKILL.md` in de projectmap en volg dat.
Lukt geen van beide, stop dan en meld dat — improviseer niet.

De ronde bestaat uit twee losse lijsten met eigen regels. Behandel ze allebei.

Waar het op neerkomt (de skill is bindend, dit is enkel de samenvatting):

**Deel A — bedrijven die nooit antwoordden:**

- Zoek in Gmail: `in:sent subject:vergeleken older_than:2d newer_than:90d`. Blader álle
  pagina's af, niet enkel de eerste. De wachttijd is drie werkdagen; omdat deze ronde op
  vrijdag draait, komt dat neer op alles wat t.e.m. dinsdag verstuurd is, en `2d` is
  precies die grens. Gebruik géén `3d` — dat laat de hele dinsdagbatch vallen.
- Open elke kandidaat met `get_thread`, nooit beoordelen op de zoeklijst — die laat soms
  het nieuwste bericht weg.
- Houd een thread alleen als: precies één bericht, van olivier@magicworx.net; geen
  antwoord van het bedrijf (een autoresponder telt niet als antwoord); geen bestaande
  draft in die thread; niet in de uitsluitlijst van de skill; nog geen `Label_5`.
- Houd daarvan alleen de bedrijven waarvan de outreachmail zegt "op de eerste plaats" of
  "in de top 3". Bij "top 5" of "top 10": overslaan.
- Neem de aanhef letterlijk over uit de outreachmail in die thread. Zoek nooit zelf een
  voornaam op een website: bij de eerste mail is dat al geprobeerd, en een neutrale aanhef
  betekent dat er toen niets gevonden is. Bezoek dus geen enkele website.
- Maak per bedrijf één draft als antwoord in die thread, met de tekst uit de skill, en
  neem de rangzin letterlijk over uit de oorspronkelijke mail. Verzin nooit een rang.
- Label de thread met `Label_5` (Keurwijzer/4. Weekend opvolgen).

**Deel B — bedrijven die hun WhatsApp-nummer niet doorgaven:**

- Zoek in Gmail: `in:sent subject:vergeleken whatsapp older_than:2d newer_than:90d`.
  Zelfde wachttijd, zelfde grens.
- Houd een thread alleen als het laatste bericht van Olivier is én de vraag naar het
  WhatsApp-nummer bevat, er daarna niets terugkwam, er geen draft staat, de thread niet in
  de uitsluitlijst staat en nog geen `Label_5` draagt.
- Lees `data/whatsapp.json` en sla het bedrijf over als het nummer daar al in staat — dan
  is het al live op hun pagina.
- Bevat jouw vraag een telefoonnummer, gebruik dan de bevestigingsmail met dat nummer
  letterlijk overgenomen; bevat ze er geen, gebruik dan de open vraag. Nooit een nummer
  verzinnen.
- Ook deze drafts krijgen `Label_5`. Eén herinnering per bedrijf, nooit een tweede.

Harde regels:

- VERSTUUR NOOIT een mail. Uitsluitend drafts — Olivier verstuurt ze zelf in het weekend.
- Verstuur ook geen verslagmail aan Olivier. Het verslag komt in het gesprek.
- Wie ooit "nee" of "stop" antwoordde, valt permanent af. Meld dat, doe verder niets.

Sluit af met een verslag waarin de twee lijsten **streng gescheiden** staan — ze dragen
hetzelfde label, dus het verslag is de enige plek waar Olivier ziet welke draft waarover
gaat. Begin met één samenvattende regel ("8 koude opvolgingen + 3 WhatsApp-vragen = 11
drafts"), daarna per deel een tabel en wat er afviel met de reden. Meld apart welke
bedrijven op Oliviers eigen antwoord wachten: dat is werk voor `/keurwijzer-mails`.