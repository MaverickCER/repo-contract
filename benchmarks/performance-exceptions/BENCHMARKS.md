# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.39 ms** per operation compared with a bare-minimum baseline (**271% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.39 ms | 26.1 ms |
| Added latency, relative to baseline | 271% | 305% |
| Added CPU time per operation | 2.05 ms | 26.0 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 719 ops/s | 38 ops/s |

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
| 20 | 21.4 µs | 94.9 µs | 73.5 µs | 344% | 252 µs | $0.00015 – $0.0028 |
| 40 | 36.6 µs | 143 µs | 107 µs | 291% | 273 µs | $0.00022 – $0.0031 |
| 80 | 69.7 µs | 266 µs | 197 µs | 282% | 466 µs | $0.00041 – $0.0052 |
| 160 | 134 µs | 491 µs | 356 µs | 266% | 747 µs | $0.00074 – $0.0084 |
| 320 | 268 µs | 890 µs | 622 µs | 233% | 850 µs | $0.0013 – $0.0096 |
| 640 | 513 µs | 1.90 ms | 1.39 ms | 271% | 2.05 ms | $0.0029 – $0.023 |
| 1280 | 1.04 ms | 3.71 ms | 2.67 ms | 257% | 2.81 ms | $0.0056 – $0.032 |
| 2560 | 1.98 ms | 7.43 ms | 5.44 ms | 274% | 5.65 ms | $0.011 – $0.064 |
| 5120 | 4.06 ms | 15.1 ms | 11.0 ms | 271% | 11.4 ms | $0.023 – $0.128 |
| 10240 | 8.56 ms | 34.7 ms | 26.1 ms | 305% | 26.0 ms | $0.054 – $0.293 |

