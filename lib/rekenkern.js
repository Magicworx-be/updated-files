// =====================================================================
// lib/rekenkern.js — de rekenkern van Keurwijzer
//
// Alles wat een getal, een selectie of een volgorde bepaalt staat hier, en
// nergens anders: de opnamecriteria, de tijdsweging, de Bayes-correctie, de
// vier dimensies, de composite, de publicatiedrempel en de keuze Top 10 / Top 5.
// build.js leest de bestanden, roept `bereken()` aan en rendert de uitkomst.
//
// Deze module doet GEEN I/O: niet lezen, niet schrijven, niets naar het scherm,
// geen process.exit. Ze krijgt gewone objecten binnen en geeft een gewoon object
// terug. Daarom is ze los te draaien en dus te testen — zie test/README.md.
// Een fout in de invoer wordt een RekenFout; de aanroeper beslist wat daarmee
// gebeurt (build.js stopt ermee, een test vangt hem op).
//
// De LLM beoordeelt alleen tekst (reviewkwaliteit, vakfocus, synthese, chips).
// Álle rekenwerk gebeurt hier, deterministisch: zelfde invoer = zelfde uitvoer.
//
// Twee vangnetten bewaken dat deze code niet ongemerkt verschuift:
//   · het selectieslot in build.js — wie er op een gepubliceerde pagina staat;
//   · test/rekenkern.golden.test.js — élk tussengetal van élke live pagina.
//
// Wijzig je hier een constante, een drempel of een formule, werk dan in
// dezelfde beurt METHODIEK.md bij (de congruentieregel in CLAUDE.md).
// =====================================================================
'use strict';


// ---------------- constanten (vast, publiek, nooit per stad wijzigen) --
const WEIGHTS = { trust: 0.35, reviewQuality: 0.30, recency: 0.15, focus: 0.20 };
const HALFLIFE_JAREN = 2;
const BAYES_M = 16;           // op tijdsgewogen volume (≈ 16 "verse" reviews);
                              // bewust stevig: een klein perfect profiel (bv. 13×5★)
                              // mag niet louter op een streak elke gevestigde
                              // speler op vertrouwen verslaan (en fake-reviewsets
                              // zijn juist bij lage aantallen het goedkoopst)
const MIN_REVIEWS = 10;       // ruwe reviewdrempel voor OPNAME (eligibility) — publiek
const MIN_RECENT = 3;         // min. reviews in de laatste 24 maanden — publiek

