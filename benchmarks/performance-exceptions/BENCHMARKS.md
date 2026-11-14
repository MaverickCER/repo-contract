# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.82 ms** per operation compared with a bare-minimum baseline (**247% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.06). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.82 ms | 38.1 ms |
| Added latency, relative to baseline | 247% | 403% |
| Added CPU time per operation | 1.86 ms | 38.8 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 548 ops/s | 26 ops/s |

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
| 20 | 43.5 µs | 210 µs | 168 µs | 386% | 167 µs | $0.00035 – $0.0019 |
| 40 | 70.3 µs | 313 µs | 243 µs | 345% | 247 µs | $0.00051 – $0.0028 |
| 80 | 123 µs | 517 µs | 393 µs | 321% | 1.84 ms | $0.00082 – $0.021 |
| 160 | 236 µs | 792 µs | 546 µs | 231% | 1.99 ms | $0.0011 – $0.022 |
| 320 | 458 µs | 1.37 ms | 906 µs | 198% | 952 µs | $0.0019 – $0.011 |
| 640 | 740 µs | 2.57 ms | 1.82 ms | 247% | 1.86 ms | $0.0038 – $0.021 |
| 1280 | 1.25 ms | 4.89 ms | 3.66 ms | 293% | 3.68 ms | $0.0076 – $0.041 |
| 2560 | 2.35 ms | 9.65 ms | 7.29 ms | 311% | 7.50 ms | $0.015 – $0.084 |
| 5120 | 4.70 ms | 21.6 ms | 16.9 ms | 360% | 17.3 ms | $0.035 – $0.194 |
| 10240 | 9.46 ms | 47.8 ms | 38.1 ms | 403% | 38.8 ms | $0.079 – $0.437 |

**How the total grows:** O(n) (linear), exponent 1.06 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 388 µs | 4.32 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 62.4 µs | 1.39 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 544 µs | 7.35 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.91 ms | 32.5 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 37.1 ms | 582 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 153 µs | 4.66 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 70.0 ms | 1.10 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.5 ms | 575 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 80.3 µs | 3.81 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 12.8 µs | 182 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 165 µs | 2.33 ms |

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

