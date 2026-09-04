# Keurwijzer — hoe de machine in elkaar zit

_Laatst gelijkgezet met de werkelijkheid: 31 augustus 2026._

Dit document geeft het vogelperspectief: welke onderdelen er zijn, waar ze staan,
en hoe ze samen van een Google-scrape naar een live pagina komen. Voor de
inhoudelijke logica — hoe bedrijven geselecteerd en gerangschikt worden — is
`METHODIEK.md` de bron. Voor de werkafspraken per taak is dat `CLAUDE.md`.

---

## In één alinea

Ruwe reviewdata wordt door een n8n-scraper naar GitHub geduwd. Op de laptop haalt
`build-all.js` die op, rekent de rangschikking uit en genereert een volledige
statische website. Diezelfde build duwt het resultaat naar een tweede GitHub-repo,
waar Cloudflare het automatisch oppikt en op `keurwijzer.be` serveert. Eén
commando dekt de hele staart: bouwen, publiceren, live.

---

## De drie plekken

### 1. De laptop — waar het denkwerk gebeurt

```
C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website\
```

Dit is de bron van waarheid. Alle logica, configuratie, data en gegenereerde
pagina's staan hier. Niets wordt vanaf GitHub gebouwd; GitHub is uitsluitend
transportmiddel.

### 2. GitHub — drie repo's met drie verschillende rollen

| Repo | Rol | Richting | Zichtbaar |
|---|---|---|---|
| `Magicworx-be/keurwijzer-data` | `registry.json` en badges buiten | uit | **publiek — moet** |
| `Magicworx-be/updated-files` | Back-up van de broncode; scrapedata binnen | beide | publiek |
| `Magicworx-be/keurwijzer-site` | De gepubliceerde website | uit | privé |

Gemeten op 4 september 2026 (onaangemelde GitHub-API: 200 = publiek, 404 = privé).

**`keurwijzer-data` moet publiek blijven.** De badges en `registry.json` worden
opgehaald via `cdn.jsdelivr.net/gh/...` en `raw.githubusercontent.com`, en die
serveren alleen publieke repo's. Zet je hem op privé, dan zijn álle badges dood —
ook die in mails die al verstuurd zijn en op sites van bedrijven. Er staan in die
repo geen mailadressen: enkel `README.md`, `badges/` en `registry.json`.

**`updated-files` mag wél op privé.** Niets leest hem automatisch. Twee dingen
moeten dan blijven werken: de SSH-push van de laptop (werkt ongewijzigd op een
privérepo) en het GitHub-token van de n8n-scraper, dat de repo uitdrukkelijk moet
mogen schrijven. **`keurwijzer-site` staat al op privé** en de site werkt — dat is
meteen het bewijs dat Cloudflare geen publieke repo nodig heeft.

### 3. Cloudflare — waar de site staat

Twee onderdelen, en ze zitten op verschillende plekken in het dashboard:

- **De zone `keurwijzer.be`** (linkermenu → Domains) beheert de DNS: welk adres
  waarheen wijst, inclusief alle mailrecords.
- **De Worker `keurwijzer-site`** (linkermenu → Compute → Workers & Pages) serveert
  de pagina's. Die heeft een eigen tabblad *Domains*, waar staat welke adressen
  hij bedient.

Kosten: nul. Verzoeken naar statische bestanden zijn bij Cloudflare gratis en
ongelimiteerd, en er zijn geen kosten voor dataverkeer.

---

## De gegevensstroom, van scrape tot live pagina

Dit is een echte volgorde — elke stap hangt van de vorige af.

1. **Status op "todo"** in de Google Sheet. Dat is het startschot.
2. **De n8n-scraper draait** en haalt via Apify de Google-plaatsen en reviews op.
3. **n8n pusht naar `updated-files`**, in `data/<slug>/` — twee bestanden per
   regio: `*-places.json` en `*-reviews.json`. (Hier stond tot 4 september 2026
   `keurwijzer-data`; dat klopt niet. Nagemeten: `keurwijzer-data` bevat enkel
   `README.md`, `badges/` en `registry.json` — geen enkele scrapefile — en de
   scrape-commits staan alleen op `updated-files/main`.)
