#!/usr/bin/env node
// =====================================================================
// build-all.js — de "systeembrede check". Herbouwt de VOLLEDIGE site uit
// de registry en garandeert dat alle onderlinge links consistent zijn.
//
// Waarom nodig: `build-site.js` ververst enkel de hubs, de homepage en de
// sitemap. De detailpagina's blijven staan zoals ze ooit gebouwd zijn, terwijl
// ze wél meeveranderen met het sjabloon, de methodiek en de WhatsApp-lijst.
// Dit script herbouwt daarom álles uit dezelfde registry, zodat de site nooit
// half oud en half nieuw is.
//
// Let op — dit stond hier ooit anders beschreven: detailpagina's linken sinds
// de herziening van "Verder kijken" bewust alleen naar hun eigen twee hubs,
// nooit meer naar zusterpagina's. Een regio of niche toevoegen kán hun links
// dus niet doen verouderen; de volledige, actuele lijst staat op de hubs, die
// clientside uit registry.json laden.
//
// Extra: het vergelijkt de output vóór en ná de build en toont exact welke
// pagina's veranderd of nieuw zijn — dat is wat er bij het publiceren live gaat.
//
// Gebruik:  node build-all.js
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const R = require('./lib/registry');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'output');
const T = require('./lib/tijdelijke-map');

// --geen-push: bouwt de site volledig lokaal maar publiceert niets (registry,
// badges noch site). Bedoeld om build-all.js te kunnen draaien — bv. twee keer
// tegelijk om de lock te testen — zonder dat er iets live gaat.
const GEEN_PUSH = process.argv.includes('--geen-push');

// ---- Bouw-lock: geen twee gelijktijdige build-all.js-processen -------------
// Een geplande taak en een handmatige sessie kunnen elkaar overlappen; de tweede
// push wordt dan als non-fast-forward geweigerd en verdween vroeger in een lege
// catch. We claimen de lock zo vroeg mogelijk en laten hem los bij élke afsluiting.
const lock = T.claimLock();
if (!lock.ok) {
  console.error('✗ Er draait al een build-all.js (pid ' + lock.pid +
    (lock.sinds ? ', gestart ' + lock.sinds : '') + ', ' + lock.minuten + ' min geleden).');
  console.error('  Twee gelijktijdige builds duwen elkaars push weg. Wacht tot de andere klaar is.');
  console.error('  (Een lock ouder dan 30 min wordt automatisch genegeerd.)');
  process.exit(1);
}
if (lock.genegeerd) {
  console.warn('! Verouderde bouw-lock genegeerd (pid ' + lock.genegeerd.pid + ', ' +
    lock.genegeerd.minuten + ' min oud) — vermoedelijk een vastgelopen build.');
}
// Los de lock in álle gevallen los: normaal einde, process.exit(), of een
// onafgevangen fout (bv. een kapotte config die loadRegistry laat throwen).
process.on('exit', () => T.laatLockLos());

// ---- Impactcheck: hangt alles nog aan elkaar? ------------------------------
// Olivier vroeg op 4 september 2026 om de gevolgen van een wijziging niet meer
// achteraf te ontdekken. Deze check kijkt na of tekst en code elkaar nog
// dekken — verwijzingen, commando's, getallen, vaste zinnen, geplande taken.
//
// Bewust een WAARSCHUWING en geen harde stop. Een verouderde verwijzing in een
// promptbestand mag nooit verhinderen dat een correcte pagina live gaat; dat
// zou op het slechtste moment een publicatie blokkeren om een reden die de
// bezoeker niet raakt. In `npm test` faalt dezelfde check wél hard — dáár hoor
// je het te merken, vóór het ertoe doet.
try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'impactcheck.js'), '--stil'],
    { stdio: 'inherit' });
} catch (e) {
  console.warn('! De impactcheck meldt losse eindjes (zie hierboven). De build gaat door,');
  console.warn('  maar tekst en code lopen ergens uit elkaar. Draai `npm test` en zet het recht.');
}

function deployFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return deployFiles(p);
    return (e.name.endsWith('.html') || e.name === 'sitemap.xml') ? [p] : [];
  });
}
function snapshot() {
  const m = new Map();
  for (const f of deployFiles(OUT)) {
    m.set(path.relative(OUT, f).replace(/\\/g, '/'),
      crypto.createHash('md5').update(fs.readFileSync(f)).digest('hex'));
  }
  return m;
}
function relToUrl(rel) {
  if (rel === 'sitemap.xml') return '/sitemap.xml';
  if (rel === 'index.html') return '/';
  return '/' + rel.replace(/\/index\.html$/, '') + '/';
}

