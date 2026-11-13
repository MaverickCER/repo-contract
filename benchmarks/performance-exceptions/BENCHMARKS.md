# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.85 ms** per operation compared with a bare-minimum baseline (**249% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.05). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.85 ms | 37.8 ms |
| Added latency, relative to baseline | 249% | 403% |
| Added CPU time per operation | 1.83 ms | 38.2 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 542 ops/s | 26 ops/s |

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
| 20 | 42.8 µs | 212 µs | 170 µs | 398% | 192 µs | $0.00035 – $0.0022 |
| 40 | 70.3 µs | 318 µs | 243 µs | 346% | 250 µs | $0.00051 – $0.0028 |
| 80 | 123 µs | 519 µs | 396 µs | 323% | 1.81 ms | $0.00083 – $0.020 |
| 160 | 235 µs | 798 µs | 557 µs | 237% | 2.00 ms | $0.0012 – $0.023 |
| 320 | 455 µs | 1.37 ms | 912 µs | 201% | 931 µs | $0.0019 – $0.010 |
| 640 | 740 µs | 2.58 ms | 1.85 ms | 249% | 1.83 ms | $0.0038 – $0.021 |
| 1280 | 1.24 ms | 4.96 ms | 3.71 ms | 299% | 3.76 ms | $0.0077 – $0.042 |
| 2560 | 2.34 ms | 9.80 ms | 7.47 ms | 319% | 7.44 ms | $0.016 – $0.084 |
| 5120 | 4.66 ms | 21.5 ms | 16.8 ms | 361% | 17.2 ms | $0.035 – $0.193 |
| 10240 | 9.38 ms | 47.2 ms | 37.8 ms | 403% | 38.2 ms | $0.079 – $0.429 |

