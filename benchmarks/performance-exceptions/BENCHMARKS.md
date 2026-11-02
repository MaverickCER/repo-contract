# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.75 ms** per operation compared with a bare-minimum baseline (**258% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.75 ms | 31.8 ms |
| Added latency, relative to baseline | 258% | 306% |
| Added CPU time per operation | 2.56 ms | 31.7 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 571 ops/s | 31 ops/s |

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
| 20 | 29.5 µs | 134 µs | 104 µs | 353% | 403 µs | $0.00022 – $0.0045 |
| 40 | 50.5 µs | 196 µs | 145 µs | 288% | 417 µs | $0.0003 – $0.0047 |
| 80 | 95.3 µs | 346 µs | 250 µs | 263% | 578 µs | $0.00052 – $0.0065 |
| 160 | 191 µs | 625 µs | 435 µs | 228% | 806 µs | $0.00091 – $0.0091 |
| 320 | 353 µs | 1.25 ms | 894 µs | 253% | 1.94 ms | $0.0019 – $0.022 |
| 640 | 680 µs | 2.43 ms | 1.75 ms | 258% | 2.56 ms | $0.0037 – $0.029 |
| 1280 | 1.36 ms | 4.65 ms | 3.28 ms | 241% | 3.35 ms | $0.0068 – $0.038 |
| 2560 | 2.58 ms | 9.10 ms | 6.52 ms | 253% | 6.42 ms | $0.014 – $0.072 |
| 5120 | 5.15 ms | 18.5 ms | 13.3 ms | 259% | 13.5 ms | $0.028 – $0.152 |
| 10240 | 10.4 ms | 42.2 ms | 31.8 ms | 306% | 31.7 ms | $0.066 – $0.357 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 379 µs | 4.38 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 59.6 µs | 1.45 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 557 µs | 7.65 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.81 ms | 31.0 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 37.7 ms | 591 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 139 µs | 4.38 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 71.2 ms | 1.12 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 36.0 ms | 587 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 79.0 µs | 3.68 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.3 µs | 147 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 163 µs | 2.38 ms |

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

