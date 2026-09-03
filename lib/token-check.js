#!/usr/bin/env node
// =====================================================================
// lib/token-check.js — waarschuwt als het GITHUB_TOKEN bijna verloopt.
//
// build-all.js roept dit aan het begin aan (via execFileSync). Eén GET naar
// https://api.github.com/user met het token; GitHub zet de vervaldatum van een
// fine-grained/PAT-token in de responseheader
//   github-authentication-token-expiration: 2026-11-17 08:00:00 UTC
// Ligt die datum binnen 30 dagen, dan drukken we een waarschuwing af — anders
// verloopt het token stil en breekt élke push (registry, badges, site) zonder
// dat iets vooraf waarschuwde.
//
// Regels:
//  - Faalt de aanvraag (geen net, rate limit, ...), dan alleen een melding,
//    nooit een stop: de token-check mag een build nooit blokkeren.
//  - Onbekend datumformaat of geen vervalheader → zwijgen (liever niets dan
//    een vals alarm — meten voor beweren).
//  - Het token komt NOOIT in de uitvoer.
//  - Exitcode is altijd 0; dit is puur informatief.
// =====================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');

// .env inlezen (zelfde simpele parser als de push-scripts).
function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) process.exit(0); // niets in te stellen — de push-scripts melden dit zelf

const DREMPEL_DAGEN = 30;

function ontleedDatum(ruw) {
  if (!ruw) return null;
  let d = new Date(ruw);                       // V8 leest '2026-11-17 08:00:00 UTC' en '... +0100'
  if (isNaN(d.getTime())) d = new Date(String(ruw).replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

const req = https.request('https://api.github.com/user', {
  method: 'GET',
  headers: {
    'Authorization': 'token ' + TOKEN,
    'User-Agent': 'keurwijzer-build',
    'Accept': 'application/vnd.github+json',
  },
}, res => {
  res.resume(); // body niet nodig, wel afvoeren zodat de socket sluit
  const datum = ontleedDatum(res.headers['github-authentication-token-expiration']);
  if (!datum) return; // token zonder vervaldatum of onbekend formaat → zwijgen
  const dagen = Math.floor((datum.getTime() - Date.now()) / 86400000);
  const opDatum = datum.toISOString().slice(0, 10);
  if (dagen < 0) {
    console.error('✗ GITHUB_TOKEN is VERLOPEN sinds ' + opDatum + ' — elke push zal falen.');
    console.error('  → Vernieuw het token op GitHub en werk .env bij (GITHUB_TOKEN).');
  } else if (dagen <= DREMPEL_DAGEN) {
    console.warn('! GITHUB_TOKEN verloopt over ' + dagen + ' dag(en), op ' + opDatum + '.');
    console.warn('  → Vernieuw het token tijdig op GitHub en werk .env bij, anders breekt de publicatie stil.');
  }
});
req.on('error', () => {
  console.warn('! Kon de vervaldatum van GITHUB_TOKEN niet controleren (netwerk?). De build gaat gewoon door.');
});
req.setTimeout(10000, () => { req.destroy(); });
req.end();
