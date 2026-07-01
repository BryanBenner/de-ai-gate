# Changelog

All notable changes to de-ai-gate are documented here.
Format follows Keep a Changelog; this project uses semantic versioning.

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
