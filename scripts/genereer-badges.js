#!/usr/bin/env node
// =====================================================================
// scripts/genereer-badges.js — kwaliteitsbadges (PNG) per gepubliceerd bedrijf
//
// Leest badges/<slug>/badges.json (door build.js gegenereerd) en rendert per
// bedrijf twee transparante PNG's:
//   badges/<slug>/<bedrijfSlug>--donker.png   (donkere tekst, voor lichte sites)
//   badges/<slug>/<bedrijfSlug>--licht.png     (witte tekst,  voor donkere sites)
//
// Het ONTWERP is volledig in SVG opgebouwd (zegel + tekst), dus deterministisch
// en resolutie-onafhankelijk. Tekst wordt via opentype.js naar vectorpaden
// omgezet, zodat de render niet afhangt van geïnstalleerde systeemfonts en de
// PNG-bytes op elke machine identiek zijn. Het groene zegel is in beide varianten
// gelijk (groen werkt op licht én donker). Enkel de tekstkleur wisselt.
//
// Gebruik:
//   node scripts/genereer-badges.js            # alle slugs onder badges/
//   node scripts/genereer-badges.js <slug>     # alleen deze pagina
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const FONTS = path.join(ROOT, 'assets', 'fonts');
const SEAL_PNG = path.join(ROOT, 'assets', 'zegel.png');

// Zegelbron: 'image' = Oliviers eigen zegel-PNG (assets/zegel.png), ingebed als
// data-URI. 'vector' = zelfde ontwerp volledig in SVG (schulprand + witte ring +
// vink) in brand-groen — altijd vlijmscherp, geen extern bestand. De PNG is klein
// (79×78), dus 'image' wordt bij grote weergave wat zacht; 'vector' niet.
const SEAL_MODE = process.env.SEAL_MODE || 'image';

// ---- ontwerp-tokens (tunebaar; niets hiervan raakt de rekenmethodiek) -------
const D = {
  scale:      3,          // rasterschaal: SVG-eenheden × scale = px (hi-res)
  pad:        34,         // marge rondom de inhoud (transparant)
  green:      '#619870',  // brand-groen (== kleur van Oliviers zegel-asset)

  topSize:    54,         // bedrijfsnaam (Poppins Regular)
  bigSize:    104,        // "Top N <niche>" (Poppins ExtraBold)
  botSize:    40,         // "Keurwijzer.be | regio - jaar" (SemiBold + Regular)

  gapSealText: 30,        // horizontale ruimte tussen zegel en grote tekst
  sealR:       66,        // buitenstraal zegel
  sealAmp:     6,         // schulpdiepte (bump-amplitude)
  sealBumps:   12,        // aantal schulpen

  // baseline-posities in werkeenheden (relatieve spatiëring telt; absolute niet —
  // achteraf wordt alles strak bijgesneden op de bounding box + pad)
  y1: 96,   // bedrijfsnaam
  y2: 214,  // grote regel
  y3: 286,  // onderregel
  x0: 40,   // linkerkantlijn (zegel, bedrijfsnaam en onderregel delen deze)
};

// tekstkleuren per variant (zegel blijft altijd groen)
const VARIANTS = {
  donker: { top: '#262626', big: '#141414', botBold: '#1A1A1A', botReg: '#444444' },
  licht:  { top: '#FFFFFF', big: '#FFFFFF', botBold: '#FFFFFF', botReg: '#E8E8E8' },
};

// ---- fonts eenmalig laden ----------------------------------------------------
const FR = opentype.loadSync(path.join(FONTS, 'Poppins-Regular.ttf'));
const FS = opentype.loadSync(path.join(FONTS, 'Poppins-SemiBold.ttf'));
const FX = opentype.loadSync(path.join(FONTS, 'Poppins-ExtraBold.ttf'));

