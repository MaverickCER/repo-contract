import { describe, expect, it } from "vitest"
import {
  extractPageTitle,
  markdownToHtml,
  renderPage,
  rewriteMarkdownHref,
} from "../../../scripts/api-docs-html/render.js"

describe("rewriteMarkdownHref", () => {
  it.each([
    ["foo.md", "foo.html"],
    ["foo.md#section", "foo.html#section"],
    ["./foo.md", "./foo.html"],
    ["../foo.md", "../foo.html"],
    ["/foo.md", "/foo.html"],
    ["../../repo-contract.foo.md", "../../repo-contract.foo.html"],
    ["FOO.MD", "FOO.html"],
  ])("rewrites a relative .md link: %s -> %s", (href, expected) => {
    expect(rewriteMarkdownHref(href)).toBe(expected)
  })

  it.each(["https://example.com/foo.md", "http://example.com", "mailto:test@example.com"])(
    "leaves a scheme-qualified URL untouched: %s",
    (href) => {
      expect(rewriteMarkdownHref(href)).toBe(href)
    },
  )

  it.each(["#just-an-anchor", "foo", "foo.json", "../foo"])(
    "leaves a target with no .md suffix untouched: %s",
    (href) => {
      expect(rewriteMarkdownHref(href)).toBe(href)
    },
  )
})

describe("markdownToHtml", () => {
  it("rewrites a relative .md link's href while preserving its text", () => {
    const html = markdownToHtml("[hashRequirementFields](./repo-contract.hashrequirementfields.md)")
    expect(html).toContain('href="./repo-contract.hashrequirementfields.html"')
    expect(html).toContain(">hashRequirementFields<")
  })

  it("leaves an external link's href untouched", () => {
    const html = markdownToHtml("[Standard Schema](https://standardschema.dev)")
    expect(html).toContain('href="https://standardschema.dev"')
  })

  it("preserves a fragment across the rewrite", () => {
    const html = markdownToHtml("[section](./repo-contract.foo.md#remarks)")
    expect(html).toContain('href="./repo-contract.foo.html#remarks"')
  })

  it("does not rewrite a .md-looking string inside a fenced code block", () => {
    const html = markdownToHtml("```ts\n// see ./repo-contract.foo.md\n```")
    expect(html).toContain("./repo-contract.foo.md")
    expect(html).not.toContain("./repo-contract.foo.html")
  })

  it("passes through api-documenter's raw HTML tables unchanged (structural, not neutralized)", () => {
    const markdown = "<table><thead><tr><th>\n\nParameter\n\n</th></tr></thead></table>"
    const html = markdownToHtml(markdown)
    expect(html).toContain("<table><thead><tr><th>")
  })

  it("escapes a quote character in a link title so it cannot break out of the title attribute", () => {
    const html = markdownToHtml('[text](./foo.md "a title with a \\" quote")')
    // The rendered title attribute must contain an escaped entity, never a raw unescaped `"`
    // sitting where it could terminate the attribute early.
    expect(html).toContain("&quot;")
    expect(html).not.toMatch(/title="[^"]*"[^>]*"/)
  })

  it("escapes a hostile href value rather than emitting it as live markup", () => {
    // Not a realistic api-documenter output -- defense in depth for whatever this renderer
    // itself interpolates into an attribute, per render.ts's own module doc comment.
    const html = markdownToHtml('[click](javascript:alert(1)"><script>alert(2)</script>)')
    expect(html).not.toContain("<script>alert(2)</script>")
  })
})

describe("extractPageTitle", () => {
  it("extracts a function page's real, cased heading", () => {
    const markdown =
      "<!-- comment -->\n\n[Home](./index.md)\n\n## hashRequirementFields() function\n\nMore."
    expect(extractPageTitle(markdown)).toBe("hashRequirementFields() function")
  })

  it("extracts a package page's heading", () => {
    expect(extractPageTitle("## repo-contract package\n\nSome text.")).toBe("repo-contract package")
  })

  it("falls back to a generic title when no ## heading is present", () => {
    expect(extractPageTitle("no headings here")).toBe("API reference")
  })
})

describe("renderPage", () => {
  const rendered = renderPage({
    title: "hashRequirementFields",
    bodyHtml: "<p>Body content.</p>",
    rootRelativePath: "../..",
    apiIndexRelativePath: "../index.html",
  })

  it("wraps the body in a complete HTML document", () => {
    expect(rendered).toMatch(/^<!doctype html>/)
    expect(rendered).toContain("<p>Body content.</p>")
    expect(rendered).toContain("</html>")
  })

  it("resolves shared assets via the given rootRelativePath", () => {
    expect(rendered).toContain('href="../../styles.css"')
    expect(rendered).toContain('href="../../favicon.svg"')
    expect(rendered).toContain('href="../../favicon.png"')
  })

  it("includes the title in the <title> tag", () => {
    expect(rendered).toContain("<title>hashRequirementFields — repo-contract API</title>")
  })

  it("HTML-escapes a hostile title before it reaches the page shell", () => {
    const hostile = renderPage({
      title: "<script>alert(1)</script>",
      bodyHtml: "<p>Body content.</p>",
      rootRelativePath: "..",
      apiIndexRelativePath: "index.html",
    })
    expect(hostile).not.toContain("<script>alert(1)</script>")
    expect(hostile).toContain("&lt;script&gt;")
  })
})
