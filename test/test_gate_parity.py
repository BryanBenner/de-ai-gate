import json, pathlib, subprocess, sys
HERE = pathlib.Path(__file__).resolve().parent
SKILL = HERE.parent
sys.path.insert(0, str(SKILL))
import gate  # noqa: E402


def _js_tell_names(sample):
    # Return sorted list of tell names the JS engine finds in sample.
    js = subprocess.run(
        ["bun", "-e",
         f"import('{(SKILL / 'engine.js').as_posix()}').then(m=>"
         f"console.log(JSON.stringify(m.findDeAiTells({json.dumps(sample)}).map(h=>h.name).sort())))"],
        capture_output=True, text=True, check=True)
    return sorted(json.loads(js.stdout))


def test_record_corruption_catches_curly_quote():
    # Curly double quotes (U+201C/U+201D) are the chars the gate should detect.
    src = "a = \"ok\"\nb = “nope”"
    hits = gate.find_record_corruption(src)
    assert len(hits) == 1 and hits[0]["line"] == 2

def test_record_corruption_ignores_accents_and_emdash():
    assert gate.find_record_corruption("x = \"Jose cafe\"\ny = \"a — b\"") == []

def test_phrase_tell_parity_with_js_engine():
    # The JS engine and the Python shim must agree on HARD hits for the same input.
    sample = "<p>Let us delve into a seamless tapestry</p>"
    js_names = _js_tell_names(sample)
    assert js_names, "parity sample produced zero JS hits -- test would be vacuous"
    py_names = sorted(h["name"] for h in gate.find_de_ai_tells(sample))
    assert js_names == py_names

def test_rich_ascii_multitell_parity():
    # Richer corpus: multiple distinct tells, mixed spacing and punctuation,
    # all pure ASCII word boundaries. Both engines must agree on all hits.
    # Tells present: delve, tapestry/realm, seamless, in conclusion, let's dive in,
    # in the realm of, it is important to note, stands as a testament to.
    sample = (
        "<p>In conclusion, let's dive in and delve into the tapestry of challenges. "
        "Whether you're ready or not, a seamless solution awaits in the realm of ideas. "
        "It is important to note that this stands as a testament to our vision.</p>"
    )
    js_names = _js_tell_names(sample)
    assert len(js_names) >= 3, "rich corpus should hit 3+ tells; got: " + str(js_names)
    py_names = sorted(h["name"] for h in gate.find_de_ai_tells(sample))
    assert js_names == py_names, (
        "JS/Python mismatch on all-ASCII multi-tell corpus\n"
        "  JS: " + str(js_names) + "\n  PY: " + str(py_names)
    )

def test_protocol_relative_url_no_longer_blinds_the_scan(): # F1019, v1.0.11
    # A protocol-relative URL used to be indistinguishable from a JS line
    # comment to the document-wide "//" stripper, deleting the rest of the
    # line -- on minified single-line HTML this blanked the whole document.
    # Both engines must find both tells with the src present.
    sample = (
        '<html><head><script src="//cdn.jsdelivr.net/a.js"></script></head><body>'
        "<p>In today's fast-paced world.</p><p>It is important to note that we deliver.</p>"
        "</body></html>"
    )
    js_names = _js_tell_names(sample)
    py_names = sorted(h["name"] for h in gate.find_de_ai_tells(sample))
    assert len(js_names) == 2, "parity sample should hit 2 tells; got: " + str(js_names)
    assert js_names == py_names

def test_known_nonascii_boundary_divergence_is_documented():
    # KNOWN LIMITATION: JS \b is ASCII-only; Python \b is Unicode-aware.
    # When a non-ASCII letter (e.g. U+00E9 e-acute) is directly adjacent
    # to a tell word with no whitespace separator, the engines diverge:
    #   - JS sees a word boundary between non-ASCII and ASCII tell word -> matches
    #   - Python treats the accented letter as a word char -> no boundary -> no match
    # Real-world incidence is near-zero (English cliche words appear space-delimited).
    # This test guards the known behavior so the divergence is visible, not latent.
    #
    # Sample: U+00E9 (e with acute accent) glued directly to "delve" with no space.
    sample = "<p>édelve into things</p>"

    js_names = _js_tell_names(sample)
    py_names = sorted(h["name"] for h in gate.find_de_ai_tells(sample))

    # JS finds "delve" (ASCII \b fires between non-ASCII and ASCII chars)
    assert "delve" in js_names, (
        "Expected JS to find delve in non-ASCII-adjacent sample; got: " + str(js_names)
    )
    # Python does NOT find "delve" (Unicode \b sees no boundary between word chars)
    assert "delve" not in py_names, (
        "Expected Python to NOT find delve in non-ASCII-adjacent sample; got: " + str(py_names)
    )


def test_entity_and_smartquote_bypass_closed_v104():
    # Entity-encoded typography and curly apostrophes must hit the same tells
    # as their literal/ASCII forms (the 2026-07-11 blind spot).
    assert any("em dash" in h["name"] for h in gate.find_de_ai_tells("<p>a &mdash; b</p>"))
    assert any("em dash" in h["name"] for h in gate.find_de_ai_tells("<p>a &#8212; b</p>"))
    assert any("important" in h["name"] for h in gate.find_de_ai_tells("<p>it’s important to note.</p>"))
    assert gate.find_de_ai_tells("<p>write &amp;mdash; to emit a dash entity</p>") == []


def test_entity_parity_with_js_engine_v104():
    sample = "<p>it&rsquo;s important to note this &mdash; truly&hellip;</p>"
    js_names = _js_tell_names(sample)
    assert js_names, "entity parity sample produced zero JS hits -- vacuous"
    py_names = sorted(h["name"] for h in gate.find_de_ai_tells(sample))
    assert js_names == py_names


def test_nbsp_entity_clean_literal_flags_v105():
    # v1.0.4 regression (livingwebsites F598): decoded &nbsp; false-positived the
    # invisible-unicode tell on legitimate pages. Entities are deliberate; literals flag.
    assert gate.find_de_ai_tells("<p>a&nbsp;b and c&#160;d</p>") == []
    assert any("invisible" in h["name"] for h in gate.find_de_ai_tells("<p>a b</p>"))
