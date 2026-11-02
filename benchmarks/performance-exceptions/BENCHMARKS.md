# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **2.03 ms** per operation compared with a bare-minimum baseline (**303% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.01 – $0.1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 2.03 ms | 34.0 ms |
| Added latency, relative to baseline | 303% | 325% |
| Added CPU time per operation | 2.88 ms | 33.4 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 – $0.1 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 493 ops/s | 29 ops/s |

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
| 20 | 29.7 µs | 157 µs | 127 µs | 427% | 504 µs | $0.00026 – $0.0057 |
| 40 | 53.4 µs | 213 µs | 159 µs | 298% | 397 µs | $0.00033 – $0.0045 |
| 80 | 96.4 µs | 376 µs | 279 µs | 290% | 593 µs | $0.00058 – $0.0067 |
| 160 | 190 µs | 673 µs | 482 µs | 253% | 877 µs | $0.001 – $0.0099 |
| 320 | 347 µs | 1.35 ms | 1.01 ms | 290% | 2.03 ms | $0.0021 – $0.023 |
| 640 | 669 µs | 2.70 ms | 2.03 ms | 303% | 2.88 ms | $0.0042 – $0.032 |
| 1280 | 1.35 ms | 5.09 ms | 3.74 ms | 278% | 3.94 ms | $0.0078 – $0.044 |
| 2560 | 2.58 ms | 10.0 ms | 7.42 ms | 288% | 7.61 ms | $0.015 – $0.086 |
| 5120 | 5.17 ms | 19.8 ms | 14.7 ms | 284% | 14.8 ms | $0.031 – $0.167 |
| 10240 | 10.4 ms | 44.4 ms | 34.0 ms | 325% | 33.4 ms | $0.071 – $0.376 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 343 µs | 4.31 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.8 µs | 1.40 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 553 µs | 7.47 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.06 ms | 33.7 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 37.0 ms | 577 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 157 µs | 4.59 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 70.7 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.3 ms | 571 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 87.6 µs | 3.63 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.1 µs | 151 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 169 µs | 2.41 ms |

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

