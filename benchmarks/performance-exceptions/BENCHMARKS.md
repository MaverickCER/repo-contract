# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.01 ms** per operation compared with a bare-minimum baseline (**238% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.01 ms | 19.7 ms |
| Added latency, relative to baseline | 238% | 369% |
| Added CPU time per operation | 1.03 ms | 20.5 ms |
| Added memory per operation (heap delta) | 1.5 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 991 ops/s | 51 ops/s |

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
| 20 | 25.0 µs | 116 µs | 91.3 µs | 364% | 91.0 µs | $0.00019 – $0.001 |
| 40 | 38.3 µs | 171 µs | 132 µs | 345% | 132 µs | $0.00028 – $0.0015 |
| 80 | 65.9 µs | 280 µs | 215 µs | 326% | 817 µs | $0.00045 – $0.0092 |
| 160 | 133 µs | 454 µs | 321 µs | 242% | 1.34 ms | $0.00067 – $0.015 |
| 320 | 255 µs | 757 µs | 502 µs | 197% | 1.53 ms | $0.001 – $0.017 |
| 640 | 423 µs | 1.43 ms | 1.01 ms | 238% | 1.03 ms | $0.0021 – $0.012 |
| 1280 | 710 µs | 2.69 ms | 1.97 ms | 277% | 2.00 ms | $0.0041 – $0.022 |
| 2560 | 1.29 ms | 5.23 ms | 3.93 ms | 305% | 4.09 ms | $0.0082 – $0.046 |
| 5120 | 2.67 ms | 12.3 ms | 9.60 ms | 360% | 9.79 ms | $0.020 – $0.110 |
| 10240 | 5.35 ms | 25.0 ms | 19.7 ms | 369% | 20.5 ms | $0.041 – $0.230 |

**How the total grows:** O(n) (linear), exponent 1.04 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 241 µs | 2.52 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 33.8 µs | 855 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 286 µs | 4.11 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.04 ms | 18.4 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 19.4 ms | 331 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 68.9 µs | 2.61 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 39.8 ms | 606 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 19.6 ms | 315 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 39.6 µs | 2.20 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 6.21 µs | 67.8 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 76.5 µs | 1.36 ms |

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

