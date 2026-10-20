# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.87 ms** per operation compared with a bare-minimum baseline (**281% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.87 ms | 31.2 ms |
| Added latency, relative to baseline | 281% | 318% |
| Added CPU time per operation | 2.72 ms | 31.0 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 534 ops/s | 32 ops/s |

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
| 20 | 36.5 µs | 171 µs | 135 µs | 369% | 569 µs | $0.00028 – $0.0064 |
| 40 | 57.0 µs | 241 µs | 184 µs | 322% | 585 µs | $0.00038 – $0.0066 |
| 80 | 111 µs | 423 µs | 312 µs | 282% | 874 µs | $0.00065 – $0.0098 |
| 160 | 197 µs | 680 µs | 483 µs | 245% | 929 µs | $0.001 – $0.010 |
| 320 | 397 µs | 1.36 ms | 964 µs | 242% | 1.79 ms | $0.002 – $0.020 |
| 640 | 667 µs | 2.54 ms | 1.87 ms | 281% | 2.72 ms | $0.0039 – $0.031 |
| 1280 | 1.33 ms | 4.85 ms | 3.52 ms | 265% | 3.70 ms | $0.0073 – $0.042 |
| 2560 | 2.42 ms | 9.50 ms | 7.08 ms | 293% | 7.31 ms | $0.015 – $0.082 |
| 5120 | 4.78 ms | 19.2 ms | 14.5 ms | 303% | 14.8 ms | $0.030 – $0.167 |
| 10240 | 9.83 ms | 41.1 ms | 31.2 ms | 318% | 31.0 ms | $0.065 – $0.348 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 363 µs | 4.26 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n) | ✅ matches | 73.6 µs | 1.48 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 534 µs | 6.77 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.97 ms | 30.1 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 35.0 ms | 569 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 163 µs | 4.33 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 66.6 ms | 1.05 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 33.9 ms | 550 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 95.3 µs | 3.51 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 14.5 µs | 159 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 193 µs | 2.36 ms |

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

**Measured: O(n)** (exponent 0.90, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 125 µs | 156 µs | 483 µs | 115.6 KiB | 7,983 |
| 40 | 96.8 µs | 143 µs | 413 µs | 99.8 KiB | 10,333 |
| 80 | 95.1 µs | 97.5 µs | 332 µs | 118.5 KiB | 10,519 |
| 160 | 126 µs | 129 µs | 439 µs | 159.8 KiB | 7,962 |
| 320 | 183 µs | 189 µs | 625 µs | 237.8 KiB | 5,469 |
| 640 | 363 µs | 539 µs | 1.26 ms | 530.7 KiB | 2,752 |
| 1280 | 573 µs | 584 µs | 1.46 ms | 1.0 MiB | 1,746 |
| 2560 | 1.14 ms | 1.17 ms | 2.83 ms | 2.1 MiB | 877 |
| 5120 | 2.20 ms | 2.25 ms | 3.92 ms | 4.3 MiB | 455 |
| 10240 | 4.26 ms | 4.48 ms | 4.90 ms | 8.6 MiB | 235 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n)** (exponent 1.08, 10 sizes) -- ✅ matches.

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.0 µs | 14.7 µs | 60.6 µs | 17.0 KiB | 71,464 |
| 40 | 14.8 µs | 15.6 µs | 48.5 µs | 16.3 KiB | 67,373 |
| 80 | 19.6 µs | 20.6 µs | 19.9 µs | 20.5 KiB | 51,026 |
| 160 | 22.9 µs | 24.0 µs | 82.7 µs | 28.6 KiB | 43,752 |
| 320 | 42.1 µs | 44.3 µs | 167 µs | 48.6 KiB | 23,762 |
| 640 | 73.6 µs | 77.4 µs | 266 µs | 86.9 KiB | 13,591 |
| 1280 | 151 µs | 161 µs | 510 µs | 171.5 KiB | 6,609 |
| 2560 | 291 µs | 304 µs | 950 µs | 335.9 KiB | 3,431 |
| 5120 | 648 µs | 688 µs | 1.71 ms | 634.3 KiB | 1,543 |
| 10240 | 1.48 ms | 1.53 ms | 4.14 ms | 1.3 MiB | 676 |

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

