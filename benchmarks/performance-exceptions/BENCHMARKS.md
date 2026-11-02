# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.08 ms** per operation compared with a bare-minimum baseline (**305% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.08 ms | 20.6 ms |
| Added latency, relative to baseline | 305% | 364% |
| Added CPU time per operation | 1.77 ms | 20.9 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 926 ops/s | 49 ops/s |

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
| 20 | 17.2 µs | 70.5 µs | 53.4 µs | 311% | 198 µs | $0.00011 – $0.0022 |
| 40 | 25.2 µs | 102 µs | 76.6 µs | 304% | 202 µs | $0.00016 – $0.0023 |
| 80 | 48.2 µs | 184 µs | 136 µs | 283% | 316 µs | $0.00028 – $0.0035 |
| 160 | 95.2 µs | 347 µs | 252 µs | 265% | 448 µs | $0.00052 – $0.005 |
| 320 | 192 µs | 663 µs | 471 µs | 246% | 719 µs | $0.00098 – $0.0081 |
| 640 | 354 µs | 1.43 ms | 1.08 ms | 305% | 1.77 ms | $0.0022 – $0.020 |
| 1280 | 705 µs | 2.68 ms | 1.97 ms | 279% | 2.44 ms | $0.0041 – $0.027 |
| 2560 | 1.40 ms | 5.36 ms | 3.95 ms | 282% | 4.02 ms | $0.0082 – $0.045 |
| 5120 | 2.73 ms | 11.0 ms | 8.31 ms | 304% | 8.55 ms | $0.017 – $0.096 |
| 10240 | 5.64 ms | 26.2 ms | 20.6 ms | 364% | 20.9 ms | $0.043 – $0.235 |

