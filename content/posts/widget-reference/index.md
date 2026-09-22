+++
# ── Widget reference: never shown on the live site ──
# draft = true: only visible with `hugo server -D`. To start a new post from here, copy the whole folder and change this line.
draft = true

date = '2026-09-22T10:00:00+08:00'
title = 'Widget Reference: Everything a Devlog Post Can Do'

# Lede: the large grey paragraph under the title; the home list also prefers it as the summary.
description = 'This post uses every kind of markup the devlog supports: headings, eyebrow, figures, code, quotes, notes, lists and tables.'

# Tags: read by the tag keys at the bottom of the post, the tag index in the sidebar, and the tag strip under the header on tablet and below.
tags = ['reference', 'devlog']

# Language: every post is bilingual. This index.md is the English version; the Chinese one is index.zh-tw.md
# in the same folder. The two files pair up automatically and the language key jumps between them.
# Single-file posts work the same way: post.md and post.zh-tw.md.
# Images are not language-tagged; both versions reference the same file by the same name.

# Eyebrow (the small line above the title) = section · MILESTONE {milestone} ── {eyebrow}
# Both are optional; without them it just shows POSTS.
milestone = 'M0'
eyebrow = '1980-07 W2'
+++

A plain paragraph is just written as is. **Bold**, [inline links](https://example.com) and `inline code`
are all standard Markdown.

## Level 2 heading: the main sections of a post

Sections of a post use `##`. `#` is one size larger than `##` and is rarely needed.

### Level 3 heading: a subsection

#### Level 4 heading

Going deeper than level 4 isn't recommended.

## Figures

An image on its own paragraph becomes a drawing card: the alt text is printed on the left of the header,
and a FIG number is assigned automatically on the right. The quoted title becomes the caption below.
Clicking the image opens the original. Put the image file in the same folder as the post.

![Section A-A](section-a-a.svg "Section A-A · the caption goes in the title")

Without a title there is no caption, only the header:

![Setback line](section-a-a.svg)

## Code

Code blocks are drawn as readout panels. The language goes after the backticks and is printed on the right of the header;
`file` is printed on the left, and `caption` becomes the caption below. Both are optional.

```rust {file="src/sim/agents.rs" caption="FIG 2 · the same logic for every agent, 1 000 000 of them"}
// Run the same logic for every agent, every frame
pub fn step(agents: &mut [Agent], dt: f32) {
    for a in agents.iter_mut() {
        a.vel = clamp(a.vel + a.acc * dt, 0.0, 13.9);
        a.pos += a.vel * dt;
    }
}
```

A very long line doesn't wrap; it scrolls sideways inside the panel. On phones the scroll area extends to the screen edge:

```wgsl {file="shaders/agents.wgsl"}
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id: vec3<u32>) { let i = id.x; if (i >= arrayLength(&agents)) { return; } agents[i].pos += agents[i].vel * params.dt; }
```

You can leave everything off; the header then only shows the language:

```toml
[params]
  build = "0.0.1"
```

## Quotes

Quotes starting with `>` are set in the voice typeface and stand for a human voice — residents, players or interviewees:

> "The arcade is our living room. The scooter rolls in, the chairs come out."
>
> — Mrs. Chen · Minsheng East Road

## Notes

GitHub-style `> [!TYPE]` becomes a note box with the type printed in the top-left corner.
NOTE, TIP, IMPORTANT, WARNING and CAUTION all work; they look the same apart from the type label.
**Always leave an empty `>` line under `[!TYPE]`**: this site merges CJK line breaks, and without the empty line
`[!NOTE]` sticks to the next line of Chinese text and the whole paragraph is swallowed as markup.
Keep the same habit in English so both versions stay parallel.

> [!NOTE]
>
> This is a side note. It can contain `code` and [links](https://example.com).

> [!WARNING]
>
> Performance figures were measured on a development machine and are not final specs.

## Lists

- Unordered lists use `-`
- Second item
  - Nested lists are indented two spaces

1. Ordered lists use numbers
2. Second step
3. Third step

## Tables

| Item   | Spec          | Notes          |
| ------ | ------------- | -------------- |
| Agents | 1 000 000     | All on the GPU |
| Map    | 10 × 10 km    |                |
| Engine | Rust + wgpu   | Bevy ECS       |

---

A horizontal rule is `---` with a blank line before and after. The one above is an example.
