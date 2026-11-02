# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.99 ms** per operation compared with a bare-minimum baseline (**302% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.99 ms | 34.3 ms |
| Added latency, relative to baseline | 302% | 329% |
| Added CPU time per operation | 2.75 ms | 34.0 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 502 ops/s | 29 ops/s |

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
| 20 | 29.1 µs | 153 µs | 124 µs | 427% | 512 µs | $0.00026 – $0.0058 |
| 40 | 50.7 µs | 230 µs | 180 µs | 354% | 549 µs | $0.00037 – $0.0062 |
| 80 | 94.4 µs | 373 µs | 279 µs | 296% | 586 µs | $0.00058 – $0.0066 |
| 160 | 189 µs | 682 µs | 493 µs | 262% | 852 µs | $0.001 – $0.0096 |
| 320 | 343 µs | 1.36 ms | 1.02 ms | 295% | 1.98 ms | $0.0021 – $0.022 |
| 640 | 659 µs | 2.65 ms | 1.99 ms | 302% | 2.75 ms | $0.0042 – $0.031 |
| 1280 | 1.33 ms | 5.12 ms | 3.79 ms | 286% | 3.89 ms | $0.0079 – $0.044 |
| 2560 | 2.55 ms | 10.0 ms | 7.49 ms | 294% | 7.44 ms | $0.016 – $0.084 |
| 5120 | 5.10 ms | 20.0 ms | 14.9 ms | 292% | 15.1 ms | $0.031 – $0.170 |
| 10240 | 10.4 ms | 44.7 ms | 34.3 ms | 329% | 34.0 ms | $0.071 – $0.382 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 504 µs | 4.26 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 57.0 µs | 1.40 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 541 µs | 7.25 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.03 ms | 33.0 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 39.1 ms | 579 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 152 µs | 4.39 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 68.9 ms | 1.10 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.4 ms | 572 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 86.1 µs | 3.64 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.0 µs | 150 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 180 µs | 2.41 ms |

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

