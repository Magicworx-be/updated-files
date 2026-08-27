#!/usr/bin/env node
// =====================================================================
// build.js — Keurwijzer ranking-engine + paginagenerator
//            >>> VARIANT "TOP 10-CONCEPT" (geen zichtbare score op 10) <<<
//
// Gebruik:  node build.js <slug>
// Voorbeeld: node build.js dakwerkers-gent
//
// Leest:
//   config/<slug>.json            pagina-instellingen (vak, regio, gemeenten, peildatum)
//   data/<slug>/reviews.json      genormaliseerde reviews (via scripts/normalize.js)
//   data/<slug>/beoordeling.json  LLM-output (reviewkwaliteit, vakfocus, synthese, chips)
//   template.html                 design-template
//
// Schrijft:
//   output/<slug>.html                  de statische directorypagina (enkel de Top N)
//   output/<slug>-rapport.txt           controlerapport met alle tussenscores
//   output/<slug>-prospectie-dasslim.md prospectielijst (11–20 + nog-niet-eligible) voor dasslim.be
//
// WAT VERSCHILT MET HET ORIGINEEL:
//   - De site toont GEEN cijfer op 10 meer. In plaats daarvan een vignet
//     "Top 10" of "Top 5" en een rangnummer (#1..#N). De volgorde blijft
//     behouden (composite), enkel het cijfer verdwijnt van de pagina.
//   - Het aantal getoonde bedrijven is dynamisch: Top 10 bij voldoende
//     diepgang, Top 5 in een dunne regio (weinig eligible bedrijven).
//   - Bedrijven 11–20 en de niet-eligible bedrijven staan NIET meer op de
//     site. Ze blijven in het rapport en komen in een apart prospectie-
//     document voor dasslim.be.
//
// ALLE berekeningen gebeuren hier, deterministisch. De LLM beoordeelt
// alleen tekst (reviewkwaliteit, vakfocus, synthese) — nooit de eindscore,
// de selectie of de volgorde.
//
// Methodiek:
//   - Reviewgewicht:  w = 0.5 ^ (leeftijd_in_jaren / HALFLIFE_JAREN)
//   - Vertrouwen:     tijdsgewogen Bayes  W = v/(v+m)·R + m/(v+m)·C
//                     met v = som van gewichten, R = gewogen gem. score,
//                     C = gem. gewogen score van alle opgenomen bedrijven
//   - Recentheid:     min(aantal reviews laatste 24m / 6, 1)
//   - Reviewkwaliteit / Vakfocus: (LLM-score − 1) / 4;
//     geen website → mediaan-vakfocus van bedrijven mét website
//   - Composite = 35% vertrouwen + 30% reviewkwaliteit + 15% recentheid + 20% vakfocus
//   - Selectie + volgorde: de bedrijven met de hoogste composite vormen de Top N;
//     er wordt GEEN cijfer meer op 10 gepubliceerd (enkel het rangnummer + vignet).
//   - Opname: gemeente in lijst + ≥ MIN_REVIEWS reviews + ≥ MIN_RECENT in 24m
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

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
// elke regio". Wat per versie verschilt, is uitsluitend INTERNE kalibratie die
// de publieke paginatekst niet noemt: waar de vertrouwen-normalisatie op 0 valt,
// de recentheid-verzadiging, en een aparte publicatiedrempel bovenop de opname.
//
// Bestaande pagina's staan vastgepind op v1 (`"methodiek": 1` in hun config) en
// veranderen dus nooit. Nieuwe configs zonder veld krijgen automatisch de
// nieuwste versie. Zo blijft "zelfde data = zelfde resultaat" gelden én kan de
// methodiek verbeteren zonder één gepubliceerde pagina te breken.
const METHODIEK_LATEST = 3;
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
  }
};

// Vak-specifiek schema.org-subtype voor de bedrijven in de JSON-LD ItemList (v3+).
// Elk subtype is een afstammeling van HomeAndConstructionBusiness (de veilige
// fallback), dus onbekende niches blijven geldig gemarkeerd. Voeg een niche toe
// zodra je zeker bent van het juiste schema.org-type (bij twijfel: fallback laten
// staan — nooit een type verzinnen). Een config kan dit overrulen via vak.schemaType.
const SCHEMA_TYPE_BY_NICHE = {
  dakwerkers: 'RoofingContractor',
  dakdekkers: 'RoofingContractor'
};

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

const EXTRA_MAX = 10;         // 11–20: niet op de site, wél in het prospectiedocument (dasslim.be)
const WATCHLIST_MAX = 10;     // niet-eligible in de regio: niet op de site, wél in rapport + prospectie
// TRUST_FLOOR is versie-afhankelijk (zie METHODIEK_PARAMS hierboven).
const TRUST_CEIL = 5.0;      // Bayes-score die op 1 genormaliseerd wordt (alle versies)