**Measured: O(n)** (exponent 0.92, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 27.9 µs | 29.5 µs | 28.3 µs | 7.3 KiB | 35,825 |
| 40 | 43.5 µs | 45.9 µs | 160 µs | 13.2 KiB | 22,963 |
| 80 | 77.8 µs | 81.3 µs | 259 µs | 25.1 KiB | 12,850 |
| 160 | 153 µs | 167 µs | 481 µs | 48.9 KiB | 6,548 |
| 320 | 291 µs | 299 µs | 877 µs | 96.5 KiB | 3,437 |
| 640 | 534 µs | 556 µs | 1.41 ms | 191.6 KiB | 1,873 |
| 1280 | 1.08 ms | 1.11 ms | 2.88 ms | 381.9 KiB | 928 |
| 2560 | 1.90 ms | 2.12 ms | 3.85 ms | 761.9 KiB | 527 |
| 5120 | 3.93 ms | 4.09 ms | 6.18 ms | 1.5 MiB | 254 |
| 10240 | 6.77 ms | 7.48 ms | 9.49 ms | 3.0 MiB | 148 |

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
| 20 | 104 µs | 110 µs | 431 µs | 44.0 KiB | 9,633 |
| 40 | 153 µs | 173 µs | 491 µs | 83.3 KiB | 6,522 |
| 80 | 292 µs | 324 µs | 875 µs | 161.9 KiB | 3,424 |
| 160 | 539 µs | 578 µs | 1.44 ms | 319.5 KiB | 1,857 |
| 320 | 1.07 ms | 1.14 ms | 2.81 ms | 634.8 KiB | 934 |
| 640 | 1.97 ms | 2.08 ms | 3.81 ms | 1.2 MiB | 508 |
| 1280 | 3.68 ms | 3.80 ms | 5.67 ms | 2.5 MiB | 272 |
| 2560 | 7.10 ms | 7.50 ms | 9.37 ms | 4.9 MiB | 141 |
| 5120 | 14.1 ms | 14.8 ms | 16.9 ms | 9.8 MiB | 71 |
| 10240 | 30.1 ms | 31.0 ms | 33.4 ms | 19.7 MiB | 33 |

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
| 20 | 1.91 ms | 2.29 ms | 4.44 ms | 652.5 KiB | 524 |
| 40 | 2.45 ms | 3.54 ms | 4.26 ms | 1.3 MiB | 408 |
| 80 | 4.57 ms | 5.79 ms | 6.42 ms | 2.6 MiB | 219 |
| 160 | 8.88 ms | 10.9 ms | 10.8 ms | 5.3 MiB | 113 |
| 320 | 17.4 ms | 22.1 ms | 19.7 ms | 10.6 MiB | 58 |
| 640 | 35.0 ms | 35.8 ms | 40.1 ms | 21.5 MiB | 29 |
| 1280 | 70.5 ms | 70.6 ms | 73.4 ms | 43.7 MiB | 14 |
| 2560 | 142 ms | 143 ms | 145 ms | 25.9 MiB | 7 |
| 5120 | 284 ms | 287 ms | 294 ms | 54.2 MiB | 4 |
| 10240 | 569 ms | 584 ms | 582 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.95 µs | 9.87 µs | 8.19 µs | 7.4 KiB | 125,756 |
| 40 | 13.2 µs | 14.4 µs | 51.2 µs | 14.0 KiB | 76,027 |
| 80 | 24.5 µs | 26.8 µs | 92.4 µs | 27.3 KiB | 40,865 |
| 160 | 45.6 µs | 48.9 µs | 162 µs | 53.9 KiB | 21,942 |
| 320 | 85.2 µs | 103 µs | 279 µs | 107.0 KiB | 11,740 |
| 640 | 163 µs | 199 µs | 515 µs | 213.3 KiB | 6,149 |
| 1280 | 563 µs | 641 µs | 1.50 ms | 516.0 KiB | 1,775 |
| 2560 | 1.12 ms | 1.20 ms | 2.98 ms | 1.0 MiB | 894 |
| 5120 | 1.86 ms | 2.24 ms | 3.95 ms | 2.1 MiB | 537 |
| 10240 | 4.33 ms | 4.77 ms | 7.39 ms | 4.0 MiB | 231 |

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
| 20 | 2.49 ms | 2.64 ms | 4.93 ms | 1.2 MiB | 401 |
| 40 | 4.58 ms | 4.73 ms | 7.08 ms | 2.5 MiB | 219 |
| 80 | 8.73 ms | 8.83 ms | 11.3 ms | 5.0 MiB | 115 |
| 160 | 17.1 ms | 17.3 ms | 19.8 ms | 10.0 MiB | 59 |
| 320 | 33.5 ms | 34.3 ms | 36.2 ms | 20.0 MiB | 30 |
| 640 | 66.6 ms | 68.0 ms | 69.6 ms | 40.1 MiB | 15 |
| 1280 | 133 ms | 145 ms | 137 ms | 16.1 MiB | 8 |
| 2560 | 262 ms | 262 ms | 265 ms | 32.3 MiB | 4 |
| 5120 | 523 ms | 532 ms | 526 ms | 707.4 KiB | 2 |
| 10240 | 1.05 s | 1.05 s | 1.05 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.45 ms | 1.56 ms | 3.88 ms | 645.6 KiB | 688 |
| 40 | 2.47 ms | 2.58 ms | 4.91 ms | 1.3 MiB | 405 |
| 80 | 4.53 ms | 4.67 ms | 7.03 ms | 2.5 MiB | 221 |
| 160 | 8.72 ms | 8.87 ms | 11.3 ms | 5.2 MiB | 115 |
| 320 | 17.1 ms | 17.2 ms | 19.9 ms | 10.6 MiB | 58 |
| 640 | 33.9 ms | 34.9 ms | 36.8 ms | 21.4 MiB | 30 |
| 1280 | 67.7 ms | 67.8 ms | 70.6 ms | 43.6 MiB | 15 |
| 2560 | 137 ms | 137 ms | 140 ms | 25.7 MiB | 7 |
| 5120 | 275 ms | 293 ms | 280 ms | 53.9 MiB | 4 |
| 10240 | 550 ms | 552 ms | 556 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.23, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.13 µs | 15.1 µs | 7.29 µs | 9.3 KiB | 140,289 |
| 40 | 8.76 µs | 10.5 µs | 10.1 µs | 8.4 KiB | 114,165 |
| 80 | 14.7 µs | 15.4 µs | 58.1 µs | 16.2 KiB | 67,994 |
| 160 | 26.2 µs | 27.5 µs | 96.0 µs | 31.8 KiB | 38,097 |
| 320 | 48.7 µs | 50.4 µs | 166 µs | 63.1 KiB | 20,554 |
| 640 | 95.3 µs | 98.5 µs | 317 µs | 127.4 KiB | 10,499 |
| 1280 | 467 µs | 479 µs | 1.37 ms | 340.8 KiB | 2,143 |
| 2560 | 825 µs | 841 µs | 1.77 ms | 694.2 KiB | 1,212 |
| 5120 | 1.75 ms | 1.79 ms | 3.71 ms | 1.3 MiB | 570 |
| 10240 | 3.51 ms | 3.58 ms | 5.66 ms | 2.7 MiB | 285 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.80 µs | 5.07 µs | 4.85 µs | 4.5 KiB | 208,351 |
| 40 | 5.17 µs | 5.58 µs | 5.24 µs | 4.5 KiB | 193,248 |
| 80 | 5.84 µs | 6.12 µs | 5.90 µs | 4.5 KiB | 171,165 |
| 160 | 7.39 µs | 7.68 µs | 7.67 µs | 4.5 KiB | 135,296 |
| 320 | 9.79 µs | 10.3 µs | 40.2 µs | 4.5 KiB | 102,106 |
| 640 | 14.5 µs | 15.4 µs | 58.9 µs | 4.5 KiB | 68,800 |
| 1280 | 23.9 µs | 25.0 µs | 91.3 µs | 4.5 KiB | 41,761 |
| 2560 | 41.7 µs | 43.8 µs | 137 µs | 4.5 KiB | 23,988 |
| 5120 | 80.8 µs | 85.1 µs | 269 µs | 4.5 KiB | 12,372 |
| 10240 | 159 µs | 186 µs | 546 µs | 4.5 KiB | 6,303 |

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

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 19.7 µs | 23.9 µs | 20.7 µs | 3.8 KiB | 50,663 |
| 40 | 22.1 µs | 23.5 µs | 22.7 µs | 6.4 KiB | 45,209 |
| 80 | 36.4 µs | 38.9 µs | 37.0 µs | 11.7 KiB | 27,445 |
| 160 | 62.8 µs | 66.6 µs | 257 µs | 22.4 KiB | 15,923 |
| 320 | 110 µs | 116 µs | 411 µs | 45.6 KiB | 9,115 |
| 640 | 193 µs | 206 µs | 654 µs | 93.6 KiB | 5,189 |
| 1280 | 380 µs | 411 µs | 1.29 ms | 172.2 KiB | 2,631 |
| 2560 | 640 µs | 708 µs | 1.61 ms | 360.9 KiB | 1,562 |
| 5120 | 1.36 ms | 1.49 ms | 3.31 ms | 685.3 KiB | 737 |
| 10240 | 2.36 ms | 2.45 ms | 4.43 ms | 1.3 MiB | 424 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.54 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.97 ms | 1.97 ms | 77% |
| `load-exception-registry` | 1 | 534 µs | 534 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 37.8 µs | 1.5% |

**At 10240 entrys** (whole operation: 41.1 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 30.1 ms | 30.1 ms | 73% |
| `load-exception-registry` | 1 | 6.77 ms | 6.77 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.19 ms | 10% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-20T08:50:50.530Z` → `2026-10-20T08:51:56.571Z` (66 s), ci: CI (run 39394260238)
- Machine: Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `29b96aabcbd1bbdbc252335ae1854e9d1d2345e7` on `dependabot/npm_and_yarn/dev-dependencies-0a04ba22e9`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

