# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.85 ms** per operation compared with a bare-minimum baseline (**282% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.85 ms | 33.1 ms |
| Added latency, relative to baseline | 282% | 333% |
| Added CPU time per operation | 2.60 ms | 32.6 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 541 ops/s | 30 ops/s |

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
| 20 | 28.8 µs | 138 µs | 109 µs | 380% | 380 µs | $0.00023 – $0.0043 |
| 40 | 51.7 µs | 205 µs | 153 µs | 296% | 375 µs | $0.00032 – $0.0042 |
| 80 | 92.7 µs | 357 µs | 264 µs | 285% | 560 µs | $0.00055 – $0.0063 |
| 160 | 177 µs | 654 µs | 478 µs | 271% | 907 µs | $0.001 – $0.010 |
| 320 | 343 µs | 1.30 ms | 953 µs | 277% | 1.93 ms | $0.002 – $0.022 |
| 640 | 655 µs | 2.50 ms | 1.85 ms | 282% | 2.60 ms | $0.0038 – $0.029 |
| 1280 | 1.33 ms | 4.80 ms | 3.47 ms | 261% | 3.48 ms | $0.0072 – $0.039 |
| 2560 | 2.51 ms | 9.65 ms | 7.14 ms | 285% | 7.09 ms | $0.015 – $0.080 |
| 5120 | 4.97 ms | 19.6 ms | 14.7 ms | 295% | 14.9 ms | $0.031 – $0.167 |
| 10240 | 9.94 ms | 43.0 ms | 33.1 ms | 333% | 32.6 ms | $0.069 – $0.366 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 514 µs | 4.33 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 57.4 µs | 1.37 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 538 µs | 7.23 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.91 ms | 32.5 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 36.3 ms | 580 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 152 µs | 4.56 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 68.6 ms | 1.15 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 40.7 ms | 663 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 85.4 µs | 3.82 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 12.7 µs | 149 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 160 µs | 2.29 ms |

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