4. **`git pull` op de laptop** haalt die data binnen.
5. **`scripts/normalize.js`** zet de Apify-export om naar `data/<slug>/reviews.json`,
   met afgeleide velden als `recent24` en `rankbaar`.
6. **De LLM-beoordeling** leest `prompts/scoring-prompt.md` en schrijft
   `data/<slug>/beoordeling.json`. Dit gebeurt één keer per regio en wordt daarna
   bevroren — alleen tekstoordelen, nooit scores of rangschikking.
7. **`build.js` rekent** — via `lib/rekenkern.js`, waar élk getal vandaan komt —
   en genereert de pagina, het controlerapport en de badge-export.
8. **`build-site.js`** maakt homepage, hubs, `sitemap.xml` en `robots.txt`.
9. **`lib/push-site.js`** duwt als **eerste** de volledige site naar
   `keurwijzer-site`. Bewust vóór de registry: de hubs vervangen hun kaarten
   clientside door de registry die jsDelivr serveert, en die mag geen pagina
   adverteren die Cloudflare nog niet live heeft — anders linkt de hub een tot
   drie minuten naar een 404. Door de site eerst te publiceren staat de
   detailpagina er al voordat de registry ernaar verwijst.
10. **`lib/push-registry.js`** duwt dáárna `registry.json` naar `keurwijzer-data`
    en leegt de jsDelivr-cache.
11. **`lib/push-badges.js`** publiceert als laatste de kwaliteitsbadges (gemaakt
    door `scripts/genereer-badges.js`, meteen na `build.js`), ook naar
    `keurwijzer-data`.
12. **Cloudflare bouwt automatisch** bij elke push en zet de nieuwe versie live —
    ongeveer 30 seconden later staat alles op `keurwijzer.be`.

Stap 4 tot en met 12 zitten in één commando:

```
node build-all.js
```

### Zijstroom: WhatsApp-nummers

Los van de scrape-keten, en sinds 2 september 2026 bewust **niet meer volautomatisch**:
Olivier start de ronde zelf (zie hieronder). De enige bron is de mailbox — wat een
bedrijf zelf doorgeeft in zijn antwoord op de outreachmail. De private Google Sheet is
hiervoor sinds 1 september 2026 buiten gebruik en wordt niet meer gelezen.

Sinds 2 september 2026 gebeurt dat werk **in een gesprek, niet vanzelf**. Olivier draait
's ochtends zelf één opdracht:

    /keurwijzer-mails

Die ene ronde doet alles: antwoorden opzoeken, per antwoord een **concept** klaarzetten
(nooit versturen), een doorgegeven nummer noteren in `data/whatsapp.json`, `node
build-all.js` draaien als er écht iets nieuws bij staat, live controleren dat de knop op
keurwijzer.be staat, en de Gmail-labels bijwerken. De instructie staat in
`.claude/skills/keurwijzer-mails/SKILL.md`.

Daarnaast draait één geplande taak, `keurwijzer-mailwacht` (weekdagen 08u15 en 15u15).
Die is bewust een **deurbel**: ze zoekt in Gmail, telt hoeveel antwoorden er wachten, en
stuurt in dat geval één melding "draai /keurwijzer-mails". Ze maakt geen concepten, zet
geen labels, leest geen bestanden en draait geen commando's. Wachten er nul, dan stuurt
ze niets.

#### Het WhatsApp-bericht dat op de bevestigingsmail volgt

Sinds 4 september 2026 hoort er één kort WhatsApp-bericht bij een nummer dat live gaat.
Olivier stuurt de bevestigingsmail ("Ik heb je WhatsApp-nummer toegevoegd"); een uur later
staat het bericht klaar.

