# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.35 ms** per operation compared with a bare-minimum baseline (**263% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.35 ms | 23.4 ms |
| Added latency, relative to baseline | 263% | 287% |
| Added CPU time per operation | 2.00 ms | 22.9 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 740 ops/s | 43 ops/s |

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
| 20 | 19.2 µs | 94.6 µs | 75.4 µs | 393% | 277 µs | $0.00016 – $0.0031 |
| 40 | 35.3 µs | 142 µs | 107 µs | 303% | 275 µs | $0.00022 – $0.0031 |
| 80 | 68.6 µs | 262 µs | 194 µs | 282% | 466 µs | $0.0004 – $0.0052 |
| 160 | 133 µs | 486 µs | 354 µs | 267% | 736 µs | $0.00074 – $0.0083 |
| 320 | 269 µs | 882 µs | 613 µs | 228% | 823 µs | $0.0013 – $0.0093 |
| 640 | 513 µs | 1.86 ms | 1.35 ms | 263% | 2.00 ms | $0.0028 – $0.022 |
| 1280 | 1.03 ms | 3.60 ms | 2.57 ms | 250% | 2.62 ms | $0.0053 – $0.029 |
| 2560 | 1.96 ms | 7.24 ms | 5.28 ms | 269% | 5.36 ms | $0.011 – $0.060 |
| 5120 | 3.98 ms | 15.0 ms | 11.0 ms | 277% | 11.3 ms | $0.023 – $0.127 |
| 10240 | 8.14 ms | 31.5 ms | 23.4 ms | 287% | 22.9 ms | $0.049 – $0.257 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 288 µs | 3.50 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 44.8 µs | 1.13 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 419 µs | 5.79 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.45 ms | 23.6 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 28.9 ms | 467 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 106 µs | 3.52 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 55.2 ms | 887 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 28.1 ms | 460 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 60.4 µs | 2.87 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 9.47 µs | 110 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 120 µs | 1.82 ms |

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
| 20 | 77.9 µs | 96.6 µs | 257 µs | 117.8 KiB | 12,843 |
| 40 | 48.2 µs | 51.3 µs | 143 µs | 97.7 KiB | 20,753 |
| 80 | 55.7 µs | 57.0 µs | 158 µs | 121.7 KiB | 17,954 |
| 160 | 74.6 µs | 76.3 µs | 212 µs | 158.7 KiB | 13,397 |
| 320 | 112 µs | 116 µs | 317 µs | 237.1 KiB | 8,919 |
| 640 | 288 µs | 485 µs | 910 µs | 656.2 KiB | 3,471 |
| 1280 | 423 µs | 433 µs | 1.06 ms | 1.0 MiB | 2,362 |
| 2560 | 744 µs | 765 µs | 1.34 ms | 2.1 MiB | 1,343 |
| 5120 | 1.72 ms | 1.83 ms | 2.94 ms | 4.3 MiB | 583 |
| 10240 | 3.50 ms | 3.56 ms | 4.72 ms | 8.6 MiB | 286 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.62 µs | 7.86 µs | 26.9 µs | 17.0 KiB | 131,278 |
| 40 | 8.35 µs | 8.63 µs | 30.9 µs | 16.3 KiB | 119,718 |
| 80 | 10.8 µs | 12.1 µs | 38.2 µs | 20.5 KiB | 92,432 |
| 160 | 15.3 µs | 15.7 µs | 52.5 µs | 28.6 KiB | 65,444 |
| 320 | 24.5 µs | 25.4 µs | 74.0 µs | 48.1 KiB | 40,835 |
| 640 | 44.8 µs | 46.1 µs | 134 µs | 86.7 KiB | 22,319 |
| 1280 | 85.4 µs | 88.3 µs | 247 µs | 171.2 KiB | 11,713 |
| 2560 | 177 µs | 183 µs | 454 µs | 343.9 KiB | 5,645 |
| 5120 | 504 µs | 516 µs | 1.28 ms | 634.3 KiB | 1,986 |
| 10240 | 1.13 ms | 1.20 ms | 2.97 ms | 1.3 MiB | 888 |

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
| 20 | 18.3 µs | 19.6 µs | 59.2 µs | 7.3 KiB | 54,767 |
| 40 | 28.4 µs | 29.0 µs | 80.7 µs | 13.2 KiB | 35,210 |
| 80 | 54.3 µs | 55.2 µs | 145 µs | 25.1 KiB | 18,401 |
| 160 | 105 µs | 107 µs | 262 µs | 48.9 KiB | 9,488 |
| 320 | 210 µs | 215 µs | 524 µs | 96.5 KiB | 4,762 |
| 640 | 419 µs | 425 µs | 1.05 ms | 191.6 KiB | 2,388 |
| 1280 | 772 µs | 781 µs | 1.43 ms | 381.6 KiB | 1,296 |
| 2560 | 1.57 ms | 2.00 ms | 3.03 ms | 761.9 KiB | 635 |
| 5120 | 3.58 ms | 3.71 ms | 5.21 ms | 1.5 MiB | 279 |
| 10240 | 5.79 ms | 5.87 ms | 7.73 ms | 3.0 MiB | 173 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 59.8 µs | 67.6 µs | 215 µs | 44.1 KiB | 16,710 |
| 40 | 99.1 µs | 115 µs | 278 µs | 83.0 KiB | 10,093 |
| 80 | 190 µs | 212 µs | 504 µs | 161.5 KiB | 5,274 |
| 160 | 379 µs | 409 µs | 1.01 ms | 319.5 KiB | 2,639 |
| 320 | 664 µs | 739 µs | 1.30 ms | 632.2 KiB | 1,505 |
| 640 | 1.45 ms | 1.78 ms | 2.78 ms | 1.2 MiB | 688 |
| 1280 | 2.70 ms | 2.80 ms | 4.07 ms | 2.5 MiB | 371 |
| 2560 | 5.29 ms | 5.46 ms | 6.82 ms | 4.9 MiB | 189 |
| 5120 | 10.7 ms | 10.8 ms | 12.6 ms | 9.8 MiB | 94 |
| 10240 | 23.6 ms | 24.2 ms | 26.1 ms | 19.7 MiB | 42 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.55 ms | 2.70 ms | 3.53 ms | 652.5 KiB | 646 |
| 40 | 1.97 ms | 2.81 ms | 3.26 ms | 1.3 MiB | 508 |
| 80 | 3.75 ms | 4.59 ms | 5.05 ms | 2.6 MiB | 267 |
| 160 | 7.36 ms | 9.75 ms | 8.89 ms | 5.3 MiB | 136 |
| 320 | 14.6 ms | 17.5 ms | 16.6 ms | 10.6 MiB | 68 |
| 640 | 28.9 ms | 31.5 ms | 30.6 ms | 21.4 MiB | 35 |
| 1280 | 57.6 ms | 59.3 ms | 59.8 ms | 43.7 MiB | 17 |
| 2560 | 116 ms | 118 ms | 118 ms | 25.9 MiB | 9 |
| 5120 | 233 ms | 236 ms | 236 ms | 54.2 MiB | 4 |
| 10240 | 467 ms | 470 ms | 478 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.21, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.46 µs | 6.55 µs | 5.58 µs | 7.4 KiB | 183,112 |
| 40 | 7.70 µs | 9.22 µs | 24.8 µs | 14.0 KiB | 129,894 |
| 80 | 14.6 µs | 17.1 µs | 46.5 µs | 27.3 KiB | 68,475 |
| 160 | 27.7 µs | 33.9 µs | 81.2 µs | 53.9 KiB | 36,078 |
| 320 | 54.9 µs | 70.7 µs | 161 µs | 107.0 KiB | 18,219 |
| 640 | 106 µs | 119 µs | 292 µs | 213.3 KiB | 9,454 |
| 1280 | 415 µs | 457 µs | 1.08 ms | 516.0 KiB | 2,408 |
| 2560 | 772 µs | 814 µs | 1.43 ms | 1.0 MiB | 1,295 |
| 5120 | 1.68 ms | 1.81 ms | 3.06 ms | 2.1 MiB | 597 |
| 10240 | 3.52 ms | 3.81 ms | 5.56 ms | 4.2 MiB | 284 |

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
| 20 | 2.03 ms | 2.07 ms | 3.67 ms | 1.2 MiB | 492 |
| 40 | 3.73 ms | 3.78 ms | 5.42 ms | 2.5 MiB | 268 |
| 80 | 7.20 ms | 9.06 ms | 8.97 ms | 5.0 MiB | 139 |
| 160 | 14.0 ms | 15.3 ms | 15.9 ms | 10.0 MiB | 71 |
| 320 | 27.8 ms | 28.1 ms | 29.9 ms | 20.0 MiB | 36 |
| 640 | 55.2 ms | 61.8 ms | 57.4 ms | 40.1 MiB | 18 |
| 1280 | 111 ms | 116 ms | 113 ms | 16.1 MiB | 9 |
| 2560 | 220 ms | 221 ms | 222 ms | 32.3 MiB | 5 |
| 5120 | 443 ms | 443 ms | 446 ms | 707.4 KiB | 2 |
| 10240 | 887 ms | 888 ms | 889 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.16 ms | 1.19 ms | 2.79 ms | 645.6 KiB | 862 |
| 40 | 2.02 ms | 2.04 ms | 3.68 ms | 1.3 MiB | 494 |
| 80 | 3.73 ms | 3.80 ms | 5.45 ms | 2.5 MiB | 268 |
| 160 | 7.19 ms | 7.23 ms | 8.87 ms | 5.2 MiB | 139 |
| 320 | 14.2 ms | 14.4 ms | 16.1 ms | 10.6 MiB | 70 |
| 640 | 28.1 ms | 28.2 ms | 30.2 ms | 21.4 MiB | 36 |
| 1280 | 56.6 ms | 57.3 ms | 58.7 ms | 43.6 MiB | 18 |
| 2560 | 114 ms | 115 ms | 117 ms | 25.7 MiB | 9 |
| 5120 | 230 ms | 230 ms | 233 ms | 53.9 MiB | 4 |
| 10240 | 460 ms | 461 ms | 465 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.34, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.25 µs | 10.0 µs | 4.37 µs | 9.3 KiB | 235,178 |
| 40 | 5.31 µs | 6.83 µs | 21.0 µs | 8.4 KiB | 188,178 |
| 80 | 8.49 µs | 8.76 µs | 27.8 µs | 16.2 KiB | 117,720 |
| 160 | 15.8 µs | 16.5 µs | 48.1 µs | 31.8 KiB | 63,327 |
| 320 | 30.1 µs | 30.9 µs | 85.6 µs | 63.1 KiB | 33,256 |
| 640 | 60.4 µs | 62.0 µs | 176 µs | 127.8 KiB | 16,551 |
| 1280 | 287 µs | 422 µs | 620 µs | 349.8 KiB | 3,483 |
| 2560 | 626 µs | 637 µs | 1.30 ms | 694.2 KiB | 1,597 |
| 5120 | 1.39 ms | 1.46 ms | 2.81 ms | 1.3 MiB | 721 |
| 10240 | 2.87 ms | 2.92 ms | 4.45 ms | 2.7 MiB | 349 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.89, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.14 µs | 3.29 µs | 6.77 µs | 4.5 KiB | 318,639 |
| 40 | 3.32 µs | 4.79 µs | 13.6 µs | 4.5 KiB | 301,616 |
| 80 | 3.74 µs | 4.85 µs | 14.6 µs | 4.5 KiB | 267,149 |
| 160 | 4.77 µs | 5.37 µs | 17.8 µs | 4.5 KiB | 209,524 |
| 320 | 6.24 µs | 7.36 µs | 21.7 µs | 4.5 KiB | 160,333 |
| 640 | 9.47 µs | 9.81 µs | 30.4 µs | 4.5 KiB | 105,582 |
| 1280 | 16.1 µs | 16.5 µs | 47.2 µs | 4.5 KiB | 62,107 |
| 2560 | 29.4 µs | 30.4 µs | 84.0 µs | 4.5 KiB | 33,962 |
| 5120 | 55.7 µs | 57.2 µs | 153 µs | 4.5 KiB | 17,950 |
| 10240 | 110 µs | 115 µs | 305 µs | 4.5 KiB | 9,067 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 9.36 µs | 10.9 µs | 9.55 µs | 3.6 KiB | 106,890 |
| 40 | 13.8 µs | 15.7 µs | 14.0 µs | 6.3 KiB | 72,338 |
| 80 | 23.6 µs | 25.1 µs | 97.9 µs | 11.6 KiB | 42,423 |
| 160 | 38.0 µs | 43.0 µs | 137 µs | 22.3 KiB | 26,348 |
| 320 | 65.9 µs | 73.0 µs | 208 µs | 44.8 KiB | 15,171 |
| 640 | 120 µs | 130 µs | 337 µs | 91.0 KiB | 8,351 |
| 1280 | 221 µs | 247 µs | 561 µs | 186.4 KiB | 4,522 |
| 2560 | 460 µs | 512 µs | 1.17 ms | 360.9 KiB | 2,172 |
| 5120 | 1.02 ms | 1.16 ms | 2.45 ms | 685.3 KiB | 976 |
| 10240 | 1.82 ms | 2.01 ms | 3.27 ms | 1.3 MiB | 550 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.86 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.45 ms | 1.45 ms | 78% |
| `load-exception-registry` | 1 | 419 µs | 419 µs | 22% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 10240 entrys** (whole operation: 31.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 23.6 ms | 23.6 ms | 75% |
| `load-exception-registry` | 1 | 5.79 ms | 5.79 ms | 18% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.16 ms | 6.8% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-26T09:45:20.070Z` → `2026-10-26T09:46:13.735Z` (54 s), ci: CI (run 40300171082)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `01e446d8ae3f1d815cf4deb1ba15902ebdb1a598` on `dependabot/npm_and_yarn/dev-dependencies-6c9b387527`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

