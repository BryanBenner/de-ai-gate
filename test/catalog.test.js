import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const catalog = JSON.parse(
  readFileSync(fileURLToPath(new URL('../catalog.json', import.meta.url)), 'utf8')
);

test('catalog has all six tell groups', () => {
  for (const k of ['charTells', 'recordCorruption', 'phraseTells', 'banned', 'watchlist', 'transitions']) {
    assert.ok(k in catalog, `missing group ${k}`);
  }
});

test('every pattern source compiles as a RegExp in JS', () => {
  for (const group of ['charTells', 'recordCorruption', 'phraseTells', 'banned']) {
    for (const t of catalog[group]) {
      assert.doesNotThrow(() => new RegExp(t.source, t.flags), `bad regex in ${group}: ${t.name}`);
    }
  }
});

test('catalog source contains no literal curly quotes or em/en-dash (passes its own record gate)', () => {
  const raw = readFileSync(fileURLToPath(new URL('../catalog.json', import.meta.url)), 'utf8');
  assert.equal(/[“”‘’—–… ]/.test(raw), false,
    'catalog.json must encode non-ASCII codepoints as \\uXXXX, never literal');
});

test('record gate catches em-dash on em-dash policy split: record group excludes em/en-dash', () => {
  const names = catalog.recordCorruption.map(t => t.name).join(' ');
  assert.equal(/dash/i.test(names), false, 'em/en-dash are served-gate policy, not record-corruption');
});
