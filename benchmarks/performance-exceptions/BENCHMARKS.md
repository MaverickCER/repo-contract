# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.99 ms** per operation compared with a bare-minimum baseline (**301% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.99 ms | 35.7 ms |
| Added latency, relative to baseline | 301% | 335% |
| Added CPU time per operation | 2.80 ms | 35.5 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 504 ops/s | 28 ops/s |

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
| 20 | 30.8 µs | 160 µs | 129 µs | 420% | 514 µs | $0.00027 – $0.0058 |
| 40 | 51.4 µs | 231 µs | 180 µs | 350% | 545 µs | $0.00037 – $0.0061 |
| 80 | 103 µs | 415 µs | 312 µs | 301% | 802 µs | $0.00065 – $0.009 |
| 160 | 190 µs | 693 µs | 503 µs | 264% | 888 µs | $0.001 – $0.01 |
| 320 | 345 µs | 1.36 ms | 1.02 ms | 296% | 2.04 ms | $0.0021 – $0.023 |
| 640 | 659 µs | 2.64 ms | 1.99 ms | 301% | 2.80 ms | $0.0041 – $0.031 |
| 1280 | 1.34 ms | 5.22 ms | 3.87 ms | 288% | 4.00 ms | $0.0081 – $0.045 |
| 2560 | 2.56 ms | 10.7 ms | 8.12 ms | 317% | 8.52 ms | $0.017 – $0.096 |
| 5120 | 5.30 ms | 20.6 ms | 15.3 ms | 288% | 15.8 ms | $0.032 – $0.177 |
| 10240 | 10.6 ms | 46.3 ms | 35.7 ms | 335% | 35.5 ms | $0.074 – $0.399 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 540 µs | 4.64 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 63.0 µs | 1.46 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 539 µs | 7.27 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.07 ms | 34.5 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 37.3 ms | 580 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 160 µs | 4.64 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 69.5 ms | 1.10 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.7 ms | 573 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 88.1 µs | 3.71 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 14.3 µs | 140 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 187 µs | 2.62 ms |

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

