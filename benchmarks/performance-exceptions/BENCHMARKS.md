# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.38 ms** per operation compared with a bare-minimum baseline (**240% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.08). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.38 ms | 29.8 ms |
| Added latency, relative to baseline | 240% | 381% |
| Added CPU time per operation | 1.38 ms | 30.2 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 727 ops/s | 34 ops/s |

## 1. End-to-end: the package's total impact

Shows what a check pays, once per run, to read an exception registry, reconcile it with what the check found and write it back, compared with the bare minimum of parsing the file and matching ids by hand. It is pure in-memory work, paid by every check that keeps a registry.

- **Baseline (no package):** Parse the registry JSON and match each finding to a record by id with a Map -- the least anyone would do.
- **With the package:** `loadExceptionRegistry` reads the registry, `reconcileExceptions` matches the findings and `writeExceptionRegistry` serializes it back.

Both sides use empty or minimal functions on purpose. The difference is then the package's own cost, not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| entries | swept | The tier axis: how many entries the main input holds (records, findings, rules, fields or classifications, as each function says). |
| filesystem | fixed at "an in-memory stand-in" | A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O). |
| runtime | fixed at "Node (V8)" | Measured on Node only. |
| match rate | fixed at "every finding matches a record" | A registry with stale or new entries does a little more work. |

The baseline is an empty or minimal function, so it costs almost nothing. The _relative_ overhead can then look enormous (shown as a multiple of the baseline). Read the absolute columns (time, CPU and dollars added): they are what a bill and a latency budget are made of.

| entrys | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 37.6 µs | 176 µs | 140 µs | 373% | 151 µs | $0.00029 – $0.0017 |
| 40 | 57.8 µs | 253 µs | 195 µs | 338% | 201 µs | $0.00041 – $0.0023 |
| 80 | 99.3 µs | 401 µs | 301 µs | 304% | 1.53 ms | $0.00063 – $0.017 |
| 160 | 184 µs | 609 µs | 424 µs | 230% | 1.66 ms | $0.00088 – $0.019 |
| 320 | 348 µs | 1.01 ms | 657 µs | 189% | 1.12 ms | $0.0014 – $0.013 |
| 640 | 574 µs | 1.95 ms | 1.38 ms | 240% | 1.38 ms | $0.0029 – $0.015 |
| 1280 | 995 µs | 3.68 ms | 2.69 ms | 270% | 2.66 ms | $0.0056 – $0.030 |
| 2560 | 1.87 ms | 7.27 ms | 5.42 ms | 289% | 5.45 ms | $0.011 – $0.061 |
| 5120 | 3.81 ms | 17.0 ms | 13.1 ms | 344% | 13.5 ms | $0.027 – $0.152 |
| 10240 | 7.83 ms | 37.7 ms | 29.8 ms | 381% | 30.2 ms | $0.062 – $0.339 |

**How the total grows:** O(n) (linear), exponent 1.08 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 307 µs | 3.60 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 45.1 µs | 1.18 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 402 µs | 5.85 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.42 ms | 24.9 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 28.5 ms | 466 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 105 µs | 3.65 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 55.8 ms | 882 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 28.1 ms | 459 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.5 µs | 3.03 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 10.0 µs | 118 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 125 µs | 1.88 ms |

### `reconcileExceptions`

**Why we benchmark it.** Every check that keeps an exception registry reconciles it with what it found on every run, so its cost is paid by every contract run that has exceptions.

**What poor performance would mean.** Slower runs in proportion to the registry and the findings, and a quadratic match would punish the repositories with the most exceptions.

**Expected growth: O(n).** It indexes the existing records by id in a Map and looks each finding up once, so cost is proportional to the findings plus the records.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| findings | swept | The tier axis: findings to match. |
| existing-records | swept | How many records the registry already holds. |
| match rate | fixed at "findings carry the even ids 0, 2, 4 ...; each one below the registry's size matches a record" | Matched findings reuse a record; the rest create a stub. With the registry at its base size of 640 records at most 320 findings match (half of them at 640 findings); on the registry sweep, every finding matches once the registry holds twice as many records. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Called once per run, between reading and writing the registry, but not attributed: the end-to-end run reconciles a registry in which every finding matches, while this benchmark holds the registry at 640 records with only some findings matching, so its time would misstate that share.

