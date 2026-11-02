# 0022: A full run is cold, and a cache replays only identical inputs

## Status

Accepted. Implemented in `src/affected/scope.ts` and `src/affected/cache.ts` (published in
`repo-contract/affected`, Experimental), `src/helpers/file-cache-store.ts` (published in
`repo-contract/helpers`) and `bin/cache-cli.mjs` (`repo-contract cache`). Follows
[ADR 0021](0021-affected-scope-is-a-pure-analysis-that-only-ever-widens.md). Wiring a runner's checks to the cache is
the consumer's, and is described in each consumer's own records.

## Context

Once a run can be narrowed to the affected part of a tree, two more savings are available: skipping work whose inputs
have not changed since a previous run, and choosing automatically between a narrow and a full run. Both can silently
turn a green run into a false one. Past incidents in this ecosystem were all of that shape: a stale incremental file
that reported zero surviving mutants, and a gitignored source file that CI never saw. The cost of a wrong replay is a
regression that ships; the cost of a missed one is minutes.

## Decision

- **A full run is cold.** `resolveCacheMode` returns `off` whenever the scope is `full`, ahead of any flag or
  environment setting: the cache is neither read nor written. A release is always full (`resolveScope` returns `full`
  for the `release` event and for a tag ref even when `--scope affected` is given), so no release can be satisfied by an
  earlier result.
- **`CI_FULL` is the one switch that can only widen.** It forces `full` over every other setting. No setting forces
  `affected` over a release or over `CI_FULL`.
- **Unknown contexts run everything.** A CI event other than a pull request, and a CI system that does not say which
  event it is, validate the whole tree. Only a pull request or a local run narrows by default.
- **A result is replayed only for exactly the same inputs.** The key is a digest of the cache format, the check, every
  input's name and content digest, and the tool versions. Names and values are hashed as ordered pairs, so a value
  cannot be mistaken for a name. A stored entry must also carry the format, check and key it is filed under, and
  well-formed fields; anything else is a miss and is overwritten by the next store. Nothing is ever replayed on a
  guess.
- **What the inputs are is the caller's responsibility, stated plainly.** The cache cannot know what a check reads. A
  check that leaves an input out of its declared inputs can replay a stale result; the library cannot detect that, so
  the documentation says so and releases bypass the cache.
- **Storage is files, with no daemon and no database.** `createFileCacheStore` writes a temporary file in the target
  directory and renames it into place, so a concurrent reader or writer never sees part of an entry. Paths are
  validated segment by segment (no `..`, absolute, drive or backslash forms) and symbolic links are not followed when
  listing. The cache itself is pure over a four-method store interface, so it is tested without a disk.
- **Housekeeping never prompts.** `repo-contract cache stats|clear|prune` follow command-line conventions (data on
  stdout, diagnostics on stderr, exit 0/1/2, `--json` with `schemaVersion`) and touch only the cache directory.

## Consequences

- A pull request can reuse results; a release or a post-merge full run cannot, by construction, however the
  environment is set.
- A caller that wants a cache hit to be trustworthy must hash everything the check reads, including its configuration
  and tool versions. The shared checks do; a hand-written one must.
- Pruning by age or count is explicit; nothing deletes entries on its own, and `.repo-contract/cache` must be kept out
  of version control by the consumer.
- The library does not time anything. Savings and timing reports are computed by the caller from the entry's
  `durationMs`.

## Alternatives considered

- **A remote or shared cache.** Out of scope: it needs a server, credentials and a trust model. A CI provider's own
  directory cache can restore `.repo-contract/cache` between runs, and content-addressed entries make a partial
  restore safe.
- **Letting `--scope affected` override a release.** Rejected: the only reason to ask for it on a release is a mistake.
- **Replaying a hit whose format differs.** Rejected: an entry written by another format may mean something else.
