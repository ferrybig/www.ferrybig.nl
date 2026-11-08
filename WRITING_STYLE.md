# Writing style & Markdown reference

Notes on how posts in `content/` are written and the Markdown/MDX features the
`md-compiler` pipeline (`md-compiler/parser/compileMdx.ts`) supports. Kept here
so future posts (by me or an assistant) stay consistent.

## Voice & structure

- **First person, experience-driven.** Posts almost always open with how you
  ran into the problem ("One issue I encountered...", "I was playing around
  with...", "I was unable to find..."), not a generic "In this post we will...".
- **Short intro paragraph** (1–3 sentences) stating what the post is about and
  why it matters, before the first `##` heading.
- **Single `#` H1** matching the slug's topic. Headings below it are `##`
  (rarely deeper). Common section names: `Goals`, `Internals`, `Setting up`,
  `Options`, `Examples`, `Timeline`, `Commands`, `Wrapping up`.
- **No forced conclusion.** Short posts just stop after the last technical
  point. Longer, tutorial-style posts (e.g. the GitHub backup post) get a
  "Wrapping up" recap.
- **Show the reasoning, not just the answer.** Explain *why* a tool/flag/approach
  was chosen over the alternative (why a Python wrapper instead of bash, why
  `xargs` vs a `while` loop, etc.), walk through the thought process.
- **Build commands/examples incrementally.** Start from a minimal version and
  evolve it step by step into the final script, rather than dropping the final
  version straight away.
- Minor typos and slightly informal phrasing are fine and consistent with past
  posts ("Lets take a look", "Image you have a pipeline"), don't over-polish.
- Cite sources: link out to official docs, bug trackers, forum threads, GitHub
  gists/repos when they informed the post. Cross-link other posts on this site
  with relative paths, e.g. `[header file](/tech/curl-header-file)`.
- Security/incident posts use a dated bullet-list **Timeline** section
  (`* YYYY-MM-DD: what happened`).

## Frontmatter

Every post `index.md` starts with YAML frontmatter:

```yaml
---
date: "2024-03-06"
tags: ["tech", "linux", "sleep", "systemd"]
---
```

Known fields (`md-compiler/typesExport.ts: MetaData`):

| Field                 | Type                              | Notes |
|------------------------|------------------------------------|-------|
| `date`                | string (`YYYY-MM-DD`)              | Publish date. |
| `tags`                | `string[]`                         | Also doubles as a flat/array YAML list. Each tag gets its own listing + feed page. |
| `icon`                | string (filename)                  | Used on category/topic index pages, points at an SVG next to the `index.md`. |
| `color`               | string                             | Optional accent color. |
| `topicIndex`          | number                             | Manual ordering for category/topic index pages. |
| `childrenLayout`      | `"card" \| "list"`                 | Set on a **category** `index.md` (e.g. `content/tech/index.md`) to control how child posts are listed. |
| `deprecated`          | boolean                            | Flags a post as outdated (e.g. `react-bare-bones-setup`). |
| `commentStatus`       | `"open" \| "closed" \| "disabled"` | Controls Giscus comments. |
| `excludeFromAll`      | boolean                            | Hide from the all-posts listing (used on `content/nsfw/index.md`). |
| `excludeFromChildren` | boolean                            | Hide from its parent's children listing. |
| `children`            | `"auto" \| "root" \| "content"`    | How child pages are gathered. |
| `linkTitle`           | string                             | Override the title used in nav/links (e.g. `linkTitle: Home`). |
| `summary`             | string                             | Optional explicit summary/description. |
| `coAuthors`           | array of string or `{name, url}`   | Anyone besides me who worked on the post, shown in the "Article information" box and in the page's `author` metadata. Used for AI disclosure. See below. |
| `thumbnail`           | object or shorthand string         | See below. |

`thumbnail` can be a bare relative path:

```yaml
thumbnail: ./IMG_20210107_140532525.jpg
```

or an object with more control:

```yaml
thumbnail:
    image: thumbnail.png
    link: https://github.com/ferrybig/breakout/
```

(fields available: `image`, `alt`, `link`, `width`, `height`, `embed`.)

`coAuthors` takes a list of names, each either a bare string or an object
with a `url`:

```yaml
coAuthors:
    - name: Claude Opus 5
      url: https://claude.com/claude-code
    - Someone without a link
```

Posts with no `coAuthors` are unchanged: the line is left out of the
article information box entirely, rather than rendering an empty list.

## Markdown body features

The compiler runs `remark-gfm` + `remark-smartypants` + a custom eval plugin,
then `rehype-pretty-code`, `rehype-slug`, sectionize, accessible emojis, and an
asset-rewriting pass. Practically, that means:

- **GitHub-flavored Markdown**: tables, task lists, strikethrough, autolinks
  all work normally. **Prefer a table over a code block for any tabular or
  column-aligned data**, such as benchmark results, measurements, comparisons,
  or option lists. Tables are used freely to show data (e.g. the SQL post's
  `Course`/`Teacher` tables).
- **Smart typography** (`remark-smartypants`): straight quotes/dashes get
  turned into curly quotes/en-dashes automatically, no need to type `’` etc.
  by hand.
- **Headings get anchors and auto-sectioned** (`rehype-slug` + sectionize):
  every `##` heading becomes a linkable, `<section>`-wrapped block. No manual
  `{#id}` syntax needed.
- **Code blocks** are for actual code, commands, config, and output that is
  really a program's text. Don't use one for tabular data or aligned columns
  of numbers; use a table instead. Standard triple-backtick fences with a
  language tag.
  `rehype-pretty-code` (Shiki, `material-theme-darker` / `material-theme-lighter`)
  handles highlighting with light/dark variants baked in at build time, no
  client JS needed to re-highlight.
  - Meta string after the language supports extra options, e.g.:
    ```` ```bash showLineNumbers title="update.sh" ````
    - `showLineNumbers`, adds line numbers.
    - `title="..."`, shows a filename/title above the block.
- **Images and links to local files** (`<img>`/`<a href>`/`<source>` with a
  relative, non-absolute URL) are automatically rewritten into real ES
  imports by `rehypeMdxAssets`, so images get processed/optimized by Next's
  asset pipeline instead of being served as static strings. Just write normal
  Markdown image/link syntax with a relative path:
  ```md
  ![An photo of a standard television test screen](test.jpg "An HD television test screen")
  ```
  Local links to downloadable files automatically get a `download` attribute.
- **`html eval` code blocks** render a *live preview* of the HTML, in addition
  to the highlighted source. Written as:
  ````md
  ```html eval
  <details>
      <summary>This is the summary</summary>
      <p>This is the body</p>
  </details>
  ```
  ````
  The `remarkMdxEvalCodeBlock` plugin detects the `eval` meta flag and injects
  an `<HtmlPreview html="...">` component right after the code block. That
  component (`app/_components/HtmlPreview.tsx`) is a client component that
  mounts a **Shadow DOM** and sets `shadow.innerHTML` to the raw HTML, so any
  `<style>` tags inside the example are sandboxed and can't leak into (or be
  affected by) the rest of the page's CSS.
- **`js`/`jsx`/`javascript` eval blocks** work similarly but differently
  under the hood: the last statement's value is evaluated inline as an MDX
  expression (via acorn) rather than rendered through a preview component.
  Not currently used in any shipped post, but supported.
- **Accessible emoji handling** (`rehype-accessible-emojis`): plain emoji
  characters typed in text get appropriate screen-reader labels automatically.

## Build/output pipeline (for context, not authoring)

- `md-compiler` compiles every `content/**/index.md` into a React/MDX page
  module under `app/<category>/<slug>/page.js`, plus feed files
  (`feed.atom.xml`, `feed.json`, `feed.rss.xml`) per category/tag.
- `next build --webpack` then statically exports the whole site into `out/`.
- `md-compiler/out` is just the *compiled compiler tool itself* (TS → JS), not
  per-post output, don't confuse it with `app/` or `out/`.
