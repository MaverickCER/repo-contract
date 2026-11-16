# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.36 ms** per operation compared with a bare-minimum baseline (**235% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.36 ms | 24.0 ms |
| Added latency, relative to baseline | 235% | 391% |
| Added CPU time per operation | 1.40 ms | 24.4 ms |
| Added memory per operation (heap delta) | 1.6 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 738 ops/s | 42 ops/s |

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
| 20 | 32.6 µs | 143 µs | 110 µs | 338% | 112 µs | $0.00023 – $0.0013 |
| 40 | 48.0 µs | 219 µs | 170 µs | 354% | 171 µs | $0.00035 – $0.0019 |
| 80 | 78.5 µs | 367 µs | 286 µs | 364% | 293 µs | $0.00059 – $0.0033 |
| 160 | 142 µs | 590 µs | 446 µs | 315% | 1.86 ms | $0.00093 – $0.021 |
| 320 | 303 µs | 1.05 ms | 737 µs | 243% | 2.46 ms | $0.0015 – $0.028 |
| 640 | 578 µs | 1.93 ms | 1.36 ms | 235% | 1.40 ms | $0.0028 – $0.016 |
| 1280 | 939 µs | 3.53 ms | 2.59 ms | 276% | 2.61 ms | $0.0054 – $0.029 |
| 2560 | 1.67 ms | 6.93 ms | 5.26 ms | 315% | 5.31 ms | $0.011 – $0.060 |
| 5120 | 3.02 ms | 14.6 ms | 11.4 ms | 377% | 11.7 ms | $0.024 – $0.132 |
| 10240 | 6.14 ms | 30.1 ms | 24.0 ms | 391% | 24.4 ms | $0.050 – $0.274 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 277 µs | 2.92 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 43.2 µs | 1.05 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 316 µs | 4.50 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.23 ms | 21.0 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 22.7 ms | 372 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 106 µs | 3.16 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 44.1 ms | 697 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 22.9 ms | 371 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 54.5 µs | 2.53 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 8.54 µs | 99.6 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 108 µs | 1.66 ms |

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

