---
name: edit-content
description: Use for every change to Markdown under content/ (posts, front matter, draft flags, shortcode lines) — create, edit or delete them through this skill's edit.py instead of Edit/Write/sed, so the running hugo preview server doesn't freeze pages.
---

# edit-content

Change files under `content/` **only** through `edit.py` in this folder. Not Edit, Write, `sed -i` or an
ad-hoc python script: those are exactly how pages got frozen.

## Why

The preview server (`.claude/launch.json` → `worktree-preview`, port 1317) rebuilds on every file event and
serves pages from disk (`public/`). When several writes land faster than a rebuild, hugo can keep serving an
old render for good: it logs `Source changed` but the page never updates, or a new page never appears
(2026-10-02: a stray `}` after every `{{< anim >}}` on the zh post; a restart didn't even clear it).

Moving the file out of `content/` and back makes hugo re-scan the page structure and unsticks it. Measured
on 2026-10-02 with two bilingual test posts, 4 rapid-edit patterns × 5 trials: 19/20 frozen without that
step, 0/20 with it after every file; one move also revived other frozen pages.

`edit.py` does it every time: one file at a time, write in place, wait 1 s, move out, wait, move back, wait,
then fetch each touched page and check it (HTTP 200, no stray `}` paragraph, no figure wrapped in `<p>`, no
unrendered `{{<`). It writes nothing unless every edit in the batch applies cleanly.

## Use

Write the edits as JSON into the scratchpad (CJK, quotes and newlines need no shell escaping there), then:

```bash
python3 .claude/skills/edit-content/edit.py apply <scratchpad>/edits.json
```

```json
[
  {"file": "content/posts/<slug>/index.md",       "old": "draft = true", "new": "draft = false"},
  {"file": "content/posts/<slug>/index.zh-tw.md", "old": "draft = true", "new": "draft = false"},
  {"file": "content/posts/new-post.md",           "content": "+++\ntitle = '...'\n+++\n..."},
  {"file": "content/posts/old-post.md",           "delete": true}
]
```

- `old`/`new`: exact text, must occur exactly once (or set `"count": n`).
- `content`: create or overwrite the whole file.
- `delete`: remove the file, and its old HTML under `public/`.
- Several entries for one file are applied together, and the file is written once.

Shorter forms:

```bash
python3 .claude/skills/edit-content/edit.py replace content/posts/x.md "old text" "new text"
python3 .claude/skills/edit-content/edit.py reparse content/posts/x.md ...   # file changed some other way (e.g. the user's editor)
python3 .claude/skills/edit-content/edit.py check   content/posts/x.md ...   # just check the pages
```

It takes about 3 s per file. Exit status 1 = an edit didn't apply (nothing written) or a page check failed.
If a page still fails after a `reparse`, look at the source or a template; if hugo is clearly confused,
restart the preview server (`preview_stop` + `preview_start`).

## Notes

- Moving a whole post folder (renaming a slug) is not covered: `git mv` it, then `reparse` its files, and
  remove the old folder under `public/` by hand.
- The user may be editing the same files in their editor. Re-read a file before building an edit from it,
  and only touch the lines you were asked to.