// ---------------- methodiek-versies (per pagina vastgepind) --------------
// De vier dimensies en de publieke gewichten (35/30/15/20), de halveringstijd
// (2 jaar), Bayes M=16 en de opnamedrempels (≥10 / ≥3) zijn IDENTIEK in elke
// versie — dat is de publieke belofte "dezelfde methode voor elk bedrijf in
// elke regio". Wat per versie verschilt, is INTERNE kalibratie: waar de
// vertrouwen-normalisatie op 0 valt, de recentheid-verzadiging, en een aparte
// publicatiedrempel bovenop de opname. Twee opname-eisen zijn wél publiek en
// staan in de paginatekst (zie `opnameCriteria` verderop): de eigen website
// (v3+) en de vakspecialisatie-eis vakfocus ≥ VAKFOCUS_FLOOR (v4+).
//
// Bestaande pagina's staan vastgepind op de versie in hun config (vandaag: v1
// voor gent/aalst/meetjesland, v2 voor sint-niklaas, v3 voor dendermonde) en
// veranderen dus nooit. Nieuwe configs zonder veld krijgen automatisch de
// nieuwste versie. Zo blijft "zelfde data = zelfde resultaat" gelden én kan de
// methodiek verbeteren zonder één gepubliceerde pagina te breken.
const METHODIEK_LATEST = 5;
const METHODIEK_PARAMS = {
  1: {
    TRUST_FLOOR: 3.5,           // Bayes-score die op 0 genormaliseerd wordt
    RECENCY_ANCHOR: 6,          // reviews in 24m voor de volle recentheidsscore
    PUBLISH_MIN_REVIEWS: MIN_REVIEWS, // geen aparte publicatiedrempel (= opname)
    EXPECT_HALF_STEPS: true     // v1-LLM scoorde in vaste 0,5-stappen
  },
  2: {
    TRUST_FLOOR: 4.0,           // hoger: geeft de objectieve dimensie resolutie
                                // waar de data écht ligt (eligible ≈ 4,6–4,95);
                                // < 4,0 sterren (Bayes-gecorrigeerd) → 0 vertrouwen
    RECENCY_ANCHOR: 10,         // iets hogere activiteitslat, blijft een poort
                                // (geen volumewedstrijd) — een lange staat van
                                // dienst wordt nooit afgestraft
    PUBLISH_MIN_REVIEWS: 15,    // OPNAME blijft ≥10; PUBLICATIE in de Top N vergt
                                // ≥15 reviews. Vult terug uit de eligible bedrijven
                                // als een dunne regio anders te weinig lijst heeft.
    EXPECT_HALF_STEPS: false    // v2-LLM middelt 2–3 runs → fijnere, niet-0,5 waarden
  },
  3: {
    // v3 = PRESENTATIE-only verbetering t.o.v. v2. De rekenkalibratie is IDENTIEK
    // aan v2 (zelfde vier waarden hieronder), dus "zelfde data = zelfde selectie,
    // score en volgorde" als v2 — een v2- en een v3-pagina op dezelfde data
    // rangschikken exact gelijk. Wat v3 toevoegt zit uitsluitend in de JSON-LD:
    // een rijkere entiteitengraph (eerste-klas Organization-uitgever met @id,
    // publisher/breadcrumb/mainEntity gekoppeld via @id) en een vak-specifiek
    // schema.org-subtype voor de bedrijven (bv. RoofingContractor voor dakwerkers).
    // Zie SCHEMA_TYPE_BY_NICHE en de JSONLD_GRAPH-opbouw verderop.
    TRUST_FLOOR: 4.0,
    RECENCY_ANCHOR: 10,
    PUBLISH_MIN_REVIEWS: 15,
    EXPECT_HALF_STEPS: false
  },
  4: {
    // v4 = SELECTIE-verbetering t.o.v. v3. De rekenkalibratie (vertrouwen-vloer,
    // recentheid-anker, LLM-run-middeling) is IDENTIEK aan v2/v3. v4 voegt twee
    // dingen toe, beide gericht op "toon enkel échte vakspecialisten, en toon er
    // een Top 10 van zodra er genoeg zijn":
    //
    //  1) VAKFOCUS-VLOER als opname-eis. Een bedrijf is pas eligible als zijn
    //     vakfocus ≥ VAKFOCUS_FLOOR. Vakfocus komt uit de homepagina/hoofdnavigatie
    //     (rubriek 2 van de scoring-prompt) en meet nichezuiverheid — dus bedrijven
    //     van een ánder vak dat toevallig in de zoekresultaten opdook (bakkerij,
    //     ramenplaatser, materialenleverancier, brede totaalaannemer …) vallen
    //     deterministisch weg. De Google-categorie dient enkel ter controle in het
    //     rapport, niet als filter (categorieën zijn te grillig: een échte dakwerker
    //     kan als "Bouwbedrijf" of "Bouwadviseur" getagd staan).
    //
    //  2) DIEPTE op het aantal eligible SPECIALISTEN. De Top 10 / Top 5-keuze telt
    //     nu het aantal eligible vakspecialisten (die dankzij de vloer écht van het
    //     vak zijn), niet enkel de ≥15-onderbouwde. Zo krijgt een regio met ≥10
    //     specialisten een Top 10 — ook als enkele daarvan 10–14 reviews hebben.
    //     De volgorde blijft zuiver op composite (geen publishable-first split).
    //     PUBLISH_MIN_REVIEWS (≥15) behoudt zijn betekenis als "goed onderbouwd"-
    //     label in het rapport en voor de warme-leadsplitsing in de prospectie,
    //     maar stuurt de v4-selectie of -volgorde niet meer.
    TRUST_FLOOR: 4.0,
    RECENCY_ANCHOR: 10,
    PUBLISH_MIN_REVIEWS: 15,
    EXPECT_HALF_STEPS: false,
    VAKFOCUS_FLOOR: 2.5         // v4: minimale vakfocus om eligible te zijn (specialist-eis)
  },
  5: {
    // v5 = AFBAKENING van het vak. De rekenkalibratie (vertrouwen-vloer,
    // recentheid-anker, publicatiedrempel, run-middeling) én de vakfocus-vloer
    // zijn IDENTIEK aan v4. Wat v5 verandert is niet een getal maar een
    // DEFINITIE: wat telt als "het vak uitoefenen".
    //
    // Aanleiding (31 aug 2026, regio Kortrijk): v4 leverde een Top 10 met op
    // plaats 1 een dakvensterinstallateur en op plaats 4 een lichtstraatbouwer.
    // Beide zijn zuivere specialisten in iets dat óp een dak gebeurt, dus beide
    // scoorden hoog op nichezuiverheid — maar geen van beide plaatst of
    // renoveert ooit een dak. Een klant die een dakwerker zoekt, heeft daar
    // niets aan. De fout zat niet in de vloer (2,5 is juist), maar in een
    // ongedefinieerd vak: "dakwerkers" werd gelezen als "werkt aan daken" in
    // plaats van "legt en vernieuwt daken".
    //
    // v5 lost dat op door de grens expliciet en machineleesbaar te maken:
    //  1) Elke niche draagt een VAKDEFINITIE (kern + expliciete uitsluitingen),
    //     uit VAKDEF_BY_NICHE of uit `vak.definitie` in de config.
    //  2) Die definitie is bindend voor rubriek 2 van prompts/scoring-prompt.md:
    //     voert een bedrijf de kernactiviteit niet zélf uit, dan is het geen
    //     vakspecialist — hoe verwant of hoe zuiver gespecialiseerd ook — en
    //     krijgt het vakfocus ≤ 2,0, dus onder de vloer.
    //  3) De build FAALT HARD als er voor de niche geen definitie is (zie
    //     REQUIRE_VAKDEF). Een vak zonder scherpe grens levert een willekeurige
    //     selectie op; dat mag niet stilzwijgend passeren.
    //
    // De publieke opnametekst wordt navenant scherper: niet "specialisatie in
    // dakwerken" maar de kernomschrijving uit de definitie zelf.
    TRUST_FLOOR: 4.0,
    RECENCY_ANCHOR: 10,
    PUBLISH_MIN_REVIEWS: 15,
    EXPECT_HALF_STEPS: false,
    VAKFOCUS_FLOOR: 2.5,
    REQUIRE_VAKDEF: true        // v5: config/niche MOET het vak afbakenen
  }
};

