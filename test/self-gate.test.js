import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findDeAiTells, findRecordCorruption } from '../engine.js';

const skill = (f) => fileURLToPath(new URL(`../${f}`, import.meta.url));

// The gate must pass its OWN prose docs (no de-AI char/phrase tells).
for (const doc of ['SKILL.md', 'README.md']) {
  test(`self-gate: ${doc} has no de-AI tells`, () => {
    const hits = findDeAiTells(readFileSync(skill(doc), 'utf8'));
    assert.deepEqual(hits, [], `${doc} tells: ${JSON.stringify(hits)}`);
  });
}

// The gate must pass its OWN authored DATA (catalog uses \uXXXX escapes — no literal corruption).
// NOTE: detection CODE (engine.js/cli.mjs/gate.py) is intentionally NOT record-gated — it
// contains the very glyphs it detects; that is the detector, not corruption.
test('self-gate: catalog.json has no record corruption', () => {
  const hits = findRecordCorruption(readFileSync(skill('catalog.json'), 'utf8'));
  assert.deepEqual(hits, [], `catalog.json corruption: ${JSON.stringify(hits)}`);
});