**Measured: O(n)** (exponent 0.90, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 107 µs | 125 µs | 377 µs | 115.4 KiB | 9,327 |
| 40 | 72.8 µs | 93.0 µs | 273 µs | 98.8 KiB | 13,733 |
| 80 | 78.2 µs | 83.1 µs | 256 µs | 120.8 KiB | 12,785 |
| 160 | 105 µs | 108 µs | 334 µs | 159.3 KiB | 9,568 |
| 320 | 157 µs | 180 µs | 477 µs | 237.4 KiB | 6,385 |
| 640 | 379 µs | 545 µs | 1.15 ms | 656.2 KiB | 2,638 |
| 1280 | 538 µs | 552 µs | 1.34 ms | 1.0 MiB | 1,859 |
| 2560 | 1.06 ms | 1.10 ms | 2.64 ms | 2.1 MiB | 940 |
| 5120 | 2.12 ms | 2.15 ms | 3.36 ms | 4.3 MiB | 472 |
| 10240 | 4.38 ms | 4.46 ms | 5.70 ms | 8.6 MiB | 228 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.0 µs | 11.5 µs | 44.2 µs | 17.0 KiB | 90,965 |
| 40 | 11.6 µs | 12.1 µs | 47.9 µs | 16.3 KiB | 86,001 |
| 80 | 14.8 µs | 15.4 µs | 58.2 µs | 20.5 KiB | 67,767 |
| 160 | 21.0 µs | 22.1 µs | 77.3 µs | 28.6 KiB | 47,620 |
| 320 | 33.3 µs | 34.4 µs | 116 µs | 48.2 KiB | 30,006 |
| 640 | 59.6 µs | 62.6 µs | 192 µs | 86.8 KiB | 16,788 |
| 1280 | 124 µs | 135 µs | 397 µs | 168.3 KiB | 8,033 |
| 2560 | 238 µs | 245 µs | 672 µs | 329.7 KiB | 4,200 |
| 5120 | 644 µs | 657 µs | 1.59 ms | 634.3 KiB | 1,553 |
| 10240 | 1.45 ms | 1.48 ms | 3.71 ms | 1.3 MiB | 687 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 24.1 µs | 25.2 µs | 98.9 µs | 7.3 KiB | 41,495 |
| 40 | 39.7 µs | 40.7 µs | 126 µs | 13.2 KiB | 25,198 |
| 80 | 76.5 µs | 79.7 µs | 233 µs | 25.1 KiB | 13,067 |
| 160 | 148 µs | 152 µs | 413 µs | 48.9 KiB | 6,765 |
| 320 | 297 µs | 301 µs | 822 µs | 96.5 KiB | 3,362 |
| 640 | 557 µs | 569 µs | 1.35 ms | 191.6 KiB | 1,794 |
| 1280 | 1.03 ms | 1.05 ms | 1.84 ms | 381.6 KiB | 975 |
| 2560 | 2.07 ms | 2.54 ms | 3.84 ms | 761.9 KiB | 482 |
| 5120 | 4.82 ms | 5.06 ms | 6.76 ms | 1.5 MiB | 208 |
| 10240 | 7.65 ms | 9.34 ms | 9.96 ms | 3.0 MiB | 131 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 81.3 µs | 92.5 µs | 307 µs | 44.3 KiB | 12,304 |
| 40 | 140 µs | 159 µs | 455 µs | 83.3 KiB | 7,156 |
| 80 | 265 µs | 316 µs | 791 µs | 161.9 KiB | 3,778 |
| 160 | 483 µs | 515 µs | 1.27 ms | 319.5 KiB | 2,069 |
| 320 | 840 µs | 890 µs | 1.63 ms | 632.2 KiB | 1,190 |
| 640 | 1.81 ms | 1.90 ms | 3.41 ms | 1.2 MiB | 552 |
| 1280 | 3.36 ms | 3.46 ms | 5.03 ms | 2.5 MiB | 298 |
| 2560 | 6.57 ms | 6.66 ms | 8.42 ms | 4.9 MiB | 152 |
| 5120 | 13.0 ms | 13.1 ms | 15.2 ms | 9.8 MiB | 77 |
| 10240 | 31.0 ms | 31.7 ms | 33.7 ms | 19.7 MiB | 32 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.91 ms | 2.29 ms | 4.26 ms | 652.5 KiB | 525 |
| 40 | 2.53 ms | 3.59 ms | 4.14 ms | 1.3 MiB | 395 |
| 80 | 4.84 ms | 6.22 ms | 6.45 ms | 2.6 MiB | 207 |
| 160 | 9.41 ms | 11.2 ms | 11.0 ms | 5.3 MiB | 106 |
| 320 | 18.5 ms | 19.8 ms | 20.4 ms | 10.6 MiB | 54 |
| 640 | 37.7 ms | 38.5 ms | 42.8 ms | 21.5 MiB | 27 |
| 1280 | 73.1 ms | 74.2 ms | 75.5 ms | 43.7 MiB | 14 |
| 2560 | 146 ms | 147 ms | 149 ms | 25.9 MiB | 7 |
| 5120 | 296 ms | 298 ms | 306 ms | 54.3 MiB | 3 |
| 10240 | 591 ms | 597 ms | 603 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.01 µs | 8.67 µs | 7.53 µs | 7.4 KiB | 142,666 |
| 40 | 11.3 µs | 12.0 µs | 42.4 µs | 14.0 KiB | 88,510 |
| 80 | 20.8 µs | 24.3 µs | 70.5 µs | 27.3 KiB | 48,187 |
| 160 | 37.9 µs | 44.3 µs | 122 µs | 53.9 KiB | 26,404 |
| 320 | 74.6 µs | 83.6 µs | 235 µs | 107.0 KiB | 13,399 |
| 640 | 139 µs | 150 µs | 407 µs | 213.3 KiB | 7,205 |
| 1280 | 521 µs | 560 µs | 1.35 ms | 516.0 KiB | 1,918 |
| 2560 | 1.05 ms | 1.10 ms | 2.71 ms | 1.0 MiB | 952 |
| 5120 | 2.13 ms | 2.27 ms | 3.83 ms | 2.1 MiB | 469 |
| 10240 | 4.38 ms | 4.55 ms | 6.60 ms | 4.2 MiB | 228 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.59 ms | 2.65 ms | 4.65 ms | 1.2 MiB | 386 |
| 40 | 4.78 ms | 4.88 ms | 6.83 ms | 2.5 MiB | 209 |
| 80 | 9.18 ms | 9.28 ms | 11.3 ms | 5.0 MiB | 109 |
| 160 | 18.1 ms | 23.8 ms | 20.2 ms | 10.0 MiB | 55 |
| 320 | 35.6 ms | 35.8 ms | 37.9 ms | 20.0 MiB | 28 |
| 640 | 71.2 ms | 71.4 ms | 73.8 ms | 40.1 MiB | 14 |
| 1280 | 142 ms | 143 ms | 145 ms | 16.1 MiB | 7 |
| 2560 | 281 ms | 281 ms | 284 ms | 32.3 MiB | 4 |
| 5120 | 561 ms | 565 ms | 564 ms | 707.4 KiB | 2 |
| 10240 | 1.12 s | 1.13 s | 1.12 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.46 ms | 1.58 ms | 3.51 ms | 645.6 KiB | 683 |
| 40 | 2.57 ms | 2.59 ms | 4.64 ms | 1.3 MiB | 389 |
| 80 | 4.75 ms | 4.82 ms | 6.83 ms | 2.5 MiB | 211 |
| 160 | 9.16 ms | 9.22 ms | 11.3 ms | 5.2 MiB | 109 |
| 320 | 18.0 ms | 18.2 ms | 20.2 ms | 10.6 MiB | 55 |
| 640 | 36.0 ms | 36.0 ms | 38.2 ms | 21.4 MiB | 28 |
| 1280 | 72.1 ms | 72.2 ms | 74.5 ms | 43.6 MiB | 14 |
| 2560 | 145 ms | 146 ms | 148 ms | 25.7 MiB | 7 |
| 5120 | 292 ms | 293 ms | 296 ms | 53.9 MiB | 3 |
| 10240 | 587 ms | 617 ms | 592 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.31, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.39 µs | 13.7 µs | 5.57 µs | 9.3 KiB | 185,611 |
| 40 | 7.35 µs | 8.73 µs | 29.5 µs | 8.4 KiB | 136,040 |
| 80 | 11.9 µs | 12.4 µs | 43.1 µs | 16.2 KiB | 83,902 |
| 160 | 21.9 µs | 22.8 µs | 74.3 µs | 31.8 KiB | 45,623 |
| 320 | 35.7 µs | 36.7 µs | 87.8 µs | 63.1 KiB | 27,978 |
| 640 | 79.0 µs | 81.7 µs | 241 µs | 127.5 KiB | 12,652 |
| 1280 | 441 µs | 451 µs | 1.27 ms | 340.8 KiB | 2,268 |
| 2560 | 796 µs | 809 µs | 1.64 ms | 694.2 KiB | 1,257 |
| 5120 | 1.78 ms | 1.81 ms | 3.55 ms | 1.3 MiB | 560 |
| 10240 | 3.68 ms | 3.72 ms | 5.66 ms | 2.7 MiB | 272 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.15 µs | 4.35 µs | 4.19 µs | 4.5 KiB | 241,157 |
| 40 | 4.49 µs | 4.68 µs | 4.54 µs | 4.5 KiB | 222,574 |
| 80 | 5.12 µs | 5.37 µs | 14.9 µs | 4.5 KiB | 195,213 |
| 160 | 6.29 µs | 6.58 µs | 26.0 µs | 4.5 KiB | 158,916 |
| 320 | 8.95 µs | 9.27 µs | 35.4 µs | 4.5 KiB | 111,755 |
| 640 | 13.3 µs | 13.8 µs | 47.6 µs | 4.5 KiB | 75,452 |
| 1280 | 22.4 µs | 23.2 µs | 74.3 µs | 4.5 KiB | 44,569 |
| 2560 | 39.7 µs | 41.3 µs | 122 µs | 4.5 KiB | 25,220 |
| 5120 | 76.4 µs | 78.3 µs | 232 µs | 4.5 KiB | 13,082 |
| 10240 | 147 µs | 153 µs | 435 µs | 4.5 KiB | 6,804 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.8 µs | 15.4 µs | 13.1 µs | 3.7 KiB | 78,129 |
| 40 | 18.5 µs | 20.1 µs | 18.8 µs | 6.3 KiB | 53,985 |
| 80 | 32.5 µs | 35.2 µs | 32.9 µs | 11.7 KiB | 30,806 |
| 160 | 53.4 µs | 57.5 µs | 215 µs | 22.4 KiB | 18,713 |
| 320 | 98.5 µs | 110 µs | 368 µs | 45.6 KiB | 10,156 |
| 640 | 163 µs | 186 µs | 491 µs | 92.1 KiB | 6,142 |
| 1280 | 306 µs | 335 µs | 857 µs | 191.5 KiB | 3,268 |
| 2560 | 597 µs | 646 µs | 1.50 ms | 360.8 KiB | 1,676 |
| 5120 | 1.33 ms | 1.44 ms | 3.03 ms | 685.3 KiB | 753 |
| 10240 | 2.38 ms | 2.44 ms | 4.21 ms | 1.3 MiB | 421 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.43 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.81 ms | 1.81 ms | 75% |
| `load-exception-registry` | 1 | 557 µs | 557 µs | 23% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 61.9 µs | 2.5% |

**At 10240 entrys** (whole operation: 42.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 31.0 ms | 31.0 ms | 73% |
| `load-exception-registry` | 1 | 7.65 ms | 7.65 ms | 18% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.60 ms | 8.5% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T22:31:47.994Z` → `2026-11-02T22:32:52.707Z` (65 s), ci: CI (run 41535281642)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `818eb8dd569874b8e9e0fabe99cd5c0ab52dce36` on `chore/deps-sync`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

