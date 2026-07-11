# Changelog

All notable changes to de-ai-gate are documented here.
Format follows Keep a Changelog; this project uses semantic versioning.

## [1.0.5] - 2026-07-11
### Fixed
- Regression in 1.0.4 (field report: livingwebsites F598): decoding `&nbsp;`-class references to their true codepoints made the invisible-unicode tell false-positive on ordinary, legitimate pages (79 hits across ~40 clean pages in the reporting deployment). Invisible-class references (named `&nbsp;`/`&thinsp;`/`&shy;`/`&zwnj;`/... and their numeric forms) now decode to a plain space for tell-scanning: an explicit entity is a deliberate authoring choice, not the paste artifact the tell hunts. Reader-visible glyph references (dashes, ellipsis, smart quotes) keep true-codepoint decode. A LITERAL invisible character in raw text is untouched by decoding and still flags.
### Added
- Regression tests both ways in both suites: entity forms clean, literal U+00A0/U+200B still flagged.

## [1.0.4] - 2026-07-11
### Fixed
- HTML character references (named, decimal, hex) are now decoded to their true codepoints before the HARD tell scan, in both engines. Previously `&mdash;` / `&#8212;` / `&hellip;` / `&nbsp;`-class entities rendered as tell typography in the browser but never matched the character regexes, so entity-emitting build pipelines passed the gate while shipping the tells. Found live: 72 em-dash tells across 6 gated-PASS pages on one production site, ~90 on another.
- Phrase tells are matched against a smart-quote-normalized copy of the text: curly apostrophes (`it’s important to note`, literal or via `&rsquo;`) no longer launder apostrophe-bearing phrase tells written with ASCII quotes in the catalog.
- Double-escaped text about entities (`&amp;mdash;`) stays literal and clean (single-pass decode, numeric before named).
### Added
- Regression tests for every bypass form in both suites, plus a JS/Python entity-parity test.

## [1.0.2] - 2026-07-01
### Added
- New HARD phrase tell: "in today's <adj> world" (digital / modern / ever-changing / ...), sibling of the existing fast-paced tell.
- Regression test coverage for the new tell.
- Repository metadata (repository / homepage / bugs) and a `test` script in package.json.
### Changed
- SKILL.md description now leads with the literal trigger phrases users type (the fuzzy-match key).
- README restructured: install / run + usage / exit-code above the safety pitch; the security proof (test/test_publish_safety.py) surfaced to humans.
### Held (documented, not applied)
- Kept context-ambiguous phrases out of the HARD list to avoid false positives: "a sense of / an air of / the notion of", "here's the thing / kicker", bare "worth noting".
- Held the elevate / seamless HARD -> watchlist demotion pending a second real-consumer signal.

## [1.0.1] - 2026-07-01
### Fixed
- Pulled bare "unlock" from the HARD phrase tells. It has a strong functional sense ("unlock this step / account / feature") and over-fired on progressive-disclosure UI microcopy. It stays in the watchlist for cluster-warnings; "elevate" / "seamless" remain HARD.

## [1.0.0] - 2026-06-29
### Added
- Initial release: a deterministic, read-only de-AI content-honesty gate.
- charTells + recordCorruption + phraseTells + watchlist + structural warnings.
- Single `catalog.json` feeding both `engine.js` (JS) and `gate.py` (Python), parity-tested.
- `cli.mjs` with an exit-code contract (1 on any HARD violation), `--warn-only`, and `--html` / `--records` modes.
- MIT license, zero dependencies, no network, no credentials, no auto-run. Publish-safety tests assert it in code.
