# Definitieve regio-indeling — Keurwijzer

**Dit is de bindende bron voor welke gemeente bij welke regio hoort.** Gebruik deze
tabel bij Fase 1 van de werkproces-prompt (`prompts/directory-page-emails-prompt.md`)
om de `gemeenten`-lijst van een nieuwe pagina op te bouwen én om overlap met een
naburige regio te vermijden. **Let op:** die prompt verwijst momenteel zelf niet naar
dit bestand — controleer de gemeentelijst er dus altijd bewust tegen, ook als de prompt
er niet expliciet om vraagt.

Bron: `new page - how to/regions.txt` (platte lijst). Dit document is de leesbare,
gedeelde werkversie.

## Hoe deze lijst zich verhoudt tot de configs

De tabel hieronder geeft per regio de **kerngemeenten** (de huidige, post-2025 namen).
Een `config/<niche>/<slug>.json` bevat altijd méér entries dan deze kernnamen, want de
matching in `build.js`/`normalize.js` is een **exacte set-vergelijking**:

- **Fusiegemeenten 1 jan 2025 — beide vormen.** Bv. `Beveren-Kruibeke-Zwijndrecht` in de
  config staat samen met de losse namen `Beveren`, `Kruibeke`, `Zwijndrecht`; `Lokeren`
  samen met `Moerbeke`. Google schrijft de gefuseerde naam in adressen, oudere reviews de
  losse namen.
- **Deelgemeenten** die als eigen stad-string in de scrape opduiken, worden toegevoegd
  (anders vallen die bedrijven stil weg). Bv. `Bazel`, `Haasdonk`, `Melsele`, `Vrasene`
  onder Beveren-Kruibeke-Zwijndrecht.

## Harde regels (zie ook Fase 1 van het werkproces)

1. **Regiostraal ~20 km:** kerngemeente + buurgemeenten binnen die straal. Dubbelcheck elke
   naam (bestaat ze, ligt ze echt bij de kern, geen naamverwarring met een andere provincie
   of met Nederland).
2. **Geen overlap tussen regio's.** Ligt een grensgemeente al in een naburige regio, neem
   ze dan **standaard niet** op — ook al kost dat rankbare bedrijven. Meld het met concreet
   gevolg en laat de knoop doorhakken.
3. **Zetel bepaalt de regio.** Een bedrijf hoort bij de regio van zijn gemeente (zetel/pin),
   niet bij de regio waar het toevallig ook werkt. Een bedrijf uit gemeente X hoort dus in
   de regio waaraan X hieronder is toegewezen — en nergens anders.

## Oost-Vlaanderen

| Regio | Kerngemeenten |
|---|---|
| Gent | Gent, Merelbeke-Melle, Destelbergen, Evergem, Lochristi, Nazareth-De Pinte, Sint-Martens-Latem, Wetteren, Laarne, Lievegem, Deinze, Oosterzele, Zelzate, Aalter |
| Meetjesland | Eeklo, Maldegem, Sint-Laureins, Assenede, Kaprijke, Lievegem, Aalter, Zelzate |
| Aalst | Aalst, Erpe-Mere, Lede, Haaltert, Denderleeuw, Ninove, Herzele, Sint-Lievens-Houtem, Geraardsbergen, Zottegem |
| Dendermonde | Dendermonde, Lebbeke, Buggenhout, Hamme, Zele, Berlare, Wichelen, **Waasmunster**, Opwijk |
| Sint-Niklaas | Sint-Niklaas, Beveren-Kruibeke-Zwijndrecht, Temse, Stekene, Sint-Gillis-Waas, Lokeren |
| Oudenaarde | Oudenaarde, Ronse, Brakel, Horebeke, Kluisbergen, Kruisem, Lierde, Maarkedal, Wortegem-Petegem, Zwalm, Gavere |

> **Let op de Sint-Niklaas ↔ Dendermonde-grens:** `Waasmunster` en `Hamme` horen bij
> **Dendermonde**, niet bij Sint-Niklaas. `Lokeren` (incl. `Moerbeke`) hoort bij
> **Sint-Niklaas**. Bedrijven met zetel in Waasmunster of Hamme (bv. Cleys BV, Waasmunster)
> komen dus nooit op de Sint-Niklaas-pagina.

## West-Vlaanderen

