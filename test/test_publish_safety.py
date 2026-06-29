import pathlib
import re

SKILL = pathlib.Path(__file__).resolve().parent.parent
# CODE ONLY — the safety property is about what the gate's code does, not what its docs say.
CODE = [p for p in SKILL.rglob("*")
        if p.suffix in {".js", ".mjs", ".py"}
        and "fixtures" not in p.parts
        and "test" not in p.name]

def _strip_comments(text, suffix):
    """Remove prose (comments + docstrings) so the scan checks EXECUTABLE code only."""
    if suffix == ".py":
        text = re.sub(r'"""[\s\S]*?"""', " ", text)
        text = re.sub(r"'''[\s\S]*?'''", " ", text)
        text = re.sub(r"#[^\n]*", " ", text)
    else:  # .js / .mjs
        text = re.sub(r"/\*[\s\S]*?\*/", " ", text)
        text = re.sub(r"(^|[^:])//[^\n]*", r"\1", text)  # keep https://
    return text

def _scan(p):
    return _strip_comments(p.read_text(encoding="utf-8"), p.suffix)

def test_no_network_surface():
    bad = ("fetch(", "http://", "https://", "require('http", 'require("http', "urllib", "requests.", "socket.", "XMLHttpRequest")
    for p in CODE:
        txt = _scan(p)
        for b in bad:
            assert b not in txt, f"network surface '{b}' in {p.name}"

def test_no_credential_or_egress_surface():
    bad = ("process.env", "os.environ", "AUTH_TOKEN", "cookie", "credential", "child_process", "subprocess", "execSync", "spawn")
    for p in CODE:
        txt = _scan(p)
        for b in bad:
            assert b not in txt, f"unsafe surface '{b}' in {p.name}"

def test_no_writes_outside_stdout():
    bad = ("writeFileSync", "writeFile(", "appendFile", "mkdir", "rmSync", "unlink", "open(")
    for p in CODE:
        txt = _scan(p)
        for b in bad:
            assert b not in txt, f"write surface '{b}' in {p.name} (gate must be read-only)"