**How the total grows:** O(n) (linear), exponent 1.04 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 300 µs | 3.56 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 46.8 µs | 1.18 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 423 µs | 5.83 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.42 ms | 24.8 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 28.3 ms | 463 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 103 µs | 3.68 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 55.3 ms | 877 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 28.0 ms | 459 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.8 µs | 3.08 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 9.47 µs | 113 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 126 µs | 1.79 ms |

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
| 20 | 85.1 µs | 131 µs | 291 µs | 115.4 KiB | 11,750 |
| 40 | 62.2 µs | 84.9 µs | 239 µs | 99.2 KiB | 16,090 |
| 80 | 60.2 µs | 62.6 µs | 171 µs | 122.1 KiB | 16,612 |
| 160 | 80.2 µs | 82.8 µs | 217 µs | 158.7 KiB | 12,463 |
| 320 | 114 µs | 120 µs | 290 µs | 237.8 KiB | 8,738 |
| 640 | 300 µs | 399 µs | 892 µs | 656.2 KiB | 3,328 |
| 1280 | 442 µs | 455 µs | 1.06 ms | 1.0 MiB | 2,263 |
| 2560 | 778 µs | 802 µs | 1.35 ms | 2.1 MiB | 1,285 |
| 5120 | 1.85 ms | 1.97 ms | 3.04 ms | 4.3 MiB | 542 |
| 10240 | 3.56 ms | 3.83 ms | 4.09 ms | 8.6 MiB | 281 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.32 µs | 8.94 µs | 33.5 µs | 17.0 KiB | 120,218 |
| 40 | 8.44 µs | 9.29 µs | 31.4 µs | 16.3 KiB | 118,425 |
| 80 | 10.6 µs | 12.1 µs | 36.5 µs | 20.5 KiB | 94,082 |
| 160 | 17.4 µs | 18.5 µs | 68.4 µs | 28.6 KiB | 57,359 |
| 320 | 27.6 µs | 28.6 µs | 95.9 µs | 48.3 KiB | 36,250 |
| 640 | 46.8 µs | 49.0 µs | 150 µs | 86.8 KiB | 21,388 |
| 1280 | 88.7 µs | 92.2 µs | 251 µs | 171.2 KiB | 11,279 |
| 2560 | 196 µs | 204 µs | 554 µs | 329.7 KiB | 5,098 |
| 5120 | 523 µs | 543 µs | 1.28 ms | 634.3 KiB | 1,910 |
| 10240 | 1.18 ms | 1.23 ms | 3.05 ms | 1.3 MiB | 849 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 17.8 µs | 19.2 µs | 72.3 µs | 7.3 KiB | 56,087 |
| 40 | 29.1 µs | 31.0 µs | 85.7 µs | 13.2 KiB | 34,331 |
| 80 | 55.5 µs | 56.6 µs | 150 µs | 25.1 KiB | 18,025 |
| 160 | 109 µs | 112 µs | 286 µs | 48.9 KiB | 9,140 |
| 320 | 212 µs | 215 µs | 527 µs | 96.5 KiB | 4,722 |
| 640 | 423 µs | 459 µs | 1.05 ms | 191.6 KiB | 2,364 |
| 1280 | 776 µs | 786 µs | 1.43 ms | 381.6 KiB | 1,289 |
| 2560 | 1.57 ms | 1.93 ms | 3.05 ms | 761.9 KiB | 635 |
| 5120 | 3.68 ms | 3.85 ms | 5.41 ms | 1.5 MiB | 272 |
| 10240 | 5.83 ms | 5.94 ms | 7.97 ms | 3.0 MiB | 171 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 61.0 µs | 84.7 µs | 224 µs | 44.1 KiB | 16,407 |
| 40 | 100 µs | 108 µs | 290 µs | 83.0 KiB | 9,967 |
| 80 | 192 µs | 210 µs | 515 µs | 161.5 KiB | 5,218 |
| 160 | 383 µs | 497 µs | 1.03 ms | 319.5 KiB | 2,614 |
| 320 | 664 µs | 699 µs | 1.30 ms | 632.2 KiB | 1,506 |
| 640 | 1.42 ms | 1.53 ms | 2.70 ms | 1.2 MiB | 704 |
| 1280 | 2.75 ms | 2.91 ms | 4.21 ms | 2.5 MiB | 364 |
| 2560 | 5.35 ms | 5.51 ms | 6.96 ms | 4.9 MiB | 187 |
| 5120 | 10.8 ms | 11.0 ms | 12.7 ms | 9.8 MiB | 93 |
| 10240 | 24.8 ms | 25.3 ms | 27.2 ms | 19.7 MiB | 40 |

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
| 20 | 1.58 ms | 2.14 ms | 3.50 ms | 652.5 KiB | 631 |
| 40 | 1.98 ms | 2.70 ms | 3.23 ms | 1.3 MiB | 506 |
| 80 | 3.76 ms | 4.60 ms | 5.07 ms | 2.6 MiB | 266 |
| 160 | 7.42 ms | 8.90 ms | 8.83 ms | 5.3 MiB | 135 |
| 320 | 14.5 ms | 15.5 ms | 16.3 ms | 10.6 MiB | 69 |
| 640 | 28.3 ms | 30.5 ms | 30.0 ms | 21.4 MiB | 35 |
| 1280 | 56.5 ms | 58.6 ms | 58.8 ms | 43.7 MiB | 18 |
| 2560 | 114 ms | 116 ms | 119 ms | 25.9 MiB | 9 |
| 5120 | 229 ms | 233 ms | 232 ms | 54.2 MiB | 4 |
| 10240 | 463 ms | 469 ms | 473 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.25, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.30 µs | 6.84 µs | 5.44 µs | 7.4 KiB | 188,649 |
| 40 | 7.87 µs | 9.62 µs | 26.9 µs | 14.0 KiB | 126,999 |
| 80 | 14.7 µs | 17.4 µs | 46.4 µs | 27.3 KiB | 67,826 |
| 160 | 26.7 µs | 30.8 µs | 77.4 µs | 53.9 KiB | 37,469 |
| 320 | 48.7 µs | 55.6 µs | 119 µs | 107.2 KiB | 20,531 |
| 640 | 103 µs | 110 µs | 287 µs | 213.3 KiB | 9,730 |
| 1280 | 384 µs | 403 µs | 805 µs | 515.9 KiB | 2,607 |
| 2560 | 785 µs | 816 µs | 1.46 ms | 1.0 MiB | 1,274 |
| 5120 | 1.72 ms | 1.85 ms | 3.06 ms | 2.1 MiB | 581 |
| 10240 | 3.68 ms | 3.94 ms | 5.51 ms | 4.2 MiB | 272 |

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
| 20 | 2.01 ms | 2.12 ms | 3.62 ms | 1.2 MiB | 497 |
| 40 | 3.72 ms | 3.77 ms | 5.36 ms | 2.5 MiB | 269 |
| 80 | 7.15 ms | 7.61 ms | 8.81 ms | 5.0 MiB | 140 |
| 160 | 14.1 ms | 14.2 ms | 16.1 ms | 10.0 MiB | 71 |
| 320 | 27.9 ms | 29.6 ms | 30.0 ms | 20.0 MiB | 36 |
| 640 | 55.3 ms | 61.4 ms | 57.5 ms | 40.1 MiB | 18 |
| 1280 | 111 ms | 118 ms | 114 ms | 16.1 MiB | 9 |
| 2560 | 218 ms | 224 ms | 221 ms | 32.3 MiB | 5 |
| 5120 | 438 ms | 441 ms | 440 ms | 707.4 KiB | 2 |
| 10240 | 877 ms | 884 ms | 879 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.14 ms | 1.24 ms | 2.73 ms | 645.6 KiB | 876 |
| 40 | 2.00 ms | 2.06 ms | 3.61 ms | 1.3 MiB | 500 |
| 80 | 3.71 ms | 3.76 ms | 5.35 ms | 2.5 MiB | 270 |
| 160 | 7.23 ms | 7.38 ms | 9.22 ms | 5.2 MiB | 138 |
| 320 | 14.2 ms | 14.4 ms | 16.5 ms | 10.6 MiB | 70 |
| 640 | 28.0 ms | 28.5 ms | 30.2 ms | 21.4 MiB | 36 |
| 1280 | 56.4 ms | 60.9 ms | 58.6 ms | 43.6 MiB | 18 |
| 2560 | 114 ms | 114 ms | 116 ms | 25.7 MiB | 9 |
| 5120 | 229 ms | 229 ms | 232 ms | 53.9 MiB | 4 |
| 10240 | 459 ms | 463 ms | 463 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.36, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.24 µs | 7.98 µs | 4.37 µs | 9.3 KiB | 235,875 |
| 40 | 5.07 µs | 6.54 µs | 19.1 µs | 8.4 KiB | 197,246 |
| 80 | 8.48 µs | 8.81 µs | 27.5 µs | 16.2 KiB | 117,870 |
| 160 | 15.7 µs | 16.2 µs | 46.9 µs | 31.8 KiB | 63,859 |
| 320 | 29.5 µs | 30.7 µs | 84.3 µs | 63.1 KiB | 33,843 |
| 640 | 58.8 µs | 79.6 µs | 164 µs | 127.6 KiB | 17,015 |
| 1280 | 321 µs | 330 µs | 729 µs | 352.8 KiB | 3,112 |
| 2560 | 667 µs | 689 µs | 1.35 ms | 694.2 KiB | 1,500 |
| 5120 | 1.49 ms | 1.56 ms | 2.91 ms | 1.3 MiB | 669 |
| 10240 | 3.08 ms | 3.18 ms | 4.66 ms | 2.7 MiB | 325 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.89, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.20 µs | 3.36 µs | 10.0 µs | 4.5 KiB | 312,022 |
| 40 | 3.28 µs | 3.50 µs | 13.5 µs | 4.5 KiB | 305,186 |
| 80 | 3.63 µs | 3.81 µs | 14.3 µs | 4.5 KiB | 275,487 |
| 160 | 4.53 µs | 4.98 µs | 17.9 µs | 4.5 KiB | 220,807 |
| 320 | 7.46 µs | 8.02 µs | 7.55 µs | 4.5 KiB | 134,018 |
| 640 | 9.47 µs | 10.1 µs | 31.0 µs | 4.5 KiB | 105,544 |
| 1280 | 16.2 µs | 17.0 µs | 48.2 µs | 4.5 KiB | 61,641 |
| 2560 | 29.4 µs | 30.7 µs | 83.4 µs | 4.5 KiB | 34,055 |
| 5120 | 55.6 µs | 57.8 µs | 153 µs | 4.5 KiB | 17,972 |
| 10240 | 113 µs | 147 µs | 313 µs | 4.5 KiB | 8,859 |

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
| 20 | 9.51 µs | 11.7 µs | 9.68 µs | 3.6 KiB | 105,198 |
| 40 | 13.6 µs | 15.6 µs | 13.8 µs | 6.3 KiB | 73,625 |
| 80 | 23.2 µs | 24.6 µs | 96.5 µs | 11.6 KiB | 43,127 |
| 160 | 36.4 µs | 41.2 µs | 126 µs | 22.3 KiB | 27,458 |
| 320 | 63.3 µs | 70.7 µs | 192 µs | 44.7 KiB | 15,797 |
| 640 | 126 µs | 145 µs | 383 µs | 92.1 KiB | 7,911 |
| 1280 | 219 µs | 239 µs | 555 µs | 186.4 KiB | 4,565 |
| 2560 | 458 µs | 509 µs | 1.12 ms | 360.8 KiB | 2,183 |
| 5120 | 853 µs | 905 µs | 1.57 ms | 643.1 KiB | 1,173 |
| 10240 | 1.79 ms | 1.94 ms | 3.23 ms | 1.3 MiB | 558 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.90 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.42 ms | 1.42 ms | 75% |
| `load-exception-registry` | 1 | 423 µs | 423 µs | 22% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 61.4 µs | 3.2% |

**At 10240 entrys** (whole operation: 34.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 24.8 ms | 24.8 ms | 72% |
| `load-exception-registry` | 1 | 5.83 ms | 5.83 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.04 ms | 12% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-11T07:17:32.704Z` → `2026-11-11T07:18:26.284Z` (54 s), ci: CI (run 42975026328)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `f971baef5bef1f677014cd827bc0fadcb6498399` on `chore/bump-internal-package-contract-v0.17.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

