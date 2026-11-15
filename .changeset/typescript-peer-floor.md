---
"repo-contract": minor
---

The optional `typescript` peer now starts at `>=5.8.0`, the oldest release CI proves. It was `>=5.0.0`, and nothing tested 5.0 to 5.7.

- **Who is affected.** A project on TypeScript 5.0 to 5.7. Under them, a CommonJS project with `module: "nodenext"` fails to type-check the package's declarations (TS1479). Each `dist/*.d.cts` re-exports an ES module, which 5.8 is the first to allow. npm now warns about the peer on install.
- **What to do.** Upgrade TypeScript to 5.8 or later. An ES module project, or one with `skipLibCheck`, may keep working on an older 5.x, but no release below 5.8 is tested.
- **How it stays true.** CI's `typescript-compat` job now type-checks the packed tarball under the peer's floor as well as the newest 5, 6 and 7. A unit test fails when the floor in `package.json` and the job's list disagree, or when a document states another range.
