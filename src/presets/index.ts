/**
 * Ready-made checks for common TypeScript and JavaScript tools. Spread a preset into your own
 * `checks` record and override what you need, most often `policy`.
 *
 * A preset encodes how to run and read one tool, never what counts as good enough
 * (specs/decisions/0004-public-surface-stays-narrow-no-cli-experimental-presets.md). To change
 * what a factory preset runs, pass it options; overriding `run` directly is the escape hatch.
 *
 * Experimental, and published under its own `./presets` subpath. It is never re-exported from the
 * package root, and it re-exports nothing from there.
 * @packageDocumentation
 */
export { aiReview } from "./ai-review.js"
export type { AiReviewFinding, AiReviewOptions, AiReviewReply } from "./ai-review.js"
export { arethetypeswrong } from "./arethetypeswrong.js"
export { brokenLinks } from "./broken-links.js"
export { commitlint } from "./commitlint.js"
export { deadCode } from "./dead-code.js"
export { distNoUrls } from "./dist-no-urls.js"
export type { DistNoUrlsAllowEntry, DistNoUrlsOptions } from "./dist-no-urls.js"
export { duplication } from "./duplication.js"
export { e2e } from "./e2e.js"
export { format } from "./format.js"
export { license } from "./license.js"
export { lint } from "./lint.js"
export { markdownlint } from "./markdownlint.js"
export { publint } from "./publint.js"
export { securityDeps } from "./security-deps.js"
export { securitySecrets } from "./security-secrets.js"
export { stylelint } from "./stylelint.js"
export { test } from "./test.js"
export { typecheck } from "./typecheck.js"