**Measured: O(n)** (exponent 0.93, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 114 µs | 145 µs | 411 µs | 115.6 KiB | 8,804 |
| 40 | 78.7 µs | 124 µs | 296 µs | 99.2 KiB | 12,703 |
| 80 | 82.7 µs | 85.7 µs | 269 µs | 118.5 KiB | 12,098 |
| 160 | 104 µs | 109 µs | 313 µs | 159.3 KiB | 9,651 |
| 320 | 153 µs | 161 µs | 450 µs | 237.4 KiB | 6,537 |
| 640 | 343 µs | 549 µs | 1.09 ms | 530.7 KiB | 2,917 |
| 1280 | 533 µs | 543 µs | 1.25 ms | 1.0 MiB | 1,877 |
| 2560 | 1.06 ms | 1.09 ms | 2.50 ms | 2.1 MiB | 943 |
| 5120 | 2.18 ms | 2.25 ms | 3.70 ms | 4.3 MiB | 458 |
| 10240 | 4.31 ms | 4.47 ms | 5.44 ms | 8.6 MiB | 232 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.3 µs | 12.0 µs | 44.5 µs | 17.0 KiB | 88,314 |
| 40 | 11.6 µs | 12.2 µs | 46.2 µs | 16.3 KiB | 86,283 |
| 80 | 14.7 µs | 16.5 µs | 55.3 µs | 20.5 KiB | 67,813 |
| 160 | 21.4 µs | 22.5 µs | 78.2 µs | 28.6 KiB | 46,814 |
| 320 | 35.4 µs | 37.6 µs | 128 µs | 48.4 KiB | 28,247 |
| 640 | 58.8 µs | 61.6 µs | 183 µs | 86.8 KiB | 17,013 |
| 1280 | 122 µs | 129 µs | 379 µs | 168.3 KiB | 8,205 |
| 2560 | 234 µs | 242 µs | 644 µs | 329.7 KiB | 4,274 |
| 5120 | 614 µs | 637 µs | 1.52 ms | 634.3 KiB | 1,630 |
| 10240 | 1.40 ms | 1.43 ms | 3.57 ms | 1.3 MiB | 716 |

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
| 20 | 24.3 µs | 25.8 µs | 96.0 µs | 7.3 KiB | 41,133 |
| 40 | 40.7 µs | 41.7 µs | 128 µs | 13.2 KiB | 24,591 |
| 80 | 77.1 µs | 79.4 µs | 227 µs | 25.1 KiB | 12,968 |
| 160 | 147 µs | 150 µs | 393 µs | 48.9 KiB | 6,806 |
| 320 | 290 µs | 298 µs | 794 µs | 96.5 KiB | 3,444 |
| 640 | 553 µs | 565 µs | 1.30 ms | 191.6 KiB | 1,808 |
| 1280 | 1.10 ms | 1.14 ms | 2.66 ms | 381.9 KiB | 906 |
| 2560 | 2.03 ms | 2.53 ms | 3.77 ms | 761.9 KiB | 492 |
| 5120 | 4.60 ms | 4.84 ms | 6.47 ms | 1.5 MiB | 218 |
| 10240 | 7.47 ms | 8.34 ms | 9.73 ms | 3.0 MiB | 134 |

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
| 20 | 92.6 µs | 107 µs | 339 µs | 44.5 KiB | 10,795 |
| 40 | 162 µs | 175 µs | 534 µs | 83.6 KiB | 6,167 |
| 80 | 287 µs | 329 µs | 787 µs | 161.9 KiB | 3,479 |
| 160 | 539 µs | 577 µs | 1.29 ms | 319.5 KiB | 1,856 |
| 320 | 1.08 ms | 1.17 ms | 2.57 ms | 634.7 KiB | 924 |
| 640 | 2.06 ms | 2.12 ms | 3.56 ms | 1.2 MiB | 486 |
| 1280 | 3.93 ms | 4.08 ms | 5.60 ms | 2.5 MiB | 254 |
| 2560 | 7.64 ms | 7.85 ms | 9.50 ms | 4.9 MiB | 131 |
| 5120 | 14.8 ms | 15.1 ms | 17.0 ms | 9.8 MiB | 68 |
| 10240 | 33.7 ms | 34.2 ms | 36.6 ms | 19.7 MiB | 30 |

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
| 20 | 2.01 ms | 2.31 ms | 4.45 ms | 652.5 KiB | 498 |
| 40 | 2.49 ms | 3.76 ms | 4.05 ms | 1.3 MiB | 401 |
| 80 | 4.69 ms | 5.56 ms | 6.25 ms | 2.6 MiB | 213 |
| 160 | 9.17 ms | 11.4 ms | 10.8 ms | 5.3 MiB | 109 |
| 320 | 18.0 ms | 19.7 ms | 21.0 ms | 10.6 MiB | 56 |
| 640 | 37.0 ms | 38.0 ms | 41.9 ms | 21.5 MiB | 27 |
| 1280 | 70.6 ms | 71.2 ms | 73.5 ms | 43.7 MiB | 14 |
| 2560 | 142 ms | 145 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 288 ms | 291 ms | 299 ms | 54.2 MiB | 3 |
| 10240 | 577 ms | 585 ms | 590 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.35 µs | 10.1 µs | 8.53 µs | 7.4 KiB | 119,789 |
| 40 | 11.8 µs | 14.6 µs | 41.9 µs | 14.0 KiB | 84,783 |
| 80 | 21.8 µs | 26.5 µs | 72.6 µs | 27.3 KiB | 45,938 |
| 160 | 40.5 µs | 46.6 µs | 124 µs | 53.9 KiB | 24,717 |
| 320 | 78.0 µs | 90.4 µs | 229 µs | 107.0 KiB | 12,828 |
| 640 | 157 µs | 190 µs | 457 µs | 213.3 KiB | 6,385 |
| 1280 | 533 µs | 607 µs | 1.31 ms | 516.0 KiB | 1,875 |
| 2560 | 990 µs | 1.01 ms | 1.82 ms | 1.0 MiB | 1,010 |
| 5120 | 2.15 ms | 2.35 ms | 3.75 ms | 2.1 MiB | 465 |
| 10240 | 4.59 ms | 4.78 ms | 7.39 ms | 3.8 MiB | 218 |

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
| 20 | 2.58 ms | 2.67 ms | 4.57 ms | 1.2 MiB | 388 |
| 40 | 4.73 ms | 4.85 ms | 6.72 ms | 2.5 MiB | 212 |
| 80 | 8.95 ms | 9.08 ms | 10.9 ms | 5.0 MiB | 112 |
| 160 | 17.6 ms | 18.1 ms | 19.9 ms | 10.0 MiB | 57 |
| 320 | 34.9 ms | 35.0 ms | 37.3 ms | 20.0 MiB | 29 |
| 640 | 70.7 ms | 72.1 ms | 72.9 ms | 40.1 MiB | 14 |
| 1280 | 138 ms | 140 ms | 141 ms | 16.1 MiB | 7 |
| 2560 | 275 ms | 275 ms | 277 ms | 32.3 MiB | 4 |
| 5120 | 548 ms | 550 ms | 551 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.10 s | 1.10 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.46 ms | 1.52 ms | 3.42 ms | 645.6 KiB | 683 |
| 40 | 2.56 ms | 2.64 ms | 4.64 ms | 1.3 MiB | 390 |
| 80 | 4.72 ms | 4.80 ms | 6.78 ms | 2.5 MiB | 212 |
| 160 | 9.00 ms | 9.18 ms | 11.2 ms | 5.2 MiB | 111 |
| 320 | 17.7 ms | 18.1 ms | 19.9 ms | 10.6 MiB | 57 |
| 640 | 35.3 ms | 35.9 ms | 37.8 ms | 21.4 MiB | 28 |
| 1280 | 70.5 ms | 70.6 ms | 72.9 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 143 ms | 145 ms | 25.7 MiB | 7 |
| 5120 | 285 ms | 286 ms | 289 ms | 53.9 MiB | 4 |
| 10240 | 571 ms | 578 ms | 576 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.28, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.07 µs | 14.5 µs | 6.26 µs | 9.3 KiB | 164,793 |
| 40 | 7.73 µs | 9.76 µs | 31.5 µs | 8.4 KiB | 129,447 |
| 80 | 12.8 µs | 13.7 µs | 45.3 µs | 16.2 KiB | 78,025 |
| 160 | 24.0 µs | 24.5 µs | 75.9 µs | 31.8 KiB | 41,675 |
| 320 | 50.1 µs | 51.7 µs | 175 µs | 63.1 KiB | 19,960 |
| 640 | 87.6 µs | 90.1 µs | 255 µs | 127.7 KiB | 11,414 |
| 1280 | 442 µs | 467 µs | 1.23 ms | 340.8 KiB | 2,261 |
| 2560 | 801 µs | 824 µs | 1.61 ms | 694.2 KiB | 1,248 |
| 5120 | 1.78 ms | 1.90 ms | 3.45 ms | 1.3 MiB | 563 |
| 10240 | 3.63 ms | 3.72 ms | 5.50 ms | 2.7 MiB | 275 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.89, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.55 µs | 4.87 µs | 9.93 µs | 4.5 KiB | 219,980 |
| 40 | 4.88 µs | 5.25 µs | 17.0 µs | 4.5 KiB | 204,878 |
| 80 | 5.69 µs | 5.98 µs | 18.1 µs | 4.5 KiB | 175,892 |
| 160 | 6.33 µs | 6.76 µs | 24.6 µs | 4.5 KiB | 158,047 |
| 320 | 8.78 µs | 9.31 µs | 32.8 µs | 4.5 KiB | 113,932 |
| 640 | 13.1 µs | 13.7 µs | 45.2 µs | 4.5 KiB | 76,355 |
| 1280 | 21.7 µs | 22.7 µs | 70.8 µs | 4.5 KiB | 46,105 |
| 2560 | 38.7 µs | 41.7 µs | 123 µs | 4.5 KiB | 25,871 |
| 5120 | 75.7 µs | 77.6 µs | 232 µs | 4.5 KiB | 13,214 |
| 10240 | 151 µs | 159 µs | 474 µs | 4.5 KiB | 6,603 |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.4 µs | 17.5 µs | 14.9 µs | 3.7 KiB | 69,400 |
| 40 | 20.0 µs | 24.4 µs | 21.0 µs | 6.3 KiB | 49,956 |
| 80 | 33.0 µs | 36.6 µs | 130 µs | 11.7 KiB | 30,295 |
| 160 | 57.9 µs | 63.2 µs | 225 µs | 22.4 KiB | 17,279 |
| 320 | 102 µs | 116 µs | 354 µs | 45.6 KiB | 9,844 |
| 640 | 169 µs | 187 µs | 476 µs | 92.1 KiB | 5,930 |
| 1280 | 321 µs | 351 µs | 841 µs | 191.5 KiB | 3,116 |
| 2560 | 588 µs | 642 µs | 1.41 ms | 360.0 KiB | 1,701 |
| 5120 | 1.36 ms | 1.49 ms | 2.99 ms | 685.3 KiB | 733 |
| 10240 | 2.41 ms | 2.49 ms | 4.17 ms | 1.3 MiB | 415 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.70 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.06 ms | 2.06 ms | 76% |
| `load-exception-registry` | 1 | 553 µs | 553 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 87.1 µs | 3.2% |

**At 10240 entrys** (whole operation: 44.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 33.7 ms | 33.7 ms | 76% |
| `load-exception-registry` | 1 | 7.47 ms | 7.47 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.23 ms | 7.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T16:23:30.556Z` → `2026-11-02T16:24:34.824Z` (64 s), ci: CI (run 41477789201)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `8e74e7c46270cc96a141dbe3b0c75b8f10d8c3d4` on `feat/affected-scope-engine`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