Klaar, niet verstuurd. `scripts/whatsapp-nabericht.js` zoekt die mail in Gmail, wacht het
uur af en mailt Olivier één `wa.me`-link per bedrijf. Hij tikt de link aan op zijn
telefoon, WhatsApp opent met de tekst er al in, hij drukt op verzenden.

Op de laptop zit er bij een `wa.me`-link nog een scherm van WhatsApp zelf tussen. Daarom
schrijft het script er `reports/whatsapp-berichten.html` bij: één knop per bedrijf, met een
`whatsapp://`-link die WhatsApp Desktop meteen opent. Zo'n link werkt niet vanuit een mail
(Gmail maakt er geen klikbare link van), vandaar dat losse bestand. Het wordt elke ronde
overschreven, staat niet in git, en is géén logboek — dat blijft `data/outreach.json`. Zelf versturen zou
de WhatsApp Business Platform van Meta vergen — goedgekeurd sjabloon, apart nummer, kost
per bericht — en het bedrijf gaf zijn nummer om op de pagina te zetten, niet om er
berichten van Keurwijzer op te ontvangen.

Dit is een **programma, geen geplande Claude-taak**, en om precies de reden die hieronder
staat: een onbemande beurt hangt op de eerste toestemmingsvraag. Het draait dus via de
Windows-taakplanner, met `scripts/whatsapp-nabericht.cmd` als startpunt, en het gebruikt
dezelfde Google-sleutel uit `.env` als `scripts/whatsapp-routine.js` — één keer opzetten
met `node scripts/google-toegang.js`. De gedeelde mailbox-code staat in `lib/gmail.js`.

De rem staat in het logboek: `alNabericht()` in `lib/outreach.js`. Eén bericht per bedrijf,
nooit twee — op WhatsApp weegt dat zwaarder dan in een postvak.

#### Waarom het niet meer vanzelf gaat

Tot 2 september 2026 deden twee onbemande taken het volledige werk: `keurwijzer-replies`
(elk uur) en `keurwijzer-whatsapp-dagelijks` (vier keer op een avond). Ze liepen dagen na
elkaar vast, telkens op iets anders. De oorzaak was elke keer dezelfde: een onbemande
beurt die een commando of tool gebruikt dat niet vooraf is toegestaan, blijft hangen op
een toestemmingsvraag die niemand beantwoordt. Zo'n beurt blokkeert alle volgende.

Het patroon was niet te repareren met nog een regel op de lijst. Een instructie kan
onmogelijk elk commando opsommen dat een beurt ooit zou kunnen bedenken — de laatste
beurt, op 2 september om 10u04, verzon een eigen `node -e` om `badges.json` uit te lezen
en hing dáárop, nadat alle acht Gmail-opdrachten wél gelukt waren.

De oplossing is de vorm, niet de details: **het kwetsbare werk gebeurt waar Olivier bij
zit** (daar is een toestemmingsvraag één klik), en **alleen het onfeilbare stuk blijft
automatisch** (Gmail doorzoeken en een melding sturen — precies het deel dat nooit is
stukgegaan). Het verlies is klein: de taken verstuurden zelf nooit iets, ze zetten alleen
concepten klaar. Olivier was altijd al het moment van versturen.

Een gevolg is dat noteren en publiceren nu in dezelfde ronde gebeuren. Vroeger noteerde
de uurtaak een nummer en zette de avondtaak het pas uren later live; nu staat het nummer
live vóór Olivier het antwoord verstuurt — wat precies de bedoeling was van de wachtstand
*2. Wacht op WhatsApp*.

De losse Windows-taak `Keurwijzer watchdog` (elke 10 min, 07-22u) blijft draaien. Ze
sluit een taakrun af die meer dan tien minuten stilligt én nog op een tool-antwoord
wacht. Er is nu veel minder voor haar te doen, maar ze vangt de deurbel op als die ooit
zou blijven hangen. Zie `scripts/watchdog-taken.js`.

