/**
 * Pure rendering layer: markdown -> HTML, plus the shared page shell. No filesystem I/O -- every
 * function here takes strings in and returns a string out, so it's testable without running API
 * Extractor or api-documenter at all (see test/unit/api-docs-html/render.test.ts).
 *
 * Link rewriting happens at marked's AST/token level (a custom `Renderer.link`), never a text-level
 * regex over the raw markdown -- a regex pass would risk matching inside a fenced code block or an
 * inline code span; marked has already separated those from real link tokens by the time this
 * renderer runs.
 *
 * On HTML safety: api-documenter's own markdown output relies on raw inline HTML passing through
 * unchanged (its tables and `<!-- -->` separators, e.g.) -- CommonMark's standard raw-HTML-passthrough
 * behavior, which this renderer does not (and must not) disable, or every generated table breaks.
 * What IS this renderer's own responsibility, and what it's tested against: nothing this file
 * itself interpolates into an HTML attribute -- a rewritten `href`, a `title`, or the page shell's
 * own dynamic strings (page title, breadcrumb) -- can break out of that attribute. The source
 * content itself is always this repository's own already-reviewed TSDoc, never external input.
 */
import { Marked } from "marked"

/**
 * Escapes a string for safe interpolation inside a double-quoted HTML attribute value -- every
 * character the OWASP XSS Prevention Cheat Sheet's attribute-context rule calls out (`&`, `<`,
 * `>`, `"`, `'`), not just the `"` that would break this specific double-quoted attribute: an
 * unescaped `<`/`>`/`'` here is still a real risk if this same value is ever reused in a
 * single-quoted or unquoted context, or copy-pasted into markup elsewhere.
 * @param value - The raw string to escape.
 * @returns `value` with `&`, `<`, `>`, `"`, `'` entity-escaped.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Escapes a string for safe interpolation as HTML text content (outside any tag or attribute).
 * Escapes all five OWASP-listed characters (`&`, `<`, `>`, `"`, `'`), not just the three that
 * matter in a pure text node -- harmless here, and keeps this helper safe to reuse if a future
 * caller drops it into an attribute instead.
 * @param value - The raw string to escape.
 * @returns `value` with `&`, `<`, `>`, `"`, `'` entity-escaped.
 */
function escapeText(value: string): string {
  return escapeAttribute(value)
}

/**
 * Rewrites one markdown link target so a link to a sibling generated page keeps working once that
 * page is rendered as `.html` instead of `.md`. Leaves everything else untouched:
 * - a URL with an explicit scheme (`https://…`, `mailto:…`, …) is never this renderer's own
 *   output, so it's left exactly as api-documenter wrote it;
 * - a relative path with no trailing `.md` (a bare `#anchor`, or a path to a non-generated file)
 *   has nothing to rewrite;
 * - a trailing `#fragment` is preserved across the rewrite.
 * @param href - The raw link target as written in the markdown source.
 * @returns `href`, with a trailing `.md` (before any `#fragment`) rewritten to `.html`.
 */
export function rewriteMarkdownHref(href: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) return href

  const hashIndex = href.indexOf("#")
  const path = hashIndex === -1 ? href : href.slice(0, hashIndex)
  const fragment = hashIndex === -1 ? "" : href.slice(hashIndex)

  return /\.md$/i.test(path) ? `${path.slice(0, -3)}.html${fragment}` : href
}

/**
 * Builds a `marked` instance whose `link` renderer rewrites `href` via {@link rewriteMarkdownHref}
 * before emitting the anchor tag -- otherwise a faithful reimplementation of marked's own default
 * link rendering (title attribute, inline-parsed link text), scoped down to what this renderer
 * actually needs: no `autolink`/bare-URL special-casing, since api-documenter never emits those.
 * @returns A configured `Marked` instance, ready to `.parse()` api-documenter's markdown output.
 */
function createMarked(): Marked {
  const marked = new Marked()
  marked.use({
    renderer: {
      link(token) {
        const href = escapeAttribute(rewriteMarkdownHref(token.href))
        const inner = this.parser.parseInline(token.tokens)
        const title = token.title ? ` title="${escapeAttribute(token.title)}"` : ""
        return `<a href="${href}"${title}>${inner}</a>`
      },
    },
  })
  return marked
}

const marked = createMarked()

