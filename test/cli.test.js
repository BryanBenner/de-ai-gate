import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
const fx = (n) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
function run(args) {
  try { return { code: 0, out: execFileSync('bun', [cli, ...args], { encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
}

test('clean html exits 0', () => {
  assert.equal(run(['--html', fx('clean.html')]).code, 0);
});
test('dirty html exits 1 and names a tell', () => {
  const r = run(['--html', fx('dirty.html')]);
  assert.equal(r.code, 1);
  assert.ok(/delve|dive in|seamless/.test(r.out));
});
test('record-dirty.js exits 1 on --records with a line number', () => {
  const r = run(['--records', fx('record-dirty.js')]);
  assert.equal(r.code, 1);
  assert.ok(/curly/.test(r.out));
});
test('--warn-only never exits non-zero even when dirty', () => {
  assert.equal(run(['--warn-only', '--html', fx('dirty.html')]).code, 0);
});
