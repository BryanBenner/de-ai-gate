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
// JS comment-stripping is scoped to <script> BODIES ONLY (F1019 fix, 2026-09-10):
// a document-wide `//` strip deleted from any protocol-relative URL
// (href="//cdn...", srcset, etc.) to end-of-line, and on minified single-line
// HTML that blanked the entire document — findDeAiTells() then returned []
// (identical to a genuinely clean page), silently. The comment strip's actual
// job is JS line/block comments inside inline <script> tags; scoping it there
// removes the false match surface entirely instead of patching the regex.
export function scannable(html) {
  let s = html;
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    const stripped = body
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    return `<script${attrs}>${stripped}</script>`;
  });
  return s;
}

// Decode HTML character references before the tell scan, with intent preserved:
// - Reader-VISIBLE glyph refs (&mdash; &#8212; &hellip; smart quotes) decode to
//   their TRUE codepoints - the browser renders the tell either way, so the gate
//   must see the same character the reader sees.
// - INVISIBLE-class refs (&nbsp; &thinsp; &shy; &zwnj; and their numeric forms)
//   decode to a plain space: an explicit entity is a deliberate authoring choice
//   (ubiquitous legitimate HTML), NOT the paste-artifact the invisible-unicode
//   tell hunts. A literal U+00A0/ZWSP in the raw text is untouched by decoding
//   and still flags. (v1.0.5 - v1.0.4 decoded &nbsp; to U+00A0 and false-
//   positived the tell across ordinary pages.)
// Single pass, numeric first: double-escaped "&amp;mdash;" stays literal/clean.
const INVISIBLE_CODEPOINTS = new Set([0x00A0, 0x2009, 0x2002, 0x2003, 0x00AD, 0x200B, 0x200C, 0x200D, 0x202F, 0x200A, 0xFEFF]);
const NAMED_REFS = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', thinsp: ' ', ensp: ' ', emsp: ' ',
  shy: ' ', zwnj: ' ', zwj: ' ',
  mdash: '—', ndash: '–', hellip: '…',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  copy: '©', reg: '®',
};
const fromCode = (cp) => (INVISIBLE_CODEPOINTS.has(cp) ? ' ' : String.fromCodePoint(cp));
export function decodeCharRefs(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => fromCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCode(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in NAMED_REFS ? NAMED_REFS[n.toLowerCase()] : m));
}

