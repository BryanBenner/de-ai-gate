# de-ai-gate

A read-only content-honesty gate for AI-assisted writing. Catches the typographic
and lexical tells of machine-generated prose before it ships.

## Why this one is safe to install

Many popular Agent Skills quietly auto-run on session start, hoard credentials, or
phone home. This one does the opposite, by construction:

- **Read-only** - scans files, writes nothing, exits with a code.
- **No auto-run** - invoked explicitly; no SessionStart hook, no side effects.
- **No credentials** - zero stored keys, zero cookie/token access, no auth.
- **No network** - pure local regex over local files. Nothing leaves your machine.
- **Zero dependencies** - Node >=18 or Bun for the JS engine; stdlib `re` for the Python shim.

MIT licensed. Author: Bryan Benner.
