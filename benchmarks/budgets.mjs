// Tuning for the benchmark gates. Nothing here is needed: the defaults in internal-package-contract
// (scripts/benchmark/gates.mjs) apply to every group, and a package overrides only what it must, for
// example `export const GATES = { normalizedOverheadMaxIncreasePercent: { millisecondScale: 60 } }`.
//
// There is no threshold on a raw time. Results are not comparable between machines (see
// READING-BENCHMARKS.md), so a pull request is judged on properties of one run instead: the measured
// big-O against the documented one (a function whose big-O cannot be determined is a warning), and the
// overhead as a ratio to the bare baseline.

// The normalized-overhead gate is judged only on an order-of-magnitude change here. In the checks
// suite the package's whole overhead at the typical size (80 checks) is about 0-80 ms on top of a
// 0.7-0.8 s bare baseline, which is inside run-to-run noise: identical engine code measured 1.1% at
// v0.12.0 and 5.9% on the next main run (both on an EPYC 9V74 runner), 7.5% and 9.9% on two runs of
// the same pull request (EPYC 7763), and 0% on an Apple M3 (2026-11-11). A relative limit of 50% on
// a ratio that small fails on noise and would fail a real 1-pp regression only by luck. Until the
// shared gate judges the absolute overhead (milliseconds and percentage points) and skips references
// measured on another CPU model, only a tenfold change fails this repository. The growth-class gate
// is unaffected and remains the one that catches real regressions.
export const GATES = {
  normalizedOverheadMaxIncreasePercent: { millisecondScale: 1000, microsecondScale: 1000 },
}
