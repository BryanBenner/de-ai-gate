---
name: de-ai-gate
description: Use when about to publish or commit prose/HTML content or authored data records - scans for de-AI typographic tells (em-dash, curly quotes, ellipsis, invisible unicode) and high-precision AI phrase tells, plus record-source corruption, with a hard pass/fail exit code. Read-only, no network, no credentials.
---

# de-AI Gate

A deterministic, read-only content-honesty gate. Two HARD scan modes:

- **Served-HTML scan** (`--html`): char tells (em/en-dash, ellipsis, invisible unicode) + 12 high-precision AI phrase tells, after stripping CSS/comments.
- **Record-source scan** (`--records`): typographic-substitution corruption (curly quotes/apostrophe, no-break space, ellipsis char) on authored JS/JSON/TS spine - the check that catches AI-smuggled curly quotes a served-HTML gate misses.

Structural heuristics (sentence-length sigma, tricolon, transition scaffolding, watchlist clusters) report as advisory WARN and never change the exit code.

## Invoke

```bash
# from the skill directory (or point node/python at its absolute path)
# served content
node cli.mjs --html ../my-site/public/articles ../my-site/public/guides
# authored records
node cli.mjs --records ../my-site/data/
# Git-Bash / Python surface (HARD tells only)
python gate.py --html ../my-site/public/ --records ../my-site/data/
```

Exit `1` on any HARD violation (use `--warn-only` for non-blocking baseline mode). Run --html and --records as separate invocations (or separate flags); mixing record and html targets in one call is not supported.

## One catalog, two runtimes

All tells live in `catalog.json` (sourced from the content-voice granelle). `engine.js` (JS) and `gate.py` (Python) both read it, so the tell definitions are single-source and never fork. Add a new tell once, in the catalog. Note: JS and Python regex word-boundary handling differs on text where a non-ASCII letter is directly adjacent to a tell word (no separator) - a near-zero case in real prose; both engines otherwise agree.

## Safety

Read-only file scan. No SessionStart/auto-run hook, no credentials or cookies, no network or egress, zero dependencies. See `README.md`.
