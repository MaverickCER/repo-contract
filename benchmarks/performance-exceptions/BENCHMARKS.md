# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.76 ms** per operation compared with a bare-minimum baseline (**262% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.76 ms | 31.7 ms |
| Added latency, relative to baseline | 262% | 304% |
| Added CPU time per operation | 2.58 ms | 31.4 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 569 ops/s | 32 ops/s |

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
| 20 | 29.7 µs | 133 µs | 103 µs | 349% | 402 µs | $0.00022 – $0.0045 |
| 40 | 49.7 µs | 198 µs | 148 µs | 298% | 417 µs | $0.00031 – $0.0047 |
| 80 | 93.5 µs | 347 µs | 253 µs | 271% | 580 µs | $0.00053 – $0.0065 |
| 160 | 180 µs | 635 µs | 455 µs | 252% | 921 µs | $0.00095 – $0.010 |
| 320 | 347 µs | 1.23 ms | 885 µs | 255% | 1.95 ms | $0.0018 – $0.022 |
| 640 | 670 µs | 2.43 ms | 1.76 ms | 262% | 2.58 ms | $0.0037 – $0.029 |
| 1280 | 1.36 ms | 4.64 ms | 3.28 ms | 241% | 3.30 ms | $0.0068 – $0.037 |
| 2560 | 2.56 ms | 9.19 ms | 6.63 ms | 259% | 6.50 ms | $0.014 – $0.073 |
| 5120 | 5.15 ms | 18.4 ms | 13.3 ms | 258% | 13.5 ms | $0.028 – $0.152 |
| 10240 | 10.4 ms | 42.1 ms | 31.7 ms | 304% | 31.4 ms | $0.066 – $0.353 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 369 µs | 4.33 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 62.9 µs | 1.44 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 550 µs | 7.57 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.82 ms | 30.8 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 37.9 ms | 598 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 139 µs | 4.38 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 71.0 ms | 1.16 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 36.1 ms | 621 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 78.6 µs | 3.70 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 14.0 µs | 149 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 162 µs | 2.34 ms |

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

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 108 µs | 126 µs | 374 µs | 115.4 KiB | 9,276 |
| 40 | 82.0 µs | 90.1 µs | 289 µs | 99.8 KiB | 12,192 |
| 80 | 74.4 µs | 77.1 µs | 233 µs | 120.4 KiB | 13,445 |
| 160 | 99.0 µs | 105 µs | 298 µs | 158.9 KiB | 10,096 |
| 320 | 152 µs | 164 µs | 469 µs | 237.4 KiB | 6,561 |
| 640 | 369 µs | 597 µs | 1.15 ms | 656.2 KiB | 2,708 |
| 1280 | 535 µs | 555 µs | 1.31 ms | 1.0 MiB | 1,871 |
| 2560 | 940 µs | 958 µs | 1.72 ms | 2.1 MiB | 1,064 |
| 5120 | 2.17 ms | 2.23 ms | 3.70 ms | 4.3 MiB | 461 |
| 10240 | 4.33 ms | 4.43 ms | 5.40 ms | 8.6 MiB | 231 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 10.8 µs | 11.5 µs | 44.0 µs | 17.0 KiB | 92,316 |
| 40 | 11.2 µs | 12.0 µs | 45.0 µs | 16.3 KiB | 88,967 |
| 80 | 13.1 µs | 14.5 µs | 44.9 µs | 20.5 KiB | 76,498 |
| 160 | 20.0 µs | 21.4 µs | 72.1 µs | 28.6 KiB | 49,963 |
| 320 | 32.8 µs | 34.5 µs | 112 µs | 48.2 KiB | 30,519 |
| 640 | 62.9 µs | 64.5 µs | 211 µs | 86.8 KiB | 15,901 |
| 1280 | 112 µs | 117 µs | 348 µs | 166.1 KiB | 8,967 |
| 2560 | 243 µs | 251 µs | 676 µs | 329.7 KiB | 4,117 |
| 5120 | 643 µs | 666 µs | 1.58 ms | 634.3 KiB | 1,555 |
| 10240 | 1.44 ms | 1.47 ms | 3.72 ms | 1.3 MiB | 694 |

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
| 20 | 22.6 µs | 24.1 µs | 90.5 µs | 7.3 KiB | 44,276 |
| 40 | 38.6 µs | 41.4 µs | 121 µs | 13.2 KiB | 25,919 |
| 80 | 73.1 µs | 78.1 µs | 210 µs | 25.1 KiB | 13,683 |
| 160 | 144 µs | 149 µs | 397 µs | 48.9 KiB | 6,954 |
| 320 | 290 µs | 299 µs | 823 µs | 96.5 KiB | 3,453 |
| 640 | 550 µs | 568 µs | 1.35 ms | 191.6 KiB | 1,817 |
| 1280 | 1.10 ms | 1.16 ms | 2.76 ms | 381.9 KiB | 909 |
| 2560 | 2.06 ms | 2.51 ms | 3.86 ms | 761.9 KiB | 486 |
| 5120 | 4.80 ms | 5.03 ms | 6.77 ms | 1.5 MiB | 208 |
| 10240 | 7.57 ms | 8.41 ms | 9.90 ms | 3.0 MiB | 132 |

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
| 20 | 80.5 µs | 94.7 µs | 309 µs | 44.3 KiB | 12,422 |
| 40 | 130 µs | 153 µs | 390 µs | 83.1 KiB | 7,665 |
| 80 | 261 µs | 280 µs | 791 µs | 161.9 KiB | 3,836 |
| 160 | 480 µs | 521 µs | 1.27 ms | 319.5 KiB | 2,083 |
| 320 | 948 µs | 1.04 ms | 2.54 ms | 634.8 KiB | 1,055 |
| 640 | 1.82 ms | 1.90 ms | 3.41 ms | 1.2 MiB | 551 |
| 1280 | 3.36 ms | 3.48 ms | 5.08 ms | 2.5 MiB | 297 |
| 2560 | 6.63 ms | 7.05 ms | 8.56 ms | 4.9 MiB | 151 |
| 5120 | 13.1 ms | 13.2 ms | 15.3 ms | 9.8 MiB | 76 |
| 10240 | 30.8 ms | 30.9 ms | 33.5 ms | 19.7 MiB | 32 |

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
| 20 | 1.91 ms | 2.22 ms | 4.28 ms | 652.5 KiB | 523 |
| 40 | 2.55 ms | 3.74 ms | 4.18 ms | 1.3 MiB | 393 |
| 80 | 4.81 ms | 6.08 ms | 6.44 ms | 2.6 MiB | 208 |
| 160 | 9.43 ms | 11.6 ms | 11.1 ms | 5.3 MiB | 106 |
| 320 | 19.3 ms | 20.0 ms | 21.1 ms | 10.6 MiB | 52 |
| 640 | 37.9 ms | 38.5 ms | 43.0 ms | 21.5 MiB | 26 |
| 1280 | 73.1 ms | 74.4 ms | 75.7 ms | 43.7 MiB | 14 |
| 2560 | 147 ms | 148 ms | 150 ms | 25.9 MiB | 7 |
| 5120 | 298 ms | 301 ms | 308 ms | 54.3 MiB | 3 |
| 10240 | 598 ms | 601 ms | 610 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.27 µs | 8.43 µs | 7.61 µs | 7.4 KiB | 137,511 |
| 40 | 11.2 µs | 12.8 µs | 41.5 µs | 14.0 KiB | 89,426 |
| 80 | 19.7 µs | 23.9 µs | 68.6 µs | 27.3 KiB | 50,760 |
| 160 | 37.8 µs | 44.8 µs | 122 µs | 53.9 KiB | 26,459 |
| 320 | 70.4 µs | 82.2 µs | 218 µs | 107.0 KiB | 14,214 |
| 640 | 139 µs | 157 µs | 411 µs | 213.3 KiB | 7,184 |
| 1280 | 519 µs | 565 µs | 1.36 ms | 516.0 KiB | 1,927 |
| 2560 | 1.07 ms | 1.15 ms | 2.75 ms | 1.0 MiB | 933 |
| 5120 | 2.11 ms | 2.27 ms | 3.86 ms | 2.1 MiB | 473 |
| 10240 | 4.38 ms | 4.53 ms | 6.61 ms | 4.2 MiB | 229 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.58 ms | 2.64 ms | 4.67 ms | 1.2 MiB | 387 |
| 40 | 4.77 ms | 5.13 ms | 6.87 ms | 2.5 MiB | 210 |
| 80 | 9.15 ms | 9.21 ms | 11.3 ms | 5.0 MiB | 109 |
| 160 | 18.0 ms | 18.2 ms | 20.2 ms | 10.0 MiB | 56 |
| 320 | 35.6 ms | 35.8 ms | 37.9 ms | 20.0 MiB | 28 |
| 640 | 71.0 ms | 71.3 ms | 73.4 ms | 40.1 MiB | 14 |
| 1280 | 142 ms | 142 ms | 145 ms | 16.1 MiB | 7 |
| 2560 | 285 ms | 289 ms | 287 ms | 32.3 MiB | 4 |
| 5120 | 564 ms | 572 ms | 566 ms | 707.4 KiB | 2 |
| 10240 | 1.16 s | 1.17 s | 1.17 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.45 ms | 1.49 ms | 3.54 ms | 645.6 KiB | 689 |
| 40 | 2.53 ms | 2.59 ms | 4.64 ms | 1.3 MiB | 396 |
| 80 | 4.75 ms | 4.79 ms | 6.85 ms | 2.5 MiB | 210 |
| 160 | 9.20 ms | 9.25 ms | 11.3 ms | 5.2 MiB | 109 |
| 320 | 18.2 ms | 18.4 ms | 20.4 ms | 10.6 MiB | 55 |
| 640 | 36.1 ms | 36.2 ms | 38.5 ms | 21.4 MiB | 28 |
| 1280 | 72.5 ms | 72.6 ms | 74.9 ms | 43.6 MiB | 14 |
| 2560 | 147 ms | 148 ms | 149 ms | 25.7 MiB | 7 |
| 5120 | 295 ms | 296 ms | 298 ms | 53.9 MiB | 3 |
| 10240 | 621 ms | 622 ms | 626 ms | 46.2 MiB | 2 |

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
| 20 | 5.38 µs | 13.8 µs | 5.55 µs | 9.3 KiB | 185,830 |
| 40 | 7.36 µs | 8.64 µs | 25.4 µs | 8.4 KiB | 135,807 |
| 80 | 11.9 µs | 12.6 µs | 43.8 µs | 16.2 KiB | 83,777 |
| 160 | 21.8 µs | 23.0 µs | 74.0 µs | 31.8 KiB | 45,920 |
| 320 | 40.8 µs | 43.4 µs | 131 µs | 63.1 KiB | 24,490 |
| 640 | 78.6 µs | 82.1 µs | 242 µs | 127.5 KiB | 12,715 |
| 1280 | 426 µs | 448 µs | 1.22 ms | 340.8 KiB | 2,346 |
| 2560 | 798 µs | 818 µs | 1.66 ms | 694.2 KiB | 1,253 |
| 5120 | 1.77 ms | 1.79 ms | 3.53 ms | 1.3 MiB | 564 |
| 10240 | 3.70 ms | 3.79 ms | 5.65 ms | 2.7 MiB | 271 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.85, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.11 µs | 4.33 µs | 4.16 µs | 4.5 KiB | 243,337 |
| 40 | 4.47 µs | 4.66 µs | 9.58 µs | 4.5 KiB | 223,714 |
| 80 | 5.15 µs | 5.34 µs | 15.7 µs | 4.5 KiB | 194,099 |
| 160 | 6.88 µs | 7.16 µs | 22.9 µs | 4.5 KiB | 145,391 |
| 320 | 9.26 µs | 9.69 µs | 35.7 µs | 4.5 KiB | 108,009 |
| 640 | 14.0 µs | 14.7 µs | 49.6 µs | 4.5 KiB | 71,342 |
| 1280 | 23.0 µs | 24.7 µs | 76.4 µs | 4.5 KiB | 43,533 |
| 2560 | 40.8 µs | 44.4 µs | 128 µs | 4.5 KiB | 24,539 |
| 5120 | 75.6 µs | 79.4 µs | 229 µs | 4.5 KiB | 13,222 |
| 10240 | 149 µs | 153 µs | 437 µs | 4.5 KiB | 6,714 |

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
| 20 | 12.5 µs | 15.5 µs | 12.8 µs | 3.7 KiB | 80,110 |
| 40 | 18.2 µs | 19.7 µs | 18.4 µs | 6.3 KiB | 55,046 |
| 80 | 31.6 µs | 33.0 µs | 32.2 µs | 11.7 KiB | 31,684 |
| 160 | 55.6 µs | 59.5 µs | 181 µs | 22.4 KiB | 17,996 |
| 320 | 86.1 µs | 92.8 µs | 269 µs | 44.8 KiB | 11,621 |
| 640 | 162 µs | 178 µs | 492 µs | 92.1 KiB | 6,176 |
| 1280 | 309 µs | 318 µs | 867 µs | 191.5 KiB | 3,232 |
| 2560 | 597 µs | 648 µs | 1.48 ms | 360.9 KiB | 1,675 |
| 5120 | 1.33 ms | 1.44 ms | 3.06 ms | 685.3 KiB | 751 |
| 10240 | 2.34 ms | 2.41 ms | 4.17 ms | 1.3 MiB | 427 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.43 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.82 ms | 1.82 ms | 75% |
| `load-exception-registry` | 1 | 550 µs | 550 µs | 23% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 63.6 µs | 2.6% |

**At 10240 entrys** (whole operation: 42.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 30.8 ms | 30.8 ms | 73% |
| `load-exception-registry` | 1 | 7.57 ms | 7.57 ms | 18% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.74 ms | 8.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-21T17:24:48.802Z` → `2026-10-21T17:25:54.146Z` (65 s), ci: CI (run 39640861177)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.0, GitHub Actions
- Git: `00f54c81c3ec0279c26a64f3b8614838ad537852` on `changeset-release/main`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

