# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **961 µs** per operation compared with a bare-minimum baseline (**241% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.05). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 961 µs | 19.0 ms |
| Added latency, relative to baseline | 241% | 359% |
| Added CPU time per operation | 970 µs | 19.5 ms |
| Added memory per operation (heap delta) | 1.5 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 1,040 ops/s | 53 ops/s |

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
| 20 | 24.0 µs | 112 µs | 87.9 µs | 366% | 89.0 µs | $0.00018 – $0.001 |
| 40 | 37.4 µs | 166 µs | 130 µs | 347% | 131 µs | $0.00027 – $0.0015 |
| 80 | 69.3 µs | 290 µs | 224 µs | 324% | 956 µs | $0.00047 – $0.011 |
| 160 | 129 µs | 452 µs | 323 µs | 250% | 1.30 ms | $0.00067 – $0.015 |
| 320 | 241 µs | 700 µs | 457 µs | 190% | 1.42 ms | $0.00095 – $0.016 |
| 640 | 399 µs | 1.36 ms | 961 µs | 241% | 970 µs | $0.002 – $0.011 |
| 1280 | 693 µs | 2.58 ms | 1.89 ms | 272% | 1.89 ms | $0.0039 – $0.021 |
| 2560 | 1.29 ms | 5.12 ms | 3.83 ms | 296% | 3.91 ms | $0.008 – $0.044 |
| 5120 | 2.64 ms | 11.8 ms | 9.18 ms | 348% | 9.58 ms | $0.019 – $0.108 |
| 10240 | 5.31 ms | 24.4 ms | 19.0 ms | 359% | 19.5 ms | $0.040 – $0.219 |

**How the total grows:** O(n) (linear), exponent 1.05 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 221 µs | 2.58 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 32.1 µs | 804 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 287 µs | 3.97 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.01 ms | 17.1 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 18.9 ms | 311 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 65.8 µs | 2.52 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 37.2 ms | 575 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 18.4 ms | 300 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 40.4 µs | 2.17 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 6.50 µs | 69.7 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 85.7 µs | 1.44 ms |

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

