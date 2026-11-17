# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.58 ms** per operation compared with a bare-minimum baseline (**278% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.97). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.58 ms | 23.8 ms |
| Added latency, relative to baseline | 278% | 338% |
| Added CPU time per operation | 1.64 ms | 22.8 ms |
| Added memory per operation (heap delta) | 1.5 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 633 ops/s | 42 ops/s |

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
| 20 | 53.3 µs | 386 µs | 325 µs | 609% | 1.39 ms | $0.00068 – $0.016 |
| 40 | 69.8 µs | 556 µs | 498 µs | 713% | 1.63 ms | $0.001 – $0.018 |
| 80 | 92.9 µs | 549 µs | 450 µs | 484% | 1.67 ms | $0.00094 – $0.019 |
| 160 | 152 µs | 846 µs | 687 µs | 451% | 1.97 ms | $0.0014 – $0.022 |
| 320 | 315 µs | 1.10 ms | 754 µs | 239% | 2.30 ms | $0.0016 – $0.026 |
| 640 | 567 µs | 2.11 ms | 1.58 ms | 278% | 1.64 ms | $0.0033 – $0.018 |
| 1280 | 1.01 ms | 3.52 ms | 2.46 ms | 244% | 2.83 ms | $0.0051 – $0.032 |
| 2560 | 1.55 ms | 6.36 ms | 4.78 ms | 309% | 5.06 ms | $0.01 – $0.057 |
| 5120 | 3.07 ms | 14.4 ms | 11.1 ms | 360% | 11.4 ms | $0.023 – $0.128 |
| 10240 | 7.06 ms | 30.5 ms | 23.8 ms | 338% | 22.8 ms | $0.050 – $0.256 |

**How the total grows:** O(n) (linear), exponent 0.97 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 372 µs | 4.40 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 45.4 µs | 1.21 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 731 µs | 5.78 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.28 ms | 20.4 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 25.8 ms | 331 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 90.8 µs | 3.49 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 38.8 ms | 610 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 20.1 ms | 339 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 54.8 µs | 2.72 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 7.88 µs | 90.9 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 111 µs | 2.07 ms |

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