**Measured: O(n)** (exponent 0.90, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 113 µs | 143 µs | 404 µs | 115.6 KiB | 8,863 |
| 40 | 78.9 µs | 118 µs | 291 µs | 99.2 KiB | 12,669 |
| 80 | 79.0 µs | 82.8 µs | 242 µs | 120.8 KiB | 12,658 |
| 160 | 108 µs | 114 µs | 320 µs | 159.3 KiB | 9,296 |
| 320 | 157 µs | 196 µs | 452 µs | 237.4 KiB | 6,380 |
| 640 | 388 µs | 567 µs | 1.12 ms | 656.2 KiB | 2,575 |
| 1280 | 552 µs | 563 µs | 1.28 ms | 1.0 MiB | 1,812 |
| 2560 | 1.09 ms | 1.13 ms | 2.51 ms | 2.1 MiB | 914 |
| 5120 | 2.21 ms | 2.26 ms | 3.65 ms | 4.3 MiB | 453 |
| 10240 | 4.32 ms | 4.44 ms | 4.85 ms | 8.6 MiB | 231 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.14, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.9 µs | 12.4 µs | 46.8 µs | 17.0 KiB | 84,202 |
| 40 | 13.0 µs | 14.0 µs | 53.7 µs | 16.3 KiB | 77,052 |
| 80 | 16.4 µs | 17.2 µs | 65.8 µs | 20.5 KiB | 61,095 |
| 160 | 21.1 µs | 21.6 µs | 71.8 µs | 28.6 KiB | 47,476 |
| 320 | 32.8 µs | 34.9 µs | 107 µs | 48.2 KiB | 30,450 |
| 640 | 62.4 µs | 66.5 µs | 196 µs | 86.8 KiB | 16,027 |
| 1280 | 114 µs | 116 µs | 322 µs | 166.1 KiB | 8,808 |
| 2560 | 248 µs | 252 µs | 661 µs | 329.7 KiB | 4,040 |
| 5120 | 620 µs | 639 µs | 1.52 ms | 634.3 KiB | 1,612 |
| 10240 | 1.39 ms | 1.46 ms | 3.55 ms | 1.3 MiB | 718 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.5 µs | 27.2 µs | 91.8 µs | 7.3 KiB | 42,565 |
| 40 | 38.6 µs | 39.9 µs | 116 µs | 13.2 KiB | 25,933 |
| 80 | 74.1 µs | 76.1 µs | 213 µs | 25.1 KiB | 13,487 |
| 160 | 144 µs | 157 µs | 392 µs | 48.9 KiB | 6,947 |
| 320 | 286 µs | 293 µs | 782 µs | 96.5 KiB | 3,501 |
| 640 | 544 µs | 554 µs | 1.28 ms | 191.6 KiB | 1,839 |
| 1280 | 1.09 ms | 1.13 ms | 2.62 ms | 381.9 KiB | 920 |
| 2560 | 2.00 ms | 2.36 ms | 3.69 ms | 761.9 KiB | 500 |
| 5120 | 4.49 ms | 4.63 ms | 6.34 ms | 1.5 MiB | 223 |
| 10240 | 7.35 ms | 7.83 ms | 9.62 ms | 3.0 MiB | 136 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 89.7 µs | 107 µs | 324 µs | 44.5 KiB | 11,154 |
| 40 | 145 µs | 156 µs | 418 µs | 83.3 KiB | 6,905 |
| 80 | 271 µs | 304 µs | 733 µs | 161.9 KiB | 3,684 |
| 160 | 507 µs | 566 µs | 1.20 ms | 319.5 KiB | 1,974 |
| 320 | 1.01 ms | 1.11 ms | 2.44 ms | 634.8 KiB | 991 |
| 640 | 1.91 ms | 2.03 ms | 3.38 ms | 1.2 MiB | 523 |
| 1280 | 3.58 ms | 3.67 ms | 5.08 ms | 2.5 MiB | 279 |
| 2560 | 7.12 ms | 7.35 ms | 8.99 ms | 4.9 MiB | 140 |
| 5120 | 14.0 ms | 14.7 ms | 16.2 ms | 9.8 MiB | 71 |
| 10240 | 32.5 ms | 34.4 ms | 35.4 ms | 19.7 MiB | 31 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.93 ms | 2.30 ms | 4.25 ms | 652.5 KiB | 519 |
| 40 | 2.50 ms | 3.73 ms | 4.04 ms | 1.3 MiB | 399 |
| 80 | 4.71 ms | 5.74 ms | 6.21 ms | 2.6 MiB | 212 |
| 160 | 9.24 ms | 11.1 ms | 10.8 ms | 5.3 MiB | 108 |
| 320 | 18.1 ms | 20.0 ms | 20.2 ms | 10.6 MiB | 55 |
| 640 | 37.1 ms | 40.4 ms | 42.2 ms | 21.5 MiB | 27 |
| 1280 | 71.0 ms | 71.8 ms | 73.2 ms | 43.7 MiB | 14 |
| 2560 | 143 ms | 145 ms | 146 ms | 25.9 MiB | 7 |
| 5120 | 291 ms | 295 ms | 302 ms | 54.2 MiB | 3 |
| 10240 | 582 ms | 584 ms | 594 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.19, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.66 µs | 9.36 µs | 7.83 µs | 7.4 KiB | 130,470 |
| 40 | 12.1 µs | 14.4 µs | 44.1 µs | 14.0 KiB | 82,656 |
| 80 | 21.2 µs | 25.5 µs | 69.5 µs | 27.3 KiB | 47,121 |
| 160 | 44.4 µs | 47.5 µs | 160 µs | 53.9 KiB | 22,520 |
| 320 | 77.2 µs | 80.2 µs | 228 µs | 107.0 KiB | 12,956 |
| 640 | 153 µs | 166 µs | 462 µs | 213.3 KiB | 6,546 |
| 1280 | 558 µs | 617 µs | 1.34 ms | 516.0 KiB | 1,793 |
| 2560 | 1.12 ms | 1.22 ms | 2.70 ms | 1.0 MiB | 890 |
| 5120 | 2.24 ms | 2.42 ms | 3.88 ms | 2.1 MiB | 447 |
| 10240 | 4.66 ms | 4.87 ms | 6.82 ms | 4.2 MiB | 215 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.58 ms | 2.66 ms | 4.58 ms | 1.2 MiB | 388 |
| 40 | 4.74 ms | 4.88 ms | 6.79 ms | 2.5 MiB | 211 |
| 80 | 9.09 ms | 9.20 ms | 11.2 ms | 5.0 MiB | 110 |
| 160 | 17.8 ms | 24.6 ms | 20.1 ms | 10.0 MiB | 56 |
| 320 | 35.1 ms | 35.3 ms | 37.5 ms | 20.0 MiB | 29 |
| 640 | 70.0 ms | 71.6 ms | 72.5 ms | 40.1 MiB | 14 |
| 1280 | 139 ms | 144 ms | 143 ms | 16.1 MiB | 7 |
| 2560 | 275 ms | 276 ms | 278 ms | 32.3 MiB | 4 |
| 5120 | 550 ms | 567 ms | 553 ms | 707.4 KiB | 2 |
| 10240 | 1.10 s | 1.11 s | 1.10 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.48 ms | 1.53 ms | 3.45 ms | 645.7 KiB | 675 |
| 40 | 2.57 ms | 2.62 ms | 4.58 ms | 1.3 MiB | 390 |
| 80 | 4.75 ms | 5.80 ms | 6.85 ms | 2.5 MiB | 211 |
| 160 | 9.10 ms | 9.19 ms | 11.2 ms | 5.2 MiB | 110 |
| 320 | 17.9 ms | 18.2 ms | 20.2 ms | 10.6 MiB | 56 |
| 640 | 35.5 ms | 40.1 ms | 37.9 ms | 21.4 MiB | 28 |
| 1280 | 70.9 ms | 71.2 ms | 73.2 ms | 43.6 MiB | 14 |
| 2560 | 143 ms | 146 ms | 145 ms | 25.7 MiB | 7 |
| 5120 | 287 ms | 288 ms | 291 ms | 53.9 MiB | 3 |
| 10240 | 575 ms | 579 ms | 580 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.32, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.86 µs | 15.3 µs | 6.05 µs | 9.3 KiB | 170,719 |
| 40 | 8.26 µs | 9.50 µs | 28.3 µs | 8.4 KiB | 121,101 |
| 80 | 11.3 µs | 13.1 µs | 34.4 µs | 16.2 KiB | 88,528 |
| 160 | 26.5 µs | 29.9 µs | 103 µs | 31.9 KiB | 37,707 |
| 320 | 48.0 µs | 49.7 µs | 165 µs | 63.1 KiB | 20,836 |
| 640 | 80.3 µs | 82.9 µs | 219 µs | 127.8 KiB | 12,455 |
| 1280 | 463 µs | 475 µs | 1.24 ms | 340.8 KiB | 2,162 |
| 2560 | 852 µs | 865 µs | 1.67 ms | 694.2 KiB | 1,174 |
| 5120 | 1.87 ms | 2.03 ms | 3.53 ms | 1.3 MiB | 536 |
| 10240 | 3.81 ms | 3.92 ms | 5.68 ms | 2.7 MiB | 262 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.94, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.44 µs | 4.70 µs | 9.78 µs | 4.5 KiB | 225,376 |
| 40 | 4.76 µs | 4.98 µs | 17.3 µs | 4.5 KiB | 210,171 |
| 80 | 5.54 µs | 5.79 µs | 23.1 µs | 4.5 KiB | 180,564 |
| 160 | 6.94 µs | 7.30 µs | 29.0 µs | 4.5 KiB | 143,997 |
| 320 | 8.77 µs | 10.2 µs | 33.9 µs | 4.5 KiB | 114,004 |
| 640 | 12.8 µs | 13.9 µs | 44.5 µs | 4.5 KiB | 77,897 |
| 1280 | 21.9 µs | 23.2 µs | 75.7 µs | 4.5 KiB | 45,576 |
| 2560 | 39.0 µs | 40.5 µs | 124 µs | 4.5 KiB | 25,615 |
| 5120 | 74.0 µs | 76.0 µs | 223 µs | 4.5 KiB | 13,509 |
| 10240 | 182 µs | 196 µs | 607 µs | 4.6 KiB | 5,490 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 13.5 µs | 16.3 µs | 13.8 µs | 3.7 KiB | 74,004 |
| 40 | 20.3 µs | 23.5 µs | 20.6 µs | 6.4 KiB | 49,343 |
| 80 | 33.8 µs | 35.3 µs | 73.8 µs | 11.7 KiB | 29,561 |
| 160 | 53.3 µs | 56.7 µs | 194 µs | 22.4 KiB | 18,775 |
| 320 | 89.3 µs | 104 µs | 285 µs | 45.0 KiB | 11,204 |
| 640 | 165 µs | 191 µs | 478 µs | 92.1 KiB | 6,070 |
| 1280 | 306 µs | 330 µs | 824 µs | 191.5 KiB | 3,273 |
| 2560 | 595 µs | 660 µs | 1.40 ms | 360.9 KiB | 1,681 |
| 5120 | 1.32 ms | 1.44 ms | 3.03 ms | 685.3 KiB | 758 |
| 10240 | 2.33 ms | 2.43 ms | 4.11 ms | 1.3 MiB | 429 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.57 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.91 ms | 1.91 ms | 75% |
| `load-exception-registry` | 1 | 544 µs | 544 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 109 µs | 4.2% |

**At 10240 entrys** (whole operation: 47.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.5 ms | 32.5 ms | 68% |
| `load-exception-registry` | 1 | 7.35 ms | 7.35 ms | 15% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 7.86 ms | 16% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T16:34:27.704Z` → `2026-11-14T16:35:29.471Z` (62 s), ci: CI (run 43614141719)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `e51d919788d6962ecef60859eb6b4ce6f35220a0` on `fix/review-gaps-2026-11-13`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

