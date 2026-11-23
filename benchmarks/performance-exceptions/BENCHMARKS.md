# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.53 ms** per operation compared with a bare-minimum baseline (**264% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.53 ms | 29.6 ms |
| Added latency, relative to baseline | 264% | 401% |
| Added CPU time per operation | 1.38 ms | 29.2 ms |
| Added memory per operation (heap delta) | 1.5 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 652 ops/s | 34 ops/s |

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
| 20 | 33.4 µs | 245 µs | 213 µs | 637% | 481 µs | $0.00044 – $0.0054 |
| 40 | 52.4 µs | 305 µs | 252 µs | 481% | 256 µs | $0.00053 – $0.0029 |
| 80 | 92.5 µs | 440 µs | 348 µs | 377% | 1.57 ms | $0.00073 – $0.018 |
| 160 | 175 µs | 664 µs | 481 µs | 274% | 1.67 ms | $0.001 – $0.019 |
| 320 | 350 µs | 1.07 ms | 716 µs | 205% | 1.38 ms | $0.0015 – $0.016 |
| 640 | 581 µs | 2.12 ms | 1.53 ms | 264% | 1.38 ms | $0.0032 – $0.015 |
| 1280 | 970 µs | 3.68 ms | 2.71 ms | 279% | 2.70 ms | $0.0056 – $0.030 |
| 2560 | 1.82 ms | 7.29 ms | 5.48 ms | 301% | 5.54 ms | $0.011 – $0.062 |
| 5120 | 3.69 ms | 16.8 ms | 13.1 ms | 356% | 13.2 ms | $0.027 – $0.148 |
| 10240 | 7.38 ms | 36.9 ms | 29.6 ms | 401% | 29.2 ms | $0.062 – $0.328 |

