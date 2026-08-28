# Kant-en-klare prompt — nieuwe regio verwerken

Kopieer alles onder de streep in een nieuwe Claude Code-sessie.
Vul eerst de drie placeholders in:

- `{{NICHE}}` → bv. `dakwerkers`
- `{{REGIO}}` → bv. `Brugge`
- `{{SLUG}}`  → bv. `dakwerkers-brugge`

---

Bouw een nieuwe Keurwijzer-directorypagina voor niche **{{NICHE}}** in
**regio {{REGIO}}**, slug **{{SLUG}}**.

Lees eerst `CLAUDE.md` en `METHODIEK.md` — die bevatten alle projectregels en de
methodiek. Volg ze strikt. Samengevat: de LLM beoordeelt alleen tekst; alle
rekenwerk (Bayes, tijdsweging, selectie, volgorde) doet `build.js`. Dezelfde data
= hetzelfde resultaat. `beoordeling.json` wordt één keer gemaakt en dan bevroren.

Het volledige Fase 0-6-werkproces staat in `prompts/directory-page-emails-prompt.md`.
De LLM-beoordelingsrubrieken staan in `prompts/scoring-prompt.md`.
**Volg die twee bestanden letterlijk — sla geen stap over, raad niets, en stop en
vraag als je twijfelt.**

## Belangrijke regels (samenvatting, de volledige regels staan in bovenstaande bestanden)

1. **Nieuwste methodiek** — laat het `methodiek`-veld weg uit de config (dan pakt
   `build.js` automatisch de nieuwste versie, `METHODIEK_LATEST`). Pin een nieuwe config
   nooit op een versienummer en schrijf nergens "de nieuwste versie is vN" — lees de
   actuele nieuwste versie en haar regels uit METHODIEK.md § Methodiek-versies. Sinds v3
   geldt: elk bedrijf op de pagina moet een **verifieerbare eigen website** hebben;
   bedrijven zonder website (`vakfocusBron: "geen-website"`) vallen uit de selectie. Dit
   is een harde regel, geen suggestie.

2. **Nederlands** — alles wat op de publieke pagina of in een e-mail terechtkomt is
   Nederlands. `synthese`, `chips`, en outreach-mails zijn Nederlands. Als er Engelse
   tekst opduikt in `beoordeling.json`, `output/` of een Gmail-draft → stop en meld.

3. **Gemeenten** — straal ~20 km, gemeentefusie 2025 (beide vormen opnemen), geen
   overlap met bestaande regio's binnen dezelfde niche (check andere configs).

4. **Vakfocus vereist websitebezoek** — bezoek voor elk rankbaar bedrijf de echte
   website. Controleer dat naam en gemeente kloppen (pas op voor naamverwarring en
   SEO-lokaas). Geen betrouwbare site → `vakfocus: null`,
   `vakfocusBron: "geen-website"`.

5. **Middel meerdere runs** — scoor `reviewkwaliteit` en `vakfocus` in 2-3
   onafhankelijke runs (in stappen van 0,5) en neem het gemiddelde. `synthese`, `chips`
   en `breuk` uit de meest representatieve run.

## Start — volg deze fases in volgorde

### Fase 0 — Niche bepalen

Bestaat de niche al (`config/{{NICHE}}/`)? Gebruik een bestaande config als model.
Nieuwe niche? Gebruik `config/dakwerkers/dakwerkers-gent.json` als structuurmodel en
vraag mij voor het vakblok en de hero-afbeelding.

### Fase 1 — Config aanmaken

Maak `config/{{NICHE}}/{{SLUG}}.json` aan. Geen `methodiek`-veld (dan pakt build.js automatisch de nieuwste versie).
Controleer fusiegemeenten 2025. Check overlap met andere regio's in dezelfde niche.

### Fase 2 — Normalize

De JSON-bestanden staan in `data/{{SLUG}}/`. Zoek de nieuwste `*-places.json` en
`*-reviews.json`:

```bash
node scripts/normalize.js apify {{SLUG}} data/{{SLUG}}/NIEUWSTE-reviews.json data/{{SLUG}}/NIEUWSTE-places.json
```

Lees alle warnings en los ze op. Herhaal Fase 1↔2 tot de gemeentenlijst klopt.
Rapporteer: aantal bedrijven, aantal binnen gemeentenlijst, aantal rankbaar.

### Fase 3 — Beoordeling (bevriezen)

Volg `prompts/scoring-prompt.md` letterlijk. Beoordeel ALLE bedrijven uit
`reviews.json`. Bezoek elke website voor vakfocus. Middel 2-3 runs.
Schrijf resultaat naar `data/{{SLUG}}/beoordeling.json` en bevries.

### Fase 4 — Build en verificatie

```bash
node build.js {{SLUG}}
```

```bash
node build-all.js
```

Controleer:
- `output/{{SLUG}}/index.html` — Top 10 of Top 5, volgorde, geen score boven 10
- `reports/{{SLUG}}/` — controlerapport + prospectiedocument
- De "update in GHL"-lijst die `build-all.js` print

### Fase 5 — Overdracht

Geef mij de lijst van GHL-acties. Typisch voor een nieuwe regio in een bestaande
niche: enkel de detailpagina plakken (uit `ghl/{{SLUG}}/`). Hubs en homepage laden
automatisch uit `registry.json`.

### Fase 6 — Outreach

Volg `prompts/directory-page-emails-prompt.md` Fase 6 letterlijk.
Per bedrijf in de selectie: zoek het e-mailadres via de website, maak 2 Gmail-drafts
(contactmail + badge-opvolging). **Nooit automatisch versturen — enkel drafts.**
Rapporteer een tabel met bedrijf + e-mailadres + check per draft, en apart de
bedrijven zonder vindbaar e-mailadres.