**Measured: O(n)** (exponent 0.91, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 81.2 µs | 99.6 µs | 264 µs | 117.8 KiB | 12,322 |
| 40 | 52.2 µs | 54.0 µs | 159 µs | 97.9 KiB | 19,165 |
| 80 | 60.8 µs | 65.3 µs | 176 µs | 122.1 KiB | 16,449 |
| 160 | 84.4 µs | 90.8 µs | 249 µs | 158.9 KiB | 11,853 |
| 320 | 120 µs | 126 µs | 331 µs | 237.1 KiB | 8,305 |
| 640 | 307 µs | 452 µs | 931 µs | 656.2 KiB | 3,256 |
| 1280 | 460 µs | 470 µs | 1.13 ms | 1.0 MiB | 2,173 |
| 2560 | 785 µs | 807 µs | 1.44 ms | 2.1 MiB | 1,273 |
| 5120 | 1.78 ms | 1.83 ms | 2.99 ms | 4.3 MiB | 563 |
| 10240 | 3.60 ms | 3.73 ms | 4.44 ms | 8.6 MiB | 278 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.20, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 9.40 µs | 9.96 µs | 21.1 µs | 17.0 KiB | 106,425 |
| 40 | 9.07 µs | 9.61 µs | 36.3 µs | 16.3 KiB | 110,230 |
| 80 | 12.9 µs | 22.4 µs | 42.6 µs | 20.5 KiB | 77,652 |
| 160 | 18.5 µs | 38.5 µs | 62.3 µs | 28.6 KiB | 54,131 |
| 320 | 27.6 µs | 30.5 µs | 97.1 µs | 48.2 KiB | 36,189 |
| 640 | 45.1 µs | 47.5 µs | 131 µs | 86.7 KiB | 22,164 |
| 1280 | 92.8 µs | 97.1 µs | 289 µs | 166.1 KiB | 10,778 |
| 2560 | 198 µs | 204 µs | 565 µs | 329.7 KiB | 5,052 |
| 5120 | 541 µs | 554 µs | 1.39 ms | 634.3 KiB | 1,847 |
| 10240 | 1.18 ms | 1.23 ms | 3.12 ms | 1.3 MiB | 845 |

### `loadExceptionRegistry`

**Why we benchmark it.** Every check that keeps a registry reads it at the start of every run.

**What poor performance would mean.** Slower starts for every check in proportion to the registry, which is the part of a contract run that cannot be skipped.

**Expected growth: O(n).** The file is parsed once and its array is handed to the schema once, so cost is proportional to the size of the registry.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| records | swept | The tier axis: records in the registry. |
| filesystem | fixed at "an in-memory stand-in" | A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O). |
| schema | fixed at "accepts every array" | A caller's own schema adds its own validation cost on top. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per run, before reconciling.

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 19.0 µs | 21.1 µs | 83.2 µs | 7.3 KiB | 52,542 |
| 40 | 29.2 µs | 30.5 µs | 88.1 µs | 13.2 KiB | 34,191 |
| 80 | 57.0 µs | 60.7 µs | 163 µs | 25.1 KiB | 17,537 |
| 160 | 110 µs | 113 µs | 293 µs | 48.9 KiB | 9,060 |
| 320 | 215 µs | 221 µs | 540 µs | 96.5 KiB | 4,661 |
| 640 | 402 µs | 407 µs | 835 µs | 191.5 KiB | 2,485 |
| 1280 | 783 µs | 837 µs | 1.46 ms | 381.6 KiB | 1,277 |
| 2560 | 1.61 ms | 2.05 ms | 3.07 ms | 761.9 KiB | 622 |
| 5120 | 3.66 ms | 3.80 ms | 5.41 ms | 1.5 MiB | 273 |
| 10240 | 5.85 ms | 5.91 ms | 7.94 ms | 3.0 MiB | 171 |

