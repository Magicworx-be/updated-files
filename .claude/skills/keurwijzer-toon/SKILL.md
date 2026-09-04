---
name: keurwijzer-toon
description: De huisstijl van Keurwijzer in woorden — hoe een pagina, rapport of mail moet klinken. Twee registers: de pagina spreekt als instituut, Olivier spreekt als mens. Gebruik dit vóór je Nederlandse tekst schrijft of herschrijft die naar buiten gaat (paginatekst, marktrapport, outreachmail, antwoord aan een bedrijf), en wanneer Olivier zegt "dat klinkt stroef", "schrijf dat natuurlijker", "check de taal" of `/keurwijzer-toon`.
---

# Keurwijzer — de toon

Deze skill is niet verzonnen. Hij is afgeleid uit wat Olivier zélf geschreven
heeft: de outreachmails die hij eigenhandig herschreef, en de publieke
paginatekst. Wijkt een regel hieronder af van een tekst die hij zelf vastlegde,
dan wint zijn tekst — altijd.

## Er zijn twee stemmen, en ze mogen niet mengen

| | **De pagina** | **Olivier** |
|---|---|---|
| Waar | site, marktrapport, METHODIEK.md | mails aan bedrijven |
| Wie spreekt | Keurwijzer, als instituut | een mens, met naam en gsm-nummer |
| Vorm | "we", derde persoon over bedrijven | "ik" en "je" |
| Doel | verifieerbaar zijn | een gesprek beginnen |

Zet nooit verkooptaal op de pagina, en nooit institutioneel proza in een mail.

---

## De pagina: precies, kaal, controleerbaar

Het gezag komt van de nauwkeurigheid, niet van de bijvoeglijke naamwoorden.
Zoals het er nu staat:

> We herberekenen jaarlijks alles opnieuw met verse data. Een plaats in de
> selectie is dus nooit verworven.

> Keurwijzer analyseerde 2678 Google-reviews van 119 bedrijven die in regio
> Gent als dakwerker te vinden zijn.

Wat die zinnen goed maakt:

- **Eerst de regel, dan het gevolg.** "We herberekenen jaarlijks" → "dus nooit
  verworven". De lezer krijgt de redenering, niet alleen de conclusie.
- **Geen versterkers.** Geen "zeer", "uiterst", "het beste", "uniek". Een cijfer
  dat klopt is overtuigender dan een woord dat opschept.
- **Noem de grens waar ze ligt.** "Dat wil niet zeggen dat ze slecht werk
  leveren — alleen dat er publiek te weinig over hen te vinden is." Wie zijn
  eigen beperking benoemt, wordt geloofd op de rest.
- **Elk getal moet waar zijn in het woord dat erop volgt.** "119 dakwerkers"
  was fout: het zijn 119 zoekresultaten. Vraag je bij élk getal af of het
  zelfstandig naamwoord erachter de telling echt dekt.
- **Leg vaktaal uit terwijl je ze gebruikt.** "de middelste dakwerker" in plaats
  van "de mediaan". De lezer is aannemer, geen statisticus.

---

## Olivier: kort, gewoon, zonder druk

Zijn eigen mails, letterlijk:

> We hebben alle dakwerkers in de ruime regio Dendermonde vergeleken.
> Je hebt recht op een Keurwijzer kwaliteitsbadge voor op je site of offertes.
> **Is gratis. Stuur ik die?**

> **Korte vraag, dan laat ik je met rust.**
> Je bedrijf staat sowieso op die pagina — of je nu antwoordt of niet.

> Ik heb je WhatsApp-nummer toegevoegd, {voornaam}.
> En mocht je ooit hulp nodig hebben met (meer) leads en klanten, **laat t mij weten**.

Wat hem kenmerkt:

- **Eén gedachte per regel.** Geen alinea's van vier zinnen aan elkaar.
- **Zinsfragmenten mogen.** "Is gratis." Dat is geen slordigheid maar spreektaal.
- **Hij geeft altijd een uitweg.** "of je nu antwoordt of niet", "dan laat ik je
  met rust", "Nee → ik stuur je niets meer". Nooit schaarste, nooit een
  deadline die niet bestaat.
- **Hij vraagt, hij verkoopt niet.** "Stuur ik die?" is een vraag van vier
  woorden waar een ander een alinea van maakt.
- **Warm afsluiten.** "Groeten en alle succes, Olivier" — met gsm-nummer eronder.
- **Geen uitroeptekens. Geen emoji.**

### Zijn vaste teksten zijn vast

De mailteksten in `prompts/directory-page-emails-prompt.md` en
`prompts/reply-scenarios.md` heeft hij zelf geschreven en vastgelegd. Verbeter
ze niet, ook niet als je iets vloeiender vindt. Er staat bij elke tekst waarom
ze zo is. Wil je er iets aan wijzigen: eerst vragen. Zie ook zijn eigen concept
in Gmail — dat is de bron, niet wat er in een chat voorbijkwam.

---

## Woorden die er niet in horen

Dit zijn geen smaakregels; het zijn dingen die in dit project echt fout gingen.

| Niet | Wel | Waarom |
|---|---|---|
| "die genoeg sporen nalaten" | "waarover genoeg bekend is" | metafoor uit een misdaadserie |
| "een aantoonbaar spoor" | "van 119 blijven er 54 over" | zegt niets concreets |
| "per schijf" | "per groep" | vaktaal |
| "de toegangseis" | "de ondergrens om hier in te staan" | ambtelijk |
| "de dóórsnee X" | "de middelste X" | accenten en jargon in één |
| "leveren", "aanbieden", "ontzorgen" | zeg wat er gebeurt | verkooptaal |
| "119 dakwerkers" (over zoekresultaten) | "119 bedrijven die als dakwerker te vinden zijn" | onwaar |

---

## Nederlandse valkuilen die blijven terugkomen

Deze zijn alle drie écht misgegaan in gegenereerde tekst.

**Tellen bij één.** "vielen er nog eens 1 af" is fout. Bouw een hulpje dat bij
`1` het enkelvoud kiest *en* het telwoord uitschrijft: "viel er nog **één** af"
tegenover "vielen er nog **16** af". Ditzelfde geldt voor "bedrijf/bedrijven",
"is/zijn", "deze/dit".

**De tussenletter -s.** `${vak}smarkt` gaf "dakwerkersmarkt" — toevallig goed,
maar die -s klopt niet bij elke vaknaam. Bouw nooit samenstellingen uit een
variabele. Schrijf "de markt voor {vak}".

**"waarvan hun".** "…bedrijven waarvan hun eigen website bevestigt dat…" loopt
niet. Kies "…waarvan de website bevestigt…" of, natuurlijker, "…als op zijn
eigen website te zien is dat…".

---

## Vóór je tekst aflevert

1. Lees elke zin hardop. Struikel je, dan struikelt de lezer ook.
2. Sta er een getal? Klopt het woord erachter precies?
3. Sta er een bijvoeglijk naamwoord? Kan het weg?
4. Is er ergens een cijfer van 1? Klopt het werkwoord erbij?
5. Zit er druk in (schaarste, deadline, "laatste kans")? Weghalen.
6. Bij gegenereerde tekst: draai het script en lees de échte uitvoer — niet
   het sjabloon. De fouten zitten in wat eruit komt, niet in wat je typte.

**Alles wat op de pagina of in een mail terechtkomt is Nederlands.** Zie je
Engelse tekst in `beoordeling.json`, in `output/<slug>/index.html` of in een
Gmail-draft, dan is dat een fout — stoppen en melden.
