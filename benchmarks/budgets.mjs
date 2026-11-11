// Tuning for the benchmark gates. Nothing here is needed: the defaults in internal-package-contract
// (scripts/benchmark/gates.mjs) apply to every group, and a package overrides only what it must, for
// example `export const GATES = { normalizedOverheadMaxIncreasePercent: { millisecondScale: 60 } }`.
//
// There is no threshold on a raw time. Results are not comparable between machines (see
// READING-BENCHMARKS.md), so a pull request is judged on properties of one run instead: the measured
// big-O against the documented one (a function whose big-O cannot be determined is a warning), and the
// overhead as a ratio to the bare baseline.

// No override. The normalized-overhead gate failed this repository twice on identical engine code
// (1.1% at v0.12.0 and 5.9% on the next main run on an EPYC 9V74 runner; 7.5% and 9.9% on two runs
// of one pull request on an EPYC 7763; 0% on an Apple M3, 2026-11-11): the measurement, not the
// code, moved. Widening the limit until it passed would have made the gate meaningless, so the
// accuracy is being fixed where the figure is produced (internal-package-contract's benchmark
// runner and gate: interleaved sampling, a confidence interval on the overhead, references from the
// same CPU model), and this repository releases only once the gate passes on accurate figures.
export const GATES = {}
