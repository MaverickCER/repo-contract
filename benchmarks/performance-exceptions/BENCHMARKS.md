# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.76 ms** per operation compared with a bare-minimum baseline (**258% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.76 ms | 32.9 ms |
| Added latency, relative to baseline | 258% | 308% |
| Added CPU time per operation | 2.57 ms | 32.6 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 570 ops/s | 30 ops/s |

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
| 20 | 29.7 µs | 136 µs | 106 µs | 358% | 403 µs | $0.00022 – $0.0045 |
| 40 | 50.3 µs | 199 µs | 149 µs | 297% | 424 µs | $0.00031 – $0.0048 |
| 80 | 94.7 µs | 347 µs | 252 µs | 267% | 584 µs | $0.00053 – $0.0066 |
| 160 | 181 µs | 636 µs | 454 µs | 250% | 947 µs | $0.00095 – $0.011 |
| 320 | 354 µs | 1.25 ms | 901 µs | 254% | 1.98 ms | $0.0019 – $0.022 |
| 640 | 681 µs | 2.44 ms | 1.76 ms | 258% | 2.57 ms | $0.0037 – $0.029 |
| 1280 | 1.37 ms | 4.69 ms | 3.33 ms | 243% | 3.38 ms | $0.0069 – $0.038 |
| 2560 | 2.64 ms | 9.40 ms | 6.76 ms | 256% | 6.79 ms | $0.014 – $0.076 |
| 5120 | 5.20 ms | 18.6 ms | 13.4 ms | 258% | 13.4 ms | $0.028 – $0.150 |
| 10240 | 10.7 ms | 43.6 ms | 32.9 ms | 308% | 32.6 ms | $0.069 – $0.367 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 350 µs | 4.40 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 67.2 µs | 1.47 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 560 µs | 7.66 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.81 ms | 31.1 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 38.0 ms | 592 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 140 µs | 4.49 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 70.8 ms | 1.12 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 36.2 ms | 588 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 70.9 µs | 3.67 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 12.9 µs | 150 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 180 µs | 2.49 ms |

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
| 20 | 107 µs | 166 µs | 366 µs | 115.4 KiB | 9,367 |
| 40 | 80.6 µs | 115 µs | 305 µs | 99.2 KiB | 12,408 |
| 80 | 78.4 µs | 82.0 µs | 251 µs | 120.8 KiB | 12,749 |
| 160 | 109 µs | 113 µs | 334 µs | 159.3 KiB | 9,189 |
| 320 | 137 µs | 141 µs | 338 µs | 239.2 KiB | 7,301 |
| 640 | 350 µs | 505 µs | 1.16 ms | 656.2 KiB | 2,858 |
| 1280 | 540 µs | 580 µs | 1.30 ms | 1.0 MiB | 1,853 |
| 2560 | 954 µs | 990 µs | 1.69 ms | 2.1 MiB | 1,048 |
| 5120 | 2.16 ms | 2.21 ms | 3.57 ms | 4.3 MiB | 462 |
| 10240 | 4.40 ms | 4.59 ms | 5.53 ms | 8.6 MiB | 227 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.6 µs | 12.2 µs | 25.2 µs | 17.0 KiB | 86,277 |
| 40 | 11.5 µs | 12.6 µs | 47.1 µs | 16.3 KiB | 86,764 |
| 80 | 15.4 µs | 16.3 µs | 59.9 µs | 20.5 KiB | 65,093 |
| 160 | 22.0 µs | 24.3 µs | 80.4 µs | 28.6 KiB | 45,382 |
| 320 | 36.9 µs | 39.2 µs | 128 µs | 48.4 KiB | 27,087 |
| 640 | 67.2 µs | 69.9 µs | 229 µs | 86.9 KiB | 14,874 |
| 1280 | 114 µs | 130 µs | 349 µs | 166.1 KiB | 8,779 |
| 2560 | 269 µs | 282 µs | 850 µs | 335.9 KiB | 3,723 |
| 5120 | 655 µs | 674 µs | 1.61 ms | 634.3 KiB | 1,527 |
| 10240 | 1.47 ms | 1.51 ms | 3.77 ms | 1.3 MiB | 680 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 25.0 µs | 26.9 µs | 25.5 µs | 7.3 KiB | 39,949 |
| 40 | 43.1 µs | 45.0 µs | 165 µs | 13.2 KiB | 23,193 |
| 80 | 77.1 µs | 79.7 µs | 233 µs | 25.1 KiB | 12,967 |
| 160 | 147 µs | 151 µs | 418 µs | 48.9 KiB | 6,781 |
| 320 | 292 µs | 302 µs | 822 µs | 96.5 KiB | 3,422 |
| 640 | 560 µs | 574 µs | 1.35 ms | 191.6 KiB | 1,787 |
| 1280 | 1.12 ms | 1.14 ms | 2.77 ms | 381.9 KiB | 894 |
| 2560 | 2.06 ms | 2.52 ms | 3.84 ms | 761.9 KiB | 484 |
| 5120 | 4.80 ms | 4.97 ms | 6.76 ms | 1.5 MiB | 208 |
| 10240 | 7.66 ms | 8.37 ms | 9.97 ms | 3.0 MiB | 130 |

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
| 20 | 81.3 µs | 87.2 µs | 307 µs | 44.3 KiB | 12,302 |
| 40 | 132 µs | 148 µs | 395 µs | 83.1 KiB | 7,580 |
| 80 | 259 µs | 271 µs | 793 µs | 161.9 KiB | 3,864 |
| 160 | 482 µs | 524 µs | 1.27 ms | 319.5 KiB | 2,075 |
| 320 | 947 µs | 1.00 ms | 2.53 ms | 634.7 KiB | 1,056 |
| 640 | 1.81 ms | 1.89 ms | 3.41 ms | 1.2 MiB | 552 |
| 1280 | 3.38 ms | 3.57 ms | 5.10 ms | 2.5 MiB | 295 |
| 2560 | 6.54 ms | 6.68 ms | 8.43 ms | 4.9 MiB | 153 |
| 5120 | 13.3 ms | 13.6 ms | 15.5 ms | 9.8 MiB | 75 |
| 10240 | 31.1 ms | 33.3 ms | 34.1 ms | 19.7 MiB | 32 |

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
| 20 | 1.90 ms | 2.26 ms | 4.17 ms | 652.5 KiB | 526 |
| 40 | 2.54 ms | 3.61 ms | 4.18 ms | 1.3 MiB | 394 |
| 80 | 4.80 ms | 5.98 ms | 6.43 ms | 2.6 MiB | 209 |
| 160 | 9.44 ms | 11.3 ms | 11.2 ms | 5.3 MiB | 106 |
| 320 | 18.6 ms | 19.9 ms | 20.7 ms | 10.6 MiB | 54 |
| 640 | 38.0 ms | 38.4 ms | 43.2 ms | 21.5 MiB | 26 |
| 1280 | 72.5 ms | 73.8 ms | 75.0 ms | 43.7 MiB | 14 |
| 2560 | 147 ms | 148 ms | 150 ms | 25.9 MiB | 7 |
| 5120 | 296 ms | 299 ms | 307 ms | 54.3 MiB | 3 |
| 10240 | 592 ms | 593 ms | 605 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.25 µs | 8.80 µs | 7.59 µs | 7.4 KiB | 137,934 |
| 40 | 11.8 µs | 12.7 µs | 46.4 µs | 14.0 KiB | 85,097 |
| 80 | 20.3 µs | 24.0 µs | 70.8 µs | 27.3 KiB | 49,343 |
| 160 | 37.6 µs | 44.9 µs | 123 µs | 53.9 KiB | 26,591 |
| 320 | 71.4 µs | 82.4 µs | 221 µs | 107.0 KiB | 13,997 |
| 640 | 140 µs | 172 µs | 410 µs | 213.3 KiB | 7,128 |
| 1280 | 520 µs | 583 µs | 1.32 ms | 516.0 KiB | 1,921 |
| 2560 | 970 µs | 1.00 ms | 1.89 ms | 1.0 MiB | 1,030 |
| 5120 | 2.11 ms | 2.27 ms | 3.86 ms | 2.1 MiB | 473 |
| 10240 | 4.49 ms | 4.71 ms | 6.87 ms | 4.2 MiB | 223 |

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
| 20 | 2.62 ms | 3.18 ms | 4.82 ms | 1.2 MiB | 381 |
| 40 | 4.80 ms | 4.87 ms | 6.99 ms | 2.5 MiB | 208 |
| 80 | 9.20 ms | 9.28 ms | 11.4 ms | 5.0 MiB | 109 |
| 160 | 18.1 ms | 18.4 ms | 20.7 ms | 10.0 MiB | 55 |
| 320 | 35.7 ms | 36.0 ms | 38.2 ms | 20.0 MiB | 28 |
| 640 | 70.8 ms | 72.5 ms | 73.3 ms | 40.1 MiB | 14 |
| 1280 | 142 ms | 144 ms | 145 ms | 16.1 MiB | 7 |
| 2560 | 281 ms | 284 ms | 284 ms | 32.3 MiB | 4 |
| 5120 | 563 ms | 583 ms | 566 ms | 707.4 KiB | 2 |
| 10240 | 1.12 s | 1.13 s | 1.12 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.48 ms | 1.53 ms | 3.70 ms | 645.6 KiB | 676 |
| 40 | 2.56 ms | 2.67 ms | 4.92 ms | 1.3 MiB | 391 |
| 80 | 4.73 ms | 4.85 ms | 6.91 ms | 2.5 MiB | 211 |
| 160 | 9.22 ms | 9.39 ms | 11.8 ms | 5.2 MiB | 108 |
| 320 | 18.2 ms | 18.5 ms | 20.9 ms | 10.6 MiB | 55 |
| 640 | 36.2 ms | 36.3 ms | 38.9 ms | 21.4 MiB | 28 |
| 1280 | 72.4 ms | 72.5 ms | 74.9 ms | 43.6 MiB | 14 |
| 2560 | 146 ms | 146 ms | 149 ms | 25.7 MiB | 7 |
| 5120 | 293 ms | 293 ms | 297 ms | 53.9 MiB | 3 |
| 10240 | 588 ms | 590 ms | 593 ms | 46.2 MiB | 2 |

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
| 20 | 5.49 µs | 13.8 µs | 5.68 µs | 9.3 KiB | 182,118 |
| 40 | 7.76 µs | 8.86 µs | 8.54 µs | 8.4 KiB | 128,872 |
| 80 | 12.5 µs | 13.1 µs | 47.4 µs | 16.2 KiB | 80,149 |
| 160 | 21.8 µs | 22.7 µs | 74.4 µs | 31.8 KiB | 45,845 |
| 320 | 42.8 µs | 45.1 µs | 149 µs | 63.1 KiB | 23,354 |
| 640 | 70.9 µs | 72.8 µs | 177 µs | 127.7 KiB | 14,111 |
| 1280 | 431 µs | 443 µs | 1.24 ms | 340.8 KiB | 2,323 |
| 2560 | 805 µs | 838 µs | 1.68 ms | 694.2 KiB | 1,242 |
| 5120 | 1.79 ms | 1.83 ms | 3.57 ms | 1.3 MiB | 559 |
| 10240 | 3.67 ms | 3.70 ms | 5.67 ms | 2.7 MiB | 273 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.88, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.12 µs | 4.32 µs | 4.17 µs | 4.5 KiB | 242,457 |
| 40 | 4.43 µs | 4.64 µs | 4.47 µs | 4.5 KiB | 225,837 |
| 80 | 5.17 µs | 5.39 µs | 15.8 µs | 4.5 KiB | 193,539 |
| 160 | 6.44 µs | 6.79 µs | 25.2 µs | 4.5 KiB | 155,192 |
| 320 | 9.54 µs | 10.0 µs | 31.1 µs | 4.5 KiB | 104,777 |
| 640 | 12.9 µs | 13.3 µs | 44.7 µs | 4.5 KiB | 77,522 |
| 1280 | 22.4 µs | 23.6 µs | 74.5 µs | 4.5 KiB | 44,572 |
| 2560 | 40.9 µs | 48.9 µs | 135 µs | 4.5 KiB | 24,444 |
| 5120 | 75.0 µs | 81.9 µs | 229 µs | 4.5 KiB | 13,341 |
| 10240 | 150 µs | 153 µs | 449 µs | 4.5 KiB | 6,669 |

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
| 20 | 15.4 µs | 18.9 µs | 16.0 µs | 3.7 KiB | 64,727 |
| 40 | 21.1 µs | 23.6 µs | 21.7 µs | 6.4 KiB | 47,428 |
| 80 | 32.4 µs | 35.6 µs | 66.4 µs | 11.7 KiB | 30,820 |
| 160 | 53.9 µs | 58.5 µs | 217 µs | 22.4 KiB | 18,552 |
| 320 | 95.0 µs | 112 µs | 334 µs | 45.3 KiB | 10,522 |
| 640 | 180 µs | 192 µs | 616 µs | 93.6 KiB | 5,540 |
| 1280 | 314 µs | 324 µs | 893 µs | 191.5 KiB | 3,185 |
| 2560 | 612 µs | 737 µs | 1.56 ms | 360.8 KiB | 1,635 |
| 5120 | 1.42 ms | 1.57 ms | 3.35 ms | 685.3 KiB | 703 |
| 10240 | 2.49 ms | 3.24 ms | 4.55 ms | 1.3 MiB | 402 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.44 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.81 ms | 1.81 ms | 74% |
| `load-exception-registry` | 1 | 560 µs | 560 µs | 23% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 64.2 µs | 2.6% |

**At 10240 entrys** (whole operation: 43.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 31.1 ms | 31.1 ms | 71% |
| `load-exception-registry` | 1 | 7.66 ms | 7.66 ms | 18% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.77 ms | 11% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-03T09:24:25.567Z` → `2026-11-03T09:25:30.782Z` (65 s), ci: CI (run 41608056902)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `129f48e79bf2184a31658f47480f331c4796d9ac` on `chore/dependency-updates-v3`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