**How the total grows:** O(n) (linear), exponent 1.05 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 369 µs | 4.43 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.2 µs | 1.39 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 544 µs | 7.34 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.99 ms | 32.5 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 36.5 ms | 579 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 159 µs | 4.76 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 69.0 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 34.9 ms | 569 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 86.0 µs | 3.84 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 12.8 µs | 163 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 161 µs | 2.32 ms |

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
| 20 | 112 µs | 136 µs | 397 µs | 115.6 KiB | 8,906 |
| 40 | 78.0 µs | 118 µs | 288 µs | 99.2 KiB | 12,822 |
| 80 | 81.0 µs | 84.7 µs | 255 µs | 118.5 KiB | 12,347 |
| 160 | 107 µs | 111 µs | 316 µs | 159.3 KiB | 9,354 |
| 320 | 155 µs | 160 µs | 433 µs | 237.4 KiB | 6,465 |
| 640 | 369 µs | 549 µs | 1.09 ms | 530.7 KiB | 2,709 |
| 1280 | 545 µs | 567 µs | 1.25 ms | 1.0 MiB | 1,833 |
| 2560 | 1.10 ms | 1.16 ms | 2.49 ms | 2.1 MiB | 910 |
| 5120 | 2.23 ms | 2.32 ms | 3.59 ms | 4.3 MiB | 449 |
| 10240 | 4.43 ms | 4.53 ms | 4.94 ms | 8.6 MiB | 226 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.6 µs | 13.3 µs | 51.7 µs | 17.0 KiB | 79,176 |
| 40 | 12.3 µs | 12.9 µs | 47.0 µs | 16.3 KiB | 81,306 |
| 80 | 14.9 µs | 16.2 µs | 53.9 µs | 20.5 KiB | 67,237 |
| 160 | 21.1 µs | 22.6 µs | 72.5 µs | 28.6 KiB | 47,337 |
| 320 | 33.4 µs | 37.6 µs | 110 µs | 48.2 KiB | 29,981 |
| 640 | 58.2 µs | 60.6 µs | 179 µs | 86.8 KiB | 17,183 |
| 1280 | 115 µs | 137 µs | 330 µs | 166.1 KiB | 8,662 |
| 2560 | 244 µs | 250 µs | 645 µs | 329.7 KiB | 4,092 |
| 5120 | 609 µs | 630 µs | 1.50 ms | 634.3 KiB | 1,642 |
| 10240 | 1.39 ms | 1.52 ms | 3.51 ms | 1.3 MiB | 722 |

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
| 20 | 24.5 µs | 27.4 µs | 96.8 µs | 7.3 KiB | 40,897 |
| 40 | 39.5 µs | 40.9 µs | 121 µs | 13.2 KiB | 25,320 |
| 80 | 75.3 µs | 77.4 µs | 222 µs | 25.1 KiB | 13,282 |
| 160 | 144 µs | 149 µs | 389 µs | 48.9 KiB | 6,922 |
| 320 | 288 µs | 294 µs | 783 µs | 96.5 KiB | 3,469 |
| 640 | 544 µs | 557 µs | 1.28 ms | 191.6 KiB | 1,838 |
| 1280 | 1.08 ms | 1.10 ms | 2.61 ms | 381.9 KiB | 924 |
| 2560 | 2.00 ms | 2.36 ms | 3.66 ms | 761.9 KiB | 500 |
| 5120 | 4.50 ms | 4.71 ms | 6.32 ms | 1.5 MiB | 222 |
| 10240 | 7.34 ms | 7.65 ms | 9.52 ms | 3.0 MiB | 136 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 92.3 µs | 110 µs | 337 µs | 44.5 KiB | 10,834 |
| 40 | 148 µs | 173 µs | 440 µs | 83.3 KiB | 6,737 |
| 80 | 276 µs | 299 µs | 769 µs | 161.9 KiB | 3,619 |
| 160 | 522 µs | 562 µs | 1.25 ms | 319.5 KiB | 1,917 |
| 320 | 1.04 ms | 1.11 ms | 2.51 ms | 634.8 KiB | 960 |
| 640 | 1.99 ms | 2.07 ms | 3.50 ms | 1.2 MiB | 503 |
| 1280 | 3.67 ms | 3.80 ms | 5.25 ms | 2.5 MiB | 272 |
| 2560 | 7.23 ms | 7.34 ms | 8.96 ms | 4.9 MiB | 138 |
| 5120 | 14.5 ms | 15.0 ms | 16.8 ms | 9.8 MiB | 69 |
| 10240 | 32.5 ms | 33.0 ms | 35.3 ms | 19.7 MiB | 31 |

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
| 20 | 1.92 ms | 2.27 ms | 4.12 ms | 652.5 KiB | 520 |
| 40 | 2.47 ms | 3.70 ms | 3.99 ms | 1.3 MiB | 404 |
| 80 | 4.67 ms | 6.06 ms | 6.18 ms | 2.6 MiB | 214 |
| 160 | 9.15 ms | 11.5 ms | 10.8 ms | 5.3 MiB | 109 |
| 320 | 18.5 ms | 19.4 ms | 20.5 ms | 10.6 MiB | 54 |
| 640 | 36.5 ms | 37.2 ms | 41.6 ms | 21.5 MiB | 27 |
| 1280 | 70.5 ms | 72.8 ms | 72.7 ms | 43.7 MiB | 14 |
| 2560 | 143 ms | 144 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 289 ms | 294 ms | 299 ms | 54.2 MiB | 3 |
| 10240 | 579 ms | 630 ms | 591 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.80 µs | 9.28 µs | 8.09 µs | 7.4 KiB | 128,144 |
| 40 | 11.7 µs | 13.5 µs | 40.9 µs | 14.0 KiB | 85,624 |
| 80 | 21.9 µs | 27.5 µs | 71.2 µs | 27.3 KiB | 45,567 |
| 160 | 41.4 µs | 48.3 µs | 124 µs | 53.9 KiB | 24,129 |
| 320 | 85.3 µs | 95.5 µs | 269 µs | 107.0 KiB | 11,724 |
| 640 | 159 µs | 168 µs | 458 µs | 213.3 KiB | 6,283 |
| 1280 | 571 µs | 640 µs | 1.29 ms | 516.0 KiB | 1,751 |
| 2560 | 1.15 ms | 1.24 ms | 2.68 ms | 1.0 MiB | 871 |
| 5120 | 2.30 ms | 2.48 ms | 3.92 ms | 2.1 MiB | 434 |
| 10240 | 4.76 ms | 4.90 ms | 6.94 ms | 4.2 MiB | 210 |

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
| 20 | 2.56 ms | 2.61 ms | 4.47 ms | 1.2 MiB | 390 |
| 40 | 4.68 ms | 4.75 ms | 6.62 ms | 2.5 MiB | 214 |
| 80 | 8.95 ms | 9.04 ms | 11.0 ms | 5.0 MiB | 112 |
| 160 | 17.5 ms | 23.5 ms | 19.8 ms | 10.0 MiB | 57 |
| 320 | 34.7 ms | 34.8 ms | 36.9 ms | 20.0 MiB | 29 |
| 640 | 69.0 ms | 69.5 ms | 71.5 ms | 40.1 MiB | 14 |
| 1280 | 137 ms | 139 ms | 140 ms | 16.1 MiB | 7 |
| 2560 | 273 ms | 278 ms | 275 ms | 32.3 MiB | 4 |
| 5120 | 544 ms | 548 ms | 546 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.09 s | 1.09 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.46 ms | 1.51 ms | 3.40 ms | 645.7 KiB | 684 |
| 40 | 2.53 ms | 2.63 ms | 4.46 ms | 1.3 MiB | 396 |
| 80 | 4.68 ms | 4.83 ms | 6.61 ms | 2.5 MiB | 214 |
| 160 | 8.96 ms | 9.06 ms | 10.9 ms | 5.2 MiB | 112 |
| 320 | 17.6 ms | 18.8 ms | 19.7 ms | 10.6 MiB | 57 |
| 640 | 34.9 ms | 35.5 ms | 37.3 ms | 21.4 MiB | 29 |
| 1280 | 70.3 ms | 71.2 ms | 72.5 ms | 43.6 MiB | 14 |
| 2560 | 141 ms | 142 ms | 144 ms | 25.7 MiB | 7 |
| 5120 | 284 ms | 284 ms | 288 ms | 53.9 MiB | 4 |
| 10240 | 569 ms | 574 ms | 573 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.30, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.79 µs | 15.4 µs | 5.91 µs | 9.3 KiB | 172,714 |
| 40 | 7.59 µs | 9.43 µs | 30.2 µs | 8.4 KiB | 131,706 |
| 80 | 12.3 µs | 12.8 µs | 42.2 µs | 16.2 KiB | 81,358 |
| 160 | 22.7 µs | 25.6 µs | 72.4 µs | 31.8 KiB | 44,127 |
| 320 | 43.1 µs | 45.0 µs | 132 µs | 63.1 KiB | 23,217 |
| 640 | 86.0 µs | 87.7 µs | 251 µs | 127.7 KiB | 11,631 |
| 1280 | 455 µs | 467 µs | 1.18 ms | 340.8 KiB | 2,198 |
| 2560 | 852 µs | 863 µs | 1.64 ms | 694.2 KiB | 1,174 |
| 5120 | 1.85 ms | 1.88 ms | 3.47 ms | 1.3 MiB | 541 |
| 10240 | 3.84 ms | 4.71 ms | 5.71 ms | 2.7 MiB | 261 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.44 µs | 4.66 µs | 17.0 µs | 4.5 KiB | 225,025 |
| 40 | 4.81 µs | 5.02 µs | 16.2 µs | 4.5 KiB | 208,040 |
| 80 | 5.32 µs | 5.65 µs | 21.7 µs | 4.5 KiB | 187,988 |
| 160 | 6.47 µs | 7.28 µs | 25.1 µs | 4.5 KiB | 154,516 |
| 320 | 8.51 µs | 8.92 µs | 31.5 µs | 4.5 KiB | 117,496 |
| 640 | 12.8 µs | 13.5 µs | 44.0 µs | 4.5 KiB | 78,313 |
| 1280 | 21.8 µs | 22.6 µs | 71.6 µs | 4.5 KiB | 45,782 |
| 2560 | 40.0 µs | 40.9 µs | 130 µs | 4.5 KiB | 25,000 |
| 5120 | 72.4 µs | 74.5 µs | 218 µs | 4.5 KiB | 13,808 |
| 10240 | 163 µs | 171 µs | 495 µs | 4.5 KiB | 6,150 |

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
| 20 | 13.1 µs | 15.1 µs | 13.3 µs | 3.7 KiB | 76,540 |
| 40 | 18.7 µs | 20.6 µs | 18.9 µs | 6.3 KiB | 53,610 |
| 80 | 31.1 µs | 34.4 µs | 130 µs | 11.7 KiB | 32,156 |
| 160 | 56.4 µs | 62.7 µs | 221 µs | 22.4 KiB | 17,739 |
| 320 | 91.6 µs | 107 µs | 307 µs | 45.3 KiB | 10,917 |
| 640 | 161 µs | 185 µs | 465 µs | 92.1 KiB | 6,219 |
| 1280 | 298 µs | 321 µs | 808 µs | 191.5 KiB | 3,353 |
| 2560 | 590 µs | 643 µs | 1.38 ms | 360.9 KiB | 1,696 |
| 5120 | 1.29 ms | 1.38 ms | 2.95 ms | 685.3 KiB | 777 |
| 10240 | 2.32 ms | 2.46 ms | 4.01 ms | 1.3 MiB | 430 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.58 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.99 ms | 1.99 ms | 77% |
| `load-exception-registry` | 1 | 544 µs | 544 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 45.3 µs | 1.8% |

**At 10240 entrys** (whole operation: 47.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.5 ms | 32.5 ms | 69% |
| `load-exception-registry` | 1 | 7.34 ms | 7.34 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 7.33 ms | 16% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-13T07:12:03.786Z` → `2026-11-13T07:13:04.893Z` (61 s), ci: CI (run 43381456262)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `b9f0e4b67443ab57e8aa90a4fe3f7d97e5c83d78` on `chore/bump-internal-package-contract-v0.18.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

