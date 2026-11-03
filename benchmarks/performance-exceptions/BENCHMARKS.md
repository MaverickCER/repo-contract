# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.99 ms** per operation compared with a bare-minimum baseline (**301% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.99 ms | 34.0 ms |
| Added latency, relative to baseline | 301% | 324% |
| Added CPU time per operation | 2.73 ms | 33.6 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 503 ops/s | 29 ops/s |

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
| 20 | 28.3 µs | 143 µs | 114 µs | 405% | 392 µs | $0.00024 – $0.0044 |
| 40 | 50.6 µs | 207 µs | 157 µs | 310% | 399 µs | $0.00033 – $0.0045 |
| 80 | 93.0 µs | 404 µs | 311 µs | 334% | 835 µs | $0.00065 – $0.0094 |
| 160 | 176 µs | 678 µs | 502 µs | 285% | 954 µs | $0.001 – $0.011 |
| 320 | 344 µs | 1.36 ms | 1.02 ms | 295% | 2.00 ms | $0.0021 – $0.022 |
| 640 | 661 µs | 2.65 ms | 1.99 ms | 301% | 2.73 ms | $0.0041 – $0.031 |
| 1280 | 1.34 ms | 5.14 ms | 3.80 ms | 284% | 3.84 ms | $0.0079 – $0.043 |
| 2560 | 2.55 ms | 10.1 ms | 7.56 ms | 296% | 7.67 ms | $0.016 – $0.086 |
| 5120 | 5.12 ms | 20.0 ms | 14.9 ms | 290% | 15.0 ms | $0.031 – $0.169 |
| 10240 | 10.5 ms | 44.5 ms | 34.0 ms | 324% | 33.6 ms | $0.071 – $0.377 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 373 µs | 4.26 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.7 µs | 1.42 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 539 µs | 7.31 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.03 ms | 33.4 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 36.8 ms | 580 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 155 µs | 4.45 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 69.8 ms | 1.10 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.3 ms | 571 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 87.0 µs | 3.66 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 12.9 µs | 142 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 185 µs | 2.39 ms |

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
| 20 | 107 µs | 130 µs | 351 µs | 115.4 KiB | 9,330 |
| 40 | 81.5 µs | 88.9 µs | 329 µs | 99.8 KiB | 12,267 |
| 80 | 79.3 µs | 81.9 µs | 243 µs | 120.8 KiB | 12,616 |
| 160 | 112 µs | 117 µs | 358 µs | 159.8 KiB | 8,933 |
| 320 | 155 µs | 164 µs | 450 µs | 237.4 KiB | 6,450 |
| 640 | 373 µs | 555 µs | 1.06 ms | 656.2 KiB | 2,678 |
| 1280 | 536 µs | 548 µs | 1.25 ms | 1.0 MiB | 1,867 |
| 2560 | 1.04 ms | 1.17 ms | 2.41 ms | 2.1 MiB | 960 |
| 5120 | 2.16 ms | 2.26 ms | 3.41 ms | 4.3 MiB | 463 |
| 10240 | 4.26 ms | 4.36 ms | 5.08 ms | 8.6 MiB | 235 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.5 µs | 12.1 µs | 45.4 µs | 17.0 KiB | 87,173 |
| 40 | 11.0 µs | 12.6 µs | 41.5 µs | 16.3 KiB | 90,697 |
| 80 | 14.4 µs | 15.6 µs | 52.5 µs | 20.5 KiB | 69,582 |
| 160 | 20.5 µs | 21.8 µs | 71.2 µs | 28.6 KiB | 48,765 |
| 320 | 33.2 µs | 34.7 µs | 110 µs | 48.2 KiB | 30,095 |
| 640 | 58.7 µs | 61.0 µs | 182 µs | 86.8 KiB | 17,049 |
| 1280 | 117 µs | 122 µs | 333 µs | 166.1 KiB | 8,513 |
| 2560 | 245 µs | 249 µs | 646 µs | 329.7 KiB | 4,089 |
| 5120 | 625 µs | 656 µs | 1.51 ms | 634.3 KiB | 1,601 |
| 10240 | 1.42 ms | 1.47 ms | 3.57 ms | 1.3 MiB | 702 |

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
| 20 | 22.8 µs | 24.4 µs | 88.0 µs | 7.3 KiB | 43,831 |
| 40 | 38.2 µs | 39.8 µs | 114 µs | 13.2 KiB | 26,166 |
| 80 | 73.6 µs | 79.6 µs | 215 µs | 25.1 KiB | 13,586 |
| 160 | 151 µs | 155 µs | 444 µs | 48.9 KiB | 6,640 |
| 320 | 287 µs | 294 µs | 781 µs | 96.5 KiB | 3,483 |
| 640 | 539 µs | 559 µs | 1.28 ms | 191.6 KiB | 1,854 |
| 1280 | 1.09 ms | 1.15 ms | 2.61 ms | 381.9 KiB | 918 |
| 2560 | 1.99 ms | 2.54 ms | 3.66 ms | 761.9 KiB | 503 |
| 5120 | 4.51 ms | 4.63 ms | 6.39 ms | 1.5 MiB | 222 |
| 10240 | 7.31 ms | 7.87 ms | 9.50 ms | 3.0 MiB | 137 |

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
| 20 | 85.9 µs | 97.6 µs | 298 µs | 44.3 KiB | 11,641 |
| 40 | 151 µs | 164 µs | 442 µs | 83.3 KiB | 6,601 |
| 80 | 287 µs | 300 µs | 781 µs | 161.9 KiB | 3,482 |
| 160 | 530 µs | 563 µs | 1.27 ms | 319.5 KiB | 1,885 |
| 320 | 1.07 ms | 1.13 ms | 2.55 ms | 634.7 KiB | 939 |
| 640 | 2.03 ms | 2.15 ms | 3.53 ms | 1.2 MiB | 492 |
| 1280 | 3.84 ms | 3.97 ms | 5.44 ms | 2.5 MiB | 260 |
| 2560 | 7.56 ms | 7.67 ms | 9.29 ms | 4.9 MiB | 132 |
| 5120 | 14.9 ms | 15.3 ms | 17.0 ms | 9.8 MiB | 67 |
| 10240 | 33.4 ms | 33.5 ms | 36.0 ms | 19.7 MiB | 30 |

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
| 20 | 1.96 ms | 2.20 ms | 4.28 ms | 652.5 KiB | 511 |
| 40 | 2.48 ms | 3.67 ms | 4.01 ms | 1.3 MiB | 404 |
| 80 | 4.67 ms | 5.91 ms | 6.18 ms | 2.6 MiB | 214 |
| 160 | 9.17 ms | 11.4 ms | 10.8 ms | 5.3 MiB | 109 |
| 320 | 18.4 ms | 19.6 ms | 21.1 ms | 10.6 MiB | 54 |
| 640 | 36.8 ms | 39.6 ms | 41.9 ms | 21.5 MiB | 27 |
| 1280 | 70.9 ms | 72.1 ms | 73.2 ms | 43.7 MiB | 14 |
| 2560 | 143 ms | 144 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 289 ms | 294 ms | 300 ms | 54.2 MiB | 3 |
| 10240 | 580 ms | 583 ms | 594 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.88 µs | 9.54 µs | 8.26 µs | 7.4 KiB | 126,984 |
| 40 | 11.4 µs | 12.4 µs | 41.2 µs | 14.0 KiB | 87,394 |
| 80 | 26.8 µs | 29.0 µs | 58.0 µs | 27.3 KiB | 37,380 |
| 160 | 39.9 µs | 48.0 µs | 124 µs | 53.9 KiB | 25,091 |
| 320 | 78.3 µs | 110 µs | 231 µs | 107.0 KiB | 12,774 |
| 640 | 155 µs | 185 µs | 455 µs | 213.3 KiB | 6,471 |
| 1280 | 526 µs | 615 µs | 1.27 ms | 516.0 KiB | 1,902 |
| 2560 | 1.10 ms | 1.49 ms | 2.70 ms | 1.0 MiB | 907 |
| 5120 | 2.13 ms | 2.34 ms | 3.75 ms | 2.1 MiB | 469 |
| 10240 | 4.45 ms | 4.73 ms | 7.27 ms | 4.2 MiB | 225 |

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
| 20 | 2.59 ms | 2.67 ms | 4.55 ms | 1.2 MiB | 387 |
| 40 | 4.75 ms | 4.88 ms | 6.76 ms | 2.5 MiB | 211 |
| 80 | 9.07 ms | 9.15 ms | 11.1 ms | 5.0 MiB | 110 |
| 160 | 17.8 ms | 28.9 ms | 19.9 ms | 10.0 MiB | 56 |
| 320 | 35.3 ms | 35.7 ms | 38.0 ms | 20.0 MiB | 28 |
| 640 | 69.8 ms | 71.0 ms | 72.3 ms | 40.1 MiB | 14 |
| 1280 | 140 ms | 140 ms | 143 ms | 16.1 MiB | 7 |
| 2560 | 275 ms | 276 ms | 277 ms | 32.3 MiB | 4 |
| 5120 | 551 ms | 552 ms | 553 ms | 707.4 KiB | 2 |
| 10240 | 1.10 s | 1.11 s | 1.11 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.48 ms | 1.53 ms | 3.45 ms | 645.6 KiB | 674 |
| 40 | 2.59 ms | 2.72 ms | 4.57 ms | 1.3 MiB | 387 |
| 80 | 4.70 ms | 4.78 ms | 6.65 ms | 2.5 MiB | 213 |
| 160 | 9.06 ms | 9.17 ms | 11.1 ms | 5.2 MiB | 110 |
| 320 | 17.7 ms | 21.0 ms | 19.9 ms | 10.6 MiB | 57 |
| 640 | 35.3 ms | 35.4 ms | 37.6 ms | 21.4 MiB | 28 |
| 1280 | 70.6 ms | 70.8 ms | 73.1 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 144 ms | 145 ms | 25.7 MiB | 7 |
| 5120 | 286 ms | 292 ms | 289 ms | 53.9 MiB | 4 |
| 10240 | 571 ms | 575 ms | 576 ms | 46.2 MiB | 2 |

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
| 20 | 5.81 µs | 14.2 µs | 5.95 µs | 9.3 KiB | 172,118 |
| 40 | 7.60 µs | 10.2 µs | 29.7 µs | 8.4 KiB | 131,564 |
| 80 | 12.7 µs | 13.4 µs | 44.1 µs | 16.2 KiB | 78,819 |
| 160 | 23.5 µs | 24.1 µs | 74.6 µs | 31.8 KiB | 42,624 |
| 320 | 44.7 µs | 47.7 µs | 133 µs | 63.1 KiB | 22,368 |
| 640 | 87.0 µs | 89.9 µs | 254 µs | 127.7 KiB | 11,496 |
| 1280 | 435 µs | 447 µs | 1.20 ms | 340.8 KiB | 2,298 |
| 2560 | 806 µs | 827 µs | 1.60 ms | 694.2 KiB | 1,241 |
| 5120 | 1.75 ms | 1.78 ms | 3.40 ms | 1.3 MiB | 571 |
| 10240 | 3.66 ms | 3.86 ms | 5.49 ms | 2.7 MiB | 273 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.47 µs | 4.75 µs | 16.1 µs | 4.5 KiB | 223,570 |
| 40 | 4.93 µs | 5.29 µs | 5.00 µs | 4.5 KiB | 202,896 |
| 80 | 5.58 µs | 5.95 µs | 22.7 µs | 4.5 KiB | 179,235 |
| 160 | 6.47 µs | 6.87 µs | 24.8 µs | 4.5 KiB | 154,535 |
| 320 | 8.62 µs | 8.92 µs | 30.6 µs | 4.5 KiB | 115,949 |
| 640 | 12.9 µs | 13.6 µs | 43.7 µs | 4.5 KiB | 77,379 |
| 1280 | 21.5 µs | 22.6 µs | 69.0 µs | 4.5 KiB | 46,553 |
| 2560 | 39.6 µs | 42.7 µs | 124 µs | 4.5 KiB | 25,275 |
| 5120 | 74.2 µs | 94.0 µs | 223 µs | 4.5 KiB | 13,469 |
| 10240 | 142 µs | 146 µs | 406 µs | 4.5 KiB | 7,040 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 13.1 µs | 15.3 µs | 13.3 µs | 3.6 KiB | 76,612 |
| 40 | 19.3 µs | 21.6 µs | 19.7 µs | 6.3 KiB | 51,683 |
| 80 | 33.7 µs | 36.2 µs | 71.9 µs | 11.7 KiB | 29,655 |
| 160 | 52.2 µs | 63.3 µs | 191 µs | 22.3 KiB | 19,158 |
| 320 | 97.6 µs | 109 µs | 315 µs | 45.3 KiB | 10,249 |
| 640 | 185 µs | 210 µs | 572 µs | 93.6 KiB | 5,419 |
| 1280 | 316 µs | 343 µs | 832 µs | 191.5 KiB | 3,162 |
| 2560 | 585 µs | 609 µs | 1.40 ms | 360.0 KiB | 1,708 |
| 5120 | 1.37 ms | 1.43 ms | 2.96 ms | 685.3 KiB | 730 |
| 10240 | 2.39 ms | 2.56 ms | 4.08 ms | 1.3 MiB | 419 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.65 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.03 ms | 2.03 ms | 77% |
| `load-exception-registry` | 1 | 539 µs | 539 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 77.5 µs | 2.9% |

**At 10240 entrys** (whole operation: 44.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 33.4 ms | 33.4 ms | 75% |
| `load-exception-registry` | 1 | 7.31 ms | 7.31 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.85 ms | 8.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-03T05:08:18.846Z` → `2026-11-03T05:09:23.057Z` (64 s), ci: CI (run 41580298786)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `5edac933ba4b5f1269e56defe92cd43592c4039d` on `chore/dependency-updates`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

