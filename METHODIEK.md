# Keurwijzer — methodiek

**Wat dit document is:** de volledige uitleg, in gewone taal, van hoe Keurwijzer
bedrijven *selecteert* en *rangschikt*. Bedoeld om te lezen, te delen en om
vragen mee te beantwoorden ("waarom staat bedrijf X er niet bij?").

**Wat dit document NIET is:** de bindende bron. Bij elk getal staat waar het echt
vandaan komt. Wijkt dit document af van de code, dan heeft de code gelijk en is
dit document verouderd — zie [Onderhoud](#onderhoud-1-bron-2-lezers).

| | |
|---|---|
| **Bindende bron voor alle berekeningen** | `lib/rekenkern.js` (de constanten bovenaan en de functie `bereken`) |
| **Bindende bron voor pagina, rapport en publicatie** | `build.js` (leest, laat rekenen, rendert) |
| **Bindende bron voor de LLM-beoordeling** | `prompts/scoring-prompt.md` |
| **Bindende bron voor het werkproces** | `prompts/directory-page-emails-prompt.md` |
| **Waarom-beslissingen** | `WIJZIGINGEN.md` |
| **Nieuwste methodiek-versie** | v5 (zie [Methodiek-versies](#methodiek-versies)) |
| **Vangnet onder de berekening** | het selectieslot in `build.js` én de tests in `test/` (`npm test`) |
| **Laatst gelijkgezet met de code** | 4 september 2026 |

---

## 1. Het grondprincipe

Keurwijzer bepaalt per **niche × regio** (bv. dakwerkers × regio Aalst) welke
bedrijven de beste zijn, op basis van publiek beschikbare gegevens:
**Google-reviews** en de **eigen website** van het bedrijf.

Eén regel bepaalt de hele architectuur:

> **De LLM beoordeelt alleen tekst. Alle rekenwerk gebeurt in `lib/rekenkern.js`.**

De LLM leest reviewteksten en websites en geeft daar deelscores aan
(reviewkwaliteit, vakfocus). Hij berekent **nooit** een eindscore, bepaalt
**nooit** wie in de lijst komt en **nooit** de volgorde. Dat doet een
deterministisch script. Zo geldt: *zelfde data = zelfde resultaat.*

Tweede regel, die daaruit volgt:

> **`beoordeling.json` wordt één keer per regio gemaakt en dan bevroren.**

Een nieuwe LLM-run kan licht andere deelscores geven — dat is de enige bron van
variatie in de uitkomst. Zolang `reviews.json` en `beoordeling.json` gelijk
blijven, geeft `build.js` exact dezelfde Top 10. Herbeoordelen doe je bewust, bij
de halfjaarlijkse update.

Derde regel: **de site publiceert geen cijfer op 10.** Het publiek ziet een Top 10
(of Top 5) met een rangnummer. De volledige rekenmethode draait wél onder de
motorkap — ze bepaalt de *selectie en de volgorde*, niet een gepubliceerd cijfer.
Waarom: zie `WIJZIGINGEN.md`.

---

## Methodiek-versies

De **vier dimensies**, de **publieke gewichten (35/30/15/20)**, de **halveringstijd
(2 jaar)**, de **Bayes-krimp (M = 16)** en de **opnamedrempels (≥10 reviews, ≥3
recent)** zijn **identiek in elke versie**. Dat is de publieke belofte: *dezelfde
methode voor elk bedrijf in elke regio.* Wat een versie verandert, is uitsluitend
**interne kalibratie die de publieke paginatekst niet noemt**.

Een pagina wordt gebouwd op de nieuwste versie en krijgt daarna, zodra ze online
staat, die versie vastgepind in haar config (`"methodiek": 5`). Ontbreekt het veld,
dan gebruikt `build.js` de nieuwste versie — dat is de toestand tussen bouwen en
publiceren in. **Alle gepubliceerde pagina's dragen een pin** (v1 t/m v5); de
rekenwijze van een pagina die online staat ligt daarmee vast.

**De pin wordt afgedwongen door de code, niet door een afspraak.** Zodra een pagina
een `data/<slug>/selectie.json` heeft — het bewijs dat ze gepubliceerd is — eist
`build.js` dat de config dezelfde versie draagt. Ontbreekt de pin, of wijkt ze af
van de versie waarop de pagina online staat, dan **stopt de build** en wordt er
niets geschreven. Vastzetten gaat met één commando, dat de versie uit
`selectie.json` overneemt:

    node build.js <slug> --pin

Dat vervangt de handmatige publicatiestap. Een pagina die nog niet online staat
heeft nog geen `selectie.json` en hoort ook nog geen versieveld te dragen; die
bouwt bewust mee op de nieuwste logica.

Daar bovenop komt een tweede slot, dat niet de rekenwijze maar de **uitkomst**
bewaakt. Bij de eerste build legt `build.js` de gepubliceerde lijst vast in
`data/<slug>/selectie.json` — welke bedrijven, in welke volgorde. Levert een latere
build een andere lijst op, dan **stopt de build** en wordt er niets geschreven of
gepubliceerd. De volgorde telt mee, omdat de kwaliteitsbadges hun tekst uit de rang
afleiden (#1 / Top 3 / Top 5 / Top 10).

Zo kan de methodiek verbeteren en kan de pagina zelf bijgewerkt worden (opmaak,
tekst, structured data) zonder dat er ooit stilzwijgend een bedrijf van een
bestaande pagina verdwijnt of verschuift. Bij de jaarlijkse herberekening met verse
data wordt het slot bewust opnieuw gezet.

> Waarom dit er is: methodiek v5 haalde in de regio Kortrijk twee bedrijven uit de
> selectie — terecht, want het waren geen dakwerkers — maar dat gebeurde
> ongemerkt, en hun kwaliteitsbadges bleven daarna nog werken. Sinds publiceren
> rechtstreeks live gaat, is er geen controlemoment meer tussen bouwen en online.
>
> Bron: `build.js` — "stap 4a: het SELECTIESLOT".

| Kalibratie | v1 (vastgepinde pagina's) | v2 (destijds nieuw) | Waarom v2 beter is |
|---|---|---|---|
| Vertrouwen-normalisatie | Bayes 3,5 → 0 | **Bayes 4,0 → 0** | Eligible bedrijven liggen op 4,6–4,95; een vloer van 3,5 verspilde het halve bereik aan scores die geen enkel opgenomen bedrijf haalt. Vloer 4,0 geeft de objectieve dimensie resolutie wáár de data ligt → de ranking leunt meer op harde data, minder op een grove LLM-halve-stap. |
| Recentheid vol bij | 6 reviews/24m | **10 reviews/24m** | 6 was een erg lage lat die iedereen haalde; 10 blijft een activiteits*poort* (geen volumewedstrijd), maar geeft de dimensie iets meer werk aan de onderkant. |
| Publicatiedrempel | geen (= opname, ≥10) | **≥15 reviews** | Opname (meedingen) blijft ≥10, maar "een van de beste van de regio" mag niet op 10 reviews steunen. Zie §2. |
| LLM-deelscores | één run, 0,5-stappen | **gemiddelde van 2–3 runs** | Middelen halveert de effectieve stapgrootte en middelt toevallige beoordelaarsruis uit → de subjectieve dimensies worden fijner en stabieler. Zie §5. |

**v3 (destijds nieuw).** De vier **kalibratiewaarden** (vertrouwen-vloer,
recentheid-anker, publicatiedrempel, LLM-run-middeling) zijn **identiek aan v2** —
op bedrijven die aan de opnamecriteria voldoen geeft v3 exact dezelfde score en
volgorde als v2. v3 voegt één **opname-eis** en een rijkere **presentatielaag** toe.

**1 — Website verplicht voor opname (nieuw t.o.v. v2).** Een bedrijf komt op de
publieke pagina alleen als het een **geverifieerde eigen website** heeft — een
échte, aan het bedrijf gekoppelde site die de beoordelaar effectief bezocht en op
vakfocus beoordeelde (`vakfocusBron: "website"`). Bedrijven **zonder betrouwbare
site** — geen website, enkel een social-media-pagina (bv. alleen Instagram), of een
onbereikbare/kapotte site — worden **weggelaten**, ook al halen ze de review-drempels.
Reden: zonder website is de vakfocus (nichezuiverheid) niet controleerbaar, en een
vindbare eigen site is een basissignaal van een professioneel, bereikbaar vakbedrijf.
De review-drempels (≥10 reviews, ≥3 recent) en de publicatiedrempel (≥15 reviews)
blijven onveranderd; de website-eis komt er als extra voorwaarde bij. In de
publiekstekst staat de eis expliciet bij de opnamecriteria.

**2 — Rijkere JSON-LD structured data** — de machineleesbare laag voor zoekmachines
én AI-antwoordmachines (ChatGPT, Perplexity, Google AI Overviews):

- een eerste-klas **`Organization`**-uitgever (Keurwijzer / Magicworx bv) met een
  eigen `@id`, waar `WebSite` en `WebPage` via `@id` naar verwijzen;
- de `WebPage` koppelt `breadcrumb` en `mainEntity` (de bedrijvenlijst `#selectie`)
  via `@id`, zodat de coveragegraaf machine-duidelijk is;
- een **vak-specifiek schema.org-subtype** voor de bedrijven (bv.
  `RoofingContractor` voor dakwerkers i.p.v. het generieke
  `HomeAndConstructionBusiness`), via `SCHEMA_TYPE_BY_NICHE` in `build.js` of een
  `vak.schemaType` in de config; onbekende niches vallen veilig terug op het
  generieke type.

Bestaande v1- en v2-pagina's blijven byte-voor-byte identiek (geverifieerd): zowel de
website-eis als de rijkere graph zijn versie-gestuurd (`methodiekVersie >= 3`), dus
v1/v2 reproduceren exact hun oude output. **v3 was de standaard tot v4 werd
toegevoegd; de standaard is altijd de nieuwste versie — zie het v4-blok hieronder.**

> Bron: `lib/rekenkern.js` — `METHODIEK_PARAMS`, de `eligible`-berekening (website-eis) en de
> `JSONLD_GRAPH`-opbouw (tweede JSON-LD-blok).

**v4 (nieuw, standaard).** De **rekenkalibratie** (vertrouwen-vloer 4,0, recentheid-anker
10, LLM-run-middeling) is **identiek aan v2/v3**. v4 verandert enkel de **selectie**, met
twee toevoegingen die samen één doel dienen: *toon enkel échte vakspecialisten, en toon er
een Top 10 van zodra er genoeg zijn.*

**1 — Vakspecialist-eis (nieuw t.o.v. v3).** Een bedrijf is pas eligible als zijn
**vakfocus ≥ 2,5** (`VAKFOCUS_FLOOR`). Vakfocus komt uit de eigen homepagina/hoofdnavigatie
(rubriek 2 van de scoring-prompt) en meet nichezuiverheid. Zo vallen bedrijven **van een
ánder vak** die toevallig in de zoekresultaten opdoken — een bakkerij, een ramenplaatser,
een materialenleverancier of -fabrikant, een brede totaalaannemer — **deterministisch weg**,
ook al halen ze de review-drempels en hebben ze een website. De Google-categorie dient enkel
**ter controle in het rapport**, niet als filter (categorieën zijn te grillig: een échte
dakwerker kan als "Bouwbedrijf" of "Bouwadviseur" getagd staan, en omgekeerd). De marge
onder de gebruikelijke specialist-scores (échte vakbedrijven liggen op 3,0–5,0) vangt een
toevallige halve beoordelaarsstap op.

**2 — Diepte op het aantal eligible specialisten (nieuw t.o.v. v3).** De Top 10 / Top 5-keuze
telt in v4 het aantal **eligible vakspecialisten** (die dankzij de vloer écht van het vak
zijn), niet enkel de ≥15-onderbouwde. Een regio met **≥10 specialisten** krijgt dus een
**Top 10** — ook als enkele daarvan 10–14 reviews hebben — en de volgorde is **zuiver op
composite** (geen publishable-first-opvulling). De publicatiedrempel ≥15 reviews behoudt haar
betekenis als **"goed onderbouwd"-label** in het controlerapport en voor de warme-leadsplitsing
in het prospectiedocument, maar **stuurt de v4-selectie of -volgorde niet meer**. Reden: de
nieuwe vakspecialist-eis doet het kwaliteitswerk scherper dan een ruwe reviewtelling, en de
Bayes-krimp trekt weinig-berecenseerde bedrijven al naar het regiogemiddelde — een zwakke
specialist met 10 reviews klimt dus niet zomaar.

Bestaande v1/v2/v3-pagina's blijven byte-voor-byte identiek (geverifieerd): beide v4-regels
zijn versie-gestuurd (`methodiekVersie >= 4`).

> Bron: `lib/rekenkern.js` — `METHODIEK_PARAMS[4]` (`VAKFOCUS_FLOOR`), de `eligible`-berekening
> (vakfocus-vloer) en de `depthCount`/`top`-bepaling (diepte op specialisten, volgorde op
> composite).

**v5 (nieuw, standaard).** De **rekenkalibratie is identiek aan v4** — zelfde
vertrouwen-vloer (4,0), zelfde recentheid-anker (10), zelfde publicatiedrempel (15),
zelfde run-middeling en **dezelfde vakfocus-vloer (2,5)**. v5 verandert geen enkel getal.
Wat v5 verandert is een **definitie**: wát telt als "het vak uitoefenen".

**Aanleiding.** v4 leverde voor regio Kortrijk een Top 10 op met een
dakvensterinstallateur op plaats 1 en een lichtstraatbouwer op plaats 4. Beide zijn
zuivere specialisten in iets dat óp een dak gebeurt, dus beide scoorden hoog op
nichezuiverheid — maar geen van beide legt of vernieuwt ooit een dak. Een klant die een
dakwerker zoekt, heeft daar niets aan. De fout zat niet in de vloer (2,5 is de juiste
grens), maar in een **ongedefinieerd vak**: "dakwerkers" werd gelezen als *werkt aan
daken* in plaats van *legt en vernieuwt daken*.

**Wat v5 toevoegt:**

| | v4 | v5 |
|---|---|---|
| Afbakening van het vak | impliciet, aan de beoordelaar overgelaten | **expliciete vakdefinitie** per niche: een `kern` (wat het bedrijf zélf moet uitvoeren) plus een lijst `buiten` (verwante activiteiten die niet volstaan) |
| Waar die definitie staat | nergens | `VAKDEF_BY_NICHE` in `lib/rekenkern.js`, of `vak.definitie` in de config (die overruled) |
| Ontbrekende definitie | n.v.t. | de **build stopt** (`REQUIRE_VAKDEF`) — een vak zonder scherpe grens levert een willekeurige selectie op |
| Gevolg voor de score | — | voert een bedrijf de kernactiviteit **niet zelf** uit, dan is `vakfocus` **maximaal 2,0**, dus onder de vloer — hoe zuiver gespecialiseerd het verder ook is |
| Publieke opnametekst | "een aantoonbare specialisatie in dakwerken" | de kernomschrijving zelf: "een aantoonbare specialisatie in het zelf plaatsen, vernieuwen of herstellen van de dakbedekking …" |

De definitie voor **dakwerkers** (v5):

- **Kern:** het zelf plaatsen, vernieuwen of herstellen van de dakbedekking van een
  gebouw — hellende daken (pannen, leien, riet) en platte daken (roofing, bitumen, EPDM,
  zink).
- **Omvat ook:** de dakconstructie, dakisolatie, dakgoten en zinkwerk die bij zo'n dak
  horen; asbestdaken verwijderen en vervangen.
- **Valt erbuiten:** dakvensters, lichtkoepels of lichtstraten plaatsen; daken reinigen,
  ontmossen of coaten; zonnepanelen plaatsen; dakmaterialen verkopen of produceren;
  en enkel dakisolatie, enkel dakconstructie of enkel gevelwerk zónder de dakbedekking
  zelf.

Bestaande v1–v4-pagina's blijven ongemoeid: de eis is versie-gestuurd, en hun
`beoordeling.json` is sowieso bevroren. **v5 is nu de nieuwste versie
(`METHODIEK_LATEST` in `lib/rekenkern.js`) en dus de standaard voor élke nieuwe én elke herbouwde
pagina. Komt er ooit een v6 bij, dan wordt díe automatisch de standaard — een config
zonder `methodiek`-veld pakt altijd de nieuwste versie.**

> Bron: `lib/rekenkern.js` — `METHODIEK_PARAMS[5]` (`REQUIRE_VAKDEF`), `VAKDEF_BY_NICHE`, de
> `vakDef`-resolutie met harde stop, en `opnameCriteria`. De scoreregel staat in
> `prompts/scoring-prompt.md`, rubriek 2, stap 0.

---

## 2. Selectie: wie komt in aanmerking?

Een bedrijf is **eligible** (mag meedingen) als het aan **alle** voorwaarden
voldoet:

| Voorwaarde | Drempel | Waarom |
|---|---|---|
| Gemeente staat in de regiolijst | zie `gemeenten` in de config | Keurwijzer is regionaal; een bedrijf uit een andere regio hoort niet in deze lijst |
| Google-reviews (totaal) | **≥ 10** | Onder de 10 is een gemiddelde niet betrouwbaar |
| Reviews in de laatste 24 maanden | **≥ 3** | Een bedrijf dat 5 jaar stilligt, is geen actuele aanbeveling |
| Er is een LLM-beoordeling voor het bedrijf | aanwezig in `beoordeling.json` | Zonder beoordeling ontbreken twee van de vier dimensies |
| Minstens één bruikbare review (datum + score) | > 0 | Anders valt er niets te wegen |
| **Geverifieerde eigen website** (alleen v3+) | `vakfocusBron: "website"` | Zonder controleerbare site is de vakfocus niet te meten; een vindbare site is een basissignaal van een professioneel vakbedrijf. Enkel social media of een kapotte site telt niet mee |
| **Vakspecialist van de niche** (alleen v4+) | vakfocus ≥ 2,5 | Anders komen bedrijven van een ánder vak (bakkerij, ramenplaatser, materialenhandel of -fabrikant, brede totaalaannemer) die toevallig in de zoekresultaten opdoken tóch in aanmerking; de vakfocus-vloer sluit ze deterministisch uit. **Vanaf v5 is "het vak" scherp afgebakend** door de vakdefinitie van de niche: wie de kernactiviteit niet zélf uitvoert, krijgt vakfocus ≤ 2,0 en valt weg — ook een zuivere specialist in een verwante activiteit (dakvensters, lichtstraten, dakreiniging) |

> Bron: `lib/rekenkern.js` — `MIN_REVIEWS = 10`, `MIN_RECENT = 3`, en het veld `eligible`
> in stap 1. De website-eis geldt vanaf **methodiek v3**; de vakspecialist-eis
> (vakfocus ≥ `VAKFOCUS_FLOOR` = 2,5) vanaf **methodiek v4** (zie
> [Methodiek-versies](#methodiek-versies)); vastgepinde v1/v2/v3-pagina's kennen de
> respectieve eisen niet.

**Geen gemeente én geen coördinaten = altijd weglaten.** Zonder locatiegegevens
kunnen we niet vaststellen dat het bedrijf in de regio actief is. Dat is een harde
regel, geen inschatting.

Geeft de scrape géén adres/stad terug (een bekend Apify-gat) maar wél de
**pin-coördinaten**, dan leidt `normalize.js` de gemeente af uit die coördinaten
(reverse-geocoding). Dat is geen giswerk: het is Google's eigen pin, objectiever dan
het website-adres (dat een SEO-schijnzetel kan zijn), en de afgeleide gemeente moet
daarna nog steeds exact in de gemeentelijst staan — bedrijven buiten de regio
(andere provincie, buurregio, Wallonië) vallen dus gewoon weg. De uitkomst wordt
**bevroren** in `data/<slug>/geocache.json` (op coördinaat gecacht), zodat na de
eerste run geen enkele netwerkoproep meer nodig is en "zelfde data = zelfde
resultaat" gegarandeerd blijft. De naam of website van een bedrijf gebruiken we
nooit om een gemeente te raden.

**De gemeentelijst is dus de eerste filter.** Ze staat in
`config/<niche>/<slug>.json` onder `gemeenten` en bevat de kerngemeente plus de
omliggende gemeenten en deelgemeenten (bij Gent staan bv. Wondelgem, Gentbrugge,
Ledeberg en Mariakerke apart in de lijst). Wie die lijst wijzigt, wijzigt de
selectie.

**Opname is niet hetzelfde als publicatie (v2–v3).** De opnamedrempel (≥10 reviews)
bepaalt wie *mag meedingen*. Om ook echt *gepubliceerd* te worden in de Top N vroegen
v2 en v3 een steviger bewijslast: **≥15 reviews**. Zo stond "een van de beste van de
regio" nooit op flinterdun bewijs (bv. 10 reviews in een regio met tientallen
kandidaten).

- Een bedrijf met 10–14 reviews is wél eligible en krijgt een volledige composite,
  maar verschijnt in v2–v3 niet op de site zolang er genoeg beter-onderbouwde
  bedrijven zijn. Het komt als **warme lead** in het prospectiedocument ("uw
  kwaliteit zit goed; u mist enkel nog reviews").
- In een **dunne regio** vult de rekenkern de lijst in v2–v3 zo nodig aan met de
  sterkste eligible bedrijven onder de publicatiedrempel, zodat een lijst nooit
  leeg oogt.
- In v1 is de publicatiedrempel gelijk aan de opnamedrempel (≥10) — vandaar dat de
  vastgepinde pagina's ongewijzigd blijven.

**Vanaf v4 stuurt ≥15 de selectie niet meer.** De vakspecialist-eis (vakfocus ≥ 2,5)
neemt de rol van "bewijslast" over: wie in de lijst staat, is aantoonbaar van het vak.
De volgorde loopt daarna **zuiver op composite**, zonder publicabel-eerst-opvulling.
Een bedrijf met 10–14 reviews kan dus gepubliceerd worden — maar zonder cadeau: de
**Bayes-krimp (M = 16)** trekt een dun onderbouwd gemiddelde stevig naar het
regiogemiddelde toe, dus zo'n bedrijf haalt de top alleen met écht uitzonderlijke
cijfers. De ≥15-drempel blijft bestaan als **"goed onderbouwd"-label** in het
controlerapport en voor de warme-leadsplitsing in de prospectie.

> Bron: `lib/rekenkern.js` — `PUBLISH_MIN_REVIEWS` in `METHODIEK_PARAMS`; `pickTop`
> (publicabel eerst, sub-drempel vult enkel aan) geldt voor v1–v3. Vanaf v4 neemt
> `eligible.slice(0, nListed)` het over: zuiver op composite.

**Bedrijven die net niet voldoen** verdwijnen niet uit beeld: ze komen op de
wachtlijst in het controlerapport en in het prospectiedocument, met de reden
erbij ("Nog te weinig Google-reviews (7 van min. 10)").

---

## 3. Ranking: de vier dimensies

Elk eligible bedrijf krijgt een interne **gecombineerde beoordeling** (composite)
tussen 0 en 1, opgebouwd uit vier dimensies:

```
composite = 35% × Vertrouwen
          + 30% × Reviewkwaliteit
          + 15% × Recentheid
          + 20% × Vakfocus
```

> Bron: `lib/rekenkern.js` —
> `WEIGHTS = { trust: 0.35, reviewQuality: 0.30, recency: 0.15, focus: 0.20 }`.
> Deze gewichten zijn **vast en publiek** en worden nooit per stad aangepast.

### 3.1 Vertrouwen — 35%

Hoe goed en hoe betrouwbaar is de Google-score, gecorrigeerd voor leeftijd en
voor het aantal reviews?

**Tijdsweging.** Elke review krijgt een gewicht `w = 0,5 ^ (leeftijd in jaren / 2)`.
De halveringstijd is dus **2 jaar**: een review van vandaag telt voor 1,00, van
2 jaar geleden voor 0,50, van 4 jaar geleden voor 0,25. Leeftijd wordt gemeten
vanaf de **peildatum** in de config (de dag waarop de data gescrapet is), niet
vanaf vandaag — zo blijft een build reproduceerbaar.

**Bayesiaanse correctie.** Het tijdsgewogen gemiddelde `R` wordt naar het
regiogemiddelde `C` getrokken naarmate een bedrijf minder gewogen reviews heeft:

```
Bayes = v/(v+16) × R  +  16/(v+16) × C
```

waarbij `v` de som van de reviewgewichten is en `C` het gemiddelde van alle
eligible bedrijven in die regio.

*Waarom M = 16:* bewust stevig. Een klein perfect profiel (13 × 5★) mag niet
louter op een streak elke gevestigde speler verslaan — en vervalste reviewsets
zijn juist bij lage aantallen het goedkoopst te kopen.

**Normalisatie.** De Bayes-score (een cijfer op 5) wordt lineair omgezet naar
0–1, waarbij de bovengrens **5,0 → 1** is en de ondergrens versie-afhankelijk:
**v1: 3,5 → 0**, **v2: 4,0 → 0** (alles onder de vloer wordt 0). v2 tilt de vloer
op omdat opgenomen bedrijven in de praktijk tussen 4,6 en 4,95 liggen; een vloer van
3,5 perste die hele groep in een smalle strook (0,84–0,95) en liet de objectieve
dimensie nauwelijks onderscheiden. Met 4,0 krijgt vertrouwen resolutie waar de data
écht ligt — de ranking leunt zo méér op harde data en minder op een grove LLM-stap.

### 3.2 Reviewkwaliteit — 30%

Niet *hoeveel sterren* klanten geven, maar *wat ze schrijven*. Beoordeeld door de
LLM op een schaal 1,0–5,0 (stappen van 0,5), daarna omgezet naar 0–1. Recente
reviews wegen zwaarder dan oude.

Wat meetelt als substantie:
- concrete vakinhoud: welk werk, welke techniek, hoe een probleem is opgelost;
- proces: offerte nagekomen, timing gerespecteerd, nette werf, duidelijke communicatie;
- eerlijkheid: eerlijk advies, ook als dat minder werk oplevert voor het bedrijf;
- omgang met problemen: klacht erkend en netjes rechtgezet;
- professionele, inhoudelijke reacties van het bedrijf op reviews (zeker op negatieve).

De publieke reacties van het bedrijf op reviews horen bij het bewijs: elke review in
`reviews.json` draagt een veld `reactie` met de publieke reactie van het bedrijf (leeg
als er geen is). Een professionele, ter zake doende reactie — zeker op een kritische
review — telt mee als substantie; een copy-paste of defensieve reactie niet.

Wat nauwelijks meetelt: "top", "aanrader", "super", losse sterren zonder tekst.

IJkpunten: 5,0 = ruime meerderheid concrete vakinhoud én proces-signalen ·
4,0 = duidelijke kern van inhoudelijke reviews · 3,0 = overwegend korte lof ·
2,0 = vrijwel uitsluitend lege reviews of terugkerende procesproblemen ·
1,0 = patroon van niet-nagekomen afspraken of slecht opgeleverd werk.

> Bron: `prompts/scoring-prompt.md`, rubriek 1. Ontbreekt de score, dan rekent
> de rekenkern met 3,0.

### 3.3 Recentheid — 15%

```
recentheid = min(aantal reviews laatste 24 maanden / ANKER, 1)
```

De **anker**-waarde is versie-afhankelijk: **v1: 6**, **v2: 10** recente reviews voor
de volle score. Bewust een lage lat: dit is een activiteitssignaal, geen
volumewedstrijd. v2 tilt het anker licht op omdat 6 een lat was die vrijwel iedereen
haalde (de dimensie deed dan geen onderscheidend werk); 10 blijft een poort, geen
wedstrijd, en een lange staat van dienst wordt nooit afgestraft.

### 3.4 Vakfocus — 20%

**Dit is de dimensie die meet of het bedrijf écht gespecialiseerd is in het vak** —
afgelezen van de **eigen website**, niet van de reviews (klanten zijn zelden
specifiek over welk type werk het was).

Vakfocus meet **nichezuiverheid**: specialist versus generalist. Bewust géén maat
voor omvang of reputatie — dat zit al in de reviews.

**Stap 0 — de poortvraag (v5+).** Vóór de nichezuiverheid gescoord wordt, geldt
één vraag: *voert dit bedrijf de kernactiviteit van het vak zélf uit?* De
kernactiviteit staat in de **vakdefinitie** van de niche (`VAKDEF_BY_NICHE` in
`lib/rekenkern.js`, of `vak.definitie` in de config). Voor dakwerkers is dat: **zelf de
dakbedekking plaatsen, vernieuwen of herstellen.**

- **Nee** → `vakfocus` is **maximaal 2,0** en het bedrijf valt onder de vloer, dus
  buiten de selectie. Ongeacht hoe zuiver het gespecialiseerd is.
- **Ja** → scoor verder op de ijkpunten hieronder.

Dit is bewust hard. Een bedrijf dat één verwante activiteit perfect en uitsluitend
uitvoert, is een zuivere specialist **in iets anders**. Een dakvensterinstallateur,
een lichtstraatbouwer, een dakreiniger, een zonnepaneelinstallateur en een
dakpannenfabrikant werken allemaal aan of voor daken — maar geen van hen legt of
vernieuwt een dak, en dus hoort geen van hen in een lijst van dakwerkers, hoe goed
hun reviews ook zijn.

**Werkwijze (verplicht voor elk bedrijf dat in de ranking kan komen):**

1. Gebruik de URL uit het veld `website` als die is ingevuld (die komt uit
   Google/Apify en is betrouwbaar aan het bedrijf gekoppeld).
2. Is er geen website meegegeven, zoek de officiële site dan op — en
   **verifieer** dat het om hetzelfde bedrijf gaat: naam én gemeente/adres moeten
   kloppen met `reviews.json`. Let op naamverwarring (meerdere bedrijven met
   bijna dezelfde naam) en op **SEO-schijnsites**: een "…-<stad>"-site waarvan de
   maatschappelijke zetel in een heel andere regio ligt, is geen lokale
   specialist.
3. Beoordeel de **homepagina en de hoofdnavigatie**: de menu-items verraden
   meestal meteen welke vakgebieden het bedrijf aanbiedt. Niet de hele site
   doorlopen.
4. Noteer de exact beoordeelde URL in `websiteBezocht`, zodat elke score achteraf
   controleerbaar is. Die audit staat ook in het controlerapport.
5. Geen betrouwbare, geverifieerde site gevonden → `vakfocus: null`.
   **Nooit raden.**

**IJkpunten** (tel de hoofddiensten in navigatie/homepagina):

| Score | Betekenis |
|---|---|
| 5,0 | Zuivere specialist — dit vakgebied is quasi de enige activiteit |
| 4,0 | Duidelijk de kern, met hooguit één sterk verwante nevendienst (bv. dak + gevel) |
| 3,0 | Eén van meerdere gelijkwaardige activiteiten (totaalaannemer, breed bouwbedrijf) |
| 2,0 | Randactiviteit of subitem onder een andere dienst — **of het bedrijf voert de kernactiviteit niet zelf uit** (stap 0 gaf "nee", v5+) |
| 1,0 | De site maakt niet duidelijk dat het bedrijf dit vak op enige manier raakt |

**Lichte bonus:** +0,5 (nooit boven 5,0) bij expliciete, aantoonbare
erkenningen, certificaten of garantietermijnen in dit vak, of een lange staat van
dienst. Bij twijfel: niet verhogen.

**Geen website?** Dan krijgt het bedrijf de **mediaan-vakfocus van de bedrijven
mét website in diezelfde regio**. Niet 0 (dat zou onterecht straffen) en niet het
maximum (dat zou belonen voor het ontbreken van bewijs).

> Bron: `prompts/scoring-prompt.md`, rubriek 2; de medianenlogica staat in
> `lib/rekenkern.js`, stap 2–3.

---

## 4. Hoeveel bedrijven tonen we?

- **≥ 10 bedrijven met genoeg diepgang** in de regio → **Top 10**
- **< 10** → **Top 5**
- **< 5** → netjes wat er is, bv. "Top 3" (nooit meer tonen dan er zijn)

Wát "genoeg diepgang" precies telt, verschilt per methodiek-versie — zie de
alinea hieronder.

De grens ligt bewust op de echte **diepgang** van een regio, níet op het aantal ruwe
zoekresultaten (200 resultaten kunnen 6 echte specialisten bevatten, 40 juist 15
sterke). In **v2 en v3** telt daarvoor het aantal **publicabele** bedrijven (eligible én
≥15 reviews): we tonen alleen een Top 10 als er ook echt 10 goed onderbouwde bedrijven
zijn. In **v1** telt het aantal **eligible** bedrijven (publicatiedrempel = opname). In
**v4** telt het aantal **eligible vakspecialisten** (die dankzij de vakfocus-vloer écht
van het vak zijn): ≥10 specialisten → Top 10, en de volgorde is zuiver op composite; de
≥15-drempel blijft enkel een "goed onderbouwd"-label voor rapport en prospectie.

**Volgorde binnen de lijst:** composite aflopend; bij gelijkspel het gewogen
reviewvolume aflopend; daarna alfabetisch. Volledig deterministisch — geen
willekeur, geen toeval.

**Wat er buiten valt:**
- **Plaats 11–20** — niet op de site, wél in het prospectiedocument voor
  dasslim.be (warme leads: eligible, net buiten de selectie).
- **Niet-eligible bedrijven in de regio** — niet op de site, wél in rapport en
  prospectie, met de reden waarom ze nog niet opgenomen zijn.
- Beide documenten zijn **intern**; het prospectiedocument staat bovenaan
  gemarkeerd als "niet publiceren".

> Bron: `lib/rekenkern.js` — `LISTED_FULL = 10`, `LISTED_SMALL = 5`,
> `SMALL_REGION_THRESHOLD = 10`; `EXTRA_MAX = 10` en `WATCHLIST_MAX = 10` (alleen rapport
> en prospectie) staan in `build.js`.

---

## 5. Het proces van A tot Z

| Stap | Wat | Waarmee |
|---|---|---|
| 1 | Config aanmaken: vak, regio, gemeenten, zoektermen, peildatum (nieuw = nieuwste versie, geen `methodiek`-veld nodig) | `config/<niche>/<slug>.json` |
| 2 | Reviews en websites scrapen | Apify (reviews-scraper + place-details) |
| 3 | Normaliseren naar één bestand | `node scripts/normalize.js apify <slug> …` → `data/<slug>/reviews.json` |
| 4 | Tekstuele beoordeling door de LLM (mét webtoegang voor de vakfocus) — **2–3 onafhankelijke runs, gemiddelde bevriezen** (staande regel sinds v2) | `prompts/scoring-prompt.md` → `data/<slug>/beoordeling.json` — **daarna bevriezen** |
| 5 | Bouwen | `node build.js <slug>`, of veilig voor de hele site: `node build-all.js` |
| 6 | Controleren | `reports/<slug>/<slug>-rapport.txt` |
| 7 | Outreach: één Gmail-concept per gepubliceerd bedrijf (nooit automatisch verzenden) | `prompts/directory-page-emails-prompt.md`, fase 6 |
| 8 | Opvolging bij stilte: twee opvolgconcepten in dezelfde thread (los van de bouw, dagen tot weken later) | `prompts/directory-page-emails-prompt.md`, fase 7 |

**Aanspreking met voornaam (staande regel sinds 1 september 2026).** Bij het zoeken
naar het mailadres van een bedrijf wordt op dezelfde pagina's ook naar de **voornaam
van de zaakvoerder** gezocht; die komt dan in de aanhef (`Dag Kevin,` in plaats van
`Goeiedag,`). Hoogstens één extra pagina per bedrijf. De naam wordt alleen gebruikt als
de site hem expliciet aan de zaakvoerder, eigenaar of oprichter koppelt, of als het
onmiskenbaar een eenmanszaak is — bij twijfel geen naam, want een verkeerde voornaam is
schadelijker dan geen. Namen die enkel in Google-reviews voorkomen tellen als
bevestiging, nooit als bron. Dit staat volledig **buiten de methodiek**: het raakt
selectie noch ranking, net zoals de WhatsApp-nummers in §7.

**Opvolgmails bij stilte (staande regel sinds 1 september 2026).** De meeste bedrijven
antwoorden niet op de eerste mail. Daarop volgen hoogstens **twee** opvolgmails, telkens
als **antwoord in dezelfde thread** (nooit een nieuwe mail met een nieuw onderwerp):
de eerste na minstens 3 werkdagen, de tweede na nog eens 10 werkdagen als afsluiter. Ze bevatten **geen links, geen afbeelding en geen rangvermelding**
— de landingspagina staat al in de geciteerde eerste mail eronder. Er wordt geen
kunstmatige deadline of "laatste kans" gebruikt: de pagina heeft er geen, en een bedrijf
kan dat nakijken. Wie "nee" antwoordt of eerder om rust vroeg, krijgt niets meer; wie al
antwoordde, valt vanzelf uit de reeks. Ook dit staat **buiten de methodiek**: opvolging
raakt selectie noch ranking, en de pagina van een bedrijf verandert niet door wel of niet
te antwoorden. Zie fase 7 in `prompts/directory-page-emails-prompt.md`.

**Nooit twee keer dezelfde mail (harde regel, 4 september 2026).** Geen enkel bedrijf
krijgt twee keer dezelfde vraag. Niet in twee opeenvolgende weken, en niet omdat het in
twee regio's gepubliceerd staat. Dat is geen stijlvoorkeur maar een
geloofwaardigheidskwestie: Keurwijzer presenteert zich als een zorgvuldige, onafhankelijke
vergelijking, en twee identieke mails uit dezelfde bron spreken dat tegen bij precies de
bedrijven waar het om draait. Er zijn vier remmen, en ze staan met opzet niet allemaal op
dezelfde plek:

1. **Het logboek** (`data/outreach.json`). Een rij met een ingevulde `opvolg1` of
   `opvolg2` — verstuurd óf als draft — valt uit allebei de vrijdaglijsten.
   `alOpgevolgd()` in `lib/outreach.js` is de enige plek waar die regel staat.
2. **Het noteercommando** (`scripts/outreach-noteer.js`). De ronde schrijft haar drafts
   niet met de hand in het logboek maar via dit script, dat een tweede notitie op
   hetzelfde bedrijf weigert. Het sluit af met `--controleer`, dat nul openstaande
   kandidaten hoort te tonen.
3. **De vingerafdruk in de thread.** Allebei de opvolgteksten beginnen met "Ik wou je
   opname op Keurwijzer graag afwerken." Staat die zin al in de thread, dan is er al
   opgevolgd — ook als het logboek iets anders beweert. Dit is de enige rem die een
   achterlopend logboek overleeft.
4. **De adrescontrole vóór mail 1** (`node scripts/outreach-lijst.js --adres <mail>`).
   Het logboek houdt één rij per bedrijf **per regio** bij, dus een bedrijf in twee
   regio's heeft twee rijen en de tweede lijkt onbenaderd. Fase 6 controleert daarom elk
   mailadres vóór ze een kennismakingsmail opstelt.

Sinds 4 september 2026 gaat de **eerste** opvolgmail alleen naar de bedrijven op plek 1
t.e.m. 5 van hun regio, en niet dieper, en **vraagt ze niet langer naar de badge maar naar
het zakelijk WhatsApp-nummer**. De reden is praktisch: de eerste mail bood die badge al
aan en werd genegeerd; een vraag naar hun WhatsApp-nummer is een andere call to action met
een kleinere drempel. De badge blijft gewoon beschikbaar, er wordt alleen niet meer naar
gevraagd in de opvolging. Zo'n nummer staat sowieso **buiten de methodiek** (zie §7): het
komt in geen enkele berekening voor en verandert de plaats van een bedrijf niet. Die grens is gemeten: de top 3 antwoordt op 21%
van de eerste mail, plek 4 t.e.m. 10 op 11% (meting van 2 september 2026 over 133
gepubliceerde bedrijven; reviews en sterrenscore verschillen niet tussen wie antwoordt en
wie niet — alleen de plaats doet ertoe). De plaats komt rechtstreeks uit
`data/<slug>/selectie.json`, dus uit wat er werkelijk op de pagina staat. Ook dit raakt
selectie noch ranking: een bedrijf zakt of stijgt niet doordat het wel of geen opvolgmail
krijgt. Wie zijn WhatsApp-nummer nog niet doorgaf of bevestigde, krijgt daarnaast één
herinnering, ongeacht plaats — dat gesprek liep al.

Omdat de opvolgmail geen badge meer aanbiedt, ontstaat er een groep die haar
WhatsApp-nummer doorgeeft zonder ooit een badge gekregen te hebben. Die krijgt hem
alsnog: scenario 4 in `prompts/reply-scenarios.md` hangt het vaste badgeblok onder de
bevestigingsmail zodra het nummer live staat. Of een bedrijf zijn badge al had, wordt
in de thread zelf nagekeken (staat de zin "Gebruik deze badges gerust" erin?) en niet in
het logboek — dat veld is leeg voor iedereen die vóór 4 september 2026 een badge kreeg.
Zo krijgt niemand er twee, en niemand geen.

**Het WhatsApp-bericht na de bevestigingsmail (4 september 2026).** Staat het nummer live
en is de bevestigingsmail vertrokken, dan hoort daar één kort WhatsApp-bericht bij, een uur
later. Het bevestigt dat de knop werkt en laat Oliviers eigen nummer achter; het vraagt
niets. De bevestigingsmail kondigt het een uur eerder aan ("Ik stuur je nog een
testberichtje"), zodat het niet uit de lucht komt vallen bij een bedrijf dat zijn nummer
gaf om het op de pagina te zetten. `scripts/whatsapp-nabericht.js` herkent die mail aan haar vaste openingszin ("Ik heb
je WhatsApp-nummer toegevoegd"), wacht `NABERICHT_WACHT_MINUTEN` (60) af en zet het bericht
klaar als een `wa.me`-link in één mail aan Olivier.

**Het verstuurt nooit zelf.** Geautomatiseerd versturen kan alleen via de WhatsApp Business
Platform van Meta: een vooraf goedgekeurd sjabloon, een apart nummer en een kost per
bericht. En het bedrijf gaf zijn nummer om op de pagina te zetten — dat is geen toestemming
om er berichten van Keurwijzer op te ontvangen. Olivier tikt de link aan en verstuurt vanaf
zijn eigen nummer, waar het bedrijf hem later ook kan terugvinden.

Dezelfde harde regel geldt als bij de mails, en ze weegt hier zwaarder: **nooit twee keer
hetzelfde bedrijf**. Een mail te veel verdwijnt in een postvak; een bericht te veel staat op
hun telefoon, tussen de berichten van hun klanten. `alNabericht()` in `lib/outreach.js` is
de enige plek waar die rem staat, en het script schrijft `nabericht.klaargezetOp` weg zodra
de link gemaild is. Een bedrijf kan ook bewust worden overgeslagen (`--overslaan`); dat telt
als behandeld en levert dezelfde toestand op — geen bericht, en het komt niet meer terug. Ook dit raakt selectie noch ranking (zie §7).

**Herinnering voor een WhatsApp-nummer (staande regel sinds 3 september 2026).** Een
bedrijf dat wél antwoordde en zijn badge kreeg, maar de vraag naar zijn zakelijk
WhatsApp-nummer onbeantwoord liet, krijgt daarover **hoogstens één** herinnering, opnieuw
als antwoord in dezelfde thread en zonder links. Staat het nummer al in
`data/whatsapp.json`, dan gebeurt er niets. Er komt nooit een tweede herinnering: een
WhatsApp-nummer staat buiten de methodiek (§7) en een bedrijf dat zwijgt, wil het niet.
Deze herinnering raakt selectie noch ranking.

**Meerdere LLM-runs middelen (staande regel sinds v2, geldt in elke latere versie).**
Reviewkwaliteit en vakfocus worden in
**2–3 onafhankelijke runs** gescoord (elk in 0,5-stappen); je bevriest het
**gemiddelde**, niet toevallig de eerste run. Dat halveert de effectieve stapgrootte
en middelt toevallige beoordelaarsruis uit — precies de twee subjectieve dimensies
die anders de dichtbij elkaar liggende composites zouden laten kantelen. De rekenkern
aanvaardt die fijnere (niet-0,5) waarden zonder waarschuwing. In v1 was het één run
in vaste 0,5-stappen; die beoordelingen blijven bevroren.

De normalisatiestap schrijft per bedrijf alvast `recent24` en `rankbaar` mee
(gemeente in de lijst + ≥10 reviews + ≥3 recent). Dat zijn **informatieve velden
voor de LLM**, zodat die zelf geen datums hoeft te tellen — de rekenkern rekent
altijd zelf en negeert ze.

**Wat de build oplevert:**
- `output/<slug>/index.html` — de publieke pagina (enkel de Top N)
- `reports/<slug>/<slug>-rapport.txt` — controlerapport met álle tussenscores per
  dimensie, de vakfocus-audit met bezochte URL's, plaats 11–20 en de wachtlijst.
  Bovenaan staat een **data-integriteitsblok** dat bedrijven met een vermoedelijk
  afgekapte review-export markeert (exact 100 bruikbare reviews terwijl Google er
  meer telt — een cap die het vertrouwen van grote spelers naar beneden vertekent),
  en een **robuustheidstest** die per gepubliceerd bedrijf toont hoe zeker zijn
  plek is (zie hieronder).
- `reports/<slug>/<slug>-prospectie-dasslim.md` — intern prospectiedocument
- `badges/<slug>/badges.json` — badgegegevens per gepubliceerd bedrijf (naam,
  gemeente, rang, tier, slug, badge-URL's). Dit is ook de **opzoektabel bij
  badge-vragen achteraf**: vraagt een bedrijf maanden later om zijn badge, dan komen
  naam, tier en beide badge-links hieruit. `lib/push-badges.js` publiceert het bestand
  daarom mee naar de CDN, naast de PNG's — `badges/` staat lokaal in `.gitignore`, dus
  dat is meteen de enige duurzame kopie. Het bevat enkel gegevens die al publiek op de
  pagina staan; contactgegevens horen er niet in.

Het **controlerapport is het beste startpunt bij elke vraag** over waarom een
bedrijf ergens staat: het toont per bedrijf composite, trust, reviewkwaliteit,
recentheid, focus, Bayes, gewogen volume en reviewaantallen naast elkaar.

**Robuustheidstest (alleen in het rapport, verandert niets aan de publicatie).**
De twee subjectieve LLM-dimensies (reviewkwaliteit, vakfocus) worden op een schaal
met halve stappen gescoord; één halve stap is een reële beoordelaarsonzekerheid.
Het rapport verstoort daarom élke LLM-deelscore van élk eligible bedrijf met een
toevallige ±0,5 en telt over 5000 trials (met **vaste seed**, dus reproduceerbaar)
hoe vaak elk Top-N-bedrijf in de Top N blijft. Vertrouwen en recentheid zijn
objectief berekend en blijven onaangeroerd. De test rangschikt daarbij **exact zoals
de methodiek-versie van die pagina zelf rangschikt** (v4: zuiver op composite;
v1–v3: publicabel eerst) — anders meet ze een volgorde die geen enkele bezoeker te
zien krijgt, en krijgt elk gepubliceerd bedrijf onder de ≥15-drempel een vals
"wankel"-oordeel. Zo zie je welke posities écht vaststaan
(hoge kans, smalle band) en welke een dobbelworp zijn — nuttig als een bedrijf net
buiten de selectie vraagt "waarom niet ik?". Dit voedt géén enkel gepubliceerd
getal: de composite, de selectie en de volgorde blijven volledig deterministisch
uit de vaste gewichten volgen.

---

## 6. Wat we bewust NIET doen

- **Geen betaalde posities.** Positie in de lijst is niet te koop; ze volgt
  volledig uit de berekening.
- **Geen cijfer op 10 publiceren.** Wel een Top N met rangnummer.
- **Geen negatief kwaliteitsoordeel in de teksten.** De synthese is feitelijk en
  informatief; nuance mag ("vooral actief in platte daken"), afkraken niet.
- **Geen verzonnen feiten of superlatieven** die de data niet dragen.
- **Geen vestigingen samenvoegen.** Dubbele bedrijfsnamen geven een waarschuwing
  in de build en worden handmatig gecontroleerd.
- **Geen andere gewichten per stad.** Dezelfde methode geldt voor elk bedrijf in
  elke regio.

---

## 7. Contactgegevens (WhatsApp)

Een bedrijf dat op Keurwijzer staat mag zélf een WhatsApp-nummer doorgeven. Doet
het dat, dan krijgt zijn kaart een tekstlink "WhatsApp" naast "Naar website", die
een gesprek opent met de openingszin *"Hallo, ik vond u via Keurwijzer."*

**Dit staat volledig los van de methodiek:**

- Het nummer komt in **geen enkele** berekening voor — niet in de vier dimensies,
  niet in de eligibility-test, niet in de volgorde. Het is contactinformatie,
  geen kwaliteitssignaal.
- Het valt daarom **buiten `METHODIEK_PARAMS`**: een WhatsApp-link verschijnt op
  pagina's van élke methodiek-versie, ook op de vastgepinde v1-pagina's. Dat is
  bewust — anders kon een bedrijf op een oudere pagina nooit bereikbaar worden.
- De link is **visueel even zwaar** als "Naar website". Een opvallende knop zou
  bedrijven mét nummer voorrang geven op een pagina die net over onafhankelijke
  rangschikking gaat.
- De paginatekst zegt dit ook expliciet, onder §methodiek: *"Sommige bedrijven
  geven zelf een WhatsApp-nummer door … maakt geen deel uit van de beoordeling en
  heeft geen invloed op de selectie of de volgorde."*

**Waar het vandaan komt:** `data/whatsapp.json`, gevuld uit **één** bron: de
antwoorden die bedrijven zelf per mail sturen op de outreach. Elke regel draagt
`"bron": "mail"`. (Tot 1 september 2026 was er een tweede bron, een private Google
Sheet; die is buiten gebruik en wordt niet meer gelezen.) Eén regel per bedrijf
per regio (`slug` + `bedrijf` + `whatsapp` + `toestemming` [+ `bron`]); koppeling gebeurt op
slug plus genormaliseerde bedrijfsnaam. Het nummer mag in elk formaat staan —
`lib/whatsapp.js` maakt er een geldige `wa.me`-link van. Klopt een naam niet met
`reviews.json`, dan meldt de build dat met een suggestie ("bedoelde je …?") en
**slaat die ene regiopagina over**; de overige pagina's worden wél gebouwd en
gepubliceerd. Een tikfout laat dus niet stilzwijgend één knop verdwijnen, maar zet
wel een hele pagina stil — de build-uitvoer hoort daarom altijd nagelezen te worden.
**Het nummer wordt ook één keer in de andere richting gebruikt.** Zodra het live staat,
krijgt het bedrijf één kort WhatsApp-bericht van Olivier — een bevestiging dat de knop
werkt, en zo staat zijn nummer ook bij hen in de telefoon. Eén per bedrijf, nooit meer, en
altijd met de hand verstuurd; zie § Opvolgmails. Ook dat verandert niets aan de selectie of
de volgorde.

Regel weghalen = link weg bij de volgende build.

---

## Onderhoud: 1 bron, 2 lezers

Dit document wordt door mensen én door Cowork gelezen; `lib/rekenkern.js` en de
prompts worden door de code gedraaid. Ze mogen niet uit elkaar lopen.

**De afspraak:**

1. **De code is bindend.** Wijzigt een drempel of gewicht, dan wijzigt hij eerst
   in `lib/rekenkern.js` (of in `prompts/scoring-prompt.md`) — en pas daarna hier.
2. **Elke wijziging aan een constante of aan `bereken()` in `lib/rekenkern.js`, of
   aan een rubriek in `scoring-prompt.md`, vereist een update van dit document in
   dezelfde beurt.** Werk je in Claude Code: vraag expliciet om `METHODIEK.md` mee
   bij te werken.
3. **Cowork wijzigt dit document niet zelfstandig inhoudelijk.** Merkt Cowork een
   afwijking, of wil je de methodiek veranderen, dan gebeurt dat via Claude Code
   in de code — waarna dit document volgt.
4. **Zet de datum bovenaan bij** ("Laatst gelijkgezet met de code") telkens je hem
   gelijkzet. Staat die datum ver in het verleden, wantrouw dit document dan en
   controleer `lib/rekenkern.js`.
5. **De tests zijn het tweede vangnet.** Het selectieslot bewaakt wíé er op een
   gepubliceerde pagina staat; `test/rekenkern.golden.test.js` bewaakt daarnaast
   élk tussengetal van élke live pagina, en `test/rekenkern.rand.test.js` en
   `test/rekenkern.versies.test.js` leggen de randgevallen en de verschillen
   tussen v1 t/m v5 vast. Verandert er iets aan de rekenwijze, dan vallen die
   tests om — dat is hun werk. Draai ze met `npm test`.

**Snelle controle** — of dit document nog klopt met de code:

```bash
npm test
```

En om de constanten zelf te zien (regelnummers verschuiven, deze grens niet):

```bash
sed -n '/---------------- constanten/,/^const TRUST_CEIL/p' lib/rekenkern.js
```

Vergelijk die getallen met §2, §3 en §4 hierboven. Wijken ze af, dan is dit
document verouderd en heeft de code gelijk.