**Measured: O(n)** (exponent 0.88, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 79.7 µs | 107 µs | 320 µs | 115.4 KiB | 12,548 |
| 40 | 51.7 µs | 58.1 µs | 189 µs | 98.1 KiB | 19,324 |
| 80 | 58.7 µs | 64.3 µs | 197 µs | 122.1 KiB | 17,033 |
| 160 | 73.0 µs | 78.0 µs | 224 µs | 158.4 KiB | 13,689 |
| 320 | 108 µs | 114 µs | 330 µs | 237.8 KiB | 9,225 |
| 640 | 277 µs | 383 µs | 1.03 ms | 656.2 KiB | 3,610 |
| 1280 | 367 µs | 393 µs | 859 µs | 1.0 MiB | 2,722 |
| 2560 | 686 µs | 712 µs | 1.36 ms | 2.1 MiB | 1,458 |
| 5120 | 1.49 ms | 1.55 ms | 2.76 ms | 4.3 MiB | 669 |
| 10240 | 2.92 ms | 3.19 ms | 4.02 ms | 8.6 MiB | 343 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.60 µs | 8.22 µs | 7.70 µs | 17.0 KiB | 131,631 |
| 40 | 7.89 µs | 8.63 µs | 16.6 µs | 16.3 KiB | 126,688 |
| 80 | 10.6 µs | 11.5 µs | 37.9 µs | 20.5 KiB | 94,209 |
| 160 | 14.8 µs | 15.9 µs | 58.9 µs | 28.6 KiB | 67,565 |
| 320 | 24.1 µs | 25.9 µs | 92.2 µs | 48.2 KiB | 41,524 |
| 640 | 43.2 µs | 45.2 µs | 138 µs | 86.6 KiB | 23,170 |
| 1280 | 86.6 µs | 89.1 µs | 261 µs | 169.1 KiB | 11,548 |
| 2560 | 191 µs | 199 µs | 610 µs | 329.7 KiB | 5,226 |
| 5120 | 466 µs | 499 µs | 1.38 ms | 634.3 KiB | 2,144 |
| 10240 | 1.05 ms | 1.12 ms | 3.20 ms | 1.3 MiB | 954 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.3 µs | 15.6 µs | 14.5 µs | 7.3 KiB | 69,695 |
| 40 | 23.9 µs | 25.4 µs | 81.7 µs | 13.2 KiB | 41,791 |
| 80 | 44.1 µs | 46.1 µs | 138 µs | 25.1 KiB | 22,682 |
| 160 | 85.9 µs | 96.0 µs | 255 µs | 48.9 KiB | 11,639 |
| 320 | 165 µs | 171 µs | 467 µs | 96.4 KiB | 6,048 |
| 640 | 316 µs | 330 µs | 825 µs | 191.5 KiB | 3,161 |
| 1280 | 624 µs | 656 µs | 1.42 ms | 381.6 KiB | 1,603 |
| 2560 | 1.33 ms | 1.52 ms | 3.05 ms | 761.9 KiB | 752 |
| 5120 | 2.74 ms | 2.92 ms | 4.57 ms | 1.5 MiB | 365 |
| 10240 | 4.50 ms | 5.07 ms | 6.66 ms | 3.0 MiB | 222 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.5 µs | 66.6 µs | 175 µs | 44.1 KiB | 18,032 |
| 40 | 90.2 µs | 101 µs | 304 µs | 83.0 KiB | 11,089 |
| 80 | 162 µs | 171 µs | 462 µs | 161.3 KiB | 6,156 |
| 160 | 306 µs | 330 µs | 807 µs | 318.6 KiB | 3,273 |
| 320 | 578 µs | 641 µs | 1.34 ms | 632.2 KiB | 1,730 |
| 640 | 1.23 ms | 1.34 ms | 2.75 ms | 1.2 MiB | 812 |
| 1280 | 2.50 ms | 2.78 ms | 4.23 ms | 2.5 MiB | 400 |
| 2560 | 4.38 ms | 4.54 ms | 6.13 ms | 4.9 MiB | 228 |
| 5120 | 8.94 ms | 9.16 ms | 11.0 ms | 9.8 MiB | 112 |
| 10240 | 21.0 ms | 21.5 ms | 23.5 ms | 19.7 MiB | 48 |

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
| 20 | 1.32 ms | 1.63 ms | 3.42 ms | 652.5 KiB | 758 |
| 40 | 1.62 ms | 2.34 ms | 3.15 ms | 1.3 MiB | 617 |
| 80 | 2.99 ms | 4.08 ms | 4.53 ms | 2.6 MiB | 334 |
| 160 | 5.87 ms | 7.29 ms | 7.49 ms | 5.3 MiB | 170 |
| 320 | 11.8 ms | 12.8 ms | 13.5 ms | 10.6 MiB | 85 |
| 640 | 22.7 ms | 22.9 ms | 24.5 ms | 21.4 MiB | 44 |
| 1280 | 45.2 ms | 46.6 ms | 47.7 ms | 43.7 MiB | 22 |
| 2560 | 91.4 ms | 93.0 ms | 94.5 ms | 25.9 MiB | 11 |
| 5120 | 185 ms | 188 ms | 195 ms | 54.2 MiB | 5 |
| 10240 | 372 ms | 379 ms | 383 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.16, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.75 µs | 8.34 µs | 4.88 µs | 7.4 KiB | 210,639 |
| 40 | 8.21 µs | 9.26 µs | 32.7 µs | 14.0 KiB | 121,808 |
| 80 | 14.9 µs | 17.0 µs | 55.1 µs | 27.3 KiB | 67,325 |
| 160 | 25.6 µs | 26.9 µs | 83.0 µs | 53.9 KiB | 39,002 |
| 320 | 49.1 µs | 54.0 µs | 152 µs | 107.0 KiB | 20,353 |
| 640 | 106 µs | 131 µs | 305 µs | 213.3 KiB | 9,433 |
| 1280 | 449 µs | 603 µs | 1.30 ms | 516.0 KiB | 2,229 |
| 2560 | 805 µs | 826 µs | 1.73 ms | 1.0 MiB | 1,242 |
| 5120 | 1.53 ms | 1.94 ms | 3.30 ms | 2.1 MiB | 654 |
| 10240 | 3.16 ms | 3.55 ms | 5.25 ms | 4.2 MiB | 316 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.66 ms | 1.84 ms | 3.62 ms | 1.2 MiB | 604 |
| 40 | 2.95 ms | 3.14 ms | 4.92 ms | 2.5 MiB | 339 |
| 80 | 5.76 ms | 6.41 ms | 7.80 ms | 5.0 MiB | 174 |
| 160 | 11.3 ms | 11.4 ms | 13.4 ms | 10.0 MiB | 89 |
| 320 | 22.3 ms | 22.4 ms | 24.5 ms | 20.0 MiB | 45 |
| 640 | 44.1 ms | 46.0 ms | 47.2 ms | 40.1 MiB | 23 |
| 1280 | 98.0 ms | 109 ms | 103 ms | 16.1 MiB | 10 |
| 2560 | 174 ms | 180 ms | 177 ms | 32.3 MiB | 6 |
| 5120 | 350 ms | 351 ms | 352 ms | 708.6 KiB | 3 |
| 10240 | 697 ms | 704 ms | 701 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 953 µs | 1.05 ms | 2.91 ms | 645.6 KiB | 1,049 |
| 40 | 1.65 ms | 1.80 ms | 3.60 ms | 1.3 MiB | 605 |
| 80 | 2.96 ms | 3.04 ms | 4.94 ms | 2.5 MiB | 337 |
| 160 | 5.83 ms | 6.39 ms | 7.82 ms | 5.2 MiB | 172 |
| 320 | 11.5 ms | 11.7 ms | 13.5 ms | 10.6 MiB | 87 |
| 640 | 22.9 ms | 23.3 ms | 25.2 ms | 21.4 MiB | 44 |
| 1280 | 51.4 ms | 52.3 ms | 54.4 ms | 43.6 MiB | 19 |
| 2560 | 92.6 ms | 95.5 ms | 95.6 ms | 25.7 MiB | 11 |
| 5120 | 186 ms | 186 ms | 190 ms | 53.9 MiB | 5 |
| 10240 | 371 ms | 372 ms | 376 ms | 46.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.31, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.79 µs | 8.16 µs | 3.91 µs | 9.3 KiB | 264,134 |
| 40 | 4.82 µs | 6.35 µs | 7.20 µs | 8.4 KiB | 207,301 |
| 80 | 8.68 µs | 9.04 µs | 33.3 µs | 16.2 KiB | 115,183 |
| 160 | 15.2 µs | 15.9 µs | 53.2 µs | 31.8 KiB | 65,936 |
| 320 | 29.2 µs | 30.1 µs | 96.5 µs | 63.1 KiB | 34,304 |
| 640 | 54.5 µs | 58.5 µs | 165 µs | 127.6 KiB | 18,359 |
| 1280 | 296 µs | 301 µs | 793 µs | 352.8 KiB | 3,373 |
| 2560 | 589 µs | 602 µs | 1.40 ms | 694.2 KiB | 1,697 |
| 5120 | 1.23 ms | 1.27 ms | 2.89 ms | 1.3 MiB | 810 |
| 10240 | 2.53 ms | 2.61 ms | 4.36 ms | 2.7 MiB | 395 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.89, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.66 µs | 2.84 µs | 2.68 µs | 4.5 KiB | 376,403 |
| 40 | 3.03 µs | 3.26 µs | 3.07 µs | 4.5 KiB | 330,518 |
| 80 | 3.37 µs | 3.61 µs | 3.40 µs | 4.5 KiB | 296,713 |
| 160 | 4.16 µs | 4.41 µs | 4.20 µs | 4.5 KiB | 240,197 |
| 320 | 5.82 µs | 6.08 µs | 12.3 µs | 4.5 KiB | 171,939 |
| 640 | 8.54 µs | 8.89 µs | 33.0 µs | 4.5 KiB | 117,140 |
| 1280 | 14.3 µs | 15.0 µs | 51.9 µs | 4.5 KiB | 69,836 |
| 2560 | 25.6 µs | 26.6 µs | 83.6 µs | 4.5 KiB | 39,045 |
| 5120 | 48.8 µs | 52.1 µs | 150 µs | 4.5 KiB | 20,490 |
| 10240 | 99.6 µs | 110 µs | 310 µs | 4.5 KiB | 10,044 |

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
| 20 | 9.21 µs | 11.8 µs | 9.44 µs | 3.7 KiB | 108,559 |
| 40 | 12.6 µs | 14.7 µs | 12.8 µs | 6.3 KiB | 79,481 |
| 80 | 20.3 µs | 22.8 µs | 20.6 µs | 11.6 KiB | 49,155 |
| 160 | 35.4 µs | 38.4 µs | 115 µs | 22.3 KiB | 28,215 |
| 320 | 63.3 µs | 67.0 µs | 232 µs | 44.8 KiB | 15,798 |
| 640 | 108 µs | 117 µs | 334 µs | 90.3 KiB | 9,222 |
| 1280 | 212 µs | 228 µs | 601 µs | 186.4 KiB | 4,707 |
| 2560 | 423 µs | 462 µs | 1.25 ms | 360.9 KiB | 2,365 |
| 5120 | 953 µs | 989 µs | 2.65 ms | 685.3 KiB | 1,049 |
| 10240 | 1.66 ms | 1.72 ms | 3.39 ms | 1.3 MiB | 601 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.93 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.23 ms | 1.23 ms | 64% |
| `load-exception-registry` | 1 | 316 µs | 316 µs | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 381 µs | 20% |

**At 10240 entrys** (whole operation: 30.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 21.0 ms | 21.0 ms | 70% |
| `load-exception-registry` | 1 | 4.50 ms | 4.50 ms | 15% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.60 ms | 15% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-16T07:22:36.242Z` → `2026-11-16T07:23:25.125Z` (49 s), ci: CI (run 43821281531)
- Machine: Intel(R) Xeon(R) 6973P-C, 4 logical core(s) (2 physical), 15982 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `9ed6892d1b5d84763183988768b29c47b99889cc` on `chore/bump-internal-package-contract-v0.20.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