const registry = R.loadRegistry(ROOT);
if (!registry.length) { console.error('Geen configs in config/<niche>/.'); process.exit(1); }

// WhatsApp-nummers: build.js controleert per pagina of de bedrijfsnaam bestaat,
// maar een tikfout in de *slug* ziet hij nooit — die regel hoort dan bij geen
// enkele pagina en verdwijnt stil. Hier, waar alle slugs bekend zijn, wél.
{
  const WA = require('./lib/whatsapp');
  const { rijen, fouten } = WA.load(ROOT);
  const bekend = new Set(registry.map(p => p.slug));
  const zoek = rijen.filter(r => !bekend.has(r.slug))
    .map(r => '"' + r.bedrijf + '": regio-slug "' + r.slug + '" bestaat niet');
  const alles = fouten.concat(zoek);
  if (alles.length) {
    console.error('FOUT in data/whatsapp.json:\n  - ' + alles.join('\n  - '));
    process.exit(1);
  }
}

// Het vakgebiedenraster op homepage.html is het enige stuk navigatie dat NIET
// uit de registry komt: elke kaart heeft een eigen icoon, naam en onderschrift,
// en die staan nergens in een config. Gaat een niche live zonder kaart, dan
// ontbreekt ze stil op de homepage terwijl ze wél in het menu en de sitemap
// staat. Staat er omgekeerd een kaart op "live" voor een niche die niet bestaat,
// dan linkt de homepage naar een 404. Geen van beide zie je aan de pagina zelf.
// Waarschuwing, geen harde stop: de rest van de site is volledig geldig.
function homepageKaarten() {
  const bestand = path.join(ROOT, 'homepage.html');
  if (!fs.existsSync(bestand)) return null;
  // uitgecommentarieerde kaarten tellen niet mee — die staan niet op de pagina
  const html = fs.readFileSync(bestand, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const kaarten = new Map();
  const re = /<[a-z]+\b[^>]*\bdata-niche="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const status = (m[0].match(/\bdata-status="([^"]+)"/) || [])[1] || 'soon';
    kaarten.set(m[1], status);
  }
  return kaarten;
}

const homepageMeldingen = [];
{
  const kaarten = homepageKaarten();
  if (kaarten) {
    for (const n of R.niches(registry)) {
      if (kaarten.has(n.niche)) continue;
      homepageMeldingen.push([
        'Niche "' + n.niche + '" (' + n.vakMvCap + ') staat live, maar heeft GEEN kaart in het',
        '  vakgebiedenraster van homepage.html. Bezoekers zien ze daar dus niet staan.',
        '  → Voeg een kaart toe met data-niche="' + n.niche + '". De uitleg staat vlak boven',
        '    <section id="niches"> in homepage.html; de kaart zet zichzelf op "Online".',
      ].join('\n'));
    }
    const bestaandeNiches = new Set(registry.map(p => p.niche));
    for (const [niche, status] of kaarten) {
      if (status !== 'live' || bestaandeNiches.has(niche)) continue;
      homepageMeldingen.push([
        'De kaart data-niche="' + niche + '" op homepage.html staat op "live", maar er is geen',
        '  config/' + niche + '/ — die link geeft een 404.',
        '  → Zet ze terug op data-status="soon", of controleer de spelling van de mapnaam.',
      ].join('\n'));
    }
  }
}

// 0) tokenwaarschuwing — één GET naar de GitHub-API leest de vervaldatum van het
//    token. Verloopt het binnen 30 dagen, dan een melding vóór alle bouwuitvoer,
//    zodat de publicatie niet op een dag stil breekt. Stopt de build nooit; lekt
//    het token nooit (zie lib/token-check.js). Overgeslagen bij --geen-push.
if (!GEEN_PUSH) {
  try { execFileSync('node', [path.join(ROOT, 'lib', 'token-check.js')], { stdio: 'inherit' }); }
  catch { /* de token-check mag een build nooit blokkeren */ }
}

const before = snapshot();

