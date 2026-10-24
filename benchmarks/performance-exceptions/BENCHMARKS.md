# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.58 ms** per operation compared with a bare-minimum baseline (**264% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.58 ms | 27.9 ms |
| Added latency, relative to baseline | 264% | 319% |
| Added CPU time per operation | 2.48 ms | 27.7 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 631 ops/s | 36 ops/s |

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
| 20 | 27.1 µs | 136 µs | 109 µs | 403% | 441 µs | $0.00023 – $0.005 |
| 40 | 48.0 µs | 195 µs | 147 µs | 307% | 470 µs | $0.00031 – $0.0053 |
| 80 | 84.3 µs | 333 µs | 248 µs | 294% | 669 µs | $0.00052 – $0.0075 |
| 160 | 164 µs | 610 µs | 446 µs | 271% | 1.01 ms | $0.00093 – $0.011 |
| 320 | 314 µs | 1.15 ms | 834 µs | 266% | 2.02 ms | $0.0017 – $0.023 |
| 640 | 601 µs | 2.19 ms | 1.58 ms | 264% | 2.48 ms | $0.0033 – $0.028 |
| 1280 | 1.19 ms | 4.13 ms | 2.94 ms | 247% | 3.08 ms | $0.0061 – $0.035 |
| 2560 | 2.19 ms | 8.19 ms | 6.00 ms | 274% | 5.86 ms | $0.013 – $0.066 |
| 5120 | 4.24 ms | 16.6 ms | 12.4 ms | 291% | 12.5 ms | $0.026 – $0.140 |
| 10240 | 8.72 ms | 36.6 ms | 27.9 ms | 319% | 27.7 ms | $0.058 – $0.312 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 366 µs | 3.72 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 60.4 µs | 1.29 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 477 µs | 6.08 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.69 ms | 27.0 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 33.4 ms | 511 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 145 µs | 4.33 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 61.7 ms | 990 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 31.7 ms | 513 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 84.3 µs | 3.44 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.6 µs | 150 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 157 µs | 2.15 ms |

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

