# Keurwijzer — methodiek

**Wat dit document is:** de volledige uitleg, in gewone taal, van hoe Keurwijzer
bedrijven *selecteert* en *rangschikt*. Bedoeld om te lezen, te delen en om
vragen mee te beantwoorden ("waarom staat bedrijf X er niet bij?").

**Wat dit document NIET is:** de bindende bron. Bij elk getal staat waar het echt
vandaan komt. Wijkt dit document af van de code, dan heeft de code gelijk en is
dit document verouderd — zie [Onderhoud](#onderhoud-1-bron-2-lezers).

| | |
|---|---|
| **Bindende bron voor alle berekeningen** | `build.js` (constanten bovenaan, regels 52–112) |
| **Bindende bron voor de LLM-beoordeling** | `prompts/scoring-prompt.md` |
| **Bindende bron voor het werkproces** | `prompts/directory-page-emails-prompt.md` |
| **Waarom-beslissingen** | `WIJZIGINGEN.md` |
| **Nieuwste methodiek-versie** | v2 (zie [Methodiek-versies](#methodiek-versies)) |
| **Laatst gelijkgezet met de code** | 25 augustus 2026 |

---

## 1. Het grondprincipe

Keurwijzer bepaalt per **niche × regio** (bv. dakwerkers × regio Aalst) welke
bedrijven de beste zijn, op basis van publiek beschikbare gegevens:
**Google-reviews** en de **eigen website** van het bedrijf.

Eén regel bepaalt de hele architectuur:

> **De LLM beoordeelt alleen tekst. Alle rekenwerk gebeurt in `build.js`.**

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

Elke pagina draagt een versie in haar config (`"methodiek": 1`). Ontbreekt het veld,
dan gebruikt `build.js` de nieuwste versie. **Bestaande pagina's staan vastgepind en
veranderen dus nooit; nieuwe pagina's krijgen automatisch de beste logica.** Zo blijft
"zelfde data = zelfde resultaat" gelden én kan de methodiek verbeteren zonder één
gepubliceerde pagina te breken.

| Kalibratie | v1 (vastgepinde pagina's) | v2 (nieuw, standaard) | Waarom v2 beter is |
|---|---|---|---|
| Vertrouwen-normalisatie | Bayes 3,5 → 0 | **Bayes 4,0 → 0** | Eligible bedrijven liggen op 4,6–4,95; een vloer van 3,5 verspilde het halve bereik aan scores die geen enkel opgenomen bedrijf haalt. Vloer 4,0 geeft de objectieve dimensie resolutie wáár de data ligt → de ranking leunt meer op harde data, minder op een grove LLM-halve-stap. |
| Recentheid vol bij | 6 reviews/24m | **10 reviews/24m** | 6 was een erg lage lat die iedereen haalde; 10 blijft een activiteits*poort* (geen volumewedstrijd), maar geeft de dimensie iets meer werk aan de onderkant. |
| Publicatiedrempel | geen (= opname, ≥10) | **≥15 reviews** | Opname (meedingen) blijft ≥10, maar "een van de beste van de regio" mag niet op 10 reviews steunen. Zie §2. |
| LLM-deelscores | één run, 0,5-stappen | **gemiddelde van 2–3 runs** | Middelen halveert de effectieve stapgrootte en middelt toevallige beoordelaarsruis uit → de subjectieve dimensies worden fijner en stabieler. Zie §5. |

> Bron: `build.js` — `METHODIEK_PARAMS` (net onder de publieke constanten).

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

> Bron: `build.js` — `MIN_REVIEWS = 10`, `MIN_RECENT = 3`, en het veld `eligible`
> in stap 1.

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

**Opname is niet hetzelfde als publicatie (v2).** De opnamedrempel (≥10 reviews)
bepaalt wie *mag meedingen*. Om ook echt *gepubliceerd* te worden in de Top N vraagt
v2 een steviger bewijslast: **≥15 reviews**. Zo staat "een van de beste van de regio"
nooit op flinterdun bewijs (bv. 10 reviews in een regio met tientallen kandidaten).

- Een bedrijf met 10–14 reviews is wél eligible en krijgt een volledige composite,
  maar verschijnt niet op de site zolang er genoeg beter-onderbouwde bedrijven zijn.
  Het komt als **warme lead** in het prospectiedocument ("uw kwaliteit zit goed; u
  mist enkel nog reviews").
- In een **dunne regio** vult `build.js` de lijst zo nodig aan met de sterkste
  eligible bedrijven onder de publicatiedrempel, zodat een lijst nooit leeg oogt.
- In v1 is de publicatiedrempel gelijk aan de opnamedrempel (≥10) — vandaar dat de
  vastgepinde pagina's ongewijzigd blijven.

> Bron: `build.js` — `PUBLISH_MIN_REVIEWS` in `METHODIEK_PARAMS`, en de functie
> `pickTop` (publicabel eerst, sub-drempel vult enkel aan).

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

> Bron: `build.js` —
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
> `build.js` met 3,0.

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
| 2,0 | Randactiviteit, of een subitem onder een andere dienst |
| 1,0 | De site maakt niet duidelijk dat het bedrijf dit vak actief uitoefent |

**Lichte bonus:** +0,5 (nooit boven 5,0) bij expliciete, aantoonbare
erkenningen, certificaten of garantietermijnen in dit vak, of een lange staat van
dienst. Bij twijfel: niet verhogen.

**Geen website?** Dan krijgt het bedrijf de **mediaan-vakfocus van de bedrijven
mét website in diezelfde regio**. Niet 0 (dat zou onterecht straffen) en niet het
maximum (dat zou belonen voor het ontbreken van bewijs).

> Bron: `prompts/scoring-prompt.md`, rubriek 2; de medianenlogica staat in
> `build.js`, stap 2–3.

---

## 4. Hoeveel bedrijven tonen we?

- **≥ 10 goed onderbouwde bedrijven** in de regio → **Top 10**
- **< 10** → **Top 5**
- **< 5** → netjes wat er is, bv. "Top 3" (nooit meer tonen dan er zijn)

De grens ligt bewust op de echte **diepgang** van een regio, níet op het aantal ruwe
zoekresultaten (200 resultaten kunnen 6 echte specialisten bevatten, 40 juist 15
sterke). In **v2** telt daarvoor het aantal **publicabele** bedrijven (eligible én
≥15 reviews): we tonen alleen een Top 10 als er ook echt 10 goed onderbouwde bedrijven
zijn. In **v1** telt het aantal **eligible** bedrijven (publicatiedrempel = opname).

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

> Bron: `build.js` — `LISTED_FULL = 10`, `LISTED_SMALL = 5`,
> `SMALL_REGION_THRESHOLD = 10`, `EXTRA_MAX = 10`, `WATCHLIST_MAX = 10`.

---

## 5. Het proces van A tot Z

| Stap | Wat | Waarmee |
|---|---|---|
| 1 | Config aanmaken: vak, regio, gemeenten, zoektermen, peildatum (nieuw = v2, geen `methodiek`-veld nodig) | `config/<niche>/<slug>.json` |
| 2 | Reviews en websites scrapen | Apify (reviews-scraper + place-details) |
| 3 | Normaliseren naar één bestand | `node scripts/normalize.js apify <slug> …` → `data/<slug>/reviews.json` |
| 4 | Tekstuele beoordeling door de LLM (mét webtoegang voor de vakfocus) — **v2: 2–3 onafhankelijke runs, gemiddelde bevriezen** | `prompts/scoring-prompt.md` → `data/<slug>/beoordeling.json` — **daarna bevriezen** |
| 5 | Bouwen | `node build.js <slug>`, of veilig voor de hele site: `node build-all.js` |
| 6 | Controleren | `reports/<slug>/<slug>-rapport.txt` |

**Meerdere LLM-runs middelen (v2).** Reviewkwaliteit en vakfocus worden in v2 in
**2–3 onafhankelijke runs** gescoord (elk in 0,5-stappen); je bevriest het
**gemiddelde**, niet toevallig de eerste run. Dat halveert de effectieve stapgrootte
en middelt toevallige beoordelaarsruis uit — precies de twee subjectieve dimensies
die anders de dichtbij elkaar liggende composites zouden laten kantelen. `build.js`
aanvaardt die fijnere (niet-0,5) waarden zonder waarschuwing. In v1 was het één run
in vaste 0,5-stappen; die beoordelingen blijven bevroren.

De normalisatiestap schrijft per bedrijf alvast `recent24` en `rankbaar` mee
(gemeente in de lijst + ≥10 reviews + ≥3 recent). Dat zijn **informatieve velden
voor de LLM**, zodat die zelf geen datums hoeft te tellen — `build.js` rekent
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
  tier, slug, badge-URL's), plus per bedrijf één **aandachtspunt** (zie hieronder)

**Het aandachtspunt (outreach, niet publiek).** `badges.json` draagt per
gepubliceerd bedrijf één Nederlandse zin die benoemt wélke van de vier dimensies
zijn positie het meest vooruit zou helpen. Die zin gaat mee in de outreach-mail
(fase 6 van de werkproces-prompt) en verschijnt **nooit op de publieke pagina**.

Hij wordt **deterministisch afgeleid** uit de al berekende dimensies — er komt
géén tweede LLM-run aan te pas. Gekozen wordt de dimensie met de grootste
*gewogen speelruimte* (`gewicht × (1 − score)`): daar levert verbetering het
meeste op. Bij exact gelijke speelruimte beslist een vaste volgorde, zodat de
uitkomst reproduceerbaar is. Twee gevolgen die er toe doen:

- **Bevroren beoordelingen blijven bevroren.** Bestaande regio's krijgen hun
  aandachtspunt zonder dat `beoordeling.json` herdraaid wordt en zonder dat één
  cijfer op een gepubliceerde pagina wijzigt.
- **Het voedt niets.** De zin leest al berekende waarden; composite, selectie en
  volgorde blijven onaangeroerd.

De zin verwijst uitsluitend naar **publieke** getallen (de vier gewichten, de
halveringstijd van 2 jaar) en nooit naar interne kalibratie zoals de
publicatiedrempel of de vertrouwen-vloer. De percentages komen rechtstreeks uit
`WEIGHTS`, zodat de tekst niet kan gaan afwijken van de methodiek. De toon volgt
§6: feitelijk en constructief, nooit een negatief kwaliteitsoordeel.

> Bron: `build.js` — `aandachtspuntVoor()` in stap 8b (badge-export).

Het **controlerapport is het beste startpunt bij elke vraag** over waarom een
bedrijf ergens staat: het toont per bedrijf composite, trust, reviewkwaliteit,
recentheid, focus, Bayes, gewogen volume en reviewaantallen naast elkaar.

**Robuustheidstest (alleen in het rapport, verandert niets aan de publicatie).**
De twee subjectieve LLM-dimensies (reviewkwaliteit, vakfocus) worden op een schaal
met halve stappen gescoord; één halve stap is een reële beoordelaarsonzekerheid.
Het rapport verstoort daarom élke LLM-deelscore van élk eligible bedrijf met een
toevallige ±0,5 en telt over 5000 trials (met **vaste seed**, dus reproduceerbaar)
hoe vaak elk Top-N-bedrijf in de Top N blijft. Vertrouwen en recentheid zijn
objectief berekend en blijven onaangeroerd. Zo zie je welke posities écht vaststaan
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

## Onderhoud: 1 bron, 2 lezers

Dit document wordt door mensen én door Cowork gelezen; `build.js` en de prompts
worden door de code gedraaid. Ze mogen niet uit elkaar lopen.

**De afspraak:**

1. **De code is bindend.** Wijzigt een drempel of gewicht, dan wijzigt hij eerst
   in `build.js` (of in `prompts/scoring-prompt.md`) — en pas daarna hier.
2. **Elke wijziging aan `build.js` regels 52–112, of aan een rubriek in
   `scoring-prompt.md`, vereist een update van dit document in dezelfde beurt.**
   Werk je in Claude Code: vraag expliciet om `METHODIEK.md` mee bij te werken.
3. **Cowork wijzigt dit document niet zelfstandig inhoudelijk.** Merkt Cowork een
   afwijking, of wil je de methodiek veranderen, dan gebeurt dat via Claude Code
   in de code — waarna dit document volgt.
4. **Zet de datum bovenaan bij** ("Laatst gelijkgezet met de code") telkens je hem
   gelijkzet. Staat die datum ver in het verleden, wantrouw dit document dan en
   controleer `build.js`.

**Snelle controle** — of dit document nog klopt met de code:

```bash
sed -n '52,112p' build.js
```

Vergelijk die getallen met §2, §3 en §4 hierboven. Wijken ze af, dan is dit
document verouderd en heeft de code gelijk.