// ---------------- helpers ---------------------------------------------
function die(msg) { console.error('FOUT: ' + msg); process.exit(1); }
function readJSON(p) {
  if (!fs.existsSync(p)) die('bestand niet gevonden: ' + p);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { die('ongeldige JSON in ' + p + ' — ' + e.message); }
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function nlNum(x, dec) { return x.toFixed(dec).replace('.', ','); }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function median(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function norm(name) { return String(name).toLowerCase().replace(/\s+/g, ' ').trim(); }
// Slug voor chips én badge-bestandsnamen. Eén bron met de navigatie-slugs:
// delegeert naar lib/registry.js `slugify`, zodat beide niet uiteenlopen
// (o.a. identieke accentafhandeling, inclusief ç). R wordt hieronder ingeladen;
// elke aanroep gebeurt ruim ná die require.
function chipSlug(label) { return R.slugify(label); }
function chipLabel(slug) {
  const s = String(slug).replace(/-/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// Zoekt de config plat (config/<slug>.json) of in één niche-submap
// (config/<niche>/<slug>.json). Geeft { configPath, niche } terug;
// niche is null bij een platte config.
function findConfig(slug) {
  const flat = path.join(ROOT, 'config', slug + '.json');
  if (fs.existsSync(flat)) return { configPath: flat, niche: null };
  const configDir = path.join(ROOT, 'config');
  if (fs.existsSync(configDir)) {
    for (const entry of fs.readdirSync(configDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = path.join(configDir, entry.name, slug + '.json');
      if (fs.existsSync(p)) return { configPath: p, niche: entry.name };
    }
  }
  die('config niet gevonden: config/' + slug + '.json of config/<niche>/' + slug + '.json');
}

// ---------------- input inlezen ----------------------------------------
const slug = process.argv[2];
if (!slug) die('gebruik: node build.js <slug>   (bv. node build.js dakwerkers-gent)');

const ROOT = __dirname;
const { configPath, niche } = findConfig(slug);
const config = readJSON(configPath);
const reviewData = readJSON(path.join(ROOT, 'data', slug, 'reviews.json'));
const beoordeling = readJSON(path.join(ROOT, 'data', slug, 'beoordeling.json'));
const template = fs.readFileSync(path.join(ROOT, 'template.html'), 'utf8');

// Centrale paginaregistry (alle config/<niche>/*.json) — bron voor broodkruimel,
// kruislinks, hubs en sitemap. De huidige pagina zoeken we erin op via de slug.
const R = require('./lib/registry');
const registry = R.loadRegistry(ROOT);
const pageEntry = registry.find(e => e.slug === slug) || null;

['vak', 'regio', 'gemeenten', 'peildatum', 'updateDatum'].forEach(k => {
  if (!config[k]) die('config mist veld "' + k + '"');
});
if (!config.vak.mv) die('config mist veld "vak.mv"');
if (!config.regio.naam || !config.regio.kern || !config.regio.provincie)
  die('config.regio mist "naam", "kern" of "provincie"');
const peildatum = new Date(config.peildatum + 'T00:00:00Z');
if (isNaN(peildatum)) die('config.peildatum is geen geldige datum (verwacht JJJJ-MM-DD)');

// Methodiek-versie kiezen: expliciet in de config, anders de nieuwste. Nieuwe
// pagina's krijgen dus automatisch de beste logica; bestaande staan vastgepind.
const methodiekVersie = config.methodiek || METHODIEK_LATEST;
const P = METHODIEK_PARAMS[methodiekVersie];
if (!P) die('onbekende methodiek-versie in config: ' + methodiekVersie +
  ' (bekend: ' + Object.keys(METHODIEK_PARAMS).join(', ') + ')');
const TRUST_FLOOR = P.TRUST_FLOOR;

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
  if (!heeftGemeente) warnings.push('"' + c.bedrijf + '": geen gemeente in de data — weggelaten (geen locatiedata → altijd weglaten)');
  const beo = beoMap.get(norm(c.bedrijf)) || null;
  if (!beo) warnings.push('geen beoordeling.json-entry voor "' + c.bedrijf + '" (reviewkwaliteit/vakfocus/synthese ontbreken)');

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

  const Rw = vw > 0 ? vwScore / vw : null;
  companies.push({
    naam: c.bedrijf,
    gemeente: c.gemeente || '',
    website: c.website || null,
    googleScore: typeof c.googleScore === 'number' ? c.googleScore : null,
    googleReviews: rawCount,
    actiefSinds: (beo && beo.actiefSinds) || c.actiefSinds || null,
    inRegio, beo,
    vw, Rw, n24, nOK,
    recency: vw > 0 ? Math.min(n24 / P.RECENCY_ANCHOR, 1) : 0,
    eligible: inRegio && rawCount >= MIN_REVIEWS && n24 >= MIN_RECENT && vw > 0 && !!beo
  });
}

const eligible = companies.filter(c => c.eligible);
if (!eligible.length) die('geen enkel bedrijf voldoet aan de opnamecriteria — controleer gemeenten/peildatum/reviews');

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
const nListed = Math.min(
  publishableCount >= SMALL_REGION_THRESHOLD ? LISTED_FULL : LISTED_SMALL,
  eligible.length
);
const vignet = 'Top ' + nListed;                 // publiek label i.p.v. cijfer
const top = pickTop(eligible, nListed);
top.forEach((c, i) => { c.positie = i + 1; });   // rangnummer, geen score
const topSet = new Set(top);

// ---------------- stap 4b: robuustheidstest (alleen voor het rapport) ----
// Vraag: welke gepubliceerde posities staan écht vast en welke zijn een
// dobbelworp? We verstoren de twee SUBJECTIEVE LLM-dimensies (reviewkwaliteit,
// vakfocus) van élk eligible bedrijf met een toevallige ±0,5 (één volle
// beoordelaarsstap) en tellen hoe vaak elk Top-N-bedrijf in de Top N blijft.
// Vertrouwen en recentheid zijn objectief berekend en blijven onaangeroerd;
// vakfocus uit de regiomediaan (geen website) is geen per-bedrijf LLM-oordeel
// en wordt ook niet verstoord. Determinisme blijft behouden: de PRNG heeft een
// vaste seed, dus zelfde data = exact hetzelfde robuustheidsoordeel. Dit
// verandert NIETS aan de gepubliceerde composite, selectie of volgorde.
{
  const TRIALS = 5000;
  let seed = 0x9e3779b9 >>> 0;                    // vaste seed → reproduceerbaar
  const rnd = () => {                             // mulberry32
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const jit = () => (rnd() - 0.5);                // uniform in [-0,5 ; +0,5]
  const inTopCount = new Array(top.length).fill(0);
  const posSamples = top.map(() => []);
  const scratch = eligible.map(c => ({ ref: c, s: 0 }));
  for (let t = 0; t < TRIALS; t++) {
    for (const o of scratch) {
      const c = o.ref;
      const rq = clamp((clamp(c._rqBase + jit(), 1, 5) - 1) / 4, 0, 1);
      const focus = (c._focusBase == null)
        ? c.focus
        : clamp((clamp(c._focusBase + jit(), 1, 5) - 1) / 4, 0, 1);
      o.s = c._objDeel + WEIGHTS.reviewQuality * rq + WEIGHTS.focus * focus;
    }
    scratch.sort((a, b) => b.s - a.s || b.ref.vw - a.ref.vw ||
      a.ref.naam.localeCompare(b.ref.naam, 'nl'));
    // Rang zoals de bezoeker hem ziet: publishable-first, exact zoals pickTop.
    // De publicatiedrempel hangt van het (niet-verstoorde) reviewaantal af, dus
    // de kandidatenpool ligt vast; enkel de volgorde binnen elke groep wisselt.
    const ordered = scratch.filter(o => isPublishable(o.ref))
      .concat(scratch.filter(o => !isPublishable(o.ref)));
    const rankOf = new Map();
    ordered.forEach((o, i) => rankOf.set(o.ref, i + 1));
    top.forEach((c, i) => {
      const r = rankOf.get(c);
      if (r <= nListed) inTopCount[i]++;
      posSamples[i].push(r);
    });
  }
  const pct = (arr, q) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };
  top.forEach((c, i) => {
    c.stabiliteit = inTopCount[i] / TRIALS;       // kans om in Top N te blijven
    c.posP05 = pct(posSamples[i], 0.05);
    c.posP95 = pct(posSamples[i], 0.95);
  });
}

// ---------------- stap 5: 11–20 (niet op de site, wél voor prospectie) --
// De sterkste eligible bedrijven die NIET in de selectie staan — in composite-
// volgorde. Dat kan ook een hoog scorend bedrijf zijn dat enkel de publicatie-
// drempel (nog) niet haalt; dat is juist een warme lead ("bijna, u mist alleen
// nog reviews"). We markeren die grond apart in het prospectiedocument.
const naSelectie = eligible.filter(c => !topSet.has(c));   // reeds op composite gesorteerd
const extra = naSelectie.slice(0, EXTRA_MAX);

// ---------------- stap 6: niet-eligible bedrijven binnen de regio -------
// (niet meer op de site; blijven in rapport + prospectiedocument)
const wlReden = c => {
  if (!c.inRegio) return null;
  if (c.googleReviews < MIN_REVIEWS)
    return 'Nog te weinig Google-reviews (' + c.googleReviews + ' van min. ' + MIN_REVIEWS + ') om betrouwbaar te beoordelen.';
  if (c.n24 < MIN_RECENT)
    return 'Nog te weinig recente reviews (' + c.n24 + ' in de laatste 24 maanden, min. ' + MIN_RECENT + ') voor een actuele beoordeling.';
  if (!c.beo) return 'Beoordeling nog niet afgerond.';
  return 'Voldoet op dit moment niet aan de opnamecriteria.';
};
const watchlist = companies
  .filter(c => !c.eligible && c.inRegio)
  .sort((a, b) => b.googleReviews - a.googleReviews || a.naam.localeCompare(b.naam, 'nl'))
  .slice(0, WATCHLIST_MAX);

// ---------------- stap 7: HTML-blokken (enkel de Top N) ------------------
function chipsHTML(c) {
  const parts = [];
  const beo = c.beo || {};
  (beo.specialties || []).slice(0, 4).forEach(s =>
    parts.push('<span class="chip" data-specialty="' + esc(chipSlug(s)) + '">' + esc(chipLabel(s)) + '</span>'));
  (beo.chipsSite || []).slice(0, 2).forEach(s =>
    parts.push('<span class="chip tag-site">' + esc(s) + '</span>'));
  (beo.chipsReview || []).slice(0, 2).forEach(s =>
    parts.push('<span class="chip tag-review">' + esc(s) + '</span>'));
  return parts.join('\n              ');
}

function siteHost(url) {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return null; }
}

// Neutraal kwaliteitszegel: identiek op elke kaart (groene cirkel met wit vinkje).
// Geen rangnummer, geen "Top N" — de pagina toont een brede selectie van de best
// beoordeelde vakspecialisten, niet een genummerde ranglijst.
const sealHTML =
  '<div class="seal" role="img" aria-label="Opgenomen in de Keurwijzer-selectie">' +
  '<svg class="seal-check" viewBox="0 0 24 24"><use href="#i-check"/></svg></div>';

// Eén kaart per opgenomen bedrijf. Geen cijfer op 10: links het rangnummer
// (#1..#N) in een medaille, rechtsboven het "Top N"-vignet. De synthese en
// chips blijven zoals voorheen.
function articleHTML(c) {
  const gstar = c.googleScore != null ? '★ ' + nlNum(c.googleScore, 1) : '★ —';
  const actief = c.actiefSinds
    ? '<span class="sep">·</span>\n              <span>Actief sinds ' + esc(c.actiefSinds) + '</span>' : '';
  const host = c.website ? siteHost(c.website) : null;
  const foot = host
    ? '<span class="co-meta"><svg viewBox="0 0 24 24"><use href="#i-info"/></svg>' + esc(c.gemeente) + ' · ' + esc(host) + '</span>\n' +
      '              <a class="co-link" href="' + esc(c.website) + '" rel="noopener noreferrer" target="_blank">Naar website <span class="arr">→</span></a>'
    : '<span class="co-meta"><svg viewBox="0 0 24 24"><use href="#i-info"/></svg>' + esc(c.gemeente) + '</span>';
  const desc = (c.beo && c.beo.synthese) || '';
  // Nummerloos vignet: elke kaart draagt dezelfde Top N-medaille (geen rangnummer).
  // De volgorde blijft impliciet zichtbaar via de plaats in de lijst.
  const badge = '<span class="badge ver"><svg viewBox="0 0 24 24"><use href="#i-shield"/></svg>Geverifieerd</span>';

  return `      <article class="company"
        data-google-score="${c.googleScore != null ? c.googleScore : ''}"
        data-google-reviews="${c.googleReviews}"
        data-positie="${c.positie}">
        <div class="co-grid">
          ${sealHTML}
          <div class="co-body">
            <div class="co-top">
              <div>
                <div class="co-name">${esc(c.naam)}</div>
                <div class="co-loc"><svg viewBox="0 0 24 24"><use href="#i-pin"/></svg>${esc(c.gemeente)} · ${esc(config.regio.naam)}</div>
              </div>
              ${badge}
            </div>
            <div class="co-data">
              <span class="gstar">${gstar}</span>
              <span class="rev"><b>${c.googleReviews}</b> Google-reviews</span>
              ${actief}
            </div>
            <div class="chips">
              ${chipsHTML(c)}
            </div>
            <p class="co-desc">${esc(desc)}</p>
            <div class="co-foot">
              ${foot}
            </div>
          </div>
        </div>
      </article>`;
}

const companiesHTML = top.map(c => articleHTML(c)).join('\n\n');

// Gededupliceerde gemeentelijst (synthetische fusienamen als "Merelbeke-Melle"
// weg als beide losse delen ook in de lijst staan — die staan enkel in de config
// voor de matching, niet om te tonen/adverteren). Zie geheugen. Wordt hieronder
// hergebruikt voor zowel de zichtbare lijst als de JSON-LD areaServed.
const gemeentenSet = new Set(config.gemeenten);
function isFusieDuplicaat(naam) {
  for (let p = naam.indexOf('-'); p > 0; p = naam.indexOf('-', p + 1)) {
    if (gemeentenSet.has(naam.slice(0, p)) && gemeentenSet.has(naam.slice(p + 1))) return true;
  }
  return false;
}
const gemeentenUniek = config.gemeenten.filter(g => !isFusieDuplicaat(g));

// areaServed — versie-afhankelijk. v1 (vastgepinde pagina's): enkel de regionaam
// als string, byte-voor-byte identiek aan de vroegere output. v2 (nieuwe pagina's):
// de regio + elke gemeente, zodat zoekmachines de dekking per plaats zien.
const areaServed = methodiekVersie >= 2
  ? [config.regio.naam, ...gemeentenUniek]
  : config.regio.naam;

// v3-only presentatie. v1/v2 blijven byte-voor-byte identiek: alle v3-sleutels
// worden voorwaardelijk toegevoegd, dus voor v1/v2 is het object ongewijzigd.
const isV3 = methodiekVersie >= 3;
// Vak-specifiek schema.org-subtype (v3): config-override → niche-map → veilige
// generieke fallback. v1/v2 houden bewust HomeAndConstructionBusiness.
const bedrijfType = (config.vak && config.vak.schemaType) ||
  SCHEMA_TYPE_BY_NICHE[niche] || 'HomeAndConstructionBusiness';
// Canonical alvast hier (ook nodig voor de @id-verwijzingen in de entiteitengraph
// verderop). De latere const is verwijderd; dit is dezelfde waarde.
const canonical = config.canonical || ('https://keurwijzer.be/' + slug + '/');

const jsonld = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'ItemList',
  ...(isV3 && { '@id': canonical + '#selectie' }),
  name: config.vak.mvCap + ' in ' + config.regio.naam,
  description: config.vak.mvCap + ' in ' + config.regio.naam + ', geselecteerd volgens de Keurwijzer-kwaliteitsmethodiek.',
  ...(isV3 && { numberOfItems: top.length, itemListOrder: 'https://schema.org/ItemListOrderDescending' }),
  itemListElement: top.map((c, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: {
      '@type': isV3 ? bedrijfType : 'HomeAndConstructionBusiness', name: c.naam,
      address: { '@type': 'PostalAddress', addressLocality: c.gemeente, addressRegion: config.regio.provincie, addressCountry: 'BE' },
      areaServed: areaServed,
      ...(c.website && { url: c.website })
    }
  }))
}, null, 1);

