#!/usr/bin/env python3
"""
建立一篇新的 devlog 文章。每篇都是雙語，放在同一個資料夾（page bundle）：

    content/posts/<日期>-<slug>/index.md         英文
    content/posts/<日期>-<slug>/index.zh-tw.md   中文

圖檔直接丟進同一個資料夾，不標語言，兩個版本用同樣的檔名引用。
--only en / --only zh-tw 可以只建一個語言（沒有翻譯時，語言切換鍵會停用）。
front matter 的欄位說明見 content/posts/widget-reference/index.md。

用法：
    python3 create_post.py -i                          互動模式，一題一題問
    python3 create_post.py "Story Starts Here" --zh "一切的起點" -m M0 -e "DEVLOG #0" -t devlog,gpu
    python3 create_post.py                             什麼都不給就印出說明
"""

import argparse
import json
import re
import sys
import tomllib
from datetime import datetime
from pathlib import Path

POSTS_DIR = Path(__file__).resolve().parent / "content" / "posts"
EYEBROW_NUMBER_RE = re.compile(r"^(.*#)(\d+)$")


# ── front matter ──

def toml_str(value):
    """TOML 字串：能用單引號（不跳脫）就用，否則用 JSON 的跳脫規則，兩者對 TOML 都合法。"""
    if "'" not in value and "\n" not in value:
        return f"'{value}'"
    return json.dumps(value, ensure_ascii=False)


def front_matter(post, lang):
    """組出一個語言版本的 front matter。lang 是 "en" 或 "zh"。"""
    title = post["title"] if lang == "en" else post["title_zh"]
    description = post["description"] if lang == "en" else post["description_zh"]

    lines = [
        "+++",
        f"date = '{post['date']}'",
        f"draft = {'true' if post['draft'] else 'false'}",
        f"title = {toml_str(title)}",
    ]
    if description:
        lines.append(f"description = {toml_str(description)}")
    if post["milestone"]:
        lines.append(f"milestone = {toml_str(post['milestone'])}")
    if post["eyebrow"]:
        lines.append(f"eyebrow = {toml_str(post['eyebrow'])}")
    if post["tags"]:
        tags = ", ".join(toml_str(tag) for tag in post["tags"])
        lines.append(f"tags = [{tags}]")
    lines.append("+++")
    return "\n".join(lines) + "\n\n"


# ── 從現有文章推預設值（互動模式用）──

def read_front_matter(path):
    text = path.read_text(encoding="utf-8")
    parts = text.split("+++", 2)
    if len(parts) < 3:
        return {}
    try:
        return tomllib.loads(parts[1])
    except tomllib.TOMLDecodeError:
        return {}


def latest_defaults():
    """最新一篇英文文章的 milestone，以及眉標編號 +1（例如 DEVLOG #0 → DEVLOG #1）。"""
    english_files = [
        path for path in POSTS_DIR.rglob("*.md")
        if not path.name.endswith(".zh-tw.md")
    ]
    posts = [read_front_matter(path) for path in english_files]
    posts = [post for post in posts if not post.get("draft")]
    if not posts:
        return "", ""
    latest = max(posts, key=lambda post: str(post.get("date", "")))

    next_eyebrow = ""
    numbers = []
    for post in posts:
        match = EYEBROW_NUMBER_RE.match(str(post.get("eyebrow", "")))
        if match:
            numbers.append((int(match.group(2)), match.group(1)))
    if numbers:
        number, prefix = max(numbers)
        next_eyebrow = f"{prefix}{number + 1}"

    return str(latest.get("milestone", "")), next_eyebrow


# ── 共用 ──

def slugify(text):
    """轉成網址用的 kebab-case：小寫、撇號直接拿掉（don't → dont）、其他非英數字換成 -。
    英文標題產生預設值、使用者自己輸入的 slug，都經過這裡。"""
    text = re.sub(r"['’]", "", text.lower())
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def split_tags(text):
    return [tag.strip() for tag in text.split(",") if tag.strip()]


def now_with_offset():
    return datetime.now().astimezone().replace(microsecond=0)


def parse_date(text):
    """接受 YYYY-MM-DD（時間用現在）或完整的 ISO 8601；沒寫時區就用本機時區。"""
    now = now_with_offset()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        day = datetime.strptime(text, "%Y-%m-%d")
        return now.replace(year=day.year, month=day.month, day=day.day)
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=now.tzinfo)
    return parsed


def create(post, dry_run=False, only=None):
    """only 是 None（雙語）、"en" 或 "zh-tw"。"""
    folder = POSTS_DIR / f"{post['date'][:10]}-{post['slug']}"
    files = {}
    if only in (None, "en"):
        files[folder / "index.md"] = front_matter(post, "en")
    if only in (None, "zh-tw"):
        files[folder / "index.zh-tw.md"] = front_matter(post, "zh")

    if dry_run:
        for path, content in files.items():
            print(f"── {path.relative_to(POSTS_DIR.parent.parent)}")
            print(content)
        return

    if folder.exists():
        sys.exit(f"錯誤：{folder.relative_to(POSTS_DIR.parent.parent)} 已經存在，不覆蓋。")
    folder.mkdir(parents=True)
    for path, content in files.items():
        path.write_text(content, encoding="utf-8")
        print(f"已建立 {path.relative_to(POSTS_DIR.parent.parent)}")
    if post["draft"]:
        print("這篇是草稿（draft = true），用 hugo server -D 才看得到。")
    if only == "zh-tw":
        print("提醒：只有中文版時，沒標語言的圖檔不會輸出；圖要命名成 *.zh-tw.*，或補上英文版。")


