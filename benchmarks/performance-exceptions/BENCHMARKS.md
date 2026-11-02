# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.09 ms** per operation compared with a bare-minimum baseline (**295% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.09 ms | 19.9 ms |
| Added latency, relative to baseline | 295% | 321% |
| Added CPU time per operation | 1.80 ms | 19.8 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 914 ops/s | 50 ops/s |

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
| 20 | 18.0 µs | 84.3 µs | 66.3 µs | 367% | 304 µs | $0.00014 – $0.0034 |
| 40 | 26.9 µs | 108 µs | 81.0 µs | 301% | 200 µs | $0.00017 – $0.0023 |
| 80 | 51.9 µs | 191 µs | 139 µs | 268% | 300 µs | $0.00029 – $0.0034 |
| 160 | 99.0 µs | 348 µs | 249 µs | 251% | 441 µs | $0.00052 – $0.005 |
| 320 | 193 µs | 658 µs | 464 µs | 240% | 718 µs | $0.00097 – $0.0081 |
| 640 | 370 µs | 1.46 ms | 1.09 ms | 295% | 1.80 ms | $0.0023 – $0.020 |
| 1280 | 722 µs | 2.85 ms | 2.13 ms | 295% | 2.82 ms | $0.0044 – $0.032 |
| 2560 | 1.48 ms | 5.65 ms | 4.17 ms | 282% | 4.39 ms | $0.0087 – $0.049 |
| 5120 | 3.06 ms | 11.0 ms | 7.89 ms | 258% | 8.24 ms | $0.016 – $0.093 |
| 10240 | 6.18 ms | 26.0 ms | 19.9 ms | 321% | 19.8 ms | $0.041 – $0.223 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 223 µs | 2.87 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 35.9 µs | 856 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 289 µs | 4.15 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.11 ms | 19.6 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 19.9 ms | 332 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 75.1 µs | 2.73 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 38.9 ms | 621 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 20.1 ms | 329 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 40.8 µs | 2.25 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 6.15 µs | 71.5 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 82.8 µs | 1.40 ms |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 61.8 µs | 78.8 µs | 208 µs | 117.8 KiB | 16,183 |
| 40 | 41.4 µs | 44.9 µs | 127 µs | 97.9 KiB | 24,159 |
| 80 | 48.5 µs | 73.7 µs | 131 µs | 123.0 KiB | 20,617 |
| 160 | 65.3 µs | 68.1 µs | 185 µs | 158.7 KiB | 15,314 |
| 320 | 88.9 µs | 91.7 µs | 221 µs | 239.2 KiB | 11,249 |
| 640 | 223 µs | 288 µs | 723 µs | 656.2 KiB | 4,487 |
| 1280 | 308 µs | 323 µs | 653 µs | 1.0 MiB | 3,248 |
| 2560 | 588 µs | 607 µs | 1.12 ms | 2.1 MiB | 1,701 |
| 5120 | 1.42 ms | 1.53 ms | 2.51 ms | 4.3 MiB | 705 |
| 10240 | 2.87 ms | 2.98 ms | 3.78 ms | 8.6 MiB | 349 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.33 µs | 8.04 µs | 16.3 µs | 17.0 KiB | 136,472 |
| 40 | 6.32 µs | 7.04 µs | 21.6 µs | 16.3 KiB | 158,204 |
| 80 | 7.94 µs | 8.43 µs | 25.3 µs | 20.5 KiB | 125,922 |
| 160 | 11.6 µs | 12.4 µs | 36.1 µs | 28.6 KiB | 86,123 |
| 320 | 18.8 µs | 19.7 µs | 51.8 µs | 48.3 KiB | 53,216 |
| 640 | 35.9 µs | 36.8 µs | 95.5 µs | 86.6 KiB | 27,861 |
| 1280 | 67.4 µs | 69.5 µs | 171 µs | 167.5 KiB | 14,830 |
| 2560 | 147 µs | 150 µs | 375 µs | 343.9 KiB | 6,819 |
| 5120 | 414 µs | 431 µs | 1.05 ms | 634.3 KiB | 2,415 |
| 10240 | 856 µs | 883 µs | 1.63 ms | 1.3 MiB | 1,168 |

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
| 20 | 14.1 µs | 16.7 µs | 14.4 µs | 7.3 KiB | 70,977 |
| 40 | 19.9 µs | 20.7 µs | 53.3 µs | 13.2 KiB | 50,331 |
| 80 | 37.7 µs | 39.5 µs | 92.3 µs | 25.1 KiB | 26,514 |
| 160 | 75.1 µs | 77.3 µs | 180 µs | 48.9 KiB | 13,323 |
| 320 | 149 µs | 157 µs | 358 µs | 96.4 KiB | 6,691 |
| 640 | 289 µs | 306 µs | 638 µs | 191.5 KiB | 3,460 |
| 1280 | 563 µs | 588 µs | 1.11 ms | 381.6 KiB | 1,776 |
| 2560 | 1.20 ms | 1.48 ms | 2.40 ms | 761.9 KiB | 832 |
| 5120 | 2.67 ms | 2.96 ms | 3.95 ms | 1.5 MiB | 375 |
| 10240 | 4.15 ms | 4.30 ms | 5.84 ms | 3.0 MiB | 241 |

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
| 20 | 49.1 µs | 56.1 µs | 198 µs | 44.3 KiB | 20,371 |
| 40 | 70.5 µs | 86.2 µs | 185 µs | 82.8 KiB | 14,185 |
| 80 | 137 µs | 150 µs | 346 µs | 161.3 KiB | 7,292 |
| 160 | 267 µs | 294 µs | 628 µs | 318.6 KiB | 3,739 |
| 320 | 504 µs | 556 µs | 1.03 ms | 632.2 KiB | 1,985 |
| 640 | 1.11 ms | 1.25 ms | 2.18 ms | 1.2 MiB | 898 |
| 1280 | 2.08 ms | 2.59 ms | 3.22 ms | 2.5 MiB | 481 |
| 2560 | 4.21 ms | 9.99 ms | 5.72 ms | 4.9 MiB | 237 |
| 5120 | 8.22 ms | 8.68 ms | 10.1 ms | 9.8 MiB | 122 |
| 10240 | 19.6 ms | 20.6 ms | 22.0 ms | 19.7 MiB | 51 |

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
| 20 | 1.21 ms | 1.55 ms | 3.00 ms | 652.5 KiB | 825 |
| 40 | 1.47 ms | 2.37 ms | 2.67 ms | 1.3 MiB | 678 |
| 80 | 2.79 ms | 3.56 ms | 3.98 ms | 2.6 MiB | 359 |
| 160 | 5.37 ms | 8.39 ms | 6.67 ms | 5.2 MiB | 186 |
| 320 | 10.3 ms | 12.3 ms | 12.1 ms | 10.6 MiB | 97 |
| 640 | 19.9 ms | 20.4 ms | 21.5 ms | 21.4 MiB | 50 |
| 1280 | 40.3 ms | 57.2 ms | 42.4 ms | 43.7 MiB | 25 |
| 2560 | 82.6 ms | 111 ms | 85.4 ms | 25.9 MiB | 12 |
| 5120 | 163 ms | 168 ms | 167 ms | 54.2 MiB | 6 |
| 10240 | 332 ms | 337 ms | 343 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.25, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.30 µs | 5.43 µs | 4.42 µs | 7.4 KiB | 232,591 |
| 40 | 6.14 µs | 6.83 µs | 22.3 µs | 14.0 KiB | 162,751 |
| 80 | 11.0 µs | 13.5 µs | 33.8 µs | 27.3 KiB | 90,702 |
| 160 | 20.1 µs | 26.1 µs | 57.5 µs | 53.9 KiB | 49,827 |
| 320 | 38.9 µs | 57.0 µs | 103 µs | 107.0 KiB | 25,730 |
| 640 | 75.1 µs | 88.5 µs | 198 µs | 213.3 KiB | 13,313 |
| 1280 | 296 µs | 352 µs | 676 µs | 515.9 KiB | 3,379 |
| 2560 | 596 µs | 691 µs | 1.23 ms | 1.0 MiB | 1,678 |
| 5120 | 1.31 ms | 1.40 ms | 2.53 ms | 2.1 MiB | 765 |
| 10240 | 2.73 ms | 3.32 ms | 4.37 ms | 4.2 MiB | 367 |

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
| 20 | 1.45 ms | 1.54 ms | 2.88 ms | 1.2 MiB | 688 |
| 40 | 2.68 ms | 3.30 ms | 4.11 ms | 2.5 MiB | 373 |
| 80 | 5.06 ms | 5.75 ms | 6.71 ms | 5.0 MiB | 197 |
| 160 | 9.96 ms | 10.3 ms | 11.9 ms | 10.0 MiB | 100 |
| 320 | 19.7 ms | 20.1 ms | 21.8 ms | 20.0 MiB | 51 |
| 640 | 38.9 ms | 45.0 ms | 40.9 ms | 40.1 MiB | 26 |
| 1280 | 78.8 ms | 84.9 ms | 81.6 ms | 16.1 MiB | 13 |
| 2560 | 157 ms | 161 ms | 159 ms | 32.3 MiB | 6 |
| 5120 | 313 ms | 317 ms | 315 ms | 708.6 KiB | 3 |
| 10240 | 621 ms | 623 ms | 623 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 724 µs | 770 µs | 1.48 ms | 643.3 KiB | 1,381 |
| 40 | 1.49 ms | 1.53 ms | 2.98 ms | 1.3 MiB | 670 |
| 80 | 2.70 ms | 2.76 ms | 4.16 ms | 2.5 MiB | 371 |
| 160 | 5.18 ms | 5.45 ms | 6.89 ms | 5.2 MiB | 193 |
| 320 | 10.2 ms | 10.4 ms | 12.3 ms | 10.6 MiB | 98 |
| 640 | 20.1 ms | 20.5 ms | 22.4 ms | 21.4 MiB | 50 |
| 1280 | 40.0 ms | 40.9 ms | 42.2 ms | 43.6 MiB | 25 |
| 2560 | 81.6 ms | 82.4 ms | 84.1 ms | 25.7 MiB | 12 |
| 5120 | 163 ms | 165 ms | 166 ms | 53.9 MiB | 6 |
| 10240 | 329 ms | 377 ms | 332 ms | 46.2 MiB | 3 |

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
| 20 | 3.18 µs | 7.42 µs | 3.23 µs | 9.3 KiB | 314,713 |
| 40 | 3.88 µs | 4.27 µs | 15.1 µs | 8.4 KiB | 257,742 |
| 80 | 5.99 µs | 7.87 µs | 18.1 µs | 16.2 KiB | 166,833 |
| 160 | 10.8 µs | 11.1 µs | 29.1 µs | 31.8 KiB | 92,764 |
| 320 | 21.2 µs | 21.9 µs | 57.8 µs | 63.1 KiB | 47,205 |
| 640 | 40.8 µs | 42.8 µs | 106 µs | 127.7 KiB | 24,528 |
| 1280 | 219 µs | 265 µs | 485 µs | 349.8 KiB | 4,560 |
| 2560 | 488 µs | 801 µs | 1.05 ms | 694.2 KiB | 2,049 |
| 5120 | 1.11 ms | 1.16 ms | 2.31 ms | 1.3 MiB | 899 |
| 10240 | 2.25 ms | 2.34 ms | 3.57 ms | 2.7 MiB | 444 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.88, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.37 µs | 2.51 µs | 2.40 µs | 4.5 KiB | 421,651 |
| 40 | 2.41 µs | 2.56 µs | 9.82 µs | 4.5 KiB | 414,644 |
| 80 | 2.90 µs | 3.15 µs | 12.1 µs | 4.5 KiB | 344,357 |
| 160 | 3.24 µs | 3.43 µs | 11.2 µs | 4.5 KiB | 308,751 |
| 320 | 4.29 µs | 4.53 µs | 13.9 µs | 4.5 KiB | 233,096 |
| 640 | 6.15 µs | 6.43 µs | 17.7 µs | 4.5 KiB | 162,631 |
| 1280 | 10.7 µs | 11.3 µs | 31.6 µs | 4.5 KiB | 93,129 |
| 2560 | 18.7 µs | 24.6 µs | 51.2 µs | 4.5 KiB | 53,605 |
| 5120 | 35.0 µs | 49.6 µs | 89.7 µs | 4.5 KiB | 28,606 |
| 10240 | 71.5 µs | 101 µs | 200 µs | 4.5 KiB | 13,989 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.82 µs | 10.4 µs | 8.00 µs | 3.7 KiB | 127,953 |
| 40 | 10.1 µs | 10.9 µs | 21.3 µs | 6.3 KiB | 98,904 |
| 80 | 18.9 µs | 22.6 µs | 20.3 µs | 11.7 KiB | 52,841 |
| 160 | 27.9 µs | 31.3 µs | 99.9 µs | 22.3 KiB | 35,871 |
| 320 | 47.3 µs | 56.2 µs | 148 µs | 44.6 KiB | 21,149 |
| 640 | 82.8 µs | 96.0 µs | 219 µs | 89.7 KiB | 12,081 |
| 1280 | 153 µs | 168 µs | 371 µs | 179.5 KiB | 6,529 |
| 2560 | 306 µs | 358 µs | 704 µs | 382.2 KiB | 3,264 |
| 5120 | 717 µs | 766 µs | 1.37 ms | 683.1 KiB | 1,395 |
| 10240 | 1.40 ms | 1.49 ms | 2.68 ms | 1.3 MiB | 715 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.46 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.11 ms | 1.11 ms | 76% |
| `load-exception-registry` | 1 | 289 µs | 289 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 61.7 µs | 4.2% |

**At 10240 entrys** (whole operation: 26.0 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 19.6 ms | 19.6 ms | 75% |
| `load-exception-registry` | 1 | 4.15 ms | 4.15 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.25 ms | 8.6% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T17:18:52.486Z` → `2026-11-02T17:19:36.696Z` (44 s), ci: CI (run 41487631689)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `4cc9530bc1f97601543546cfd3595de55b74ee12` on `feat/affected-scope-engine`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

