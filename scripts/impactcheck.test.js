#!/usr/bin/env node
// =====================================================================
// scripts/impactcheck.test.js — de impactcheck draait mee met npm test
//
// Hier faalt hij WEL hard, anders dan in build-all.js. Dit is de plek waar je
// een los eindje hoort te merken: vóór het ertoe doet, niet tijdens een
// publicatie.
// =====================================================================
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { execFileSync } = require('child_process');

test('impactcheck: tekst en code dekken elkaar nog', () => {
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'impactcheck.js'), '--stil'],
      { stdio: 'pipe' });
  } catch (e) {
    const uitleg = (e.stdout || '') + (e.stderr || '');
    assert.fail('De impactcheck vond losse eindjes:\n' + uitleg.toString());
  }
});
