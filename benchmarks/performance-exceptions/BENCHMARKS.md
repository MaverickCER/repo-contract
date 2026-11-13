# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.79 ms** per operation compared with a bare-minimum baseline (**244% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.06). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.79 ms | 37.5 ms |
| Added latency, relative to baseline | 244% | 400% |
| Added CPU time per operation | 1.80 ms | 38.0 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 558 ops/s | 27 ops/s |

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
| 20 | 42.8 µs | 196 µs | 154 µs | 359% | 154 µs | $0.00032 – $0.0017 |
| 40 | 70.7 µs | 310 µs | 239 µs | 339% | 241 µs | $0.0005 – $0.0027 |
| 80 | 123 µs | 518 µs | 397 µs | 323% | 1.81 ms | $0.00083 – $0.020 |
| 160 | 233 µs | 801 µs | 555 µs | 238% | 1.99 ms | $0.0012 – $0.022 |
| 320 | 453 µs | 1.34 ms | 888 µs | 196% | 927 µs | $0.0019 – $0.010 |
| 640 | 735 µs | 2.53 ms | 1.79 ms | 244% | 1.80 ms | $0.0037 – $0.020 |
| 1280 | 1.24 ms | 4.82 ms | 3.59 ms | 289% | 3.61 ms | $0.0075 – $0.041 |
| 2560 | 2.30 ms | 9.54 ms | 7.24 ms | 315% | 7.26 ms | $0.015 – $0.082 |
| 5120 | 4.70 ms | 21.6 ms | 16.9 ms | 360% | 17.2 ms | $0.035 – $0.194 |
| 10240 | 9.40 ms | 46.8 ms | 37.5 ms | 400% | 38.0 ms | $0.078 – $0.427 |

**How the total grows:** O(n) (linear), exponent 1.06 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 349 µs | 4.48 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 57.7 µs | 1.40 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 541 µs | 7.31 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.90 ms | 32.0 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 38.9 ms | 577 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 165 µs | 4.77 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 68.7 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.4 ms | 569 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 85.8 µs | 3.81 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.3 µs | 143 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 161 µs | 2.29 ms |

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

