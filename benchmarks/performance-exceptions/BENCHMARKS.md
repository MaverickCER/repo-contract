# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.17 ms** per operation compared with a bare-minimum baseline (**297% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 0.99). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.17 ms | 18.6 ms |
| Added latency, relative to baseline | 297% | 371% |
| Added CPU time per operation | 890 µs | 19.0 ms |
| Added memory per operation (heap delta) | 1.5 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 852 ops/s | 54 ops/s |

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
| 20 | 24.1 µs | 194 µs | 169 µs | 702% | 475 µs | $0.00035 – $0.0053 |
| 40 | 36.9 µs | 336 µs | 301 µs | 814% | 1.01 ms | $0.00063 – $0.011 |
| 80 | 65.3 µs | 357 µs | 293 µs | 449% | 1.20 ms | $0.00061 – $0.014 |
| 160 | 121 µs | 483 µs | 362 µs | 298% | 1.27 ms | $0.00075 – $0.014 |
| 320 | 234 µs | 897 µs | 663 µs | 283% | 1.37 ms | $0.0014 – $0.015 |
| 640 | 395 µs | 1.57 ms | 1.17 ms | 297% | 890 µs | $0.0024 – $0.010 |
| 1280 | 677 µs | 2.75 ms | 2.08 ms | 307% | 1.82 ms | $0.0043 – $0.020 |
| 2560 | 1.24 ms | 5.21 ms | 3.97 ms | 319% | 3.75 ms | $0.0083 – $0.042 |
| 5120 | 2.48 ms | 11.7 ms | 9.25 ms | 373% | 9.39 ms | $0.019 – $0.106 |
| 10240 | 5.00 ms | 23.5 ms | 18.6 ms | 371% | 19.0 ms | $0.039 – $0.213 |

**How the total grows:** O(n) (linear), exponent 0.99 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 167 µs | 2.34 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 29.5 µs | 771 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 341 µs | 3.96 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.01 ms | 17.1 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 18.5 ms | 305 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 63.9 µs | 2.02 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 35.9 ms | 575 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 18.2 ms | 301 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 36.4 µs | 2.07 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 5.67 µs | 63.7 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 76.0 µs | 1.28 ms |

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