// ---------------- stap 8: template invullen ------------------------------
const gemeentenKort = config.gemeenten.length > 4
  ? config.gemeenten.slice(0, 3).join(', ') + ' en ' + (config.gemeenten.length - 3) + ' andere gemeenten'
  : config.gemeenten.join(', ');

// Volledige, zichtbare gemeentelijst voor het samenvattingsblok (SEO: elke
// gemeentenaam als crawlbare tekst). gemeentenUniek is hierboven al afgeleid.
const gemeentenVolledig = gemeentenUniek.length > 1
  ? gemeentenUniek.slice(0, -1).join(', ') + ' en ' + gemeentenUniek[gemeentenUniek.length - 1]
  : gemeentenUniek.join(', ');

// Waar tonen we de volledige gemeentelijst? — versie-afhankelijk (SEO-vindbaarheid
// per plaats, bv. iemand die zoekt op "dakwerker Berlare"). De regionaam blijft
// altijd het zwaarste SEO-signaal (titel + H1 + start van de meta); de gemeenten
// zijn een subtiele, aanvullende laag.
//   v1 (bestaande, vastgepinde pagina's): lijst enkel INGEKLAPT in het cijferpaneel
//       → GEMEENTEN_ZICHTBAAR leeg, GEMEENTEN_COLLAPSED = de bestaande regel.
//       Output blijft byte-voor-byte identiek — gepubliceerde pagina's veranderen niet.
//   v2 (nieuwe pagina's): lijst één keer ZICHTBAAR onder de samenvatting, en dus
//       weggelaten uit het ingeklapte paneel (geen dubbele lijst).
const toonGemeentenZichtbaar = methodiekVersie >= 2;
// De kern (bv. "Dendermonde") is al het zwaarste SEO-term (titel/H1/hero); we
// laten hem uit de opsomming zodat de zin natuurlijk leest ("heel Dendermonde en
// omstreken — waaronder <de rest>"). Elke overige gemeente verschijnt zo één keer
// zichtbaar. Valt de lijst zonder kern leeg, dan tonen we toch de volledige lijst.
const gemeentenOmstreken = gemeentenUniek.filter(g => norm(g) !== norm(config.regio.kern));
const gemeentenLijst = gemeentenOmstreken.length ? gemeentenOmstreken : gemeentenUniek;
const gemeentenOmstrekenTekst = gemeentenLijst.length > 1
  ? gemeentenLijst.slice(0, -1).join(', ') + ' en ' + gemeentenLijst[gemeentenLijst.length - 1]
  : gemeentenLijst.join(', ');
// Subtiele, zichtbare regel — inline gestyled zodat de gedeelde stylesheet (en
// dus de v1-pagina's) ongemoeid blijft. Leeg op v1: de token verdwijnt spoorloos
// (staat direct achter </p>), zodat de v1-HTML byte-voor-byte identiek blijft.
const gemeentenZichtbaar = toonGemeentenZichtbaar
  ? '\n      <p style="font-size:14px;color:var(--faint);line-height:1.7;margin:12px 0 0;max-width:100%">' +
    'Deze selectie geldt voor heel ' + esc(config.regio.kern) +
    ' en omstreken — waaronder ' + esc(gemeentenOmstrekenTekst) + '.</p>'
  : '';
