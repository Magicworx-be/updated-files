# 05 — Homepage en hubs generiek maken voor 25 niches

Projectmap: `C:\Users\brain\Desktop\Projecten\Magicworx\Keurwijzer\Keurwijzer website`
Lees eerst `CLAUDE.md` (vooral de regel "Hub-navigatie staat serverside in de
HTML; clientside is enkel verversing" en de regel over "binnenkort"-kaarten),
`ARCHITECTUUR.md`, `build-site.js`, `build-all.js`, `homepage.html`, `hub.html`
en `lib/registry.js`. Vereist dat opdracht 04 is uitgevoerd (`_niche.json`
bestaat). Antwoord in het Nederlands.

## Wat gemeten is (3 september 2026)

| Plaats | Wat |
|---|---|
| `homepage.html` 658–820 | 12 handgemaakte nichekaarten met SVG-icoon; 1 live, 3 met `data-niche`, **8 zonder** `data-niche`. `build-all.js` 75–120 eist per live niche een kaart en waarschuwt pas ná publicatie (stap 9). |
| `homepage.html` 463 en 953 | serverside nav en footer bevatten enkel `<a href="/dakwerkers/">Dakwerken</a>`; clientside vervangen uit `registry.json` (1030–1044). Crawlers zonder JavaScript zien één niche. |
| `homepage.html` 1030–1036 | menu wordt een platte rij `<a>`; 25 niches passen niet (onder een breakpoint wordt `.nav-mid` verborgen, regel 296 en 406). |
| `homepage.html` 479, 507, 523, 654 | hero-copy "dakdekker, elektricien of vochtbestrijder", img-alt "op een dak", "Dakdekker · voorbeeldweergave", "We starten met de niche dakwerken, de andere volgen". |
| `homepage.html` 440 | SVG-icoon `#n-dak` per niche, handmatig. |
| `build-site.js` 22 `HERO_IMG` | één dakfoto als og:image van álle niche- én regio-hubs (regel 185, 230). |
| alle configs `hero.img`, `homepage.html` 22/24/507, `build-site.js` 22 | wijzen naar `assets.cdn.filesafe.space` = GoHighLevel-CDN (1,8 MB PNG). Valt dat account weg, breken alle previews. Commentaar op `homepage.html` 642 voorziet al `/img/niches/`. |
| `hub.html` 229 vs `build-site.js` 25 | `esc()` clientside escapet geen `"`, serverside wel. Verder zijn de kaarten identiek (goed). |

## Wat te doen

1. **Homepage-nichegrid uit de registry.** `build-site.js` rendert het raster
   serverside uit `registry.niches` (live niches als klikbare kaart, met tekst en
   icoon uit `_niche.json`), in dezelfde opmaak als nu. De acht "komt eraan"-
   kaarten zonder koppeling: overleg via een korte vraag met Olivier of ze
   blijven als niet-klikbare kaart (dan komen ze uit een lijst `niches-gepland`
   in `_niche.json`-stijl of in `new page - how to/niches.txt`) of verdwijnen.
   Het clientside script ververst het raster daarna zoals de hubs dat doen; de
   serverside HTML blijft de bron (CLAUDE.md).
2. **Nav en footer** serverside uit de registry, met een ontwerp dat 25 niches
   draagt: bijvoorbeeld een "Vakgebieden"-uitklapmenu op desktop en een lijst in
   de footer, gegroepeerd zoals Olivier wil. Leg twee opties met screenshot voor
   (gebruik de Browser-tools op de lokale `output/index.html`) en laat hem kiezen;
   bouw de gekozen optie.
3. **Hero-teksten** op de homepage niche-neutraal maken of uit de registry laten
   komen ("N vakgebieden, M regio's"); de zin "We starten met de niche dakwerken"
   verdwijnt zodra er meer dan één live niche is (afgeleid, niet hardcoded).
4. **Hero-afbeeldingen zelf hosten.** Download de huidige hero naar
   `assets/img/niches/dakwerkers.jpg` (geoptimaliseerd, ~200 KB, plus een
   og-variant 1200×630), laat `push-site.js` `assets/img/` meenemen naar
   `public/img/`, en verwijs in `_niche.json` en `build-site.js` naar
   `/img/niches/<niche>.jpg`. Per niche-hub de eigen hero als og:image; per
   regio-hub een neutrale site-afbeelding (vraag Olivier of hij er een heeft;
   anders de dakfoto tot hij er een aanlevert, en noteer dat).
5. Maak `esc()` in `hub.html` gelijk aan die in `build-site.js` (ook `"` escapen).
6. `build-all.js`: de controle "elke live niche heeft een kaart" wordt overbodig
   (raster komt uit de registry); verwijder hem of zet hem om in een controle op
   `_niche.json`-volledigheid, vóór de publicatie in plaats van erna.

## Wat niet

- De 16 detailpagina's raak je niet aan; hun md5 blijft gelijk.
- Verwijder nooit de serverside kaarten en links (CLAUDE.md). Het clientside
  script mag alleen vervangen door iets dat identiek is opgemaakt.
- Geen wijziging aan `registry.json`-structuur zonder dat `hub.html` en
  `homepage.html` in dezelfde beurt mee veranderen.

## Bewijs

1. `node build-site.js` en toon met de Browser-tools de homepage en de
   dakwerkers-hub lokaal, vóór en ná het clientside script (zet JavaScript uit of
   vergelijk de DOM vóór en ná `DOMContentLoaded`): geen zichtbare sprong.
2. Alle links op de homepage en de hubs zonder JavaScript: elke live pagina heeft
   een crawlbare link (tel ze; nu 16 op `/dakwerkers/`).
3. og:image van elke hub geeft 200 vanaf de eigen site (na `build-all.js`).
4. md5 van de 16 detailpagina's ongewijzigd.

Daarna `node build-all.js` (gaat live). Meld wat er live ging.

## Verslag en documentatie

Werk de CLAUDE.md-regel over hub-navigatie bij (homepage rendert nu ook
serverside), `ARCHITECTUUR.md` (bestandstabel, `assets/img/`) en, alleen als
je het hebt aangeraakt, de FAQ-tekst in `homepage.html` en de JSON-LD; die moeten
gelijk blijven aan `build.js` en `METHODIEK.md`. METHODIEK.md hoeft niet
bijgewerkt (geen logica); zeg dat expliciet.
