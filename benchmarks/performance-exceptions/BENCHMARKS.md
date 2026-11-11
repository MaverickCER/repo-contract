# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.82 ms** per operation compared with a bare-minimum baseline (**261% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 – $0.1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.82 ms | 31.7 ms |
| Added latency, relative to baseline | 261% | 272% |
| Added CPU time per operation | 2.81 ms | 31.3 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 – $0.1 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 548 ops/s | 32 ops/s |

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
| 20 | 31.4 µs | 134 µs | 103 µs | 328% | 378 µs | $0.00021 – $0.0043 |
| 40 | 54.5 µs | 198 µs | 144 µs | 264% | 403 µs | $0.0003 – $0.0045 |
| 80 | 104 µs | 354 µs | 251 µs | 242% | 549 µs | $0.00052 – $0.0062 |
| 160 | 199 µs | 646 µs | 447 µs | 225% | 837 µs | $0.00093 – $0.0094 |
| 320 | 398 µs | 1.28 ms | 878 µs | 221% | 1.78 ms | $0.0018 – $0.020 |
| 640 | 699 µs | 2.52 ms | 1.82 ms | 261% | 2.81 ms | $0.0038 – $0.032 |
| 1280 | 1.41 ms | 4.87 ms | 3.45 ms | 244% | 3.70 ms | $0.0072 – $0.042 |
| 2560 | 2.75 ms | 9.53 ms | 6.79 ms | 247% | 7.00 ms | $0.014 – $0.079 |
| 5120 | 5.71 ms | 19.0 ms | 13.2 ms | 232% | 13.1 ms | $0.028 – $0.147 |
| 10240 | 11.7 ms | 43.4 ms | 31.7 ms | 272% | 31.3 ms | $0.066 – $0.352 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 393 µs | 4.44 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 63.7 µs | 1.46 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 568 µs | 7.83 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.77 ms | 31.0 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 39.9 ms | 600 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 141 µs | 4.72 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 71.1 ms | 1.13 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 36.3 ms | 593 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 85.5 µs | 4.00 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.2 µs | 157 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 165 µs | 2.39 ms |

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
| 20 | 109 µs | 163 µs | 383 µs | 115.4 KiB | 9,193 |
| 40 | 69.1 µs | 75.6 µs | 232 µs | 98.1 KiB | 14,468 |
| 80 | 81.6 µs | 91.3 µs | 261 µs | 120.8 KiB | 12,253 |
| 160 | 111 µs | 123 µs | 345 µs | 159.3 KiB | 9,040 |
| 320 | 161 µs | 167 µs | 486 µs | 237.4 KiB | 6,195 |
| 640 | 393 µs | 554 µs | 1.18 ms | 656.2 KiB | 2,542 |
| 1280 | 577 µs | 593 µs | 1.41 ms | 1.0 MiB | 1,735 |
| 2560 | 1.12 ms | 1.16 ms | 2.75 ms | 2.1 MiB | 897 |
| 5120 | 2.30 ms | 2.37 ms | 3.91 ms | 4.3 MiB | 435 |
| 10240 | 4.44 ms | 4.75 ms | 5.25 ms | 8.6 MiB | 225 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.1 µs | 11.6 µs | 45.7 µs | 17.0 KiB | 90,303 |
| 40 | 11.6 µs | 12.4 µs | 46.3 µs | 16.3 KiB | 85,961 |
| 80 | 14.8 µs | 15.8 µs | 56.7 µs | 20.5 KiB | 67,577 |
| 160 | 23.5 µs | 26.3 µs | 89.0 µs | 28.6 KiB | 42,476 |
| 320 | 33.6 µs | 36.4 µs | 111 µs | 48.2 KiB | 29,771 |
| 640 | 63.7 µs | 67.6 µs | 206 µs | 86.8 KiB | 15,708 |
| 1280 | 112 µs | 118 µs | 332 µs | 166.1 KiB | 8,925 |
| 2560 | 249 µs | 258 µs | 696 µs | 329.7 KiB | 4,019 |
| 5120 | 643 µs | 670 µs | 1.61 ms | 634.3 KiB | 1,555 |
| 10240 | 1.46 ms | 1.50 ms | 3.85 ms | 1.3 MiB | 687 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 24.0 µs | 26.1 µs | 99.0 µs | 7.3 KiB | 41,622 |
| 40 | 41.4 µs | 42.6 µs | 130 µs | 13.2 KiB | 24,158 |
| 80 | 80.0 µs | 81.8 µs | 229 µs | 25.1 KiB | 12,494 |
| 160 | 158 µs | 163 µs | 487 µs | 48.9 KiB | 6,322 |
| 320 | 300 µs | 308 µs | 836 µs | 96.5 KiB | 3,338 |
| 640 | 568 µs | 585 µs | 1.38 ms | 191.6 KiB | 1,759 |
| 1280 | 1.14 ms | 1.16 ms | 2.83 ms | 381.9 KiB | 880 |
| 2560 | 2.12 ms | 2.56 ms | 3.98 ms | 761.9 KiB | 471 |
| 5120 | 4.86 ms | 4.98 ms | 6.96 ms | 1.5 MiB | 206 |
| 10240 | 7.83 ms | 9.51 ms | 10.3 ms | 3.0 MiB | 128 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 80.6 µs | 92.1 µs | 302 µs | 44.3 KiB | 12,411 |
| 40 | 139 µs | 160 µs | 449 µs | 83.3 KiB | 7,185 |
| 80 | 263 µs | 361 µs | 789 µs | 161.9 KiB | 3,804 |
| 160 | 474 µs | 553 µs | 1.24 ms | 319.5 KiB | 2,112 |
| 320 | 934 µs | 1.02 ms | 2.46 ms | 634.7 KiB | 1,071 |
| 640 | 1.77 ms | 1.85 ms | 3.36 ms | 1.2 MiB | 564 |
| 1280 | 3.39 ms | 3.50 ms | 5.12 ms | 2.5 MiB | 295 |
| 2560 | 6.69 ms | 6.92 ms | 8.68 ms | 4.9 MiB | 149 |
| 5120 | 13.5 ms | 15.3 ms | 16.1 ms | 9.8 MiB | 74 |
| 10240 | 31.0 ms | 31.6 ms | 34.0 ms | 19.7 MiB | 32 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.92 ms | 2.34 ms | 4.35 ms | 652.5 KiB | 522 |
| 40 | 2.57 ms | 4.05 ms | 4.28 ms | 1.3 MiB | 390 |
| 80 | 4.84 ms | 6.18 ms | 6.57 ms | 2.6 MiB | 207 |
| 160 | 9.49 ms | 11.8 ms | 11.4 ms | 5.3 MiB | 105 |
| 320 | 18.5 ms | 25.2 ms | 20.8 ms | 10.6 MiB | 54 |
| 640 | 39.9 ms | 40.9 ms | 45.1 ms | 21.5 MiB | 25 |
| 1280 | 72.7 ms | 72.9 ms | 75.4 ms | 43.7 MiB | 14 |
| 2560 | 147 ms | 151 ms | 150 ms | 25.9 MiB | 7 |
| 5120 | 303 ms | 311 ms | 315 ms | 54.2 MiB | 3 |
| 10240 | 600 ms | 620 ms | 612 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.22, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.39 µs | 8.79 µs | 7.69 µs | 7.4 KiB | 135,325 |
| 40 | 11.1 µs | 12.9 µs | 42.6 µs | 14.0 KiB | 90,382 |
| 80 | 19.7 µs | 22.8 µs | 67.2 µs | 27.3 KiB | 50,668 |
| 160 | 38.5 µs | 44.2 µs | 125 µs | 53.9 KiB | 25,980 |
| 320 | 72.8 µs | 83.4 µs | 224 µs | 107.0 KiB | 13,741 |
| 640 | 141 µs | 168 µs | 417 µs | 213.3 KiB | 7,068 |
| 1280 | 536 µs | 567 µs | 1.34 ms | 516.0 KiB | 1,865 |
| 2560 | 1.10 ms | 1.28 ms | 2.88 ms | 1.0 MiB | 906 |
| 5120 | 2.21 ms | 2.40 ms | 3.96 ms | 2.1 MiB | 453 |
| 10240 | 4.72 ms | 4.86 ms | 7.16 ms | 4.2 MiB | 212 |

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
| 20 | 2.64 ms | 2.71 ms | 5.02 ms | 1.2 MiB | 379 |
| 40 | 4.83 ms | 4.95 ms | 7.27 ms | 2.5 MiB | 207 |
| 80 | 9.24 ms | 9.77 ms | 11.7 ms | 5.0 MiB | 108 |
| 160 | 18.1 ms | 18.3 ms | 20.8 ms | 10.0 MiB | 55 |
| 320 | 35.9 ms | 36.2 ms | 38.6 ms | 20.0 MiB | 28 |
| 640 | 71.1 ms | 74.5 ms | 73.8 ms | 40.1 MiB | 14 |
| 1280 | 143 ms | 147 ms | 145 ms | 16.1 MiB | 7 |
| 2560 | 282 ms | 292 ms | 285 ms | 32.3 MiB | 4 |
| 5120 | 567 ms | 568 ms | 570 ms | 707.4 KiB | 2 |
| 10240 | 1.13 s | 1.13 s | 1.13 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.49 ms | 1.56 ms | 3.84 ms | 645.6 KiB | 670 |
| 40 | 2.63 ms | 2.68 ms | 4.98 ms | 1.3 MiB | 380 |
| 80 | 4.85 ms | 5.02 ms | 7.34 ms | 2.5 MiB | 206 |
| 160 | 9.32 ms | 9.50 ms | 11.8 ms | 5.2 MiB | 107 |
| 320 | 18.3 ms | 19.0 ms | 20.9 ms | 10.6 MiB | 55 |
| 640 | 36.3 ms | 36.4 ms | 39.0 ms | 21.4 MiB | 28 |
| 1280 | 73.0 ms | 73.4 ms | 75.6 ms | 43.6 MiB | 14 |
| 2560 | 172 ms | 177 ms | 175 ms | 25.7 MiB | 6 |
| 5120 | 296 ms | 302 ms | 300 ms | 53.9 MiB | 3 |
| 10240 | 593 ms | 599 ms | 598 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.32, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.64 µs | 13.3 µs | 5.80 µs | 9.3 KiB | 177,354 |
| 40 | 7.64 µs | 8.78 µs | 30.0 µs | 8.4 KiB | 130,941 |
| 80 | 12.0 µs | 14.1 µs | 43.7 µs | 16.2 KiB | 83,056 |
| 160 | 22.0 µs | 22.7 µs | 76.4 µs | 31.8 KiB | 45,541 |
| 320 | 45.4 µs | 49.7 µs | 152 µs | 63.1 KiB | 22,040 |
| 640 | 85.5 µs | 88.1 µs | 293 µs | 127.4 KiB | 11,693 |
| 1280 | 453 µs | 482 µs | 1.25 ms | 340.8 KiB | 2,207 |
| 2560 | 862 µs | 912 µs | 1.81 ms | 694.2 KiB | 1,160 |
| 5120 | 2.00 ms | 2.62 ms | 3.91 ms | 1.3 MiB | 499 |
| 10240 | 4.00 ms | 4.19 ms | 6.08 ms | 2.7 MiB | 250 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.90, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.21 µs | 4.36 µs | 5.87 µs | 4.5 KiB | 237,750 |
| 40 | 4.57 µs | 4.85 µs | 4.63 µs | 4.5 KiB | 218,900 |
| 80 | 5.21 µs | 5.98 µs | 11.2 µs | 4.5 KiB | 191,937 |
| 160 | 6.38 µs | 6.78 µs | 25.9 µs | 4.5 KiB | 156,840 |
| 320 | 8.83 µs | 9.37 µs | 36.4 µs | 4.5 KiB | 113,290 |
| 640 | 13.2 µs | 13.9 µs | 49.1 µs | 4.5 KiB | 75,877 |
| 1280 | 22.0 µs | 24.6 µs | 75.6 µs | 4.5 KiB | 45,397 |
| 2560 | 40.8 µs | 46.7 µs | 135 µs | 4.5 KiB | 24,498 |
| 5120 | 77.4 µs | 83.1 µs | 253 µs | 4.5 KiB | 12,923 |
| 10240 | 157 µs | 188 µs | 515 µs | 4.5 KiB | 6,380 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.3 µs | 17.5 µs | 14.7 µs | 3.7 KiB | 69,870 |
| 40 | 19.2 µs | 20.8 µs | 19.6 µs | 6.3 KiB | 52,044 |
| 80 | 32.9 µs | 35.3 µs | 34.6 µs | 11.7 KiB | 30,432 |
| 160 | 54.2 µs | 58.3 µs | 219 µs | 22.4 KiB | 18,436 |
| 320 | 99.9 µs | 110 µs | 381 µs | 45.6 KiB | 10,007 |
| 640 | 165 µs | 191 µs | 507 µs | 92.1 KiB | 6,066 |
| 1280 | 307 µs | 342 µs | 870 µs | 191.5 KiB | 3,261 |
| 2560 | 581 µs | 602 µs | 1.45 ms | 360.0 KiB | 1,722 |
| 5120 | 1.34 ms | 1.48 ms | 3.21 ms | 685.3 KiB | 744 |
| 10240 | 2.39 ms | 2.49 ms | 4.43 ms | 1.3 MiB | 419 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.52 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.77 ms | 1.77 ms | 70% |
| `load-exception-registry` | 1 | 568 µs | 568 µs | 23% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 183 µs | 7.3% |

**At 10240 entrys** (whole operation: 43.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 31.0 ms | 31.0 ms | 71% |
| `load-exception-registry` | 1 | 7.83 ms | 7.83 ms | 18% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.56 ms | 11% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-11T13:15:52.654Z` → `2026-11-11T13:16:58.413Z` (66 s), ci: CI (run 43021773948)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `14e1a573ee8492e838957ec10edf1dd89619e34e` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

