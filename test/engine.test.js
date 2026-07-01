import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scannable, findDeAiTells, findRecordCorruption, findStructuralWarnings } from '../engine.js';

test('findDeAiTells flags an em-dash in served copy', () => {
  const hits = findDeAiTells('<p>fast — reliable</p>');
  assert.ok(hits.some(h => /em dash/.test(h.name)));
});

test('findDeAiTells flags a phrase tell case-insensitively', () => {
  const hits = findDeAiTells('<p>Let us Delve into this</p>');
  assert.ok(hits.some(h => h.name === 'delve'));
});

test('findDeAiTells flags "in today\'s <adj> world" filler (v1.0.2)', () => {
  assert.ok(findDeAiTells("<p>In today's digital world, brands must adapt.</p>").some(h => /today/.test(h.name)));
  assert.ok(findDeAiTells("<p>in today's ever-changing world</p>").some(h => /today/.test(h.name)));
  // functional "today's world" without the filler adjective stays clean
  assert.deepEqual(findDeAiTells("<p>The news covers today's world events.</p>"), []);
});

test('findDeAiTells does NOT HARD-flag functional "unlock" microcopy (v1.0.1)', () => {
  // progressive-disclosure UI + account/feature senses are functional, not filler
  assert.deepEqual(findDeAiTells('<p>Complete Step 1 first to unlock this step.</p>'), []);
  assert.deepEqual(findDeAiTells('<p>Reset your password to unlock your account.</p>'), []);
});

test('findDeAiTells still HARD-flags elevate / seamless as bare filler (v1.0.1)', () => {
  assert.ok(findDeAiTells('<p>Elevate your brand today.</p>').some(h => /elevate . seamless/.test(h.name)));
  assert.ok(findDeAiTells('<p>A seamless experience.</p>').some(h => /elevate . seamless/.test(h.name)));
});

test('scannable drops CSS but keeps inline script string copy', () => {
  const s = scannable('<style>a{color:red}</style><script>const t="Delve here"</script>');
  assert.equal(/color:red/.test(s), false);
  assert.equal(/Delve here/.test(s), true);
});

test('findDeAiTells does NOT flag a clean human paragraph', () => {
  assert.deepEqual(findDeAiTells('<p>We fixed the roof in two days. Call us.</p>'), []);
});

test('findRecordCorruption catches a curly quote with its line number', () => {
  const src = 'const a = "ok";\nconst b = "“nope”";';
  const hits = findRecordCorruption(src);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);
  assert.ok(/curly double quote/.test(hits[0].name));
});

test('findRecordCorruption does NOT flag accented letters or em-dash (served-gate policy)', () => {
  assert.deepEqual(findRecordCorruption('const city = "Jose cafe";\nconst d = "a — b";'), []);
});

test('findStructuralWarnings flags a low sentence-length sigma block', () => {
  const uniform = Array.from({ length: 12 }, () => 'We fixed the roof today.').join(' ');
  const warns = findStructuralWarnings(`<p>${uniform}</p>`);
  assert.ok(warns.some(w => /sigma|σ/.test(w)));
});

test('findStructuralWarnings returns [] for varied human prose', () => {
  const varied = '<p>We fixed it. The next morning, after the rain finally let up and the crew '
    + 'could get back on the roof safely, we finished the flashing and cleaned up. Done.</p>';
  assert.deepEqual(findStructuralWarnings(varied), []);
});