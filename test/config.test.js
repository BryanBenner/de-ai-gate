import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findInsecureFormActions } from '../engine.js';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const fx = (n) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const FORM = '<html><body><p>Contact us.</p><form action="{{ form.url }}" method="post"></form></body></html>';
const BARE_FORM = '<html><body><p>Contact us.</p><form action="#"></form></body></html>';

function sandbox(config, files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dag-'));
  if (config !== undefined) {
    const body = typeof config === 'string' ? config : JSON.stringify(config);
    writeFileSync(join(dir, 'de-ai-gate.config.json'), body);
  }
  for (const [n, c] of Object.entries(files)) writeFileSync(join(dir, n), c);
  return dir;
}
function run(args, cwd) {
  try { return { code: 0, out: execFileSync('bun', [cli, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

test('no config and no args: unchanged empty pass', () => {
  const r = run([], sandbox());
  assert.equal(r.code, 0);
  assert.match(r.out, /0 html \+ 0 record files \| 0 HARD/);
});
test('no config: --html args behave as before', () => {
  const dir = sandbox();
  assert.equal(run(['--html', fx('clean.html')], dir).code, 0);
  assert.equal(run(['--html', fx('dirty.html')], dir).code, 1);
});
test('scan.html supplies default targets when no paths are given', () => {
  const r = run([], sandbox({ scan: { html: [fx('dirty.html')], records: [] } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /1 html \+ 0 record/);
});
test('scan.records supplies default record targets', () => {
  const r = run([], sandbox({ scan: { records: [fx('record-dirty.js')] } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /0 html \+ 1 record/);
});
test('explicit CLI paths win over config scan', () => {
  const dir = sandbox({ scan: { html: [fx('dirty.html')] } });
  const r = run(['--html', fx('clean.html')], dir);
  assert.equal(r.code, 0);
  assert.match(r.out, /1 html \+ 0 record/);
  assert.equal(run([fx('clean.html')], dir).code, 0);
});
test('--config <path> loads a config from elsewhere', () => {
  const src = sandbox({ scan: { html: [fx('dirty.html')] } });
  const other = sandbox();
  copyFileSync(join(src, 'de-ai-gate.config.json'), join(other, 'alt.json'));
  assert.equal(run(['--config', join(other, 'alt.json')], sandbox()).code, 1);
});
test('--config pointing at a missing file exits 2', () => {
  const r = run(['--config', 'nope.json'], sandbox());
  assert.equal(r.code, 2);
  assert.match(r.out, /config error/);
});
test('templated form action warns by default', () => {
  const dir = sandbox(undefined, { 'f.html': FORM });
  assert.match(run(['--html', 'f.html'], dir).out, /insecure form action/);
});
test('suppress templated-action hides only the templated form warning', () => {
  const rule = { suppress: [{ warn: 'insecure-form-action', when: 'templated-action' }] };
  const dir = sandbox(rule, { 'f.html': FORM, 'g.html': BARE_FORM });
  const r = run(['--html', 'f.html'], dir);
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /insecure form action/);
  assert.match(run(['--html', 'g.html'], dir).out, /insecure form action/);
});
test('engine: allowTemplatedAction skips only {{ }} actions', () => {
  assert.equal(findInsecureFormActions(FORM).length, 1);
  assert.equal(findInsecureFormActions(FORM, { allowTemplatedAction: true }).length, 0);
  assert.equal(findInsecureFormActions(BARE_FORM, { allowTemplatedAction: true }).length, 1);
  const partial = '<form action="/x/{{ id }}?q" method="post"></form>';
  assert.equal(findInsecureFormActions(partial, { allowTemplatedAction: true }).length, 1);
});
test('unknown suppress warn/when fails loud', () => {
  for (const s of [{ warn: 'mailto', when: 'templated-action' }, { warn: 'insecure-form-action', when: 'always' }]) {
    const r = run([], sandbox({ suppress: [s] }));
    assert.equal(r.code, 2);
    assert.match(r.out, /unsupported suppress rule/);
  }
});
test('missing path is reported but not fatal by default', () => {
  const r = run(['--html', fx('clean.html'), '--html', 'missing-dir'], sandbox());
  assert.equal(r.code, 0);
  assert.match(r.out, /path does not exist: missing-dir/);
});
test('promote.missingPath=error turns a missing path into exit 2', () => {
  const dir = sandbox({ promote: { missingPath: 'error' } });
  const r = run(['--html', fx('clean.html'), '--html', 'missing-dir'], dir);
  assert.equal(r.code, 2);
  assert.match(r.out, /promoted to error/);
  assert.equal(run(['--html', fx('clean.html')], dir).code, 0);
});
test('promote.missingPath=error applies to config scan targets', () => {
  const r = run([], sandbox({ scan: { html: [fx('clean.html'), 'gone'] }, promote: { missingPath: 'error' } }));
  assert.equal(r.code, 2);
});
test('bad promote key or value fails loud', () => {
  assert.equal(run([], sandbox({ promote: { missingPath: 'fatal' } })).code, 2);
  assert.equal(run([], sandbox({ promote: { typo: 'error' } })).code, 2);
});
test('malformed JSON fails loud with exit 2', () => {
  const r = run([], sandbox('{ "scan": '));
  assert.equal(r.code, 2);
  assert.match(r.out, /not valid JSON/);
});
test('unknown top-level key fails loud with exit 2', () => {
  const r = run([], sandbox({ scan: {}, supress: [] }));
  assert.equal(r.code, 2);
  assert.match(r.out, /unknown key\(s\): supress/);
});
test('bad scan shape fails loud', () => {
  assert.equal(run([], sandbox({ scan: { html: 'public' } })).code, 2);
  assert.equal(run([], sandbox({ scan: { css: [] } })).code, 2);
});
