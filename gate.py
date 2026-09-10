#!/usr/bin/env python3
"""Canonical de-AI gate - Python shim. Reads the SAME catalog.json as engine.js so
the tell definitions are single-source and never fork. HARD tells only (char/record/phrase);
structural WARN heuristics are JS-engine-only. Read-only: no writes, no network, no credentials."""
import json, re, sys, pathlib

_CATALOG = json.loads((pathlib.Path(__file__).resolve().parent / "catalog.json").read_text(encoding="utf-8"))

def _compile(group):
    out = []
    for t in _CATALOG[group]:
        flags = re.I if "i" in t["flags"] else 0
        out.append((t["name"], re.compile(t["source"], flags)))
    return out

_CHAR = _compile("charTells")
_PHRASE = _compile("phraseTells")
_RECORD = _compile("recordCorruption")

# JS comment-stripping scoped to <script> BODIES ONLY (F1019 fix, 2026-09-10) --
# mirrors engine.js: a document-wide "//" strip deleted from any protocol-relative
# URL to end-of-line, blanking whole minified pages and returning a silent [].
def _strip_script_comments(m: "re.Match") -> str:
    attrs, body = m.group(1), m.group(2)
    body = re.sub(r"/\*[\s\S]*?\*/", " ", body)
    body = re.sub(r"(^|[^:])//[^\n]*", r"\1", body)
    return f"<script{attrs}>{body}</script>"

def _scannable(html: str) -> str:
    s = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    s = re.sub(r"<!--[\s\S]*?-->", " ", s)
    s = re.sub(r"<script\b([^>]*)>([\s\S]*?)</script>", _strip_script_comments, s, flags=re.I)
    return s

# Mirror of engine.js NAMED_REFS/decodeCharRefs (v1.0.5 semantics): visible glyph
# refs decode to true codepoints; INVISIBLE-class refs (named + numeric) decode to
# a plain space -- explicit entities are deliberate authoring, not the paste
# artifact the invisible-unicode tell hunts. Literal invisible chars still flag.
# Single pass, numeric first: double-escaped "&amp;mdash;" stays literal.
_INVISIBLE_CODEPOINTS = {0x00A0, 0x2009, 0x2002, 0x2003, 0x00AD, 0x200B, 0x200C, 0x200D, 0x202F, 0x200A, 0xFEFF}
_NAMED_REFS = {
    "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'",
    "nbsp": " ", "thinsp": " ", "ensp": " ", "emsp": " ",
    "shy": " ", "zwnj": " ", "zwj": " ",
    "mdash": "—", "ndash": "–", "hellip": "…",
    "rsquo": "’", "lsquo": "‘", "ldquo": "“", "rdquo": "”",
    "copy": "©", "reg": "®",
}

def _from_code(cp: int) -> str:
    return " " if cp in _INVISIBLE_CODEPOINTS else chr(cp)

def _decode_char_refs(s: str) -> str:
    s = re.sub(r"&#x([0-9a-f]+);", lambda m: _from_code(int(m.group(1), 16)), s, flags=re.I)
    s = re.sub(r"&#(\d+);", lambda m: _from_code(int(m.group(1))), s)
    return re.sub(r"&([a-z]+);", lambda m: _NAMED_REFS.get(m.group(1).lower(), m.group(0)), s, flags=re.I)

def find_de_ai_tells(html: str):
    text = _decode_char_refs(_scannable(html))
    # Smart-quote-normalized copy for phrase tells (catalog writes ASCII quotes).
    phrase_text = text.translate(str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"'}))
    hits = []
    for name, rx in _CHAR:
        m = rx.search(text)
        if m:
            hits.append({"name": name, "match": m.group(0)})
    for name, rx in _PHRASE:
        m = rx.search(phrase_text)
        if m:
            hits.append({"name": name, "match": m.group(0)})
    return hits

def find_record_corruption(source: str):
    hits = []
    for i, line in enumerate(re.split(r"\r?\n", source), start=1):
        for name, rx in _RECORD:
            if rx.search(line):
                hits.append({"name": name, "line": i, "sample": line.strip()[:90]})
    return hits

def _walk(path, exts, missing: list):
    p = pathlib.Path(path)
    if not p.exists():
        missing.append(str(p))
        return []
    if p.is_file():
        return [str(p)] if p.suffix in exts else []
    return [str(f) for f in p.rglob("*") if f.is_file() and f.suffix in exts]

def _main(argv):
    warn_only = "--warn-only" in argv
    html_paths, record_paths, mode = [], [], None
    for a in argv:
        if a == "--html": mode = "html"
        elif a == "--records": mode = "records"
        elif a.startswith("--"): mode = None
        elif mode == "html" or mode is None: html_paths.append(a)
        elif mode == "records": record_paths.append(a)
    missing = []
    html_files = []
    for p in html_paths:
        html_files.extend(_walk(p, {".html"}, missing))
    record_files = []
    for p in record_paths:
        record_files.extend(_walk(p, {".js", ".mjs", ".json", ".ts"}, missing))
    hard = 0
    for f in html_files:
        for h in find_de_ai_tells(pathlib.Path(f).read_text(encoding="utf-8")):
            print(f'x {f}: {h["name"]}: "{h["match"]}"'); hard += 1
    for f in record_files:
        for h in find_record_corruption(pathlib.Path(f).read_text(encoding="utf-8")):
            print(f'x {f}:{h["line"]} {h["name"]} | {h["sample"]}'); hard += 1
    for m in missing:
        print(f"! path does not exist: {m}")
    print(f"-- de-AI gate (py) -- {len(html_files)} html + {len(record_files)} record files | {hard} HARD violations")
    if missing and not html_files and not record_files:
        return 2
    return 1 if (hard and not warn_only) else 0

if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