#### Het outreach-logboek

`data/outreach.json` is sinds 4 september 2026 de bindende bron voor **wat er al gedaan
is**: per bedrijf of mail 1 vertrok, of er geantwoord is en wat voor soort antwoord, of
er een opvolgmail klaarstaat of verstuurd is, of er een WhatsApp-nummer of badge gevraagd
is, en of Olivier het gesprek zelf voert. Gmail blijft de waarheid over de mails zelf;
het logboek is de waarheid over de stand van zaken.

Daarvóór was er niets: elke ronde leidde uit een Gmail-zoekopdracht opnieuw af wat er te
doen was. Dat kostte honderden tool-calls, het faalde stil (op 3 september stierf een
deurbel-run op een API-fout en bleef een antwoord vijf uur liggen), en het gaf
tegenstrijdige uitkomsten — Tectora en EPDMshop kregen elk twee drafts.

Het logboek **staat niet in git**: er staan mailadressen in en de repo's zijn publiek
leesbaar. Het wordt lokaal aangelegd en bijgewerkt:

| Commando | Doet |
|---|---|
| `node scripts/outreach-seed.js` | legt het logboek aan of vult nieuw gepubliceerde bedrijven bij |
| `node scripts/outreach-lijst.js` | de werklijst: `--zelf`, `--opvolg`, `--nieuw`, `--nummer-open`, `--badge-open`, `--bedrijf "<naam>"` |
| `node scripts/deurbel.js --vraag` | drukt de Gmail-zoekopdracht af die alleen nieuws kan opleveren |
| `node scripts/deurbel.js --verwerk <bestand>` | beslist mens-of-machine in code en werkt het logboek bij |
| `node scripts/outreach-dashboard.js` | maakt `reports/outreach-dashboard.html` om te bekijken |

**Rijen met `historisch: true`** zijn de 133 bedrijven die vóór 8 september 2026 al
benaderd waren, in de weken waarin de mails met de hand geschreven werden en de
onderwerpregel drie keer veranderde. Van hen weet het logboek dát ze benaderd zijn, niet
wanneer of met welk resultaat — dat staat alleen in Gmail. Ze krijgen daarom nooit
opnieuw een kennismakingsmail. Alles vanaf die datum wordt wél volledig gelogd.

De koppeling tussen een binnenkomend antwoord en een bedrijf loopt over drie sleutels, in
die volgorde: het thread-ID, het genoteerde mailadres, en anders het **websitedomein** uit
`data/<slug>/reviews.json` (info@heitodakwerken.be hoort bij heitodakwerken.be). Gedeelde
postbussen — gmail, telenet, outlook — koppelen bewust aan niemand. Lukt geen van drieën,
dan meldt de deurbel "afzender onbekend" in plaats van te gokken.

#### De werklijst in Gmail

De ronde houdt Oliviers werklijst bij als **Gmail-labels**, zodat een leeg mapje "niets
meer te doen" betekent: *Keurwijzer/1. Verzenden* (concept klaar), *2. Wacht op WhatsApp*
(nummer genoteerd maar nog niet live — hij raakt die mail bewust niet aan) en *3. Zelf
antwoorden*. Het label verdwijnt zodra Olivier zelf geantwoord heeft. Een thread gaat van
2 naar 1 zodra het nummer echt op de pagina staat. Outreach-concepten blijven ongelabeld
— die verstuurt Olivier zelf in batches.

`build.js` leest enkel `data/whatsapp.json`. Bij de volgende build verschijnt de link
op de kaart van dat bedrijf — ook op pagina's die al maanden live staan, want alle
pagina's worden bij elke build volledig opnieuw gegenereerd. De bedrijfsnaam moet
exact overeenkomen met die in `data/<slug>/reviews.json`; klopt hij niet, dan wordt
die hele regiopagina overgeslagen. Zie `METHODIEK.md` §7 en `WIJZIGINGEN.md` §13.

