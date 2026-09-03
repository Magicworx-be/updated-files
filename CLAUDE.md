# Keurwijzer — instructies voor Claude Code

Keurwijzer is een onafhankelijke kwaliteitsranking van vakbedrijven per
niche × regio, op basis van Google-reviews en de eigen website van het bedrijf.

**Lees `METHODIEK.md` voor de volledige uitleg van selectie en ranking.**
Dat document is ook wat Cowork leest.

## Vaste projectregels (niet opnieuw ter discussie stellen)

- **Deterministisch.** De LLM beoordeelt alleen tekst (reviewkwaliteit, vakfocus,
  synthese, chips). Álle rekenwerk — tijdsweging, Bayes, de vier dimensies,
  selectie, Top 10/Top 5, volgorde — gebeurt in `build.js`. Vraag of geef nooit
  zelf een eindscore, selectie of ranking.
- **Zelfde data = zelfde resultaat.** `data/<slug>/beoordeling.json` wordt één
  keer per regio gemaakt en dan bevroren. Draai de LLM-beoordeling niet
  lichtvaardig opnieuw.
- **Publieke gewichten en drempels zijn vast** (35/30/15/20, halveringstijd
  2 jaar, Bayes M=16, ≥10 reviews, ≥3 recent) en worden nooit per stad aangepast.
  Ze zijn identiek in élke methodiek-versie — dat is de publieke belofte "dezelfde
  methode voor elke regio".
- **Methodiek-versies.** Interne kalibratie die de publieke paginatekst niet noemt
  (vertrouwen-vloer, recentheid-anker, publicatiedrempel, LLM-run-middeling) staat
  in `METHODIEK_PARAMS` in `build.js`, per versie. Elke config draagt `"methodiek": N`;
  ontbreekt het veld → nieuwste versie (`METHODIEK_LATEST` in `build.js`).
  **Bouw een NIEUWE pagina zonder het veld** — dan krijgt ze automatisch de beste
  logica. **Pin haar vast zodra ze online staat**, op de versie waarop ze gebouwd is;
  dat is een vaste stap bij het publiceren, geen keuze. Vastzetten gaat met
  `node build.js <slug> --pin`: dat neemt de versie over uit
  `data/<slug>/selectie.json`, dus uit wat er werkelijk online staat. Vergeten kan
  niet meer — bestaat er een `selectie.json` en ontbreekt de pin (of wijkt ze af),
  dan **stopt de build**. Alle 16 dakwerkerspagina's
  staan zo vastgepind (v1 t/m v5). Verhoog `METHODIEK_LATEST` en voeg een nieuw
  versieblok toe om de logica te verbeteren; verhoog het versienummer van een
  bestaande config nooit zonder dat Olivier daar uitdrukkelijk om vraagt.
  Vastpinnen en het selectieslot doen verschillende dingen en vullen elkaar aan:
  de pin bevriest de *rekenwijze*, het slot bewaakt de *uitkomst* (welke bedrijven,
  in welke volgorde). **v4** voegt twee versie-gestuurde
  selectieregels toe: een **vakspecialist-eis** (eligible vergt vakfocus ≥ `VAKFOCUS_FLOOR`
  = 2,5, zodat bedrijven van een ander vak wegvallen) en **diepte op het aantal eligible
  specialisten** (≥10 → Top 10, volgorde zuiver op composite; ≥15 blijft enkel een
  "goed onderbouwd"-label). Zie METHODIEK.md § Methodiek-versies.
- **URL-structuur:** detailpagina's plat in de root (`/<slug>/`), hubs in mappen.
  Niet nesten.
- **Registry-gedreven:** navigatie, hubs en sitemap komen uit de configs via
  `lib/registry.js`. Het veilige eindcommando is altijd `node build-all.js`.
- **Publicatie is volledig geautomatiseerd.** `node build-all.js` bouwt de site,
  duwt ze naar `Magicworx-be/keurwijzer-site` en Cloudflare zet ze binnen ~30 s
  live op keurwijzer.be. Er is geen handmatige stap meer. Zie `ARCHITECTUUR.md`
  voor het volledige overzicht van laptop, GitHub en Cloudflare.