**Measured: O(n)** (exponent 0.82, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 106 µs | 152 µs | 359 µs | 115.4 KiB | 9,435 |
| 40 | 75.2 µs | 90.2 µs | 286 µs | 99.2 KiB | 13,294 |
| 80 | 78.7 µs | 82.1 µs | 246 µs | 120.8 KiB | 12,712 |
| 160 | 104 µs | 108 µs | 314 µs | 159.3 KiB | 9,659 |
| 320 | 150 µs | 158 µs | 445 µs | 237.4 KiB | 6,648 |
| 640 | 504 µs | 929 µs | 1.96 ms | 670.1 KiB | 1,984 |
| 1280 | 530 µs | 548 µs | 1.27 ms | 1.0 MiB | 1,886 |
| 2560 | 1.07 ms | 1.17 ms | 2.60 ms | 2.1 MiB | 932 |
| 5120 | 2.18 ms | 2.29 ms | 3.68 ms | 4.3 MiB | 459 |
| 10240 | 4.26 ms | 4.36 ms | 5.64 ms | 8.6 MiB | 235 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.0 µs | 11.5 µs | 41.4 µs | 17.0 KiB | 91,132 |
| 40 | 12.2 µs | 13.1 µs | 49.3 µs | 16.3 KiB | 81,891 |
| 80 | 14.8 µs | 15.9 µs | 55.7 µs | 20.5 KiB | 67,424 |
| 160 | 20.3 µs | 21.4 µs | 70.3 µs | 28.6 KiB | 49,362 |
| 320 | 32.3 µs | 34.3 µs | 105 µs | 48.2 KiB | 30,977 |
| 640 | 57.0 µs | 61.1 µs | 176 µs | 86.8 KiB | 17,556 |
| 1280 | 127 µs | 133 µs | 378 µs | 168.3 KiB | 7,845 |
| 2560 | 232 µs | 240 µs | 633 µs | 329.7 KiB | 4,302 |
| 5120 | 615 µs | 638 µs | 1.50 ms | 634.3 KiB | 1,627 |
| 10240 | 1.40 ms | 1.47 ms | 3.50 ms | 1.3 MiB | 717 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.6 µs | 25.3 µs | 95.5 µs | 7.3 KiB | 42,325 |
| 40 | 41.5 µs | 42.8 µs | 144 µs | 13.2 KiB | 24,086 |
| 80 | 75.7 µs | 78.5 µs | 222 µs | 25.1 KiB | 13,208 |
| 160 | 151 µs | 155 µs | 444 µs | 48.9 KiB | 6,639 |
| 320 | 286 µs | 292 µs | 774 µs | 96.5 KiB | 3,501 |
| 640 | 541 µs | 554 µs | 1.28 ms | 191.6 KiB | 1,849 |
| 1280 | 1.08 ms | 1.11 ms | 2.60 ms | 381.9 KiB | 924 |
| 2560 | 1.99 ms | 2.37 ms | 3.66 ms | 761.9 KiB | 501 |
| 5120 | 4.50 ms | 4.76 ms | 6.36 ms | 1.5 MiB | 222 |
| 10240 | 7.25 ms | 8.25 ms | 9.42 ms | 3.0 MiB | 138 |

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
| 20 | 90.4 µs | 124 µs | 335 µs | 44.5 KiB | 11,062 |
| 40 | 151 µs | 174 µs | 444 µs | 83.3 KiB | 6,614 |
| 80 | 283 µs | 319 µs | 768 µs | 161.9 KiB | 3,529 |
| 160 | 533 µs | 557 µs | 1.26 ms | 319.5 KiB | 1,875 |
| 320 | 1.06 ms | 1.16 ms | 2.53 ms | 634.7 KiB | 943 |
| 640 | 2.03 ms | 2.14 ms | 3.50 ms | 1.2 MiB | 493 |
| 1280 | 3.80 ms | 3.99 ms | 5.36 ms | 2.5 MiB | 263 |
| 2560 | 7.50 ms | 8.90 ms | 9.31 ms | 4.9 MiB | 133 |
| 5120 | 14.7 ms | 14.9 ms | 16.9 ms | 9.8 MiB | 68 |
| 10240 | 33.0 ms | 34.7 ms | 35.7 ms | 19.7 MiB | 30 |

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
| 20 | 1.94 ms | 2.36 ms | 4.16 ms | 652.8 KiB | 515 |
| 40 | 2.48 ms | 3.75 ms | 4.03 ms | 1.3 MiB | 403 |
| 80 | 4.69 ms | 6.04 ms | 6.24 ms | 2.6 MiB | 213 |
| 160 | 9.14 ms | 12.3 ms | 10.8 ms | 5.3 MiB | 109 |
| 320 | 18.0 ms | 21.4 ms | 19.8 ms | 10.6 MiB | 56 |
| 640 | 39.1 ms | 39.5 ms | 44.1 ms | 21.5 MiB | 26 |
| 1280 | 71.2 ms | 72.2 ms | 73.3 ms | 43.7 MiB | 14 |
| 2560 | 142 ms | 143 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 290 ms | 291 ms | 300 ms | 54.3 MiB | 3 |
| 10240 | 579 ms | 584 ms | 591 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.80 µs | 8.94 µs | 8.24 µs | 7.4 KiB | 128,267 |
| 40 | 12.2 µs | 13.5 µs | 45.4 µs | 14.0 KiB | 82,067 |
| 80 | 21.3 µs | 26.0 µs | 68.8 µs | 27.3 KiB | 47,046 |
| 160 | 35.4 µs | 40.4 µs | 86.2 µs | 53.9 KiB | 28,270 |
| 320 | 80.5 µs | 91.7 µs | 249 µs | 107.0 KiB | 12,429 |
| 640 | 152 µs | 174 µs | 451 µs | 213.3 KiB | 6,579 |
| 1280 | 529 µs | 590 µs | 1.30 ms | 516.0 KiB | 1,889 |
| 2560 | 1.07 ms | 1.18 ms | 2.67 ms | 1.0 MiB | 931 |
| 5120 | 2.12 ms | 2.33 ms | 3.72 ms | 2.1 MiB | 471 |
| 10240 | 4.39 ms | 4.61 ms | 6.56 ms | 4.2 MiB | 228 |

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
| 20 | 2.58 ms | 2.73 ms | 4.51 ms | 1.2 MiB | 388 |
| 40 | 4.72 ms | 4.85 ms | 6.67 ms | 2.5 MiB | 212 |
| 80 | 8.97 ms | 9.06 ms | 11.0 ms | 5.0 MiB | 111 |
| 160 | 17.7 ms | 24.3 ms | 19.9 ms | 10.0 MiB | 57 |
| 320 | 34.7 ms | 35.0 ms | 37.0 ms | 20.0 MiB | 29 |
| 640 | 68.9 ms | 69.9 ms | 71.2 ms | 40.1 MiB | 15 |
| 1280 | 138 ms | 142 ms | 141 ms | 16.1 MiB | 7 |
| 2560 | 273 ms | 273 ms | 275 ms | 32.3 MiB | 4 |
| 5120 | 546 ms | 551 ms | 548 ms | 707.4 KiB | 2 |
| 10240 | 1.10 s | 1.10 s | 1.10 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.48 ms | 1.55 ms | 3.49 ms | 645.6 KiB | 677 |
| 40 | 2.57 ms | 2.62 ms | 4.58 ms | 1.3 MiB | 389 |
| 80 | 4.67 ms | 4.84 ms | 6.68 ms | 2.5 MiB | 214 |
| 160 | 9.02 ms | 9.09 ms | 11.1 ms | 5.2 MiB | 111 |
| 320 | 17.8 ms | 18.3 ms | 20.2 ms | 10.6 MiB | 56 |
| 640 | 35.4 ms | 38.0 ms | 37.7 ms | 21.4 MiB | 28 |
| 1280 | 70.8 ms | 72.1 ms | 73.1 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 161 ms | 145 ms | 25.7 MiB | 7 |
| 5120 | 286 ms | 286 ms | 289 ms | 53.9 MiB | 4 |
| 10240 | 572 ms | 573 ms | 577 ms | 46.2 MiB | 2 |

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
| 20 | 5.89 µs | 15.8 µs | 6.05 µs | 9.3 KiB | 169,688 |
| 40 | 7.62 µs | 9.82 µs | 30.3 µs | 8.4 KiB | 131,152 |
| 80 | 12.5 µs | 13.1 µs | 42.1 µs | 16.2 KiB | 79,798 |
| 160 | 23.8 µs | 24.8 µs | 77.5 µs | 31.8 KiB | 41,989 |
| 320 | 46.8 µs | 48.0 µs | 147 µs | 63.1 KiB | 21,358 |
| 640 | 86.1 µs | 89.2 µs | 252 µs | 127.7 KiB | 11,615 |
| 1280 | 439 µs | 453 µs | 1.20 ms | 340.8 KiB | 2,279 |
| 2560 | 798 µs | 836 µs | 1.58 ms | 694.2 KiB | 1,253 |
| 5120 | 1.78 ms | 1.81 ms | 3.43 ms | 1.3 MiB | 563 |
| 10240 | 3.64 ms | 3.69 ms | 5.47 ms | 2.7 MiB | 275 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.88, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.49 µs | 4.74 µs | 14.3 µs | 4.5 KiB | 222,928 |
| 40 | 4.88 µs | 5.16 µs | 18.4 µs | 4.5 KiB | 205,090 |
| 80 | 5.66 µs | 5.97 µs | 21.5 µs | 4.5 KiB | 176,778 |
| 160 | 6.64 µs | 7.03 µs | 26.3 µs | 4.5 KiB | 150,574 |
| 320 | 9.01 µs | 9.48 µs | 34.1 µs | 4.5 KiB | 111,030 |
| 640 | 13.0 µs | 13.7 µs | 44.9 µs | 4.5 KiB | 76,772 |
| 1280 | 22.0 µs | 23.6 µs | 74.6 µs | 4.5 KiB | 45,474 |
| 2560 | 39.0 µs | 42.2 µs | 123 µs | 4.5 KiB | 25,648 |
| 5120 | 75.5 µs | 79.0 µs | 237 µs | 4.5 KiB | 13,250 |
| 10240 | 150 µs | 158 µs | 484 µs | 4.5 KiB | 6,652 |

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
| 20 | 14.1 µs | 17.5 µs | 14.4 µs | 3.7 KiB | 71,052 |
| 40 | 20.2 µs | 23.4 µs | 20.5 µs | 6.3 KiB | 49,460 |
| 80 | 33.0 µs | 36.2 µs | 107 µs | 11.7 KiB | 30,308 |
| 160 | 52.9 µs | 63.6 µs | 190 µs | 22.3 KiB | 18,889 |
| 320 | 96.6 µs | 110 µs | 311 µs | 45.3 KiB | 10,353 |
| 640 | 180 µs | 208 µs | 557 µs | 93.6 KiB | 5,560 |
| 1280 | 321 µs | 358 µs | 836 µs | 191.5 KiB | 3,115 |
| 2560 | 615 µs | 667 µs | 1.44 ms | 360.8 KiB | 1,625 |
| 5120 | 1.39 ms | 1.52 ms | 2.98 ms | 685.3 KiB | 721 |
| 10240 | 2.41 ms | 2.49 ms | 4.12 ms | 1.3 MiB | 415 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.65 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.03 ms | 2.03 ms | 76% |
| `load-exception-registry` | 1 | 541 µs | 541 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 82.5 µs | 3.1% |

**At 10240 entrys** (whole operation: 44.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 33.0 ms | 33.0 ms | 74% |
| `load-exception-registry` | 1 | 7.25 ms | 7.25 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.43 ms | 9.9% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T15:09:18.320Z` → `2026-11-02T15:10:22.444Z` (64 s), ci: CI (run 41465720616)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `f9404a39378d5c59955ede13de7733a57af56353` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

