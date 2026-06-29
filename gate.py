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

def find_de_ai_tells(html: str):
    text = _scannable(html)
    hits = []
    for name, rx in _CHAR + _PHRASE:
        m = rx.search(text)
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
