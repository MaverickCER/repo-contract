# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.91 ms** per operation compared with a bare-minimum baseline (**286% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.91 ms | 31.1 ms |
| Added latency, relative to baseline | 286% | 291% |
| Added CPU time per operation | 2.67 ms | 30.4 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 523 ops/s | 32 ops/s |

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
| 20 | 29.8 µs | 165 µs | 135 µs | 453% | 545 µs | $0.00028 – $0.0061 |
| 40 | 52.1 µs | 209 µs | 157 µs | 301% | 410 µs | $0.00033 – $0.0046 |
| 80 | 96.1 µs | 419 µs | 322 µs | 335% | 885 µs | $0.00067 – $0.0099 |
| 160 | 190 µs | 683 µs | 492 µs | 259% | 880 µs | $0.001 – $0.0099 |
| 320 | 349 µs | 1.35 ms | 1.00 ms | 287% | 2.02 ms | $0.0021 – $0.023 |
| 640 | 669 µs | 2.58 ms | 1.91 ms | 286% | 2.67 ms | $0.004 – $0.030 |
| 1280 | 1.38 ms | 5.02 ms | 3.64 ms | 265% | 3.67 ms | $0.0076 – $0.041 |
| 2560 | 2.59 ms | 9.89 ms | 7.30 ms | 282% | 7.34 ms | $0.015 – $0.082 |
| 5120 | 5.22 ms | 19.5 ms | 14.3 ms | 274% | 14.3 ms | $0.030 – $0.161 |
| 10240 | 10.7 ms | 41.7 ms | 31.1 ms | 291% | 30.4 ms | $0.065 – $0.342 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 333 µs | 4.18 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 59.9 µs | 1.37 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 551 µs | 7.51 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.00 ms | 30.8 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 39.9 ms | 72.1 ms (at 1280) |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n) | ✅ matches | 154 µs | 534 µs (at 1280) |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 70.2 ms | 140 ms (at 1280) |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 36.1 ms | 72.1 ms (at 1280) |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 86.4 µs | 435 µs (at 1280) |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(log n) | 🟡 close (neighbouring class) | 13.4 µs | 22.2 µs (at 1280) |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 183 µs | 2.54 ms |

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

**In the end-to-end run:** Once per run, between reading and writing the registry.

