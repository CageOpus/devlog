#!/usr/bin/env python3
"""
Markdown formatter with CJK-aware line wrapping.
- CJK characters count as width 2, ASCII as width 1
- CJK text breaks at character boundaries
- English text breaks at word boundaries (spaces only)
- HTML tags are atomic (never broken)
- Target width: 80 columns

Usage:
    python3 mdwrap.py < input.md > output.md
"""

import sys
import re
import unicodedata

MAX_WIDTH = 80


def char_width(ch):
    eaw = unicodedata.east_asian_width(ch)
    return 2 if eaw in ('W', 'F') else 1


def str_width(s):
    return sum(char_width(ch) for ch in s)


def is_cjk(ch):
    return unicodedata.east_asian_width(ch) in ('W', 'F')


HTML_TAG_RE = re.compile(r'<[^<>]+>')


def tokenize(text):
    """
    Split text into tokens:
      - HTML tag  e.g. <abbr title="foo"> or </abbr>
      - space     ' '
      - CJK char  single wide character
      - word      run of non-space, non-CJK, non-tag ASCII chars
    Joining all tokens reproduces the original text exactly.
    """
    tokens = []
    i = 0
    while i < len(text):
        m = HTML_TAG_RE.match(text, i)
        if m:
            tokens.append(('tag', m.group()))
            i = m.end()
        elif text[i] == ' ':
            tokens.append(('space', ' '))
            i += 1
        elif is_cjk(text[i]):
            tokens.append(('cjk', text[i]))
            i += 1
        else:
            j = i
            while j < len(text) and text[j] != ' ' and not is_cjk(text[j]) and text[j] != '<':
                j += 1
            tokens.append(('word', text[i:j]))
            i = j
    return tokens


def wrap_paragraph(text, max_width=MAX_WIDTH):
    """
    Wrap a paragraph respecting:
    - HTML tags: atomic, never split
    - English words: atomic, only break at surrounding spaces
    - CJK characters: can break after any CJK char
    - Spaces: consumed at line breaks (not emitted at line start/end)
    """
    tokens = tokenize(text)
    lines = []
    current = ''
    current_width = 0

    def flush():
        nonlocal current, current_width
        lines.append(current.rstrip(' '))
        current = ''
        current_width = 0

    i = 0
    while i < len(tokens):
        kind, tok = tokens[i]

        if kind == 'space':
            # Look ahead: does the next token fit on this line?
            j = i + 1
            while j < len(tokens) and tokens[j][0] == 'space':
                j += 1
            if j < len(tokens):
                next_w = str_width(tokens[j][1])
                if current and current_width + 1 + next_w > max_width:
                    flush()
                    i = j   # skip space(s), jump to next real token
                    continue
                elif current:
                    current += ' '
                    current_width += 1
            i += 1
            continue

        tok_w = str_width(tok)

        if not current:
            current = tok
            current_width = tok_w
        elif current_width + tok_w <= max_width:
            current += tok
            current_width += tok_w
        else:
            flush()
            current = tok
            current_width = tok_w

        i += 1

    if current.strip():
        lines.append(current.rstrip(' '))

    return '\n'.join(lines)


def process(lines):
    output = []
    in_code_block = False
    paragraph_lines = []

    def flush_paragraph():
        if paragraph_lines:
            text = ' '.join(paragraph_lines)
            output.append(wrap_paragraph(text))
            paragraph_lines.clear()

    i = 0
    while i < len(lines):
        line = lines[i].rstrip('\n')

        # --- Front matter (first line only) ---
        if i == 0 and line.strip() in ('+++', '---'):
            delimiter = line.strip()
            output.append(line)
            i += 1
            while i < len(lines):
                l = lines[i].rstrip('\n')
                output.append(l)
                i += 1
                if l.strip() == delimiter:
                    break
            continue

        # --- Code block ---
        if line.startswith('```'):
            flush_paragraph()
            in_code_block = not in_code_block
            output.append(line)
            i += 1
            continue

        if in_code_block:
            output.append(line)
            i += 1
            continue

        # --- Empty line ---
        if line.strip() == '':
            flush_paragraph()
            output.append('')
            i += 1
            continue

        # --- Heading ---
        if line.startswith('#'):
            flush_paragraph()
            output.append(line)
            i += 1
            continue

        # --- List item ---
        stripped = line.lstrip()
        if stripped.startswith(('- ', '* ', '+ ')) or (
            len(stripped) > 2 and stripped[0].isdigit() and stripped[1] in '.)'
        ):
            flush_paragraph()
            output.append(line)
            i += 1
            continue

        # --- Blockquote ---
        if line.startswith('>'):
            flush_paragraph()
            output.append(line)
            i += 1
            continue

        # --- HTML-only line (e.g. <abbr ...> standing alone) ---
        # Don't treat as block-level; fold into paragraph instead
        paragraph_lines.append(line.strip())
        i += 1

    flush_paragraph()
    return output


def main():
    lines = sys.stdin.readlines()
    result = process(lines)
    sys.stdout.write('\n'.join(result) + '\n')


if __name__ == '__main__':
    main()
