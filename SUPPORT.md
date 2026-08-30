# Support

This document explains how to get help with `repo-contract`, report a bug, or
request a change.

## Before opening a Discussion or Issue

Check the README and the generated [API report](docs/api-report/repo-contract.api.md) first — most
"how do I configure X" questions are answered there, precisely. Then search existing GitHub Discussions and Issues; a duplicate report doesn't
move anything forward faster.

## Questions and usage help

Open a **GitHub Discussion** for anything that isn't a bug: how to structure a policy, whether a
given check design fits the model, integration questions, or general feedback on the API's
shape.

## Bug reports

Open a **GitHub Issue**. The fastest path to a fix is a minimal reproduction — a small
`repo-contract.config.ts` that exhibits the problem, plus:

- The version of `repo-contract`
- Your runtime (Node.js, Bun, or Deno) and its version, and your OS — see the
  [README's runtime support matrix](README.md#runtime-support-matrix) for what's tested
- Expected vs. actual behavior
- Any relevant config, evidence, or log output

## Feature requests

Search existing Issues and Discussions first. A request that's easy to act on explains the
problem being solved, why the current API doesn't already cover it, a concrete proposed shape,
and what alternatives were considered — the same bar this repository holds itself to in its own
ADRs (`specs/decisions/`).

## Security vulnerabilities

Do not report a vulnerability through a public Issue or Discussion. Follow the disclosure process
in [SECURITY.md](SECURITY.md) instead.

## Supported versions

Only the latest published `0.x` release is actively supported — see
[VERSIONING.md](VERSIONING.md) for what pre-1.0 support means in practice.

## Response expectations

This is a single-maintainer open source project; response times aren't guaranteed. A
well-documented report — one that includes a reproduction and the details above — is the
single biggest lever you have over how quickly it gets addressed.
