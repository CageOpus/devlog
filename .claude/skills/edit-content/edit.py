#!/usr/bin/env python3
"""Edit Markdown under content/ while `hugo server` is running, without freezing its pages.

Rapid writes can leave hugo serving an old render for good (see SKILL.md). This tool applies the
edits one file at a time, and after each file moves it out of content/, waits, and moves it back,
which makes hugo re-scan the page structure. Then it fetches every touched page and checks it.

  edit.py apply EDITS.json        edits from a JSON list (see SKILL.md for the format)
  edit.py replace FILE OLD NEW    one exact replacement (OLD must occur exactly once)
  edit.py reparse FILE...         no edit, just the move-out/move-back (for edits made some other way)
  edit.py check FILE...           only fetch and check the pages

FILE is a path to a .md file under content/. Pages are fetched from $HUGO_URL (default http://localhost:1317).
Exit status 1 if an edit can't be applied or a page check fails.
"""
import json, os, re, shutil, sys, tempfile, time, urllib.error, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
CONTENT = os.path.join(ROOT, "content")
BASE = os.environ.get("HUGO_URL", "http://localhost:1317").rstrip("/")
PAUSE = 1.0  # between moves, and between files: let hugo finish one rebuild before the next event


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def resolve(f):
    p = os.path.abspath(f if os.path.isabs(f) else os.path.join(ROOT, f))
    if not p.startswith(CONTENT + os.sep) or not p.endswith(".md"):
        die(f"{f}: not a .md file under content/")
    return p


def rel(p):
    return os.path.relpath(p, ROOT)


def page_url(p):
    """content/posts/x/index.zh-tw.md → /zh-tw/posts/x/ ; content/posts/y.md → /posts/y/"""
    r = os.path.relpath(p, CONTENT)
    d, name = os.path.split(r)
    stem = name[:-3]
    lang = ""
    m = re.match(r"^(.*)\.(zh-tw)$", stem)
    if m:
        stem, lang = m.group(1), m.group(2)
    parts = d.split(os.sep) if d else []
    if stem not in ("index", "_index"):
        parts.append(stem)
    path = "/".join(parts).lower()
    return f"{BASE}/{lang + '/' if lang else ''}{path + '/' if path else ''}"


def reparse(p):
    """Move the file out of content/, wait, move it back, wait. Always puts it back."""
    tmp = tempfile.mkdtemp(prefix="edit-content-")
    held = os.path.join(tmp, os.path.basename(p))
    try:
        shutil.move(p, held)
        time.sleep(PAUSE)
    finally:
        if os.path.exists(held):
            shutil.move(held, p)
        os.rmdir(tmp)
    time.sleep(PAUSE)


def fetch(u):
    try:
        with urllib.request.urlopen(u, timeout=10) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return None, str(e)


def check(p, expect_gone=False):
    u = page_url(p)
    status, html = fetch(u)
    problems = []
    if status is None:
        problems.append(f"can't reach the server: {html}")
    elif expect_gone:
        if status != 404:
            problems.append(f"expected 404 after delete, got {status}")
    else:
        if status != 200:
            problems.append(f"HTTP {status}")
        else:
            if re.search(r"^}</p>", html, re.M):
                problems.append("stray '}' paragraph (stale render)")
            if re.search(r"<p>\s*<figure", html):
                problems.append("figure wrapped in <p> (stale render)")
            if "{{<" in html or "{{%" in html:
                problems.append("unrendered shortcode in the page")
    m = re.search(r"<title>([^<]*)", html or "")
    label = f"  {rel(p)} → {u}"
    if problems:
        print(f"{label}\n    FAIL: " + "; ".join(problems))
    else:
        print(f"{label}\n    ok" + (f" · {m.group(1).strip()}" if m else ""))
    return not problems


def load_edits(path):
    with open(path, encoding="utf-8") as fh:
        edits = json.load(fh)
    if isinstance(edits, dict):
        edits = [edits]
    return edits


def apply(edits):
    # Plan everything first: nothing is written unless every edit applies cleanly
    plan = {}  # path → (new text or None for delete, notes)
    order = []
    for e in edits:
        p = resolve(e["file"])
        if p not in plan:
            order.append(p)
            cur = open(p, encoding="utf-8").read() if os.path.exists(p) else None
            plan[p] = [cur, cur, []]
        entry = plan[p]
        if e.get("delete"):
            if entry[1] is None:
                die(f"{rel(p)}: delete, but the file doesn't exist")
            entry[1] = None
            entry[2].append("delete")
        elif "content" in e:
            entry[1] = e["content"]
            entry[2].append("write" if entry[0] is not None else "create")
        else:
            text = entry[1]
            if text is None:
                die(f"{rel(p)}: replace in a file that doesn't exist")
            old, new = e["old"], e["new"]
            want = e.get("count", 1)
            n = text.count(old)
            if n != want:
                die(f"{rel(p)}: expected {want} match(es) of {old[:60]!r}, found {n}")
            entry[1] = text.replace(old, new)
            entry[2].append(f"replace×{n}")

    ok = True
    for i, p in enumerate(order):
        before, after, notes = plan[p]
        if after == before:
            print(f"{rel(p)}: no change")
            continue
        if after is None:
            os.remove(p)
            time.sleep(PAUSE)
            # hugo serves from disk and leaves the old HTML behind; remove it
            out = os.path.join(ROOT, "public", page_url(p)[len(BASE) + 1:])
            if os.path.isdir(out):
                shutil.rmtree(out)
        else:
            os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(after)
            time.sleep(PAUSE)
            reparse(p)
        print(f"{rel(p)}: {', '.join(notes)}")
    time.sleep(PAUSE)
    print("pages:")
    for p in order:
        before, after, _ = plan[p]
        if after == before:
            continue
        ok &= check(p, expect_gone=after is None)
    return ok


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0
    cmd, args = argv[1], argv[2:]
    if cmd == "apply" and len(args) == 1:
        return 0 if apply(load_edits(args[0])) else 1
    if cmd == "replace" and len(args) == 3:
        return 0 if apply([{"file": args[0], "old": args[1], "new": args[2]}]) else 1
    if cmd == "reparse" and args:
        paths = [resolve(f) for f in args]
        for p in paths:
            reparse(p)
            print(f"{rel(p)}: reparsed")
        print("pages:")
        return 0 if all([check(p) for p in paths]) else 1
    if cmd == "check" and args:
        return 0 if all([check(resolve(f)) for f in args]) else 1
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