**Measured: O(n)** (exponent 0.92, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 55.5 µs | 66.9 µs | 164 µs | 120.0 KiB | 18,025 |
| 40 | 42.5 µs | 46.0 µs | 164 µs | 98.8 KiB | 23,508 |
| 80 | 40.9 µs | 42.5 µs | 102 µs | 123.3 KiB | 24,456 |
| 160 | 54.3 µs | 56.6 µs | 134 µs | 158.1 KiB | 18,414 |
| 320 | 79.8 µs | 83.2 µs | 202 µs | 239.2 KiB | 12,532 |
| 640 | 221 µs | 294 µs | 691 µs | 656.2 KiB | 4,528 |
| 1280 | 297 µs | 395 µs | 629 µs | 1.0 MiB | 3,371 |
| 2560 | 536 µs | 554 µs | 969 µs | 2.1 MiB | 1,865 |
| 5120 | 1.25 ms | 1.35 ms | 2.17 ms | 4.3 MiB | 800 |
| 10240 | 2.58 ms | 2.70 ms | 3.43 ms | 8.6 MiB | 387 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.20, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.15 µs | 6.51 µs | 24.2 µs | 17.0 KiB | 162,539 |
| 40 | 6.13 µs | 6.52 µs | 22.6 µs | 16.3 KiB | 163,220 |
| 80 | 7.03 µs | 7.29 µs | 21.7 µs | 20.5 KiB | 142,202 |
| 160 | 10.1 µs | 10.7 µs | 30.0 µs | 28.6 KiB | 98,655 |
| 320 | 17.8 µs | 18.4 µs | 51.2 µs | 48.3 KiB | 56,069 |
| 640 | 32.1 µs | 33.1 µs | 81.9 µs | 86.6 KiB | 31,176 |
| 1280 | 59.9 µs | 63.0 µs | 149 µs | 171.0 KiB | 16,695 |
| 2560 | 131 µs | 138 µs | 316 µs | 338.6 KiB | 7,623 |
| 5120 | 403 µs | 413 µs | 1.01 ms | 634.3 KiB | 2,482 |
| 10240 | 804 µs | 853 µs | 1.51 ms | 1.3 MiB | 1,244 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.0 µs | 16.4 µs | 14.3 µs | 7.3 KiB | 71,226 |
| 40 | 19.9 µs | 39.7 µs | 53.9 µs | 13.2 KiB | 50,296 |
| 80 | 36.6 µs | 38.3 µs | 90.4 µs | 25.1 KiB | 27,293 |
| 160 | 74.4 µs | 77.2 µs | 185 µs | 48.9 KiB | 13,434 |
| 320 | 144 µs | 148 µs | 310 µs | 96.4 KiB | 6,961 |
| 640 | 287 µs | 306 µs | 617 µs | 191.5 KiB | 3,489 |
| 1280 | 538 µs | 584 µs | 1.05 ms | 381.6 KiB | 1,858 |
| 2560 | 1.23 ms | 1.36 ms | 2.29 ms | 761.9 KiB | 811 |
| 5120 | 2.54 ms | 2.64 ms | 3.71 ms | 1.5 MiB | 394 |
| 10240 | 3.97 ms | 4.05 ms | 5.38 ms | 3.0 MiB | 252 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 40.5 µs | 50.9 µs | 147 µs | 44.0 KiB | 24,692 |
| 40 | 62.6 µs | 70.5 µs | 159 µs | 82.7 KiB | 15,963 |
| 80 | 121 µs | 128 µs | 282 µs | 161.1 KiB | 8,284 |
| 160 | 227 µs | 241 µs | 468 µs | 318.1 KiB | 4,396 |
| 320 | 459 µs | 493 µs | 944 µs | 632.2 KiB | 2,178 |
| 640 | 1.01 ms | 1.07 ms | 2.00 ms | 1.2 MiB | 994 |
| 1280 | 1.84 ms | 1.92 ms | 2.87 ms | 2.5 MiB | 543 |
| 2560 | 3.57 ms | 3.69 ms | 4.74 ms | 4.9 MiB | 280 |
| 5120 | 7.26 ms | 7.39 ms | 8.67 ms | 9.8 MiB | 138 |
| 10240 | 17.1 ms | 21.4 ms | 19.1 ms | 19.7 MiB | 58 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.12 ms | 1.45 ms | 2.72 ms | 652.5 KiB | 893 |
| 40 | 1.30 ms | 2.10 ms | 2.30 ms | 1.3 MiB | 767 |
| 80 | 2.46 ms | 3.37 ms | 3.45 ms | 2.6 MiB | 407 |
| 160 | 4.81 ms | 5.92 ms | 5.90 ms | 5.2 MiB | 208 |
| 320 | 9.49 ms | 10.6 ms | 10.6 ms | 10.6 MiB | 105 |
| 640 | 18.9 ms | 19.5 ms | 20.1 ms | 21.4 MiB | 53 |
| 1280 | 38.0 ms | 41.1 ms | 39.9 ms | 43.7 MiB | 26 |
| 2560 | 76.6 ms | 83.6 ms | 78.9 ms | 25.9 MiB | 13 |
| 5120 | 157 ms | 158 ms | 163 ms | 54.2 MiB | 6 |
| 10240 | 311 ms | 313 ms | 320 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.27, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.58 µs | 4.37 µs | 3.64 µs | 7.4 KiB | 279,252 |
| 40 | 4.95 µs | 6.09 µs | 15.0 µs | 14.0 KiB | 202,035 |
| 80 | 9.09 µs | 10.4 µs | 25.1 µs | 27.3 KiB | 110,025 |
| 160 | 17.2 µs | 20.8 µs | 45.7 µs | 53.9 KiB | 58,118 |
| 320 | 35.1 µs | 41.7 µs | 97.8 µs | 107.0 KiB | 28,529 |
| 640 | 65.8 µs | 73.5 µs | 176 µs | 213.3 KiB | 15,190 |
| 1280 | 275 µs | 294 µs | 617 µs | 515.9 KiB | 3,640 |
| 2560 | 546 µs | 574 µs | 1.08 ms | 1.0 MiB | 1,833 |
| 5120 | 1.22 ms | 1.31 ms | 2.29 ms | 2.1 MiB | 822 |
| 10240 | 2.52 ms | 3.06 ms | 3.81 ms | 4.2 MiB | 396 |

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
| 20 | 1.38 ms | 1.48 ms | 2.70 ms | 1.2 MiB | 725 |
| 40 | 2.57 ms | 2.67 ms | 3.98 ms | 2.5 MiB | 388 |
| 80 | 4.97 ms | 5.30 ms | 6.66 ms | 5.0 MiB | 201 |
| 160 | 9.55 ms | 9.79 ms | 11.3 ms | 10.0 MiB | 105 |
| 320 | 19.7 ms | 25.5 ms | 22.8 ms | 20.0 MiB | 51 |
| 640 | 37.2 ms | 37.8 ms | 39.6 ms | 40.1 MiB | 27 |
| 1280 | 72.6 ms | 79.8 ms | 74.3 ms | 16.1 MiB | 14 |
| 2560 | 145 ms | 214 ms | 147 ms | 32.3 MiB | 7 |
| 5120 | 287 ms | 291 ms | 290 ms | 708.6 KiB | 3 |
| 10240 | 575 ms | 578 ms | 577 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 702 µs | 732 µs | 1.41 ms | 643.3 KiB | 1,424 |
| 40 | 1.43 ms | 1.53 ms | 2.83 ms | 1.3 MiB | 702 |
| 80 | 2.48 ms | 2.61 ms | 3.78 ms | 2.5 MiB | 404 |
| 160 | 4.75 ms | 5.07 ms | 6.13 ms | 5.2 MiB | 211 |
| 320 | 9.57 ms | 10.0 ms | 11.0 ms | 10.6 MiB | 104 |
| 640 | 18.4 ms | 18.7 ms | 19.9 ms | 21.4 MiB | 54 |
| 1280 | 37.1 ms | 37.5 ms | 38.8 ms | 43.6 MiB | 27 |
| 2560 | 75.2 ms | 83.6 ms | 77.5 ms | 25.7 MiB | 13 |
| 5120 | 150 ms | 188 ms | 153 ms | 53.9 MiB | 7 |
| 10240 | 300 ms | 304 ms | 304 ms | 46.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.37, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.18 µs | 6.97 µs | 3.27 µs | 9.3 KiB | 314,084 |
| 40 | 3.63 µs | 4.28 µs | 13.6 µs | 8.4 KiB | 275,701 |
| 80 | 6.17 µs | 6.49 µs | 19.9 µs | 16.2 KiB | 161,977 |
| 160 | 10.7 µs | 12.2 µs | 30.3 µs | 31.8 KiB | 93,547 |
| 320 | 21.4 µs | 22.1 µs | 61.5 µs | 63.1 KiB | 46,679 |
| 640 | 40.4 µs | 41.9 µs | 106 µs | 127.7 KiB | 24,738 |
| 1280 | 238 µs | 245 µs | 599 µs | 352.8 KiB | 4,193 |
| 2560 | 483 µs | 494 µs | 1.04 ms | 694.2 KiB | 2,071 |
| 5120 | 1.09 ms | 1.13 ms | 2.26 ms | 1.3 MiB | 915 |
| 10240 | 2.17 ms | 2.26 ms | 3.44 ms | 2.7 MiB | 460 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.85, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.21 µs | 2.32 µs | 9.24 µs | 4.5 KiB | 452,694 |
| 40 | 2.36 µs | 2.46 µs | 9.73 µs | 4.5 KiB | 424,587 |
| 80 | 2.87 µs | 3.06 µs | 12.5 µs | 4.5 KiB | 349,021 |
| 160 | 3.31 µs | 3.92 µs | 12.0 µs | 4.5 KiB | 301,674 |
| 320 | 4.24 µs | 4.58 µs | 13.7 µs | 4.5 KiB | 235,578 |
| 640 | 6.50 µs | 7.33 µs | 20.1 µs | 4.5 KiB | 153,758 |
| 1280 | 10.9 µs | 13.5 µs | 32.1 µs | 4.5 KiB | 91,795 |
| 2560 | 19.3 µs | 25.9 µs | 57.4 µs | 4.5 KiB | 51,691 |
| 5120 | 34.4 µs | 49.9 µs | 92.1 µs | 4.5 KiB | 29,033 |
| 10240 | 69.7 µs | 96.1 µs | 200 µs | 4.5 KiB | 14,354 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 9.59 µs | 13.2 µs | 9.79 µs | 3.7 KiB | 104,304 |
| 40 | 11.6 µs | 14.0 µs | 11.8 µs | 6.3 KiB | 86,479 |
| 80 | 17.6 µs | 19.3 µs | 57.6 µs | 11.6 KiB | 56,681 |
| 160 | 26.6 µs | 31.4 µs | 93.2 µs | 22.3 KiB | 37,554 |
| 320 | 46.7 µs | 59.3 µs | 153 µs | 44.7 KiB | 21,428 |
| 640 | 85.7 µs | 101 µs | 240 µs | 90.3 KiB | 11,672 |
| 1280 | 161 µs | 191 µs | 435 µs | 186.4 KiB | 6,193 |
| 2560 | 302 µs | 345 µs | 720 µs | 382.2 KiB | 3,310 |
| 5120 | 717 µs | 781 µs | 1.40 ms | 683.1 KiB | 1,395 |
| 10240 | 1.44 ms | 1.52 ms | 2.78 ms | 1.3 MiB | 696 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.36 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.01 ms | 1.01 ms | 74% |
| `load-exception-registry` | 1 | 287 µs | 287 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 67.3 µs | 4.9% |

**At 10240 entrys** (whole operation: 24.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 17.1 ms | 17.1 ms | 70% |
| `load-exception-registry` | 1 | 3.97 ms | 3.97 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.32 ms | 14% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T20:56:43.818Z` → `2026-11-14T20:57:24.129Z` (40 s), ci: CI (run 43638758320)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `0c53398b06c4a73ae2cedecd36d3f56ac46c4da4` on `fix/release-build-without-contract`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