// 1) alle detailpagina's herbouwen (sjabloon, scores, broodkruimel, WhatsApp)
console.log('› ' + registry.length + ' detailpagina\'s herbouwen...');
const mislukt = [];
// Waarschuwingen per pagina. build.js schrijft ze naar zijn rapport en meldt
// het aantal op stdout — maar die stdout werd hier weggegooid, dus niemand zag
// ze ooit. Bij één pagina viel dat nog te overzien; bij tientallen leest niemand
// nog elk rapport apart. We vangen de regel nu op en tonen ze in de eindlijst.
const metWaarschuwingen = [];
for (const p of registry) {
  try {
    const uit = execFileSync('node', [path.join(ROOT, 'build.js'), p.slug],
      { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
    const m = /^! (\d+) waarschuwing/m.exec(uit || '');
    if (m) metWaarschuwingen.push({ slug: p.slug, n: Number(m[1]) });
  } catch {
    mislukt.push(p.slug);
    console.error('  ! ' + p.slug + ' faalde (ontbrekende data?) — overgeslagen');
  }
}

// 2) hubs, homepage en sitemap
console.log('› hubs, homepage en sitemap...');
execFileSync('node', [path.join(ROOT, 'build-site.js')], { stdio: ['ignore', 'ignore', 'inherit'] });

// 2b) registry.json genereren — compacte JSON-export van alle navigatiedata,
//     zodat hub- en homepage-navigatie clientside uit dit bestand kan laden.
console.log('› registry.json genereren...');
const gepland = R.loadPlannedRegions(ROOT);
const registryJson = {
  // VOLLEDIGE tijdstempel, niet enkel de datum. De hubs halen registry.json bij
  // twee bronnen op (jsDelivr + raw GitHub) en kiezen de VERSTE op dit veld; met
  // dagprecisie zijn twee versies van dezelfde dag niet te onderscheiden — precies
  // het geval op 2026-08-28, toen jsDelivr een oudere kopie van diezelfde dag
  // serveerde. Bijkomend voordeel: registry.json verschilt nu bij élke build, dus
  // push-registry.js commit + purget altijd (voorheen sloeg hij bij identieke
  // inhoud over, waardoor de CDN-cache nooit ververst werd).
  _generated: new Date().toISOString(),
  _origin: R.SITE_ORIGIN,
  pages: registry.map(p => ({
    slug:       p.slug,
    niche:      p.niche,
    url:        p.url,
    vakMv:      p.vakMv,
    vakMvCap:   p.vakMvCap,
    regioSlug:  p.regioSlug,
    regioKern:  p.regioKern,
    regioNaam:  p.regioNaam,
    regioUrl:   p.regioUrl,
    nicheUrl:   p.nicheUrl,
    provincie:  p.provincie,
    gemeenten:  p.gemeenten.length,
  })),
  niches: R.niches(registry).map(n => ({
    niche:    n.niche,
    url:      n.url,
    vakMv:    n.vakMv,
    vakMvCap: n.vakMvCap,
    count:    n.count,
  })),
  regios: R.regios(registry).map(r => ({
    regioSlug: r.regioSlug,
    url:       r.url,
    regioKern: r.regioKern,
    regioNaam: r.regioNaam,
    provincie: r.provincie,
    count:     r.count,
  })),
  // Volledige regio-indeling uit regions.txt (alle 29, óók de al gebouwde).
  // De hub trekt hier clientside `pages` van af; wat overblijft toont hij als
  // "Binnenkort". Zo verdwijnt dat label vanzelf zodra een regio live gaat —
  // er is geen label om weg te halen. Zie lib/registry.js § loadPlannedRegions.
  planned: gepland,
  plannedMinLive: R.PLANNED_MIN_LIVE,
};
fs.writeFileSync(path.join(OUT, 'registry.json'), JSON.stringify(registryJson));
console.log('✓ output/registry.json  (' + registry.length + ' pagina\'s, ' +
  registryJson.niches.length + ' niches, ' + registryJson.regios.length + ' regio\'s, ' +
  gepland.length + ' geplande regio\'s)');

// 2c) weesbadges opruimen — badges/<slug> voor slugs die niet meer in de
//     registry zitten (bv. na verwijderen/hernoemen van een regio). Analoog aan
//     de output-opruiming hieronder; zo blijft badges/ (en de live CDN na de
//     push) exact gelijk aan wat de registry beschrijft.
const badgesDir = path.join(ROOT, 'badges');
if (fs.existsSync(badgesDir)) {
  const geldig = new Set(registry.map(p => p.slug));
  for (const e of fs.readdirSync(badgesDir, { withFileTypes: true })) {
    if (e.isDirectory() && !geldig.has(e.name)) {
      fs.rmSync(path.join(badgesDir, e.name), { recursive: true, force: true });
      console.log('  · weesbadges verwijderd: badges/' + e.name);
    }
  }
}

// 2d) kwaliteitsbadges genereren — build.js schreef per pagina badges/<slug>/
//     badges.json weg; de generator maakt daaruit 2 PNG's per gepubliceerd
//     bedrijf (donker/licht). Faalt dit (bv. dependencies niet geïnstalleerd),
//     dan blijft de rest van de build geldig.
console.log('› kwaliteitsbadges genereren...');
try {
  execFileSync('node', [path.join(ROOT, 'scripts', 'genereer-badges.js')], { stdio: 'inherit' });
} catch {
  console.error('  ⚠ badge-generatie mislukt (npm install uitgevoerd?) — build blijft geldig.');
}

// 3) weespagina's opruimen — output die niet meer bij een config hoort
//    (bv. na het verwijderen of hernoemen van een regio/niche). Zo blijft
//    output/ exact gelijk aan wat de registry beschrijft.
const verwacht = new Set(['index.html', 'sitemap.xml', 'registry.json']);
for (const n of R.niches(registry)) verwacht.add(n.niche + '/index.html');
for (const r of R.regios(registry)) verwacht.add('regio/' + r.regioSlug + '/index.html');
for (const p of registry) verwacht.add(p.slug + '/index.html');

for (const f of deployFiles(OUT)) {
  const rel = path.relative(OUT, f).replace(/\\/g, '/');
  if (verwacht.has(rel)) continue;
  fs.rmSync(f);
  const dir = path.dirname(f);
  try { if (dir !== OUT && !fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch { /* niet leeg */ }
}

// 4) diff: wat is er veranderd sinds de vorige build?
const after = snapshot();
const nieuw = [], gewijzigd = [];
for (const [rel, h] of after) {
  if (!before.has(rel)) nieuw.push(rel);
  else if (before.get(rel) !== h) gewijzigd.push(rel);
}
const verwijderd = [...before.keys()].filter(rel => !after.has(rel));

const fmt = list => list.map(relToUrl).sort().map(u => '    ' + u).join('\n');

console.log('\n' + '='.repeat(64));
console.log('KLAAR — ' + after.size + ' pagina\'s. Dit gaat live:');
console.log('='.repeat(64));
if (nieuw.length)      console.log('\n  NIEUW:\n' + fmt(nieuw));
if (gewijzigd.length)  console.log('\n  GEWIJZIGD:\n' + fmt(gewijzigd));
if (verwijderd.length) console.log('\n  VERWIJDERD (gaat offline):\n' + fmt(verwijderd));
if (!nieuw.length && !gewijzigd.length && !verwijderd.length) console.log('\n  Niets veranderd — geen actie nodig.');
if (mislukt.length) console.log('\n  ! Niet gebouwd (data ontbreekt): ' + mislukt.join(', '));
if (metWaarschuwingen.length) {
  const totaal = metWaarschuwingen.reduce((s, x) => s + x.n, 0);
  console.log('\n  WAARSCHUWINGEN — ' + totaal + ' over ' + metWaarschuwingen.length + ' pagina(\'s):');
  metWaarschuwingen.sort((a, b) => b.n - a.n || a.slug.localeCompare(b.slug))
    .forEach(x => console.log('    ' + String(x.n).padStart(3) + '  ' + x.slug +
      '   → reports/' + x.slug + '/' + x.slug + '-rapport.txt'));
  console.log('    (dubbele bedrijfsnamen, afgekapte review-exports, ontbrekende beoordelingen)');
}
console.log('');

// ---- Publiceren -------------------------------------------------------------
// Volgorde bewust: SITE eerst, dan pas registry en badges.
//
// hub.html vervangt de serverside kaarten clientside door de registry die
// jsDelivr serveert. Pushten we de registry eerst (zoals vroeger), dan kon de
// CDN een nieuwe pagina al adverteren terwijl Cloudflare de detailpagina nog niet
// live had — de hub linkte dan 1 tot 3 minuten naar een 404. Door de site eerst
// te publiceren staat de detailpagina er al voordat de registry ernaar verwijst.
// (push-registry.js heeft niets uit de site-push nodig — geverifieerd.)
let siteMislukt = false;
let pushMislukt = false;
let cdnAchter = false;
let badgesMislukt = false;

if (GEEN_PUSH) {
  console.log('› --geen-push: site, registry en badges NIET gepubliceerd (lokale build).');
} else {
  // 6) de statische site publiceren naar Cloudflare (via de site-repo op GitHub).
  //    Ontbreekt GITHUB_SITE_REPO in .env, dan stopt push-site.js met exitcode 1:
  //    er ging niets live, en dat hoort in de eindsamenvatting te staan.
  try {
    execFileSync('node', [path.join(ROOT, 'lib', 'push-site.js')], { stdio: 'inherit' });
  } catch { siteMislukt = true; /* fout wordt al gemeld door push-site.js */ }

  // 7) registry.json pushen naar GitHub (zodat jsDelivr de nieuwe navigatie serveert)
  try {
    execFileSync('node', [path.join(ROOT, 'lib', 'push-registry.js')], { stdio: 'inherit' });
  } catch (err) {
    // Exitcode 2 = push naar GitHub is WEL gelukt, maar jsDelivr serveert nog niet
    // alle pagina's. Dat vraagt een ander advies dan een echt mislukte push (1):
    // opnieuw pushen helpt daar niet, even wachten en herbouwen wel.
    if (err && err.status === 2) {
      cdnAchter = true;
    } else {
      pushMislukt = true;
      console.error('\n  !! registry.json NIET gepusht naar GitHub.');
      console.error('     → Run handmatig: node lib/push-registry.js');
      console.error('     → Zonder push zien bezoekers de binnenkort-kaarten NIET.');
    }
  }

  // 8) badge-PNG's pushen naar dezelfde data-repo (jsDelivr serveert de badges)
  try {
    execFileSync('node', [path.join(ROOT, 'lib', 'push-badges.js')], { stdio: 'inherit' });
  } catch { badgesMislukt = true; /* fout wordt al gemeld door push-badges.js */ }
}

// 9) als laatste, zodat het niet wegscrollt tussen de push-uitvoer: ontbreekt er
//    een kaart in het vakgebiedenraster van de homepage?
if (homepageMeldingen.length) {
  console.error('\n' + '='.repeat(64));
  console.error('LET OP — vakgebiedenraster op de homepage');
  console.error('='.repeat(64));
  for (const m of homepageMeldingen) console.error('  · ' + m);
  console.error('');
}

// 10) Eindoordeel — exitcode ≠ 0 zodra er iets faalde, met een samenvatting die
//     ook bovenaan de log van een geplande taak opvalt. Een build die stil met
//     exitcode 0 eindigt terwijl een pagina of een push faalde, was precies het
//     faalpad dat deze wijziging dichtte.
const problemen = [];
if (mislukt.length) problemen.push(mislukt.length + ' pagina(\'s) niet gebouwd (data ontbreekt?): ' + mislukt.join(', '));
if (siteMislukt)    problemen.push('site NIET gepubliceerd naar Cloudflare — draai handmatig: node lib/push-site.js');
if (pushMislukt)    problemen.push('registry.json NIET gepusht naar GitHub — draai handmatig: node lib/push-registry.js');
if (badgesMislukt)  problemen.push('badge-PNG\'s NIET gepusht — draai handmatig: node lib/push-badges.js');

if (problemen.length) {
  console.error('\n' + '#'.repeat(64));
  console.error('##  BUILD FAALDE — ' + problemen.length + ' probleem(en). De site is mogelijk half bijgewerkt.');
  console.error('#'.repeat(64));
  for (const p of problemen) console.error('  ✗ ' + p);
  console.error('');
  process.exitCode = 1;
}

// CDN-achterstand is geen mislukking (de pagina's staan live), maar de hub loopt
// nog achter — apart gemeld, met exitcode 1 zodat een geplande taak het oppikt.
if (cdnAchter && !pushMislukt) {
  console.error('\n' + '='.repeat(64));
  console.error('LET OP — de pagina\'s staan live, maar de hub loopt nog achter');
  console.error('='.repeat(64));
  console.error('  registry.json staat correct op GitHub; jsDelivr serveert hem nog niet.');
  console.error('  Gevolg: de detailpagina is bereikbaar, maar op de niche-hub staat ze');
  console.error('  nog als grijze "binnenkort"-kaart. Dit lost zichzelf op.');
  console.error('  → Wacht een paar minuten en draai opnieuw: node build-all.js');
  console.error('  → Opnieuw pushen heeft geen zin; het ligt aan de CDN-cache.\n');
  process.exitCode = 1;
}
