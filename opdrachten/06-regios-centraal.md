# 06 — Regio's één keer definiëren, niet in elke config

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md` (regel "Drie gemeentelijsten, bewust ongelijk" en
"Geen gemeente in de data → bedrijf altijd weglaten"), `ARCHITECTUUR.md` § De drie
gemeentelijsten, `lib/registry.js`, `new page - how to/regions.txt`,
`new page - how to/regio-overzicht.md`, en alle `config/dakwerkers/*.json`.
Antwoord in het Nederlands.

## Wat gemeten is (3 september 2026)

- Elke config draagt zijn eigen `gemeenten`-lijst (9 tot 73 namen). Bij 25 niches
  wordt dezelfde lijst 25 keer gekopieerd; elke afwijking geeft per niche een
  andere regio-afbakening.
- `regio-overzicht.md` en `regions.txt` lopen nu al uiteen (Gent 14 vs 9
  gemeenten, Dendermonde 9 vs 11).
- `config/dakwerkers/dakwerkers-dendermonde.json` mist **Wetteren en Laarne**, die
  `regions.txt` aan Dendermonde toewijst; ze staan in de Gent-config (v1, juli).
  In `dakwerkers-dendermonde-2026-08-27-places.json`: 22 Wetteren- en 8
  Laarne-bedrijven, 8 met ≥10 reviews, stil weggevallen. De Gent-config bevat ook
  Zelzate en Aalter, die volgens `regions.txt` bij Meetjesland horen.
- Verder is de deelgemeente-dekking goed. Kleine gaten: Sint-Niklaas mist
  "Sinaai-Waas"; Antwerpen mist "Zwijndrecht" en "Burcht" als losse schrijfwijze
  naast "Beveren-Kruibeke-Zwijndrecht"; Brasschaat mist "Ekeren" en
  "Berendrecht-Zandvliet-Lillo". Kortrijk bevat "Machelen" (deelgemeente van
  Zulte; naamgelijk aan Machelen bij Vilvoorde, onschuldig).
- `regions.txt`: 29 regio's, 285 gemeenten, geen dubbels; `PROVINCIE_PER_REGIO`
  telt ook 29. Dat klopt.

## Wat te doen

1. Maak `regios/<regioSlug>.json` voor alle 29 regio's uit `regions.txt`, met:
   `naam`, `kern`, `provincie`, `gemeenten` (officiële fusienamen, exact
   `regions.txt`), en `schrijfwijzen` (alle varianten die Google in adressen
   schrijft: fusienaam, oude namen, deelgemeenten). Vul `schrijfwijzen` voor de 16
   live regio's uit de huidige configs (verlies niets), en voor de 13 andere zo
   goed mogelijk uit publieke bron (Wikipedia-deelgemeentelijsten); markeer die 13
   met `"controle": "nog niet gebruikt"`.
2. `lib/registry.js`: laad `regios/` en valideer dat elke gemeente in precies één
   regio staat en dat `regions.txt` en `regios/` dezelfde 29 regio's en 285
   gemeenten bevatten. `loadPlannedRegions()` leest voortaan `regios/`;
   `regions.txt` mag blijven als leesbare kopie of verdwijnen (kies, en werk
   CLAUDE.md mee bij).
3. Configs: `gemeenten` wordt optioneel. Ontbreekt het, dan gebruikt `build.js` de
   `schrijfwijzen` van de regio. Staat het er wél (zoals in de 16 bestaande
   configs), dan wint de config; zo blijven de live pagina's exact zoals ze zijn.
   `build.js` waarschuwt als config en regiobestand verschillen, met de lijst
   van verschillen (dat is precies het Dendermonde-signaal).
4. Voeg de kleine gaten (Sinaai-Waas, Zwijndrecht, Burcht, Ekeren,
   Berendrecht-Zandvliet-Lillo) toe aan de `schrijfwijzen` van de betreffende
   regio, niet aan de live configs.
5. `regio-overzicht.md`: één regel bovenaan dat `regios/` de bron is, of het
   bestand regenereren uit `regios/` met een klein script.
6. Schrijf in `WIJZIGINGEN.md` een genummerde paragraaf: waarom regio's centraal
   staan, en de geparkeerde correctie voor Dendermonde/Gent (Wetteren, Laarne,
   Zelzate, Aalter) bij de jaarlijkse herbouw met `--nieuwe-selectie`.

## Wat niet

- Verander geen enkele bestaande config-gemeentelijst. Dendermonde en Gent
  worden pas bij de jaarlijkse herbouw gelijkgetrokken (selectieslot). Nooit
  `--nieuwe-selectie`.
- `Apify scrape/geolocation.txt` laat je met rust (ARCHITECTUUR.md legt uit
  waarom).

## Bewijs

1. Alle 16 slugs bouwen; md5 van `output/<slug>/index.html` ongewijzigd; `npm test`
   slaagt.
2. De validatie in `registry.js` faalt hard als je in een scratch-kopie een
   gemeente in twee regio's zet.
3. Een build van een config zónder `gemeenten` (scratch, bijvoorbeeld een kopie
   van dakwerkers-gent zonder dat veld) levert dezelfde selectie als mét, óf een
   lijst van verschillen; toon dat voor Gent en Dendermonde.

## Verslag en documentatie

Werk `CLAUDE.md` (regel over de drie gemeentelijsten, bestandstabel),
`ARCHITECTUUR.md` § De drie gemeentelijsten, `METHODIEK.md` § selectie
(gemeentefilter komt uit `regios/`; datum op vandaag) en Fase 1 van
`prompts/directory-page-emails-prompt.md` en de skill `nieuwe-regio-verwerken`
bij: bij een bestaande regio is de gemeentelijst geen handwerk meer. Meld
expliciet wat je bijwerkte.