| Regio | Kerngemeenten |
|---|---|
| Brugge | Brugge, Beernem, Blankenberge, Damme, Jabbeke, Knokke-Heist, Oostkamp, Torhout, Zedelgem, Zuienkerke |
| Oostende | Oostende, Bredene, De Haan, Gistel, Ichtegem, Middelkerke, Oudenburg |
| Veurne-Diksmuide | Veurne, De Panne, Koksijde, Nieuwpoort, Alveringem, Diksmuide, Houthulst, Koekelare, Kortemark, Lo-Reninge |
| Ieper | Ieper, Poperinge, Wervik, Zonnebeke, Langemark-Poelkapelle, Heuvelland, Mesen, Vleteren |
| Roeselare | Roeselare, Izegem, Hooglede, Ingelmunster, Ledegem, Lichtervelde, Moorslede, Staden |
| Tielt | Tielt, Ardooie, Dentergem, Oostrozebeke, Pittem, Wielsbeke, Wingene |
| Kortrijk | Kortrijk, Kuurne, Harelbeke, Deerlijk, Zwevegem, Menen, Wevelgem, Lendelede, Anzegem, Avelgem, Spiere-Helkijn, Waregem, Zulte |

## Antwerpen

| Regio | Kerngemeenten |
|---|---|
| Antwerpen | Antwerpen, Aartselaar, Edegem, Mortsel, Hove, Boechout, Kontich, Lint, Wommelgem, Wijnegem, Hemiksem, Schelle, Niel, Boom, Rumst |
| Brasschaat | Brasschaat, Schoten, Kapellen, Stabroek, Kalmthout, Essen, Wuustwezel, Brecht, Schilde, Zoersel, Malle, Ranst, Zandhoven |
| Mechelen | Mechelen, Lier, Berlaar, Bonheiden, Duffel, Heist-op-den-Berg, Nijlen, Putte, Sint-Katelijne-Waver, Willebroek, Bornem, Puurs-Sint-Amands |
| Turnhout | Turnhout, Oud-Turnhout, Vosselaar, Beerse, Merksplas, Hoogstraten, Rijkevorsel, Baarle-Hertog, Ravels, Arendonk, Retie |
| Geel-Mol | Geel, Mol, Balen, Dessel, Meerhout, Laakdal, Kasterlee, Lille, Olen |
| Herentals-Westerlo | Herentals, Herenthout, Grobbendonk, Vorselaar, Westerlo, Herselt, Hulshout |

## Vlaams-Brabant

| Regio | Kerngemeenten |
|---|---|
| Leuven | Leuven, Herent, Bertem, Oud-Heverlee, Huldenberg, Tervuren, Kortenberg, Bierbeek, Boutersem, Holsbeek, Rotselaar, Haacht, Boortmeerbeek, Keerbergen, Tremelo, Overijse, Hoeilaart |
| Aarschot-Diest | Aarschot, Begijnendijk, Scherpenheuvel-Zichem, Diest, Tielt-Winge, Glabbeek, Kortenaken, Bekkevoort |
| Tienen | Tienen, Hoegaarden, Linter, Zoutleeuw, Landen, Geetbets, Lubbeek |
| Vilvoorde | Vilvoorde, Zaventem, Grimbergen, Machelen, Kampenhout, Steenokkerzeel, Meise, Kraainem, Wezembeek-Oppem, Wemmel, Zemst, Kapelle-op-den-Bos |
| Halle | Halle, Beersel, Sint-Pieters-Leeuw, Lennik, Pepingen, Bever, Pajottegem, Roosdaal, Liedekerke, Sint-Genesius-Rode, Drogenbos, Linkebeek |
| Asse | Asse, Dilbeek, Ternat, Affligem, Merchtem, Londerzeel |

## Limburg

| Regio | Kerngemeenten |
|---|---|
| Hasselt-Genk | Hasselt, Genk, Diepenbeek, Zonhoven, Zutendaal, Houthalen-Helchteren, Heusden-Zolder, Lummen, Herk-de-Stad, Halen, As |
| Noord-Limburg | Lommel, Pelt, Hamont-Achel, Hechtel-Eksel, Peer, Bocholt, Beringen, Tessenderlo-Ham, Leopoldsburg |
| Maasland | Maaseik, Dilsen-Stokkem, Kinrooi, Bree, Oudsbergen, Maasmechelen, Lanaken, Bilzen-Hoeselt |
| Sint-Truiden-Tongeren | Sint-Truiden, Gingelom, Nieuwerkerken, Alken, Wellen, Heers, Tongeren-Borgloon, Riemst, Voeren, Herstappe |

## Reeds gebouwd (dakwerkers)

Gent (v1), Aalst (v1), Meetjesland (v1), Dendermonde (v2), **Sint-Niklaas (v2)**.