# ── 互動模式 ──

def ask(label, default="", required=False):
    hint = f" [{default}]" if default else ""
    while True:
        answer = input(f"{label}{hint}: ").strip() or default
        if answer or not required:
            return answer
        print("  這一項必填。")


def ask_yes_no(label, default):
    hint = "Y/n" if default else "y/N"
    answer = input(f"{label} [{hint}]: ").strip().lower()
    if not answer:
        return default
    return answer.startswith("y")


def interactive():
    default_milestone, default_eyebrow = latest_defaults()
    print("建立新文章。方括號裡是預設值，直接按 Enter 就用它；Ctrl-C 取消。\n")

    title = ask("英文標題", required=True)
    title_zh = ask("中文標題", required=True)
    slug = slugify(ask("網址 slug", slugify(title), required=True))
    while not slug:
        print("  slug 只能用英文字母與數字（其他字元會被拿掉），請重打。")
        slug = slugify(ask("網址 slug", required=True))
    milestone = ask("里程碑 milestone", default_milestone)
    eyebrow = ask("眉標 eyebrow", default_eyebrow)
    tags = split_tags(ask("標籤（逗號分隔）"))
    description = ask("英文導言 description（可留空）")
    description_zh = ask("中文導言 description（可留空）")
    date = parse_date(ask("日期", now_with_offset().strftime("%Y-%m-%d")))
    draft = ask_yes_no("先存成草稿？", True)

    post = {
        "title": title, "title_zh": title_zh, "slug": slug,
        "milestone": milestone, "eyebrow": eyebrow, "tags": tags,
        "description": description, "description_zh": description_zh,
        "date": date.isoformat(), "draft": draft,
    }
    print()
    create(post, dry_run=True)
    if ask_yes_no("建立這兩個檔？", True):
        create(post)


# ── 參數模式 ──

def build_parser():
    parser = argparse.ArgumentParser(
        prog="create_post.py",
        usage="%(prog)s -i              ← 互動模式，一題一題問\n"
              "       %(prog)s TITLE [選項]      ← 一行建好",
        description="建立一篇雙語 devlog 文章：content/posts/<日期>-<slug>/index.md 與 index.zh-tw.md。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="例：\n"
               "  %(prog)s \"Story Starts Here\" --zh \"一切的起點\" -m M0 -e \"DEVLOG #0\" -t devlog,gpu\n"
               "  %(prog)s \"Agents on the GPU\" --zh \"把 agent 搬上 GPU\" --dry-run",
    )
    parser.add_argument("-i", "--interactive", action="store_true", help="互動模式，一題一題問")
    parser.add_argument("title", nargs="?", help="英文標題")
    parser.add_argument("--zh", dest="title_zh", metavar="TITLE", help="中文標題（沒給就先用英文標題）")
    parser.add_argument("--slug", help="網址 slug（預設由英文標題產生）")
    parser.add_argument("-m", "--milestone", default="", help="里程碑，例如 M0")
    parser.add_argument("-e", "--eyebrow", default="", help="眉標，例如 \"DEVLOG #1\"")
    parser.add_argument("-t", "--tags", default="", help="標籤，逗號分隔，例如 devlog,gpu")
    parser.add_argument("-d", "--description", default="", help="英文導言")
    parser.add_argument("--description-zh", default="", metavar="TEXT", help="中文導言")
    parser.add_argument("--date", help="日期 YYYY-MM-DD 或完整 ISO 8601（預設現在）")
    parser.add_argument("--only", choices=["en", "zh-tw"], help="只建一個語言（預設中英兩個都建）")
    parser.add_argument("--publish", action="store_true", help="直接發布（draft = false）；預設存成草稿")
    parser.add_argument("--dry-run", action="store_true", help="只印出內容，不建立檔案")
    return parser


def main():
    parser = build_parser()
    if len(sys.argv) == 1:
        parser.print_help()
        return

    args = parser.parse_args()
    if args.interactive:
        try:
            interactive()
        except (KeyboardInterrupt, EOFError):
            print("\n已取消。")
        return

    if not args.title:
        parser.error("需要英文標題，或用 -i 進入互動模式")

    slug = slugify(args.slug or args.title)
    if not slug:
        parser.error("英文標題產生不出 slug，請用 --slug 指定")
    if not args.title_zh and args.only != "en":
        print("提醒：沒給 --zh，中文標題先用英文標題，記得回來改。")

    post = {
        "title": args.title,
        "title_zh": args.title_zh or args.title,
        "slug": slug,
        "milestone": args.milestone,
        "eyebrow": args.eyebrow,
        "tags": split_tags(args.tags),
        "description": args.description,
        "description_zh": args.description_zh,
        "date": (parse_date(args.date) if args.date else now_with_offset()).isoformat(),
        "draft": not args.publish,
    }
    create(post, dry_run=args.dry_run, only=args.only)


if __name__ == "__main__":
    main()
