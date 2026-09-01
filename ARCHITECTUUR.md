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

| Repo | Rol | Richting |
|---|---|---|
| `Magicworx-be/keurwijzer-data` | Scrapedata binnen; `registry.json` en badges buiten | beide |
| `Magicworx-be/updated-files` | Back-up van de broncode | uit |
| `Magicworx-be/keurwijzer-site` | De gepubliceerde website | uit |

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
3. **n8n pusht naar `keurwijzer-data`**, in `data/<slug>/` — twee bestanden per
   regio: `*-places.json` en `*-reviews.json`.
4. **`git pull` op de laptop** haalt die data binnen.
5. **`scripts/normalize.js`** zet de Apify-export om naar `data/<slug>/reviews.json`,
   met afgeleide velden als `recent24` en `rankbaar`.
6. **De LLM-beoordeling** leest `prompts/scoring-prompt.md` en schrijft
   `data/<slug>/beoordeling.json`. Dit gebeurt één keer per regio en wordt daarna
   bevroren — alleen tekstoordelen, nooit scores of rangschikking.
7. **`build.js` rekent** en genereert de pagina. Alle getallen komen hiervandaan.
8. **`build-site.js`** maakt homepage, hubs, `sitemap.xml` en `robots.txt`.
9. **`lib/push-registry.js`** duwt `registry.json` naar `keurwijzer-data` en leegt
   de jsDelivr-cache.
10. **`scripts/genereer-badges.js` + `lib/push-badges.js`** maken en publiceren de
    kwaliteitsbadges, ook naar `keurwijzer-data`.
11. **`lib/push-site.js`** duwt de volledige site naar `keurwijzer-site`.
12. **Cloudflare bouwt automatisch** bij elke push en zet de nieuwe versie live —
    ongeveer 30 seconden later staat alles op `keurwijzer.be`.

Stap 4 tot en met 12 zitten in één commando:

```
node build-all.js
```

### Zijstroom: WhatsApp-nummers

Los van de scrape-keten en **volledig geautomatiseerd**: er is geen handmatige stap.
De enige bron is de mailbox — wat een bedrijf zelf doorgeeft in zijn antwoord op de
outreachmail. De private Google Sheet is hiervoor sinds 1 september 2026 buiten
gebruik en wordt niet meer gelezen.

Twee geplande taken doen samen het werk:

| Taak | Wanneer | Wat |
|---|---|---|
| `keurwijzer-replies` | elk uur, 07-18u | Leest nieuwe antwoorden, zet een reply klaar als **concept** (verstuurt nooit zelf) en **noteert** een doorgegeven nummer in `data/whatsapp.json`. Bouwt en publiceert nooit. |
| `keurwijzer-whatsapp-dagelijks` | elke avond 18u30, 19u30, 20u30 en 21u30 | Leest de mailbox nog eens, breder, als vangnet. Draait `node build-all.js` **alleen als er echt iets nieuws bij staat**, controleert daarna live op keurwijzer.be of de knop er is, en **mailt Olivier een overzicht**. De drie latere beurten stoppen meteen als de avond al gelukt is. |

Die splitsing is bewust: noteren mag elk uur, publiceren niet. Een build
zonder inhoudelijke wijziging zet in `sitemap.xml` voor álle pagina's de datum van
vandaag — zie "Wat er stilletjes kan stukgaan" verderop.

Beide taken houden Oliviers werklijst bij als **Gmail-labels**, zodat een leeg mapje
"niets meer te doen" betekent: *Keurwijzer/1. Verzenden* (draft klaar), *2. Wacht op
WhatsApp* (nummer genoteerd maar nog niet live — hij raakt die mail bewust niet aan) en
*3. Zelf antwoorden*. De uurtaak labelt en ontlabelt zodra Olivier geantwoord heeft; de
avondtaak verplaatst een thread van 2 naar 1 zodra het nummer echt op de pagina staat.
Outreach-concepten blijven ongelabeld — die verstuurt Olivier zelf in batches.

Daarnaast draait `Keurwijzer watchdog` als losse Windows-taak (elke 10 min, 07-22u).
Die sluit taakruns af die meer dan tien minuten stilliggen: zonder die opruiming
blokkeert één vastgelopen beurt alle volgende, en blijft een antwoord van een bedrijf
uren onbeantwoord. Zie `scripts/watchdog-taken.js`.

#### Waarom de avondtaak vier keer start

De watchdog **sluit** een vastgelopen beurt af, maar **herstart** hem niet. Voor de
uurtaak geeft dat niets — een uur later komt de volgende. Maar zolang de avondtaak maar
één keer per dag startte, kostte één vastgelopen beurt de hele dag. Dat gebeurde op
1 september 2026: de beurt van 18u30 bleef hangen op een Gmail-opdracht die nooit
antwoordde, en een bevestigd nummer bleef die avond offline.

Daarom start de avondtaak nu vier keer, en houdt ze in `reports/whatsapp-dagelijks.json`
bij hoe ver ze geraakt is:

| In de markering staat | Wat de volgende beurt doet |
|---|---|
| datum van vandaag, `gemaild: true` | meteen stoppen — geen Gmail, geen build, geen mail |
| datum van vandaag, `status: "gepubliceerd"`, `gemaild: false` | alleen nog de overzichtsmail versturen |
| oudere datum, of bestand ontbreekt | de volledige ronde draaien |

Twee gedragsregels in beide taken houden de kans op vastlopen klein: **Gmail-opdrachten
één voor één** (nooit twee in dezelfde beurt — de beurt van 1 september struikelde
precies daarover) en **`list_labels` nooit aanroepen**, want de label-ID's staan al in
de instructie zelf.

#### De dagelijkse overzichtsmail

Na een geslaagde ronde mailt de avondtaak naar olivier@magicworx.net: per toegevoegd
nummer het bedrijf, de regiopagina, het nummer en uit welke mail het kwam, plus welke
threads uit de wachtstand mochten. **Ook op een avond zonder nieuwe nummers gaat die
mail uit**, met één zin. Dat is met opzet: blijft de mail helemaal weg, dan is dat het
signaal dat de routine niet gedraaid heeft. Het is de enige controle erop, en Olivier
hoeft er niets voor te openen.

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
| `build.js` | Rekenmotor en paginagenerator. Bindend voor alle getallen. |
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
| `reports/whatsapp-dagelijks.json` | Markering van de avondtaak: hoe ver ze vanavond geraakt is, zodat een herkansing weet wat er nog moet. |
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

**De sitemap zet één datum voor alles.** `lastmod` krijgt bij elke build de datum
van die dag, voor álle pagina's, ook de ongewijzigde. Bouw je zonder inhoudelijke
wijziging, dan meld je zoekmachines ten onrechte dat alles is bijgewerkt.

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