**Measured: O(n)** (exponent 0.94, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 116 µs | 145 µs | 414 µs | 115.6 KiB | 8,614 |
| 40 | 76.2 µs | 124 µs | 287 µs | 99.2 KiB | 13,128 |
| 80 | 78.7 µs | 81.8 µs | 244 µs | 120.8 KiB | 12,701 |
| 160 | 106 µs | 109 µs | 318 µs | 159.3 KiB | 9,450 |
| 320 | 158 µs | 164 µs | 452 µs | 237.4 KiB | 6,346 |
| 640 | 349 µs | 455 µs | 1.09 ms | 530.7 KiB | 2,869 |
| 1280 | 557 µs | 572 µs | 1.30 ms | 1.0 MiB | 1,797 |
| 2560 | 1.12 ms | 1.16 ms | 2.61 ms | 2.1 MiB | 894 |
| 5120 | 2.24 ms | 2.29 ms | 3.72 ms | 4.3 MiB | 446 |
| 10240 | 4.48 ms | 4.73 ms | 5.51 ms | 8.6 MiB | 223 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.3 µs | 12.1 µs | 43.0 µs | 17.0 KiB | 88,772 |
| 40 | 13.4 µs | 14.2 µs | 29.1 µs | 16.3 KiB | 74,872 |
| 80 | 14.8 µs | 15.6 µs | 55.5 µs | 20.5 KiB | 67,681 |
| 160 | 21.1 µs | 22.5 µs | 76.1 µs | 28.6 KiB | 47,301 |
| 320 | 32.9 µs | 38.5 µs | 109 µs | 48.2 KiB | 30,411 |
| 640 | 57.7 µs | 59.6 µs | 178 µs | 86.8 KiB | 17,329 |
| 1280 | 133 µs | 138 µs | 383 µs | 168.3 KiB | 7,505 |
| 2560 | 241 µs | 248 µs | 640 µs | 329.7 KiB | 4,145 |
| 5120 | 606 µs | 628 µs | 1.49 ms | 634.3 KiB | 1,649 |
| 10240 | 1.40 ms | 1.46 ms | 3.52 ms | 1.3 MiB | 716 |

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
| 20 | 24.0 µs | 25.6 µs | 94.0 µs | 7.3 KiB | 41,733 |
| 40 | 43.2 µs | 44.7 µs | 155 µs | 13.2 KiB | 23,162 |
| 80 | 75.8 µs | 83.1 µs | 222 µs | 25.1 KiB | 13,187 |
| 160 | 144 µs | 146 µs | 390 µs | 48.9 KiB | 6,937 |
| 320 | 287 µs | 291 µs | 773 µs | 96.5 KiB | 3,490 |
| 640 | 541 µs | 560 µs | 1.27 ms | 191.6 KiB | 1,848 |
| 1280 | 1.08 ms | 1.18 ms | 2.60 ms | 381.9 KiB | 923 |
| 2560 | 1.99 ms | 2.36 ms | 3.64 ms | 761.9 KiB | 503 |
| 5120 | 4.47 ms | 4.60 ms | 6.29 ms | 1.5 MiB | 224 |
| 10240 | 7.31 ms | 8.75 ms | 9.47 ms | 3.0 MiB | 137 |

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
| 20 | 85.6 µs | 97.1 µs | 295 µs | 44.3 KiB | 11,681 |
| 40 | 147 µs | 162 µs | 439 µs | 83.3 KiB | 6,826 |
| 80 | 272 µs | 287 µs | 767 µs | 161.9 KiB | 3,677 |
| 160 | 510 µs | 547 µs | 1.24 ms | 319.5 KiB | 1,961 |
| 320 | 1.01 ms | 1.06 ms | 2.48 ms | 634.8 KiB | 988 |
| 640 | 1.90 ms | 1.98 ms | 3.43 ms | 1.2 MiB | 528 |
| 1280 | 3.52 ms | 3.63 ms | 5.08 ms | 2.5 MiB | 284 |
| 2560 | 6.82 ms | 6.94 ms | 8.53 ms | 4.9 MiB | 147 |
| 5120 | 13.9 ms | 14.3 ms | 15.9 ms | 9.8 MiB | 72 |
| 10240 | 32.0 ms | 38.8 ms | 34.5 ms | 19.7 MiB | 31 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.95 ms | 2.44 ms | 4.18 ms | 653.2 KiB | 512 |
| 40 | 2.45 ms | 3.51 ms | 3.95 ms | 1.3 MiB | 409 |
| 80 | 4.64 ms | 6.43 ms | 6.13 ms | 2.6 MiB | 215 |
| 160 | 9.10 ms | 11.4 ms | 10.6 ms | 5.3 MiB | 110 |
| 320 | 17.7 ms | 21.4 ms | 19.5 ms | 10.6 MiB | 56 |
| 640 | 38.9 ms | 39.6 ms | 43.8 ms | 21.5 MiB | 26 |
| 1280 | 70.2 ms | 74.6 ms | 72.5 ms | 43.7 MiB | 14 |
| 2560 | 141 ms | 146 ms | 144 ms | 25.9 MiB | 7 |
| 5120 | 290 ms | 296 ms | 300 ms | 54.2 MiB | 3 |
| 10240 | 577 ms | 578 ms | 589 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.90 µs | 9.18 µs | 8.30 µs | 7.4 KiB | 126,631 |
| 40 | 11.7 µs | 12.5 µs | 42.7 µs | 14.0 KiB | 85,400 |
| 80 | 22.3 µs | 27.9 µs | 78.4 µs | 27.3 KiB | 44,888 |
| 160 | 39.7 µs | 47.7 µs | 123 µs | 53.9 KiB | 25,204 |
| 320 | 76.7 µs | 89.2 µs | 227 µs | 107.0 KiB | 13,044 |
| 640 | 165 µs | 187 µs | 463 µs | 213.3 KiB | 6,072 |
| 1280 | 611 µs | 721 µs | 1.39 ms | 516.0 KiB | 1,635 |
| 2560 | 1.22 ms | 1.51 ms | 2.81 ms | 1.0 MiB | 820 |
| 5120 | 2.35 ms | 3.27 ms | 3.98 ms | 2.1 MiB | 425 |
| 10240 | 4.77 ms | 6.70 ms | 6.93 ms | 4.2 MiB | 210 |

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
| 20 | 2.56 ms | 2.70 ms | 4.59 ms | 1.2 MiB | 391 |
| 40 | 4.69 ms | 4.86 ms | 6.64 ms | 2.5 MiB | 213 |
| 80 | 8.95 ms | 9.11 ms | 11.0 ms | 5.0 MiB | 112 |
| 160 | 17.5 ms | 17.7 ms | 19.6 ms | 10.0 MiB | 57 |
| 320 | 34.7 ms | 35.3 ms | 36.9 ms | 20.0 MiB | 29 |
| 640 | 68.7 ms | 71.8 ms | 71.2 ms | 40.1 MiB | 15 |
| 1280 | 138 ms | 142 ms | 141 ms | 16.1 MiB | 7 |
| 2560 | 273 ms | 277 ms | 275 ms | 32.3 MiB | 4 |
| 5120 | 548 ms | 549 ms | 550 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.09 s | 1.09 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.45 ms | 1.50 ms | 3.35 ms | 645.7 KiB | 690 |
| 40 | 2.54 ms | 2.58 ms | 4.45 ms | 1.3 MiB | 394 |
| 80 | 4.69 ms | 4.75 ms | 6.65 ms | 2.5 MiB | 213 |
| 160 | 9.01 ms | 9.16 ms | 11.0 ms | 5.2 MiB | 111 |
| 320 | 17.8 ms | 17.9 ms | 19.9 ms | 10.6 MiB | 56 |
| 640 | 35.4 ms | 38.4 ms | 37.8 ms | 21.4 MiB | 28 |
| 1280 | 70.6 ms | 70.6 ms | 73.1 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 144 ms | 145 ms | 25.7 MiB | 7 |
| 5120 | 285 ms | 286 ms | 288 ms | 53.9 MiB | 4 |
| 10240 | 569 ms | 571 ms | 573 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.30, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.88 µs | 16.0 µs | 6.05 µs | 9.3 KiB | 170,077 |
| 40 | 7.85 µs | 9.53 µs | 31.3 µs | 8.4 KiB | 127,340 |
| 80 | 12.5 µs | 13.0 µs | 43.7 µs | 16.2 KiB | 79,693 |
| 160 | 22.8 µs | 23.8 µs | 74.8 µs | 31.8 KiB | 43,911 |
| 320 | 43.5 µs | 44.3 µs | 133 µs | 63.1 KiB | 22,987 |
| 640 | 85.8 µs | 91.9 µs | 258 µs | 127.7 KiB | 11,661 |
| 1280 | 463 µs | 485 µs | 1.24 ms | 340.8 KiB | 2,162 |
| 2560 | 858 µs | 868 µs | 1.67 ms | 694.2 KiB | 1,166 |
| 5120 | 1.86 ms | 1.90 ms | 3.52 ms | 1.3 MiB | 537 |
| 10240 | 3.81 ms | 3.94 ms | 5.68 ms | 2.7 MiB | 262 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.86, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.47 µs | 4.67 µs | 9.60 µs | 4.5 KiB | 223,899 |
| 40 | 4.77 µs | 5.02 µs | 17.5 µs | 4.5 KiB | 209,449 |
| 80 | 5.64 µs | 5.94 µs | 12.3 µs | 4.5 KiB | 177,313 |
| 160 | 6.55 µs | 6.87 µs | 26.6 µs | 4.5 KiB | 152,741 |
| 320 | 9.00 µs | 9.97 µs | 35.0 µs | 4.5 KiB | 111,118 |
| 640 | 13.3 µs | 13.9 µs | 48.0 µs | 4.5 KiB | 75,378 |
| 1280 | 22.4 µs | 24.7 µs | 74.1 µs | 4.5 KiB | 44,647 |
| 2560 | 38.9 µs | 40.8 µs | 124 µs | 4.5 KiB | 25,698 |
| 5120 | 75.1 µs | 76.7 µs | 235 µs | 4.5 KiB | 13,323 |
| 10240 | 143 µs | 149 µs | 419 µs | 4.5 KiB | 7,001 |

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
| 20 | 14.3 µs | 16.9 µs | 14.6 µs | 3.7 KiB | 69,736 |
| 40 | 19.4 µs | 22.4 µs | 19.7 µs | 6.3 KiB | 51,519 |
| 80 | 33.6 µs | 38.0 µs | 34.5 µs | 11.7 KiB | 29,743 |
| 160 | 53.7 µs | 57.4 µs | 204 µs | 22.4 KiB | 18,638 |
| 320 | 88.4 µs | 108 µs | 281 µs | 45.0 KiB | 11,315 |
| 640 | 161 µs | 194 µs | 471 µs | 92.1 KiB | 6,195 |
| 1280 | 306 µs | 344 µs | 819 µs | 191.5 KiB | 3,271 |
| 2560 | 533 µs | 573 µs | 1.09 ms | 382.2 KiB | 1,877 |
| 5120 | 1.30 ms | 1.40 ms | 2.89 ms | 685.3 KiB | 769 |
| 10240 | 2.29 ms | 2.39 ms | 4.03 ms | 1.3 MiB | 436 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.53 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.90 ms | 1.90 ms | 75% |
| `load-exception-registry` | 1 | 541 µs | 541 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 91.5 µs | 3.6% |

**At 10240 entrys** (whole operation: 46.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.0 ms | 32.0 ms | 68% |
| `load-exception-registry` | 1 | 7.31 ms | 7.31 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 7.54 ms | 16% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-13T07:01:53.993Z` → `2026-11-13T07:02:55.294Z` (61 s), ci: CI (run 43379180763)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `b218ab4f7826516cb741170f087bebfb3a00c876` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