// --- Vakdefinitie per niche (v5+) ---------------------------------------
// De bindende afbakening van het vak: `kern` is wat een bedrijf zélf moet
// uitvoeren om vakspecialist te zijn, `buiten` somt de verwante activiteiten op
// die daar uitdrukkelijk NIET voor volstaan. Dit is de bron voor rubriek 2
// (vakfocus) in prompts/scoring-prompt.md en voor de publieke opnametekst.
// Een config kan dit overrulen via `vak.definitie` (zelfde vorm).
// Voeg een niche hier pas toe als de grens écht scherp is — bij twijfel vragen,
// niet verzinnen. Ontbreekt de definitie, dan stopt de build (v5+).
const VAKDEF_BY_NICHE = {
  dakwerkers: {
    kern: 'het zelf plaatsen, vernieuwen of herstellen van de dakbedekking van een gebouw — ' +
          'hellende daken (pannen, leien, riet) en platte daken (roofing, bitumen, EPDM, zink)',
    omvat: [
      'nieuwe daken leggen en bestaande daken renoveren of herstellen',
      'de dakconstructie, dakisolatie, dakgoten en zinkwerk die bij zo’n dak horen',
      'asbestdaken verwijderen en vervangen'
    ],
    buiten: [
      'dakvensters, lichtkoepels of lichtstraten plaatsen en vervangen',
      'daken reinigen, ontmossen, coaten of hydrofugeren',
      'zonnepanelen plaatsen',
      'dakmaterialen verkopen of produceren (groothandel, fabrikant, showroom)',
      'enkel dakisolatie, enkel dakconstructie of enkel gevelwerk, zonder de dakbedekking zelf'
    ]
  }
};
VAKDEF_BY_NICHE.dakdekkers = VAKDEF_BY_NICHE.dakwerkers;

