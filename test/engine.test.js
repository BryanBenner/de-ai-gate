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

test('findDeAiTells: "seamless" narrowed to a phrase-pattern (v1.0.5) -- still HARD-flags every filler collocation', () => {
  assert.ok(findDeAiTells('<p>A seamless experience awaits.</p>').some(h => /elevate . seamless/.test(h.name)));
  assert.ok(findDeAiTells('<p>Enjoy seamless integration today.</p>').some(h => /elevate . seamless/.test(h.name)));
  // uncatalogued filler noun -- proves this is an EXCLUSION of the real trade
  // term below, not a positive allowlist of known filler nouns.
  assert.ok(findDeAiTells('<p>We deliver a seamless workflow.</p>').some(h => /elevate . seamless/.test(h.name)));
  assert.ok(findDeAiTells('<p>Our process is seamless.</p>').some(h => /elevate . seamless/.test(h.name)));
});

test('findDeAiTells: "seamless gutters"/"seamless eavestrough" (real gutter-guard/eavestrough product-category term) passes clean (v1.0.5)', () => {
  assert.deepEqual(findDeAiTells('<p>We install seamless gutters built to last.</p>'), []);
  assert.deepEqual(findDeAiTells('<p>Our seamless eavestrough sheds water fast.</p>'), []);
  assert.deepEqual(findDeAiTells('<p>Ask about seamless eavestroughs and gutter guards.</p>'), []);
  assert.deepEqual(findDeAiTells('<p>We install seamless troughs across the region.</p>'), []);
});

test('scannable drops CSS but keeps inline script string copy', () => {
  const s = scannable('<style>a{color:red}</style><script>const t="Delve here"</script>');
  assert.equal(/color:red/.test(s), false);
  assert.equal(/Delve here/.test(s), true);
});

test('findDeAiTells is not blinded by a protocol-relative URL (F1019, v1.0.11)', () => {
  const html = '<html><head><script src="//cdn.jsdelivr.net/a.js"></script></head><body>' +
    '<p>In today\'s fast-paced world.</p><p>It is important to note that we deliver.</p></body></html>';
  const withProtocolRelative = findDeAiTells(html);
  const withHttps = findDeAiTells(html.replace('//cdn.jsdelivr.net/a.js', 'https://cdn.jsdelivr.net/a.js'));
  assert.equal(withProtocolRelative.length, 2);
  assert.deepEqual(withProtocolRelative.map(h => h.name).sort(), withHttps.map(h => h.name).sort());
});