**How the total grows:** O(n) (linear), exponent 1.04 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 190 µs | 2.87 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 35.3 µs | 872 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 286 µs | 4.07 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.09 ms | 18.7 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 19.8 ms | 326 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 67.3 µs | 2.64 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 40.2 ms | 621 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 20.0 ms | 324 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 39.3 µs | 2.22 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 6.38 µs | 76.1 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 79.6 µs | 1.31 ms |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 60.0 µs | 79.2 µs | 188 µs | 117.4 KiB | 16,669 |
| 40 | 37.4 µs | 38.9 µs | 100 µs | 97.4 KiB | 26,728 |
| 80 | 44.6 µs | 46.3 µs | 114 µs | 123.7 KiB | 22,421 |
| 160 | 55.6 µs | 72.7 µs | 148 µs | 158.2 KiB | 17,983 |
| 320 | 82.0 µs | 94.5 µs | 209 µs | 239.2 KiB | 12,195 |
| 640 | 190 µs | 310 µs | 514 µs | 524.5 KiB | 5,271 |
| 1280 | 286 µs | 312 µs | 604 µs | 1.0 MiB | 3,502 |
| 2560 | 551 µs | 605 µs | 1.02 ms | 2.1 MiB | 1,816 |
| 5120 | 1.27 ms | 1.33 ms | 2.21 ms | 4.3 MiB | 790 |
| 10240 | 2.87 ms | 3.12 ms | 3.46 ms | 8.6 MiB | 349 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.75 µs | 7.26 µs | 27.8 µs | 17.0 KiB | 148,065 |
| 40 | 6.21 µs | 7.10 µs | 22.0 µs | 16.3 KiB | 161,019 |
| 80 | 7.82 µs | 8.53 µs | 26.3 µs | 20.5 KiB | 127,885 |
| 160 | 10.7 µs | 11.5 µs | 33.2 µs | 28.6 KiB | 93,321 |
| 320 | 18.4 µs | 19.5 µs | 53.0 µs | 48.3 KiB | 54,318 |
| 640 | 35.3 µs | 43.9 µs | 100 µs | 86.6 KiB | 28,295 |
| 1280 | 65.7 µs | 159 µs | 171 µs | 167.5 KiB | 15,229 |
| 2560 | 141 µs | 297 µs | 365 µs | 343.9 KiB | 7,105 |
| 5120 | 376 µs | 566 µs | 778 µs | 668.2 KiB | 2,659 |
| 10240 | 872 µs | 1.45 ms | 1.62 ms | 1.3 MiB | 1,147 |

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
| 20 | 14.0 µs | 15.6 µs | 14.2 µs | 7.3 KiB | 71,622 |
| 40 | 20.2 µs | 22.1 µs | 53.7 µs | 13.2 KiB | 49,544 |
| 80 | 39.3 µs | 41.5 µs | 105 µs | 25.1 KiB | 25,438 |
| 160 | 75.3 µs | 80.1 µs | 180 µs | 48.9 KiB | 13,281 |
| 320 | 148 µs | 152 µs | 354 µs | 96.4 KiB | 6,777 |
| 640 | 286 µs | 303 µs | 625 µs | 191.5 KiB | 3,492 |
| 1280 | 552 µs | 634 µs | 1.08 ms | 381.6 KiB | 1,810 |
| 2560 | 1.15 ms | 1.43 ms | 2.32 ms | 761.9 KiB | 869 |
| 5120 | 2.69 ms | 3.53 ms | 3.93 ms | 1.5 MiB | 372 |
| 10240 | 4.07 ms | 4.17 ms | 5.54 ms | 3.0 MiB | 246 |

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
| 20 | 44.6 µs | 48.4 µs | 171 µs | 44.1 KiB | 22,446 |
| 40 | 68.6 µs | 81.3 µs | 182 µs | 82.8 KiB | 14,581 |
| 80 | 128 µs | 142 µs | 298 µs | 161.1 KiB | 7,822 |
| 160 | 260 µs | 294 µs | 604 µs | 318.6 KiB | 3,840 |
| 320 | 500 µs | 578 µs | 1.02 ms | 632.2 KiB | 1,999 |
| 640 | 1.09 ms | 1.46 ms | 2.14 ms | 1.2 MiB | 913 |
| 1280 | 2.01 ms | 2.71 ms | 3.09 ms | 2.5 MiB | 498 |
| 2560 | 3.81 ms | 3.96 ms | 5.02 ms | 4.9 MiB | 262 |
| 5120 | 7.63 ms | 8.43 ms | 9.06 ms | 9.8 MiB | 131 |
| 10240 | 18.7 ms | 19.3 ms | 20.7 ms | 19.7 MiB | 53 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.13 ms | 1.56 ms | 2.67 ms | 652.5 KiB | 882 |
| 40 | 1.35 ms | 2.17 ms | 2.38 ms | 1.3 MiB | 740 |
| 80 | 2.56 ms | 3.54 ms | 3.57 ms | 2.6 MiB | 391 |
| 160 | 5.13 ms | 8.27 ms | 6.22 ms | 5.2 MiB | 195 |
| 320 | 10.3 ms | 12.6 ms | 11.5 ms | 10.6 MiB | 97 |
| 640 | 19.8 ms | 20.0 ms | 21.0 ms | 21.4 MiB | 51 |
| 1280 | 39.5 ms | 42.6 ms | 41.4 ms | 43.7 MiB | 25 |
| 2560 | 81.3 ms | 84.6 ms | 83.3 ms | 25.9 MiB | 12 |
| 5120 | 171 ms | 197 ms | 175 ms | 54.2 MiB | 6 |
| 10240 | 326 ms | 328 ms | 335 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.27, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.96 µs | 4.88 µs | 4.13 µs | 7.4 KiB | 252,530 |
| 40 | 5.19 µs | 6.35 µs | 16.1 µs | 14.0 KiB | 192,723 |
| 80 | 9.67 µs | 13.5 µs | 27.6 µs | 27.3 KiB | 103,376 |
| 160 | 18.4 µs | 20.9 µs | 49.5 µs | 53.9 KiB | 54,494 |
| 320 | 35.5 µs | 38.6 µs | 93.1 µs | 107.0 KiB | 28,188 |
| 640 | 67.3 µs | 70.9 µs | 176 µs | 213.7 KiB | 14,853 |
| 1280 | 282 µs | 294 µs | 640 µs | 515.9 KiB | 3,541 |
| 2560 | 559 µs | 573 µs | 1.12 ms | 1.0 MiB | 1,790 |
| 5120 | 1.24 ms | 1.33 ms | 2.31 ms | 2.1 MiB | 807 |
| 10240 | 2.64 ms | 2.98 ms | 4.43 ms | 4.2 MiB | 379 |

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
| 20 | 1.41 ms | 1.51 ms | 2.75 ms | 1.2 MiB | 708 |
| 40 | 2.59 ms | 3.82 ms | 3.98 ms | 2.5 MiB | 387 |
| 80 | 4.93 ms | 5.10 ms | 6.29 ms | 5.0 MiB | 203 |
| 160 | 9.61 ms | 9.97 ms | 11.0 ms | 10.0 MiB | 104 |
| 320 | 19.0 ms | 19.6 ms | 20.4 ms | 20.0 MiB | 53 |
| 640 | 40.2 ms | 69.1 ms | 41.6 ms | 40.1 MiB | 25 |
| 1280 | 78.0 ms | 110 ms | 79.6 ms | 16.1 MiB | 13 |
| 2560 | 156 ms | 190 ms | 157 ms | 32.3 MiB | 6 |
| 5120 | 319 ms | 359 ms | 321 ms | 708.6 KiB | 3 |
| 10240 | 621 ms | 630 ms | 624 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 720 µs | 776 µs | 1.40 ms | 643.3 KiB | 1,389 |
| 40 | 1.43 ms | 1.49 ms | 2.79 ms | 1.3 MiB | 697 |
| 80 | 2.59 ms | 2.69 ms | 3.92 ms | 2.5 MiB | 385 |
| 160 | 5.06 ms | 11.8 ms | 6.52 ms | 5.2 MiB | 198 |
| 320 | 9.99 ms | 10.1 ms | 11.4 ms | 10.6 MiB | 100 |
| 640 | 20.0 ms | 20.8 ms | 22.0 ms | 21.4 MiB | 50 |
| 1280 | 39.8 ms | 40.0 ms | 41.5 ms | 43.6 MiB | 25 |
| 2560 | 80.3 ms | 81.2 ms | 82.7 ms | 25.7 MiB | 12 |
| 5120 | 162 ms | 163 ms | 165 ms | 53.9 MiB | 6 |
| 10240 | 324 ms | 336 ms | 328 ms | 46.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.38, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.00 µs | 7.61 µs | 3.09 µs | 9.3 KiB | 333,839 |
| 40 | 3.39 µs | 4.23 µs | 12.1 µs | 8.4 KiB | 295,258 |
| 80 | 5.61 µs | 5.84 µs | 16.7 µs | 16.2 KiB | 178,100 |
| 160 | 10.4 µs | 10.8 µs | 29.0 µs | 31.8 KiB | 96,393 |
| 320 | 21.4 µs | 22.3 µs | 64.8 µs | 63.1 KiB | 46,687 |
| 640 | 39.3 µs | 41.4 µs | 100 µs | 127.8 KiB | 25,423 |
| 1280 | 236 µs | 242 µs | 590 µs | 352.8 KiB | 4,236 |
| 2560 | 485 µs | 497 µs | 1.04 ms | 694.2 KiB | 2,063 |
| 5120 | 1.07 ms | 1.09 ms | 2.22 ms | 1.3 MiB | 937 |
| 10240 | 2.22 ms | 2.27 ms | 3.47 ms | 2.7 MiB | 450 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.88, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.12 µs | 2.24 µs | 8.42 µs | 4.5 KiB | 471,705 |
| 40 | 2.20 µs | 2.29 µs | 8.64 µs | 4.5 KiB | 453,588 |
| 80 | 2.39 µs | 2.48 µs | 8.65 µs | 4.5 KiB | 418,576 |
| 160 | 3.11 µs | 3.21 µs | 10.3 µs | 4.5 KiB | 321,356 |
| 320 | 4.40 µs | 4.58 µs | 14.6 µs | 4.5 KiB | 227,406 |
| 640 | 6.38 µs | 7.07 µs | 18.9 µs | 4.5 KiB | 156,640 |
| 1280 | 10.6 µs | 10.9 µs | 29.1 µs | 4.5 KiB | 94,352 |
| 2560 | 18.8 µs | 25.1 µs | 50.4 µs | 4.5 KiB | 53,287 |
| 5120 | 34.2 µs | 35.6 µs | 90.4 µs | 4.5 KiB | 29,259 |
| 10240 | 76.1 µs | 101 µs | 201 µs | 4.5 KiB | 13,146 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.28 µs | 9.57 µs | 7.44 µs | 3.7 KiB | 137,285 |
| 40 | 9.27 µs | 10.2 µs | 9.36 µs | 6.3 KiB | 107,858 |
| 80 | 15.0 µs | 15.7 µs | 57.6 µs | 11.6 KiB | 66,824 |
| 160 | 25.0 µs | 28.4 µs | 83.8 µs | 22.2 KiB | 40,037 |
| 320 | 44.8 µs | 49.1 µs | 140 µs | 44.6 KiB | 22,321 |
| 640 | 79.6 µs | 86.8 µs | 213 µs | 89.7 KiB | 12,559 |
| 1280 | 149 µs | 162 µs | 370 µs | 183.3 KiB | 6,692 |
| 2560 | 293 µs | 312 µs | 659 µs | 382.2 KiB | 3,410 |
| 5120 | 637 µs | 665 µs | 1.22 ms | 643.1 KiB | 1,569 |
| 10240 | 1.31 ms | 1.40 ms | 2.46 ms | 1.3 MiB | 761 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.43 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.09 ms | 1.09 ms | 76% |
| `load-exception-registry` | 1 | 286 µs | 286 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 52.6 µs | 3.7% |

**At 10240 entrys** (whole operation: 26.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 18.7 ms | 18.7 ms | 71% |
| `load-exception-registry` | 1 | 4.07 ms | 4.07 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.43 ms | 13% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T09:45:34.765Z` → `2026-11-02T09:46:18.103Z` (43 s), ci: CI (run 41421304272)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `e60de69da381ce75b3523692bb63ac8e9f996a65` on `dependabot/npm_and_yarn/internal-package-contract-v0.13.3`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

