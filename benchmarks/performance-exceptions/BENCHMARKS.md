# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.91 ms** per operation compared with a bare-minimum baseline (**291% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.91 ms | 33.6 ms |
| Added latency, relative to baseline | 291% | 336% |
| Added CPU time per operation | 2.65 ms | 33.4 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 523 ops/s | 30 ops/s |

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
| 20 | 29.0 µs | 142 µs | 113 µs | 391% | 395 µs | $0.00024 – $0.0044 |
| 40 | 54.3 µs | 213 µs | 158 µs | 292% | 378 µs | $0.00033 – $0.0043 |
| 80 | 96.9 µs | 367 µs | 271 µs | 279% | 555 µs | $0.00056 – $0.0062 |
| 160 | 184 µs | 669 µs | 485 µs | 264% | 855 µs | $0.001 – $0.0096 |
| 320 | 345 µs | 1.33 ms | 987 µs | 286% | 1.96 ms | $0.0021 – $0.022 |
| 640 | 656 µs | 2.57 ms | 1.91 ms | 291% | 2.65 ms | $0.004 – $0.030 |
| 1280 | 1.31 ms | 4.91 ms | 3.60 ms | 275% | 3.67 ms | $0.0075 – $0.041 |
| 2560 | 2.50 ms | 9.67 ms | 7.17 ms | 287% | 7.16 ms | $0.015 – $0.081 |
| 5120 | 4.96 ms | 19.4 ms | 14.5 ms | 292% | 14.4 ms | $0.030 – $0.162 |
| 10240 | 9.99 ms | 43.6 ms | 33.6 ms | 336% | 33.4 ms | $0.070 – $0.376 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 346 µs | 4.31 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 56.9 µs | 1.38 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 546 µs | 7.34 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.01 ms | 32.8 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 39.8 ms | 578 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 149 µs | 4.33 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 69.5 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.3 ms | 569 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 83.9 µs | 3.57 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.1 µs | 141 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 164 µs | 2.46 ms |

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
| 20 | 110 µs | 178 µs | 358 µs | 115.4 KiB | 9,118 |
| 40 | 82.6 µs | 88.8 µs | 325 µs | 99.8 KiB | 12,113 |
| 80 | 79.5 µs | 84.2 µs | 242 µs | 120.8 KiB | 12,584 |
| 160 | 105 µs | 111 µs | 311 µs | 159.3 KiB | 9,554 |
| 320 | 156 µs | 160 µs | 449 µs | 237.4 KiB | 6,418 |
| 640 | 346 µs | 491 µs | 1.11 ms | 530.7 KiB | 2,892 |
| 1280 | 539 µs | 550 µs | 1.28 ms | 1.0 MiB | 1,855 |
| 2560 | 1.07 ms | 1.10 ms | 2.52 ms | 2.1 MiB | 932 |
| 5120 | 2.16 ms | 2.21 ms | 3.56 ms | 4.3 MiB | 463 |
| 10240 | 4.31 ms | 4.38 ms | 5.46 ms | 8.6 MiB | 232 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.7 µs | 12.5 µs | 44.2 µs | 17.0 KiB | 85,167 |
| 40 | 11.8 µs | 12.5 µs | 44.7 µs | 16.3 KiB | 84,441 |
| 80 | 14.9 µs | 17.7 µs | 53.9 µs | 20.5 KiB | 67,085 |
| 160 | 20.5 µs | 21.7 µs | 70.3 µs | 28.6 KiB | 48,708 |
| 320 | 32.1 µs | 34.2 µs | 104 µs | 48.2 KiB | 31,117 |
| 640 | 56.9 µs | 59.5 µs | 175 µs | 86.8 KiB | 17,567 |
| 1280 | 115 µs | 119 µs | 328 µs | 166.1 KiB | 8,700 |
| 2560 | 235 µs | 240 µs | 633 µs | 329.7 KiB | 4,257 |
| 5120 | 614 µs | 631 µs | 1.49 ms | 634.3 KiB | 1,629 |
| 10240 | 1.38 ms | 1.46 ms | 3.46 ms | 1.3 MiB | 723 |

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
| 20 | 22.8 µs | 24.8 µs | 84.7 µs | 7.3 KiB | 43,872 |
| 40 | 39.8 µs | 40.6 µs | 120 µs | 13.2 KiB | 25,138 |
| 80 | 72.6 µs | 75.3 µs | 205 µs | 25.1 KiB | 13,770 |
| 160 | 144 µs | 151 µs | 387 µs | 48.9 KiB | 6,935 |
| 320 | 289 µs | 295 µs | 775 µs | 96.5 KiB | 3,457 |
| 640 | 546 µs | 573 µs | 1.27 ms | 191.6 KiB | 1,830 |
| 1280 | 1.10 ms | 1.14 ms | 2.60 ms | 381.9 KiB | 912 |
| 2560 | 2.01 ms | 2.39 ms | 3.67 ms | 761.9 KiB | 497 |
| 5120 | 4.54 ms | 4.72 ms | 6.33 ms | 1.5 MiB | 220 |
| 10240 | 7.34 ms | 7.69 ms | 9.47 ms | 3.0 MiB | 136 |

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
| 20 | 87.5 µs | 101 µs | 294 µs | 44.3 KiB | 11,426 |
| 40 | 151 µs | 160 µs | 439 µs | 83.3 KiB | 6,641 |
| 80 | 287 µs | 302 µs | 774 µs | 161.9 KiB | 3,479 |
| 160 | 538 µs | 562 µs | 1.26 ms | 319.5 KiB | 1,857 |
| 320 | 1.07 ms | 1.14 ms | 2.52 ms | 634.8 KiB | 937 |
| 640 | 2.01 ms | 2.06 ms | 3.47 ms | 1.2 MiB | 497 |
| 1280 | 3.75 ms | 3.81 ms | 5.29 ms | 2.5 MiB | 266 |
| 2560 | 7.32 ms | 7.55 ms | 9.04 ms | 4.9 MiB | 137 |
| 5120 | 14.4 ms | 14.5 ms | 16.4 ms | 9.8 MiB | 70 |
| 10240 | 32.8 ms | 33.0 ms | 35.4 ms | 19.7 MiB | 30 |

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
| 20 | 1.90 ms | 2.43 ms | 4.11 ms | 652.8 KiB | 526 |
| 40 | 2.48 ms | 3.78 ms | 3.97 ms | 1.3 MiB | 404 |
| 80 | 4.67 ms | 6.39 ms | 6.17 ms | 2.6 MiB | 214 |
| 160 | 9.18 ms | 11.1 ms | 10.7 ms | 5.3 MiB | 109 |
| 320 | 18.4 ms | 21.8 ms | 19.9 ms | 10.6 MiB | 54 |
| 640 | 39.8 ms | 41.6 ms | 45.2 ms | 21.5 MiB | 25 |
| 1280 | 71.1 ms | 74.1 ms | 73.0 ms | 43.7 MiB | 14 |
| 2560 | 142 ms | 147 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 290 ms | 291 ms | 301 ms | 54.2 MiB | 3 |
| 10240 | 578 ms | 581 ms | 590 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.17, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.00 µs | 9.40 µs | 8.29 µs | 7.4 KiB | 124,986 |
| 40 | 11.4 µs | 12.4 µs | 40.7 µs | 14.0 KiB | 87,547 |
| 80 | 20.6 µs | 27.5 µs | 66.8 µs | 27.3 KiB | 48,512 |
| 160 | 39.5 µs | 45.3 µs | 121 µs | 53.9 KiB | 25,306 |
| 320 | 75.8 µs | 90.1 µs | 224 µs | 107.0 KiB | 13,191 |
| 640 | 149 µs | 166 µs | 446 µs | 213.3 KiB | 6,710 |
| 1280 | 521 µs | 566 µs | 1.28 ms | 516.0 KiB | 1,918 |
| 2560 | 1.05 ms | 1.18 ms | 2.56 ms | 1.0 MiB | 954 |
| 5120 | 2.10 ms | 2.31 ms | 3.68 ms | 2.1 MiB | 477 |
| 10240 | 4.33 ms | 4.52 ms | 6.40 ms | 4.2 MiB | 231 |

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
| 20 | 2.53 ms | 2.64 ms | 4.42 ms | 1.2 MiB | 395 |
| 40 | 4.64 ms | 4.86 ms | 6.55 ms | 2.5 MiB | 216 |
| 80 | 8.93 ms | 8.98 ms | 10.8 ms | 5.0 MiB | 112 |
| 160 | 17.5 ms | 17.8 ms | 19.6 ms | 10.0 MiB | 57 |
| 320 | 34.7 ms | 35.5 ms | 36.9 ms | 20.0 MiB | 29 |
| 640 | 69.5 ms | 73.0 ms | 71.4 ms | 40.1 MiB | 14 |
| 1280 | 137 ms | 145 ms | 140 ms | 16.1 MiB | 7 |
| 2560 | 275 ms | 275 ms | 277 ms | 32.3 MiB | 4 |
| 5120 | 548 ms | 551 ms | 550 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.10 s | 1.10 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.41 ms | 1.49 ms | 3.34 ms | 645.6 KiB | 712 |
| 40 | 2.53 ms | 2.59 ms | 4.43 ms | 1.3 MiB | 396 |
| 80 | 4.68 ms | 4.81 ms | 6.61 ms | 2.5 MiB | 214 |
| 160 | 8.99 ms | 9.16 ms | 10.9 ms | 5.2 MiB | 111 |
| 320 | 17.7 ms | 17.9 ms | 19.6 ms | 10.6 MiB | 57 |
| 640 | 35.3 ms | 35.6 ms | 37.3 ms | 21.4 MiB | 28 |
| 1280 | 70.5 ms | 71.3 ms | 72.5 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 150 ms | 144 ms | 25.7 MiB | 7 |
| 5120 | 285 ms | 286 ms | 289 ms | 53.9 MiB | 4 |
| 10240 | 569 ms | 573 ms | 573 ms | 46.2 MiB | 2 |

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
| 20 | 5.79 µs | 14.3 µs | 5.91 µs | 9.3 KiB | 172,785 |
| 40 | 7.55 µs | 8.36 µs | 28.6 µs | 8.4 KiB | 132,538 |
| 80 | 12.5 µs | 13.3 µs | 42.8 µs | 16.2 KiB | 79,891 |
| 160 | 22.8 µs | 24.2 µs | 72.3 µs | 31.8 KiB | 43,843 |
| 320 | 43.4 µs | 45.7 µs | 130 µs | 63.1 KiB | 23,048 |
| 640 | 83.9 µs | 89.7 µs | 249 µs | 127.7 KiB | 11,912 |
| 1280 | 440 µs | 449 µs | 1.19 ms | 340.8 KiB | 2,271 |
| 2560 | 794 µs | 816 µs | 1.56 ms | 694.2 KiB | 1,260 |
| 5120 | 1.73 ms | 1.76 ms | 3.33 ms | 1.3 MiB | 577 |
| 10240 | 3.57 ms | 3.63 ms | 5.38 ms | 2.7 MiB | 280 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.86, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.43 µs | 4.66 µs | 13.5 µs | 4.5 KiB | 225,807 |
| 40 | 4.75 µs | 5.22 µs | 15.8 µs | 4.5 KiB | 210,695 |
| 80 | 5.37 µs | 5.77 µs | 21.4 µs | 4.5 KiB | 186,235 |
| 160 | 6.56 µs | 6.96 µs | 24.8 µs | 4.5 KiB | 152,469 |
| 320 | 8.74 µs | 9.29 µs | 31.2 µs | 4.5 KiB | 114,453 |
| 640 | 13.1 µs | 14.8 µs | 44.1 µs | 4.5 KiB | 76,501 |
| 1280 | 21.7 µs | 23.3 µs | 69.9 µs | 4.5 KiB | 46,067 |
| 2560 | 37.9 µs | 40.5 µs | 117 µs | 4.5 KiB | 26,360 |
| 5120 | 73.9 µs | 95.5 µs | 227 µs | 4.5 KiB | 13,523 |
| 10240 | 141 µs | 147 µs | 403 µs | 4.5 KiB | 7,086 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.7 µs | 14.4 µs | 12.9 µs | 3.6 KiB | 78,911 |
| 40 | 18.6 µs | 20.8 µs | 18.8 µs | 6.3 KiB | 53,874 |
| 80 | 31.6 µs | 33.6 µs | 100 µs | 11.7 KiB | 31,661 |
| 160 | 52.0 µs | 62.9 µs | 188 µs | 22.3 KiB | 19,245 |
| 320 | 100 µs | 109 µs | 350 µs | 45.6 KiB | 9,969 |
| 640 | 164 µs | 176 µs | 466 µs | 92.1 KiB | 6,089 |
| 1280 | 299 µs | 324 µs | 692 µs | 186.8 KiB | 3,349 |
| 2560 | 615 µs | 669 µs | 1.41 ms | 360.9 KiB | 1,626 |
| 5120 | 1.38 ms | 1.44 ms | 2.95 ms | 685.3 KiB | 726 |
| 10240 | 2.46 ms | 2.52 ms | 4.14 ms | 1.3 MiB | 407 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.57 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.01 ms | 2.01 ms | 78% |
| `load-exception-registry` | 1 | 546 µs | 546 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 6.88 µs | 0.3% |

**At 10240 entrys** (whole operation: 43.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.8 ms | 32.8 ms | 75% |
| `load-exception-registry` | 1 | 7.34 ms | 7.34 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.40 ms | 7.8% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-21T14:28:18.366Z` → `2026-10-21T14:29:22.098Z` (64 s), ci: CI (run 39614518835)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.0, GitHub Actions
- Git: `489f3721c4dae30a98bd471426f11fadaf2eaac4` on `fix/license-config-and-e2e-zero-tests`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

