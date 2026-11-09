# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.12 ms** per operation compared with a bare-minimum baseline (**315% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.12 ms | 19.3 ms |
| Added latency, relative to baseline | 315% | 322% |
| Added CPU time per operation | 1.85 ms | 19.0 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 892 ops/s | 52 ops/s |

## 1. End-to-end: the package's total impact

Shows what a check pays, once per run, to read an exception registry, reconcile it with what the check found and write it back, compared with the bare minimum of parsing the file and matching ids by hand. It is pure in-memory work, paid by every check that keeps a registry.

- **Baseline (no package):** Parse the registry JSON and match each finding to a record by id with a Map -- the least anyone would do.
- **With the package:** `loadExceptionRegistry` reads the registry, `reconcileExceptions` matches the findings and `writeExceptionRegistry` serializes it back.

Both sides use empty or minimal functions on purpose, so the difference is the package's own cost -- not the cost of the work an application would plug into it. Real applications add their own work on top; this is the floor the package imposes.

**Variables that could change this result**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| entries | swept | The tier axis: how many entries the main input holds (records, findings, rules, fields or classifications, as each function says). |
| filesystem | fixed at "an in-memory stand-in" | A real disk adds its own latency; the benchmark isolates the package's own work, as the standard asks (no real I/O). |
| runtime | fixed at "Node (V8)" | Measured on Node only. |
| match rate | fixed at "every finding matches a record" | A registry with stale or new entries does a little more work. |

The baseline is an empty or minimal function, so it costs almost nothing and the _relative_ overhead can look enormous (shown as a multiple of the baseline). Read the absolute columns -- time, CPU and dollars added -- they are what a bill and a latency budget are made of.

| entrys | Baseline | With package | Added | Added vs baseline | Added CPU | Est. $ / 1M ops |
| --- | --- | --- | --- | --- | --- | --- |
| 20 | 16.7 µs | 81.3 µs | 64.6 µs | 386% | 264 µs | $0.00013 – $0.003 |
| 40 | 25.7 µs | 109 µs | 83.2 µs | 324% | 238 µs | $0.00017 – $0.0027 |
| 80 | 49.0 µs | 183 µs | 134 µs | 272% | 302 µs | $0.00028 – $0.0034 |
| 160 | 95.8 µs | 322 µs | 227 µs | 236% | 398 µs | $0.00047 – $0.0045 |
| 320 | 186 µs | 657 µs | 471 µs | 253% | 731 µs | $0.00098 – $0.0082 |
| 640 | 356 µs | 1.48 ms | 1.12 ms | 315% | 1.85 ms | $0.0023 – $0.021 |
| 1280 | 714 µs | 2.77 ms | 2.06 ms | 288% | 2.65 ms | $0.0043 – $0.030 |
| 2560 | 1.46 ms | 5.45 ms | 3.99 ms | 274% | 4.32 ms | $0.0083 – $0.049 |
| 5120 | 2.90 ms | 11.0 ms | 8.08 ms | 279% | 8.60 ms | $0.017 – $0.097 |
| 10240 | 6.00 ms | 25.3 ms | 19.3 ms | 322% | 19.0 ms | $0.040 – $0.214 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 229 µs | 2.67 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 33.6 µs | 852 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 287 µs | 4.01 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.04 ms | 17.9 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 19.7 ms | 343 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 71.3 µs | 2.62 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 38.0 ms | 612 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 19.5 ms | 321 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 40.0 µs | 2.17 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 6.29 µs | 65.6 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 80.6 µs | 1.33 ms |

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