**How the total grows:** O(n) (linear), exponent 1.04 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 263 µs | 3.36 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 43.6 µs | 1.10 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 469 µs | 6.05 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.40 ms | 23.8 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 28.1 ms | 463 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 105 µs | 3.54 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 55.2 ms | 877 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 28.0 ms | 457 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.2 µs | 2.88 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 9.73 µs | 111 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 119 µs | 1.79 ms |

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
| 20 | 77.3 µs | 127 µs | 256 µs | 117.8 KiB | 12,929 |
| 40 | 48.7 µs | 50.4 µs | 154 µs | 97.9 KiB | 20,547 |
| 80 | 54.3 µs | 57.2 µs | 158 µs | 121.7 KiB | 18,400 |
| 160 | 76.1 µs | 79.2 µs | 233 µs | 158.9 KiB | 13,143 |
| 320 | 106 µs | 110 µs | 282 µs | 237.8 KiB | 9,474 |
| 640 | 263 µs | 393 µs | 903 µs | 530.7 KiB | 3,808 |
| 1280 | 410 µs | 422 µs | 1.03 ms | 1.0 MiB | 2,440 |
| 2560 | 737 µs | 751 µs | 1.38 ms | 2.1 MiB | 1,356 |
| 5120 | 1.67 ms | 1.70 ms | 2.91 ms | 4.3 MiB | 597 |
| 10240 | 3.36 ms | 3.39 ms | 4.39 ms | 8.6 MiB | 298 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.19, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.93 µs | 8.34 µs | 30.0 µs | 17.0 KiB | 126,062 |
| 40 | 8.14 µs | 8.98 µs | 31.1 µs | 16.3 KiB | 122,814 |
| 80 | 10.1 µs | 10.6 µs | 34.6 µs | 20.5 KiB | 99,287 |
| 160 | 14.9 µs | 15.4 µs | 47.7 µs | 28.6 KiB | 67,028 |
| 320 | 25.3 µs | 26.2 µs | 79.7 µs | 48.2 KiB | 39,533 |
| 640 | 43.6 µs | 45.8 µs | 127 µs | 86.7 KiB | 22,919 |
| 1280 | 80.7 µs | 82.8 µs | 224 µs | 169.1 KiB | 12,394 |
| 2560 | 173 µs | 191 µs | 446 µs | 343.9 KiB | 5,787 |
| 5120 | 496 µs | 513 µs | 1.25 ms | 634.3 KiB | 2,018 |
| 10240 | 1.10 ms | 1.12 ms | 2.87 ms | 1.3 MiB | 913 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 164 µs | 226 µs | 462 µs | 12.0 KiB | 6,111 |
| 40 | 177 µs | 193 µs | 473 µs | 17.9 KiB | 5,663 |
| 80 | 126 µs | 202 µs | 478 µs | 29.7 KiB | 7,954 |
| 160 | 209 µs | 255 µs | 563 µs | 53.5 KiB | 4,787 |
| 320 | 327 µs | 354 µs | 634 µs | 101.0 KiB | 3,055 |
| 640 | 469 µs | 562 µs | 1.09 ms | 196.3 KiB | 2,132 |
| 1280 | 902 µs | 1.13 ms | 2.19 ms | 387.2 KiB | 1,109 |
| 2560 | 1.70 ms | 2.21 ms | 3.09 ms | 767.2 KiB | 589 |
| 5120 | 3.93 ms | 4.03 ms | 5.06 ms | 1.5 MiB | 255 |
| 10240 | 6.05 ms | 6.15 ms | 7.46 ms | 3.0 MiB | 165 |

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
| 20 | 58.0 µs | 73.2 µs | 197 µs | 44.0 KiB | 17,255 |
| 40 | 97.9 µs | 105 µs | 278 µs | 83.0 KiB | 10,219 |
| 80 | 189 µs | 199 µs | 502 µs | 161.6 KiB | 5,281 |
| 160 | 375 µs | 414 µs | 1.00 ms | 319.5 KiB | 2,665 |
| 320 | 651 µs | 702 µs | 1.28 ms | 632.1 KiB | 1,536 |
| 640 | 1.40 ms | 1.46 ms | 2.67 ms | 1.2 MiB | 714 |
| 1280 | 2.58 ms | 2.67 ms | 3.91 ms | 2.5 MiB | 388 |
| 2560 | 4.98 ms | 5.07 ms | 6.43 ms | 4.9 MiB | 201 |
| 5120 | 10.0 ms | 10.5 ms | 11.8 ms | 9.8 MiB | 100 |
| 10240 | 23.8 ms | 28.9 ms | 26.2 ms | 19.7 MiB | 42 |

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
| 20 | 1.63 ms | 1.75 ms | 3.48 ms | 652.5 KiB | 612 |
| 40 | 1.96 ms | 2.86 ms | 3.23 ms | 1.3 MiB | 510 |
| 80 | 3.72 ms | 4.62 ms | 4.99 ms | 2.6 MiB | 269 |
| 160 | 7.31 ms | 9.61 ms | 8.74 ms | 5.3 MiB | 137 |
| 320 | 14.3 ms | 15.6 ms | 15.8 ms | 10.6 MiB | 70 |
| 640 | 28.1 ms | 31.3 ms | 29.6 ms | 21.4 MiB | 36 |
| 1280 | 56.4 ms | 58.0 ms | 58.4 ms | 43.7 MiB | 18 |
| 2560 | 114 ms | 115 ms | 116 ms | 25.9 MiB | 9 |
| 5120 | 228 ms | 238 ms | 232 ms | 54.2 MiB | 4 |
| 10240 | 463 ms | 464 ms | 474 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.23, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.53 µs | 6.30 µs | 5.79 µs | 7.4 KiB | 180,766 |
| 40 | 7.95 µs | 9.61 µs | 26.8 µs | 14.0 KiB | 125,856 |
| 80 | 14.6 µs | 16.6 µs | 46.8 µs | 27.3 KiB | 68,527 |
| 160 | 27.5 µs | 30.8 µs | 81.4 µs | 53.9 KiB | 36,369 |
| 320 | 56.2 µs | 67.7 µs | 172 µs | 107.0 KiB | 17,787 |
| 640 | 105 µs | 121 µs | 287 µs | 213.3 KiB | 9,539 |
| 1280 | 376 µs | 395 µs | 820 µs | 515.9 KiB | 2,657 |
| 2560 | 758 µs | 791 µs | 1.40 ms | 1.0 MiB | 1,320 |
| 5120 | 1.64 ms | 1.77 ms | 3.02 ms | 2.1 MiB | 608 |
| 10240 | 3.54 ms | 3.62 ms | 5.33 ms | 4.2 MiB | 282 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.03 ms | 2.09 ms | 3.71 ms | 1.2 MiB | 493 |
| 40 | 3.72 ms | 3.77 ms | 5.40 ms | 2.5 MiB | 269 |
| 80 | 7.17 ms | 10.2 ms | 8.93 ms | 5.0 MiB | 140 |
| 160 | 14.0 ms | 14.4 ms | 15.7 ms | 10.0 MiB | 72 |
| 320 | 27.7 ms | 28.0 ms | 29.9 ms | 20.0 MiB | 36 |
| 640 | 55.2 ms | 57.5 ms | 57.4 ms | 40.1 MiB | 18 |
| 1280 | 110 ms | 116 ms | 112 ms | 16.1 MiB | 9 |
| 2560 | 220 ms | 224 ms | 222 ms | 32.3 MiB | 5 |
| 5120 | 438 ms | 439 ms | 440 ms | 707.4 KiB | 2 |
| 10240 | 877 ms | 879 ms | 880 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.14 ms | 1.17 ms | 2.73 ms | 645.6 KiB | 877 |
| 40 | 1.99 ms | 2.02 ms | 3.60 ms | 1.3 MiB | 502 |
| 80 | 3.70 ms | 3.72 ms | 5.31 ms | 2.5 MiB | 271 |
| 160 | 7.14 ms | 7.21 ms | 8.78 ms | 5.2 MiB | 140 |
| 320 | 14.1 ms | 14.3 ms | 15.8 ms | 10.6 MiB | 71 |
| 640 | 28.0 ms | 28.1 ms | 30.1 ms | 21.4 MiB | 36 |
| 1280 | 56.3 ms | 56.9 ms | 58.5 ms | 43.6 MiB | 18 |
| 2560 | 113 ms | 114 ms | 116 ms | 25.7 MiB | 9 |
| 5120 | 228 ms | 228 ms | 231 ms | 53.9 MiB | 4 |
| 10240 | 457 ms | 459 ms | 461 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.34, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.10 µs | 9.81 µs | 4.19 µs | 9.3 KiB | 244,182 |
| 40 | 5.16 µs | 5.64 µs | 19.6 µs | 8.4 KiB | 193,780 |
| 80 | 8.50 µs | 8.86 µs | 27.8 µs | 16.2 KiB | 117,657 |
| 160 | 15.6 µs | 16.1 µs | 47.5 µs | 31.8 KiB | 63,963 |
| 320 | 29.6 µs | 30.4 µs | 85.3 µs | 63.1 KiB | 33,765 |
| 640 | 58.2 µs | 61.8 µs | 165 µs | 127.6 KiB | 17,180 |
| 1280 | 308 µs | 317 µs | 748 µs | 352.8 KiB | 3,250 |
| 2560 | 630 µs | 640 µs | 1.31 ms | 694.2 KiB | 1,588 |
| 5120 | 1.40 ms | 1.42 ms | 2.81 ms | 1.3 MiB | 715 |
| 10240 | 2.88 ms | 2.94 ms | 4.45 ms | 2.7 MiB | 347 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.88, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.13 µs | 3.26 µs | 13.1 µs | 4.5 KiB | 319,375 |
| 40 | 3.31 µs | 3.46 µs | 13.6 µs | 4.5 KiB | 302,303 |
| 80 | 3.80 µs | 4.01 µs | 15.5 µs | 4.5 KiB | 262,999 |
| 160 | 4.36 µs | 4.65 µs | 17.4 µs | 4.5 KiB | 229,109 |
| 320 | 6.06 µs | 6.63 µs | 21.8 µs | 4.5 KiB | 164,982 |
| 640 | 9.73 µs | 10.7 µs | 33.2 µs | 4.5 KiB | 102,738 |
| 1280 | 16.5 µs | 19.1 µs | 51.0 µs | 4.5 KiB | 60,638 |
| 2560 | 29.4 µs | 31.0 µs | 83.8 µs | 4.5 KiB | 33,989 |
| 5120 | 56.6 µs | 58.1 µs | 162 µs | 4.5 KiB | 17,663 |
| 10240 | 111 µs | 117 µs | 305 µs | 4.5 KiB | 9,013 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 9.22 µs | 11.0 µs | 9.43 µs | 3.6 KiB | 108,478 |
| 40 | 13.4 µs | 14.6 µs | 13.6 µs | 6.3 KiB | 74,490 |
| 80 | 22.6 µs | 24.1 µs | 92.9 µs | 11.6 KiB | 44,189 |
| 160 | 36.4 µs | 41.7 µs | 129 µs | 22.3 KiB | 27,494 |
| 320 | 63.6 µs | 71.2 µs | 192 µs | 44.7 KiB | 15,715 |
| 640 | 119 µs | 127 µs | 336 µs | 91.0 KiB | 8,413 |
| 1280 | 219 µs | 232 µs | 551 µs | 186.4 KiB | 4,574 |
| 2560 | 460 µs | 501 µs | 1.13 ms | 360.8 KiB | 2,173 |
| 5120 | 1.01 ms | 1.08 ms | 2.34 ms | 685.2 KiB | 991 |
| 10240 | 1.79 ms | 1.85 ms | 3.23 ms | 1.3 MiB | 559 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.12 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.40 ms | 1.40 ms | 66% |
| `load-exception-registry` | 1 | 469 µs | 469 µs | 22% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 253 µs | 12% |

**At 10240 entrys** (whole operation: 36.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 23.8 ms | 23.8 ms | 65% |
| `load-exception-registry` | 1 | 6.05 ms | 6.05 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 6.99 ms | 19% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-23T09:47:07.820Z` → `2026-11-23T09:47:59.161Z` (51 s), ci: CI (run 45147196675)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.3, GitHub Actions
- Git: `e1abd4d6e25ccb5bd3516953284206c146355f3d` on `dependabot/npm_and_yarn/dev-dependencies-6826db4a85`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