**Measured: O(n)** (exponent 0.81, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 106 µs | 173 µs | 349 µs | 115.4 KiB | 9,455 |
| 40 | 80.0 µs | 88.2 µs | 320 µs | 99.8 KiB | 12,500 |
| 80 | 78.3 µs | 82.0 µs | 238 µs | 120.8 KiB | 12,772 |
| 160 | 106 µs | 112 µs | 313 µs | 159.3 KiB | 9,473 |
| 320 | 151 µs | 166 µs | 444 µs | 237.4 KiB | 6,616 |
| 640 | 514 µs | 895 µs | 1.94 ms | 670.1 KiB | 1,946 |
| 1280 | 553 µs | 562 µs | 1.28 ms | 1.0 MiB | 1,810 |
| 2560 | 1.11 ms | 1.15 ms | 2.59 ms | 2.1 MiB | 904 |
| 5120 | 2.18 ms | 2.24 ms | 3.59 ms | 4.3 MiB | 458 |
| 10240 | 4.33 ms | 4.44 ms | 5.08 ms | 8.6 MiB | 231 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.6 µs | 12.2 µs | 44.4 µs | 17.0 KiB | 86,538 |
| 40 | 11.5 µs | 12.3 µs | 43.0 µs | 16.3 KiB | 86,954 |
| 80 | 14.2 µs | 15.1 µs | 52.2 µs | 20.5 KiB | 70,314 |
| 160 | 20.6 µs | 21.5 µs | 70.7 µs | 28.6 KiB | 48,652 |
| 320 | 32.0 µs | 33.8 µs | 104 µs | 48.2 KiB | 31,253 |
| 640 | 57.4 µs | 59.5 µs | 178 µs | 86.8 KiB | 17,426 |
| 1280 | 114 µs | 119 µs | 330 µs | 166.1 KiB | 8,774 |
| 2560 | 231 µs | 240 µs | 627 µs | 329.7 KiB | 4,331 |
| 5120 | 600 µs | 617 µs | 1.47 ms | 634.3 KiB | 1,665 |
| 10240 | 1.37 ms | 1.39 ms | 3.48 ms | 1.3 MiB | 733 |

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
| 20 | 21.9 µs | 23.4 µs | 81.7 µs | 7.3 KiB | 45,587 |
| 40 | 38.1 µs | 39.5 µs | 115 µs | 13.2 KiB | 26,279 |
| 80 | 72.8 µs | 75.3 µs | 210 µs | 25.1 KiB | 13,737 |
| 160 | 140 µs | 145 µs | 383 µs | 48.9 KiB | 7,120 |
| 320 | 284 µs | 292 µs | 775 µs | 96.5 KiB | 3,517 |
| 640 | 538 µs | 556 µs | 1.27 ms | 191.6 KiB | 1,858 |
| 1280 | 1.07 ms | 1.10 ms | 2.60 ms | 381.9 KiB | 932 |
| 2560 | 1.98 ms | 2.36 ms | 3.63 ms | 761.9 KiB | 505 |
| 5120 | 4.44 ms | 4.66 ms | 6.28 ms | 1.5 MiB | 225 |
| 10240 | 7.23 ms | 7.45 ms | 9.40 ms | 3.0 MiB | 138 |

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
| 20 | 83.3 µs | 103 µs | 293 µs | 44.3 KiB | 12,000 |
| 40 | 145 µs | 159 µs | 439 µs | 83.3 KiB | 6,919 |
| 80 | 273 µs | 292 µs | 759 µs | 161.9 KiB | 3,667 |
| 160 | 512 µs | 560 µs | 1.24 ms | 319.5 KiB | 1,952 |
| 320 | 1.02 ms | 1.09 ms | 2.47 ms | 634.7 KiB | 980 |
| 640 | 1.91 ms | 1.98 ms | 3.38 ms | 1.2 MiB | 524 |
| 1280 | 3.59 ms | 3.72 ms | 5.14 ms | 2.5 MiB | 278 |
| 2560 | 7.11 ms | 7.24 ms | 8.86 ms | 4.9 MiB | 141 |
| 5120 | 14.2 ms | 14.3 ms | 16.3 ms | 9.8 MiB | 71 |
| 10240 | 32.5 ms | 33.1 ms | 35.1 ms | 19.7 MiB | 31 |

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
| 20 | 1.92 ms | 2.28 ms | 4.16 ms | 652.5 KiB | 522 |
| 40 | 2.47 ms | 3.64 ms | 3.96 ms | 1.3 MiB | 405 |
| 80 | 4.68 ms | 6.33 ms | 6.15 ms | 2.6 MiB | 214 |
| 160 | 9.19 ms | 12.5 ms | 10.8 ms | 5.3 MiB | 109 |
| 320 | 17.7 ms | 19.6 ms | 19.5 ms | 10.6 MiB | 57 |
| 640 | 36.3 ms | 37.4 ms | 41.4 ms | 21.5 MiB | 28 |
| 1280 | 70.9 ms | 72.9 ms | 73.0 ms | 43.7 MiB | 14 |
| 2560 | 142 ms | 148 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 292 ms | 293 ms | 303 ms | 54.2 MiB | 3 |
| 10240 | 580 ms | 582 ms | 591 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.91 µs | 8.97 µs | 8.20 µs | 7.4 KiB | 126,455 |
| 40 | 11.6 µs | 14.3 µs | 41.2 µs | 14.0 KiB | 86,246 |
| 80 | 21.0 µs | 24.7 µs | 68.4 µs | 27.3 KiB | 47,614 |
| 160 | 39.2 µs | 47.6 µs | 122 µs | 53.9 KiB | 25,505 |
| 320 | 76.0 µs | 85.6 µs | 223 µs | 107.0 KiB | 13,155 |
| 640 | 152 µs | 174 µs | 450 µs | 213.3 KiB | 6,594 |
| 1280 | 551 µs | 603 µs | 1.32 ms | 516.0 KiB | 1,814 |
| 2560 | 1.10 ms | 1.23 ms | 2.65 ms | 1.0 MiB | 907 |
| 5120 | 2.20 ms | 2.42 ms | 3.79 ms | 2.1 MiB | 454 |
| 10240 | 4.56 ms | 4.79 ms | 6.66 ms | 4.2 MiB | 219 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.54 ms | 2.60 ms | 4.45 ms | 1.2 MiB | 394 |
| 40 | 4.67 ms | 5.26 ms | 6.59 ms | 2.5 MiB | 214 |
| 80 | 9.31 ms | 9.51 ms | 11.3 ms | 5.0 MiB | 107 |
| 160 | 18.1 ms | 23.3 ms | 20.3 ms | 10.0 MiB | 55 |
| 320 | 35.9 ms | 36.3 ms | 38.5 ms | 20.0 MiB | 28 |
| 640 | 68.6 ms | 71.8 ms | 70.7 ms | 40.1 MiB | 15 |
| 1280 | 138 ms | 144 ms | 141 ms | 16.1 MiB | 7 |
| 2560 | 320 ms | 321 ms | 322 ms | 32.3 MiB | 3 |
| 5120 | 634 ms | 636 ms | 636 ms | 707.4 KiB | 2 |
| 10240 | 1.15 s | 1.16 s | 1.15 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.58 ms | 1.62 ms | 3.46 ms | 645.6 KiB | 633 |
| 40 | 2.85 ms | 2.89 ms | 4.77 ms | 1.3 MiB | 351 |
| 80 | 5.33 ms | 5.47 ms | 7.24 ms | 2.5 MiB | 188 |
| 160 | 10.4 ms | 10.5 ms | 12.3 ms | 5.2 MiB | 96 |
| 320 | 20.5 ms | 21.2 ms | 22.5 ms | 10.6 MiB | 49 |
| 640 | 40.7 ms | 41.1 ms | 42.8 ms | 21.4 MiB | 25 |
| 1280 | 81.6 ms | 82.0 ms | 83.9 ms | 43.6 MiB | 12 |
| 2560 | 165 ms | 166 ms | 168 ms | 25.7 MiB | 6 |
| 5120 | 332 ms | 333 ms | 335 ms | 53.9 MiB | 3 |
| 10240 | 663 ms | 665 ms | 667 ms | 46.2 MiB | 2 |

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
| 20 | 5.84 µs | 14.5 µs | 6.00 µs | 9.3 KiB | 171,095 |
| 40 | 7.53 µs | 9.09 µs | 29.6 µs | 8.4 KiB | 132,798 |
| 80 | 12.3 µs | 13.0 µs | 42.8 µs | 16.2 KiB | 81,135 |
| 160 | 22.6 µs | 23.5 µs | 72.0 µs | 31.8 KiB | 44,192 |
| 320 | 47.1 µs | 49.0 µs | 161 µs | 63.1 KiB | 21,227 |
| 640 | 85.4 µs | 87.3 µs | 253 µs | 127.7 KiB | 11,710 |
| 1280 | 459 µs | 475 µs | 1.21 ms | 340.8 KiB | 2,181 |
| 2560 | 840 µs | 858 µs | 1.62 ms | 694.2 KiB | 1,190 |
| 5120 | 1.85 ms | 1.87 ms | 3.47 ms | 1.3 MiB | 540 |
| 10240 | 3.82 ms | 3.97 ms | 5.65 ms | 2.7 MiB | 262 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.89, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.43 µs | 4.64 µs | 14.2 µs | 4.5 KiB | 225,530 |
| 40 | 4.75 µs | 4.98 µs | 19.9 µs | 4.5 KiB | 210,310 |
| 80 | 5.37 µs | 5.74 µs | 22.2 µs | 4.5 KiB | 186,310 |
| 160 | 6.35 µs | 6.77 µs | 25.0 µs | 4.5 KiB | 157,415 |
| 320 | 8.46 µs | 8.80 µs | 30.3 µs | 4.5 KiB | 118,183 |
| 640 | 12.7 µs | 13.5 µs | 44.0 µs | 4.5 KiB | 78,502 |
| 1280 | 21.3 µs | 22.3 µs | 69.5 µs | 4.5 KiB | 47,036 |
| 2560 | 39.0 µs | 41.8 µs | 123 µs | 4.5 KiB | 25,650 |
| 5120 | 73.2 µs | 81.8 µs | 227 µs | 4.5 KiB | 13,658 |
| 10240 | 149 µs | 153 µs | 463 µs | 4.5 KiB | 6,712 |

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
| 20 | 12.8 µs | 15.1 µs | 13.1 µs | 3.6 KiB | 78,210 |
| 40 | 19.3 µs | 21.1 µs | 19.5 µs | 6.3 KiB | 51,948 |
| 80 | 33.1 µs | 35.1 µs | 33.5 µs | 11.7 KiB | 30,224 |
| 160 | 51.8 µs | 61.8 µs | 189 µs | 22.3 KiB | 19,288 |
| 320 | 79.8 µs | 83.9 µs | 217 µs | 44.6 KiB | 12,526 |
| 640 | 160 µs | 175 µs | 465 µs | 92.1 KiB | 6,266 |
| 1280 | 303 µs | 324 µs | 812 µs | 191.5 KiB | 3,296 |
| 2560 | 569 µs | 589 µs | 1.36 ms | 360.0 KiB | 1,758 |
| 5120 | 1.30 ms | 1.38 ms | 2.85 ms | 685.3 KiB | 771 |
| 10240 | 2.29 ms | 2.37 ms | 3.99 ms | 1.3 MiB | 436 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.50 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.91 ms | 1.91 ms | 76% |
| `load-exception-registry` | 1 | 538 µs | 538 µs | 22% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 55.8 µs | 2.2% |

**At 10240 entrys** (whole operation: 43.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.5 ms | 32.5 ms | 76% |
| `load-exception-registry` | 1 | 7.23 ms | 7.23 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.29 ms | 7.7% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-10T00:07:37.626Z` → `2026-11-10T00:08:43.533Z` (66 s), ci: CI (run 42723432906)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `339a167f0909bfc64f008de8be4c80cd36db513c` on `chore/bump-internal-package-contract-v0.16.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

