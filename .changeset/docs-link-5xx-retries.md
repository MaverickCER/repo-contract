---
"repo-contract": patch
---

Make the documentation link check retry transient HTTP 5xx responses (with jitter) and crawl with modest concurrency, so a throttled github.com no longer fails the contract and the release pull request.