// v1-pad gebruikt bewust de ruwe waarden (net als de vroegere tokens), zodat de
// gepubliceerde pagina's byte-voor-byte identiek blijven.
const gemeentenCollapsed = toonGemeentenZichtbaar
  ? ''
  : '<p class="summary-gemeenten"><strong>Opgenomen gemeenten (' + gemeentenUniek.length +
    '):</strong> ' + gemeentenVolledig + '.</p>';

// ---- afgeleide feiten voor het samenvattingsblok (deterministisch) -----
const inRegioComps = companies.filter(c => c.inRegio);
const totaalReviews = inRegioComps.reduce((s, c) => s + c.nOK, 0);
const gScores = inRegioComps.filter(c => c.googleScore != null).map(c => c.googleScore);
const regioGemiddelde = gScores.length
  ? nlNum(gScores.reduce((s, x) => s + x, 0) / gScores.length, 1) : '—';

const samenvatting =
  'Keurwijzer analyseerde ' + totaalReviews + ' Google-reviews van ' +
  inRegioComps.length + ' ' + config.vak.mv + ' in ' + config.regio.naam +
  ' (peildatum ' + config.peildatum + '). ' + eligible.length +
  ' bedrijven voldoen aan de opnamecriteria (minstens ' + MIN_REVIEWS +
  ' Google-reviews én minstens ' + MIN_RECENT + ' reviews in de laatste 24 maanden). ' +
  'De ' + nListed + ' sterkste daarvan vormen de selectie die op deze pagina verschijnt, ' +
  'geselecteerd volgens onze vaste, publieke kwaliteitsmethodiek.';

// canonical is hierboven al gedefinieerd (bij de JSON-LD ItemList).
const heroImg = (config.hero && config.hero.img) || ('img/' + config.vak.mv + '.jpg');
const heroAlt = (config.hero && config.hero.alt) ||
  (config.vak.ev ? 'Een ' + config.vak.ev + ' aan het werk in ' + config.regio.naam
                 : config.vak.mv + ' aan het werk in ' + config.regio.naam);

const syn = (config.vak && config.vak.syn) || null;
const vakEv = config.vak.ev || '';
const synMvPar = (syn && syn.mv) ? ' (ook wel ' + syn.mv + ')' : '';
const faqZoekterm = (syn && syn.ev && vakEv) ? (vakEv + ' of ' + syn.ev)
                  : (vakEv || 'vakspecialist');

// Backend-tekst (meta/OG/Twitter/JSON-LD) — bewust dezelfde boodschap als de
// frontend-hero: "de best beoordeelde ... volgens een vaste, publieke methodiek op
// basis van klantgetuigenissen en vakspecialiteit". Vertrekt van de frontend-copy.
let metaDesc = 'De best beoordeelde ' + config.vak.mv + ' in ' + config.regio.naam +
  ', geselecteerd volgens een vaste, publieke methodiek op basis van de getuigenissen van ' +
  'klanten en de vakspecialiteit van het bedrijf. Onafhankelijk — een plaats is niet te koop.';
// Nieuwe pagina's (v2): de gemeenten óók in de meta, ná de kernboodschap. De
// regionaam staat vooraan (zwaarste signaal); de gemeentelijst is aanvullend en
// mag door de zoekmachine ingekort worden — hij staat sowieso in de HTML voor
// zoekmachines en taalmodellen. v1-pagina's houden hun bestaande, kortere meta.
if (toonGemeentenZichtbaar)
  metaDesc += ' Ook actief in ' + gemeentenOmstrekenTekst + '.';

const geoRegion = R.GEO_CODES[norm(config.regio.provincie)] || 'BE';
if (geoRegion === 'BE')
  warnings.push('provincie "' + config.regio.provincie + '" niet herkend voor geo.region — teruggevallen op "BE"');

const sector = (config.vak.kort || config.vak.mv).charAt(0).toUpperCase() +
               (config.vak.kort || config.vak.mv).slice(1);

const ogImage = new URL(heroImg, canonical).href;

// ===== Navigatie-architectuur: broodkruimel + kruislinks =================
// Alles hieronder komt uit lib/registry.js en verschijnt automatisch zodra er
// meer configs bijkomen — geen enkele link wordt handmatig onderhouden.
//   - naburige regio's (zelfde niche) : voor SEO-clustering én de bezoeker
//   - andere vakgebieden (zelfde regio): de tweede funnel
//   - broodkruimel (zichtbaar + JSON-LD): 3 niveaus, Home › niche-hub › regio
const origin = R.SITE_ORIGIN;
let BREADCRUMB_ITEMS, BREADCRUMB_NAV, CROSSLINKS, NAV_LINKS, FOOT_SECTOR_LINKS;

if (pageEntry) {
  const p = pageEntry;

  BREADCRUMB_NAV =
    '<a href="/">Keurwijzer</a>' +
    '<span class="crumb-sep" aria-hidden="true">›</span>' +
    '<a href="' + esc(p.nicheUrl) + '">' + esc(p.vakMvCap) + '</a>' +
    '<span class="crumb-sep" aria-hidden="true">›</span>' +
    '<span aria-current="page">' + esc(p.regioNaam) + '</span>';

  BREADCRUMB_ITEMS = JSON.stringify([
    { '@type': 'ListItem', position: 1, name: 'Keurwijzer', item: origin + '/' },
    { '@type': 'ListItem', position: 2, name: p.vakMvCap, item: origin + p.nicheUrl },
    { '@type': 'ListItem', position: 3, name: p.vakMvCap + ' in ' + p.regioNaam, item: p.canonical },
  ]);

  NAV_LINKS =
    '<a href="' + esc(p.nicheUrl) + '">' + esc(p.vakMvCap) + '</a>\n' +
    '<a href="' + esc(p.regioUrl) + '">Regio ' + esc(p.regioKern) + '</a>';
  FOOT_SECTOR_LINKS =
    '<a href="' + esc(p.nicheUrl) + '">' + esc(p.vakMvCap) + '</a>\n' +
    '          <a href="' + esc(p.regioUrl) + '">Regio ' + esc(p.regioKern) + '</a>';

  // "Verder kijken" — bewust ALLEEN naar de twee hubs (niche + regio). Deze
  // links hangen enkel af van de eigen niche/regio van de pagina, nóóit van
  // andere pagina's. Gevolg: een detailpagina verandert niet meer wanneer je
  // elders een regio of niche toevoegt — je hoeft ze dus niet te heruploaden.
  // De volledige, actuele lijst van zusterpagina's staat op de hubs zelf.
  const colA = '<div class="verder-col">\n' +
    '<h3 class="verder-h">' + esc(p.vakMvCap) + ' in andere regio’s</h3>\n' +
    '<p class="verder-empty">Bekijk onze selectie van ' + esc(p.vakMv) + ' per regio.</p>\n' +
    '<a class="verder-all" href="' + esc(p.nicheUrl) + '">Alle regio’s voor ' + esc(p.vakMv) +
    '<span class="arr" aria-hidden="true">→</span></a>\n</div>';

  const colB = '<div class="verder-col">\n' +
    '<h3 class="verder-h">Andere vakspecialisten in ' + esc(p.regioNaam) + '</h3>\n' +
    '<p class="verder-empty">Ontdek alle vakgebieden die we in ' + esc(p.regioNaam) + ' beoordeelden.</p>\n' +
    '<a class="verder-all" href="' + esc(p.regioUrl) + '">Alles in ' + esc(p.regioNaam) +
    '<span class="arr" aria-hidden="true">→</span></a>\n</div>';

  CROSSLINKS =
    '<section class="section verder">\n  <div class="container">\n' +
    '    <div class="sec-head" style="margin-bottom:26px">\n' +
    '      <span class="eyebrow">Verder kijken</span>\n' +
    '      <h2 style="margin-top:14px">Andere regio’s en vakgebieden</h2>\n' +
    '    </div>\n' +
    '    <div class="verder-grid">\n' + colA + '\n' + colB + '\n    </div>\n' +
    '  </div>\n</section>';
} else {
  // Pagina niet in de registry (bv. platte testconfig): geen kruislinks, 2-niveau broodkruimel.
  const naam = (config.vak.mvCap || config.vak.mv) + ' in ' + config.regio.naam;
  BREADCRUMB_ITEMS = JSON.stringify([
    { '@type': 'ListItem', position: 1, name: 'Keurwijzer', item: origin + '/' },
    { '@type': 'ListItem', position: 2, name: naam, item: canonical },
  ]);
  BREADCRUMB_NAV = '<a href="/">Keurwijzer</a>' +
    '<span class="crumb-sep" aria-hidden="true">›</span>' +
    '<span aria-current="page">' + esc(naam) + '</span>';
  CROSSLINKS = '';
  NAV_LINKS = '<a href="#register">' + esc(sector) + '</a>';
  FOOT_SECTOR_LINKS = '<a href="#register">' + esc(sector) + '</a>';
}