- **Hub-navigatie staat serverside in de HTML; clientside is enkel verversing.**
  `build-site.js` rendert de kaarten én de JSON-LD ItemList van elke hub uit de
  registry rechtstreeks in `output/<niche>/index.html` en `output/regio/<slug>/index.html`.
  Het script onderaan `hub.html` haalt daarna `registry.json` op (jsDelivr, met
  raw.githubusercontent als tweede bron) en **vervangt** die kaarten door een
  actuelere versie; faalt dat, dan blijft de serverside HTML staan.
  **Verwijder de serverside kaarten nooit.** Ze waren er ooit niet, en toen stond
  er op de hele site geen enkele crawlbare link naar een detailpagina: de
  detailpagina's waren wezen, alleen vindbaar via de sitemap, zonder interne
  linkwaarde, en onzichtbaar voor elke crawler die geen JavaScript uitvoert
  (Bing, DuckDuckGo, de AI-antwoordmachines). Dat was een erfenis uit de tijd dat
  hubs met de hand in GHL geplakt moesten worden — sinds `lib/push-site.js`
  bestaat die reden niet meer.
  De opmaak in `build-site.js` en die in het script van `hub.html` moeten
  identiek blijven; wijk je in de ene af, wijk dan in de andere mee af, anders
  springt de pagina zichtbaar om zodra het script klaar is.
  De homepage laadt haar menu, footer en regiochips nog wél clientside — daar
  zitten geen links naar detailpagina's in, dus dat is geen SEO-probleem.
- **"Binnenkort"-kaarten zijn afgeleid, nooit opgeslagen.** De niche-hub toont naast
  de live regio's ook de nog niet gebouwde, als grijze, **niet-klikbare** kaart
  (nooit een link — dat zou een 404 zijn). De lijst ontstaat door aftrekken:
  alle regio's uit `new page - how to/regions.txt` (29, bindend) **min** wat live
  staat in `registry.json`. Gaat een regio live, dan valt ze vanzelf uit die
  verzameling en wordt haar kaart klikbaar — er is geen label om weg te halen en
  geen handmatige actie voor nodig. Onder `PLANNED_MIN_LIVE` (3) live regio's toont een
  niche enkel wat bestaat. Voeg je een regio toe aan `regions.txt`, vul dan ook
  `PROVINCIE_PER_REGIO` in `lib/registry.js` aan — anders faalt de build hard.