**Measured: O(n)** (exponent 0.86, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 110 µs | 145 µs | 339 µs | 115.6 KiB | 9,067 |
| 40 | 79.4 µs | 117 µs | 264 µs | 99.2 KiB | 12,591 |
| 80 | 82.9 µs | 87.1 µs | 295 µs | 120.8 KiB | 12,064 |
| 160 | 109 µs | 114 µs | 381 µs | 159.3 KiB | 9,160 |
| 320 | 149 µs | 155 µs | 464 µs | 237.1 KiB | 6,733 |
| 640 | 366 µs | 436 µs | 1.30 ms | 656.2 KiB | 2,729 |
| 1280 | 535 µs | 606 µs | 1.49 ms | 1.0 MiB | 1,870 |
| 2560 | 1.05 ms | 1.09 ms | 2.97 ms | 2.1 MiB | 948 |
| 5120 | 1.98 ms | 2.06 ms | 3.79 ms | 4.3 MiB | 504 |
| 10240 | 3.72 ms | 3.94 ms | 4.67 ms | 8.6 MiB | 269 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.11, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 10.7 µs | 11.4 µs | 10.8 µs | 17.0 KiB | 93,436 |
| 40 | 11.0 µs | 11.6 µs | 11.2 µs | 16.3 KiB | 90,917 |
| 80 | 14.4 µs | 15.2 µs | 14.7 µs | 20.5 KiB | 69,320 |
| 160 | 21.4 µs | 23.0 µs | 71.5 µs | 28.6 KiB | 46,729 |
| 320 | 31.5 µs | 36.7 µs | 113 µs | 48.2 KiB | 31,768 |
| 640 | 60.4 µs | 64.1 µs | 218 µs | 86.8 KiB | 16,559 |
| 1280 | 119 µs | 124 µs | 392 µs | 166.1 KiB | 8,391 |
| 2560 | 243 µs | 258 µs | 773 µs | 329.7 KiB | 4,115 |
| 5120 | 592 µs | 610 µs | 1.74 ms | 634.3 KiB | 1,688 |
| 10240 | 1.29 ms | 1.34 ms | 3.98 ms | 1.3 MiB | 776 |

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
| 20 | 21.0 µs | 21.9 µs | 21.4 µs | 7.3 KiB | 47,530 |
| 40 | 35.6 µs | 38.2 µs | 136 µs | 13.2 KiB | 28,076 |
| 80 | 65.9 µs | 69.1 µs | 231 µs | 25.1 KiB | 15,167 |
| 160 | 127 µs | 134 µs | 425 µs | 48.9 KiB | 7,850 |
| 320 | 238 µs | 249 µs | 713 µs | 96.5 KiB | 4,206 |
| 640 | 477 µs | 503 µs | 1.44 ms | 191.6 KiB | 2,095 |
| 1280 | 849 µs | 888 µs | 1.84 ms | 381.6 KiB | 1,178 |
| 2560 | 1.75 ms | 2.04 ms | 3.90 ms | 761.9 KiB | 571 |
| 5120 | 3.69 ms | 3.90 ms | 5.98 ms | 1.5 MiB | 271 |
| 10240 | 6.08 ms | 6.54 ms | 8.81 ms | 3.0 MiB | 164 |

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
| 20 | 87.7 µs | 97.0 µs | 288 µs | 44.5 KiB | 11,401 |
| 40 | 140 µs | 152 µs | 498 µs | 83.3 KiB | 7,158 |
| 80 | 259 µs | 279 µs | 862 µs | 161.9 KiB | 3,862 |
| 160 | 468 µs | 511 µs | 1.36 ms | 319.5 KiB | 2,136 |
| 320 | 937 µs | 1.01 ms | 2.77 ms | 634.8 KiB | 1,067 |
| 640 | 1.69 ms | 1.77 ms | 3.60 ms | 1.2 MiB | 593 |
| 1280 | 3.08 ms | 3.18 ms | 5.00 ms | 2.5 MiB | 324 |
| 2560 | 6.04 ms | 6.19 ms | 8.20 ms | 4.9 MiB | 165 |
| 5120 | 12.0 ms | 12.4 ms | 14.5 ms | 9.8 MiB | 83 |
| 10240 | 27.0 ms | 27.4 ms | 30.4 ms | 19.7 MiB | 37 |

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
| 20 | 1.88 ms | 2.19 ms | 4.76 ms | 652.5 KiB | 531 |
| 40 | 2.25 ms | 3.51 ms | 4.21 ms | 1.3 MiB | 444 |
| 80 | 4.20 ms | 5.61 ms | 6.15 ms | 2.6 MiB | 238 |
| 160 | 8.12 ms | 10.5 ms | 10.3 ms | 5.3 MiB | 123 |
| 320 | 16.1 ms | 18.0 ms | 18.2 ms | 10.6 MiB | 62 |
| 640 | 33.4 ms | 35.5 ms | 39.3 ms | 21.5 MiB | 30 |
| 1280 | 63.1 ms | 64.9 ms | 66.1 ms | 43.7 MiB | 16 |
| 2560 | 128 ms | 132 ms | 131 ms | 25.9 MiB | 8 |
| 5120 | 257 ms | 258 ms | 268 ms | 54.3 MiB | 4 |
| 10240 | 511 ms | 514 ms | 524 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.92 µs | 9.44 µs | 7.22 µs | 7.4 KiB | 144,472 |
| 40 | 11.5 µs | 12.2 µs | 35.0 µs | 14.0 KiB | 86,814 |
| 80 | 20.5 µs | 22.0 µs | 79.0 µs | 27.3 KiB | 48,709 |
| 160 | 38.4 µs | 43.1 µs | 135 µs | 53.9 KiB | 26,075 |
| 320 | 72.7 µs | 85.8 µs | 236 µs | 107.0 KiB | 13,754 |
| 640 | 145 µs | 171 µs | 470 µs | 213.3 KiB | 6,875 |
| 1280 | 541 µs | 597 µs | 1.50 ms | 516.0 KiB | 1,850 |
| 2560 | 1.11 ms | 1.19 ms | 3.19 ms | 1.0 MiB | 904 |
| 5120 | 2.08 ms | 2.23 ms | 4.14 ms | 2.1 MiB | 480 |
| 10240 | 4.33 ms | 4.49 ms | 6.99 ms | 4.2 MiB | 231 |

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
| 20 | 2.32 ms | 2.39 ms | 4.81 ms | 1.2 MiB | 431 |
| 40 | 4.14 ms | 4.33 ms | 6.60 ms | 2.5 MiB | 241 |
| 80 | 8.04 ms | 8.23 ms | 10.6 ms | 5.0 MiB | 124 |
| 160 | 15.7 ms | 16.2 ms | 18.4 ms | 10.0 MiB | 64 |
| 320 | 30.9 ms | 31.2 ms | 33.7 ms | 20.0 MiB | 32 |
| 640 | 61.7 ms | 62.6 ms | 64.9 ms | 40.1 MiB | 16 |
| 1280 | 124 ms | 125 ms | 127 ms | 16.1 MiB | 8 |
| 2560 | 246 ms | 255 ms | 249 ms | 32.3 MiB | 4 |
| 5120 | 496 ms | 496 ms | 499 ms | 707.4 KiB | 2 |
| 10240 | 990 ms | 1.01 s | 994 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.36 ms | 1.42 ms | 3.84 ms | 645.6 KiB | 733 |
| 40 | 2.32 ms | 2.43 ms | 4.81 ms | 1.3 MiB | 432 |
| 80 | 4.26 ms | 4.44 ms | 6.78 ms | 2.5 MiB | 234 |
| 160 | 8.32 ms | 8.49 ms | 10.9 ms | 5.2 MiB | 120 |
| 320 | 16.2 ms | 16.5 ms | 19.0 ms | 10.6 MiB | 62 |
| 640 | 31.7 ms | 32.2 ms | 34.5 ms | 21.4 MiB | 32 |
| 1280 | 63.7 ms | 63.9 ms | 66.6 ms | 43.6 MiB | 16 |
| 2560 | 128 ms | 129 ms | 131 ms | 25.7 MiB | 8 |
| 5120 | 256 ms | 258 ms | 261 ms | 53.9 MiB | 4 |
| 10240 | 513 ms | 516 ms | 518 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.26, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.29 µs | 12.2 µs | 5.44 µs | 9.3 KiB | 189,044 |
| 40 | 6.89 µs | 8.46 µs | 11.7 µs | 8.4 KiB | 145,161 |
| 80 | 12.6 µs | 13.2 µs | 52.1 µs | 16.2 KiB | 79,222 |
| 160 | 22.7 µs | 23.5 µs | 85.5 µs | 31.8 KiB | 44,138 |
| 320 | 42.1 µs | 44.6 µs | 150 µs | 63.1 KiB | 23,781 |
| 640 | 84.3 µs | 89.3 µs | 303 µs | 127.7 KiB | 11,856 |
| 1280 | 458 µs | 482 µs | 1.48 ms | 340.8 KiB | 2,182 |
| 2560 | 807 µs | 835 µs | 1.84 ms | 694.2 KiB | 1,240 |
| 5120 | 1.72 ms | 1.79 ms | 3.84 ms | 1.3 MiB | 582 |
| 10240 | 3.44 ms | 3.52 ms | 5.79 ms | 2.7 MiB | 291 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.88 µs | 4.11 µs | 3.92 µs | 4.5 KiB | 257,408 |
| 40 | 4.20 µs | 4.42 µs | 4.25 µs | 4.5 KiB | 237,908 |
| 80 | 4.83 µs | 5.07 µs | 4.90 µs | 4.5 KiB | 206,960 |
| 160 | 6.04 µs | 6.29 µs | 6.13 µs | 4.5 KiB | 165,656 |
| 320 | 8.69 µs | 9.01 µs | 14.2 µs | 4.5 KiB | 115,086 |
| 640 | 13.6 µs | 14.2 µs | 36.9 µs | 4.5 KiB | 73,382 |
| 1280 | 22.0 µs | 24.2 µs | 86.3 µs | 4.5 KiB | 45,405 |
| 2560 | 37.9 µs | 41.3 µs | 136 µs | 4.5 KiB | 26,365 |
| 5120 | 74.3 µs | 79.1 µs | 270 µs | 4.5 KiB | 13,455 |
| 10240 | 150 µs | 159 µs | 561 µs | 4.5 KiB | 6,675 |

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
| 20 | 14.0 µs | 17.2 µs | 14.3 µs | 3.7 KiB | 71,624 |
| 40 | 18.5 µs | 20.2 µs | 19.0 µs | 6.4 KiB | 53,943 |
| 80 | 29.2 µs | 31.2 µs | 30.9 µs | 11.7 KiB | 34,253 |
| 160 | 49.9 µs | 52.5 µs | 81.6 µs | 22.4 KiB | 20,060 |
| 320 | 90.7 µs | 95.6 µs | 369 µs | 45.3 KiB | 11,020 |
| 640 | 157 µs | 176 µs | 554 µs | 92.1 KiB | 6,363 |
| 1280 | 301 µs | 324 µs | 974 µs | 191.5 KiB | 3,326 |
| 2560 | 553 µs | 621 µs | 1.62 ms | 360.9 KiB | 1,808 |
| 5120 | 1.23 ms | 1.28 ms | 3.27 ms | 685.3 KiB | 816 |
| 10240 | 2.15 ms | 2.26 ms | 4.33 ms | 1.3 MiB | 465 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.19 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.69 ms | 1.69 ms | 77% |
| `load-exception-registry` | 1 | 477 µs | 477 µs | 22% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 21.8 µs | 1.0% |

**At 10240 entrys** (whole operation: 36.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 27.0 ms | 27.0 ms | 74% |
| `load-exception-registry` | 1 | 6.08 ms | 6.08 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.48 ms | 9.5% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-24T13:24:04.982Z` → `2026-10-24T13:25:08.013Z` (63 s), ci: CI (run 40096835946)
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `72d58e9411c9b1d4c7f13c886abb5de93dbb6068` on `chore/zod-4-6-7`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

