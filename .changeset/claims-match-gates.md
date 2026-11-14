---
"repo-contract": patch
---

Documentation, comment and message text only. No exported type, flag, error `code`, JSON key or schema constraint changed.

- The header comment `repo-contract init` writes into a new `repo-contract.config.mts` is reworded. The first line of the generated `scripts/contract.mjs` no longer uses an em-dash. The generated code is unchanged.
- TSDoc wording changed in the shipped `.d.ts` files and in the `description` text of the published JSON Schemas. The `Evidence` TSDoc now states the schema-version rule the `api-contract` check enforces, and its limit.
- User-visible text no longer uses a spaced double hyphen as a dash. This covers the `init` and `doctor` `--help` text, the `init` notices, the error messages (for example `Invalid repo-contract config: <reason>`), the preset rationales, the `affected` reasons, and the Markdown run summary (`- **id**: <first line>`). The help-text changes are compatible, and a patch covers them.
- The `deadCode`, `e2e` and `test` presets' failure detail lines use `: ` where they used an em-dash, for example `src/a.ts:5:1: unused export: unused` and `suite.test.ts: a failing test: boom`.

- The README no longer mentions a `--checks a,b,c` flag, which never existed. `runRepoContract`'s `checks` option is what runs a subset.
- The `affected` and `doctor` commands both run `git`. The README and ADOPTION said only `affected` did.
- The `affected`, scope, cache and speed sections moved from the README to the GUIDE ("Running less: affected scope, cache and speed"). The README keeps a short pointer and fits the shared 220-line structure.
- The quick start no longer promises a passing `securityDeps` check; it passes when `npm audit` finds nothing.
- `PIN_SYNC_TOKEN` needs Actions write as well; RELEASING says so.
- GUIDE's preset table gains a "Package `init` detects" column, and a test compares it with the mapping `init` uses.
- Tests compare GUIDE's preset "Wraps" column with the command each preset runs, and GUIDE's CLI command lines and flags with each command's `--help` and argument parser. The `deadCode` row now shows `--reporter-options <options>`, and GUIDE names the `affected`, `metrics` and `-C` options it left out.
- The npm description, README opening, landing page and agent skill now lead with one pitch: "Use deterministic and AI checks to enforce a baseline engineering standard across your org." A test fails when those copies differ. The README grounds each term: a deterministic check, an AI check, the **contract** (the config file) and the **standard** (a contract published as an npm package that repositories extend and add to).
- GUIDE gains "AI review checks", built on the new `aiReview` preset (see its own changeset). `examples/demo` runs it against recorded replies, and CI checks each outcome.
- The README's first screen shows the three install commands and the demo's real output. CI's `examples` job fails when the demo stops printing the quoted lines.
- The entry points' TSDoc module comments, and the `defineRepoContract` and `runRepoContract` summaries, lead with what each gives a consumer. The root module comment no longer says the root exports "two functions"; it exports four.
- A test now checks that the README's `repo-contract` command lines and the flags beside them are accepted by each command's argument parser.
- The agent skill's example comment is two lines, and the skill states the `spawn`/`env` rule once.