// ===== Tweede JSON-LD-blok: entiteitengraph (WebSite/WebPage/Breadcrumb/FAQ) ====
// Stond vroeger statisch in template.html. Nu versie-gestuurd zodat nieuwe pagina's
// een rijkere graph krijgen ZONDER dat bestaande (v1/v2) pagina's veranderen:
//   • v1/v2 → GRAPH_LEGACY: byte-voor-byte identiek aan het oude statische blok.
//   • v3    → een eerste-klas Organization-uitgever met @id, en WebPage die
//             publisher/breadcrumb/mainEntity via @id koppelt (mainEntity wijst
//             naar de ItemList #selectie in het eerste blok). Rijkere entiteiten =
//             beter leesbaar voor zoekmachines én AI-antwoordmachines (GEO).
// De FAQ is in beide versies identiek en wordt één keer gedefinieerd.
const escCanon = esc(canonical);
const FAQ_MAINENTITY = `[
    {
     "@type": "Question",
     "name": "Hoe bepaalt Keurwijzer welke bedrijven geselecteerd worden?",
     "acceptedAnswer": { "@type": "Answer", "text": "De selectie wordt bepaald op basis van vier criteria: vertrouwen (35%), reviewkwaliteit (30%), recentheid (15%) en specialiteit (20%). De bedrijven met de hoogste gecombineerde beoordeling vormen samen de selectie van een regio. Alle gegevens waarop we ons baseren zijn publiek: Google-reviews en de eigen website van het bedrijf. Dezelfde methode geldt voor elk bedrijf in elke regio. Onze methodologie en de AI-prompt die gebruikt wordt om bedrijven te beoordelen kunnen op eenvoudig verzoek opgevraagd worden." }
    },
    {
     "@type": "Question",
     "name": "Kan een bedrijf betalend opgenomen worden op Keurwijzer?",
     "acceptedAnswer": { "@type": "Answer", "text": "Nee. Een betaalde opname bestaat niet." }
    },
    {
     "@type": "Question",
     "name": "Hoe vaak wordt de lijst met bedrijven geüpdatet?",
     "acceptedAnswer": { "@type": "Answer", "text": "We herberekenen jaarlijks alles opnieuw met verse data. Een plaats in de selectie is dus nooit verworven." }
    },
    {
     "@type": "Question",
     "name": "Is Keurwijzer gratis?",
     "acceptedAnswer": { "@type": "Answer", "text": "Ja. Keurwijzer is en blijft een gratis initiatief, dat bezoekers wil helpen een geschikte vakspecialist in hun buurt te vinden. Keurwijzer is een initiatief van Magicworx bv, dat ook het marketingbureau dasslim.be uitbaat. Bedrijven kunnen ervoor kiezen om, los van hun opname, met ons samen te werken voor hun marketing; zo'n samenwerking heeft geen enkele invloed op hun opname." }
    }
   ]`;

// v1/v2 — verbatim reproductie van het oude statische blok. Wijzig deze string
// NIET: hij houdt de gepubliceerde pagina's byte-voor-byte identiek.
const GRAPH_LEGACY = `{
 "@context": "https://schema.org",
 "@graph": [
  {
   "@type": "WebSite",
   "@id": "https://keurwijzer.be/#website",
   "url": "https://keurwijzer.be/",
   "name": "Keurwijzer",
   "description": "Onafhankelijke kwaliteitsselectie van vakspecialisten per regio in België.",
   "inLanguage": "nl-BE",
   "publisher": { "@type": "Organization", "name": "Magicworx bv" }
  },
  {
   "@type": "WebPage",
   "@id": "${escCanon}#webpage",
   "url": "${escCanon}",
   "name": "De best beoordeelde ${config.vak.mv} in ${config.regio.naam} — Keurwijzer",
   "description": "${esc(metaDesc)}",
   "isPartOf": { "@id": "https://keurwijzer.be/#website" },
   "inLanguage": "nl-BE",
   "datePublished": "${config.peildatum}",
   "dateModified": "${config.peildatum}"
  },
  {
   "@type": "BreadcrumbList",
   "itemListElement": ${BREADCRUMB_ITEMS}
  },
  {
   "@type": "FAQPage",
   "mainEntity": ${FAQ_MAINENTITY}
  }
 ]
}`;

// v3 — rijkere entiteitengraph. Organization is een eerste-klas node met @id;
// WebSite/WebPage verwijzen ernaar als publisher; WebPage koppelt breadcrumb en
// mainEntity (de ItemList #selectie) via @id.
const GRAPH_V3 = `{
 "@context": "https://schema.org",
 "@graph": [
  {
   "@type": "Organization",
   "@id": "https://keurwijzer.be/#organization",
   "name": "Keurwijzer",
   "legalName": "Magicworx bv",
   "url": "https://keurwijzer.be/",
   "description": "Onafhankelijke kwaliteitsselectie van vakspecialisten per regio in België, op basis van Google-reviews en de eigen website van elk bedrijf."
  },
  {
   "@type": "WebSite",
   "@id": "https://keurwijzer.be/#website",
   "url": "https://keurwijzer.be/",
   "name": "Keurwijzer",
   "description": "Onafhankelijke kwaliteitsselectie van vakspecialisten per regio in België.",
   "inLanguage": "nl-BE",
   "publisher": { "@id": "https://keurwijzer.be/#organization" }
  },
  {
   "@type": "WebPage",
   "@id": "${escCanon}#webpage",
   "url": "${escCanon}",
   "name": "De best beoordeelde ${config.vak.mv} in ${config.regio.naam} — Keurwijzer",
   "description": "${esc(metaDesc)}",
   "isPartOf": { "@id": "https://keurwijzer.be/#website" },
   "publisher": { "@id": "https://keurwijzer.be/#organization" },
   "breadcrumb": { "@id": "${escCanon}#breadcrumb" },
   "mainEntity": { "@id": "${escCanon}#selectie" },
   "inLanguage": "nl-BE",
   "datePublished": "${config.peildatum}",
   "dateModified": "${config.peildatum}"
  },
  {
   "@type": "BreadcrumbList",
   "@id": "${escCanon}#breadcrumb",
   "itemListElement": ${BREADCRUMB_ITEMS}
  },
  {
   "@type": "FAQPage",
   "mainEntity": ${FAQ_MAINENTITY}
  }
 ]
}`;

// De literals hierboven gebruiken LF; het template-bestand is CRLF (Windows).
// Emit de graph met exact dezelfde regeleinde als het template, zodat het oude
// statische blok byte-voor-byte gereproduceerd wordt (v1/v2 blijven identiek).
const graphEOL = template.includes('\r\n') ? '\r\n' : '\n';
const JSONLD_GRAPH = (isV3 ? GRAPH_V3 : GRAPH_LEGACY).replace(/\n/g, graphEOL);

