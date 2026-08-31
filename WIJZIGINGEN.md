# Keurwijzer — variant "Top 10-concept"

Deze map is een **zelfstandige kopie** van het project met één grote wijziging:
de site toont **geen cijfer op 10 meer per bedrijf**, maar een **Top 10** (of
**Top 5** in een dunne regio) als vignet. Je originele project (één map hoger)
is volledig ongemoeid gelaten.

> Alles hier is testbaar zonder je echte project aan te raken. De zware ruwe
> Apify-bestanden (`apify-export.json`, `apify-places.json`) zijn bewust **niet**
> mee gekopieerd; de genormaliseerde `reviews.json` + `beoordeling.json` van
> `dakwerkers-gent` zitten er wél in, zodat `node build.js dakwerkers-gent`
> meteen werkt.

---

## Wat is er veranderd?

### 1. Geen score op 10 → Top 10 / Top 5-medaille
- De ring met een cijfer (7,0–9,5) is vervangen door een **nummerloze groene
  medaille met lauwerkrans**: "TOP" boven het aantal (10 of 5). Rechtsboven op
  de kaart staat een understated **"Geverifieerd"-badge** als trust-cue.
- De medaille is op elke kaart identiek (geen rangnummer meer); de lauwerkrans
  wordt wiskundig gegenereerd in `build.js` (`laurelSVG()`), dus perfect
  symmetrisch en meeschalend met het aantal.
- **De volgorde blijft behouden** (op de gecombineerde beoordeling), zoals je
  vroeg — dus géén alfabetische lijst; de volgorde is zichtbaar via de
  lijstpositie.
- De volledige rekenmethode (Bayes, tijdsweging, 4 dimensies) draait nog steeds
  onder de motorkap; ze bepaalt nu **de selectie en de volgorde**, niet langer
  een gepubliceerd cijfer.

### 2. Dynamisch: Top 10 of Top 5
- Voldoende **eligible** bedrijven → **Top 10**; een dunne regio → **Top 5**.
- De grens ligt op het aantal **eligible** bedrijven, **niet** op het aantal
  ruwe Apify-resultaten. Reden: dat laatste zegt weinig over de echte diepgang
  (een regio kan 200 bedrijven opleveren met 6 echte specialisten, of 40 met 15).
  Dit is bewust anders dan het ">100 Apify → Top 10"-idee — het is eerlijker.
- Instelbaar bovenaan `build.js`: `SMALL_REGION_THRESHOLD = 10`
  (< 10 eligible → Top 5), `LISTED_FULL = 10`, `LISTED_SMALL = 5`.
- Bij minder dan 5 eligible wordt het netjes "Top 3" e.d. (nooit meer tonen dan
  er zijn).

### 3. 11–20 en niet-eligible: niet meer op de site
- De inklapbare blokken "ook opgenomen (11–20)" en "wachtlijst" zijn **van de
  pagina verwijderd**. De site toont enkel de Top N.
- Ze blijven wél in het **controlerapport**, en komen in een **nieuw
  prospectiedocument**.

### 4. Nieuw: prospectiedocument voor dasslim.be
- `build.js` schrijft nu ook `output/<niche>/<slug>-prospectie-dasslim.md`.
- **Sectie A** = plek 11–20 (warme leads, eligible, net buiten de Top N) met
  gemeente, website, Google-cijfers, interne kwaliteitsindex, specialiteiten en
  synthese — plus een kant-en-klare openingszin.
- **Sectie B** = nog-niet-eligible bedrijven (langeretermijnprospects) met de
  reden waarom ze nog niet opgenomen zijn.
- Dit bestand is **intern** — het staat bovenaan gemarkeerd als "niet publiceren".

