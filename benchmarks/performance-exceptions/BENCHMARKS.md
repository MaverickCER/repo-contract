# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.31 ms** per operation compared with a bare-minimum baseline (**235% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.06). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.31 ms | 26.9 ms |
| Added latency, relative to baseline | 235% | 366% |
| Added CPU time per operation | 1.32 ms | 27.5 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 765 ops/s | 37 ops/s |

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
| 20 | 32.5 µs | 146 µs | 113 µs | 349% | 113 µs | $0.00024 – $0.0013 |
| 40 | 51.2 µs | 225 µs | 174 µs | 339% | 175 µs | $0.00036 – $0.002 |
| 80 | 91.1 µs | 385 µs | 292 µs | 320% | 1.48 ms | $0.00061 – $0.017 |
| 160 | 173 µs | 580 µs | 405 µs | 234% | 1.62 ms | $0.00084 – $0.018 |
| 320 | 337 µs | 968 µs | 627 µs | 186% | 1.48 ms | $0.0013 – $0.017 |
| 640 | 556 µs | 1.86 ms | 1.31 ms | 235% | 1.32 ms | $0.0027 – $0.015 |
| 1280 | 961 µs | 3.56 ms | 2.60 ms | 270% | 2.61 ms | $0.0054 – $0.029 |
| 2560 | 1.80 ms | 6.95 ms | 5.15 ms | 286% | 5.25 ms | $0.011 – $0.059 |
| 5120 | 3.61 ms | 16.0 ms | 12.4 ms | 344% | 12.7 ms | $0.026 – $0.143 |
| 10240 | 7.37 ms | 34.3 ms | 26.9 ms | 366% | 27.5 ms | $0.056 – $0.309 |

**How the total grows:** O(n) (linear), exponent 1.06 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 239 µs | 3.46 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 46.5 µs | 1.16 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 392 µs | 5.63 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.37 ms | 24.3 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 28.5 ms | 463 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 102 µs | 3.63 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 55.2 ms | 873 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 28.1 ms | 459 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 59.0 µs | 3.04 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 9.58 µs | 112 µs |
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