const tokens = {
  SLUG: slug,
  BREADCRUMB_ITEMS: BREADCRUMB_ITEMS,
  BREADCRUMB_NAV: BREADCRUMB_NAV,
  CROSSLINKS: CROSSLINKS,
  NAV_LINKS: NAV_LINKS,
  FOOT_SECTOR_LINKS: FOOT_SECTOR_LINKS,
  BUILD_TIMESTAMP: new Date().toISOString().slice(0, 10), // dagniveau: identieke no-op builds → identieke output (nodig voor de GHL-wijzigingslijst)
  META_DESC: esc(metaDesc),
  CANONICAL: esc(canonical),
  REGIO_KERN: esc(config.regio.kern),
  ISO_DATUM: config.peildatum,
  HERO_IMG: esc(heroImg),
  HERO_IMG_ALT: esc(heroAlt),
  GEO_REGION: geoRegion,
  SECTOR: esc(sector),
  OG_IMAGE: esc(ogImage),
  SAMENVATTING: esc(samenvatting),
  GEMEENTEN_AANTAL: String(config.gemeenten.length),
  AANTAL_BEOORDEELD: String(inRegioComps.length),
  TOTAAL_REVIEWS: String(totaalReviews),
  REGIO_GEMIDDELDE: regioGemiddelde,
  VAK_MV: config.vak.mv,
  VAK_MV_CAP: config.vak.mvCap || (config.vak.mv.charAt(0).toUpperCase() + config.vak.mv.slice(1)),
  VAK_EV: vakEv,
  SYN_MV_PAR: synMvPar,
  FAQ_ZOEKTERM: faqZoekterm,
  REGIO: config.regio.naam,
  UPDATE_DATUM: config.updateDatum,
  GEMEENTEN_KORT: gemeentenKort,
  GEMEENTEN_VOLLEDIG: gemeentenVolledig,
  GEMEENTEN_UNIEK_AANTAL: String(gemeentenUniek.length),
  GEMEENTEN_ZICHTBAAR: gemeentenZichtbaar,
  GEMEENTEN_COLLAPSED: gemeentenCollapsed,
  MIN_REVIEWS: String(MIN_REVIEWS),
  MIN_RECENT: String(MIN_RECENT),
  AANTAL_TOP: String(nListed),
  VIGNET: esc(vignet),
  COMPANIES: companiesHTML,
  JSONLD: jsonld,
  JSONLD_GRAPH: JSONLD_GRAPH
};
let out = template;
for (const [k, v] of Object.entries(tokens)) out = out.split('{{' + k + '}}').join(v);

const rest = out.match(/{{[A-Z_]+}}/g);
if (rest) die('template bevat niet-ingevulde tokens: ' + [...new Set(rest)].join(', '));

// output/ spiegelt de live-URL-structuur (pretty URLs):
//   /dakwerkers-gent/  ->  output/dakwerkers-gent/index.html
// Zo is "upload output/ naar de root" een 1-op-1 mapping en klopt de canonical.
const outDir = path.join(ROOT, 'output', slug);
const outRel = 'output/' + slug + '/';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), out);

// ---------------- stap 8b: badge-export (badges.json) --------------------
// Additieve export voor de badge-generator. Per gepubliceerd bedrijf de velden
// die op de kwaliteitsbadge komen (naam, niche, regio, tier, jaar), plus de
// stabiele slugs voor de bestandsnaam en de canonical landingspagina voor de
// klikbare embed-snippet. Dit is PUUR presentatie van al berekende data — geen
// enkele constante, dimensie, selectie of volgorde wordt geraakt, dus de
// rekenmethodiek (en METHODIEK.md) blijft ongemoeid.
//
// Bewust NIET in output/ (dat is de webroot die naar de site gaat) maar in
// badges/<slug>/ — de werkmap die lib/push-badges.js naar de keurwijzer-data-
// repo pusht. Geen timestamp of andere vluchtige velden: zelfde data = exact
// dezelfde badges.json, zodat de push net zo deterministisch blijft als
// registry.json (geen dagelijkse herpush zonder inhoudelijke wijziging).
//
// Tier-tekst volgt de RANG (c.positie), niet het paginalabel:
//   #1 → "#1" · #2–3 → "Top 3" · #4–5 → "Top 5" · #6–10 → "Top 10".
function tierLabel(pos) {
  if (pos <= 1) return '#1';
  if (pos <= 3) return 'Top 3';
  if (pos <= 5) return 'Top 5';
  return 'Top 10';
}
// Stabiele, botsingsvrije bedrijf-slug voor de bestandsnaam. Twee bedrijven die
// naar dezelfde slug herleiden krijgen een oplopend suffix (-2, -3, …), in de
// deterministische top-volgorde, zodat de mapping bedrijf → bestand vastligt.
const badgeSlugTeller = new Map();
function uniekBedrijfSlug(naam) {
  const base = chipSlug(naam) || 'bedrijf';
  const n = (badgeSlugTeller.get(base) || 0) + 1;
  badgeSlugTeller.set(base, n);
  return n === 1 ? base : base + '-' + n;
}
// Eén Nederlandse zin per gepubliceerd bedrijf: wélke van de vier dimensies zijn
// positie het meest vooruit zou helpen. Bedoeld voor de outreach-mail (fase 6 van
// de werkproces-prompt) — NIET voor de publieke pagina.
//
// Deterministisch afgeleid uit de hierboven al berekende dimensies: geen tweede
// LLM-run en geen tweede bron van waarheid. Dat is bewust:
//   - "welke dimensie weegt het zwaarst door" is een vergelijking van getallen,
//     dus rekenwerk, en hoort hier — niet bij de LLM (projectregel bovenaan);
//   - bevroren beoordeling.json-bestanden hoeven er niet voor herdraaid te worden,
//     dus bestaande regio's krijgen hun aandachtspunt zonder dat er één cijfer op
//     een gepubliceerde pagina wijzigt.
//
// Gekozen wordt de dimensie met de grootste GEWOGEN speelruimte
// (gewicht × (1 − score)): daar levert verbetering het meeste op. De volgorde in
// `kandidaten` staat op gewicht aflopend en beslist bij exact gelijke speelruimte,
// zodat de uitkomst reproduceerbaar is.
//
// Toon: feitelijk en constructief, nooit een negatief kwaliteitsoordeel (zie
// METHODIEK.md §6). Er wordt uitsluitend naar PUBLIEKE getallen verwezen (de vier
// gewichten, de halveringstijd) — nooit naar interne kalibratie zoals de
// publicatiedrempel of de vertrouwen-vloer. De percentages en de halveringstijd
// komen uit de constanten, zodat de zin niet kan gaan afwijken van de methodiek.
const vakKort = config.vak.kort || config.vak.mv;
function gewichtPct(w) { return Math.round(w * 100) + '%'; }
function aandachtspuntVoor(c) {
  const kandidaten = [
    { dim: 'trust',   ruimte: WEIGHTS.trust         * (1 - c.trust)   },
    { dim: 'rq',      ruimte: WEIGHTS.reviewQuality * (1 - c.rq)      },
    { dim: 'focus',   ruimte: WEIGHTS.focus         * (1 - c.focus)   },
    { dim: 'recency', ruimte: WEIGHTS.recency       * (1 - c.recency) },
  ];
  const winnaar = kandidaten.reduce((a, b) => (b.ruimte > a.ruimte ? b : a));
  const revs = c.googleReviews + ' Google-review' + (c.googleReviews === 1 ? '' : 's');
  switch (winnaar.dim) {
    case 'trust':
      return 'Je staat op ' +
        (typeof c.googleScore === 'number'
          ? nlNum(c.googleScore, 1) + ' sterren uit ' + revs
          : revs) +
        '. Die score weegt het zwaarst mee (' + gewichtPct(WEIGHTS.trust) + ') en ' +
        'recente reviews tellen daarin dubbel zo zwaar als die van ' +
        HALFLIFE_JAREN + ' jaar geleden — nieuwe positieve reviews helpen je ' +
        'positie op dit moment dus het meest vooruit.';
    case 'rq':
      return 'Wat klanten schrijven weegt voor ' + gewichtPct(WEIGHTS.reviewQuality) +
        ' mee, los van het aantal sterren. Bij jouw ' + revs + ' zit de ' +
        'grootste winst in reviews die concreet benoemen wélk werk je deed en ' +
        'hoe het verliep — die tellen zwaarder dan korte lof zonder details.';
    case 'focus':
      return c.website
        // Bewust GEEN URL in deze zin: de outreach-mail mag exact één link
        // bevatten (de landingspagina). Een tweede URL zou in Gmail auto-linken.
        ? 'Vakfocus weegt voor ' + gewichtPct(WEIGHTS.focus) + ' mee en lezen we af ' +
          'van je website. Hoe duidelijker je homepage meteen toont dat ' +
          vakKort + ' je kernactiviteit is — en niet één dienst tussen vele — ' +
          'hoe hoger die score.'
        : 'Vakfocus weegt voor ' + gewichtPct(WEIGHTS.focus) + ' mee en lezen we af ' +
          'van je website. We vonden er geen die we betrouwbaar aan je bedrijf ' +
          'konden koppelen, dus je kreeg hier het regiogemiddelde in plaats van ' +
          'je eigen score.';
    default:
      return 'Recentheid weegt voor ' + gewichtPct(WEIGHTS.recency) + ' mee: ' + c.n24 +
        ' van je ' + revs + ' dateren uit de laatste 24 maanden. Klanten kort ' +
        'na oplevering om een review vragen is hier de snelste winst.';
  }
}

