# Gmail-feiten voor het outreach-logboek

`scripts/outreach-seed.js --gmail <bestand.json>` vult het logboek aan met wat alleen
Gmail weet: in welke thread een bedrijf zit, wanneer mail 1 vertrok, wanneer er
teruggeschreven is. Dit bestand beschrijft de vorm van dat JSON-bestand.

De laatst gebruikte versie staat in `data/outreach-gmail.json` (niet in git — er staan
mailadressen in).

## Waarom dit een bestand is en geen script

De scripts hebben geen Google-credential; de mailbox wordt gelezen door een Claude-ronde
via de Gmail-connector. Die ronde schrijft de feiten in dit bestand, het script rekent.
Zo blijft de bewerking herhaalbaar en controleerbaar: je kan het bestand nalezen, en
`--droog` laat zien wat er zou gebeuren zonder iets te schrijven.

## Vorm

Een lijst van objecten. Elk object wijst één bedrijf aan en draagt alleen **feiten** —
geen interpretatie, geen oordeel.

```json
[
  { "_": "vrije toelichting; regels zonder email én zonder slug worden overgeslagen" },

  { "email": "info@voorbeelddakwerken.be",
    "threadId": "19f8e9d9e268336d",
    "mail1Op": "2026-07-23" },

  { "slug": "dakwerkers-ieper",
    "bedrijf": "Voorbeeld Dakwerken BV",
    "email": "voorbeeld@gmail.com",
    "threadId": "1a05bf2928a84278",
    "mail1Op": "2026-09-01",
    "antwoordOp": "2026-09-01",
    "whatsappGevraagdOp": "2026-09-01",
    "laatstGezienOp": "2026-09-01",
    "laatstGezienVan": "olivier" }
]
```

| Veld | Betekenis |
|---|---|
| `email` | het adres waarnaar gemaild is; hiermee zoekt het script zelf de rij op |
| `slug` + `bedrijf` | exacte aanwijzing, zoals op de pagina — nodig als `email` niet volstaat |
| `threadId` | de thread waarin mail 1 vertrok |
| `nevenThreads` | andere threads van hetzelfde bedrijf (Tectora antwoordde vanaf twee adressen) |
| `mail1Op` | datum van de eerste uitgaande mail |
| `opvolg1Op` | datum van een tweede uitgaande mail zonder antwoord ertussen |
| `antwoordOp` | datum waarop het bedrijf voor het eerst terugschreef |
| `antwoordSoort` | een van `ANTWOORDSOORTEN` in `lib/outreach.js`; leeg = `onbekend` |
| `whatsappGevraagdOp` | datum van de **laatste** vraag naar het zakelijk WhatsApp-nummer |
| `laatstGezienOp` / `laatstGezienVan` | datum en afzender (`olivier` of `bedrijf`) van het laatste bericht |
| `optOutOp` / `optOutBron` | het bedrijf wil niet meer gemaild worden |

## Hoe een rij gevonden wordt

1. Staan `slug` en `bedrijf` er allebei, dan is dat bindend.
2. Anders: het mailadres, exact.
3. Anders: het domein van het mailadres, vergeleken met `domein` op de rij (uit
   `reviews.json`).

Levert het domein **meer dan één** rij op — een bedrijf dat in twee regio's gepubliceerd
staat — dan gebeurt er niets en wordt dat gemeld. Welke van de twee pagina's er gemaild
is, weet alleen de mail zelf; gokken zou de opvolgronde op de verkeerde rang zetten.

**Gedeelde postbussen leveren nooit een domeinmatch op.** `domeinVan()` geeft bewust
`null` bij gmail.com, telenet.be, outlook.com, yahoo.com en de rest — anders zou het
eerste gmail-bedrijf alle gmail-adressen opeisen. Voor die bedrijven zet je `slug` en
`bedrijf` erbij. Op 4 september 2026 waren dat er 22, waaronder tien uit de top 5.

Twijfel je bij welk bedrijf een adres hoort? **Open de mail.** De outreachmail noemt het
bedrijf met naam ("Dafridak staat op de eerste plaats van 166 dakwerkers"). Zo zijn op
4 september drie adressen met een gedeelde postbus alsnog eenduidig toegewezen.

*In dit bestand staan bewust geen echte mailadressen: de repo is publiek leesbaar. De
werkelijke adressen staan in `data/outreach-gmail.json`, dat in `.gitignore` staat.*

## Wat er bewust NIET in staat

- **Threads in de prullenbak.** Die heeft Olivier weggegooid; ze horen niet terug in een
  opvolglijst. Uitzondering: een thread die maar deels in de prullenbak zit en waarvan
  het levende deel gewoon in `in:sent` opduikt.
- **De vijf gesprekken die Olivier zelf voert.** Die staan als `ZELF_AFHANDELEN` in
  `scripts/outreach-seed.js` en vallen sowieso uit elke ronde.
- **Een oordeel over de inhoud van een antwoord.** Voor alles van vóór 8 september 2026
  is `antwoordSoort` bewust `onbekend`; die mails zijn met de hand geschreven onder drie
  verschillende onderwerpregels en achteraf categoriseren zou schijnzekerheid opleveren.

## Zo is de eerste versie gemaakt (4 september 2026)

```
search_threads  in:sent newer_than:90d          pageSize 50, THREAD_VIEW_METADATA_ONLY
                → 4 pagina's, ~200 threads
search_threads  in:anywhere from:me "zakelijk WhatsApp-nummer"
                → 22 threads, de bron voor whatsappGevraagdOp
```

Van elke thread: de eerste uitgaande mail is `mail1Op`, het eerste binnenkomende bericht
is `antwoordOp`, een tweede uitgaande mail zonder antwoord ertussen is `opvolg1Op`.
Threads waarvan de ontvanger bij geen enkel gepubliceerd bedrijf hoort, laat je gewoon
weg — het script meldt ze anders als verweesd.

Resultaat: 123 van de 133 rijen kregen een verzenddatum. De tien overige zijn de vijf
`zelfAfhandelen`-gesprekken en vijf bedrijven die nooit een outreachmail kregen
(Plat Dak Demeestere, Skydak, Dakwerken Sigitek, Dakdekker Dossche, Uw Dakraam Torhout).