**Measured: O(n)** (exponent 0.83, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 119 µs | 157 µs | 431 µs | 115.6 KiB | 8,409 |
| 40 | 80.7 µs | 125 µs | 303 µs | 99.2 KiB | 12,396 |
| 80 | 85.6 µs | 91.0 µs | 277 µs | 118.5 KiB | 11,677 |
| 160 | 109 µs | 117 µs | 332 µs | 159.3 KiB | 9,173 |
| 320 | 171 µs | 203 µs | 554 µs | 237.8 KiB | 5,845 |
| 640 | 540 µs | 960 µs | 2.00 ms | 670.1 KiB | 1,850 |
| 1280 | 554 µs | 641 µs | 1.33 ms | 1.0 MiB | 1,806 |
| 2560 | 1.17 ms | 1.25 ms | 2.87 ms | 2.1 MiB | 856 |
| 5120 | 2.36 ms | 2.53 ms | 3.94 ms | 4.3 MiB | 424 |
| 10240 | 4.64 ms | 5.15 ms | 5.75 ms | 8.6 MiB | 216 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.0 µs | 12.7 µs | 50.2 µs | 17.0 KiB | 83,672 |
| 40 | 13.4 µs | 14.6 µs | 30.8 µs | 16.3 KiB | 74,505 |
| 80 | 16.4 µs | 17.7 µs | 70.5 µs | 20.5 KiB | 61,136 |
| 160 | 21.9 µs | 23.3 µs | 83.4 µs | 28.6 KiB | 45,579 |
| 320 | 35.5 µs | 37.9 µs | 129 µs | 48.4 KiB | 28,200 |
| 640 | 63.0 µs | 71.1 µs | 203 µs | 86.8 KiB | 15,873 |
| 1280 | 126 µs | 133 µs | 392 µs | 168.3 KiB | 7,932 |
| 2560 | 263 µs | 272 µs | 784 µs | 335.9 KiB | 3,807 |
| 5120 | 639 µs | 689 µs | 1.55 ms | 634.3 KiB | 1,565 |
| 10240 | 1.46 ms | 1.54 ms | 3.65 ms | 1.3 MiB | 684 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 24.7 µs | 26.3 µs | 105 µs | 7.3 KiB | 40,536 |
| 40 | 42.1 µs | 45.0 µs | 154 µs | 13.2 KiB | 23,771 |
| 80 | 74.3 µs | 76.5 µs | 225 µs | 25.1 KiB | 13,465 |
| 160 | 149 µs | 156 µs | 451 µs | 48.9 KiB | 6,711 |
| 320 | 287 µs | 300 µs | 803 µs | 96.5 KiB | 3,487 |
| 640 | 539 µs | 579 µs | 1.32 ms | 191.6 KiB | 1,855 |
| 1280 | 1.08 ms | 1.13 ms | 2.66 ms | 381.9 KiB | 926 |
| 2560 | 1.98 ms | 2.39 ms | 3.78 ms | 761.9 KiB | 504 |
| 5120 | 4.59 ms | 4.78 ms | 6.66 ms | 1.5 MiB | 218 |
| 10240 | 7.27 ms | 8.80 ms | 9.69 ms | 3.0 MiB | 138 |

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
| 20 | 94.2 µs | 113 µs | 354 µs | 44.5 KiB | 10,621 |
| 40 | 166 µs | 209 µs | 548 µs | 83.6 KiB | 6,019 |
| 80 | 290 µs | 339 µs | 802 µs | 161.9 KiB | 3,450 |
| 160 | 545 µs | 592 µs | 1.31 ms | 319.5 KiB | 1,835 |
| 320 | 1.09 ms | 1.16 ms | 2.62 ms | 634.7 KiB | 914 |
| 640 | 2.07 ms | 2.15 ms | 3.57 ms | 1.2 MiB | 483 |
| 1280 | 3.96 ms | 4.08 ms | 5.62 ms | 2.5 MiB | 252 |
| 2560 | 7.78 ms | 7.93 ms | 9.68 ms | 4.9 MiB | 129 |
| 5120 | 15.2 ms | 22.1 ms | 17.7 ms | 9.8 MiB | 66 |
| 10240 | 34.5 ms | 34.7 ms | 37.5 ms | 19.7 MiB | 29 |

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
| 20 | 2.03 ms | 2.31 ms | 4.47 ms | 652.5 KiB | 492 |
| 40 | 2.50 ms | 3.79 ms | 4.08 ms | 1.3 MiB | 400 |
| 80 | 4.74 ms | 6.22 ms | 6.44 ms | 2.6 MiB | 211 |
| 160 | 9.30 ms | 10.5 ms | 11.2 ms | 5.3 MiB | 108 |
| 320 | 19.2 ms | 21.9 ms | 24.4 ms | 10.6 MiB | 52 |
| 640 | 37.3 ms | 37.6 ms | 43.1 ms | 21.5 MiB | 27 |
| 1280 | 71.2 ms | 71.4 ms | 73.8 ms | 43.7 MiB | 14 |
| 2560 | 143 ms | 149 ms | 146 ms | 25.9 MiB | 7 |
| 5120 | 291 ms | 294 ms | 303 ms | 54.2 MiB | 3 |
| 10240 | 580 ms | 585 ms | 595 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.51 µs | 9.92 µs | 8.74 µs | 7.4 KiB | 117,468 |
| 40 | 14.2 µs | 15.3 µs | 59.4 µs | 14.0 KiB | 70,516 |
| 80 | 22.4 µs | 28.8 µs | 78.0 µs | 27.3 KiB | 44,645 |
| 160 | 42.3 µs | 52.2 µs | 141 µs | 53.9 KiB | 23,639 |
| 320 | 81.5 µs | 110 µs | 253 µs | 107.0 KiB | 12,275 |
| 640 | 160 µs | 188 µs | 467 µs | 213.3 KiB | 6,245 |
| 1280 | 544 µs | 620 µs | 1.35 ms | 516.0 KiB | 1,837 |
| 2560 | 1.01 ms | 1.07 ms | 1.92 ms | 1.0 MiB | 986 |
| 5120 | 2.18 ms | 2.38 ms | 3.82 ms | 2.1 MiB | 459 |
| 10240 | 4.64 ms | 5.15 ms | 7.45 ms | 4.2 MiB | 216 |

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
| 20 | 2.62 ms | 2.72 ms | 4.79 ms | 1.2 MiB | 381 |
| 40 | 4.76 ms | 4.86 ms | 7.06 ms | 2.5 MiB | 210 |
| 80 | 9.13 ms | 9.33 ms | 11.6 ms | 5.0 MiB | 110 |
| 160 | 17.8 ms | 18.0 ms | 20.4 ms | 10.0 MiB | 56 |
| 320 | 34.8 ms | 35.6 ms | 37.5 ms | 20.0 MiB | 29 |
| 640 | 69.5 ms | 71.4 ms | 72.2 ms | 40.1 MiB | 14 |
| 1280 | 139 ms | 149 ms | 142 ms | 16.1 MiB | 7 |
| 2560 | 276 ms | 291 ms | 280 ms | 32.3 MiB | 4 |
| 5120 | 549 ms | 550 ms | 552 ms | 707.4 KiB | 2 |
| 10240 | 1.10 s | 1.11 s | 1.10 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.48 ms | 1.54 ms | 3.44 ms | 645.6 KiB | 676 |
| 40 | 2.55 ms | 2.59 ms | 4.52 ms | 1.3 MiB | 392 |
| 80 | 4.71 ms | 4.78 ms | 6.74 ms | 2.5 MiB | 212 |
| 160 | 9.08 ms | 9.17 ms | 11.2 ms | 5.2 MiB | 110 |
| 320 | 17.9 ms | 19.7 ms | 20.2 ms | 10.6 MiB | 56 |
| 640 | 35.7 ms | 37.0 ms | 38.3 ms | 21.4 MiB | 28 |
| 1280 | 72.6 ms | 73.7 ms | 75.0 ms | 43.6 MiB | 14 |
| 2560 | 144 ms | 145 ms | 148 ms | 25.7 MiB | 7 |
| 5120 | 286 ms | 286 ms | 290 ms | 53.9 MiB | 3 |
| 10240 | 573 ms | 574 ms | 578 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.28, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.04 µs | 15.4 µs | 6.21 µs | 9.3 KiB | 165,527 |
| 40 | 7.91 µs | 9.40 µs | 31.4 µs | 8.4 KiB | 126,404 |
| 80 | 12.9 µs | 13.4 µs | 44.4 µs | 16.2 KiB | 77,246 |
| 160 | 23.4 µs | 24.9 µs | 75.9 µs | 31.8 KiB | 42,699 |
| 320 | 41.9 µs | 43.0 µs | 110 µs | 63.1 KiB | 23,893 |
| 640 | 88.1 µs | 91.3 µs | 256 µs | 127.7 KiB | 11,346 |
| 1280 | 443 µs | 455 µs | 1.22 ms | 340.8 KiB | 2,257 |
| 2560 | 813 µs | 839 µs | 1.62 ms | 694.2 KiB | 1,231 |
| 5120 | 1.83 ms | 1.89 ms | 3.55 ms | 1.3 MiB | 547 |
| 10240 | 3.71 ms | 3.85 ms | 5.63 ms | 2.7 MiB | 270 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.84, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.52 µs | 4.84 µs | 4.70 µs | 4.5 KiB | 221,117 |
| 40 | 5.09 µs | 5.36 µs | 15.8 µs | 4.5 KiB | 196,313 |
| 80 | 5.82 µs | 6.33 µs | 5.92 µs | 4.5 KiB | 171,870 |
| 160 | 7.49 µs | 8.21 µs | 22.6 µs | 4.5 KiB | 133,557 |
| 320 | 10.5 µs | 11.2 µs | 47.3 µs | 4.5 KiB | 94,833 |
| 640 | 14.3 µs | 15.2 µs | 55.8 µs | 4.5 KiB | 69,931 |
| 1280 | 22.9 µs | 23.8 µs | 80.3 µs | 4.5 KiB | 43,592 |
| 2560 | 43.1 µs | 45.3 µs | 158 µs | 4.5 KiB | 23,225 |
| 5120 | 81.2 µs | 89.0 µs | 272 µs | 4.5 KiB | 12,317 |
| 10240 | 140 µs | 149 µs | 394 µs | 4.5 KiB | 7,159 |

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
| 20 | 24.2 µs | 29.5 µs | 25.1 µs | 3.8 KiB | 41,365 |
| 40 | 23.9 µs | 28.4 µs | 24.5 µs | 6.4 KiB | 41,791 |
| 80 | 39.1 µs | 42.2 µs | 86.4 µs | 11.7 KiB | 25,605 |
| 160 | 61.5 µs | 70.6 µs | 256 µs | 22.4 KiB | 16,254 |
| 320 | 105 µs | 128 µs | 374 µs | 45.6 KiB | 9,496 |
| 640 | 187 µs | 232 µs | 594 µs | 93.6 KiB | 5,334 |
| 1280 | 331 µs | 378 µs | 873 µs | 191.5 KiB | 3,025 |
| 2560 | 619 µs | 666 µs | 1.51 ms | 360.0 KiB | 1,615 |
| 5120 | 1.46 ms | 1.60 ms | 3.19 ms | 685.3 KiB | 683 |
| 10240 | 2.62 ms | 2.71 ms | 4.55 ms | 1.3 MiB | 382 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.64 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.07 ms | 2.07 ms | 78% |
| `load-exception-registry` | 1 | 539 µs | 539 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 36.1 µs | 1.4% |

**At 10240 entrys** (whole operation: 46.3 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 34.5 ms | 34.5 ms | 75% |
| `load-exception-registry` | 1 | 7.27 ms | 7.27 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.50 ms | 9.7% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-30T10:54:08.678Z` → `2026-10-30T10:55:14.051Z` (65 s), ci: CI (run 41041815726)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `cbb0d7a2f418c721aa976ec1722fe84be6fccd55` on `dependabot/npm_and_yarn/dev-dependencies-6c9b387527`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