**Measured: O(n)** (exponent 0.97, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.5 µs | 65.3 µs | 159 µs | 120.0 KiB | 19,405 |
| 40 | 33.4 µs | 34.5 µs | 87.8 µs | 97.2 KiB | 29,979 |
| 80 | 39.1 µs | 41.7 µs | 104 µs | 123.7 KiB | 25,543 |
| 160 | 52.3 µs | 55.3 µs | 134 µs | 158.1 KiB | 19,111 |
| 320 | 76.1 µs | 78.0 µs | 185 µs | 239.5 KiB | 13,143 |
| 640 | 167 µs | 209 µs | 501 µs | 524.5 KiB | 5,989 |
| 1280 | 275 µs | 282 µs | 607 µs | 1.0 MiB | 3,634 |
| 2560 | 520 µs | 528 µs | 976 µs | 2.1 MiB | 1,923 |
| 5120 | 1.20 ms | 1.22 ms | 2.07 ms | 4.3 MiB | 836 |
| 10240 | 2.34 ms | 2.46 ms | 2.95 ms | 8.6 MiB | 427 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.19, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.39 µs | 5.61 µs | 18.8 µs | 17.0 KiB | 185,411 |
| 40 | 5.20 µs | 5.46 µs | 16.7 µs | 16.3 KiB | 192,212 |
| 80 | 6.66 µs | 6.89 µs | 20.9 µs | 20.5 KiB | 150,084 |
| 160 | 9.76 µs | 10.1 µs | 29.8 µs | 28.6 KiB | 102,410 |
| 320 | 16.0 µs | 16.5 µs | 45.0 µs | 48.2 KiB | 62,387 |
| 640 | 29.5 µs | 30.2 µs | 76.2 µs | 87.8 KiB | 33,935 |
| 1280 | 60.7 µs | 62.3 µs | 153 µs | 171.0 KiB | 16,478 |
| 2560 | 130 µs | 133 µs | 346 µs | 343.9 KiB | 7,701 |
| 5120 | 350 µs | 357 µs | 739 µs | 668.2 KiB | 2,857 |
| 10240 | 771 µs | 785 µs | 1.46 ms | 1.3 MiB | 1,297 |

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

**Measured: O(n)** (exponent 0.93, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 87.1 µs | 120 µs | 282 µs | 11.8 KiB | 11,483 |
| 40 | 69.7 µs | 74.3 µs | 159 µs | 17.5 KiB | 14,352 |
| 80 | 147 µs | 158 µs | 377 µs | 29.7 KiB | 6,794 |
| 160 | 207 µs | 235 µs | 575 µs | 53.8 KiB | 4,836 |
| 320 | 231 µs | 240 µs | 466 µs | 101.0 KiB | 4,334 |
| 640 | 341 µs | 356 µs | 582 µs | 196.0 KiB | 2,934 |
| 1280 | 549 µs | 566 µs | 1.06 ms | 389.5 KiB | 1,820 |
| 2560 | 1.32 ms | 1.54 ms | 2.18 ms | 767.2 KiB | 757 |
| 5120 | 2.51 ms | 2.76 ms | 3.66 ms | 1.5 MiB | 398 |
| 10240 | 3.96 ms | 4.11 ms | 5.13 ms | 3.0 MiB | 253 |

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
| 20 | 37.6 µs | 45.2 µs | 121 µs | 43.9 KiB | 26,625 |
| 40 | 62.7 µs | 66.9 µs | 155 µs | 82.8 KiB | 15,949 |
| 80 | 121 µs | 130 µs | 275 µs | 161.3 KiB | 8,280 |
| 160 | 244 µs | 273 µs | 552 µs | 318.6 KiB | 4,095 |
| 320 | 466 µs | 489 µs | 932 µs | 632.1 KiB | 2,147 |
| 640 | 1.01 ms | 1.07 ms | 2.01 ms | 1.2 MiB | 988 |
| 1280 | 1.87 ms | 1.93 ms | 2.92 ms | 2.5 MiB | 535 |
| 2560 | 3.59 ms | 3.66 ms | 4.73 ms | 4.9 MiB | 278 |
| 5120 | 7.20 ms | 7.28 ms | 8.55 ms | 9.8 MiB | 139 |
| 10240 | 17.1 ms | 17.3 ms | 18.9 ms | 19.7 MiB | 59 |

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
| 20 | 1.05 ms | 1.34 ms | 2.49 ms | 652.5 KiB | 948 |
| 40 | 1.29 ms | 2.06 ms | 2.30 ms | 1.3 MiB | 774 |
| 80 | 2.43 ms | 3.15 ms | 3.43 ms | 2.6 MiB | 412 |
| 160 | 4.73 ms | 6.22 ms | 5.79 ms | 5.2 MiB | 211 |
| 320 | 9.35 ms | 11.8 ms | 10.5 ms | 10.6 MiB | 107 |
| 640 | 18.5 ms | 18.7 ms | 19.6 ms | 21.4 MiB | 54 |
| 1280 | 37.3 ms | 41.6 ms | 38.7 ms | 43.7 MiB | 27 |
| 2560 | 74.9 ms | 75.2 ms | 76.4 ms | 25.9 MiB | 13 |
| 5120 | 153 ms | 154 ms | 160 ms | 54.2 MiB | 7 |
| 10240 | 305 ms | 306 ms | 312 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.18, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.64 µs | 5.63 µs | 3.68 µs | 7.4 KiB | 274,367 |
| 40 | 4.45 µs | 5.15 µs | 11.9 µs | 14.0 KiB | 224,641 |
| 80 | 9.29 µs | 10.7 µs | 27.9 µs | 27.3 KiB | 107,691 |
| 160 | 18.1 µs | 21.0 µs | 54.8 µs | 53.9 KiB | 55,214 |
| 320 | 32.5 µs | 33.7 µs | 84.8 µs | 107.2 KiB | 30,815 |
| 640 | 63.9 µs | 67.6 µs | 171 µs | 213.7 KiB | 15,645 |
| 1280 | 270 µs | 280 µs | 616 µs | 515.9 KiB | 3,706 |
| 2560 | 540 µs | 576 µs | 1.12 ms | 1.0 MiB | 1,850 |
| 5120 | 932 µs | 940 µs | 1.47 ms | 1.4 MiB | 1,073 |
| 10240 | 2.02 ms | 2.05 ms | 3.21 ms | 2.9 MiB | 494 |

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
| 20 | 1.33 ms | 1.37 ms | 2.62 ms | 1.2 MiB | 752 |
| 40 | 2.42 ms | 2.44 ms | 3.71 ms | 2.5 MiB | 413 |
| 80 | 4.62 ms | 4.69 ms | 5.92 ms | 5.0 MiB | 217 |
| 160 | 9.06 ms | 9.22 ms | 10.4 ms | 10.0 MiB | 110 |
| 320 | 18.0 ms | 18.1 ms | 19.3 ms | 20.0 MiB | 56 |
| 640 | 35.9 ms | 42.0 ms | 37.3 ms | 40.1 MiB | 28 |
| 1280 | 71.8 ms | 72.1 ms | 73.2 ms | 16.1 MiB | 14 |
| 2560 | 144 ms | 144 ms | 145 ms | 32.3 MiB | 7 |
| 5120 | 287 ms | 288 ms | 289 ms | 707.4 KiB | 3 |
| 10240 | 575 ms | 577 ms | 577 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 669 µs | 678 µs | 1.32 ms | 643.3 KiB | 1,495 |
| 40 | 1.33 ms | 1.36 ms | 2.63 ms | 1.3 MiB | 752 |
| 80 | 2.39 ms | 2.46 ms | 3.71 ms | 2.5 MiB | 418 |
| 160 | 4.64 ms | 4.68 ms | 5.95 ms | 5.2 MiB | 215 |
| 320 | 9.15 ms | 9.34 ms | 10.4 ms | 10.6 MiB | 109 |
| 640 | 18.2 ms | 18.3 ms | 19.6 ms | 21.4 MiB | 55 |
| 1280 | 36.6 ms | 36.9 ms | 37.9 ms | 43.6 MiB | 27 |
| 2560 | 74.8 ms | 75.2 ms | 76.3 ms | 25.7 MiB | 13 |
| 5120 | 150 ms | 154 ms | 152 ms | 53.9 MiB | 7 |
| 10240 | 301 ms | 302 ms | 304 ms | 46.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.39, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.75 µs | 6.68 µs | 2.83 µs | 9.3 KiB | 363,619 |
| 40 | 3.17 µs | 3.34 µs | 10.9 µs | 8.4 KiB | 315,280 |
| 80 | 5.36 µs | 6.16 µs | 16.0 µs | 16.2 KiB | 186,638 |
| 160 | 9.78 µs | 10.3 µs | 26.7 µs | 31.8 KiB | 102,203 |
| 320 | 18.9 µs | 19.5 µs | 49.3 µs | 63.1 KiB | 53,005 |
| 640 | 36.4 µs | 38.2 µs | 94.1 µs | 127.7 KiB | 27,436 |
| 1280 | 206 µs | 209 µs | 463 µs | 349.8 KiB | 4,845 |
| 2560 | 458 µs | 466 µs | 988 µs | 694.2 KiB | 2,185 |
| 5120 | 957 µs | 975 µs | 1.51 ms | 1.3 MiB | 1,045 |
| 10240 | 2.07 ms | 2.11 ms | 3.25 ms | 2.7 MiB | 483 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.94 µs | 2.03 µs | 7.50 µs | 4.5 KiB | 515,288 |
| 40 | 1.95 µs | 2.03 µs | 6.98 µs | 4.5 KiB | 513,092 |
| 80 | 2.27 µs | 2.37 µs | 8.29 µs | 4.5 KiB | 441,389 |
| 160 | 2.92 µs | 3.17 µs | 9.50 µs | 4.5 KiB | 342,685 |
| 320 | 3.82 µs | 4.01 µs | 11.4 µs | 4.5 KiB | 262,097 |
| 640 | 5.67 µs | 6.17 µs | 15.7 µs | 4.5 KiB | 176,251 |
| 1280 | 9.96 µs | 10.3 µs | 27.3 µs | 4.5 KiB | 100,407 |
| 2560 | 17.0 µs | 20.5 µs | 44.4 µs | 4.5 KiB | 58,871 |
| 5120 | 32.6 µs | 38.5 µs | 82.6 µs | 4.5 KiB | 30,712 |
| 10240 | 63.7 µs | 85.5 µs | 163 µs | 4.5 KiB | 15,694 |

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
| 20 | 6.04 µs | 7.69 µs | 6.22 µs | 3.6 KiB | 165,457 |
| 40 | 8.64 µs | 9.39 µs | 8.76 µs | 6.2 KiB | 115,705 |
| 80 | 13.8 µs | 14.9 µs | 52.5 µs | 11.6 KiB | 72,328 |
| 160 | 22.6 µs | 27.2 µs | 73.0 µs | 22.2 KiB | 44,273 |
| 320 | 39.9 µs | 44.3 µs | 114 µs | 44.3 KiB | 25,050 |
| 640 | 76.0 µs | 83.2 µs | 204 µs | 89.7 KiB | 13,159 |
| 1280 | 144 µs | 172 µs | 359 µs | 183.3 KiB | 6,949 |
| 2560 | 285 µs | 312 µs | 650 µs | 382.2 KiB | 3,505 |
| 5120 | 658 µs | 679 µs | 1.22 ms | 683.1 KiB | 1,520 |
| 10240 | 1.28 ms | 1.38 ms | 2.39 ms | 1.3 MiB | 784 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.57 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.01 ms | 1.01 ms | 65% |
| `load-exception-registry` | 1 | 341 µs | 341 µs | 22% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 215 µs | 14% |

**At 10240 entrys** (whole operation: 23.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 17.1 ms | 17.1 ms | 73% |
| `load-exception-registry` | 1 | 3.96 ms | 3.96 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.49 ms | 11% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-17T21:59:53.345Z` → `2026-11-17T22:00:32.772Z` (39 s), ci: CI (run 44182943625)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `71673de101f1efe54db13d9f6d6315fd75ae821f` on `dependabot/npm_and_yarn/dev-dependencies-46c679c72d`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