### `writeExceptionRegistry`

**Why we benchmark it.** Every check that reconciles a registry writes it back when it changed.

**What poor performance would mean.** Slower runs whenever a registry changes, in proportion to its size.

**Expected growth: O(n log n).** Each record's keys are put in canonical order and the whole registry is serialized once, so cost grows a little faster than the number of records.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| records | swept | The tier axis: records written. |
| filesystem | fixed at "an in-memory stand-in" | A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O). |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Once per run, after reconciling, when the registry changed.

**Measured: O(n)** (exponent 1.02, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 64.9 µs | 78.2 µs | 248 µs | 44.3 KiB | 15,409 |
| 40 | 103 µs | 120 µs | 315 µs | 83.1 KiB | 9,680 |
| 80 | 188 µs | 200 µs | 509 µs | 161.5 KiB | 5,321 |
| 160 | 387 µs | 431 µs | 1.06 ms | 319.5 KiB | 2,587 |
| 320 | 657 µs | 710 µs | 1.32 ms | 632.2 KiB | 1,522 |
| 640 | 1.42 ms | 1.52 ms | 2.72 ms | 1.2 MiB | 705 |
| 1280 | 2.66 ms | 2.75 ms | 4.11 ms | 2.5 MiB | 376 |
| 2560 | 5.23 ms | 5.32 ms | 6.96 ms | 4.9 MiB | 191 |
| 5120 | 10.4 ms | 10.6 ms | 12.3 ms | 9.8 MiB | 96 |
| 10240 | 24.9 ms | 25.3 ms | 27.4 ms | 19.7 MiB | 40 |

### `resolveExceptionPolicy`

**Why we benchmark it.** It decides, for each exception record, which policy applies, and runs once per classification of every record.

**What poor performance would mean.** Slower judgement of every record in proportion to how many rules a policy has.

**Expected growth: O(n).** It scans the group's rules for an exact match and then for glob matches, so cost is proportional to the number of rules.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| rules | swept | The tier axis: rules in the group. |
| category | variant | An exact rule, a category matched by a glob, or every category at once. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

#### Variant `glob-match`

The category matches one glob rule.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.56 ms | 2.05 ms | 3.70 ms | 652.5 KiB | 643 |
| 40 | 2.00 ms | 2.99 ms | 3.31 ms | 1.3 MiB | 500 |
| 80 | 3.79 ms | 4.77 ms | 5.17 ms | 2.6 MiB | 264 |
| 160 | 7.43 ms | 9.00 ms | 8.97 ms | 5.3 MiB | 135 |
| 320 | 14.6 ms | 17.5 ms | 16.3 ms | 10.6 MiB | 69 |
| 640 | 28.5 ms | 31.2 ms | 35.1 ms | 21.5 MiB | 35 |
| 1280 | 56.7 ms | 58.0 ms | 58.8 ms | 43.7 MiB | 18 |
| 2560 | 114 ms | 118 ms | 117 ms | 25.9 MiB | 9 |
| 5120 | 234 ms | 236 ms | 240 ms | 54.2 MiB | 4 |
| 10240 | 466 ms | 467 ms | 477 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.23, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.00 µs | 7.92 µs | 6.18 µs | 7.4 KiB | 166,693 |
| 40 | 8.17 µs | 8.84 µs | 28.7 µs | 14.0 KiB | 122,376 |
| 80 | 15.1 µs | 19.5 µs | 49.4 µs | 27.3 KiB | 66,368 |
| 160 | 28.6 µs | 31.3 µs | 87.5 µs | 53.9 KiB | 34,929 |
| 320 | 54.4 µs | 66.5 µs | 154 µs | 107.0 KiB | 18,377 |
| 640 | 105 µs | 119 µs | 292 µs | 213.3 KiB | 9,480 |
| 1280 | 399 µs | 416 µs | 849 µs | 515.9 KiB | 2,507 |
| 2560 | 788 µs | 826 µs | 1.46 ms | 1.0 MiB | 1,269 |
| 5120 | 1.71 ms | 1.86 ms | 3.12 ms | 2.1 MiB | 586 |
| 10240 | 3.65 ms | 3.93 ms | 5.60 ms | 4.2 MiB | 274 |

### `evaluateExceptionRecord`

**Why we benchmark it.** It decides whether one record is permitted, and runs for every record of a registry.

**What poor performance would mean.** Slower judgement of a whole registry, multiplied by the number of classifications each record carries and the rules each policy has.

**Expected growth: O(n).** Each classification is resolved once, so cost is proportional to the number of classifications.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| classifications | swept | The tier axis: classifications the record is judged under. |
| rules | swept | How many rules the policy group has. |
| requirements | fixed at 4 | How many fields the policy's matching rule requires. Each costs one field read and one trim, which is too small next to resolving the rules to measure a growth rate of its own. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.03 ms | 2.18 ms | 3.77 ms | 1.2 MiB | 492 |
| 40 | 3.81 ms | 3.87 ms | 5.78 ms | 2.5 MiB | 263 |
| 80 | 7.30 ms | 7.52 ms | 9.38 ms | 5.0 MiB | 137 |
| 160 | 14.2 ms | 14.7 ms | 16.3 ms | 10.0 MiB | 70 |
| 320 | 28.3 ms | 42.1 ms | 31.3 ms | 20.0 MiB | 35 |
| 640 | 55.8 ms | 55.9 ms | 58.5 ms | 40.1 MiB | 18 |
| 1280 | 112 ms | 114 ms | 114 ms | 16.1 MiB | 9 |
| 2560 | 219 ms | 220 ms | 222 ms | 32.3 MiB | 5 |
| 5120 | 439 ms | 443 ms | 441 ms | 707.4 KiB | 2 |
| 10240 | 882 ms | 887 ms | 884 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.17 ms | 1.21 ms | 2.96 ms | 645.6 KiB | 854 |
| 40 | 2.04 ms | 2.08 ms | 3.90 ms | 1.3 MiB | 489 |
| 80 | 3.75 ms | 3.81 ms | 5.73 ms | 2.5 MiB | 266 |
| 160 | 7.26 ms | 7.37 ms | 9.32 ms | 5.2 MiB | 138 |
| 320 | 14.2 ms | 14.4 ms | 16.4 ms | 10.6 MiB | 70 |
| 640 | 28.1 ms | 28.1 ms | 30.2 ms | 21.4 MiB | 36 |
| 1280 | 56.3 ms | 57.0 ms | 58.4 ms | 43.6 MiB | 18 |
| 2560 | 114 ms | 115 ms | 116 ms | 25.7 MiB | 9 |
| 5120 | 229 ms | 229 ms | 232 ms | 53.9 MiB | 4 |
| 10240 | 459 ms | 460 ms | 463 ms | 46.2 MiB | 2 |

### `validateExceptionPolicyConfig`

**Why we benchmark it.** A check validates its policy config before it judges a single record, once per run.

**What poor performance would mean.** Slower starts for every check in proportion to how large its policy is.

**Expected growth: O(n).** Each rule is validated once, and each required field is looked up in the list of valid ones.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| rules | swept | The tier axis: rules in the config. |
| valid-requirements | swept | How many requirement names are valid. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n log n)** (exponent 1.36, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.26 µs | 10.1 µs | 4.38 µs | 9.3 KiB | 234,471 |
| 40 | 5.50 µs | 6.01 µs | 21.6 µs | 8.4 KiB | 181,765 |
| 80 | 8.85 µs | 9.18 µs | 30.1 µs | 16.2 KiB | 113,026 |
| 160 | 15.9 µs | 16.7 µs | 49.1 µs | 31.8 KiB | 63,017 |
| 320 | 30.3 µs | 34.6 µs | 89.4 µs | 63.1 KiB | 32,980 |
| 640 | 58.5 µs | 60.7 µs | 167 µs | 127.6 KiB | 17,084 |
| 1280 | 325 µs | 342 µs | 741 µs | 352.8 KiB | 3,074 |
| 2560 | 662 µs | 676 µs | 1.35 ms | 694.2 KiB | 1,511 |
| 5120 | 1.49 ms | 1.54 ms | 2.92 ms | 1.3 MiB | 669 |
| 10240 | 3.03 ms | 3.09 ms | 4.62 ms | 2.7 MiB | 330 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.89, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.32 µs | 3.74 µs | 3.39 µs | 4.5 KiB | 301,637 |
| 40 | 3.61 µs | 3.69 µs | 13.1 µs | 4.5 KiB | 276,962 |
| 80 | 3.95 µs | 4.27 µs | 16.7 µs | 4.5 KiB | 253,376 |
| 160 | 5.09 µs | 5.39 µs | 20.0 µs | 4.5 KiB | 196,428 |
| 320 | 6.62 µs | 6.91 µs | 25.4 µs | 4.5 KiB | 151,038 |
| 640 | 10.0 µs | 10.6 µs | 35.3 µs | 4.5 KiB | 100,034 |
| 1280 | 16.6 µs | 17.4 µs | 53.0 µs | 4.5 KiB | 60,176 |
| 2560 | 30.2 µs | 34.4 µs | 91.3 µs | 4.5 KiB | 33,092 |
| 5120 | 58.3 µs | 67.1 µs | 178 µs | 4.5 KiB | 17,141 |
| 10240 | 118 µs | 122 µs | 364 µs | 4.5 KiB | 8,478 |

### `hashRequirementFields`

**Why we benchmark it.** It fingerprints the fields of a record that a policy requires, so a record that changed after review can be told from one that did not.

**What poor performance would mean.** Slower review checks for every record in proportion to how many fields a policy requires.

**Expected growth: O(n).** Each field's value is read once and the whole list is hashed once, so cost is proportional to the number of fields.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| fields | swept | The tier axis: fields hashed. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.8 µs | 15.6 µs | 13.4 µs | 3.7 KiB | 78,247 |
| 40 | 15.9 µs | 17.8 µs | 16.3 µs | 6.3 KiB | 62,897 |
| 80 | 26.2 µs | 27.6 µs | 85.3 µs | 11.7 KiB | 38,215 |
| 160 | 41.5 µs | 45.7 µs | 161 µs | 22.3 KiB | 24,068 |
| 320 | 70.7 µs | 83.5 µs | 241 µs | 45.0 KiB | 14,146 |
| 640 | 125 µs | 136 µs | 354 µs | 91.0 KiB | 7,999 |
| 1280 | 227 µs | 244 µs | 565 µs | 186.4 KiB | 4,397 |
| 2560 | 481 µs | 545 µs | 1.22 ms | 360.9 KiB | 2,077 |
| 5120 | 1.05 ms | 1.16 ms | 2.44 ms | 685.3 KiB | 951 |
| 10240 | 1.88 ms | 1.97 ms | 3.43 ms | 1.3 MiB | 533 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.95 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.42 ms | 1.42 ms | 73% |
| `load-exception-registry` | 1 | 402 µs | 402 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 128 µs | 6.6% |

**At 10240 entrys** (whole operation: 37.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 24.9 ms | 24.9 ms | 66% |
| `load-exception-registry` | 1 | 5.85 ms | 5.85 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 6.99 ms | 19% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-16T09:47:51.933Z` → `2026-11-16T09:48:44.509Z` (53 s), ci: CI (run 43839938121)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `840150fd8089014ee1ec83fa7c90c569c347f2d9` on `dependabot/npm_and_yarn/dev-dependencies-5419b902d4`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

