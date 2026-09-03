# 09 — Ruwe scrapes uit git: eerst kiezen, dan bouwen

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md` (regel "Ruwe scrapedata: git is het transportkanaal"),
`ARCHITECTUUR.md` (gegevensstroom en § Configuratie), `.gitignore`,
`docs/scope-01-apify-scraper.md`, `docs/scope-02-apify-scraper-fixes.md`,
`scripts/normalize.js`, `scripts/detecteer-nieuwe-regios.js` en
`.claude/skills/nieuwe-regio-verwerken/SKILL.md`. Antwoord in het Nederlands.

## Wat gemeten is (3 september 2026)

- **De n8n-scraper pusht naar `Magicworx-be/updated-files`** (de broncode-repo),
  niet naar `keurwijzer-data` zoals `ARCHITECTUUR.md` regel 14 en 63 zeggen.
  Bewijs: commits "Scrape: dakwerkers-mechelen (2026-09-01)" enz. staan op
  `updated-files/main`; `origin/main` (keurwijzer-data) bevat geen `data/`-map.
- Getrackt in git: 200 MB werkboom voor 16 regio's, 49 ruwe bestanden, pack 76 MB.
  Grootste blob 37,6 MB (Antwerpen reviews). Gemiddeld 12,5 MB per slug.
- Extrapolatie naar 675 slugs: ±8 GB werkboom, 2,5 tot 3 GB pack, ver boven wat
  GitHub aanraadt (1 GB) en richting de grens waarop GitHub contact opneemt
  (5 GB). Een review-rijke niche in Antwerpen kan de 100 MB-per-bestand-grens
  raken. De jaarlijkse herscrape voegt elk jaar een nieuwe set toe; git gooit
  nooit iets weg.
- Alleen `data/<slug>/reviews.json` en `beoordeling.json` zijn nodig om te bouwen
  (CLAUDE.md). De ruwe bestanden worden na `normalize.js` nooit meer gelezen.
- Extra ballast in de historie: `data/_test/large-test.json` (14 MB, "safe to
  delete"), Sint-Niklaas- en Aalst-scrapes van 27 augustus die nooit verwerkt
  zijn (17 MB), en `data/dakwerkers-oudenaarde/apify-places.json` (3,2 MB) dat
  eigenlijk Sint-Niklaas-data is.

## Stap 1: de keuze voorleggen (AskUserQuestion, één vraag)

De projectregel zegt "nooit untracken". Die regel bestaat omdat git het
transportkanaal is; het transport kan ook anders. Leg Olivier drie opties voor,
elk met wat er in n8n moet veranderen (hij beheert n8n, jij niet):

- **A. n8n normaliseert zelf en pusht enkel `reviews.json`** (klein: ±1 MB per
  regio). `normalize.js` verhuist naar een n8n-Code-node of naar een klein
  Node-script dat n8n via een webhook op de laptop aanroept. Ruwe export blijft
  als Apify-dataset bewaard (Apify bewaart ze standaard 7 dagen; verlengen kan).
  Voordeel: eenvoudigste laptopkant. Nadeel: normalisatielogica leeft buiten de
  repo of vergt een tweede pad.
- **B. n8n zet de ruwe bestanden op Cloudflare R2** (of GitHub Releases) en pusht
  naar de repo alleen een klein `data/<slug>/scrape.json` met URL, datum en
  sha256. `scripts/normalize.js` haalt het ruwe bestand op via die URL. Repo
  blijft klein, ruwe data blijft beschikbaar. Nadeel: één extra dienst (R2 is
  gratis tot 10 GB).
- **C. Aparte scrape-repo per niche** (`keurwijzer-scrapes-<niche>`), n8n pusht
  daarheen, de laptop haalt op met een shallow clone. Geen nieuwe dienst, maar
  25 repo's en dezelfde groeikwaal per repo.

Aanbeveling: B. Bouw wat Olivier kiest; stop na de vraag als hij wil overleggen.

## Stap 2: bouwen (laptopkant) en beschrijven (n8n-kant)

1. Implementeer de laptopkant van de gekozen optie in `scripts/normalize.js`,
   `scripts/detecteer-nieuwe-regios.js` (of vervang dat dode script) en de skill
   `nieuwe-regio-verwerken`, met de bestaande n8n-bestanden als terugvalpad zolang
   n8n nog niet is omgebouwd (beide paden werken; de skill herkent welk pad
   voorligt).
2. Schrijf `docs/n8n-wijziging-scrapes.md`: exact welke node(s) in n8n
   veranderen, welke velden, welk formaat, met een voorbeeld-payload. Olivier
   voert dat zelf uit in n8n; jij kunt er niet bij.
3. Pas `.gitignore` en de CLAUDE.md-regel aan: ruwe scrapes worden niet meer
   getrackt zodra n8n is omgebouwd; tot dan blijft de oude regel gelden. Schrijf
   beide toestanden op, met de datum van de omschakeling als "nog te zetten".
4. Historie opschonen: **niet doen in deze opdracht**. Beschrijf wel in het
   verslag wat een `git filter-repo` op `updated-files` zou opleveren (pack 76 MB
   → schatting) en wat het kost (iedereen moet opnieuw klonen, n8n-credential
   controleren). Dat is een aparte beslissing.

## Wat niet

- Untrack of verwijder niets uit `data/` in deze opdracht. Het proces van een
  nieuwe regio mag geen dag stuk zijn.
- Raak `build.js` niet aan.

## Bewijs

1. Met de gekozen optie: simuleer één nieuwe regio in een scratch-map (gebruik
   `scripts/maak-testdata.js` of een kopie van een bestaande raw-set) en toon dat
   de skill/`normalize.js` er een `reviews.json` van maakt die byte-identiek is
   aan wat het oude pad geeft.
2. Toon dat het oude pad (n8n-bestanden in de repo) nog steeds werkt.

## Verslag en documentatie

`ARCHITECTUUR.md` (regel 14 en 63 corrigeren: n8n pusht naar `updated-files`;
gegevensstroom stap 3 tot 5 herschrijven voor de gekozen optie), `CLAUDE.md`
(regel "Ruwe scrapedata"), `.gitignore`, de skill, `docs/n8n-wijziging-scrapes.md`.
METHODIEK.md hoeft niet; zeg dat expliciet. Meld wat Olivier koos.
