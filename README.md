# de-ai-gate

[![tests](https://github.com/BryanBenner/de-ai-gate/actions/workflows/test.yml/badge.svg)](https://github.com/BryanBenner/de-ai-gate/actions/workflows/test.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A read-only content-honesty gate for AI-assisted writing. Catches the typographic
and lexical tells of machine-generated prose **before it ships** - em-dashes, curly
quotes, invisible unicode, and high-precision AI phrase tells - with a hard pass/fail
exit code. Deterministic regex, no network, no credentials.

## Install & run (10 seconds)

```bash
git clone https://github.com/BryanBenner/de-ai-gate.git
cd de-ai-gate

# Scan served HTML/prose (JS engine - Node >=18 or Bun)
node cli.mjs --html ./path/to/site/public

# Scan authored data records (JS/JSON/TS spine) for smuggled curly quotes etc.
node cli.mjs --records ./path/to/data

# Python surface (HARD tells only, stdlib re - no deps)
python gate.py --html ./path/to/site --records ./path/to/data
```

Example output:

```
-- de-AI gate -- 12 html + 3 record files | 2 HARD violations
  articles/spring.html:  em dash (U+2014)
  data/trust.md:2  curly double quote (U+201C/U+201D)
de-AI gate FAILED (2 HARD violations).
```

**Exit code is the contract:** `0` = clean, `1` = one or more HARD violations
(wire it straight into a pre-commit hook or CI). Use `--warn-only` for a
non-blocking baseline pass. Run `--html` and `--records` as separate invocations.

## Why this one is safe to install

Many popular Agent Skills quietly auto-run on session start, hoard credentials, or
phone home. This one does the opposite, **by construction** - and proves it in code:

- **Read-only** - scans files, writes nothing, exits with a code.
- **No auto-run** - invoked explicitly; no SessionStart hook, no side effects.
- **No credentials** - zero stored keys, zero cookie/token access, no auth.
- **No network** - pure local regex over local files. Nothing leaves your machine.
- **Zero dependencies** - Node >=18 or Bun for the JS engine; stdlib `re` for the Python shim.

These aren't just claims - `test/test_publish_safety.py` asserts them against the
source (no network calls, no credential reads, no auto-run hooks), and the gate
even runs against its own catalog so its docs can't smuggle a tell.

## What to gate (and what to skip)

Scope rules learned by running this gate across a fleet of repos and sites:

**Gate every reader-facing prose surface:**

- README and docs, published pages, article copy
- SKILL.md and any agent-skill instruction text
- Release notes and the repo About/description text
- UI copy and anything else a reader sees under your name

**Skip, deliberately:**

- **Detector code and test fixtures** - engine, catalog, and test files contain
  the very glyphs and phrases they detect. That is the detector, not a tell;
  this repo's own self-gate skips them for exactly that reason.
- **Commit messages** - not a reader-facing prose surface, and fixing them after
  the fact means history rewrites. Gate the docs the commit ships instead.
- **Quoted third-party material** - a verbatim quotation keeps its source's
  punctuation. Attribute it; don't rewrite it.

Enforce the prose set in CI rather than memory: this repo gates its own README
and SKILL.md in `test/self-gate.test.js`, and the sibling gates' repos run the
same pass before every push.

## Tests

```bash
bun test                 # 22 JS tests (engine, CLI, catalog self-gate, publish-safety)
python -m pytest test/   # 8 Python parity + publish-safety tests
```

Single tell catalog (`catalog.json`) feeds both the JS and Python engines, so the
definitions never fork. Add a tell once, in the catalog.

## Live examples

The de-ai gate powers real published pages - each one passes its own gate:

- **[The de-AI gate](https://livingwebsites.ca/tools/de-ai-gate/)** - what it is and why it is safe to install
- **[In your CI](https://livingwebsites.ca/tools/de-ai-gate/ci-gate/)** - wiring the exit-code contract into a pre-ship gate
- **[vs. AI detectors](https://livingwebsites.ca/tools/de-ai-gate/vs-detectors/)** - why deterministic tells beat probabilistic detection (no false-positive paradox)
- **[Provably safe](https://livingwebsites.ca/tools/de-ai-gate/provably-safe/)** - read-only, no network, no credentials, asserted in code

MIT licensed. Author: Bryan Benner.