- **Selectieslot: op een pagina die online staat veranderen de BEDRIJVEN nooit.**
  Aan de pagina zelf (opmaak, tekst, structured data, nieuwe methodiek-versies)
  mag je wél werken — dat is uitdrukkelijk toegestaan. Maar wie erop staat en op
  welke plaats, ligt vast. `build.js` legt de gepubliceerde lijst vast in
  `data/<slug>/selectie.json` en **stopt** als een build een andere lijst of
  volgorde oplevert; er wordt dan niets geschreven en niets gepubliceerd.
  De volgorde telt mee omdat de badges hun tekst uit de rang afleiden
  (#1 / Top 3 / Top 5 / Top 10). Bewust herijken — enkel bij de jaarlijkse
  update met verse data — gaat met `node build.js <slug> --nieuwe-selectie`.
  Doe dat nooit om een build "weer aan de praat te krijgen": dat slot is precies
  het vangnet dat ontbrak toen v5 stilzwijgend twee bedrijven van de
  Kortrijk-pagina haalde.
- **Ruwe scrapedata: git is het transportkanaal, niet zomaar opslag.** De
  n8n-scraper pusht `data/<slug>/<slug>-<datum>-reviews.json` en `-places.json`
  naar deze repo; zo komen ze op de laptop. **Nooit untracken of negeren** —
  dan breekt het proces van een nieuwe regio. Handmatig gedownloade exports
  (bestandsnaam met `dataset_`) staan wél in `.gitignore`: die zijn groot en
  worden na `scripts/normalize.js` nooit meer gelezen. Alleen `reviews.json` en
  `beoordeling.json` zijn nodig om te bouwen.
- **Geen gemeente in de data → bedrijf altijd weglaten.**
- **Drie gemeentelijsten, bewust ongelijk.** Het zoekgebied van de scraper
  (`Apify scrape/geolocation.txt`), de publicatielijst (`regions.txt`) en het
  opnamefilter (`gemeenten` in de config) doen verschillende dingen en mogen van
  elkaar verschillen. Zet ze nooit gelijk. In `regions.txt` staan de **officiële
  fusienamen** (het aantal is publiek zichtbaar op de "binnenkort"-kaart) en hoort
  elke gemeente in precies één regio. In de config zet je juist **alle**
  schrijfwijzen — fusienaam, oude namen én deelgemeenten — want daar wordt
  vergeleken met wat Google in het adres schrijft, en dat is niet consequent.
  Zie `ARCHITECTUUR.md` § De drie gemeentelijsten.
- **WhatsApp-nummers staan buiten de methodiek.** Bedrijven geven ze zelf door;
  ze staan in `data/whatsapp.json` en komen in géén enkele berekening voor.
  De link is bewust even zwaar als "Naar website" — maak er nooit een opvallende
  knop van, dat zou bedrijven mét nummer visueel voorrang geven. Hij geldt voor
  álle methodiek-versies (ook vastgepinde v1-pagina's), want contactinformatie
  is geen methodiek. Zie `METHODIEK.md` §7.
- **Pagina-output en outreach-mails zijn altijd Nederlands.** De werkproces-prompt
  (zie hieronder) staat in het Engels, maar alles wat op de publieke pagina of in
  een mail aan een bedrijf terechtkomt niet: `synthese`/chips komen uit
  `prompts/scoring-prompt.md` (Nederlands, expliciet zo voorgeschreven) en de twee
  outreach-mailteksten in Fase 6 van de werkproces-prompt staan zelf al in het
  Nederlands. Zie je Engelse tekst verschijnen in `beoordeling.json`,
  `output/<slug>/index.html` of een Gmail-draft, dan is dat een fout — stoppen en melden.

## Congruentieregel — METHODIEK.md meebijwerken

`METHODIEK.md` is de leesbare versie van de logica en wordt door Cowork gebruikt
om vragen te beantwoorden. Hij mag nooit uit elkaar lopen met de code.

**Wijzig je een van deze, werk dan in dezelfde beurt `METHODIEK.md` bij en zet de
datum "Laatst gelijkgezet met de code" bovenaan op vandaag:**

- de publieke constanten bovenaan `lib/rekenkern.js`: `WEIGHTS`, `HALFLIFE_JAREN`,
  `BAYES_M`, `MIN_REVIEWS`, `MIN_RECENT`, `LISTED_FULL`, `LISTED_SMALL`,
  `SMALL_REGION_THRESHOLD`, `TRUST_CEIL` (en `EXTRA_MAX` / `WATCHLIST_MAX`, die
  in `build.js` blijven staan omdat ze alleen het rapport en de prospectie sturen);
- het versie-blok `METHODIEK_PARAMS` / `METHODIEK_LATEST` (per versie:
  `TRUST_FLOOR`, `RECENCY_ANCHOR`, `PUBLISH_MIN_REVIEWS`, `EXPECT_HALF_STEPS`,
  `VAKFOCUS_FLOOR`) of `VAKDEF_BY_NICHE` — alle in `lib/rekenkern.js`;
- de eligibility-, selectie- (`pickTop`, publicatiedrempel) of compositeberekening
  in `bereken()` in `lib/rekenkern.js`;
- een rubriek, ijkpunt of regel in `prompts/scoring-prompt.md`;
- het werkproces of de outreach-mailteksten in
  `prompts/directory-page-emails-prompt.md`.

Meld het expliciet in je antwoord als je `METHODIEK.md` hebt bijgewerkt — en ook
als je het bewust niet nodig vond.

Wijzigt de publieke formulering van de methodiek (`template.html` §methodiek,
`homepage.html`, de JSON-LD FAQ), controleer dan dat de percentages en drempels
daar gelijk lopen met `build.js` én `METHODIEK.md`. Die drie moeten altijd
hetzelfde zeggen.

## Bestanden in het kort

| Pad | Rol |
|---|---|
| `lib/rekenkern.js` | **De rekenkern.** Constanten, methodiek-versies, eligibility, de vier dimensies, composite en selectie. Doet geen I/O, dus los te draaien en te testen. Bindende bron voor alle getallen. |
| `build.js` | Leest de bestanden, laat `lib/rekenkern.js` rekenen, bewaakt het selectieslot en rendert pagina, rapport, prospectie en badge-export. |
| `test/` | `npm test`: golden-tests op de 16 live pagina's (élk tussengetal), randgevallen, en de verschillen tussen methodiek v1 t/m v5. `test/README.md` zegt wanneer een snapshot vernieuwd mag worden — dat is zelden. |
| `ARCHITECTUUR.md` | **Vogelperspectief:** wat waar staat (laptop, GitHub, Cloudflare) en hoe de keten van scrape tot live pagina loopt. Lees dit bij vragen over de opzet. |
| `build-all.js` | Bouwt alles (pagina's, hubs, sitemap) + pusht `registry.json`, de badges én de site naar Cloudflare. Veilig eindcommando. |
| `lib/push-site.js` | Publiceert `output/` naar `Magicworx-be/keurwijzer-site`; Cloudflare zet het live. |
| `build-site.js` | Homepage/hubs (kaarten worden clientside geladen uit `registry.json`). |
| `lib/registry.js` | Leidt navigatie en sitemap af uit de configs. Bevat ook `loadPlannedRegions()` (leest `regions.txt`) + `PROVINCIE_PER_REGIO` en `PLANNED_MIN_LIVE` voor de "binnenkort"-kaarten. |
| `new page - how to/regions.txt` | **Bindende lijst van alle 29 Keurwijzer-regio's** (tab-gescheiden). Voedt de "binnenkort"-kaarten op de niche-hubs. `regio-overzicht.md` is de leesbare werkversie hiervan. |
| `lib/push-registry.js` | Pusht `registry.json` naar GitHub (`Magicworx-be/keurwijzer-data`) + purget jsDelivr-cache. |
| `scripts/genereer-badges.js` | Rendert kwaliteitsbadges (PNG, donker/licht) per gepubliceerd bedrijf uit `badges/<slug>/badges.json` (sharp + opentype.js). Zegel: `assets/zegel.png` of `SEAL_MODE=vector`. |
| `lib/push-badges.js` | Pusht de badge-PNG's (`badges/`) naar dezelfde data-repo + purget jsDelivr per bestand. |
| `.env` | `GITHUB_TOKEN` en `GITHUB_REPO` voor de automatische push (niet in versiebeheer). |
| `scripts/normalize.js` | Apify-export → `data/<slug>/reviews.json` (+ `recent24`, `rankbaar`). |
| `prompts/scoring-prompt.md` | Rubrieken voor de LLM-beoordeling, incl. de website-/vakfocuscheck. Wordt letterlijk aangeroepen vanuit Fase 3 van de werkproces-prompt hieronder. |
| `prompts/directory-page-emails-prompt.md` | **Canonieke Fase 0–7 werkproces-prompt** — config aanmaken t/m outreach-mails; Fase 7 is de opvolgreeks bij stilte en draait los, dagen tot weken later. Instructies in het Engels; alle outreach-mailteksten in Fase 6 en 7 staan bewust in het Nederlands (gaan naar Vlaamse bedrijven). Stond eerder als Google Doc (`doc_id 1cB_MeCzx0KB_pHISE_o6mfs9cT4It51ju3HmSrWzgFY`); dat Doc is **buiten gebruik** — bewerk het niet meer en lees het niet meer, dit bestand is de enige bron. |
| `config/<niche>/<slug>.json` | Vak, regio, gemeentelijst, peildatum. De gemeentelijst is de eerste selectiefilter. |
| `METHODIEK.md` | Leesbare uitleg van selectie en ranking. Gedeeld met Cowork. |
| `WIJZIGINGEN.md` | Waarom-beslissingen (o.a. Top 10-concept i.p.v. score op 10). |
| `reports/<slug>/` | Controlerapport + intern prospectiedocument (niet publiceren). |

## Werkafspraken

- Bouwen: `node build.js <slug>` voor één pagina, `node build-all.js` voor alles
  (incl. registry.json push).
- Raak `data/<slug>/beoordeling.json` niet aan zonder expliciete vraag.
- Bij twijfel over een niche-term, synoniem of hero-afbeelding: vragen, niet
  verzinnen.
- **Publiceren gebeurt vanzelf.** Een nieuwe regio staat na `node build-all.js`
  binnen ~30 seconden live; er is geen handmatige stap. De hubs en homepage pikken
  de nieuwe link automatisch op uit `registry.json` — inclusief het omklappen van de
  "binnenkort"-kaart naar een klikbare kaart en het bijwerken van de JSON-LD
  ItemList. Meld na afloop wat er live ging.
- **De build gaat direct live.** Er zit geen controlemoment meer tussen bouwen en
  publiceren. Klopt er iets niet, dan is dat rechtgezet met een nieuwe build —
  maar bouw niet lichtzinnig.
