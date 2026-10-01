---
"repo-contract": minor
---

Add the `distNoUrls({ dir?, allow? })` preset (`repo-contract/presets`). It fails when any URL
(any scheme followed by a colon and two slashes) appears in any file of the build output --
code, declarations and sourcemaps included -- so supply-chain scanners such as Socket.dev have no
URL strings to flag. `allow` takes `{ url, reason }` entries (`url` may be a glob); a missing
`reason` fails the check. repo-contract's own build output is now URL-free and the check runs in
its own contract.