**Measured: O(n)** (exponent 0.92, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 64.6 µs | 76.9 µs | 216 µs | 117.8 KiB | 15,472 |
| 40 | 40.1 µs | 43.1 µs | 111 µs | 97.5 KiB | 24,967 |
| 80 | 46.8 µs | 48.5 µs | 129 µs | 123.0 KiB | 21,377 |
| 160 | 60.5 µs | 62.3 µs | 156 µs | 158.2 KiB | 16,525 |
| 320 | 89.2 µs | 95.6 µs | 223 µs | 239.2 KiB | 11,212 |
| 640 | 229 µs | 305 µs | 739 µs | 656.2 KiB | 4,360 |
| 1280 | 309 µs | 318 µs | 670 µs | 1.0 MiB | 3,238 |
| 2560 | 587 µs | 611 µs | 1.12 ms | 2.1 MiB | 1,702 |
| 5120 | 1.34 ms | 1.41 ms | 2.35 ms | 4.3 MiB | 745 |
| 10240 | 2.67 ms | 2.82 ms | 3.69 ms | 8.6 MiB | 375 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.81 µs | 7.13 µs | 21.7 µs | 17.0 KiB | 146,884 |
| 40 | 6.36 µs | 6.91 µs | 23.5 µs | 16.3 KiB | 157,138 |
| 80 | 8.16 µs | 9.13 µs | 28.6 µs | 20.5 KiB | 122,541 |
| 160 | 11.2 µs | 11.8 µs | 34.6 µs | 28.6 KiB | 89,397 |
| 320 | 18.6 µs | 20.0 µs | 53.1 µs | 48.3 KiB | 53,695 |
| 640 | 33.6 µs | 34.8 µs | 85.2 µs | 86.6 KiB | 29,779 |
| 1280 | 64.5 µs | 66.3 µs | 160 µs | 171.0 KiB | 15,505 |
| 2560 | 139 µs | 142 µs | 321 µs | 338.6 KiB | 7,215 |
| 5120 | 415 µs | 439 µs | 1.03 ms | 634.3 KiB | 2,410 |
| 10240 | 852 µs | 880 µs | 1.60 ms | 1.3 MiB | 1,174 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.0 µs | 15.9 µs | 14.1 µs | 7.3 KiB | 71,653 |
| 40 | 19.6 µs | 20.4 µs | 52.1 µs | 13.2 KiB | 51,044 |
| 80 | 37.5 µs | 39.2 µs | 93.9 µs | 25.1 KiB | 26,654 |
| 160 | 75.2 µs | 79.5 µs | 195 µs | 48.9 KiB | 13,298 |
| 320 | 150 µs | 157 µs | 364 µs | 96.4 KiB | 6,685 |
| 640 | 287 µs | 298 µs | 633 µs | 191.5 KiB | 3,489 |
| 1280 | 544 µs | 566 µs | 1.08 ms | 381.6 KiB | 1,837 |
| 2560 | 1.17 ms | 1.42 ms | 2.36 ms | 761.9 KiB | 855 |
| 5120 | 2.62 ms | 2.80 ms | 3.93 ms | 1.5 MiB | 382 |
| 10240 | 4.01 ms | 4.15 ms | 5.70 ms | 3.0 MiB | 249 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 48.8 µs | 56.6 µs | 197 µs | 44.3 KiB | 20,490 |
| 40 | 69.3 µs | 79.0 µs | 181 µs | 82.8 KiB | 14,426 |
| 80 | 129 µs | 138 µs | 297 µs | 161.1 KiB | 7,740 |
| 160 | 261 µs | 271 µs | 603 µs | 318.6 KiB | 3,829 |
| 320 | 492 µs | 511 µs | 1.00 ms | 632.2 KiB | 2,033 |
| 640 | 1.04 ms | 1.16 ms | 2.05 ms | 1.2 MiB | 961 |
| 1280 | 1.91 ms | 2.01 ms | 2.94 ms | 2.5 MiB | 523 |
| 2560 | 3.75 ms | 3.90 ms | 4.98 ms | 4.9 MiB | 267 |
| 5120 | 7.79 ms | 7.91 ms | 9.42 ms | 9.8 MiB | 128 |
| 10240 | 17.9 ms | 18.4 ms | 20.0 ms | 19.7 MiB | 56 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.13 ms | 1.38 ms | 2.71 ms | 652.5 KiB | 883 |
| 40 | 1.44 ms | 2.06 ms | 2.46 ms | 1.3 MiB | 695 |
| 80 | 2.72 ms | 3.52 ms | 3.78 ms | 2.6 MiB | 367 |
| 160 | 5.26 ms | 7.43 ms | 6.42 ms | 5.2 MiB | 190 |
| 320 | 10.5 ms | 12.9 ms | 11.7 ms | 10.6 MiB | 95 |
| 640 | 19.7 ms | 23.7 ms | 21.3 ms | 21.4 MiB | 51 |
| 1280 | 38.2 ms | 41.9 ms | 40.4 ms | 43.7 MiB | 26 |
| 2560 | 85.3 ms | 120 ms | 93.7 ms | 25.9 MiB | 12 |
| 5120 | 169 ms | 198 ms | 179 ms | 54.2 MiB | 6 |
| 10240 | 343 ms | 348 ms | 354 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.25, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.99 µs | 4.95 µs | 4.07 µs | 7.4 KiB | 250,323 |
| 40 | 5.68 µs | 7.20 µs | 18.5 µs | 14.0 KiB | 175,971 |
| 80 | 10.2 µs | 13.4 µs | 29.9 µs | 27.3 KiB | 97,966 |
| 160 | 19.5 µs | 25.8 µs | 54.4 µs | 53.9 KiB | 51,243 |
| 320 | 37.7 µs | 45.5 µs | 102 µs | 107.0 KiB | 26,528 |
| 640 | 71.3 µs | 81.2 µs | 179 µs | 213.3 KiB | 14,035 |
| 1280 | 289 µs | 328 µs | 650 µs | 515.9 KiB | 3,466 |
| 2560 | 570 µs | 595 µs | 1.20 ms | 1.0 MiB | 1,755 |
| 5120 | 1.26 ms | 1.31 ms | 2.38 ms | 2.1 MiB | 796 |
| 10240 | 2.62 ms | 3.15 ms | 3.97 ms | 4.2 MiB | 382 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.43 ms | 1.50 ms | 2.83 ms | 1.2 MiB | 699 |
| 40 | 2.59 ms | 2.80 ms | 4.01 ms | 2.5 MiB | 386 |
| 80 | 4.93 ms | 5.03 ms | 6.47 ms | 5.0 MiB | 203 |
| 160 | 9.70 ms | 9.82 ms | 11.6 ms | 10.0 MiB | 103 |
| 320 | 19.2 ms | 20.1 ms | 21.3 ms | 20.0 MiB | 52 |
| 640 | 38.0 ms | 41.6 ms | 40.0 ms | 40.1 MiB | 26 |
| 1280 | 76.4 ms | 76.9 ms | 78.6 ms | 16.1 MiB | 13 |
| 2560 | 156 ms | 157 ms | 158 ms | 32.3 MiB | 6 |
| 5120 | 294 ms | 297 ms | 296 ms | 708.6 KiB | 3 |
| 10240 | 612 ms | 615 ms | 615 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 734 µs | 756 µs | 1.48 ms | 643.3 KiB | 1,362 |
| 40 | 1.41 ms | 1.51 ms | 2.82 ms | 1.3 MiB | 707 |
| 80 | 2.61 ms | 2.73 ms | 4.24 ms | 2.5 MiB | 383 |
| 160 | 5.01 ms | 5.12 ms | 6.60 ms | 5.2 MiB | 199 |
| 320 | 9.87 ms | 10.3 ms | 11.8 ms | 10.6 MiB | 101 |
| 640 | 19.5 ms | 20.3 ms | 21.4 ms | 21.4 MiB | 51 |
| 1280 | 40.1 ms | 41.3 ms | 42.3 ms | 43.6 MiB | 25 |
| 2560 | 78.7 ms | 81.1 ms | 81.1 ms | 25.7 MiB | 13 |
| 5120 | 157 ms | 163 ms | 160 ms | 53.9 MiB | 6 |
| 10240 | 321 ms | 325 ms | 324 ms | 46.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.37, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.04 µs | 7.36 µs | 3.10 µs | 9.3 KiB | 329,066 |
| 40 | 3.32 µs | 3.94 µs | 11.4 µs | 8.4 KiB | 300,902 |
| 80 | 5.75 µs | 6.42 µs | 17.2 µs | 16.2 KiB | 173,986 |
| 160 | 11.1 µs | 11.7 µs | 33.2 µs | 31.8 KiB | 90,018 |
| 320 | 20.5 µs | 21.3 µs | 53.7 µs | 63.1 KiB | 48,786 |
| 640 | 40.0 µs | 42.1 µs | 101 µs | 127.8 KiB | 24,992 |
| 1280 | 238 µs | 249 µs | 592 µs | 352.8 KiB | 4,195 |
| 2560 | 479 µs | 485 µs | 1.03 ms | 694.2 KiB | 2,090 |
| 5120 | 1.06 ms | 1.10 ms | 2.16 ms | 1.3 MiB | 946 |
| 10240 | 2.17 ms | 2.24 ms | 3.39 ms | 2.7 MiB | 460 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.84, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.22 µs | 2.36 µs | 9.12 µs | 4.5 KiB | 449,916 |
| 40 | 2.13 µs | 2.27 µs | 8.01 µs | 4.5 KiB | 469,954 |
| 80 | 2.46 µs | 2.58 µs | 8.97 µs | 4.5 KiB | 407,202 |
| 160 | 3.07 µs | 3.21 µs | 10.2 µs | 4.5 KiB | 325,981 |
| 320 | 4.22 µs | 4.44 µs | 13.8 µs | 4.5 KiB | 237,175 |
| 640 | 6.29 µs | 6.62 µs | 19.0 µs | 4.5 KiB | 158,857 |
| 1280 | 10.7 µs | 11.1 µs | 31.0 µs | 4.5 KiB | 93,589 |
| 2560 | 17.9 µs | 19.0 µs | 46.6 µs | 4.5 KiB | 55,912 |
| 5120 | 34.3 µs | 37.6 µs | 91.2 µs | 4.5 KiB | 29,155 |
| 10240 | 65.6 µs | 71.5 µs | 173 µs | 4.5 KiB | 15,247 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.12 µs | 7.08 µs | 6.22 µs | 3.6 KiB | 163,431 |
| 40 | 9.17 µs | 10.1 µs | 19.5 µs | 6.2 KiB | 109,048 |
| 80 | 14.8 µs | 15.6 µs | 55.6 µs | 11.6 KiB | 67,527 |
| 160 | 23.2 µs | 24.6 µs | 74.8 µs | 22.2 KiB | 43,161 |
| 320 | 44.3 µs | 47.4 µs | 133 µs | 44.5 KiB | 22,596 |
| 640 | 80.6 µs | 98.7 µs | 212 µs | 89.7 KiB | 12,409 |
| 1280 | 153 µs | 175 µs | 376 µs | 183.3 KiB | 6,526 |
| 2560 | 319 µs | 492 µs | 719 µs | 382.2 KiB | 3,138 |
| 5120 | 632 µs | 667 µs | 1.22 ms | 643.1 KiB | 1,583 |
| 10240 | 1.33 ms | 1.42 ms | 2.52 ms | 1.3 MiB | 751 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.48 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.04 ms | 1.04 ms | 70% |
| `load-exception-registry` | 1 | 287 µs | 287 µs | 19% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 149 µs | 10% |

**At 10240 entrys** (whole operation: 25.3 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 17.9 ms | 17.9 ms | 71% |
| `load-exception-registry` | 1 | 4.01 ms | 4.01 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.39 ms | 13% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-09T20:15:34.039Z` → `2026-11-09T20:16:17.157Z` (43 s), ci: CI (run 42688972549)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `6a44026fb94c96831f0f0a3fd88fd58afb21b25c` on `chore/bump-internal-package-contract-v0.16.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

