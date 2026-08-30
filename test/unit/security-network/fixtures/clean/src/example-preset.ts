// A legitimate preset shape -- a reviewed, allowlisted command, no network
// imports or globals. Used by scan.test.ts's "clean fixture" true-negative
// case: this file existing and being scanned with zero findings is what
// proves the clean fixture was actually analyzed, not silently skipped.
export const examplePreset = {
  run: ["eslint", ".", "--format", "json"],
  policy: () => ({ outcome: "pass" as const, rationale: "ok" }),
}