// Zegel-PNG eenmalig als data-URI inlezen (voor SEAL_MODE === 'image').
const SEAL_DATA_URI = (SEAL_MODE === 'image' && fs.existsSync(SEAL_PNG))
  ? 'data:image/png;base64,' + fs.readFileSync(SEAL_PNG).toString('base64')
  : null;

// Eén tekstrun → { d, bbox, adv }. Baseline op (x, y), grootte size.
function run(font, text, x, y, size) {
  const p = font.getPath(text, x, y, size);
  const bb = p.getBoundingBox();
  return { d: p.toPathData(3), bbox: bb, adv: font.getAdvanceWidth(text, size) };
}

// Schulprand-zegel: straal(θ) = Rmid + amp·cos(bumps·θ), fijn gesampled → glad.
function sealPath(cx, cy, Rmid, amp, bumps, samples) {
  let d = '';
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * 2 * Math.PI;
    const r = Rmid + amp * Math.cos(bumps * t);
    const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2) + ' ';
  }
  return d + 'Z';
}

function union(boxes) {
  return boxes.reduce((a, b) => ({
    x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2),
  }));
}

// Bouwt de volledige badge-SVG voor één bedrijf in één kleurvariant.
function badgeSVG(meta, entry, variant) {
  const col = VARIANTS[variant];
  const bigText = entry.tier + ' ' + meta.vakMv;              // "Top 10 dakwerkers"
  const bx = D.x0 + 2 * D.sealR + D.gapSealText;              // grote tekst begint na zegel

  // tekstruns
  const rTop = run(FR, entry.naam, D.x0, D.y1, D.topSize);
  const rBig = run(FX, bigText, bx, D.y2, D.bigSize);
  const rKw  = run(FS, 'Keurwijzer.be', D.x0, D.y3, D.botSize);
  const botRest = ' | ' + meta.regioNaam + ' - ' + meta.jaar;
  const rReg = run(FR, botRest, D.x0 + rKw.adv, D.y3, D.botSize);

  // zegel: verticaal gecentreerd op de optische kern van de grote regel
  const cx = D.x0 + D.sealR;
  const cy = D.y2 - D.bigSize * 0.35;
  const Rmid = D.sealR - D.sealAmp;
  const R = D.sealR;
  const sealBox = { x1: cx - R, y1: cy - R, x2: cx + R, y2: cy + R };

  // bounding box van álles → strak bijsnijden met uniforme marge
  const bb = union([rTop.bbox, rBig.bbox, rKw.bbox, rReg.bbox, sealBox]);
  const w = (bb.x2 - bb.x1) + 2 * D.pad;
  const h = (bb.y2 - bb.y1) + 2 * D.pad;
  const tx = D.pad - bb.x1, ty = D.pad - bb.y1;   // verschuif inhoud naar (pad,pad)

  // zegel: óf Oliviers eigen PNG (ingebed), óf hetzelfde ontwerp in SVG
  let sealMarkup;
  if (SEAL_DATA_URI) {
    sealMarkup = `<image href="${SEAL_DATA_URI}" x="${(cx - R).toFixed(2)}" y="${(cy - R).toFixed(2)}" width="${(2 * R).toFixed(2)}" height="${(2 * R).toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
  } else {
    const ring = R * 0.60, ringW = R * 0.075, ckW = R * 0.11;
    const check = 'M' + (cx - 0.30 * R).toFixed(2) + ' ' + (cy + 0.02 * R).toFixed(2) +
                  ' L' + (cx - 0.08 * R).toFixed(2) + ' ' + (cy + 0.22 * R).toFixed(2) +
                  ' L' + (cx + 0.32 * R).toFixed(2) + ' ' + (cy - 0.24 * R).toFixed(2);
    sealMarkup =
      `<path d="${sealPath(cx, cy, Rmid, D.sealAmp, D.sealBumps, 480)}" fill="${D.green}"/>` +
      `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${ring.toFixed(2)}" fill="none" stroke="#FFFFFF" stroke-width="${ringW.toFixed(2)}"/>` +
      `<path d="${check}" fill="none" stroke="#FFFFFF" stroke-width="${ckW.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(w * D.scale).toFixed(0)}" height="${(h * D.scale).toFixed(0)}" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}">
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)})">
    ${sealMarkup}
    <path d="${rTop.d}" fill="${col.top}"/>
    <path d="${rBig.d}" fill="${col.big}"/>
    <path d="${rKw.d}" fill="${col.botBold}"/>
    <path d="${rReg.d}" fill="${col.botReg}"/>
  </g>
</svg>`;
}

async function renderPng(svg, outPath) {
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(outPath, png);
  return png.length;
}

async function genereerSlug(slug) {
  const jsonPath = path.join(ROOT, 'badges', slug, 'badges.json');
  if (!fs.existsSync(jsonPath)) { console.error('  ! ' + slug + ': geen badges.json — sla over'); return 0; }
  const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const dir = path.dirname(jsonPath);
  let n = 0;
  const geldig = new Set();
  for (const entry of meta.bedrijven) {
    for (const variant of ['donker', 'licht']) {
      const svg = badgeSVG(meta, entry, variant);
      const bestand = entry.bedrijfSlug + '--' + variant + '.png';
      await renderPng(svg, path.join(dir, bestand));
      geldig.add(bestand);
      n++;
    }
  }

  // WEESBADGES OPRUIMEN — badges van bedrijven die niet meer in de selectie staan.
  //
  // Waarom dit moet: lib/push-badges.js spiegelt deze map naar de data-repo, dus
  // wat hier blijft liggen blijft ook op de CDN staan. Een bedrijf dat uit de
  // Top 10 valt — bij een herberekening of een nieuwe methodiek-versie — houdt
  // dan een werkende badge-URL die "Top 3" claimt terwijl het niet eens meer op
  // de pagina staat. Dat is precies de belofte die Keurwijzer níét mag breken:
  // een plaats is niet te koop en wordt jaarlijks herbekeken.
  //
  // Dit is al één keer gebeurd: methodiek v5 haalde in Kortrijk een
  // dakvensterinstallateur en een lichtstraatbouwer uit de selectie, maar hun
  // badges bleven live op de CDN staan.
  //
  // build-all.js ruimt hele weespagina's op (badges/<slug> voor een verdwenen
  // regio); dit ruimt de losse bedrijven bínnen een pagina op.
  const wezen = fs.readdirSync(dir)
    .filter(f => f.endsWith('.png') && !geldig.has(f));
  for (const f of wezen) {
    fs.rmSync(path.join(dir, f));
    console.log('    · weesbadge verwijderd: ' + slug + '/' + f + ' (bedrijf staat niet meer in de selectie)');
  }

  console.log('  ✓ ' + slug + ': ' + n + ' badges (' + meta.bedrijven.length + ' bedrijven × 2 varianten)' +
    (wezen.length ? ', ' + wezen.length + ' wees(en) opgeruimd' : ''));
  return n;
}

async function main() {
  const arg = process.argv[2];
  const badgesRoot = path.join(ROOT, 'badges');
  let slugs;
  if (arg) {
    slugs = [arg];
  } else {
    if (!fs.existsSync(badgesRoot)) { console.error('Geen badges/ map — draai eerst node build.js <slug>.'); process.exit(0); }
    slugs = fs.readdirSync(badgesRoot, { withFileTypes: true })
      .filter(e => e.isDirectory()).map(e => e.name);
  }
  console.log('› badges genereren voor ' + slugs.length + ' pagina(\'s)...');
  let total = 0;
  for (const s of slugs) total += await genereerSlug(s);
  console.log('✓ klaar — ' + total + ' PNG-badges gegenereerd.');
}

main().catch(err => { console.error('FOUT: ' + (err.stack || err.message)); process.exit(1); });
