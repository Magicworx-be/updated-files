---
name: keurwijzer-whatsapp-wekelijks
description: Leest elke maandag de whatsapp-tab van de Keurwijzer-scrapersheet en publiceert nieuwe WhatsApp-links.
---

Wekelijkse verwerking van de WhatsApp-nummers voor Keurwijzer. Antwoord altijd in het Nederlands.

PROJECTMAP (werk hier, gebruik absolute paden):
C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website

STAP 1 — Lees de sheet.
Gebruik de Google Drive-koppeling (read_file_content) op dit bestand-id:
1HBc8lhh7f4UagSTF22qEG8AFSbYiA0KzI6k76rNdUyI
(spreadsheet "Google maps + review scraper", eigenaar magicworx.automations@gmail.com,
gedeeld met olivier.muys@magicworx.net).

De output is te groot voor context en belandt in een tool-results-bestand met schema
{fileContent: string}. Parseer dat met python — lees het NIET met Read.
De inhoud is een reeks markdown-tabellen, één per tab. De LAATSTE tabel is de
whatsapp-tab, met kolommen: regio | bedrijf | whatsapp | toestemming.
De EERSTE tabel is de scraper-trigger (Niche, Searchterms, Region, ...). Negeer die
volledig en bewerk de sheet nooit — een wijziging daar start een betalende Apify-run.

Krijg je "Requested entity was not found", dan is de deling ingetrokken. Meld dat en stop.

STAP 2 — Vergelijk met wat er al staat.
Lees data\whatsapp.json. Dat bestand heeft de vorm:
  { "_uitleg": "...", "nummers": [ {slug, bedrijf, whatsapp, toestemming}, ... ] }
De sheetkolom "regio" wordt het veld "slug". Behoud het veld "_uitleg" ongewijzigd.

Zijn de nummers identiek aan wat er al in staat (niets toegevoegd, gewijzigd of
weggehaald)? Doe dan NIETS: niet schrijven, niet bouwen, niet publiceren. Meld kort
"geen nieuwe WhatsApp-nummers" en stop. Dit is belangrijk: een build zonder wijziging
zet in sitemap.xml voor álle pagina's de datum van vandaag, wat zoekmachines ten
onrechte vertelt dat alles is bijgewerkt.

STAP 3 — Alleen bij wijzigingen: schrijf en publiceer.
Werk data\whatsapp.json bij en draai daarna in de projectmap:
  node build-all.js
Dat commando controleert de nummers, bouwt alle pagina's en publiceert naar Cloudflare;
de site staat ~30 seconden later live op keurwijzer.be.

Faalt het commando, dan gaat er NIETS live — build-all stopt vóór het publiceren.
De twee verwachte fouten zijn:
  - een bedrijfsnaam die niet in data\<slug>\reviews.json voorkomt (met suggestie
    "bedoelde je ...?");
  - een regio-slug die niet bestaat.
Herstel zoiets NIET zelf en verzin geen naam. Zet data\whatsapp.json terug zoals het
was, meld precies welke regel in de sheet fout staat en wat de suggestie was, en stop.

STAP 4 — Rapporteer.
Meld in gewone taal, zonder jargon: welke bedrijven een WhatsApp-link kregen, op welke
pagina's, en dat het live staat. Zijn er regels verdwenen uit de sheet, meld dan welke
links daardoor weg zijn. Olivier is niet technisch — geen bestandspaden of commando's
in het verslag tenzij hij iets moet doen.

Achtergrond: METHODIEK.md §7 legt uit waarom het nummer buiten de methodiek valt en
geen invloed heeft op selectie of volgorde.