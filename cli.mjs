#!/usr/bin/env node
// skills/de-ai-gate/cli.mjs — read-only de-AI gate CLI.
// Exit 1 iff HARD violations found and --warn-only absent. No network, no creds,
// no writes. The deliberate inverse of last30days-skill (F337).
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findDeAiTells, findRecordCorruption, findStructuralWarnings } from './engine.js';

const argv = process.argv.slice(2);
const warnOnly = argv.includes('--warn-only');
function collectFlag(flag, exts) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag) {
      const p = argv[++i];
      if (p) out.push(...walk(p, exts));
    }
  }
  return out;
}
// missing/unreadable paths are collected (not silently swallowed) so a typo'd
// or renamed target reports zero files honestly instead of reading as a clean
// pass (F1019, 2026-09-10).
const missingPaths = [];
const unreadableDirs = [];
function walk(p, exts, acc = []) {
  if (!existsSync(p)) { missingPaths.push(p); return acc; }
  if (statSync(p).isFile()) { if (exts.some(e => p.endsWith(e))) acc.push(p); return acc; }
  let entries;
  try { entries = readdirSync(p, { withFileTypes: true }); }
  catch (e) { unreadableDirs.push({ path: p, code: e.code }); return acc; }
  for (const e of entries) walk(join(p, e.name), exts, acc);
  return acc;
}

// Back-compat: bare positional paths are treated as --html targets.
const barePaths = argv.filter((a, i) => !a.startsWith('--') && !(argv[i - 1] && argv[i - 1].startsWith('--')));
const htmlTargets = [...new Set([...collectFlag('--html', ['.html']), ...barePaths.flatMap(p => walk(p, ['.html']))])];
const recordTargets = [...new Set(collectFlag('--records', ['.js', '.mjs', '.json', '.ts']))];

let hardTotal = 0;
for (const f of htmlTargets) {
  const raw = readFileSync(f, 'utf8');
  const hard = findDeAiTells(raw);
  const warn = findStructuralWarnings(raw);
  if (hard.length || warn.length) {
    console.log(`\n${hard.length ? 'x FAIL' : '~ warn'}  ${f}`);
    for (const h of hard) console.log(`   x ${h.name}: "${h.match}"`);
    for (const w of warn) console.log(`   ~ ${w}`);
  }
  hardTotal += hard.length;
}
for (const f of recordTargets) {
  const hits = findRecordCorruption(readFileSync(f, 'utf8'));
  if (hits.length) {
    console.log(`\nx FAIL  ${f} (record source)`);
    for (const h of hits) console.log(`   x ${f}:${h.line}  ${h.name}  | ${h.sample}`);
  }
  hardTotal += hits.length;
}

for (const m of missingPaths) console.log(`! path does not exist: ${m}`);
for (const u of unreadableDirs) console.log(`! unreadable: ${u.path} (${u.code})`);

console.log(`\n-- de-AI gate -- ${htmlTargets.length} html + ${recordTargets.length} record files | ${hardTotal} HARD violations`);
if ((missingPaths.length || unreadableDirs.length) && htmlTargets.length === 0 && recordTargets.length === 0) {
  console.log('ABORT - no files resolved (see missing/unreadable paths above).\n');
  process.exit(2);
}
if (hardTotal && !warnOnly) { console.log('BLOCKED - fix HARD violations before shipping.\n'); process.exit(1); }
console.log(warnOnly ? 'warn-only: not blocking.\n' : 'de-AI gate passed (no HARD violations).\n');
