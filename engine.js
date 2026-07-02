// skills/de-ai-gate/engine.js
// Canonical de-AI detection engine. Reads catalog.json so the tell definitions are
// single-source and never fork between the JS engine and gate.py. Note: JS \b is
// ASCII-only while Python \b is Unicode-aware; adjacent non-ASCII text may differ
// (near-zero in real prose). Lifted from production use.
// tools/content-engine/gates/de-ai-tells.js @85409a0 (F424) - the only prior
// variant carrying the record-source corruption scan.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function loadCatalog() {
  const c = JSON.parse(readFileSync(fileURLToPath(new URL('./catalog.json', import.meta.url)), 'utf8'));
  for (const group of ['charTells', 'recordCorruption', 'phraseTells', 'banned']) {
    for (const t of c[group]) t.re = new RegExp(t.source, t.flags);
  }
  return c;
}
const CATALOG = loadCatalog();

// Reduce HTML to served, user-visible copy: drop CSS + comments, KEEP tags/text/
// attributes and inline <script> string literals (CTA labels are served copy).
export function scannable(html) {
  let s = html;
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return s;
}

// Char + phrase tells on SERVED HTML. Any single hit is a violation.
export function findDeAiTells(html) {
  const text = scannable(html);
  const hits = [];
  for (const t of [...CATALOG.charTells, ...CATALOG.phraseTells]) {
    const m = text.match(t.re);
    if (m) hits.push({ name: t.name, match: m[0] });
  }
  return hits;
}

// Typographic-substitution corruption on authored RECORD SOURCE (JS/JSON spine).
// Line-oriented so the gate can point at file:line. Scoped to the substitution
// class only — accented letters and em/en-dash stay legitimate here.
export function findRecordCorruption(source) {
  const hits = [];
  source.split(/\r?\n/).forEach((line, i) => {
    for (const c of CATALOG.recordCorruption) {
      if (c.re.test(line)) hits.push({ name: c.name, line: i + 1, sample: line.trim().slice(0, 90) });
    }
  });
  return hits;
}

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    mdash: '—', ndash: '–', hellip: '…', rsquo: '’',
    lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©', reg: '®' };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in named ? named[n.toLowerCase()] : m));
}

export function extractVisibleText(html) {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<head[\s\S]*?<\/head>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) =>
    /application\/mustache|text\/template|class\s*=\s*["'][^"']*mustache/i.test(attrs) ? ' ' + body + ' ' : ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/[  ​ ]/g, ' ');
  s = s.replace(/[ \t\f\r]+/g, ' ').replace(/\n{2,}/g, '\n\n');
  return s;
}

function paragraphs(text) {
  return text.split(/\n\s*\n|(?<=[.!?])\s{2,}/).map(p => p.trim()).filter(p => p.length > 30);
}
function sentencesOf(text) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"“])/).map(x => x.trim())
    .filter(x => x.split(/\s+/).length >= 2);
}
function stdev(nums) {
  if (nums.length < 2) return 0;
  const m = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.sqrt(nums.reduce((a, b) => a + (b - m) ** 2, 0) / nums.length);
}

export function findStructuralWarnings(html) {
  const text = extractVisibleText(html);
  const words = (text.match(/\b[\w']+\b/g) || []).length;
  const warn = [];

  const notXbutY = (text.match(/\bnot (just |only |merely |simply )?[^,.;]{1,40}, but\b/gi) || []).length;
  const cap = Math.max(1, Math.floor(words / 400));
  if (notXbutY > cap) warn.push(`${notXbutY}x "not-X-but-Y" antithesis (cap ${cap} @ 1/400w)`);

  const tricolon = (text.match(/\b\w+, \w+,? and \w+\b/gi) || []).length;
  if (tricolon >= 2) warn.push(`${tricolon}x triplet/tricolon list - vary with pairs and fours`);

  const transRe = new RegExp(`\\b(${CATALOG.transitions.join('|')})\\b`, 'gi');
  const trans = (text.match(transRe) || []).length;
  const tcap = Math.max(1, Math.floor(words / 300));
  if (trans > tcap) warn.push(`${trans}x transition scaffolding (${CATALOG.transitions.join('/')})`);

  const sents = sentencesOf(text);
  if (sents.length >= 10) {
    const sigma = stdev(sents.map(s => s.split(/\s+/).length));
    if (sigma < 8) warn.push(`sentence-length sigma=${sigma.toFixed(1)} (<8 - too uniform; vary rhythm)`);
  }

  for (const para of paragraphs(text)) {
    const hits = CATALOG.watchlist.filter(w =>
      new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(para));
    if (hits.length >= 2) { warn.push(`watchlist cluster in one paragraph: ${hits.join(', ')}`); break; }
  }
  return warn;
}
