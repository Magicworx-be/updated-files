# 00 — Handmatige stappen voor Olivier

Dit zijn geen Claude-opdrachten. Claude mag geen repo-instellingen, DNS of
Cloudflare-instellingen wijzigen. Je kunt wel een sessie openen en zeggen
"begeleid me bij opdrachten/00-handmatig-olivier.md"; die kan dan per stap meekijken
en achteraf controleren of het gelukt is.

## A. De broncode-repo op privé zetten (vandaag)

**Waarom.** `Magicworx-be/updated-files` is publiek. Daarin staan de 16
prospectiedocumenten ("Intern document. Niet publiceren"), `data/whatsapp.json` met
nummers en mailcitaten van bedrijven, alle beoordelingen en de scoringsprompt.
Gecontroleerd op 3 september 2026 zonder token: HTTP 200.

**Stappen.**

1. Ga naar https://github.com/Magicworx-be/updated-files
2. Klik op het tabblad **Settings** (rechts bovenaan, naast "Insights").
3. Scrol helemaal naar beneden tot het rode kader **Danger Zone**.
4. Bij **Change repository visibility** klik je op **Change visibility** en kies je
   **Make private**. GitHub vraagt om de repo-naam te typen ter bevestiging.
   Let op: de knop eronder, **Archive this repository**, is een andere knop.
   Niet die.

**Controle achteraf.** Open https://github.com/Magicworx-be/updated-files in een
privévenster (zonder ingelogd te zijn). Je moet een 404 zien.

**Waarschuwing.** De n8n-scraper pusht zijn resultaten naar precies deze repo
(niet naar keurwijzer-data, zoals ARCHITECTUUR.md ten onrechte zegt). De token die
n8n gebruikt moet dus toegang hebben tot een privérepo. Zet de eerstvolgende regio
op "todo" en controleer dat de scrape-commit verschijnt. Verschijnt hij niet, dan
moet in n8n de GitHub-credential vervangen worden door een token met toegang tot
`updated-files`.

## B. De vergeten branch `source` verwijderen op keurwijzer-data (vandaag)

**Waarom.** `keurwijzer-data` moet publiek blijven (jsDelivr serveert er de badges
en registry.json uit). Maar er staat een branch `source` van 25 augustus met vijf
prospectiedocumenten, de prompts en beoordelingen.

**Stappen.**

1. Ga naar https://github.com/Magicworx-be/keurwijzer-data/branches
2. Zoek de rij **source**. Klik op het prullenbak-icoon rechts in die rij.
3. Bevestig. De branch **main** laat je met rust.

**Controle achteraf.** Op dezelfde pagina staat alleen nog `main`.

## C. E-mailauthenticatie voor magicworx.net (deze week)

**Waarom.** Alle outreach vertrekt van olivier@magicworx.net via Google Workspace.
Gemeten op 3 september 2026: geen DKIM-record, geen DMARC-record, en de SPF-regel
(`v=spf1 mx a include:_spf.relay.mailprotect.be ~all`) noemt Google niet. Bij
honderden mails per dag belandt dat in spam en beschadigt het ook je gewone mail.

**Stap 1: DKIM aanzetten in Google.**

1. Ga naar https://admin.google.com
2. Linkermenu **Apps** → **Google Workspace** → **Gmail**.
3. Klik op **E-mail verifiëren** (Engels: *Authenticate email*).
4. Kies het domein **magicworx.net** en klik **Nieuw record genereren**
   (*Generate new record*). Laat de standaardinstellingen staan (2048 bits,
   selector `google`).
5. Google toont een **hostnaam** (`google._domainkey`) en een lange **TXT-waarde**.
   Laat dit venster open.

**Stap 2: drie records in de DNS van magicworx.net.** Waar de DNS van
magicworx.net beheerd wordt, kon ik niet zien (mogelijk Combell, mogelijk
elders). Daar voeg je toe:

| Type | Naam | Waarde |
|---|---|---|
| TXT | `google._domainkey` | de waarde uit stap 1 |
| TXT | `@` (bestaande SPF-regel aanpassen) | `v=spf1 mx a include:_spf.google.com include:_spf.relay.mailprotect.be ~all` |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:olivier@magicworx.net` |

Vervang de bestaande SPF-regel; maak er geen tweede naast, twee SPF-records
maken SPF ongeldig.

**Stap 3: terug in Google Admin**, bij het venster van stap 1, klik
**Verificatie starten** (*Start authentication*). Dat kan tot 48 uur duren.

**Controle achteraf.** Zeg in een Claude-sessie: "controleer DKIM, SPF en DMARC
van magicworx.net". De drie records moeten dan gevonden worden.

## D. Cloudflare: één adres voor de site (deze week)

**Waarom.** http://keurwijzer.be, https://www.keurwijzer.be en
keurwijzer-site.olivier-ceb.workers.dev tonen alle drie de site met status 200 en
zonder doorsturing. Zoekmachines zien vier adressen voor één site.

1. https://dash.cloudflare.com → **keurwijzer.be** → linkermenu **SSL/TLS** →
   **Edge Certificates** → zet **Always Use HTTPS** aan en **Enable HSTS** aan
   (bij HSTS: Max Age 6 maanden, de andere vinkjes uit laten).
2. Linkermenu **Rules** → **Redirect Rules** → **Create rule**. Naam: `www naar
   apex`. Voorwaarde: *Hostname* *equals* `www.keurwijzer.be`. Actie: *Dynamic*,
   expressie `concat("https://keurwijzer.be", http.request.uri.path)`, status
   **301**. Opslaan en activeren.
3. Linkermenu **Compute** → **Workers & Pages** → **keurwijzer-site** → tabblad
   **Settings** → **Domains & Routes**. Bij de regel `keurwijzer-site.olivier-ceb.workers.dev`
   op de drie puntjes en **Disable**. De twee regels voor keurwijzer.be en
   www.keurwijzer.be laat je staan.

**Controle achteraf.** Zeg in een Claude-sessie: "controleer de redirects van
keurwijzer.be". http en www moeten een 301 geven naar https://keurwijzer.be, en
het workers.dev-adres een fout.

## E. Agenda: GitHub-token verloopt op 17 november 2026

De token `keurwijzer-push` verloopt dan. Daarna faalt publiceren met een 403; de
build zelf blijft werken. Zet een herinnering op **1 november 2026**: nieuwe
fine-grained token aanmaken met toegang tot de drie repo's, en de waarde in `.env`
vervangen. Opdracht 01 bouwt intussen een waarschuwing in die 30 dagen vooraf
meldt.