const badgesData = {
  slug,
  niche,
  vakMv:     config.vak.mv,
  vakMvCap:  config.vak.mvCap || (config.vak.mv.charAt(0).toUpperCase() + config.vak.mv.slice(1)),
  regioNaam: config.regio.naam,
  jaar:      config.peildatum.slice(0, 4),
  landingsUrl: canonical,
  // Basis-URL van de badge-host, meegeschreven zodat afnemers (outreach-stap,
  // mails) NOOIT zelf een URL samenstellen. Verhuist de badge-hosting, dan
  // wijzigt R.BADGE_BASE_URL (of BADGE_BASE_URL in .env) en volgt de rest vanzelf.
  badgeBaseUrl: R.BADGE_BASE_URL,
  bedrijven: top.map(c => {
    const bslug = uniekBedrijfSlug(c.naam);
    const basis = R.BADGE_BASE_URL + '/' + slug + '/' + bslug;
    return {
      rang:        c.positie,
      tier:        tierLabel(c.positie),
      naam:        c.naam,
      bedrijfSlug: bslug,
      gemeente:    c.gemeente,
      // Eén zin voor de outreach-mail; nooit voor de publieke pagina.
      aandachtspunt: aandachtspuntVoor(c),
      // Kant-en-klare URL's — dit is wat je in een mail plakt.
      badgeDonker: basis + '--donker.png',
      badgeLicht:  basis + '--licht.png',
    };
  }),
};
const badgesDir = path.join(ROOT, 'badges', slug);
fs.mkdirSync(badgesDir, { recursive: true });
fs.writeFileSync(path.join(badgesDir, 'badges.json'), JSON.stringify(badgesData, null, 2));

// Interne documenten (rapport + prospectie) horen NIET in de webroot:
//   reports/<slug>/  — deze map upload je bewust niet.
const repDir = path.join(ROOT, 'reports', slug);
const repRel = 'reports/' + slug + '/';
fs.mkdirSync(repDir, { recursive: true });

// ---------------- stap 9: controlerapport --------------------------------
const fmt = (x, d) => (x == null ? '—' : x.toFixed(d));
let rap = 'KEURWIJZER CONTROLERAPPORT — ' + slug + '  (variant: Top 10-concept, geen zichtbare score)\n';
rap += 'Peildatum: ' + config.peildatum + ' · Prior C (regiogemiddelde, tijdsgewogen): ' + C.toFixed(3) + '\n';
rap += 'Methodiek-versie: ' + methodiekVersie + (config.methodiek ? ' (vastgepind in config)' : ' (nieuwste, standaard)') +
  '  ·  vertrouwen-vloer ' + TRUST_FLOOR.toFixed(1) + '→0, ' + TRUST_CEIL.toFixed(1) + '→1' +
  '  ·  recentheid vol bij ' + P.RECENCY_ANCHOR + ' reviews/24m' +
  '  ·  publicatiedrempel ≥' + P.PUBLISH_MIN_REVIEWS + ' reviews\n';
rap += 'Opnamecriteria: gemeente in lijst, ≥' + MIN_REVIEWS + ' reviews, ≥' + MIN_RECENT + ' in 24m\n';
rap += 'Gewichten: 35% vertrouwen / 30% reviewkwaliteit / 15% recentheid / 20% vakfocus\n';
rap += 'Eligible bedrijven: ' + eligible.length + ' (waarvan ' + publishableCount +
  ' publicabel, ≥' + P.PUBLISH_MIN_REVIEWS + ' reviews) → gepubliceerd: ' + vignet + ' (' + nListed + ' bedrijven)\n\n';

// --- DATA-INTEGRITEIT: mogelijk afgekapte review-export (bovenaan, prominent) --
// Een op 100 afgekapte export treft systematisch de grootste spelers en verlaagt
// hun gewogen volume → sterkere Bayes-krimp → onterecht lager vertrouwen. Controle
// vóór publicatie: staat een afgekapt bedrijf in of net buiten de selectie?
if (cappedExports.length) {
  const topNamen = new Set(top.map(c => norm(c.naam)));
  const eligNamen = new Set(eligible.map(c => norm(c.naam)));
  rap += '⚠ DATA-INTEGRITEIT — MOGELIJK AFGEKAPTE REVIEW-EXPORT (exact 100 bruikbare reviews)\n';
  rap += '  Vermoedelijke exportlimiet. Dit vertekent het VERTROUWEN van grote spelers naar beneden.\n';
  rap += '  Actie: her-scrape zonder limiet en draai normalize opnieuw vóór publicatie.\n';
  cappedExports
    .sort((a, b) => b.rawCount - a.rawCount)
    .forEach(c => {
      const n = norm(c.naam);
      const status = topNamen.has(n) ? '  ← STAAT IN DE GEPUBLICEERDE SELECTIE'
        : eligNamen.has(n) ? '  (eligible, niet gepubliceerd)'
        : '  (niet eligible)';
      rap += '    ' + c.naam + ' — ' + c.nOK + ' van ' + c.rawCount + ' reviews gebruikt' + status + '\n';
    });
  rap += '\n';
}

rap += vignet.toUpperCase() + '  (dit staat op de site — zonder cijfer)\n';
rap += 'pos  comp   trust  rq    rec   focus  bayes  Rw    v_w    n24  reviews  bedrijf\n';
top.forEach((c, i) => {
  rap += ('#' + (i + 1)).padStart(3) + '  ' +
    c.composite.toFixed(3) + '  ' + c.trust.toFixed(3) + '  ' + c.rq.toFixed(2) + '  ' +
    c.recency.toFixed(2) + '  ' + c.focus.toFixed(2) + '   ' + c.bayes.toFixed(2) + '   ' +
    fmt(c.Rw, 2) + '  ' + c.vw.toFixed(1).padStart(5) + '  ' + String(c.n24).padStart(3) + '  ' +
    String(c.googleReviews).padStart(7) + '  ' + c.naam + '\n';
});
rap += '\nVAKFOCUS-AUDIT (bron van de specialiteitsdimensie, per gerankt bedrijf)\n';
top.forEach(c => {
  const b = c.beo || {};
  const url = b.websiteBezocht || c.website || null;
  rap += '    ' + c.naam + ' — ' + (typeof b.vakfocus === 'number'
    ? b.vakfocus.toFixed(1) + ' via ' + (url || 'ONBEKENDE BRON — controleer!')
    : 'regiomediaan (' + (focusMediaan * 4 + 1).toFixed(1) + '), geen website') + '\n';
});
const breuken = top.filter(c => c.beo && c.beo.breuk);
if (breuken.length) {
  rap += '\nBREUKSIGNALEN (tijdspatroon gedetecteerd door de LLM)\n';
  breuken.forEach(c => { rap += '    ' + c.naam + ' — ' + c.beo.breuk + '\n'; });
}