**Measured: O(n)** (exponent 0.93, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 109 µs | 174 µs | 363 µs | 115.4 KiB | 9,192 |
| 40 | 66.3 µs | 68.6 µs | 202 µs | 98.1 KiB | 15,078 |
| 80 | 80.6 µs | 83.0 µs | 249 µs | 120.8 KiB | 12,407 |
| 160 | 104 µs | 108 µs | 320 µs | 159.3 KiB | 9,614 |
| 320 | 151 µs | 156 µs | 458 µs | 237.4 KiB | 6,611 |
| 640 | 333 µs | 450 µs | 1.10 ms | 530.7 KiB | 3,003 |
| 1280 | 525 µs | 565 µs | 1.28 ms | 1.0 MiB | 1,904 |
| 2560 | 1.06 ms | 1.09 ms | 2.60 ms | 2.1 MiB | 944 |
| 5120 | 2.08 ms | 2.13 ms | 3.45 ms | 4.3 MiB | 480 |
| 10240 | 4.18 ms | 4.26 ms | 5.34 ms | 8.6 MiB | 239 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.8 µs | 12.3 µs | 45.7 µs | 17.0 KiB | 84,925 |
| 40 | 11.7 µs | 12.3 µs | 44.6 µs | 16.3 KiB | 85,319 |
| 80 | 15.1 µs | 15.7 µs | 56.6 µs | 20.5 KiB | 66,311 |
| 160 | 22.0 µs | 25.8 µs | 79.5 µs | 28.6 KiB | 45,450 |
| 320 | 33.5 µs | 34.5 µs | 111 µs | 48.2 KiB | 29,869 |
| 640 | 59.9 µs | 62.5 µs | 185 µs | 86.8 KiB | 16,700 |
| 1280 | 116 µs | 120 µs | 337 µs | 166.1 KiB | 8,655 |
| 2560 | 239 µs | 248 µs | 643 µs | 329.7 KiB | 4,184 |
| 5120 | 603 µs | 628 µs | 1.51 ms | 634.3 KiB | 1,659 |
| 10240 | 1.37 ms | 1.44 ms | 3.52 ms | 1.3 MiB | 731 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 24.0 µs | 26.1 µs | 95.4 µs | 7.3 KiB | 41,681 |
| 40 | 39.6 µs | 40.3 µs | 122 µs | 13.2 KiB | 25,275 |
| 80 | 80.9 µs | 83.6 µs | 268 µs | 25.1 KiB | 12,357 |
| 160 | 145 µs | 149 µs | 395 µs | 48.9 KiB | 6,892 |
| 320 | 292 µs | 295 µs | 783 µs | 96.5 KiB | 3,427 |
| 640 | 551 µs | 562 µs | 1.30 ms | 191.6 KiB | 1,813 |
| 1280 | 1.10 ms | 1.13 ms | 2.65 ms | 381.9 KiB | 906 |
| 2560 | 2.04 ms | 2.40 ms | 3.73 ms | 761.9 KiB | 490 |
| 5120 | 4.50 ms | 4.65 ms | 6.37 ms | 1.5 MiB | 222 |
| 10240 | 7.51 ms | 8.49 ms | 9.74 ms | 3.0 MiB | 133 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 98.6 µs | 110 µs | 399 µs | 44.0 KiB | 10,138 |
| 40 | 160 µs | 188 µs | 535 µs | 83.6 KiB | 6,236 |
| 80 | 282 µs | 309 µs | 785 µs | 161.9 KiB | 3,552 |
| 160 | 521 µs | 557 µs | 1.27 ms | 319.5 KiB | 1,919 |
| 320 | 1.05 ms | 1.10 ms | 2.54 ms | 634.8 KiB | 954 |
| 640 | 2.00 ms | 2.16 ms | 3.58 ms | 1.2 MiB | 499 |
| 1280 | 3.75 ms | 3.89 ms | 5.33 ms | 2.5 MiB | 267 |
| 2560 | 7.26 ms | 7.48 ms | 9.05 ms | 4.9 MiB | 138 |
| 5120 | 14.1 ms | 14.4 ms | 16.2 ms | 9.8 MiB | 71 |
| 10240 | 30.8 ms | 31.4 ms | 33.7 ms | 19.7 MiB | 32 |

### `resolveExceptionPolicy`

**Why we benchmark it.** It decides, for each exception record, which policy applies, and runs once per classification of every record.

**What poor performance would mean.** Slower judgement of every record in proportion to how many rules a policy has.

**Expected growth: O(n).** It scans the group's rules for an exact match and then for glob matches, so cost is proportional to the number of rules.

**Measured on a shorter ladder (20, 40, 80, 160, 320, 640, 1280).** Every call builds a regular expression for each rule it tests, so sizes beyond a few thousand rules take minutes per sample; no real policy has that many.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| rules | swept | The tier axis: rules in the group. |
| category | variant | An exact rule, a category matched by a glob, or every category at once. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

#### Variant `glob-match`

The category matches one glob rule.

**Measured: O(n)** (exponent 0.99, 7 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.01 ms | 2.56 ms | 4.28 ms | 652.8 KiB | 499 |
| 40 | 2.51 ms | 3.83 ms | 4.07 ms | 1.3 MiB | 399 |
| 80 | 4.76 ms | 6.41 ms | 6.33 ms | 2.6 MiB | 210 |
| 160 | 9.30 ms | 12.3 ms | 10.9 ms | 5.3 MiB | 108 |
| 320 | 20.9 ms | 27.8 ms | 24.1 ms | 10.6 MiB | 48 |
| 640 | 39.9 ms | 40.4 ms | 45.0 ms | 21.5 MiB | 25 |
| 1280 | 72.1 ms | 74.1 ms | 74.5 ms | 43.7 MiB | 14 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n)** (exponent 1.06, 7 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.30 µs | 10.2 µs | 8.57 µs | 7.4 KiB | 120,414 |
| 40 | 12.0 µs | 14.8 µs | 44.4 µs | 14.0 KiB | 83,435 |
| 80 | 26.1 µs | 27.4 µs | 106 µs | 27.3 KiB | 38,353 |
| 160 | 42.2 µs | 54.9 µs | 140 µs | 53.9 KiB | 23,679 |
| 320 | 77.1 µs | 94.6 µs | 231 µs | 107.0 KiB | 12,968 |
| 640 | 154 µs | 189 µs | 463 µs | 213.3 KiB | 6,499 |
| 1280 | 534 µs | 604 µs | 1.33 ms | 516.0 KiB | 1,872 |

### `evaluateExceptionRecord`

**Why we benchmark it.** It decides whether one record is permitted, and runs for every record of a registry.

**What poor performance would mean.** Slower judgement of a whole registry, multiplied by the number of classifications each record carries and the rules each policy has.

**Expected growth: O(n).** Each classification is resolved once, so cost is proportional to the number of classifications.

**Measured on a shorter ladder (20, 40, 80, 160, 320, 640, 1280).** Every call builds a regular expression for each rule it tests, so sizes beyond a few thousand rules take minutes per sample; no real policy has that many.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| classifications | swept | The tier axis: classifications the record is judged under. |
| rules | swept | How many rules the policy group has. |
| requirements | fixed at 4 | How many fields the policy's matching rule requires. Each costs one field read and one trim, which is too small next to resolving the rules to measure a growth rate of its own. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n)** (exponent 0.98, 7 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.62 ms | 2.76 ms | 4.63 ms | 1.2 MiB | 381 |
| 40 | 4.76 ms | 4.86 ms | 6.75 ms | 2.5 MiB | 210 |
| 80 | 9.16 ms | 9.19 ms | 11.3 ms | 5.0 MiB | 109 |
| 160 | 18.0 ms | 21.9 ms | 20.3 ms | 10.0 MiB | 56 |
| 320 | 35.3 ms | 35.5 ms | 37.7 ms | 20.0 MiB | 28 |
| 640 | 70.2 ms | 70.3 ms | 72.6 ms | 40.1 MiB | 14 |
| 1280 | 140 ms | 145 ms | 143 ms | 16.1 MiB | 7 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 0.98, 7 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.51 ms | 1.56 ms | 3.51 ms | 645.0 KiB | 660 |
| 40 | 2.61 ms | 2.67 ms | 4.65 ms | 1.3 MiB | 383 |
| 80 | 4.81 ms | 4.94 ms | 6.93 ms | 2.6 MiB | 208 |
| 160 | 9.24 ms | 9.35 ms | 11.4 ms | 5.2 MiB | 108 |
| 320 | 18.2 ms | 18.3 ms | 20.5 ms | 10.6 MiB | 55 |
| 640 | 36.1 ms | 36.3 ms | 38.6 ms | 21.4 MiB | 28 |
| 1280 | 72.1 ms | 72.2 ms | 74.5 ms | 43.7 MiB | 14 |

### `validateExceptionPolicyConfig`

**Why we benchmark it.** A check validates its policy config before it judges a single record, once per run.

**What poor performance would mean.** Slower starts for every check in proportion to how large its policy is.

**Expected growth: O(n).** Each rule is validated once, and each required field is looked up in the list of valid ones.

**Measured on a shorter ladder (20, 40, 80, 160, 320, 640, 1280).** Every call builds a regular expression for each rule it tests, so sizes beyond a few thousand rules take minutes per sample; no real policy has that many.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| rules | swept | The tier axis: rules in the config. |
| valid-requirements | swept | How many requirement names are valid. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n log n)** (exponent 1.19, 7 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.48 µs | 16.8 µs | 6.79 µs | 9.4 KiB | 154,319 |
| 40 | 8.48 µs | 9.68 µs | 35.9 µs | 8.4 KiB | 117,983 |
| 80 | 13.4 µs | 13.8 µs | 50.1 µs | 16.2 KiB | 74,715 |
| 160 | 23.8 µs | 24.8 µs | 81.5 µs | 31.8 KiB | 41,940 |
| 320 | 45.6 µs | 46.9 µs | 149 µs | 63.1 KiB | 21,936 |
| 640 | 86.4 µs | 88.3 µs | 268 µs | 127.7 KiB | 11,568 |
| 1280 | 435 µs | 449 µs | 1.24 ms | 340.8 KiB | 2,296 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(log n)** (exponent 0.47, 7 sizes) -- 🟡 close (neighbouring class).

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.58 µs | 5.00 µs | 4.65 µs | 4.5 KiB | 218,436 |
| 40 | 4.97 µs | 5.23 µs | 9.51 µs | 4.5 KiB | 201,137 |
| 80 | 5.77 µs | 6.19 µs | 7.65 µs | 4.5 KiB | 173,319 |
| 160 | 7.49 µs | 7.69 µs | 14.1 µs | 4.5 KiB | 133,507 |
| 320 | 10.3 µs | 10.7 µs | 44.6 µs | 4.5 KiB | 96,651 |
| 640 | 13.4 µs | 13.9 µs | 48.7 µs | 4.5 KiB | 74,549 |
| 1280 | 22.2 µs | 23.1 µs | 76.0 µs | 4.5 KiB | 44,990 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 17.6 µs | 21.8 µs | 18.0 µs | 3.8 KiB | 56,823 |
| 40 | 23.1 µs | 25.7 µs | 23.7 µs | 6.4 KiB | 43,346 |
| 80 | 39.2 µs | 43.2 µs | 41.8 µs | 11.8 KiB | 25,517 |
| 160 | 58.2 µs | 63.8 µs | 231 µs | 22.4 KiB | 17,188 |
| 320 | 93.2 µs | 109 µs | 312 µs | 45.3 KiB | 10,735 |
| 640 | 183 µs | 204 µs | 578 µs | 93.6 KiB | 5,472 |
| 1280 | 321 µs | 372 µs | 868 µs | 191.5 KiB | 3,114 |
| 2560 | 619 µs | 676 µs | 1.47 ms | 360.0 KiB | 1,616 |
| 5120 | 1.41 ms | 1.53 ms | 3.10 ms | 685.3 KiB | 708 |
| 10240 | 2.54 ms | 2.64 ms | 4.48 ms | 1.3 MiB | 393 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.58 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.00 ms | 2.00 ms | 78% |
| `load-exception-registry` | 1 | 551 µs | 551 µs | 21% |
| `reconcile-exceptions` | 1 | 333 µs | 333 µs | 13% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 10240 entrys** (whole operation: 41.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 30.8 ms | 30.8 ms | 74% |
| `load-exception-registry` | 1 | 7.51 ms | 7.51 ms | 18% |
| `reconcile-exceptions` | 1 | 4.18 ms | 4.18 ms | 10% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-19T10:09:41.987Z` → `2026-10-19T10:10:15.820Z` (34 s), ci: CI (run 39232587082)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `078b9ebbd4f7c0f0ce7d1476a46b524580f0f5e8` on `feat/adopt-ipc-v0.12.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