---

## Hoe de site-repo eruitziet

`lib/push-site.js` geeft `keurwijzer-site` bij elke publicatie dezelfde vaste vorm.
Handmatig bewerken heeft geen zin — het wordt overschreven.

```
keurwijzer-site/
├── public/              ← alles wat Cloudflare serveert
│   ├── index.html                     de homepage
│   ├── <niche>/index.html             niche-hub
│   ├── regio/<regio>/index.html       regio-hubs
│   ├── <slug>/index.html              detailpagina's
│   ├── sitemap.xml, robots.txt, registry.json
│   └── _headers                       caching en beveiliging
├── wrangler.jsonc       ← wijst Cloudflare naar public/
└── README.md
```

Wat gepubliceerd wordt, komt uit de registry — niet uit "alles wat in `output/`
staat". Testmappen en Windows-rommel als `desktop.ini` liften daardoor nooit mee.

---

## Wat er op Cloudflare geregeld is

**Nameservers** staan op `anirban.ns.cloudflare.com` en `lilith.ns.cloudflare.com`.
De domeinnaam zelf staat nog bij Combell; alleen het DNS-beheer is verhuisd.

**Twee Worker-records** bedienen de site: `keurwijzer.be` en `www.keurwijzer.be`.
Die zijn *proxied* — dat hoort zo.

**Alle mailrecords staan op DNS only** en moeten dat blijven. Zet je een
mailrecord op *proxied*, dan breekt de mail: Cloudflare verwerkt alleen
webverkeer, en mailprogramma's krijgen dan de verkeerde server te zien.

| Type | Naam | Waarde |
|---|---|---|
| MX 10 / 50 | keurwijzer.be | mx.mailprotect.be / mx.backup.mailprotect.be |
| TXT | keurwijzer.be | SPF: `v=spf1 mx a include:_spf.relay.mailprotect.be ~all` |
| TXT | keurwijzer.be | google-site-verification (Search Console) |
| TXT | _dmarc | `v=DMARC1;p=none;` |
| CNAME | mail | pop3.mailprotect.be |
| CNAME | autodiscover | autodiscover.mailprotect.be |
| CNAME | autoconfig | autoconfig.mailprotect.be |
| SRV | _imaps / _pop3s / _submission | imap / pop / smtp-auth bij mailprotect |

**Testadres:** `keurwijzer-site.olivier-ceb.workers.dev` toont dezelfde site zonder
het echte domein te raken. Handig om iets te bekijken voor je erover oordeelt.

**Terugweg naar de oude hosting**, mocht dat ooit nodig zijn: verwijder de twee
Worker-records en zet `A keurwijzer.be → 162.159.140.166` en
`CNAME www → sites.ludicrous.cloud` terug, allebei op DNS only.

---

## De bestanden op de laptop

