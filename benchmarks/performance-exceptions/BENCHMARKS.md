# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.95 ms** per operation compared with a bare-minimum baseline (**292% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.95 ms | 31.5 ms |
| Added latency, relative to baseline | 292% | 301% |
| Added CPU time per operation | 2.76 ms | 31.1 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 514 ops/s | 32 ops/s |

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
| 20 | 31.1 µs | 160 µs | 129 µs | 415% | 516 µs | $0.00027 – $0.0058 |
| 40 | 52.2 µs | 210 µs | 157 µs | 301% | 410 µs | $0.00033 – $0.0046 |
| 80 | 98.6 µs | 410 µs | 312 µs | 316% | 852 µs | $0.00065 – $0.0096 |
| 160 | 189 µs | 675 µs | 486 µs | 257% | 868 µs | $0.001 – $0.0098 |
| 320 | 349 µs | 1.34 ms | 988 µs | 283% | 1.99 ms | $0.0021 – $0.022 |
| 640 | 666 µs | 2.61 ms | 1.95 ms | 292% | 2.76 ms | $0.0041 – $0.031 |
| 1280 | 1.34 ms | 5.00 ms | 3.65 ms | 272% | 3.73 ms | $0.0076 – $0.042 |
| 2560 | 2.55 ms | 9.87 ms | 7.32 ms | 287% | 7.29 ms | $0.015 – $0.082 |
| 5120 | 5.17 ms | 19.6 ms | 14.5 ms | 280% | 14.3 ms | $0.030 – $0.161 |
| 10240 | 10.5 ms | 42.0 ms | 31.5 ms | 301% | 31.1 ms | $0.066 – $0.350 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 382 µs | 4.44 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 59.1 µs | 1.38 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 544 µs | 7.31 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.99 ms | 30.7 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 37.0 ms | 583 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 153 µs | 4.35 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 70.8 ms | 1.11 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.7 ms | 578 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 93.3 µs | 3.55 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.2 µs | 154 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 177 µs | 2.39 ms |

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
| 20 | 115 µs | 143 µs | 421 µs | 115.6 KiB | 8,677 |
| 40 | 76.6 µs | 143 µs | 290 µs | 99.2 KiB | 13,047 |
| 80 | 72.0 µs | 73.3 µs | 188 µs | 123.0 KiB | 13,880 |
| 160 | 107 µs | 118 µs | 324 µs | 159.3 KiB | 9,379 |
| 320 | 159 µs | 162 µs | 464 µs | 237.4 KiB | 6,309 |
| 640 | 382 µs | 540 µs | 1.12 ms | 656.2 KiB | 2,615 |
| 1280 | 532 µs | 548 µs | 1.30 ms | 1.0 MiB | 1,878 |
| 2560 | 1.07 ms | 1.11 ms | 2.62 ms | 2.1 MiB | 933 |
| 5120 | 2.18 ms | 2.21 ms | 3.70 ms | 4.3 MiB | 460 |
| 10240 | 4.44 ms | 4.53 ms | 5.91 ms | 8.6 MiB | 225 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.3 µs | 12.8 µs | 51.3 µs | 17.0 KiB | 81,345 |
| 40 | 12.3 µs | 12.8 µs | 51.3 µs | 16.3 KiB | 81,302 |
| 80 | 14.8 µs | 15.4 µs | 56.1 µs | 20.5 KiB | 67,460 |
| 160 | 21.3 µs | 22.1 µs | 76.2 µs | 28.6 KiB | 47,017 |
| 320 | 33.8 µs | 35.3 µs | 117 µs | 48.3 KiB | 29,623 |
| 640 | 59.1 µs | 61.8 µs | 188 µs | 86.8 KiB | 16,931 |
| 1280 | 113 µs | 116 µs | 332 µs | 166.1 KiB | 8,821 |
| 2560 | 256 µs | 263 µs | 814 µs | 335.9 KiB | 3,913 |
| 5120 | 608 µs | 636 µs | 1.52 ms | 634.3 KiB | 1,645 |
| 10240 | 1.38 ms | 1.43 ms | 3.61 ms | 1.3 MiB | 724 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.7 µs | 25.3 µs | 94.5 µs | 7.3 KiB | 42,152 |
| 40 | 41.2 µs | 42.6 µs | 141 µs | 13.2 KiB | 24,266 |
| 80 | 75.2 µs | 77.3 µs | 223 µs | 25.1 KiB | 13,298 |
| 160 | 150 µs | 153 µs | 447 µs | 48.9 KiB | 6,685 |
| 320 | 294 µs | 367 µs | 807 µs | 96.5 KiB | 3,404 |
| 640 | 544 µs | 597 µs | 1.31 ms | 191.6 KiB | 1,837 |
| 1280 | 1.09 ms | 1.12 ms | 2.65 ms | 381.9 KiB | 921 |
| 2560 | 1.99 ms | 2.34 ms | 3.70 ms | 761.9 KiB | 502 |
| 5120 | 4.44 ms | 4.63 ms | 6.32 ms | 1.5 MiB | 225 |
| 10240 | 7.31 ms | 8.44 ms | 9.55 ms | 3.0 MiB | 137 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 84.4 µs | 92.0 µs | 295 µs | 44.3 KiB | 11,848 |
| 40 | 147 µs | 163 µs | 441 µs | 83.3 KiB | 6,824 |
| 80 | 278 µs | 313 µs | 769 µs | 161.9 KiB | 3,598 |
| 160 | 524 µs | 550 µs | 1.27 ms | 319.5 KiB | 1,909 |
| 320 | 1.04 ms | 1.11 ms | 2.52 ms | 634.8 KiB | 959 |
| 640 | 1.99 ms | 2.07 ms | 3.53 ms | 1.2 MiB | 504 |
| 1280 | 3.72 ms | 3.84 ms | 5.32 ms | 2.5 MiB | 269 |
| 2560 | 7.32 ms | 7.53 ms | 9.11 ms | 4.9 MiB | 137 |
| 5120 | 14.4 ms | 14.6 ms | 16.6 ms | 9.8 MiB | 69 |
| 10240 | 30.7 ms | 31.7 ms | 33.6 ms | 19.7 MiB | 33 |

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
| 20 | 2.00 ms | 2.33 ms | 4.40 ms | 652.5 KiB | 500 |
| 40 | 2.49 ms | 3.57 ms | 4.03 ms | 1.3 MiB | 401 |
| 80 | 4.74 ms | 6.01 ms | 6.32 ms | 2.6 MiB | 211 |
| 160 | 9.28 ms | 11.2 ms | 10.9 ms | 5.3 MiB | 108 |
| 320 | 18.2 ms | 19.9 ms | 20.1 ms | 10.6 MiB | 55 |
| 640 | 37.0 ms | 38.3 ms | 42.1 ms | 21.5 MiB | 27 |
| 1280 | 71.7 ms | 71.9 ms | 74.0 ms | 43.7 MiB | 14 |
| 2560 | 144 ms | 145 ms | 147 ms | 25.9 MiB | 7 |
| 5120 | 294 ms | 304 ms | 306 ms | 54.2 MiB | 3 |
| 10240 | 583 ms | 584 ms | 595 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.15 µs | 9.32 µs | 8.42 µs | 7.4 KiB | 122,649 |
| 40 | 12.2 µs | 14.6 µs | 45.4 µs | 14.0 KiB | 82,264 |
| 80 | 21.2 µs | 27.2 µs | 70.8 µs | 27.3 KiB | 47,215 |
| 160 | 40.1 µs | 53.2 µs | 125 µs | 53.9 KiB | 24,914 |
| 320 | 76.7 µs | 92.6 µs | 232 µs | 107.0 KiB | 13,039 |
| 640 | 153 µs | 202 µs | 460 µs | 213.3 KiB | 6,553 |
| 1280 | 526 µs | 602 µs | 1.30 ms | 516.0 KiB | 1,901 |
| 2560 | 1.06 ms | 1.19 ms | 2.67 ms | 1.0 MiB | 945 |
| 5120 | 2.10 ms | 2.30 ms | 3.76 ms | 2.1 MiB | 476 |
| 10240 | 4.35 ms | 4.69 ms | 7.28 ms | 4.2 MiB | 230 |

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
| 20 | 2.62 ms | 2.68 ms | 4.70 ms | 1.2 MiB | 382 |
| 40 | 4.79 ms | 5.01 ms | 6.93 ms | 2.5 MiB | 209 |
| 80 | 9.15 ms | 9.19 ms | 11.4 ms | 5.0 MiB | 109 |
| 160 | 17.9 ms | 18.2 ms | 20.3 ms | 10.0 MiB | 56 |
| 320 | 35.3 ms | 35.6 ms | 37.7 ms | 20.0 MiB | 28 |
| 640 | 70.8 ms | 73.6 ms | 72.7 ms | 40.1 MiB | 14 |
| 1280 | 140 ms | 141 ms | 143 ms | 16.1 MiB | 7 |
| 2560 | 278 ms | 281 ms | 281 ms | 32.3 MiB | 4 |
| 5120 | 555 ms | 586 ms | 557 ms | 707.4 KiB | 2 |
| 10240 | 1.11 s | 1.11 s | 1.11 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.49 ms | 1.53 ms | 3.44 ms | 645.6 KiB | 671 |
| 40 | 2.60 ms | 2.63 ms | 4.61 ms | 1.3 MiB | 385 |
| 80 | 4.77 ms | 4.85 ms | 6.91 ms | 2.5 MiB | 210 |
| 160 | 9.18 ms | 9.55 ms | 11.5 ms | 5.2 MiB | 109 |
| 320 | 18.0 ms | 18.4 ms | 20.3 ms | 10.6 MiB | 55 |
| 640 | 35.7 ms | 35.8 ms | 38.1 ms | 21.4 MiB | 28 |
| 1280 | 71.5 ms | 71.6 ms | 73.8 ms | 43.6 MiB | 14 |
| 2560 | 144 ms | 145 ms | 146 ms | 25.7 MiB | 7 |
| 5120 | 288 ms | 290 ms | 292 ms | 53.9 MiB | 3 |
| 10240 | 578 ms | 579 ms | 583 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.25, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.06 µs | 14.7 µs | 6.24 µs | 9.3 KiB | 165,149 |
| 40 | 8.18 µs | 9.71 µs | 34.0 µs | 8.4 KiB | 122,180 |
| 80 | 13.3 µs | 13.7 µs | 49.0 µs | 16.2 KiB | 75,232 |
| 160 | 23.4 µs | 24.6 µs | 77.2 µs | 31.8 KiB | 42,688 |
| 320 | 44.6 µs | 45.7 µs | 139 µs | 63.1 KiB | 22,447 |
| 640 | 93.3 µs | 107 µs | 315 µs | 127.6 KiB | 10,715 |
| 1280 | 440 µs | 446 µs | 1.22 ms | 340.8 KiB | 2,275 |
| 2560 | 802 µs | 818 µs | 1.62 ms | 694.2 KiB | 1,248 |
| 5120 | 1.74 ms | 1.81 ms | 3.45 ms | 1.3 MiB | 575 |
| 10240 | 3.55 ms | 3.61 ms | 5.45 ms | 2.7 MiB | 281 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.89, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.52 µs | 4.99 µs | 4.57 µs | 4.5 KiB | 221,214 |
| 40 | 4.84 µs | 5.14 µs | 4.89 µs | 4.5 KiB | 206,490 |
| 80 | 5.80 µs | 6.55 µs | 5.93 µs | 4.5 KiB | 172,538 |
| 160 | 6.71 µs | 7.13 µs | 26.6 µs | 4.5 KiB | 148,969 |
| 320 | 9.08 µs | 9.41 µs | 34.8 µs | 4.5 KiB | 110,084 |
| 640 | 13.2 µs | 13.5 µs | 45.5 µs | 4.5 KiB | 75,959 |
| 1280 | 22.2 µs | 25.7 µs | 74.6 µs | 4.5 KiB | 45,062 |
| 2560 | 39.9 µs | 41.0 µs | 130 µs | 4.5 KiB | 25,042 |
| 5120 | 75.4 µs | 94.4 µs | 231 µs | 4.5 KiB | 13,267 |
| 10240 | 154 µs | 158 µs | 487 µs | 4.5 KiB | 6,505 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.0 µs | 17.0 µs | 14.3 µs | 3.7 KiB | 71,663 |
| 40 | 20.2 µs | 22.8 µs | 20.6 µs | 6.4 KiB | 49,449 |
| 80 | 33.4 µs | 36.7 µs | 109 µs | 11.7 KiB | 29,974 |
| 160 | 56.2 µs | 61.2 µs | 212 µs | 22.4 KiB | 17,790 |
| 320 | 95.0 µs | 111 µs | 319 µs | 45.3 KiB | 10,530 |
| 640 | 177 µs | 205 µs | 562 µs | 93.6 KiB | 5,664 |
| 1280 | 317 µs | 351 µs | 832 µs | 191.5 KiB | 3,151 |
| 2560 | 585 µs | 631 µs | 1.40 ms | 360.0 KiB | 1,711 |
| 5120 | 1.39 ms | 1.55 ms | 3.13 ms | 685.3 KiB | 719 |
| 10240 | 2.39 ms | 2.51 ms | 4.18 ms | 1.3 MiB | 419 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.61 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.99 ms | 1.99 ms | 76% |
| `load-exception-registry` | 1 | 544 µs | 544 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 82.0 µs | 3.1% |

**At 10240 entrys** (whole operation: 42.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 30.7 ms | 30.7 ms | 73% |
| `load-exception-registry` | 1 | 7.31 ms | 7.31 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.98 ms | 9.5% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-23T08:01:00.528Z` → `2026-10-23T08:02:05.149Z` (65 s), ci: CI (run 39919720825)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `3f2e7236938ff50dc39760bdb0dbc9ed7a7337df` on `chore/security-and-dep-updates`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