test('scannable still strips a real JS line comment inside a <script> body', () => {
  const s = scannable('<script>// a real comment\nconst t="Delve here"</script>');
  assert.equal(/a real comment/.test(s), false);
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
test('findStructuralWarnings flags spaced double-hyphen standing in for an em dash', () => {
  const warns = findStructuralWarnings('<p>The quote was fast -- reliable and honest.</p>');
  assert.ok(warns.some(w => /double-hyphen/.test(w)));
});
test('findStructuralWarnings flags unspaced double-hyphen standing in for an em dash', () => {
  const warns = findStructuralWarnings('<p>The crew fixed it--fast, before the storm.</p>');
  assert.ok(warns.some(w => /double-hyphen/.test(w)));
});
test('findStructuralWarnings does NOT flag a real hyphenated compound or code fence', () => {
  const warns = findStructuralWarnings('<p>The well-built deck used pressure-treated lumber.</p>');
  assert.ok(!warns.some(w => /double-hyphen/.test(w)));
});
test('findStructuralWarnings flags a mailto: anchor', () => {
  const warns = findStructuralWarnings('<p>Email us at <a href="mailto:info@example.com">info@example.com</a>.</p>');
  assert.ok(warns.some(w => /mailto/.test(w)));
});
test('findStructuralWarnings does NOT flag tel:/sms:/wa.me anchors', () => {
  const html = '<p><a href="tel:+15551234567">Call</a> <a href="sms:+15551234567">Text</a> '
    + '<a href="https://wa.me/15551234567">WhatsApp</a></p>';
  assert.ok(!findStructuralWarnings(html).some(w => /mailto/.test(w)));
});
test('entity-encoded char tells decode before scanning (v1.0.4)', () => {
  assert.ok(findDeAiTells('<p>fast &mdash; reliable</p>').some(h => /em dash/.test(h.name)));
  assert.ok(findDeAiTells('<p>fast &#8212; reliable</p>').some(h => /em dash/.test(h.name)));
  assert.ok(findDeAiTells('<p>fast &#x2014; reliable</p>').some(h => /em dash/.test(h.name)));
  assert.ok(findDeAiTells('<p>wait&hellip; more</p>').some(h => /ellipsis/.test(h.name)));
});

test('invisible-class refs are deliberate authoring, literals are the tell (v1.0.5)', () => {
  // explicit entities (named or numeric) are ubiquitous legitimate HTML - clean
  assert.deepEqual(findDeAiTells('<p>a&nbsp;b and c&#160;d and e&shy;f</p>'), []);
  // a LITERAL invisible char in the raw text still flags
  assert.ok(findDeAiTells('<p>a b</p>').some(h => /invisible unicode/.test(h.name)));
  assert.ok(findDeAiTells('<p>a​b</p>').some(h => /invisible unicode/.test(h.name)));
});

test('smart-quote apostrophes do not launder phrase tells (v1.0.4)', () => {
  assert.ok(findDeAiTells('<p>it’s important to note this.</p>').some(h => /important/.test(h.name)));
  assert.ok(findDeAiTells('<p>it&rsquo;s important to note this.</p>').some(h => /important/.test(h.name)));
  assert.ok(findDeAiTells('<p>whether you’re new or not</p>').some(h => /whether/.test(h.name)));
});

test('double-escaped text ABOUT entities stays clean (v1.0.4)', () => {
  assert.deepEqual(findDeAiTells('<p>write &amp;mdash; to emit a dash entity</p>'), []);
});

// v1.0.8: insecure form-action structural WARN
test('findStructuralWarnings flags a form with an inert action="#" and no JS fallback', () => {
  const html = '<form class="lead-form" action="#" novalidate><input name="email"></form>';
  assert.ok(findStructuralWarnings(html).some(w => /insecure form action/i.test(w)));
});
test('findStructuralWarnings passes a form with a real action="/api/lead" method="post"', () => {
  const html = '<form class="lead-form" action="/api/lead" method="post" novalidate><input name="email"></form>';
  assert.ok(!findStructuralWarnings(html).some(w => /insecure form action/i.test(w)));
});
test('findStructuralWarnings flags a form with no action and no method', () => {
  const html = '<form class="lead-form" novalidate><input name="email"></form>';
  assert.ok(findStructuralWarnings(html).some(w => /insecure form action/i.test(w)));
});
test('findStructuralWarnings flags a GET-only form even with an /api/ action', () => {
  const html = '<form class="lead-form" action="/api/lead" method="get" novalidate><input name="email"></form>';
  assert.ok(findStructuralWarnings(html).some(w => /insecure form action/i.test(w)));
});
test('findStructuralWarnings passes a no-action form whose submit is JS-secured to a real POST endpoint', () => {
  const html = '<form id="leadform" class="leadform" novalidate><input name="email"></form>'
    + '<script>(function(){var f=document.getElementById(\'leadform\');'
    + 'f.addEventListener(\'submit\',async function(e){e.preventDefault();'
    + "await fetch('/api/lead',{method:'POST',body:JSON.stringify({})});});})();</script>";
  assert.ok(!findStructuralWarnings(html).some(w => /insecure form action/i.test(w)));
});

// v1.0.10 (mycelium gate-research 2026-08-23T073533Z, Finding 1): the notXbutY
// density counter required a comma before "but", so the plain, comma-less
// antithesis ("not an expense but an investment") escaped it entirely. Fixed
// by making the comma optional. Two occurrences are used in each fixture
// below because the density cap is max(1, floor(words/400)) -- a single hit
// in a short fixture never exceeds a cap of 1.
test('findStructuralWarnings counts the comma-less "not X but Y" antithesis (v1.0.10)', () => {
  const html = '<p>A new roof is not an expense but an investment in your home. '
    + 'This is not a repair job but a full restoration of the envelope.</p>';
  assert.ok(findStructuralWarnings(html).some(w => /not-X-but-Y/.test(w)));
});
test('findStructuralWarnings counts the comma-less "not only ... but also" form (v1.0.10)', () => {
  const html = '<p>Not only does new siding protect your walls but also your foundation. '
    + 'Not only does it look sharp but also it lasts for decades.</p>';
  assert.ok(findStructuralWarnings(html).some(w => /not-X-but-Y/.test(w)));
});
test('findStructuralWarnings still counts the comma\'d "not X but Y" form (regression, v1.0.10)', () => {
  const html = '<p>A new roof is not an expense, but an investment in your home. '
    + 'Not only does new siding protect your walls, but also your foundation.</p>';
  assert.ok(findStructuralWarnings(html).some(w => /not-X-but-Y/.test(w)));
});
test('findDeAiTells still HARD-flags the intensified "not just X, but Y" reframe (unaffected control, v1.0.10)', () => {
  const hits = findDeAiTells('<p>This is not just a repair, but a full restoration.</p>');
  assert.ok(hits.some(h => /not just X/.test(h.name)));
});

// v1.0.10 (mycelium gate-research 2026-08-23T073533Z, Finding 2): "deep dive"
// and "maximise"/"maximize" are watchlist-tier (cluster-WARN only, never a
// hard fail) -- same tier as leverage/robust/seamless, because "maximize
// attic ventilation" is legitimate functional trades copy.
test('findDeAiTells does NOT hard-fail "deep dive" or "maximise"/"maximize" alone (v1.0.10)', () => {
  assert.deepEqual(findDeAiTells('<p>Take a deep dive into our process.</p>'), []);
  assert.deepEqual(findDeAiTells('<p>We maximise the value of every square foot.</p>'), []);
  assert.deepEqual(findDeAiTells('<p>Maximize attic ventilation before winter hits.</p>'), []);
});
test('findStructuralWarnings clusters "deep dive" with another watchlist word in one paragraph (v1.0.10)', () => {
  const html = '<p>Take a deep dive into our process and let it foster real trust.</p>';
  assert.ok(findStructuralWarnings(html).some(w => /watchlist cluster/.test(w) && /deep dive/.test(w)));
});
test('findStructuralWarnings clusters "maximise" with another watchlist word in one paragraph (v1.0.10)', () => {
  const html = '<p>We maximise value while we bolster your curb appeal.</p>';
  assert.ok(findStructuralWarnings(html).some(w => /watchlist cluster/.test(w) && /maximise/.test(w)));
});