/**
 * Renders one api-documenter markdown page to an HTML fragment (no `<html>`/`<body>` -- that's
 * {@link renderPage}'s job), with every `.md` link rewritten to `.html`.
 * @param markdown - The raw markdown api-documenter wrote for one page.
 * @returns The rendered HTML fragment.
 */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false })
}

/**
 * Extracts a page's own title from api-documenter's markdown -- the first `##` heading (its
 * `#`-level top heading; api-documenter never emits a bare `#`), e.g. `"## hashRequirementFields()
 * function"` or `"## repo-contract package"`. Real, sourced from the page itself, rather than
 * derived from its lowercased filename (which would lose the symbol's real casing).
 * @param markdown - The raw markdown api-documenter wrote for one page.
 * @returns The heading text, or `"API reference"` if the page has no `##` heading (unexpected, but
 *   never a reason to fail generation over a cosmetic title).
 */
export function extractPageTitle(markdown: string): string {
  // `\S` (not `\s`) after the required spaces keeps the two quantifiers' matched character sets
  // disjoint (space vs. non-space) -- there is exactly one way to split "## text", so this can't
  // backtrack ambiguously the way `/^##\s+(.+)$/m` (overlapping `\s+`/`.+`) could on crafted input.
  const match = /^## +(\S.*)$/m.exec(markdown)
  return match?.[1]?.trim() ?? "API reference"
}

/** What {@link renderPage} needs to build one complete HTML page around a rendered fragment. */
export interface RenderPageOptions {
  /** The page's title -- HTML-escaped before use, since (unlike `bodyHtml`) it isn't already rendered. */
  readonly title: string
  /** The already-rendered page body (from {@link markdownToHtml}), inserted as-is. */
  readonly bodyHtml: string
  /** Relative path from this page back to `docs/` (e.g. `"../.."` from `docs/api/<target>/x.html`, `".."` from `docs/api/index.html`) -- used to resolve `styles.css` and the favicon. */
  readonly rootRelativePath: string
  /** Relative path from this page back to `docs/api/index.html` (the landing page), for the header's "API reference" link. */
  readonly apiIndexRelativePath: string
}

/**
 * Wraps a rendered markdown fragment in the shared page shell: the same theme-bootstrap script,
 * favicon links, and `styles.css` stylesheet `docs/index.html` uses (via `rootRelativePath`, so
 * dark/light mode and every existing design token apply here unchanged), a minimal header, and a
 * footer. No JavaScript beyond the theme bootstrap -- these pages don't need the main site's nav
 * toggle or search overlay.
 * @param options - See {@link RenderPageOptions}.
 * @returns The complete HTML document as a string.
 */
export function renderPage(options: RenderPageOptions): string {
  const { title, bodyHtml, rootRelativePath, apiIndexRelativePath } = options
  const safeTitle = escapeText(title)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>
      // Applies the stored/system theme before paint, matching docs/index.html's own inline
      // bootstrap script verbatim -- keeps dark/light mode consistent across the whole site and
      // avoids a flash of the wrong theme.
      try {
        var stored = localStorage.getItem("repo-contract-theme")
        if (stored === "dark" || stored === "light") {
          document.documentElement.setAttribute("data-theme", stored)
        }
      } catch (error) {
        /* localStorage can throw in a locked-down environment -- fall back to prefers-color-scheme */
      }
    </script>
    <title>${safeTitle} — repo-contract API</title>
    <link rel="icon" href="${rootRelativePath}/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="${rootRelativePath}/favicon.png" type="image/png" sizes="48x48" />
    <link rel="stylesheet" href="${rootRelativePath}/styles.css" />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="container">
        <a class="site-logo" href="${rootRelativePath}/index.html">repo-contract</a>
        <div class="header-actions">
          <a href="${apiIndexRelativePath}">API reference</a>
          <a class="github-link" href="https://github.com/MaverickCER/repo-contract">GitHub ↗</a>
        </div>
      </div>
    </header>
    <main id="main">
      <div class="container container--narrow">
        <div class="api-body">
${bodyHtml}
        </div>
      </div>
    </main>
    <footer class="site-footer">
      <div class="container">
        <p>MIT — <a href="${rootRelativePath}/index.html">repo-contract</a></p>
      </div>
    </footer>
  </body>
</html>
`
}