// --- ROBUUSTHEID: overleeft de selectie een halve punt beoordelaarsonzekerheid? -
// Per gepubliceerd bedrijf: de kans dat het in de Top N blijft wanneer élke
// LLM-deelscore (reviewkwaliteit + vakfocus) toevallig ±0,5 verschuift, plus de
// gebruikelijke positieband (5e–95e percentiel) over 5000 trials met vaste seed.
// "vast" ≥ 95%, "waarschijnlijk" 80–95%, "WANKEL" < 80%. Verandert niets aan de
// publicatie — het scheidt de zekere posities van de dobbelworpen.
rap += '\nROBUUSTHEID VAN DE SELECTIE (±0,5 op reviewkwaliteit + vakfocus, 5000 trials, vaste seed)\n';
rap += '  kans = P(blijft in Top ' + nListed + ')   ·   band = 5e–95e percentiel van de positie\n';
{
  const oordeel = p => p >= 0.95 ? 'vast' : p >= 0.80 ? 'waarschijnlijk' : 'WANKEL';
  let vast = 0, wankel = 0;
  top.forEach((c, i) => {
    if (c.stabiliteit >= 0.95) vast++;
    if (c.stabiliteit < 0.80) wankel++;
    rap += ('#' + (i + 1)).padStart(4) + '  kans ' + (c.stabiliteit * 100).toFixed(0).padStart(3) +
      '%   band #' + c.posP05 + '–#' + c.posP95 + '   ' +
      oordeel(c.stabiliteit).padEnd(13) + ' ' + c.naam + '\n';
  });
  // De echte concurrent voor de laatste plek is het sterkste PUBLICABELE bedrijf
  // dat net buiten de selectie viel (sub-bar bedrijven dingen niet mee, ze vullen
  // enkel op). Zo is de marge altijd ≥ 0 en betekenisvol.
  const nextPub = naSelectie.find(isPublishable) || null;
  const marge = (nextPub && top.length) ? (top[top.length - 1].composite - nextPub.composite) : null;
  rap += '  Samengevat: ' + vast + ' vast, ' + (top.length - vast - wankel) +
    ' waarschijnlijk, ' + wankel + ' wankel (van ' + top.length + ').\n';
  if (marge != null)
    rap += '  Marge #' + nListed + ' → eerstvolgende publicabele (' + nextPub.naam + '): ' +
      marge.toFixed(3) + '.\n';
}
if (extra.length) {
  rap += '\nBEDRIJVEN ' + (nListed + 1) + '–' + (nListed + extra.length) + ' — NIET OP DE SITE (zie prospectiedocument voor dasslim.be)\n';
  extra.forEach((c, i) => {
    const merk = !isPublishable(c) ? '  [< ' + P.PUBLISH_MIN_REVIEWS + ' reviews: eligible, niet publicabel]' : '';
    rap += '    #' + String(nListed + i + 1).padStart(2) + '  comp ' + c.composite.toFixed(3) + '  ' + c.naam + merk + '\n';
  });
}
const buitenLijst = naSelectie.slice(EXTRA_MAX);
if (buitenLijst.length) {
  rap += '\nELIGIBLE MAAR VOORBIJ PLEK ' + (nListed + EXTRA_MAX) + ' (niet getoond, niet in prospectie)\n';
  buitenLijst.forEach(c => { rap += '    comp ' + c.composite.toFixed(3) + '  ' + c.naam + '\n'; });
}
if (watchlist.length) {
  rap += '\nNOG NIET ELIGIBLE — NIET OP DE SITE (wél in prospectiedocument, max ' + WATCHLIST_MAX + ')\n';
  watchlist.forEach(c => { rap += '    ' + c.naam + ' — ' + wlReden(c) + '\n'; });
}
const zonderGemeente = companies.filter(c => !c.gemeente || !String(c.gemeente).trim());
if (zonderGemeente.length) {
  rap += '\nGEEN LOCATIEDATA (geen gemeente → altijd weggelaten, niet geraden)\n';
  zonderGemeente.forEach(c => { rap += '    ' + c.naam + (c.website ? ' — ' + c.website : '') + '\n'; });
}
const buitenRegio = companies.filter(c => c.gemeente && String(c.gemeente).trim() && !c.inRegio);
if (buitenRegio.length) {
  rap += '\nBUITEN DE GEMEENTELIJST (volledig weggelaten)\n';
  buitenRegio.forEach(c => { rap += '    ' + c.naam + ' (' + c.gemeente + ')\n'; });
}
if (warnings.length) {
  rap += '\nWAARSCHUWINGEN\n';
  warnings.forEach(w => { rap += '  ! ' + w + '\n'; });
}
fs.writeFileSync(path.join(repDir, slug + '-rapport.txt'), rap);

// ---------------- stap 10: prospectiedocument voor dasslim.be ------------
// Bevat de bedrijven die NIET op de site staan maar wél waardevolle leads zijn:
//   A) plek 11–20: eligible, kwaliteitsvol, net buiten de gepubliceerde Top N
//   B) nog-niet-eligible bedrijven in de regio: langeretermijnprospects
// Bewust een apart bestand — deze lijst is intern en hoort niet op de site.
function prospectRegel(c, positie) {
  const beo = c.beo || {};
  const specs = (beo.specialties || []).map(chipLabel).join(', ');
  let s = '### ' + (positie ? positie + '. ' : '') + c.naam + '\n';
  s += '- **Gemeente:** ' + (c.gemeente || '—') + '\n';
  s += '- **Website:** ' + (c.website ? c.website : '_geen website bekend_') + '\n';
  s += '- **Google:** ' + (c.googleScore != null ? nlNum(c.googleScore, 1) + ' ★' : '—') +
       ' · ' + c.googleReviews + ' reviews' +
       (typeof c.n24 === 'number' ? ' (' + c.n24 + ' in laatste 24m)' : '') + '\n';
  if (typeof c.composite === 'number') s += '- **Interne kwaliteitsindex (composite):** ' + c.composite.toFixed(3) + '\n';
  if (specs) s += '- **Specialiteiten:** ' + specs + '\n';
  if (beo.synthese) s += '- **Synthese:** ' + beo.synthese + '\n';
  return s + '\n';
}

let pros = '# Prospectielijst — ' + config.vak.mvCap + ' in ' + config.regio.naam + '\n\n';
pros += '_Intern document voor dasslim.be. Niet publiceren. Gegenereerd op ' +
        new Date().toISOString().slice(0, 10) + ' · peildatum ' + config.peildatum + '._\n\n';
pros += 'Deze bedrijven staan **niet** op de publieke Keurwijzer-pagina, maar zijn ' +
        'waardevolle prospects. De publieke pagina toont enkel de ' + vignet + '.\n\n';
pros += '---\n\n';
pros += '## A. Net buiten de ' + vignet + ' — plek ' + (nListed + 1) + ' t.e.m. ' + (nListed + extra.length) + '\n\n';
if (extra.length) {
  pros += '_Warme leads: deze bedrijven zijn eligible en kwaliteitsvol, ze vielen net ' +
          'buiten de gepubliceerde selectie. Openingszin: "u staat net buiten onze publieke ' +
          vignet + ' — dit is wat er nog voor nodig is, en toevallig helpen wij daar ook bij."_\n\n';
  extra.forEach((c, i) => {
    pros += prospectRegel(c, nListed + i + 1);
    if (!isPublishable(c))
      pros += '- **Bijna publicabel:** sterke score, maar nog onder de publicatiedrempel van ' +
              P.PUBLISH_MIN_REVIEWS + ' reviews (nu ' + c.googleReviews + '). Openingszin: "uw kwaliteit ' +
              'zit goed; u mist enkel nog reviews om in onze publieke ' + vignet + ' te verschijnen."\n\n';
  });
} else {
  pros += '_Geen bedrijven in deze categorie._\n\n';
}
pros += '---\n\n';
pros += '## B. Nog niet eligible — langeretermijnprospects\n\n';
if (watchlist.length) {
  pros += '_Deze bedrijven voldoen nog niet aan de opnamecriteria (te weinig of te oude ' +
          'reviews). Openingszin: "u komt nog niet in aanmerking voor onze ' + vignet + '; ' +
          'dit is wat er nog voor nodig is."_\n\n';
  watchlist.forEach(c => {
    pros += prospectRegel(c, null);
    pros += '- **Reden nog niet opgenomen:** ' + wlReden(c) + '\n\n';
  });
} else {
  pros += '_Geen bedrijven in deze categorie._\n\n';
}
fs.writeFileSync(path.join(repDir, slug + '-prospectie-dasslim.md'), pros);

console.log('✓ ' + outRel + 'index.html  (' + vignet + ' — ' + nListed + ' op de site, geen cijfer)');
console.log('✓ ' + repRel + slug + '-rapport.txt — controleer dit rapport vóór publicatie');
console.log('✓ ' + repRel + slug + '-prospectie-dasslim.md — ' + extra.length + ' warme + ' +
  watchlist.length + ' langeretermijnprospects (intern, niet publiceren)');
if (warnings.length) console.log('! ' + warnings.length + ' waarschuwing(en) — zie rapport');
