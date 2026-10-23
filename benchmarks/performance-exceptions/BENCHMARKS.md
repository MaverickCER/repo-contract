# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.03 ms** per operation compared with a bare-minimum baseline (**296% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.03 ms | 17.7 ms |
| Added latency, relative to baseline | 296% | 319% |
| Added CPU time per operation | 1.72 ms | 17.2 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 970 ops/s | 56 ops/s |

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
| 20 | 14.6 µs | 64.4 µs | 49.9 µs | 343% | 175 µs | $0.0001 – $0.002 |
| 40 | 24.7 µs | 95.1 µs | 70.4 µs | 285% | 166 µs | $0.00015 – $0.0019 |
| 80 | 47.9 µs | 179 µs | 131 µs | 273% | 298 µs | $0.00027 – $0.0033 |
| 160 | 95.2 µs | 332 µs | 237 µs | 249% | 411 µs | $0.00049 – $0.0046 |
| 320 | 185 µs | 648 µs | 463 µs | 250% | 717 µs | $0.00096 – $0.0081 |
| 640 | 348 µs | 1.38 ms | 1.03 ms | 296% | 1.72 ms | $0.0021 – $0.019 |
| 1280 | 691 µs | 2.58 ms | 1.89 ms | 274% | 2.38 ms | $0.0039 – $0.027 |
| 2560 | 1.39 ms | 5.09 ms | 3.70 ms | 266% | 3.64 ms | $0.0077 – $0.041 |
| 5120 | 2.78 ms | 10.3 ms | 7.54 ms | 271% | 7.57 ms | $0.016 – $0.085 |
| 10240 | 5.55 ms | 23.3 ms | 17.7 ms | 319% | 17.2 ms | $0.037 – $0.193 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 212 µs | 2.45 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 31.1 µs | 813 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 278 µs | 3.96 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.01 ms | 16.9 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 19.7 ms | 324 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 68.2 µs | 2.77 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 38.1 ms | 624 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 19.8 ms | 317 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 38.5 µs | 2.15 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 6.65 µs | 67.6 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 79.8 µs | 1.38 ms |

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
| 20 | 52.8 µs | 62.7 µs | 166 µs | 120.0 KiB | 18,957 |
| 40 | 34.4 µs | 35.2 µs | 90.6 µs | 97.2 KiB | 29,098 |
| 80 | 40.9 µs | 43.4 µs | 108 µs | 123.7 KiB | 24,446 |
| 160 | 53.9 µs | 54.9 µs | 139 µs | 158.1 KiB | 18,563 |
| 320 | 82.0 µs | 84.3 µs | 227 µs | 237.8 KiB | 12,201 |
| 640 | 212 µs | 296 µs | 732 µs | 656.2 KiB | 4,723 |
| 1280 | 285 µs | 294 µs | 625 µs | 1.0 MiB | 3,503 |
| 2560 | 539 µs | 550 µs | 1.01 ms | 2.1 MiB | 1,855 |
| 5120 | 1.25 ms | 1.29 ms | 2.24 ms | 4.3 MiB | 802 |
| 10240 | 2.45 ms | 2.50 ms | 3.23 ms | 8.6 MiB | 408 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.21, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.62 µs | 6.15 µs | 20.0 µs | 17.0 KiB | 177,908 |
| 40 | 5.44 µs | 6.24 µs | 18.2 µs | 16.3 KiB | 183,847 |
| 80 | 7.05 µs | 7.28 µs | 22.8 µs | 20.5 KiB | 141,869 |
| 160 | 10.6 µs | 11.3 µs | 35.0 µs | 28.6 KiB | 94,602 |
| 320 | 16.9 µs | 17.5 µs | 48.3 µs | 48.2 KiB | 59,284 |
| 640 | 31.1 µs | 32.3 µs | 82.4 µs | 86.6 KiB | 32,115 |
| 1280 | 61.9 µs | 66.3 µs | 152 µs | 169.5 KiB | 16,150 |
| 2560 | 136 µs | 138 µs | 333 µs | 338.6 KiB | 7,363 |
| 5120 | 394 µs | 416 µs | 1.03 ms | 634.3 KiB | 2,540 |
| 10240 | 813 µs | 831 µs | 1.56 ms | 1.3 MiB | 1,230 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.9 µs | 13.7 µs | 53.3 µs | 7.3 KiB | 77,415 |
| 40 | 19.0 µs | 22.1 µs | 50.0 µs | 13.2 KiB | 52,606 |
| 80 | 36.5 µs | 37.7 µs | 93.4 µs | 25.1 KiB | 27,366 |
| 160 | 72.1 µs | 74.4 µs | 175 µs | 48.9 KiB | 13,878 |
| 320 | 139 µs | 143 µs | 311 µs | 96.4 KiB | 7,210 |
| 640 | 278 µs | 298 µs | 618 µs | 191.5 KiB | 3,597 |
| 1280 | 537 µs | 555 µs | 1.07 ms | 381.6 KiB | 1,863 |
| 2560 | 1.15 ms | 1.43 ms | 2.30 ms | 761.9 KiB | 870 |
| 5120 | 2.56 ms | 2.71 ms | 3.82 ms | 1.5 MiB | 390 |
| 10240 | 3.96 ms | 4.10 ms | 5.47 ms | 3.0 MiB | 253 |

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
| 20 | 42.8 µs | 48.7 µs | 149 µs | 43.9 KiB | 23,381 |
| 40 | 67.1 µs | 73.0 µs | 179 µs | 82.8 KiB | 14,912 |
| 80 | 127 µs | 139 µs | 326 µs | 161.3 KiB | 7,865 |
| 160 | 230 µs | 252 µs | 479 µs | 318.1 KiB | 4,345 |
| 320 | 469 µs | 499 µs | 969 µs | 632.2 KiB | 2,130 |
| 640 | 1.01 ms | 1.06 ms | 2.02 ms | 1.2 MiB | 995 |
| 1280 | 1.93 ms | 2.01 ms | 3.00 ms | 2.5 MiB | 518 |
| 2560 | 3.78 ms | 3.91 ms | 4.97 ms | 4.9 MiB | 264 |
| 5120 | 7.30 ms | 7.44 ms | 8.61 ms | 9.8 MiB | 137 |
| 10240 | 16.9 ms | 17.7 ms | 18.6 ms | 19.7 MiB | 59 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.33 ms | 1.41 ms | 2.95 ms | 652.5 KiB | 752 |
| 40 | 1.35 ms | 2.22 ms | 2.38 ms | 1.3 MiB | 743 |
| 80 | 2.57 ms | 3.32 ms | 3.61 ms | 2.6 MiB | 389 |
| 160 | 5.06 ms | 6.44 ms | 6.18 ms | 5.2 MiB | 198 |
| 320 | 10.1 ms | 11.1 ms | 11.3 ms | 10.6 MiB | 99 |
| 640 | 19.7 ms | 20.7 ms | 20.8 ms | 21.4 MiB | 51 |
| 1280 | 39.7 ms | 41.9 ms | 41.2 ms | 43.7 MiB | 25 |
| 2560 | 79.7 ms | 82.4 ms | 81.3 ms | 25.9 MiB | 13 |
| 5120 | 160 ms | 164 ms | 162 ms | 54.2 MiB | 6 |
| 10240 | 324 ms | 330 ms | 334 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.28, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.91 µs | 4.59 µs | 3.98 µs | 7.4 KiB | 255,850 |
| 40 | 5.31 µs | 6.81 µs | 16.5 µs | 14.0 KiB | 188,194 |
| 80 | 9.67 µs | 13.8 µs | 28.0 µs | 27.3 KiB | 103,455 |
| 160 | 18.0 µs | 21.6 µs | 48.9 µs | 53.9 KiB | 55,662 |
| 320 | 35.0 µs | 39.4 µs | 96.2 µs | 107.2 KiB | 28,552 |
| 640 | 68.2 µs | 71.0 µs | 176 µs | 213.7 KiB | 14,659 |
| 1280 | 289 µs | 333 µs | 680 µs | 515.9 KiB | 3,463 |
| 2560 | 560 µs | 592 µs | 1.10 ms | 1.0 MiB | 1,787 |
| 5120 | 1.23 ms | 1.46 ms | 2.33 ms | 2.1 MiB | 815 |
| 10240 | 2.77 ms | 3.03 ms | 4.69 ms | 4.2 MiB | 361 |

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
| 20 | 1.41 ms | 1.70 ms | 2.76 ms | 1.2 MiB | 711 |
| 40 | 2.55 ms | 2.60 ms | 3.88 ms | 2.5 MiB | 393 |
| 80 | 4.86 ms | 4.98 ms | 6.21 ms | 5.0 MiB | 206 |
| 160 | 9.54 ms | 9.66 ms | 10.9 ms | 10.0 MiB | 105 |
| 320 | 19.1 ms | 26.8 ms | 20.8 ms | 20.0 MiB | 52 |
| 640 | 38.1 ms | 42.4 ms | 39.7 ms | 40.1 MiB | 26 |
| 1280 | 75.7 ms | 77.3 ms | 77.2 ms | 16.1 MiB | 13 |
| 2560 | 151 ms | 159 ms | 153 ms | 32.3 MiB | 7 |
| 5120 | 318 ms | 321 ms | 320 ms | 708.6 KiB | 3 |
| 10240 | 624 ms | 633 ms | 626 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 714 µs | 749 µs | 1.39 ms | 643.3 KiB | 1,400 |
| 40 | 1.43 ms | 1.50 ms | 2.80 ms | 1.3 MiB | 698 |
| 80 | 2.67 ms | 2.74 ms | 4.03 ms | 2.5 MiB | 375 |
| 160 | 5.05 ms | 5.14 ms | 6.43 ms | 5.2 MiB | 198 |
| 320 | 9.86 ms | 10.1 ms | 11.3 ms | 10.6 MiB | 101 |
| 640 | 19.8 ms | 20.0 ms | 21.1 ms | 21.4 MiB | 51 |
| 1280 | 39.5 ms | 40.0 ms | 40.9 ms | 43.6 MiB | 25 |
| 2560 | 80.0 ms | 81.6 ms | 81.6 ms | 25.7 MiB | 12 |
| 5120 | 161 ms | 163 ms | 163 ms | 53.9 MiB | 6 |
| 10240 | 317 ms | 324 ms | 319 ms | 46.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.39, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.85 µs | 7.21 µs | 2.93 µs | 9.3 KiB | 350,789 |
| 40 | 3.27 µs | 3.43 µs | 11.1 µs | 8.4 KiB | 306,028 |
| 80 | 5.58 µs | 5.75 µs | 16.5 µs | 16.2 KiB | 179,203 |
| 160 | 10.3 µs | 10.5 µs | 28.6 µs | 31.8 KiB | 97,488 |
| 320 | 19.4 µs | 20.1 µs | 51.0 µs | 63.1 KiB | 51,499 |
| 640 | 38.5 µs | 39.4 µs | 101 µs | 127.8 KiB | 25,950 |
| 1280 | 211 µs | 214 µs | 479 µs | 349.8 KiB | 4,732 |
| 2560 | 472 µs | 484 µs | 1.02 ms | 694.2 KiB | 2,120 |
| 5120 | 1.01 ms | 1.10 ms | 2.10 ms | 1.3 MiB | 992 |
| 10240 | 2.15 ms | 2.54 ms | 3.43 ms | 2.7 MiB | 464 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.85, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.08 µs | 2.15 µs | 8.24 µs | 4.5 KiB | 481,632 |
| 40 | 2.37 µs | 2.45 µs | 9.81 µs | 4.5 KiB | 422,746 |
| 80 | 2.36 µs | 2.46 µs | 8.36 µs | 4.5 KiB | 424,236 |
| 160 | 3.19 µs | 3.31 µs | 10.8 µs | 4.5 KiB | 313,268 |
| 320 | 4.10 µs | 4.70 µs | 12.4 µs | 4.5 KiB | 243,725 |
| 640 | 6.65 µs | 7.83 µs | 20.3 µs | 4.5 KiB | 150,287 |
| 1280 | 10.9 µs | 12.5 µs | 32.4 µs | 4.5 KiB | 91,689 |
| 2560 | 18.8 µs | 26.0 µs | 51.2 µs | 4.5 KiB | 53,181 |
| 5120 | 37.7 µs | 40.7 µs | 117 µs | 4.5 KiB | 26,555 |
| 10240 | 67.6 µs | 87.1 µs | 179 µs | 4.5 KiB | 14,793 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.35 µs | 7.15 µs | 6.44 µs | 3.6 KiB | 157,556 |
| 40 | 9.36 µs | 11.5 µs | 9.48 µs | 6.3 KiB | 106,811 |
| 80 | 15.0 µs | 16.6 µs | 59.0 µs | 11.6 KiB | 66,611 |
| 160 | 24.2 µs | 27.1 µs | 80.3 µs | 22.2 KiB | 41,369 |
| 320 | 43.5 µs | 48.3 µs | 132 µs | 44.5 KiB | 22,975 |
| 640 | 79.8 µs | 89.5 µs | 215 µs | 89.7 KiB | 12,537 |
| 1280 | 151 µs | 164 µs | 376 µs | 183.3 KiB | 6,634 |
| 2560 | 297 µs | 324 µs | 679 µs | 382.2 KiB | 3,370 |
| 5120 | 643 µs | 671 µs | 1.24 ms | 643.1 KiB | 1,554 |
| 10240 | 1.38 ms | 1.48 ms | 2.59 ms | 1.3 MiB | 727 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.38 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.01 ms | 1.01 ms | 73% |
| `load-exception-registry` | 1 | 278 µs | 278 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 95.2 µs | 6.9% |

**At 10240 entrys** (whole operation: 23.3 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 16.9 ms | 16.9 ms | 73% |
| `load-exception-registry` | 1 | 3.96 ms | 3.96 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.42 ms | 10% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-23T05:08:18.282Z` → `2026-10-23T05:09:00.976Z` (43 s), ci: CI (run 39903023267)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `c21aa4523e111ad21b93cd15b55d98b1a5de5ba2` on `chore/security-and-dep-updates`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

