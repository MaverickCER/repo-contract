# Affected scope: run only what a pull request can affect

**"I changed one function. Why does the whole suite run?"** It need not. `repo-contract`
can work out which tests a change can reach, and which files mutation testing must cover.
It says when it cannot be sure, and then it runs everything.

This package builds a real git repository, makes one change, and runs the real commands.
`npm run walkthrough` prints each command and its output. It **fails** if the affected set,
the shard split, the widening or the `doctor` verdict differs from what is written here.
Those outcomes are tested, not illustrative.

## The project

```text
src/math.ts   export const double = (n) => n * 2
src/both.ts   imports double from math; exports twice
src/text.ts   export const shout = ...            (nothing to do with math)
test/math.test.ts, test/both.test.ts, test/text.test.ts   one test per source file
```

The pull request changes what `double` does.

## 1. Which tests can the change reach?

```sh
repo-contract affected --base HEAD --tests
# test/both.test.ts
# test/math.test.ts
```

`text.test.ts` is not listed: nothing it imports changed. The analysis is symbol-level
(it follows `double` through `both.ts`), and only ever _widens_ when it is unsure, never
narrows.

## 2. Why?

```sh
repo-contract affected --base HEAD --explain
# test/both.test.ts must run <- src/both.ts exports a changed `twice` <- src/math.ts exports a changed `double` <- ...
```

Every test that runs has a chain back to a changed symbol, so a surprising selection can
be checked rather than trusted.

## 3. Which files does mutation testing need?

```sh
repo-contract affected --base HEAD --mutate
# src/both.ts
# src/math.ts
```

The changed file and what uses it directly.

## 4. Split that across CI jobs

```sh
repo-contract affected --base HEAD --plan-shards --shards 2     # {"count": 2, "include": [{"spec": "1/2"}, {"spec": "2/2"}]}
repo-contract affected --base HEAD --mutate --shard 1/2         # src/both.ts
repo-contract affected --base HEAD --mutate --shard 2/2         # src/math.ts
```

Use the plan as a matrix (`strategy.matrix: ${{ fromJSON(...) }}`) and give each job its
`--shard`. The shards together are exactly the mutation targets: no file is lost or done
twice. Combine the shards' Stryker reports with `repo-contract merge-mutation`, which
refuses to pass if a shard is missing.

## 5. When it cannot be sure, it runs everything

Changing `package.json` (or a lock file, a tsconfig, a workflow, ...) can change how
_every_ file behaves, so:

```sh
repo-contract affected --base HEAD --tests
# repo-contract affected: running everything (global-trigger: package.json)   (on stderr)
# test/both.test.ts
# test/math.test.ts
# test/text.test.ts
```

A release always runs the full contract regardless of what the analysis says.

## 6. `doctor`

```sh
repo-contract doctor
# warn  cache-not-ignored
#       .repo-contract/cache/ is not in .gitignore, so cached results could be committed.
```

`doctor --fix` applies only the safe, mechanical fixes.

## Run it

```sh
npm install        # from examples/, once
cd affected-scope
npm run walkthrough
```

Needs `repo-contract` built (`npm run build` in the repository root), because the example
runs the package's real command line.

## Where to read more

- [Speed features and their proof](../../GUIDE.md#speed-features-and-their-proof): this walkthrough plus caching, fail-fast, metrics and the soundness check.
- [ADR 0023](../../specs/decisions/0023-speed-features-are-opt-in-and-every-skip-is-visible.md): the design and the rules for widening.