| Pad | Rol |
|---|---|
| `lib/rekenkern.js` | De rekenkern: constanten, methodiek-versies, eligibility, dimensies, composite, selectie. Zonder I/O, dus los te testen. Bindend voor alle getallen. |
| `build.js` | Leest de data, laat de rekenkern rekenen, bewaakt het selectieslot en rendert pagina, rapport en prospectie. |
| `test/` | `npm test` — golden-tests op de 16 live pagina's, randgevallen en de methodiek-versies. |
| `build-site.js` | Homepage, hubs, sitemap, robots.txt. |
| `build-all.js` | Bouwt alles en publiceert. Het veilige eindcommando. |
| `lib/registry.js` | Leidt navigatie en sitemap af uit de configs. |
| `lib/push-site.js` | Publiceert de site naar `keurwijzer-site`. |
| `lib/push-registry.js` | Publiceert `registry.json` naar `keurwijzer-data`. |
| `lib/push-badges.js` | Publiceert de badges naar `keurwijzer-data`. |
| `scripts/normalize.js` | Apify-export → `data/<slug>/reviews.json`. |
| `scripts/genereer-badges.js` | Rendert de kwaliteitsbadges als PNG. |
| `config/<niche>/<slug>.json` | Vak, regio, gemeentelijst, peildatum. |
| `data/<slug>/` | Ruwe scrape, genormaliseerde reviews, beoordeling. |
| `data/whatsapp.json` | Doorgegeven WhatsApp-nummers. Wordt automatisch bijgewerkt uit de mailbox. |
| `data/lastmod.json` | Per pagina de md5 van de laatste build en de datum waarop die veranderde. Voedt de sitemap-`lastmod`. Niet met de hand bijwerken. |
| `reports/whatsapp-dagelijks.json` | Restant van de oude avondtaak (verwijderd op 2 september 2026). Wordt door niets meer gelezen of geschreven. |
| `lib/whatsapp.js` | Leest en controleert die nummers; maakt de `wa.me`-link. |
| `prompts/scoring-prompt.md` | Rubrieken voor de LLM-beoordeling. |
| `prompts/directory-page-emails-prompt.md` | Het canonieke werkproces, Fase 0–7 (0–6 = bouwen en outreach, 7 = opvolgmails bij stilte). |
| `template.html`, `hub.html`, `homepage.html` | De paginasjablonen. |
| `output/` | De gebouwde site. Wordt elke build opnieuw gemaakt. |
| `reports/<slug>/` | Controlerapport en intern prospectiedocument. Niet publiceren. |
| `METHODIEK.md` | De selectie- en rangschikkingslogica, leesbaar. |
| `WIJZIGINGEN.md` | Waarom-beslissingen, chronologisch. |

`output/`, `badges/` en `.env` staan bewust niet in versiebeheer: de eerste twee
zijn herbouwbaar, de derde bevat geheimen.

---

## De drie gemeentelijsten — waarom ze niet gelijk zijn

Er bestaan drie lijsten van gemeenten per regio. Ze lijken op elkaar, maar doen
verschillende dingen en mogen daarom van elkaar verschillen. Zet ze niet gelijk
zonder te weten wat je stukmaakt.

| Lijst | Waar | Waarvoor | Vorm |
|---|---|---|---|
| Zoekgebied | `Apify scrape/geolocation.txt` (`REGIONS`) | Bepaalt waar de scraper zoekt | Vrije namen; polygoon + 3 km buffer |
| Publicatielijst | `new page - how to/regions.txt` | De 29 regio's en de "binnenkort"-kaarten | **Officiële fusienamen** |
| Opnamefilter | `config/<niche>/<slug>.json` → `gemeenten` | Wie op de pagina mag | **Alle schrijfwijzen** |

**Zoekgebied.** `geolocation.txt` vraagt per naam de grens op bij OpenStreetMap,
plakt ze aan elkaar en legt er 3 km omheen. Die buffer is er bewust: bedrijven aan
de rand van een gemeente vielen anders weg. Gevolg is dat een scrape altijd ook
bedrijven uit buurregio's oplevert — dat is normaal, het opnamefilter zeeft ze eruit.

Deze lijst gebruikt voor vijf fusiegemeenten nog de namen van vóór 2025 (Beveren,
Kruibeke, Zwijndrecht; Merelbeke, Melle; Nazareth, De Pinte; Bilzen, Hoeselt;
Tongeren, Borgloon). OSM geeft daarvoor enkel de dorpskern terug in plaats van de
hele gemeente. **Gemeten op de echte polygonen is dat geen probleem:** de buffer en
de buurgemeenten in dezelfde regio vullen het op. Van 20 geteste plaatsen in het
Waasland vielen alleen Doel en Prosperpolder buiten het zoekgebied — polder- en
havengebied zonder vakbedrijven. Laat deze lijst dus met rust tenzij je een concreet
gat kunt aantonen.

