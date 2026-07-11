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

def _scannable(html: str) -> str:
    s = re.sub(r"<style[\s\S]*?</style>", " ", html, flags=re.I)
    s = re.sub(r"<!--[\s\S]*?-->", " ", s)
    s = re.sub(r"/\*[\s\S]*?\*/", " ", s)
    s = re.sub(r"(^|[^:])//[^\n]*", r"\1", s)
    return s

# Mirror of engine.js NAMED_REFS/decodeCharRefs -- true codepoints, so
# entity-encoded typography (&mdash; / &#8212;) cannot slip past the char tells.
# Single pass, numeric first: double-escaped "&amp;mdash;" stays literal.
_NAMED_REFS = {
    "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'",
    "nbsp": " ", "thinsp": " ", "ensp": " ", "emsp": " ",
    "shy": "­", "zwnj": "‌", "zwj": "‍",
    "mdash": "—", "ndash": "–", "hellip": "…",
    "rsquo": "’", "lsquo": "‘", "ldquo": "“", "rdquo": "”",
    "copy": "©", "reg": "®",
}

def _decode_char_refs(s: str) -> str:
    s = re.sub(r"&#x([0-9a-f]+);", lambda m: chr(int(m.group(1), 16)), s, flags=re.I)
    s = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), s)
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

def _walk(path, exts):
    p = pathlib.Path(path)
    if not p.exists():
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
    html_files = []
    for p in html_paths:
        html_files.extend(_walk(p, {".html"}))
    record_files = []
    for p in record_paths:
        record_files.extend(_walk(p, {".js", ".mjs", ".json", ".ts"}))
    hard = 0
    for f in html_files:
        for h in find_de_ai_tells(pathlib.Path(f).read_text(encoding="utf-8")):
            print(f'x {f}: {h["name"]}: "{h["match"]}"'); hard += 1
    for f in record_files:
        for h in find_record_corruption(pathlib.Path(f).read_text(encoding="utf-8")):
            print(f'x {f}:{h["line"]} {h["name"]} | {h["sample"]}'); hard += 1
    print(f"-- de-AI gate (py) -- {hard} HARD violations")
    return 1 if (hard and not warn_only) else 0

if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