**Measured: O(n)** (exponent 0.94, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 79.2 µs | 110 µs | 272 µs | 117.8 KiB | 12,631 |
| 40 | 53.0 µs | 132 µs | 188 µs | 98.4 KiB | 18,880 |
| 80 | 63.3 µs | 133 µs | 213 µs | 118.5 KiB | 15,808 |
| 160 | 78.0 µs | 156 µs | 208 µs | 158.2 KiB | 12,814 |
| 320 | 141 µs | 439 µs | 151 µs | 239.8 KiB | 7,108 |
| 640 | 372 µs | 1.10 ms | 1.16 ms | 656.2 KiB | 2,687 |
| 1280 | 471 µs | 1.19 ms | 1.24 ms | 1.0 MiB | 2,122 |
| 2560 | 1.09 ms | 2.63 ms | 2.83 ms | 2.1 MiB | 916 |
| 5120 | 2.32 ms | 3.27 ms | 3.99 ms | 4.3 MiB | 432 |
| 10240 | 4.40 ms | 7.44 ms | 6.07 ms | 8.6 MiB | 228 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.21, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.36 µs | 21.1 µs | 8.93 µs | 17.1 KiB | 119,611 |
| 40 | 8.33 µs | 19.1 µs | 10.5 µs | 16.3 KiB | 120,049 |
| 80 | 10.8 µs | 18.5 µs | 22.2 µs | 20.5 KiB | 92,924 |
| 160 | 15.1 µs | 22.7 µs | 22.5 µs | 28.6 KiB | 66,403 |
| 320 | 22.3 µs | 28.6 µs | 73.2 µs | 48.2 KiB | 44,855 |
| 640 | 45.4 µs | 56.0 µs | 130 µs | 86.8 KiB | 22,005 |
| 1280 | 81.2 µs | 165 µs | 230 µs | 171.0 KiB | 12,316 |
| 2560 | 183 µs | 419 µs | 551 µs | 329.7 KiB | 5,460 |
| 5120 | 494 µs | 1.37 ms | 1.43 ms | 634.3 KiB | 2,024 |
| 10240 | 1.21 ms | 2.35 ms | 3.56 ms | 1.3 MiB | 826 |

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

**Measured: O(n)** (exponent 0.78, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 341 µs | 2.10 ms | 840 µs | 12.3 KiB | 2,928 |
| 40 | 221 µs | 1.20 ms | 506 µs | 17.8 KiB | 4,519 |
| 80 | 500 µs | 1.68 ms | 1.44 ms | 30.9 KiB | 1,998 |
| 160 | 381 µs | 1.95 ms | 705 µs | 53.5 KiB | 2,624 |
| 320 | 575 µs | 1.41 ms | 1.87 ms | 102.2 KiB | 1,738 |
| 640 | 731 µs | 2.79 ms | 1.46 ms | 196.3 KiB | 1,368 |
| 1280 | 1.03 ms | 1.87 ms | 2.24 ms | 387.2 KiB | 969 |
| 2560 | 1.54 ms | 3.22 ms | 3.07 ms | 767.2 KiB | 649 |
| 5120 | 3.63 ms | 6.45 ms | 5.63 ms | 1.5 MiB | 276 |
| 10240 | 5.78 ms | 7.40 ms | 7.81 ms | 3.0 MiB | 173 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 72.1 µs | 212 µs | 94.5 µs | 44.3 KiB | 13,879 |
| 40 | 107 µs | 346 µs | 365 µs | 83.3 KiB | 9,349 |
| 80 | 176 µs | 315 µs | 448 µs | 161.5 KiB | 5,688 |
| 160 | 327 µs | 661 µs | 836 µs | 318.6 KiB | 3,057 |
| 320 | 768 µs | 1.28 ms | 2.12 ms | 634.7 KiB | 1,302 |
| 640 | 1.28 ms | 2.41 ms | 2.87 ms | 1.2 MiB | 783 |
| 1280 | 2.39 ms | 3.49 ms | 4.22 ms | 2.5 MiB | 419 |
| 2560 | 4.57 ms | 7.36 ms | 6.84 ms | 4.9 MiB | 219 |
| 5120 | 9.43 ms | 13.6 ms | 12.4 ms | 9.8 MiB | 106 |
| 10240 | 20.4 ms | 24.1 ms | 25.5 ms | 19.7 MiB | 49 |

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

**Measured: O(n)** (exponent 0.91, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.45 ms | 2.62 ms | 3.78 ms | 652.5 KiB | 691 |
| 40 | 2.13 ms | 4.34 ms | 4.12 ms | 1.3 MiB | 468 |
| 80 | 3.45 ms | 6.14 ms | 5.10 ms | 2.6 MiB | 289 |
| 160 | 7.02 ms | 9.43 ms | 9.27 ms | 5.3 MiB | 142 |
| 320 | 13.6 ms | 17.4 ms | 17.2 ms | 10.6 MiB | 73 |
| 640 | 25.8 ms | 33.7 ms | 30.3 ms | 21.5 MiB | 39 |
| 1280 | 49.1 ms | 49.7 ms | 52.6 ms | 43.7 MiB | 20 |
| 2560 | 113 ms | 115 ms | 116 ms | 25.9 MiB | 9 |
| 5120 | 165 ms | 181 ms | 176 ms | 54.2 MiB | 6 |
| 10240 | 331 ms | 348 ms | 343 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.26, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.47 µs | 18.8 µs | 6.79 µs | 7.4 KiB | 223,598 |
| 40 | 7.69 µs | 21.8 µs | 25.3 µs | 14.0 KiB | 129,994 |
| 80 | 14.7 µs | 32.8 µs | 44.6 µs | 27.3 KiB | 67,929 |
| 160 | 25.5 µs | 47.5 µs | 75.5 µs | 53.9 KiB | 39,162 |
| 320 | 47.9 µs | 94.9 µs | 128 µs | 107.0 KiB | 20,892 |
| 640 | 90.8 µs | 195 µs | 274 µs | 213.3 KiB | 11,007 |
| 1280 | 400 µs | 905 µs | 1.15 ms | 516.0 KiB | 2,500 |
| 2560 | 698 µs | 1.46 ms | 1.82 ms | 1.0 MiB | 1,433 |
| 5120 | 1.74 ms | 2.77 ms | 3.74 ms | 2.1 MiB | 575 |
| 10240 | 3.49 ms | 6.21 ms | 5.90 ms | 4.2 MiB | 286 |

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
| 20 | 1.79 ms | 3.69 ms | 4.43 ms | 1.2 MiB | 559 |
| 40 | 3.15 ms | 4.87 ms | 5.52 ms | 2.5 MiB | 317 |
| 80 | 6.35 ms | 9.38 ms | 8.89 ms | 5.0 MiB | 158 |
| 160 | 11.9 ms | 16.7 ms | 14.6 ms | 10.0 MiB | 84 |
| 320 | 22.3 ms | 26.5 ms | 25.2 ms | 20.0 MiB | 45 |
| 640 | 38.8 ms | 40.1 ms | 41.6 ms | 40.1 MiB | 26 |
| 1280 | 77.4 ms | 80.9 ms | 85.6 ms | 16.1 MiB | 13 |
| 2560 | 153 ms | 159 ms | 157 ms | 32.3 MiB | 7 |
| 5120 | 308 ms | 349 ms | 312 ms | 707.4 KiB | 3 |
| 10240 | 610 ms | 649 ms | 615 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.02, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.05 ms | 1.98 ms | 3.28 ms | 645.7 KiB | 956 |
| 40 | 1.74 ms | 3.64 ms | 4.49 ms | 1.3 MiB | 575 |
| 80 | 3.85 ms | 5.61 ms | 6.48 ms | 2.5 MiB | 260 |
| 160 | 5.49 ms | 7.82 ms | 8.62 ms | 5.2 MiB | 182 |
| 320 | 11.4 ms | 15.9 ms | 14.9 ms | 10.6 MiB | 88 |
| 640 | 20.1 ms | 23.0 ms | 24.0 ms | 21.4 MiB | 50 |
| 1280 | 40.0 ms | 51.2 ms | 43.0 ms | 43.6 MiB | 25 |
| 2560 | 81.6 ms | 88.2 ms | 84.9 ms | 25.7 MiB | 12 |
| 5120 | 162 ms | 167 ms | 167 ms | 53.9 MiB | 6 |
| 10240 | 339 ms | 344 ms | 345 ms | 46.2 MiB | 3 |

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
| 20 | 3.76 µs | 9.36 µs | 4.00 µs | 9.3 KiB | 265,769 |
| 40 | 5.18 µs | 6.73 µs | 5.40 µs | 8.4 KiB | 193,189 |
| 80 | 9.05 µs | 15.9 µs | 15.7 µs | 16.2 KiB | 110,487 |
| 160 | 16.5 µs | 36.2 µs | 57.1 µs | 31.8 KiB | 60,560 |
| 320 | 30.9 µs | 67.6 µs | 106 µs | 63.1 KiB | 32,383 |
| 640 | 54.8 µs | 126 µs | 152 µs | 127.8 KiB | 18,253 |
| 1280 | 314 µs | 639 µs | 831 µs | 352.8 KiB | 3,189 |
| 2560 | 753 µs | 1.88 ms | 2.24 ms | 681.1 KiB | 1,329 |
| 5120 | 1.73 ms | 4.49 ms | 4.68 ms | 1.3 MiB | 579 |
| 10240 | 2.72 ms | 5.53 ms | 5.88 ms | 2.7 MiB | 368 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.86, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.68 µs | 5.96 µs | 2.75 µs | 4.5 KiB | 372,628 |
| 40 | 2.87 µs | 7.15 µs | 2.98 µs | 4.5 KiB | 347,970 |
| 80 | 3.51 µs | 7.68 µs | 3.62 µs | 4.5 KiB | 285,027 |
| 160 | 4.72 µs | 12.3 µs | 5.06 µs | 4.5 KiB | 211,836 |
| 320 | 5.96 µs | 7.10 µs | 6.13 µs | 4.5 KiB | 167,781 |
| 640 | 7.88 µs | 9.91 µs | 25.7 µs | 4.5 KiB | 126,866 |
| 1280 | 15.0 µs | 17.8 µs | 56.8 µs | 4.5 KiB | 66,868 |
| 2560 | 24.8 µs | 30.0 µs | 83.0 µs | 4.5 KiB | 40,292 |
| 5120 | 43.1 µs | 55.7 µs | 129 µs | 4.5 KiB | 23,222 |
| 10240 | 90.9 µs | 112 µs | 290 µs | 4.5 KiB | 11,006 |

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

**Measured: O(n)** (exponent 1.08, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.7 µs | 33.2 µs | 12.7 µs | 3.7 KiB | 85,557 |
| 40 | 24.3 µs | 84.5 µs | 26.5 µs | 6.5 KiB | 41,235 |
| 80 | 24.5 µs | 94.6 µs | 26.1 µs | 11.7 KiB | 40,890 |
| 160 | 33.7 µs | 75.6 µs | 117 µs | 22.3 KiB | 29,691 |
| 320 | 68.8 µs | 190 µs | 230 µs | 45.3 KiB | 14,543 |
| 640 | 111 µs | 243 µs | 356 µs | 90.3 KiB | 9,007 |
| 1280 | 214 µs | 584 µs | 610 µs | 186.4 KiB | 4,683 |
| 2560 | 562 µs | 1.16 ms | 2.00 ms | 379.1 KiB | 1,780 |
| 5120 | 1.12 ms | 3.41 ms | 2.75 ms | 648.5 KiB | 897 |
| 10240 | 2.07 ms | 5.71 ms | 4.65 ms | 1.3 MiB | 483 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.11 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.28 ms | 1.28 ms | 61% |
| `load-exception-registry` | 1 | 731 µs | 731 µs | 35% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 99.1 µs | 4.7% |

**At 10240 entrys** (whole operation: 30.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 20.4 ms | 20.4 ms | 67% |
| `load-exception-registry` | 1 | 5.78 ms | 5.78 ms | 19% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.26 ms | 14% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-17T18:51:01.293Z` → `2026-11-17T18:51:53.736Z` (52 s), ci: CI (run 44148884303)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `ff0304f1cc5188d15ea2c2acc56e5ac2ab9340cf` on `fix/round7-gaps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

