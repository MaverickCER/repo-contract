# Exceptions walkthrough: a governed, justified waiver

> **Advanced / Experimental.** This example uses `repo-contract/helpers`, whose
> signature and behavior may change in a minor or patch release (see
> [`../../VERSIONING.md`](../../VERSIONING.md)). Start with
> [`../day-one-walkthrough`](../day-one-walkthrough) for the mainline adoption
> story. Reach for this pattern only when a repository needs to say _"this
> specific finding is reviewed and accepted, here is why"_ without weakening the
> check for everything else.

## The problem

A dependency-advisory check finds three issues. One is a real, reviewed,
production-irrelevant false positive that cannot be fixed this quarter. The
blunt options are both bad: suppress the whole check (now nothing is enforced),
or leave it red forever (the team stops reading it).

The middle path is a **registry of justified exceptions**, each one matched to a
specific finding, each one carrying the fields a reviewer needs to sign off. That
matching, precedence, and field-completeness logic is exactly what
`repo-contract/helpers` provides — and nothing else. It does not decide what a
finding is or how it maps to a record; that stays in this example's own code.

## The pieces

| File                                         | What it owns                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`findings.ts`](findings.ts)                 | A synthetic `npm audit`-shaped advisory list + `deriveAdvisoryId` (the finding↔record identity)                                       |
| [`exceptions.json`](exceptions.json)         | The waiver registry — `{ "exceptions": [...] }`                                                                                       |
| [`exception-record.ts`](exception-record.ts) | The waiver shape + a hand-written [Standard Schema](https://standardschema.dev) (no Zod dependency)                                   |
| [`exception-policy.ts`](exception-policy.ts) | The flow: `loadExceptionRegistry` → `reconcileExceptions` → `evaluateExceptionRecord` / `resolveExceptionPolicy` → one `PolicyResult` |

The organization's stance, from [`exception-policy.ts`](exception-policy.ts):

```ts
critical / high → forbidden      // cannot be waived at all
moderate        → exception      // waivable, but only with justification + alternatives
low             → allowed        // accepted silently
```

## The three advisories

- **`tough-cookie`** (moderate) — waived, with a full justification and a real
  alternative. `evaluateExceptionRecord` returns **`permitted`**. The run also
  prints a `hashRequirementFields` digest of the signed-off prose: record it next
  to the approver, and it stops matching automatically if anyone edits the text.
- **`semver`** (moderate) — waived, but `alternatives` is blank.
  `evaluateExceptionRecord` returns **`insufficient`** and names the missing
  field.
- **`minimist`** (high) — `resolveExceptionPolicy` says high severity is
  **`forbidden`**; a waiver would not help. Upgrade is the only path.

## Running it

```sh
# from the repository root: build repo-contract once, then wire the workspace
npm install
cd examples && npm install

npm run walkthrough -w exceptions-walkthrough
```

Output:

```text
exceptions-walkthrough

[FAIL] DependencyAdvisories
  3 advisory(ies), 2 with a waiver:
  - permitted  tough-cookie:GHSA-72xf-g2v4-qvf3 (moderate) -- waiver v1, sign-off e6978fcb1b65. Re-approve if the justification text changes.
  - insufficient semver:GHSA-c2qf-rxjj-qqgw (moderate) -- waiver is missing: alternatives. Fill those fields in exceptions.json.
  - forbidden  minimist:GHSA-xvch-5gmm-9grj (high) -- Prototype pollution in minimist. This severity cannot be waived; upgrade the dependency.

FAIL
```

The run fails — correctly — on the two advisories that are not properly governed,
while the one with a complete, justified waiver is `permitted` and does not block.
Fill in `semver`'s `alternatives`, upgrade `minimist`, and the check goes green
without anyone having touched the check's own code.

## See also

- [The guide's **Advanced: governed exceptions** section](../../GUIDE.md#advanced-governed-exceptions)
  — the full helper surface (`loadExceptionRegistry`, `resolveExceptionPolicy`,
  `evaluateExceptionRecord`, `reconcileExceptions`, `hashRequirementFields`).
- [`../day-one-walkthrough`](../day-one-walkthrough) — the companion mainline
  example: rolling out a new shared requirement as a dated `warn` → `fail`.
- [`../README.md`](../README.md) — the layered organizational governance model.