// --- Hoeveel bedrijven tonen we? (Top 10 vs Top 5) -----------------------
// Het aantal hangt af van hoeveel bedrijven er in de regio ECHT in aanmerking
// komen (eligible). In een dunne regio met weinig vakspecialisten tonen we een
// Top 5 i.p.v. een Top 10, zodat de lijst nooit "opgevuld" oogt.
// De grens ligt bewust op het aantal ELIGIBLE bedrijven, niet op het aantal
// ruwe Apify-resultaten: dat laatste zegt weinig over de echte diepgang
// (een regio kan 200 bedrijven opleveren met slechts 6 echte specialisten,
//  of 40 opleveren met 15 sterke). Wil je een Top 5 pas bij minder bedrijven,
// verlaag dan SMALL_REGION_THRESHOLD.
const LISTED_FULL = 10;              // Top 10 bij voldoende diepgang
const LISTED_SMALL = 5;              // Top 5 in een dunne regio
const SMALL_REGION_THRESHOLD = 10;   // < zoveel eligible bedrijven → Top 5 i.p.v. Top 10

// TRUST_FLOOR is versie-afhankelijk (zie METHODIEK_PARAMS hierboven).
const TRUST_CEIL = 5.0;      // Bayes-score die op 1 genormaliseerd wordt (alle versies)