**Publicatielijst.** `regions.txt` is de bindende lijst van de 29 regio's. Hier
horen wél de officiële fusienamen, want het aantal gemeenten per regio verschijnt
op de publieke "binnenkort"-kaart. Elke gemeente mag hier in precies één regio
staan. Sinds augustus 2026: 285 gemeenten, geen dubbels.

**Opnamefilter.** De gemeentelijst in de config beslist wie op de pagina mag, door
te vergelijken met wat Google in het adres schrijft. Neem hier **alles** op: de
fusienaam, de oude namen én de deelgemeenten. Dat is geen slordigheid maar een
vangnet — Google is niet consequent. In de scrape van Sint-Niklaas staat 39 keer
"Beveren-Kruibeke-Zwijndrecht" en 1 keer "Beveren"; met alleen de oude namen zou je
er 39 verliezen. `dakwerkers-sint-niklaas.json` is het voorbeeld om na te volgen.

---

## Configuratie

`.env` staat niet in versiebeheer en moet na een herinstallatie opnieuw gemaakt worden.

| Sleutel | Waarvoor |
|---|---|
| `GITHUB_TOKEN` | Toegang tot alle drie de repo's |
| `GITHUB_REPO` | `Magicworx-be/keurwijzer-data` |
| `GITHUB_SITE_REPO` | `Magicworx-be/keurwijzer-site` |
| `CF_PROJECT_NAME` | Optioneel; standaard de repo-naam |
| `BADGE_BASE_URL`, `SEAL_MODE` | Optioneel, voor de badges |

De token is *fine-grained* en moet toegang hebben tot alle drie de repo's. Krijg je
bij het publiceren een `403 Write access to repository not granted`, dan ontbreekt
een repo in de lijst van die token.

---

## Wat er stilletjes kan stukgaan

**De GitHub-token verloopt.** `keurwijzer-push` verloopt op **17 november 2026**.
Daarna mislukt het publiceren met een 403. De build zelf blijft werken — alleen de
laatste stap valt weg.

**Google Drive vervuilt de git-map.** De projectmap wordt gesynchroniseerd door
Google Drive File Stream, dat in elke map een `desktop.ini` plaatst — ook binnenin
`.git`. Die in `.git/refs/` breken git, want daar wordt elk bestand als een
verwijzing gelezen. Symptoom: `fatal: bad object refs/desktop.ini`. Oplossing:

```
find .git -name "desktop.ini" -type f -delete
```

De duurzame oplossing is de projectmap buiten Google Drive zetten, of `.git`
uitsluiten van synchronisatie.

**~~De sitemap zet één datum voor alles.~~ Verholpen op 3 september 2026.**
`lastmod` kreeg bij elke build de datum van die dag, voor álle pagina's, ook de
ongewijzigde — wie zonder inhoudelijke wijziging bouwde, meldde zoekmachines ten
onrechte dat alles was bijgewerkt. `build-site.js` houdt nu in `data/lastmod.json`
per pagina de md5 van `output/<slug>/index.html` bij en schuift de datum alleen op
als die md5 verandert; hubs en homepage erven de jongste datum van wat eronder
hangt. In dezelfde beweging zijn de twee andere builddatums uit de uitvoer gehaald
(het commentaarblok bovenaan elke pagina en de kopregel van de prospectie-
documenten dragen nu de peildatum), zodat een build op een nieuwe dag geen enkel
bestand meer verandert dat inhoudelijk gelijk bleef.

---

## Wat waar te vinden is

| Wat | Waar |
|---|---|
| De live site | https://keurwijzer.be |
| Testversie | https://keurwijzer-site.olivier-ceb.workers.dev |
| DNS en mailrecords | Cloudflare → Domains → keurwijzer.be → DNS |
| Bouwlogboek van de site | Cloudflare → Compute → Workers & Pages → keurwijzer-site |
| Domeinnaam en nameservers | Combell → Domain name → Name servers |
| Mailhosting | mailprotect.be (via Combell) |
