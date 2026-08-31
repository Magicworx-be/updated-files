// =====================================================================
// lib/whatsapp.js — WhatsApp-nummers van deelnemende bedrijven
//
// Bedrijven die op Keurwijzer staan mogen zélf hun WhatsApp-nummer
// doorgeven. Doen ze dat, dan krijgt hun kaart een ingetogen
// "WhatsApp"-tekstlink naast "Naar website". Puur contactinformatie:
// het nummer komt NERGENS in de berekening voor en beïnvloedt selectie
// noch volgorde. Zie METHODIEK.md § Contactgegevens.
//
// Bron: data/whatsapp.json. Dat bestand wordt gevuld vanuit de (private)
// Google Sheet waarin Olivier de doorgegeven nummers bijhoudt. Omdat de
// build alleen dit lokale bestand leest, kan er nooit een build mislukken
// omdat Google onbereikbaar is.
//
// Vorm van data/whatsapp.json:
//   { "nummers": [
//       { "slug": "dakwerkers-gent", "bedrijf": "Dakwerken Maenhaut",
//         "whatsapp": "0475 12 34 56", "toestemming": "2026-08-31" }
//   ] }
//
// Koppeling gebeurt op slug + genormaliseerde bedrijfsnaam — exact dezelfde
// sleutel als beoordeling.json gebruikt. Staat een bedrijf in twee regio's,
// dan zijn dat twee regels; dat is bewust expliciet.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');

// Openingszin die WhatsApp voor de bezoeker invult. Bewust neutraal: geen
// aanname over de vraag, wél meteen duidelijk waar de klant vandaan komt.
const OPENINGSZIN = 'Hallo, ik vond u via Keurwijzer.';

function norm(name) { return String(name).toLowerCase().replace(/\s+/g, ' ').trim(); }

// Belgische nummers zoals ze binnenkomen ("0475 12 34 56", "+32 475 123456",
// "0032475123456", "0475/12.34.56") omzetten naar het formaat dat wa.me wil:
// enkel cijfers, met landcode, zonder plus. Geeft null bij iets onbruikbaars —
// de aanroeper maakt daar een harde fout van.
function normaliseerNummer(ruw) {
  if (ruw == null) return null;
  let s = String(ruw).trim();
  if (!s) return null;
  const plus = s.startsWith('+');
  s = s.replace(/\D/g, '');
  if (!s) return null;
  if (!plus && s.startsWith('00')) s = s.slice(2);      // 0032... → 32...
  else if (s.startsWith('0')) s = '32' + s.slice(1);    // 0475... → 32475...
  else if (!plus && s.length === 9) s = '32' + s;       // 475123456 → 32475...
  // Landcode + abonneenummer: kort genoeg om een tikfout te vangen, ruim
  // genoeg om buitenlandse nummers toe te laten.
  if (s.length < 10 || s.length > 15) return null;
  return s;
}

function waUrl(nummer, tekst) {
  return 'https://wa.me/' + nummer + '?text=' + encodeURIComponent(tekst || OPENINGSZIN);
}

// Leest data/whatsapp.json en geeft { rijen, fouten } terug. Ontbreekt het
// bestand, dan is dat geen fout — dan heeft simpelweg nog niemand een nummer
// doorgegeven.
function load(root) {
  const p = path.join(root, 'data', 'whatsapp.json');
  if (!fs.existsSync(p)) return { rijen: [], fouten: [] };

  let doc;
  try { doc = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return { rijen: [], fouten: ['data/whatsapp.json bevat ongeldige JSON — ' + e.message] }; }

  const fouten = [];
  const rijen = [];
  const lijst = Array.isArray(doc) ? doc : (doc.nummers || []);
  if (!Array.isArray(lijst)) {
    return { rijen: [], fouten: ['data/whatsapp.json: verwacht een lijst onder "nummers"'] };
  }

  const gezien = new Set();
  lijst.forEach((r, i) => {
    const waar = 'data/whatsapp.json, regel ' + (i + 1) +
      (r && r.bedrijf ? ' ("' + r.bedrijf + '")' : '');
    if (!r || !r.slug || !r.bedrijf) {
      fouten.push(waar + ': "slug" en "bedrijf" zijn allebei verplicht');
      return;
    }
    const nummer = normaliseerNummer(r.whatsapp);
    if (!nummer) {
      fouten.push(waar + ': "' + (r.whatsapp == null ? '' : r.whatsapp) +
        '" is geen bruikbaar telefoonnummer');
      return;
    }
    const sleutel = r.slug + '|' + norm(r.bedrijf);
    if (gezien.has(sleutel)) {
      fouten.push(waar + ': staat twee keer in de lijst voor dezelfde regio');
      return;
    }
    gezien.add(sleutel);
    rijen.push({ slug: r.slug, bedrijf: r.bedrijf, sleutel, nummer,
      url: waUrl(nummer), toestemming: r.toestemming || null });
  });

  return { rijen, fouten };
}

// Alle rijen voor één regiopagina, als Map(genormaliseerde naam → rij).
function forSlug(root, slug) {
  const { rijen, fouten } = load(root);
  const map = new Map();
  rijen.filter(r => r.slug === slug).forEach(r => map.set(norm(r.bedrijf), r));
  return { map, fouten };
}

module.exports = { OPENINGSZIN, norm, normaliseerNummer, waUrl, load, forSlug };