// ---------------- helpers ------------------------------------------------
// Gedeeld met build.js en de tests: dezelfde afronding, dezelfde mediaan en
// vooral dezelfde naam-normalisatie. Die laatste is de sleutel waarmee
// reviews.json, beoordeling.json, whatsapp.json en selectie.json aan elkaar
// geknoopt worden; twee versies ervan zouden bedrijven stil laten wegvallen.
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function median(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function norm(name) { return String(name).toLowerCase().replace(/\s+/g, ' ').trim(); }

// ---------------- fouten ------------------------------------------------
// Een invoerfout die het rekenen onmogelijk maakt. build.js vertaalt hem naar
// zijn eigen `die()` (melding + exitcode 1); een test vangt hem gewoon op.
class RekenFout extends Error {
  constructor(msg) { super(msg); this.name = 'RekenFout'; }
}

const MS_JAAR = 365.25 * 24 * 3600 * 1000;

// ---------------- de berekening -----------------------------------------
// Invoer:
//   config       config/<niche>/<slug>.json (vak, regio, gemeenten, peildatum,
//                en de methodiek-pin)
//   reviews      data/<slug>/reviews.json — genormaliseerde bedrijven + reviews
//   beoordeling  data/<slug>/beoordeling.json — de LLM-tekstbeoordeling
//   whatsapp     Map van genormaliseerde bedrijfsnaam → nummer (of leeg). Puur
//                contactinfo: speelt in geen enkele berekening mee.
//
// Uitvoer: zie het return-blok onderaan.
function bereken({ config, reviews, beoordeling, whatsapp } = {}) {
  if (!config || typeof config !== 'object') throw new RekenFout('bereken(): geen config meegegeven');
  if (!Array.isArray(reviews)) throw new RekenFout('bereken(): reviews is geen lijst');
  if (!config.vak || !config.vak.mv) throw new RekenFout('config mist veld "vak.mv"');
  if (!Array.isArray(config.gemeenten)) throw new RekenFout('config mist een lijst "gemeenten"');

  // De namen hieronder houden de verplaatste code letterlijk gelijk aan wat ze
  // in build.js was. Dat is bewust: geen enkel getal mag door de verhuizing
  // veranderen, en een hernoeming is precies waar dat mis zou gaan.
  const reviewData = reviews;
  const waMap = whatsapp || new Map();
  beoordeling = beoordeling || {};

  const peildatum = new Date(String(config.peildatum) + 'T00:00:00Z');
  if (isNaN(peildatum)) throw new RekenFout('config.peildatum is geen geldige datum (verwacht JJJJ-MM-DD)');

  // Methodiek-versie kiezen: expliciet in de config, anders de nieuwste. Nieuwe
  // pagina's krijgen dus automatisch de beste logica; bestaande staan vastgepind.
  const methodiekVersie = config.methodiek || METHODIEK_LATEST;
  const P = METHODIEK_PARAMS[methodiekVersie];
  if (!P) throw new RekenFout('onbekende methodiek-versie in config: ' + methodiekVersie +
    ' (bekend: ' + Object.keys(METHODIEK_PARAMS).join(', ') + ')');
  const TRUST_FLOOR = P.TRUST_FLOOR;

  // Vakdefinitie (v5+): eerst de config, dan de niche-tabel. Zonder scherpe grens
  // is de vakfocus-vloer betekenisloos, dus dit is een harde stop — geen warning.
  const vakDef = (config.vak && config.vak.definitie) ||
                 VAKDEF_BY_NICHE[norm(config.vak.mv)] || null;
  if (P.REQUIRE_VAKDEF && !(vakDef && vakDef.kern))
    throw new RekenFout('methodiek v' + methodiekVersie + ' vereist een vakdefinitie voor niche "' + config.vak.mv +
        '".\n       Voeg de niche toe aan VAKDEF_BY_NICHE in lib/rekenkern.js, of zet "definitie"' +
        ' (met "kern" en "buiten") in het vak-blok van de config.\n' +
        '       Zonder afbakening is "vakfocus ≥ ' + P.VAKFOCUS_FLOOR + '" een willekeurige grens.');

  const gemeentenNorm = new Set(config.gemeenten.map(norm));
  const beoMap = new Map();
  (beoordeling.bedrijven || []).forEach(b => beoMap.set(norm(b.bedrijf), b));

  // ---- validatie van de LLM-output (beoordeling.json) --------------------
  const preWarnings = [];
  function valScore(b, veld, verplicht) {
    let v = b[veld];
    if (typeof v === 'string' && v.trim() !== '') v = Number(v.replace(',', '.'));
    if (v == null || Number.isNaN(v)) {
      if (verplicht) {
        preWarnings.push('"' + b.bedrijf + '": ' + veld + ' ontbreekt of is ongeldig — teruggevallen op 3.0');
        b[veld] = 3;
      } else {
        b[veld] = null;
      }
      return;
    }
    if (typeof v !== 'number') { b[veld] = verplicht ? 3 : null; return; }
    if (v < 1 || v > 5) {
      preWarnings.push('"' + b.bedrijf + '": ' + veld + ' = ' + v + ' valt buiten 1–5 — afgekapt');
      v = clamp(v, 1, 5);
    }
    b[veld] = v;
  }
  (beoordeling.bedrijven || []).forEach(b => {
    valScore(b, 'reviewkwaliteit', true);
    valScore(b, 'vakfocus', false);
  });
  // ---- auditspoor vakfocus: bron, website en 0,5-stappen moeten kloppen ---
  {
    const webByName = new Map(reviewData.map(c => [norm(c.bedrijf || ''), c.website || null]));
    const halveStap = v => typeof v === 'number' && (v * 2) % 1 !== 0;
    (beoordeling.bedrijven || []).forEach(b => {
      const site = webByName.get(norm(b.bedrijf || ''));
      if (typeof b.vakfocus === 'number' && b.vakfocusBron !== 'website')
        preWarnings.push('"' + b.bedrijf + '": vakfocus is ingevuld maar vakfocusBron is niet "website" — controleer beoordeling.json');
      if (b.vakfocus == null && b.vakfocusBron === 'website')
        preWarnings.push('"' + b.bedrijf + '": vakfocusBron is "website" maar vakfocus is null — controleer beoordeling.json');
      if (typeof b.vakfocus === 'number' && !site && !b.websiteBezocht)
        preWarnings.push('"' + b.bedrijf + '": vakfocus beoordeeld maar geen website-URL bekend (reviews.json noch websiteBezocht) — auditspoor ontbreekt');
      // v1 scoorde in vaste 0,5-stappen; v2 middelt meerdere runs → fijnere waarden
      // zijn dan net gewenst en mogen geen waarschuwing geven.
      if (P.EXPECT_HALF_STEPS && halveStap(b.reviewkwaliteit))
        preWarnings.push('"' + b.bedrijf + '": reviewkwaliteit ' + b.reviewkwaliteit + ' ligt niet op een 0,5-stap — controleer beoordeling.json');
      if (P.EXPECT_HALF_STEPS && halveStap(b.vakfocus))
        preWarnings.push('"' + b.bedrijf + '": vakfocus ' + b.vakfocus + ' ligt niet op een 0,5-stap — controleer beoordeling.json');
    });
  }
  // dubbele namen in reviews.json zouden dezelfde beoordeling delen — meld dat
  {
    const seen = new Set();
    for (const c of reviewData) {
      const n = norm(c.bedrijf || '');
      if (n && seen.has(n)) preWarnings.push('dubbele bedrijfsnaam in reviews.json: "' + c.bedrijf + '" — vestigingen worden niet samengevoegd en delen dezelfde beoordeling; controleer of dit klopt');
      seen.add(n);
    }
  }

  // ---------------- stap 1: per bedrijf tijdsgewogen statistieken --------
  const MS_JAAR = 365.25 * 24 * 3600 * 1000;
  const companies = [];
  const warnings = [...preWarnings];
  // Bedrijven waarvan de review-export vermoedelijk is afgekapt (bv. de Apify-
  // standaardlimiet van 100). Dat treft systematisch de grootste, gevestigde
  // spelers en vertekent hun vertrouwen-dimensie — daarom apart en prominent in
  // het rapport, niet verstopt tussen de overige waarschuwingen.
  const cappedExports = [];

  for (const c of reviewData) {
    if (!c.bedrijf) { warnings.push('bedrijf zonder naam overgeslagen'); continue; }
    const heeftGemeente = !!(c.gemeente && String(c.gemeente).trim());
    const inRegio = heeftGemeente && gemeentenNorm.has(norm(c.gemeente));
    // Geen waarschuwing voor een ontbrekende gemeente: die bedrijven krijgen
    // verderop een eigen, volledige rubriek in het rapport (GEEN LOCATIEDATA).
    // Ze hier óók melden was dubbelop en verdrong de echte signalen.
    const beo = beoMap.get(norm(c.bedrijf)) || null;

    let vw = 0, vwScore = 0, vw24 = 0, n24 = 0, nOK = 0, nieuwste = null;
    for (const r of (c.reviews || [])) {
      const d = new Date(r.datum + 'T00:00:00Z');
      if (isNaN(d) || typeof r.score !== 'number') continue;
      nOK++;
      const leeftijd = Math.max(0, (peildatum - d) / MS_JAAR);
      const w = Math.pow(0.5, leeftijd / HALFLIFE_JAREN);
      vw += w; vwScore += w * r.score;
      if (leeftijd <= 2) { vw24 += w; n24++; }
      if (!nieuwste || d > nieuwste) nieuwste = d;
    }
    const rawCount = typeof c.googleReviews === 'number' ? c.googleReviews : nOK;
    if (nOK < rawCount * 0.8 && rawCount >= MIN_REVIEWS) {
      warnings.push('"' + c.bedrijf + '": slechts ' + nOK + ' van ' + rawCount +
        ' reviews met bruikbare datum/score — controleer de export');
    }
    // Harde-cap-signatuur: exact 100 bruikbare reviews terwijl Google er meer telt.
    // Dat is vrijwel zeker de exportlimiet, niet toeval. Verzamel apart zodat het
    // rapport kan tonen of een afgekapt bedrijf ook echt in de selectie staat.
    if (nOK === 100 && rawCount > 100) {
      cappedExports.push({ naam: c.bedrijf, nOK, rawCount });
    }

    // Ontbrekende beoordeling — alleen melden als ze dit bedrijf ook echt een
    // plaats KOST: het ligt in de gemeentelijst en haalt de objectieve drempels.
    //
    // Vroeger werd elk bedrijf zonder beoordeling gemeld, ook de honderden buiten
    // de regio of met drie reviews, waarvoor "geen beoordeling" juist de normale
    // gang van zaken is. Dat was 96% van alle waarschuwingen over alle pagina's
    // samen (1268 van 1318) en het begroef de meldingen die er wél toe doen —
    // dubbele bedrijfsnamen en afgekapte review-exports.
    if (!beo && inRegio && rawCount >= MIN_REVIEWS && n24 >= MIN_RECENT) {
      warnings.push('"' + c.bedrijf + '": geen entry in beoordeling.json, terwijl het bedrijf wél aan de ' +
        'objectieve opnamecriteria voldoet (' + rawCount + ' reviews, ' + n24 + ' in 24m) — het valt ' +
        'daardoor uit de selectie. Vul de beoordeling aan of controleer de schrijfwijze van de naam.');
    }

    const Rw = vw > 0 ? vwScore / vw : null;
    companies.push({
      naam: c.bedrijf,
      gemeente: c.gemeente || '',
      website: c.website || null,
      googleScore: typeof c.googleScore === 'number' ? c.googleScore : null,
      googleReviews: rawCount,
      actiefSinds: (beo && beo.actiefSinds) || c.actiefSinds || null,
      // Door het bedrijf zelf doorgegeven WhatsApp-nummer (of null). Bewust hier
      // en nergens anders: het speelt geen enkele rol in eligible/composite/pickTop.
      whatsapp: waMap.get(norm(c.bedrijf || '')) || null,
      inRegio, beo,
      vw, Rw, n24, nOK,
      recency: vw > 0 ? Math.min(n24 / P.RECENCY_ANCHOR, 1) : 0,
      // v3+: opname vereist óók een geverifieerde eigen website. Het signaal is
      // beo.vakfocusBron === 'website' (de LLM heeft een échte, aan het bedrijf
      // gekoppelde site bezocht en beoordeeld). Bedrijven zonder betrouwbare site —
      // geen site, enkel social media, of een onbereikbare/kapotte site — horen niet
      // op de publieke pagina. v1/v2-pagina's (vastgepind) kennen deze eis NIET en
      // blijven byte-voor-byte identiek.
      // v4+: opname vereist bovendien dat het bedrijf een échte vakspecialist is —
      // vakfocus ≥ VAKFOCUS_FLOOR. Zo vallen bedrijven van een ánder vak die toevallig
      // in de zoekresultaten opdoken (bakkerij, ramenplaatser, materialenleverancier,
      // brede totaalaannemer …) deterministisch weg. v1/v2/v3-pagina's kennen deze eis
      // NIET en blijven byte-voor-byte identiek.
      eligible: inRegio && rawCount >= MIN_REVIEWS && n24 >= MIN_RECENT && vw > 0 && !!beo &&
        (methodiekVersie < 3 || (beo && beo.vakfocusBron === 'website')) &&
        (methodiekVersie < 4 || (beo && typeof beo.vakfocus === 'number' && beo.vakfocus >= P.VAKFOCUS_FLOOR))
    });
  }

  const eligible = companies.filter(c => c.eligible);
  if (!eligible.length) throw new RekenFout('geen enkel bedrijf voldoet aan de opnamecriteria — controleer gemeenten/peildatum/reviews');

  // ---------------- stap 2: regiobasis (prior C) --------------------------
  const C = eligible.reduce((s, c) => s + c.Rw, 0) / eligible.length;

  // mediaan-vakfocus voor bedrijven zonder website
  const focusVals = eligible
    .filter(c => c.beo && typeof c.beo.vakfocus === 'number')
    .map(c => (c.beo.vakfocus - 1) / 4);
  const focusMediaan = focusVals.length ? median(focusVals) : 0.5;

  // ---------------- stap 3: dimensies + composite -------------------------
  for (const c of eligible) {
    const bayes = (c.vw / (c.vw + BAYES_M)) * c.Rw + (BAYES_M / (c.vw + BAYES_M)) * C;
    c.trust = clamp((bayes - TRUST_FLOOR) / (TRUST_CEIL - TRUST_FLOOR), 0, 1);
    c.bayes = bayes;
    c.rq = clamp(((c.beo.reviewkwaliteit || 3) - 1) / 4, 0, 1);
    c.focus = (typeof c.beo.vakfocus === 'number')
      ? clamp((c.beo.vakfocus - 1) / 4, 0, 1)
      : focusMediaan;
    c.composite =
      WEIGHTS.trust * c.trust +
      WEIGHTS.reviewQuality * c.rq +
      WEIGHTS.recency * c.recency +
      WEIGHTS.focus * c.focus;

    // Het objectieve deel van de composite (vertrouwen + recentheid) ligt vast;
    // enkel de twee subjectieve LLM-dimensies worden in de robuustheidstest
    // hieronder verstoord. We bewaren de LLM-basiswaarden om die test te voeden.
    c._objDeel = WEIGHTS.trust * c.trust + WEIGHTS.recency * c.recency;
    c._rqBase = (c.beo.reviewkwaliteit || 3);
    c._focusBase = (typeof c.beo.vakfocus === 'number') ? c.beo.vakfocus : null; // null = regiomediaan
  }

  // deterministische sortering: composite ↓, dan gewogen volume ↓, dan naam ↑
  eligible.sort((a, b) =>
    b.composite - a.composite || b.vw - a.vw || a.naam.localeCompare(b.naam, 'nl'));

  // ---------------- stap 4: hoeveel tonen we? Top 10 of Top 5 -------------
  // Voldoende eligible bedrijven → Top 10; anders Top 5. Nooit meer tonen dan
  // er eligible zijn (bij < 5 eligible wordt het bv. netjes "Top 3").
  // Publicatie vs. opname. OPNAME (eligible) blijft ≥ MIN_REVIEWS — dat is de
  // publieke drempel. Om ook echt GEPUBLICEERD te worden in de Top N vergt v2
  // ≥ PUBLISH_MIN_REVIEWS reviews, zodat "een van de beste van de regio" nooit op
  // flinterdun bewijs steunt. In v1 is die drempel gelijk aan de opnamedrempel,
  // dus dan verandert er niets.
  const isPublishable = c => c.googleReviews >= P.PUBLISH_MIN_REVIEWS;

  // Selectie uit een op composite gesorteerde lijst: eerst de bedrijven met genoeg
  // bewijs (publishable), daarna — enkel om de lijst te vullen in een dunne regio —
  // de sterkste eligible bedrijven die de publicatiedrempel niet halen. Zo valt
  // flinterdun bewijs weg zodra er genoeg alternatieven zijn, terwijl een dunne
  // regio nooit leeg oogt.
  function pickTop(sorted, n) {
    const pub = sorted.filter(isPublishable);
    const sub = sorted.filter(c => !isPublishable(c));
    return pub.concat(sub).slice(0, n);
  }

  // Diepte = aantal bedrijven met VOLDOENDE BEWIJS (publishable), niet louter
  // eligible. We tonen dus enkel een Top 10 als er ook echt 10 goed onderbouwde
  // bedrijven zijn. (v1: publishable == eligible → identiek gedrag als voorheen.)
  const publishableCount = eligible.filter(isPublishable).length;
  // Diepte-maat. v1–v3: het aantal GOED ONDERBOUWDE bedrijven (publishable, ≥15).
  // v4: het aantal eligible VAKSPECIALISTEN — die zijn dankzij de vakfocus-vloer
  // écht van het vak, dus "genoeg specialisten" is de juiste maat voor de diepgang.
  // Zo krijgt een regio met ≥10 specialisten een Top 10, ook als enkele daarvan
  // 10–14 reviews hebben (≥15 blijft enkel een "goed onderbouwd"-label in rapport
  // en prospectie). Zie METHODIEK_PARAMS[4].
  const depthCount = methodiekVersie >= 4 ? eligible.length : publishableCount;
  const nListed = Math.min(
    depthCount >= SMALL_REGION_THRESHOLD ? LISTED_FULL : LISTED_SMALL,
    eligible.length
  );
  const vignet = 'Top ' + nListed;                 // publiek label i.p.v. cijfer
  // v4: zuiver op composite (eligible is al composite-gesorteerd). v1–v3: publishable
  // eerst, sub-drempel enkel als opvulling in een dunne regio (pickTop).
  const top = methodiekVersie >= 4 ? eligible.slice(0, nListed) : pickTop(eligible, nListed);
  top.forEach((c, i) => { c.positie = i + 1; });   // rangnummer, geen score
  const topSet = new Set(top);

  return {
    // de gekozen methodiek en wat ze voorschrijft
    methodiekVersie, P, TRUST_FLOOR, vakDef, peildatum,
    // alle bedrijven uit reviews.json, met hun tussenresultaten
    bedrijven: companies,
    // de bedrijven die aan de opnamecriteria voldoen, gesorteerd op composite
    eligible,
    // de gepubliceerde Top N (met .positie) en dezelfde verzameling als Set
    selectie: top,
    selectieSet: topSet,
    nListed, vignet,
    // regiobasis en hulpwaarden die het rapport toont
    prior: C,
    focusMediaan,
    publishableCount,
    isPublishable,
    cappedExports,
    // meldingen over de data; build.js voegt er tijdens het renderen nog aan toe
    warnings,
  };
}

module.exports = {
  bereken,
  RekenFout,
  // publieke constanten — bindende bron, ook voor METHODIEK.md
  WEIGHTS, HALFLIFE_JAREN, BAYES_M, MIN_REVIEWS, MIN_RECENT,
  LISTED_FULL, LISTED_SMALL, SMALL_REGION_THRESHOLD, TRUST_CEIL,
  METHODIEK_LATEST, METHODIEK_PARAMS, VAKDEF_BY_NICHE,
  // helpers die build.js en de tests delen
  clamp, median, norm,
};