### 5. Teksten aangepast (site + homepage)
Overal waar "score op 10" / "Keurwijzer-score" / "gerangschikt op score" stond,
is dat vervangen door de nieuwe taal ("selectie en volgorde", "Top 10", "geen
cijfer op 10"). Aangepast in: `template.html`, `homepage.html`
(incl. de zichtbare FAQ én de JSON-LD, die gelijk lopen), de methodiek-uitleg,
het samenvattingsblok, de footer-transparantietekst en een **nieuwe FAQ**
"Waarom tonen jullie geen score op 10 per bedrijf?".

### 6. Prompt: één belangrijke toevoeging
In `prompts/scoring-prompt.md` staat nu expliciet dat `beoordeling.json`
**één keer gemaakt en dan bevroren** wordt. Dat is de echte oplossing voor de
fluctuatie die je opmerkte: zolang `beoordeling.json` + `reviews.json` gelijk
blijven, geeft `build.js` altijd exact dezelfde Top 10. Draai de LLM-stap dus
niet lichtvaardig opnieuw.

### 7. Reactie van het bedrijf op reviews wordt nu meegegeven aan de LLM
Rubriek 1 vroeg de LLM altijd al om "professionele, inhoudelijke reacties van het
bedrijf op reviews" mee te wegen als kwaliteitssignaal — maar `normalize.js` gooide
het Apify-veld `responseFromOwnerText` weg en bewaarde per review enkel
`score`/`datum`/`tekst`/`auteur`. De LLM heeft die reacties dus nooit gezien; de
rubriek beoordeelde bewijs dat niet in de input zat. In onze echte data draagt ~23%
van de reviews een reactie en reageert maar ongeveer een kwart van de bedrijven —
een sterk, onderscheidend professionaliteitssignaal waar we blind voor waren.

`normalize.js` bewaart nu per review een veld `reactie` (leeg als er geen reactie is),
en `prompts/scoring-prompt.md` + `METHODIEK.md` §3.2 benoemen dat het bewijs is.
Bewust géén methodiek-versie: dit verbetert alleen de *input* van de LLM, niet de
`build.js`-rekenlogica (die leest enkel `score`/`datum` en negeert `reactie`), en raakt
geen enkele publieke constante. Nieuwe beoordelingen volgen zo trouwer de reeds
gepubliceerde methode; **bestaande pagina's blijven bevroren** en pikken dit pas op bij
hun periodieke herbeoordeling — `reviews.json` is regenereerbaar, `beoordeling.json`
wordt niet aangeraakt.

### 8. Werkproces-prompt geconsolideerd naar één Google Doc (Engels), outreach-mails vertaald naar het Nederlands
Er bestonden twee, uit elkaar gelopen versies van het Fase 0–6 werkproces: een lokale,
Nederlandse (`prompts/directory-pagina-prompt.md` + `new page - how to/outreach-email-prompt.md`)
en een Google Doc ("directory-page-emails-prompt (EN)") die de gebruiker in de praktijk
kopieert om een nieuw Claude Code-gesprek te starten — inclusief de dakwerkers-sint-niklaas-pagina.
Die Doc bleek volledig in het Engels te staan, óók de twee kant-en-klare outreach-mailteksten
in Fase 6 (de mails die daadwerkelijk naar Vlaamse bedrijven gaan).

Besluit: de Google Doc blijft de ene canonieke werkproces-prompt (de gebruiker plakt hem
telkens opnieuw, dus die moet compleet en op zichzelf staand zijn); de lokale duplicaten
zijn verwijderd/gearchiveerd. De twee outreach-mailteksten in Fase 6 zijn vertaald naar het
Nederlands (zelfde tekst als de eerder al Nederlandstalige `outreach-email-prompt.md`); de
rest van de Doc-instructies blijft Engels, wat geen risico is — Fase 3 verwijst nog steeds
letterlijk naar `prompts/scoring-prompt.md` (Nederlands, ongewijzigd) voor `synthese`/chips,
en de paginabuild zelf (`build.js`/`template.html`) is sowieso taal-onafhankelijk van de
werkproces-prompt. Gecontroleerd dat `output/dakwerkers-sint-niklaas/index.html` al correct
Nederlandstalig is — de Engelse kickoff-prompt heeft de gepubliceerde pagina dus niet
aangetast, enkel Fase 6 (outreach) liep risico.

### 9. "Binnenkort"-kaarten op de niche-hub + hubs zijn nu write-once
**Probleem.** Per nieuwe regio waren er twee GHL-handelingen nodig: de detailpagina
plakken én de niche-hub opnieuw plakken. Dat tweede kwam volledig door de JSON-LD
`ItemList` in de hub-header, die bij elke nieuwe regio veranderde. De zichtbare
kaarten waren al sinds de dynamische navigatie clientside — alleen die ene structured-
data-lijst hield de hub "vuil".

**Overwogen en verworpen:** alle 29 regio's alvast als link tonen en de kliks laten
opvangen door een custom 404 ("binnenkort live"). Drie bezwaren: `build-site.js` zet
elke registry-pagina in `sitemap.xml` (→ 404's in Search Console), een 404-template die
HTTP 200 teruggeeft is een *soft 404* die Google als lage kwaliteit behandelt, en het
bespaart geen werk — de kaarten komen uit `registry.json`, dus nep-links zouden juist
weer een hub-paste vereisen. Voor een site die op onafhankelijkheid en degelijkheid
verkoopt is "29 regio's, 24 dode links" bovendien precies het dunne-directory-patroon
waarvan Keurwijzer zich onderscheidt.

**Wat het wel geworden is.** De niche-hub toont de nog niet gebouwde regio's als
grijze, **niet-klikbare** kaart met een "Binnenkort"-pill. Geen `href`, dus geen enkele
404, en ze komen niet in de sitemap of de structured data. De lijst is puur afgeleid:

    binnenkort = alle regio's uit regions.txt (29)  −  regio's live in registry.json

Daardoor is "binnenkort" nooit een opgeslagen label. Gaat een regio live, dan valt ze
vanzelf uit de aftrekking en wordt haar kaart klikbaar, zonder de hub aan te raken —
getest door Brugge aan `pages` toe te voegen terwijl ze in `planned` bleef staan: kaart
klapte om van `<div>`+Binnenkort naar `<a href>`, teller van "5 van 29" naar "6 van 29",
ItemList van 5 naar 6 items. Onder `PLANNED_MIN_LIVE` (3) live regio's blijven de grijze
kaarten weg; 1 live + 28 grijze oogt verlaten in plaats van ambitieus.

Tegelijk verhuisde de `ItemList` uit de statische JSON-LD naar clientside injectie in
`hub.html`, uit dezelfde registry als de kaarten (enkel live pagina's). Een statische
kopie verouderde toch bij elke nieuwe regio — structured data die niet klopt met wat de
pagina toont is slechter dan geen ItemList. Wat statisch overblijft (CollectionPage +
BreadcrumbList) is stabiel per hub. **Netto: 1 GHL-actie per nieuwe regio, permanent.**

Raakt geen enkele publieke constante, methodiek-versie of `beoordeling.json` — dit is
navigatie, geen rangschikking.

### 10. Aandachtspunt per bedrijf in de outreach-mail — deterministisch, niet door de LLM
**Wat.** `badges/<slug>/badges.json` draagt per gepubliceerd bedrijf een veld
`aandachtspunt`: één Nederlandse zin die benoemt wélke van de vier dimensies zijn
positie het meest vooruit zou helpen. Die zin gaat als één regel mee in outreach-mail 1
en verschijnt **nooit** op de publieke pagina.

**Waarom.** De outreach-strategie vroeg om personalisatie die niet op schaal te faken
is: geen cijfers opsommen (passief), maar één concreet punt benoemen (actief, en het
bewijst dat er naar dít dossier gekeken is).

**Overwogen en verworpen: de LLM de zin laten schrijven** (zoals het strategiedocument
voorstelde, via een extra veld in `prompts/scoring-prompt.md`). Twee bezwaren. Ten
eerste is "welke dimensie weegt het zwaarst door" een vergelijking van getallen, dus
rekenwerk — dat hoort per de grondregel in `build.js`, niet bij de LLM. Ten tweede zou
het bestaande regio's uitsluiten: hun `beoordeling.json` is bevroren en mag niet
lichtvaardig herdraaid worden, dus Aalst, Gent, Dendermonde en Meetjesland zouden
zonder aandachtspunt blijven.

**Wat het wel geworden is.** `aandachtspuntVoor()` in stap 8b van `build.js` kiest de
dimensie met de grootste *gewogen speelruimte* (`gewicht × (1 − score)`) — daar levert
verbetering het meeste op — en vult een vaste Nederlandse zin met de echte cijfers van
dat bedrijf (sterren, reviewaantal, aantal recente reviews). Bij exact gelijke
speelruimte beslist een vaste volgorde, dus reproduceerbaar. De percentages komen uit
`WEIGHTS` en de halveringstijd uit `HALFLIFE_JAREN`, zodat de tekst niet kan gaan
afwijken van de methodiek. Er wordt uitsluitend naar publieke getallen verwezen, nooit
naar interne kalibratie (publicatiedrempel, vertrouwen-vloer). Bewust géén URL in de
zin: mail 1 mag exact één link bevatten.

Gecontroleerd dat de vier bestaande pagina's na herbouw **byte-identiek** blijven en
dat `badges.json` niet naar de publieke data-repo gepusht wordt (`push-badges.js`
verzamelt alleen `.png`) — het aandachtspunt blijft dus lokaal, zodat bedrijven niet
elkaars aandachtspunt kunnen lezen.

### 11. Werkproces-prompt terug naar een lokaal `.md`-bestand
Omkering van beslissing 8. De Google Doc was leesbaar via de Drive-MCP maar niet
schrijfbaar, waardoor elke wijziging aan het werkproces een handmatige plak-actie van
de gebruiker vergde — en dus kon achterblijven op de code. Bij het toevoegen van het
aandachtspunt (beslissing 10) werd dat concreet: de code was al klaar terwijl de prompt
nog niet meekon.

De prompt staat nu als `prompts/directory-page-emails-prompt.md` in versiebeheer, naast
`scoring-prompt.md`. Zo valt hij onder dezelfde congruentieregel als de rest en kan
Claude Code hem in dezelfde beurt meebewerken. De Google Doc is **buiten gebruik** —
de reden uit beslissing 8 (de gebruiker plakt de prompt telkens opnieuw, dus die moet
compleet en op zichzelf staand zijn) blijft gelden en het bestand voldoet daaraan; wat
vervalt is enkel dat Google Docs daarvoor de bewaarplaats moest zijn.

### 12. Publiceren volledig geautomatiseerd — weg bij GoHighLevel (31-08-2026)

**Probleem.** Elke nieuwe pagina moest met de hand in GoHighLevel gezet worden: pagina
aanmaken, zeven SEO-velden invullen, de JSON-LD in de header plakken en 70 KB HTML in
een custom-code element. Dat was met afstand de duurste stap van het hele proces, en
met 29 regio's in het vooruitzicht liep dat alleen maar op.

**Waarom het niet met een koppeling op te lossen was.** De publieke API van GoHighLevel
heeft alleen léés-endpoints voor funnels en pagina's. Er bestaat geen manier om een
pagina aan te maken of de HTML en SEO-velden weg te schrijven. Elke automatisering zou
neerkomen op een script dat de bouwer-interface nabootst — te broos om op te bouwen.

**Beslissing.** De publieke pagina's zijn uit GoHighLevel gehaald. Ze waren volledig
zelfstandig: geen formulier, geen tracking, geen enkele afhankelijkheid. Alle SEO-velden
zaten al ín de HTML — de hele `ghl/`-plakmap bestond alleen omdat GoHighLevel ze daar
niet las. Op een statische host valt dat weg: het bestand ís de pagina.

**Nu.** `build-all.js` duwt de site naar `Magicworx-be/keurwijzer-site`; Cloudflare zet
ze binnen ~30 seconden live op keurwijzer.be. De URLs bleven identiek, dus er was geen
enkele redirect nodig. Hosting is gratis: verzoeken naar statische bestanden zijn bij
Cloudflare onbeperkt en kosteloos.

**Meegenomen:** `sitemap.xml` en `robots.txt` werken nu écht. Op GoHighLevel leverde
`/sitemap.xml` nul URLs op en was `/robots.txt` leeg — Google wist dus niet welke
pagina's er waren. Nu staan er 24 URLs in.

**Verder in dit document staan nog passages over de `ghl/`-plakmap en de "in GHL
bijwerken"-lijst.** Die beschrijven hoe het wérkte en blijven staan als geschiedenis;
ze gelden niet meer. `ARCHITECTUUR.md` beschrijft de huidige opzet.

---

### 13. WhatsApp-link per bedrijf (31-08-2026)

**Wat.** Een bedrijf dat op Keurwijzer staat mag zelf zijn WhatsApp-nummer doorgeven.
Doet het dat, dan krijgt zijn kaart een tekstlink "WhatsApp" naast "Naar website", die
een gesprek opent met de openingszin *"Hallo, ik vond u via Keurwijzer."* Zo ziet het
bedrijf meteen waar de klant vandaan komt — het beste argument voor de volgende
outreach-ronde.

**Waarom een ingetogen tekstlink en geen groene knop.** Alleen een deel van de bedrijven
zal een nummer doorgeven. Een opvallende knop zou die bedrijven visueel voorrang geven
op een pagina die net over onafhankelijke rangschikking gaat — de bezoeker ziet dan een
verschil dat niets met kwaliteit te maken heeft, maar er wel uitziet alsof het meespeelt.
De link heeft daarom exact hetzelfde gewicht als "Naar website". Om dezelfde reden staat
er nu één zin onder §methodiek: *contactmogelijkheden maken geen deel uit van de
beoordeling en beïnvloeden selectie noch volgorde.*

**Waarom buiten de methodiek-versies.** Bestaande pagina's staan vastgepind op hun
versie en veranderen normaal nooit. Een telefoonnummer is echter geen methodiek maar
contactinformatie: het komt in geen enkele berekening voor. Zou de link versie-gestuurd
zijn, dan kon een bedrijf op de v1-pagina van Gent nooit bereikbaar worden. Hij staat
daarom buiten `METHODIEK_PARAMS` en verschijnt op pagina's van elke versie.

**Waarom een lokaal bestand en niet rechtstreeks de Google Sheet.** De build leest
`data/whatsapp.json`. Dat staat in versiebeheer, werkt offline en kan nooit een
publicatie blokkeren omdat Google onbereikbaar is. De private Sheet blijft de plek waar
Olivier de nummers verzamelt; die wordt naar dit bestand overgezet. Wil je dat later
volledig automatisch, dan volstaat het één tabblad als CSV te publiceren en dat bij de
build op te halen — het bouwstuk verandert daar niet voor.

**Harde stop bij een naamfout.** Klopt een bedrijfsnaam niet met `reviews.json`, dan
stopt de build met een suggestie op basis van letterafstand ("bedoelde je …?"). Een
tikfout mag de knop niet stilzwijgend laten verdwijnen bij een bedrijf dat zijn nummer
net heeft doorgegeven.

**Bestanden:** `lib/whatsapp.js` (nieuw), `data/whatsapp.json` (nieuw), `build.js`
(inladen, controle, `articleHTML`), `template.html` (icoon, `.co-acties`, de zin onder
§methodiek), `METHODIEK.md` §7.

---

## Wat is NIET veranderd
- De rekenmethode, gewichten en drempels (35/30/15/20, halveringstijd 2 jaar,
  Bayes M=16, ≥10 reviews, ≥3 recent).
- `scripts/normalize.js` en `scripts/maak-testdata.js` (raken geen gepubliceerde
  score aan).
- De data zelf.

---

## Zelf testen
```bash
cd top10-concept
node build.js dakwerkers-gent
```
Bekijk daarna:
- `output/dakwerkers/dakwerkers-gent.html` — de pagina (Top 10, geen cijfer)
- `output/dakwerkers/dakwerkers-gent-rapport.txt` — controlerapport
- `output/dakwerkers/dakwerkers-gent-prospectie-dasslim.md` — prospectielijst

De Top 5-tak testen (dunne regio) kan met een eigen kleine config, of met de
synthetische testdata via een beperkte gemeentelijst.

---

## Navigatie-architectuur (niche × regio) — nieuw

De site is een matrix van **niche × regio**. De navigatie is een hub-and-spoke
opzet die automatisch meegroeit (doel: 1000+ pagina's) en volledig uit de
configs wordt gegenereerd — geen enkele link wordt handmatig onderhouden.

### URL-schema (detailpagina's bewust plat in de root)
| Type | URL | Bestand |
|---|---|---|
| Homepage | `/` | `output/index.html` |
| Niche-hub | `/dakwerkers/` | `output/dakwerkers/index.html` |
| Regio-hub | `/regio/gent/` | `output/regio/gent/index.html` |
| Detailpagina | `/dakwerkers-gent/` | `output/dakwerkers-gent/index.html` |

`output/` spiegelt nu **exact** de live-URL-structuur → upload je 1-op-1 naar de
root. Folder-diepte is geen rankingfactor; de silo ontstaat door de interne
links, niet door de mappen.

### Interne rapporten verhuisd
`…-rapport.txt` en `…-prospectie-dasslim.md` staan nu in **`reports/<slug>/`**
(buiten `output/`) — die map upload je bewust **niet**. Vroeger stonden ze in
`output/` en waren ze dus publiek opvraagbaar.

### Bouwstenen
- `lib/registry.js` — leest alle `config/<niche>/*.json` en is de enige bron voor
  hubs, kruislinks, broodkruimels en sitemap. Naburige regio's worden afgeleid
  uit gedeelde gemeenten (grensoverlap) + provincie.
- `hub.html` — template voor zowel niche- als regio-hubs.
- `build-site.js` — genereert de hubs, `output/index.html` (uit `homepage.html`,
  met `{{REGIO_INDEX}}`) en `output/sitemap.xml`.
- `template.html` — detailpagina, nu met broodkruimel (zichtbaar + `BreadcrumbList`)
  en een "Verder kijken"-blok (naburige regio's + andere vakgebieden in de regio).

### Buildflow
```bash
node build.js dakwerkers-gent        # snel: één detailpagina (her)bouwen
node build-site.js                   # enkel hubs + homepage + sitemap
node build-all.js                    # ALLES herbouwen + consistentiecheck  ← gebruik dit
```

**Waarom `build-all.js` het veiligste is:** de kruislinks (naburige regio's,
andere vakgebieden) zitten gebakken in élke detailpagina. `build-site.js` alleen
vernieuwt die niet — een bestaande buurpagina blijft dan naar de oude situatie
wijzen. `build-all.js` herbouwt alle detailpagina's + hubs + homepage + sitemap,
**ruimt weespagina's op** (output die niet meer bij een config hoort) en toont
op het einde een **"in GHL bijwerken"-lijst**: welke pagina's nieuw, gewijzigd
of verwijderd zijn. Alleen díe hoef je in GHL aan te passen.

**Een niche/regio toevoegen:**
1. `config/<niche>/<slug>.json` + `data/<slug>/{reviews,beoordeling}.json` aanmaken.
2. `node build-all.js` draaien.
3. In GHL enkel de pagina's uit de "bijwerken"-lijst aanpassen.

De nieuwe pagina verschijnt daarna automatisch in de hubs, in de homepage-regio-
index en in de sitemap.

### Detailpagina's zijn "write-once" (belangrijk voor het werk)
Detailpagina's linken **niet** naar hun zusterpagina's, maar enkel naar hun twee
hubs (`/niche/` en `/regio/kern/`). Die hub-links hangen alleen af van de eigen
niche/regio van de pagina. Gevolg: **een detailpagina verandert nooit wanneer je
elders een regio of niche toevoegt** — je hoeft ze dus niet te heruploaden. Ze
wijzigen enkel als hun éígen reviewdata verandert. De actuele lijst van
zusterpagina's staat op de hubs (die je toch al bijwerkt, en dat zijn er weinig).

Wat er dus verandert bij een toevoeging (nooit de honderden detailpagina's):
- **Nieuwe regio in een niche** → nieuw: detail + regio-hub · bijwerken: niche-hub, homepage, sitemap.
- **Nieuwe niche in een regio** → nieuw: detail + niche-hub · bijwerken: regio-hub, sitemap (homepage handmatig).

> GHL publiceert niet vanzelf: de build maakt de HTML, maar het overzetten naar
> GHL blijft handwerk. De "bijwerken"-lijst vertelt je precies wélke pagina's.

### GHL-plakhelper (`ghl/`)
Na `build-all.js` staat in **`ghl/`**:
- `_METADATA-overzicht.txt` → de SEO-velden (Path, title, meta-description, canonical,
  OG-titel/-beschrijving/-afbeelding) van **álle** live pagina's — altijd actueel,
  ook na een no-op build. Handig naslag terwijl je in GHL werkt.
- per pagina die je moet aan-/bijwerken een **mapje** met drie kant-en-klare bestanden:
  - `SEO-velden.txt` → in de **SEO-tab** van de pagina (title/description/canonical/OG)
  - `header-code.txt` → in de **Header/Tracking-code** (JSON-LD schema)
  - `body.txt` → in **één Custom HTML/Code-element** (bevat ook de CSS + fonts)

  (Alle drie de bundelbestanden zijn `.txt`, zodat ze op Windows in een teksteditor
  openen in plaats van in een browser — je wil de broncode kopiëren, niet de pagina zien.)

Belangrijk: title/description/canonical **moeten** in de SEO-tab — in de body leest
GHL ze niet (getest op de live site: die stonden in de body en werden genegeerd).
JSON-LD mag wél in de body. `ghl/` wordt bij elke `build-all` opnieuw opgebouwd en is
een **werkmap — niet uploaden** (net als `reports/`).

### robots.txt + sitemap.xml
`build-site.js`/`build-all.js` schrijven `output/robots.txt` (verwijst naar de
sitemap) en `output/sitemap.xml`. Let op: GHL beheert soms zelf robots/sitemap —
controleer of je deze losse bestanden op de root kan hosten; zo niet, gebruik
GHL's eigen sitemap-instelling.

> Aandachtspunt (nog te beslissen): kies sitebreed **mét of zonder `www`**.
> Canonicals gebruiken nu `https://keurwijzer.be` (zonder www); één plek in het
> `WebSite`-schema van `template.html` staat nog op `www`.

## Designdetails die je makkelijk kan bijstellen
- **Grafisch element:** nu een lauwerkrans. Wil je iets anders (ster, zegel-rand,
  lint), dan pas je `laurelSVG()` in `build.js` aan.
- **Kleur/afmeting medaille:** in `template.html` onder `.seal` (gradient,
  grootte, schaduw) en de responsive varianten.
- **"Geverifieerd"-badge:** in `articleHTML` (`build.js`); weglaten of hernoemen
  kan in één regel.
