---
name: nieuwe-regio-verwerken
description: Haalt nieuwe Apify-scrapedata op (gepusht door de n8n-scraper naar dit repo z'n data/{{SLUG}}/ mappen) en verwerkt die volgens het bestaande Fase 0-6-proces tot een gepubliceerde pagina + Gmail outreach-drafts. Gebruik dit wanneer Olivier zegt dat hij de status in de Google Sheet op "todo" heeft gezet (dan draait de n8n-scraper en pusht die places + reviews naar GitHub), of zoiets als "check de repo voor nieuwe scrape-data", "check mijn github", "bouw de nieuwe regio", "haal de nieuwe JSON-bestanden op" of "verwerk deze niche en regio".
---

Dit is enkel de **instapfase** vóór het bestaande proces. Vind geen nieuwe logica uit —
alle rekenregels, selectiecriteria, publicatiestappen én de outreach-mails staan al vast
in `prompts/directory-page-emails-prompt.md` (de canonieke Fase 0-6 werkproces-prompt).
Deze skill wijst enkel de weg naar de juiste `{{SLUG}}` en start dat proces.

## Stap 0 — Ophalen

Trigger: Olivier zet de status in de Google Sheet op **"todo"** → de n8n-scraper draait
en pusht de nieuwe `*-places.json` + `*-reviews.json` naar GitHub in `data/{{SLUG}}/`.
Haal die binnen:

```bash
git pull
```

Let op de timing: het scrapen duurt even. Vind je in Stap 1 (nog) niets nieuws vlak
nadat de status op "todo" ging, dan draait de scraper waarschijnlijk nog — wacht een paar
minuten en doe opnieuw `git pull`. Concludeer pas dat er niets is als een tweede pull ook
leeg blijft.

## Stap 1 — Nieuwe regio('s) detecteren

De n8n-scraper pusht twee bestanden per run naar `data/{{SLUG}}/`, genoemd naar hun
inhoud: `{{SLUG}}-{{DATUM}}-places.json` en `{{SLUG}}-{{DATUM}}-reviews.json`
(`{{SLUG}}` = `{{NICHE}}-{{REGIO}}`, bv. `dakwerkers-brugge-2026-08-26-places.json`). Een
regio is **klaar om te starten** wanneer zo'n paar bestaat maar er **nog geen**
`config/{{NICHE}}/{{SLUG}}.json` voor bestaat (de scraper draaide al, Fase 1 nog niet):

```bash
for d in data/*/; do
  slug=$(basename "$d")
  places=$(ls "$d"*-places.json 2>/dev/null | sort | tail -1)
  reviews=$(ls "$d"*-reviews.json 2>/dev/null | sort | tail -1)
  if [ -n "$places" ] && [ -n "$reviews" ] && ! find config -name "$slug.json" | grep -q .; then
    echo "NIEUW, nog te verwerken: $slug"
    echo "  places:  $places"
    echo "  reviews: $reviews"
  fi
done
```

(`sort | tail -1` pakt de nieuwste datum als er meerdere runs voor dezelfde slug
liggen.)

Meerdere treffers? Vraag Olivier welke regio (welke niche/regio-combinatie) hij nu wil
laten bouwen — raad de niche/regio-naam niet uit de slug alleen.

Geen treffers? Meld dat er niets nieuws klaarstaat — niet verzinnen dat er werk is.

## Stap 2 — Het bestaande proces volgen

Zodra de `{{SLUG}}` en de twee bestandspaden (uit Stap 1) vaststaan: volg
**`prompts/directory-page-emails-prompt.md`** letterlijk vanaf Fase 1 (config aanmaken).
In Fase 2 gebruik je
de exacte paden uit Stap 1 in plaats van de generieke `apify-export.json`/
`apify-places.json`-namen uit dat document:

```bash
node scripts/normalize.js apify {{SLUG}} {{REVIEWS_PAD_UIT_STAP1}} {{PLACES_PAD_UIT_STAP1}}
```

De rest van Fase 1-5 (gemeentenlijst, bevriezen van `beoordeling.json`, `build-all.js`,
publicatie) blijft ongewijzigd. Wijk er niet van af.

**Publiceren gaat vanzelf.** `build-all.js` duwt de site naar
`Magicworx-be/keurwijzer-site` en Cloudflare zet ze binnen ~30 seconden live op
keurwijzer.be. Er is geen handmatige overdracht meer — en dus ook geen
controlemoment tussen bouwen en live gaan. Zie `ARCHITECTUUR.md`.

**Sla Fase 4b nooit over.** Na `build-all.js` controleer je altijd of de nieuwe regio
ook écht op de live niche-hub (`keurwijzer.be/<niche>/`) als klikbare kaart verschijnt,
niet als grijze "binnenkort"-kaart. Dat kan stil misgaan: een CDN kan een verouderde
`registry.json` serveren met een gewone `200`, waardoor niets faalt en geen fallback
inspringt. De hubkaarten worden clientside gerenderd, dus de slug staat níét in de ruwe
HTML — je moet de pagina renderen met de browser-tools. Meld de uitkomst expliciet.

## Stap 3 — Outreach (Fase 6)

Nadat de pagina live staat: volg **Fase 6** van `prompts/directory-page-emails-prompt.md` met de
Gmail MCP (al gekoppeld aan Olivier's eigen account) om gepersonaliseerde conceptmails klaar
te zetten per bedrijf uit de selectie. **Nooit automatisch versturen** — enkel drafts die
Olivier zelf controleert en verstuurt.