**Measured: O(n)** (exponent 0.97, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 77.1 µs | 90.8 µs | 251 µs | 117.8 KiB | 12,973 |
| 40 | 45.2 µs | 47.8 µs | 114 µs | 97.2 KiB | 22,100 |
| 80 | 56.1 µs | 58.0 µs | 157 µs | 121.7 KiB | 17,829 |
| 160 | 77.6 µs | 80.6 µs | 214 µs | 158.7 KiB | 12,894 |
| 320 | 113 µs | 116 µs | 288 µs | 237.8 KiB | 8,852 |
| 640 | 239 µs | 367 µs | 652 µs | 524.5 KiB | 4,191 |
| 1280 | 434 µs | 451 µs | 1.04 ms | 1.0 MiB | 2,302 |
| 2560 | 758 µs | 789 µs | 1.35 ms | 2.1 MiB | 1,319 |
| 5120 | 1.75 ms | 1.79 ms | 2.91 ms | 4.3 MiB | 572 |
| 10240 | 3.46 ms | 3.58 ms | 4.29 ms | 8.6 MiB | 289 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.18, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.14 µs | 8.91 µs | 30.8 µs | 17.0 KiB | 122,876 |
| 40 | 8.49 µs | 9.19 µs | 31.3 µs | 16.3 KiB | 117,751 |
| 80 | 10.5 µs | 12.0 µs | 35.1 µs | 20.5 KiB | 94,791 |
| 160 | 15.9 µs | 19.4 µs | 52.2 µs | 28.6 KiB | 63,011 |
| 320 | 23.7 µs | 24.9 µs | 70.0 µs | 48.1 KiB | 42,159 |
| 640 | 46.5 µs | 48.2 µs | 132 µs | 86.7 KiB | 21,495 |
| 1280 | 85.5 µs | 90.1 µs | 232 µs | 171.2 KiB | 11,697 |
| 2560 | 188 µs | 200 µs | 524 µs | 329.7 KiB | 5,316 |
| 5120 | 499 µs | 513 µs | 1.24 ms | 634.3 KiB | 2,006 |
| 10240 | 1.16 ms | 1.22 ms | 3.00 ms | 1.3 MiB | 859 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 18.0 µs | 20.6 µs | 74.3 µs | 7.3 KiB | 55,529 |
| 40 | 28.9 µs | 29.7 µs | 87.3 µs | 13.2 KiB | 34,620 |
| 80 | 54.8 µs | 57.0 µs | 150 µs | 25.1 KiB | 18,260 |
| 160 | 107 µs | 109 µs | 285 µs | 48.9 KiB | 9,305 |
| 320 | 209 µs | 211 µs | 519 µs | 96.5 KiB | 4,794 |
| 640 | 392 µs | 395 µs | 804 µs | 191.5 KiB | 2,554 |
| 1280 | 759 µs | 771 µs | 1.40 ms | 381.6 KiB | 1,318 |
| 2560 | 1.63 ms | 1.87 ms | 3.03 ms | 761.9 KiB | 615 |
| 5120 | 3.53 ms | 3.68 ms | 5.04 ms | 1.5 MiB | 283 |
| 10240 | 5.63 ms | 5.74 ms | 7.45 ms | 3.0 MiB | 177 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 67.2 µs | 84.2 µs | 271 µs | 44.5 KiB | 14,872 |
| 40 | 103 µs | 123 µs | 309 µs | 83.1 KiB | 9,720 |
| 80 | 187 µs | 197 µs | 495 µs | 161.5 KiB | 5,352 |
| 160 | 341 µs | 364 µs | 753 µs | 318.6 KiB | 2,935 |
| 320 | 645 µs | 694 µs | 1.27 ms | 632.2 KiB | 1,551 |
| 640 | 1.37 ms | 1.46 ms | 2.64 ms | 1.2 MiB | 728 |
| 1280 | 2.55 ms | 2.60 ms | 3.88 ms | 2.5 MiB | 393 |
| 2560 | 4.97 ms | 7.50 ms | 6.56 ms | 4.9 MiB | 201 |
| 5120 | 10.6 ms | 15.1 ms | 12.5 ms | 9.8 MiB | 95 |
| 10240 | 24.3 ms | 24.4 ms | 26.5 ms | 19.7 MiB | 41 |

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
| 20 | 1.51 ms | 1.80 ms | 3.33 ms | 652.5 KiB | 663 |
| 40 | 1.96 ms | 2.90 ms | 3.21 ms | 1.3 MiB | 511 |
| 80 | 3.73 ms | 4.62 ms | 5.00 ms | 2.6 MiB | 268 |
| 160 | 7.31 ms | 9.13 ms | 8.60 ms | 5.3 MiB | 137 |
| 320 | 14.4 ms | 15.3 ms | 15.9 ms | 10.6 MiB | 69 |
| 640 | 28.5 ms | 31.4 ms | 29.9 ms | 21.4 MiB | 35 |
| 1280 | 56.5 ms | 58.1 ms | 58.4 ms | 43.7 MiB | 18 |
| 2560 | 114 ms | 116 ms | 116 ms | 25.9 MiB | 9 |
| 5120 | 231 ms | 233 ms | 236 ms | 54.2 MiB | 4 |
| 10240 | 463 ms | 466 ms | 473 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.25, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.61 µs | 6.44 µs | 5.78 µs | 7.4 KiB | 178,131 |
| 40 | 7.82 µs | 9.86 µs | 26.4 µs | 14.0 KiB | 127,877 |
| 80 | 14.3 µs | 16.4 µs | 44.5 µs | 27.3 KiB | 70,146 |
| 160 | 26.6 µs | 31.5 µs | 77.8 µs | 53.9 KiB | 37,525 |
| 320 | 52.0 µs | 58.0 µs | 150 µs | 107.0 KiB | 19,219 |
| 640 | 102 µs | 115 µs | 284 µs | 213.3 KiB | 9,850 |
| 1280 | 384 µs | 419 µs | 801 µs | 515.9 KiB | 2,604 |
| 2560 | 786 µs | 810 µs | 1.48 ms | 1.0 MiB | 1,273 |
| 5120 | 1.72 ms | 1.85 ms | 3.04 ms | 2.1 MiB | 583 |
| 10240 | 3.63 ms | 3.73 ms | 5.44 ms | 4.2 MiB | 276 |

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
| 20 | 2.01 ms | 2.05 ms | 3.62 ms | 1.2 MiB | 498 |
| 40 | 3.73 ms | 3.76 ms | 5.35 ms | 2.5 MiB | 268 |
| 80 | 7.16 ms | 7.24 ms | 8.82 ms | 5.0 MiB | 140 |
| 160 | 14.0 ms | 14.3 ms | 15.7 ms | 10.0 MiB | 71 |
| 320 | 27.7 ms | 28.0 ms | 29.6 ms | 20.0 MiB | 36 |
| 640 | 55.2 ms | 55.6 ms | 57.2 ms | 40.1 MiB | 18 |
| 1280 | 110 ms | 111 ms | 112 ms | 16.1 MiB | 9 |
| 2560 | 219 ms | 219 ms | 221 ms | 32.3 MiB | 5 |
| 5120 | 436 ms | 437 ms | 439 ms | 707.4 KiB | 2 |
| 10240 | 873 ms | 875 ms | 876 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.14 ms | 1.16 ms | 2.75 ms | 645.6 KiB | 879 |
| 40 | 1.99 ms | 2.01 ms | 3.60 ms | 1.3 MiB | 502 |
| 80 | 3.74 ms | 3.79 ms | 5.58 ms | 2.5 MiB | 267 |
| 160 | 7.20 ms | 7.26 ms | 9.04 ms | 5.2 MiB | 139 |
| 320 | 14.2 ms | 14.5 ms | 16.2 ms | 10.6 MiB | 70 |
| 640 | 28.1 ms | 28.2 ms | 30.2 ms | 21.4 MiB | 36 |
| 1280 | 56.3 ms | 56.4 ms | 58.4 ms | 43.6 MiB | 18 |
| 2560 | 114 ms | 114 ms | 117 ms | 25.7 MiB | 9 |
| 5120 | 229 ms | 232 ms | 232 ms | 53.9 MiB | 4 |
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

**Measured: O(n log n)** (exponent 1.36, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.14 µs | 9.78 µs | 4.30 µs | 9.3 KiB | 241,429 |
| 40 | 5.23 µs | 5.83 µs | 20.0 µs | 8.4 KiB | 191,381 |
| 80 | 8.88 µs | 9.31 µs | 30.8 µs | 16.2 KiB | 112,566 |
| 160 | 15.5 µs | 16.3 µs | 47.2 µs | 31.8 KiB | 64,346 |
| 320 | 29.9 µs | 30.6 µs | 85.2 µs | 63.1 KiB | 33,485 |
| 640 | 59.0 µs | 60.8 µs | 167 µs | 127.6 KiB | 16,951 |
| 1280 | 319 µs | 331 µs | 729 µs | 352.8 KiB | 3,134 |
| 2560 | 662 µs | 686 µs | 1.35 ms | 694.2 KiB | 1,512 |
| 5120 | 1.46 ms | 1.52 ms | 2.87 ms | 1.3 MiB | 683 |
| 10240 | 3.04 ms | 3.10 ms | 4.50 ms | 2.7 MiB | 329 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.89, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.27 µs | 3.38 µs | 10.9 µs | 4.5 KiB | 305,720 |
| 40 | 3.61 µs | 3.89 µs | 3.67 µs | 4.5 KiB | 277,133 |
| 80 | 3.92 µs | 4.18 µs | 16.6 µs | 4.5 KiB | 255,043 |
| 160 | 5.09 µs | 5.37 µs | 20.1 µs | 4.5 KiB | 196,572 |
| 320 | 6.41 µs | 6.76 µs | 23.5 µs | 4.5 KiB | 155,941 |
| 640 | 9.58 µs | 10.2 µs | 31.5 µs | 4.5 KiB | 104,347 |
| 1280 | 16.2 µs | 19.9 µs | 47.9 µs | 4.5 KiB | 61,669 |
| 2560 | 29.4 µs | 30.7 µs | 83.3 µs | 4.5 KiB | 34,070 |
| 5120 | 56.2 µs | 74.0 µs | 162 µs | 4.5 KiB | 17,795 |
| 10240 | 112 µs | 114 µs | 303 µs | 4.5 KiB | 8,967 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 10.5 µs | 12.4 µs | 10.7 µs | 3.7 KiB | 95,328 |
| 40 | 13.8 µs | 15.2 µs | 14.1 µs | 6.3 KiB | 72,255 |
| 80 | 23.3 µs | 24.7 µs | 98.5 µs | 11.6 KiB | 42,914 |
| 160 | 41.6 µs | 44.4 µs | 168 µs | 22.4 KiB | 24,012 |
| 320 | 65.8 µs | 74.7 µs | 209 µs | 44.8 KiB | 15,193 |
| 640 | 120 µs | 134 µs | 338 µs | 91.0 KiB | 8,328 |
| 1280 | 238 µs | 265 µs | 672 µs | 191.5 KiB | 4,208 |
| 2560 | 466 µs | 509 µs | 1.14 ms | 360.9 KiB | 2,146 |
| 5120 | 1.01 ms | 1.15 ms | 2.41 ms | 685.3 KiB | 988 |
| 10240 | 1.82 ms | 1.91 ms | 3.37 ms | 1.3 MiB | 548 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.86 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.37 ms | 1.37 ms | 74% |
| `load-exception-registry` | 1 | 392 µs | 392 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 97.3 µs | 5.2% |

**At 10240 entrys** (whole operation: 34.3 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 24.3 ms | 24.3 ms | 71% |
| `load-exception-registry` | 1 | 5.63 ms | 5.63 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.34 ms | 13% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-14T17:35:35.403Z` → `2026-11-14T17:36:26.960Z` (52 s), ci: CI (run 43620104979)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `deaaafc18b5426f07b59528132254f2852602af3` on `dependabot/npm_and_yarn/dev-dependencies-6f64cd0fc8`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