**Measured: O(n)** (exponent 0.89, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 56.3 µs | 74.1 µs | 171 µs | 120.0 KiB | 17,771 |
| 40 | 34.7 µs | 35.7 µs | 79.1 µs | 97.0 KiB | 28,847 |
| 80 | 43.1 µs | 48.6 µs | 111 µs | 123.7 KiB | 23,202 |
| 160 | 59.0 µs | 63.8 µs | 154 µs | 158.2 KiB | 16,950 |
| 320 | 77.5 µs | 81.3 µs | 156 µs | 244.5 KiB | 12,911 |
| 640 | 241 µs | 299 µs | 750 µs | 656.2 KiB | 4,149 |
| 1280 | 303 µs | 315 µs | 645 µs | 1.0 MiB | 3,301 |
| 2560 | 571 µs | 591 µs | 1.06 ms | 2.1 MiB | 1,752 |
| 5120 | 1.30 ms | 1.34 ms | 2.29 ms | 4.3 MiB | 767 |
| 10240 | 2.52 ms | 2.60 ms | 3.00 ms | 8.6 MiB | 396 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.67 µs | 7.02 µs | 21.0 µs | 17.0 KiB | 149,954 |
| 40 | 5.78 µs | 6.68 µs | 19.7 µs | 16.2 KiB | 173,100 |
| 80 | 7.22 µs | 8.13 µs | 22.4 µs | 20.5 KiB | 138,535 |
| 160 | 10.4 µs | 10.9 µs | 32.4 µs | 28.6 KiB | 95,751 |
| 320 | 17.4 µs | 18.2 µs | 49.8 µs | 48.2 KiB | 57,462 |
| 640 | 33.8 µs | 36.9 µs | 89.7 µs | 86.6 KiB | 29,623 |
| 1280 | 63.0 µs | 65.7 µs | 159 µs | 171.0 KiB | 15,876 |
| 2560 | 136 µs | 145 µs | 312 µs | 338.6 KiB | 7,327 |
| 5120 | 411 µs | 429 µs | 1.03 ms | 634.3 KiB | 2,434 |
| 10240 | 855 µs | 869 µs | 1.59 ms | 1.3 MiB | 1,170 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 13.5 µs | 14.7 µs | 56.1 µs | 7.3 KiB | 74,056 |
| 40 | 19.9 µs | 20.7 µs | 53.4 µs | 13.2 KiB | 50,152 |
| 80 | 38.2 µs | 39.3 µs | 93.8 µs | 25.1 KiB | 26,206 |
| 160 | 73.4 µs | 88.7 µs | 172 µs | 48.9 KiB | 13,624 |
| 320 | 150 µs | 159 µs | 356 µs | 96.4 KiB | 6,669 |
| 640 | 286 µs | 292 µs | 625 µs | 191.5 KiB | 3,498 |
| 1280 | 549 µs | 565 µs | 1.08 ms | 381.6 KiB | 1,822 |
| 2560 | 1.23 ms | 1.53 ms | 2.62 ms | 761.9 KiB | 816 |
| 5120 | 2.65 ms | 2.87 ms | 3.90 ms | 1.5 MiB | 377 |
| 10240 | 4.11 ms | 8.88 ms | 5.59 ms | 3.0 MiB | 243 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 40.7 µs | 53.2 µs | 148 µs | 44.0 KiB | 24,543 |
| 40 | 67.7 µs | 75.0 µs | 182 µs | 82.8 KiB | 14,762 |
| 80 | 127 µs | 140 µs | 297 µs | 161.1 KiB | 7,866 |
| 160 | 252 µs | 271 µs | 593 µs | 318.6 KiB | 3,971 |
| 320 | 475 µs | 510 µs | 980 µs | 632.2 KiB | 2,104 |
| 640 | 1.04 ms | 1.11 ms | 2.08 ms | 1.2 MiB | 958 |
| 1280 | 1.96 ms | 2.05 ms | 3.06 ms | 2.5 MiB | 511 |
| 2560 | 3.76 ms | 3.91 ms | 4.97 ms | 4.9 MiB | 266 |
| 5120 | 7.73 ms | 7.97 ms | 9.24 ms | 9.8 MiB | 129 |
| 10240 | 18.4 ms | 18.8 ms | 20.5 ms | 19.7 MiB | 54 |

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
| 20 | 1.20 ms | 1.58 ms | 2.93 ms | 652.5 KiB | 836 |
| 40 | 1.37 ms | 2.09 ms | 2.40 ms | 1.3 MiB | 728 |
| 80 | 2.50 ms | 3.44 ms | 3.52 ms | 2.6 MiB | 400 |
| 160 | 5.04 ms | 6.29 ms | 6.17 ms | 5.2 MiB | 199 |
| 320 | 10.8 ms | 15.7 ms | 14.4 ms | 10.6 MiB | 93 |
| 640 | 19.4 ms | 19.6 ms | 20.8 ms | 21.4 MiB | 51 |
| 1280 | 39.0 ms | 41.3 ms | 40.8 ms | 43.7 MiB | 26 |
| 2560 | 78.6 ms | 81.0 ms | 80.8 ms | 25.9 MiB | 13 |
| 5120 | 158 ms | 164 ms | 161 ms | 54.2 MiB | 6 |
| 10240 | 331 ms | 350 ms | 341 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.26, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.73 µs | 4.63 µs | 3.77 µs | 7.4 KiB | 267,939 |
| 40 | 5.02 µs | 6.15 µs | 15.4 µs | 14.0 KiB | 199,079 |
| 80 | 9.26 µs | 11.1 µs | 25.9 µs | 27.3 KiB | 107,976 |
| 160 | 18.2 µs | 21.1 µs | 48.3 µs | 53.9 KiB | 54,916 |
| 320 | 34.9 µs | 40.7 µs | 95.9 µs | 107.2 KiB | 28,623 |
| 640 | 68.9 µs | 75.3 µs | 183 µs | 213.7 KiB | 14,515 |
| 1280 | 291 µs | 309 µs | 662 µs | 515.9 KiB | 3,432 |
| 2560 | 563 µs | 586 µs | 1.18 ms | 1.0 MiB | 1,777 |
| 5120 | 1.28 ms | 1.80 ms | 2.44 ms | 2.1 MiB | 778 |
| 10240 | 2.61 ms | 3.17 ms | 3.92 ms | 4.2 MiB | 384 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.42 ms | 1.57 ms | 2.79 ms | 1.2 MiB | 702 |
| 40 | 2.62 ms | 2.83 ms | 3.99 ms | 2.5 MiB | 382 |
| 80 | 4.96 ms | 5.30 ms | 6.42 ms | 5.0 MiB | 202 |
| 160 | 9.53 ms | 9.81 ms | 11.1 ms | 10.0 MiB | 105 |
| 320 | 19.8 ms | 20.1 ms | 21.9 ms | 20.0 MiB | 50 |
| 640 | 39.8 ms | 43.2 ms | 42.4 ms | 40.1 MiB | 25 |
| 1280 | 78.0 ms | 79.6 ms | 80.3 ms | 16.1 MiB | 13 |
| 2560 | 153 ms | 154 ms | 156 ms | 32.3 MiB | 7 |
| 5120 | 306 ms | 404 ms | 309 ms | 708.6 KiB | 3 |
| 10240 | 606 ms | 612 ms | 609 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 882 µs | 1.22 ms | 2.41 ms | 645.6 KiB | 1,134 |
| 40 | 1.47 ms | 1.52 ms | 2.94 ms | 1.3 MiB | 681 |
| 80 | 2.65 ms | 2.71 ms | 4.20 ms | 2.5 MiB | 377 |
| 160 | 5.06 ms | 5.62 ms | 6.71 ms | 5.2 MiB | 198 |
| 320 | 10.0 ms | 10.1 ms | 11.9 ms | 10.6 MiB | 100 |
| 640 | 19.6 ms | 19.8 ms | 21.7 ms | 21.4 MiB | 51 |
| 1280 | 39.2 ms | 39.7 ms | 41.3 ms | 43.6 MiB | 25 |
| 2560 | 80.2 ms | 132 ms | 82.5 ms | 25.7 MiB | 12 |
| 5120 | 157 ms | 159 ms | 160 ms | 53.9 MiB | 6 |
| 10240 | 315 ms | 324 ms | 318 ms | 46.2 MiB | 3 |

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
| 20 | 2.72 µs | 5.72 µs | 2.81 µs | 9.3 KiB | 367,247 |
| 40 | 3.12 µs | 3.72 µs | 10.6 µs | 8.4 KiB | 320,533 |
| 80 | 5.36 µs | 5.57 µs | 15.5 µs | 16.2 KiB | 186,422 |
| 160 | 9.94 µs | 10.7 µs | 27.3 µs | 31.8 KiB | 100,600 |
| 320 | 19.8 µs | 25.3 µs | 50.3 µs | 63.1 KiB | 50,567 |
| 640 | 39.6 µs | 50.5 µs | 104 µs | 127.7 KiB | 25,281 |
| 1280 | 226 µs | 241 µs | 571 µs | 352.8 KiB | 4,427 |
| 2560 | 471 µs | 483 µs | 1.02 ms | 694.2 KiB | 2,124 |
| 5120 | 1.07 ms | 1.09 ms | 2.18 ms | 1.3 MiB | 937 |
| 10240 | 2.20 ms | 2.22 ms | 3.42 ms | 2.7 MiB | 455 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.86, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.09 µs | 2.22 µs | 8.50 µs | 4.5 KiB | 479,239 |
| 40 | 1.95 µs | 2.05 µs | 6.91 µs | 4.5 KiB | 512,298 |
| 80 | 2.30 µs | 2.40 µs | 8.29 µs | 4.5 KiB | 434,698 |
| 160 | 3.04 µs | 3.17 µs | 9.64 µs | 4.5 KiB | 329,076 |
| 320 | 4.12 µs | 4.37 µs | 12.7 µs | 4.5 KiB | 242,933 |
| 640 | 6.21 µs | 6.50 µs | 18.0 µs | 4.5 KiB | 160,971 |
| 1280 | 10.2 µs | 11.5 µs | 27.8 µs | 4.5 KiB | 97,839 |
| 2560 | 18.2 µs | 19.7 µs | 47.6 µs | 4.5 KiB | 55,024 |
| 5120 | 33.7 µs | 36.2 µs | 87.4 µs | 4.5 KiB | 29,691 |
| 10240 | 67.8 µs | 81.7 µs | 180 µs | 4.5 KiB | 14,754 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.97 µs | 6.97 µs | 6.14 µs | 3.6 KiB | 167,553 |
| 40 | 8.71 µs | 9.40 µs | 18.8 µs | 6.2 KiB | 114,800 |
| 80 | 13.6 µs | 15.6 µs | 50.3 µs | 11.6 KiB | 73,365 |
| 160 | 24.1 µs | 28.5 µs | 81.3 µs | 22.2 KiB | 41,568 |
| 320 | 40.9 µs | 45.5 µs | 120 µs | 44.4 KiB | 24,431 |
| 640 | 76.5 µs | 84.5 µs | 205 µs | 89.7 KiB | 13,070 |
| 1280 | 144 µs | 157 µs | 355 µs | 183.3 KiB | 6,932 |
| 2560 | 290 µs | 331 µs | 671 µs | 382.2 KiB | 3,443 |
| 5120 | 640 µs | 678 µs | 1.24 ms | 643.1 KiB | 1,562 |
| 10240 | 1.36 ms | 1.42 ms | 2.56 ms | 1.3 MiB | 736 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.43 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.04 ms | 1.04 ms | 73% |
| `load-exception-registry` | 1 | 286 µs | 286 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 104 µs | 7.2% |

**At 10240 entrys** (whole operation: 25.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 18.4 ms | 18.4 ms | 74% |
| `load-exception-registry` | 1 | 4.11 ms | 4.11 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.50 ms | 10.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-12T23:53:06.677Z` → `2026-11-12T23:53:47.889Z` (41 s), ci: CI (run 43329499751)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `dcebcbeaca5e30d6b95caa0682b802a63a4c8412` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