// Char + phrase tells on SERVED HTML. Any single hit is a violation.
// Char tells scan the decoded text as-is; phrase tells additionally scan a
// smart-quote-normalized copy, because the apostrophe-bearing phrases
// ("it's important to note", "whether you're", "let's dive in") are written
// with ASCII quotes in the catalog while AI output typically carries curly
// ones — typography must not launder the phrase.
export function findDeAiTells(html) {
  const text = decodeCharRefs(scannable(html));
  const phraseText = text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const hits = [];
  for (const t of CATALOG.charTells) {
    const m = text.match(t.re);
    if (m) hits.push({ name: t.name, match: m[0] });
  }
  for (const t of CATALOG.phraseTells) {
    const m = phraseText.match(t.re);
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
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => fromCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCode(parseInt(d, 10)))
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

// Spaced (" -- ") or unspaced ("word--word") double-hyphen used as an em-dash stand-in.
// Added 2026-07-23 (dispatch 2026-07-23T163600Z-001): the de-AI charTells/phraseTells
// groups already flag literal em dash (U+2014) and en dash (U+2013), which pushed
// authors to launder past the gate by typing "--" instead of writing an em dash - the
// gate never saw the substitution because "--" isn't a tell. This closes that loophole.
// Landed as a STRUCTURAL WARNING, not a charTells/phraseTells hard-fail: a fleet-wide
// blast-radius scan this tick (grep across public/ + clients/*/dist) found ~41 already-
// shipped pages on livingwebsites.ca's OWN site using this exact construction (mockups,
// guides, insights, even the homepage) - promoting it straight to ERROR would newly-fail
// a large slice of the live fleet with no rewrite done yet. WARN closes the loophole for
// all NEW content immediately while staging the ERROR promotion as a follow-up sweep.
const DOUBLE_HYPHEN_RE = /(\s-{2,}\s)|(\b\w+-{2,}\w+\b)/g;

// `mailto:` anchor, WARN-level (operator directive 2026-07-23: "every mailto: should be
// removed and redirected to the form... they either want a form, or the email in their
// clipboard" - a mailto: anchor opens the visitor's local mail client, which is exactly
// the behavior the operator ruled out). Same phased-rollout discipline as DOUBLE_HYPHEN_RE
// above: landed as a STRUCTURAL WARNING, not a hard-fail, because a fleet-wide blast-radius
// scan (public/ + clients/*/dist, excluding public/mockups//public/m//public/demos/ which
// are cached other-client/demo snapshots, not live client builds) found real mailto:
// anchors still shipped on several own-site surfaces at add-time - promoting straight to
// ERROR now would fail those existing pages before they are swept. WARN surfaces every
// occurrence immediately; promotion to ERROR is a follow-up sweep, mirroring the
// double-hyphen loophole's own WARN-first-then-promote sequencing. Scoped to `href=` only
// (tel:/sms:/wa.me are explicitly out of scope, per the same operator directive - tap-to-
// call/text stays correct mobile behavior) and checked against the RAW html, not the
// tag-stripped extractVisibleText() text this function otherwise scans, since an anchor's
// href attribute never survives that stripping pass.
const MAILTO_HREF_RE = /href\s*=\s*["']mailto:/gi;

// Insecure `<form>` action, WARN-level. Ports the spirit of
// test/demo-safety.test.js's local `formPostsToApiLead` helper into the
// canonical engine so the check applies gate-wide (every served page this
// engine scans), not only the demo fleet that local helper covered. A form is
// judged "secured" one of two ways:
//   (1) its OWN action/method attributes are a real POST endpoint --
//       action="/api/..." (or any absolute-path action, not "#"/empty/
//       "javascript:...") AND method="post"; or
//   (2) the page has no literal action wired at all, but an inline <script>
//       on the SAME page intercepts that submit (`.preventDefault(`) and
//       fetches a real POST endpoint (`fetch(...)` with `method` "POST" and a
//       "/api/..." URL) -- the exact live pattern on livingwebsites.ca's own
//       homepage `#leadform` and `/get-started/` forms today (verified before
//       writing this rule: public/index.html's form carries no `action`
//       attribute at all and is secured entirely by its paired submit-handler
//       script). A literal action-attribute-only port of the demo-safety
//       helper would have false-positived that real, already-secure form --
//       this widened definition is a deliberate, verified correction, not a
//       loophole (a page with NEITHER a secured action NOR any fetch-to-POST
//       script anywhere on it still warns).
// Landed WARN-tier, same phased-rollout discipline as MAILTO_HREF_RE and
// DOUBLE_HYPHEN_RE above (both started WARN, promoted to ERROR once the fleet
// was swept clean) -- this rule is brand-new gate-wide and its own-site blast
// radius has not been fully swept, so a hard-fail here risks the exact
// false-positive-noise-gets-ignored failure mode those two comments warn
// about. Scoped to a form's OPENING TAG for the action/method read (checked
// against the raw html, mirroring MAILTO_HREF_RE's href-attribute rationale --
// extractVisibleText()'s tag-stripping pass would destroy the attribute), and
// to the whole raw html for the JS-fallback scan.
const FORM_TAG_RE = /<form\b[^>]*>/gi;
const REAL_POST_ACTION_RE = /^\/[\w\-./]*$/; // absolute path, not "#"/empty/javascript:
const JS_SECURED_SUBMIT_RE = /preventDefault\s*\(\s*\)[\s\S]{0,400}?fetch\s*\(\s*['"][^'"]*\/api\/[\w-]+['"][\s\S]{0,200}?method\s*:\s*['"]POST['"]/i;

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1] : null;
}

export function findInsecureFormActions(html) {
  const forms = html.match(FORM_TAG_RE) || [];
  if (forms.length === 0) return [];
  const jsSecured = JS_SECURED_SUBMIT_RE.test(html);
  const bad = [];
  for (const tag of forms) {
    const action = attr(tag, 'action');
    const method = (attr(tag, 'method') || '').toLowerCase();
    const hasRealAction = action !== null && REAL_POST_ACTION_RE.test(action) && action !== '#';
    const declaredSecure = hasRealAction && method === 'post';
    if (declaredSecure) continue;
    if (action === null && jsSecured) continue; // no literal action, but page-wide JS secures the submit
    bad.push(tag.length > 120 ? tag.slice(0, 120) + '...' : tag);
  }
  return bad;
}

export function findStructuralWarnings(html) {
  const text = extractVisibleText(html);
  const words = (text.match(/\b[\w']+\b/g) || []).length;
  const warn = [];

  const mailtoHrefs = (html.match(MAILTO_HREF_RE) || []).length;
  if (mailtoHrefs >= 1) {
    warn.push(`${mailtoHrefs}x href="mailto:" anchor - replace with a click-to-copy control + on-page form (operator directive 2026-07-23: no mailto: links, tel:/sms:/wa.me stay)`);
  }

  const insecureForms = findInsecureFormActions(html);
  if (insecureForms.length >= 1) {
    warn.push(`${insecureForms.length}x insecure form action - form must POST to a real endpoint (e.g. action="/api/lead" method="post") or have its submit JS-secured to one; found: ${insecureForms.join(' | ')}`);
  }

  const doubleHyphen = (text.match(DOUBLE_HYPHEN_RE) || []).length;
  if (doubleHyphen >= 1) {
    warn.push(`${doubleHyphen}x spaced/unspaced double-hyphen ("--") standing in for an em dash - rewrite the sentence, don't launder past the em-dash tell`);
  }

  // v1.0.10 (mycelium gate-research 2026-08-23T073533Z, Finding 1): comma was
  // mandatory before "but", so the plain, natural-reading antithesis ("a new
  // roof is not an expense but an investment") escaped this counter entirely
  // -- only the comma'd, more-intensified reframe (already also caught by the
  // separate HARD phraseTell above when paired with just/only/merely) was
  // ever counted. Comma is now optional; the intensifier stays optional too.
  const notXbutY = (text.match(/\bnot (just |only |merely |simply )?[^,.;]{1,40},?\s*but\b/gi) || []).length;
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
