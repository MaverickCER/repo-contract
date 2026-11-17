# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.83 ms** per operation compared with a bare-minimum baseline (**251% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.06). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.83 ms | 38.0 ms |
| Added latency, relative to baseline | 251% | 413% |
| Added CPU time per operation | 1.83 ms | 38.6 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 548 ops/s | 26 ops/s |

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
| 20 | 44.2 µs | 211 µs | 163 µs | 369% | 179 µs | $0.00034 – $0.002 |
| 40 | 70.5 µs | 312 µs | 243 µs | 344% | 258 µs | $0.00051 – $0.0029 |
| 80 | 122 µs | 516 µs | 392 µs | 321% | 1.81 ms | $0.00082 – $0.020 |
| 160 | 232 µs | 785 µs | 551 µs | 237% | 1.98 ms | $0.0011 – $0.022 |
| 320 | 452 µs | 1.36 ms | 894 µs | 198% | 921 µs | $0.0019 – $0.010 |
| 640 | 727 µs | 2.55 ms | 1.83 ms | 251% | 1.83 ms | $0.0038 – $0.021 |
| 1280 | 1.23 ms | 4.88 ms | 3.63 ms | 295% | 3.65 ms | $0.0076 – $0.041 |
| 2560 | 2.29 ms | 9.57 ms | 7.27 ms | 318% | 7.28 ms | $0.015 – $0.082 |
| 5120 | 4.58 ms | 21.7 ms | 17.1 ms | 373% | 17.6 ms | $0.036 – $0.198 |
| 10240 | 9.20 ms | 47.2 ms | 38.0 ms | 413% | 38.6 ms | $0.079 – $0.434 |

**How the total grows:** O(n) (linear), exponent 1.06 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 504 µs | 4.30 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 57.1 µs | 1.34 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 537 µs | 7.19 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.91 ms | 31.9 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 36.8 ms | 576 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 153 µs | 4.66 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 70.3 ms | 1.09 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 35.3 ms | 573 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 85.9 µs | 3.80 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 13.2 µs | 165 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 171 µs | 2.25 ms |

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

**Measured: O(n)** (exponent 0.82, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 111 µs | 136 µs | 401 µs | 115.6 KiB | 9,008 |
| 40 | 82.1 µs | 139 µs | 326 µs | 99.8 KiB | 12,179 |
| 80 | 77.8 µs | 86.1 µs | 236 µs | 120.8 KiB | 12,858 |
| 160 | 104 µs | 107 µs | 311 µs | 159.3 KiB | 9,575 |
| 320 | 153 µs | 158 µs | 438 µs | 237.4 KiB | 6,528 |
| 640 | 504 µs | 781 µs | 1.94 ms | 670.2 KiB | 1,983 |
| 1280 | 539 µs | 556 µs | 1.24 ms | 1.0 MiB | 1,854 |
| 2560 | 1.08 ms | 1.11 ms | 2.56 ms | 2.1 MiB | 924 |
| 5120 | 2.18 ms | 2.24 ms | 3.56 ms | 4.3 MiB | 459 |
| 10240 | 4.30 ms | 4.54 ms | 4.69 ms | 8.6 MiB | 233 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.2 µs | 11.7 µs | 42.8 µs | 17.0 KiB | 89,301 |
| 40 | 11.2 µs | 12.0 µs | 42.4 µs | 16.3 KiB | 89,592 |
| 80 | 14.1 µs | 14.9 µs | 51.2 µs | 20.5 KiB | 70,733 |
| 160 | 19.8 µs | 21.3 µs | 68.1 µs | 28.6 KiB | 50,420 |
| 320 | 31.6 µs | 32.8 µs | 104 µs | 48.2 KiB | 31,596 |
| 640 | 57.1 µs | 59.5 µs | 178 µs | 86.8 KiB | 17,502 |
| 1280 | 114 µs | 137 µs | 326 µs | 166.1 KiB | 8,792 |
| 2560 | 230 µs | 257 µs | 627 µs | 329.7 KiB | 4,343 |
| 5120 | 600 µs | 616 µs | 1.48 ms | 634.3 KiB | 1,668 |
| 10240 | 1.34 ms | 1.36 ms | 3.46 ms | 1.3 MiB | 749 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 23.9 µs | 25.8 µs | 96.2 µs | 7.3 KiB | 41,859 |
| 40 | 42.0 µs | 47.1 µs | 147 µs | 13.2 KiB | 23,810 |
| 80 | 74.6 µs | 76.5 µs | 220 µs | 25.1 KiB | 13,404 |
| 160 | 149 µs | 152 µs | 442 µs | 48.9 KiB | 6,730 |
| 320 | 286 µs | 313 µs | 769 µs | 96.5 KiB | 3,500 |
| 640 | 537 µs | 545 µs | 1.27 ms | 191.6 KiB | 1,864 |
| 1280 | 1.07 ms | 1.09 ms | 2.60 ms | 381.9 KiB | 933 |
| 2560 | 1.96 ms | 2.33 ms | 3.61 ms | 761.9 KiB | 510 |
| 5120 | 4.41 ms | 4.53 ms | 6.20 ms | 1.5 MiB | 227 |
| 10240 | 7.19 ms | 7.32 ms | 9.35 ms | 3.0 MiB | 139 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 91.8 µs | 110 µs | 337 µs | 44.5 KiB | 10,889 |
| 40 | 147 µs | 163 µs | 439 µs | 83.3 KiB | 6,800 |
| 80 | 276 µs | 302 µs | 766 µs | 161.9 KiB | 3,627 |
| 160 | 510 µs | 537 µs | 1.24 ms | 319.5 KiB | 1,960 |
| 320 | 1.01 ms | 1.11 ms | 2.47 ms | 634.8 KiB | 986 |
| 640 | 1.91 ms | 1.99 ms | 3.39 ms | 1.2 MiB | 523 |
| 1280 | 3.54 ms | 3.65 ms | 5.13 ms | 2.5 MiB | 282 |
| 2560 | 6.93 ms | 7.07 ms | 8.65 ms | 4.9 MiB | 144 |
| 5120 | 13.9 ms | 18.5 ms | 16.0 ms | 9.8 MiB | 72 |
| 10240 | 31.9 ms | 32.4 ms | 34.5 ms | 19.7 MiB | 31 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.02 ms | 2.27 ms | 4.27 ms | 652.5 KiB | 495 |
| 40 | 2.47 ms | 3.69 ms | 3.96 ms | 1.3 MiB | 404 |
| 80 | 4.67 ms | 6.06 ms | 6.17 ms | 2.6 MiB | 214 |
| 160 | 9.20 ms | 11.2 ms | 10.7 ms | 5.3 MiB | 109 |
| 320 | 17.9 ms | 19.8 ms | 19.8 ms | 10.6 MiB | 56 |
| 640 | 36.8 ms | 37.9 ms | 41.9 ms | 21.5 MiB | 27 |
| 1280 | 71.5 ms | 73.0 ms | 73.9 ms | 43.7 MiB | 14 |
| 2560 | 143 ms | 146 ms | 146 ms | 25.9 MiB | 7 |
| 5120 | 289 ms | 291 ms | 300 ms | 54.2 MiB | 3 |
| 10240 | 576 ms | 577 ms | 588 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.19, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.29 µs | 10.5 µs | 8.50 µs | 9.6 KiB | 120,591 |
| 40 | 11.6 µs | 12.4 µs | 41.5 µs | 14.0 KiB | 85,985 |
| 80 | 25.1 µs | 27.7 µs | 98.5 µs | 27.3 KiB | 39,878 |
| 160 | 40.3 µs | 45.6 µs | 123 µs | 53.9 KiB | 24,836 |
| 320 | 76.6 µs | 79.7 µs | 225 µs | 107.0 KiB | 13,062 |
| 640 | 153 µs | 184 µs | 453 µs | 213.3 KiB | 6,524 |
| 1280 | 550 µs | 597 µs | 1.29 ms | 516.0 KiB | 1,818 |
| 2560 | 1.11 ms | 1.23 ms | 2.62 ms | 1.0 MiB | 899 |
| 5120 | 2.22 ms | 2.41 ms | 3.81 ms | 2.1 MiB | 450 |
| 10240 | 4.66 ms | 4.81 ms | 6.82 ms | 4.2 MiB | 214 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.54 ms | 2.64 ms | 4.43 ms | 1.2 MiB | 393 |
| 40 | 4.68 ms | 4.75 ms | 6.58 ms | 2.5 MiB | 214 |
| 80 | 8.97 ms | 11.1 ms | 10.9 ms | 5.0 MiB | 111 |
| 160 | 17.6 ms | 18.1 ms | 19.6 ms | 10.0 MiB | 57 |
| 320 | 34.7 ms | 34.8 ms | 36.8 ms | 20.0 MiB | 29 |
| 640 | 70.3 ms | 70.7 ms | 72.9 ms | 40.1 MiB | 14 |
| 1280 | 140 ms | 145 ms | 143 ms | 16.1 MiB | 7 |
| 2560 | 273 ms | 277 ms | 275 ms | 32.3 MiB | 4 |
| 5120 | 547 ms | 547 ms | 549 ms | 707.4 KiB | 2 |
| 10240 | 1.09 s | 1.09 s | 1.09 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.45 ms | 1.53 ms | 3.38 ms | 645.7 KiB | 689 |
| 40 | 2.55 ms | 2.65 ms | 4.48 ms | 1.3 MiB | 392 |
| 80 | 4.70 ms | 4.77 ms | 6.67 ms | 2.5 MiB | 213 |
| 160 | 9.05 ms | 9.16 ms | 11.0 ms | 5.2 MiB | 110 |
| 320 | 17.8 ms | 18.3 ms | 19.8 ms | 10.6 MiB | 56 |
| 640 | 35.3 ms | 35.3 ms | 37.3 ms | 21.4 MiB | 28 |
| 1280 | 70.6 ms | 70.8 ms | 73.1 ms | 43.6 MiB | 14 |
| 2560 | 142 ms | 142 ms | 145 ms | 25.7 MiB | 7 |
| 5120 | 285 ms | 286 ms | 289 ms | 53.9 MiB | 4 |
| 10240 | 573 ms | 580 ms | 578 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.29, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.94 µs | 13.1 µs | 6.09 µs | 9.3 KiB | 168,216 |
| 40 | 7.62 µs | 9.37 µs | 29.5 µs | 8.4 KiB | 131,156 |
| 80 | 12.5 µs | 12.8 µs | 42.3 µs | 16.2 KiB | 80,135 |
| 160 | 22.9 µs | 23.8 µs | 74.5 µs | 31.8 KiB | 43,677 |
| 320 | 43.3 µs | 49.0 µs | 131 µs | 63.1 KiB | 23,089 |
| 640 | 85.9 µs | 87.2 µs | 254 µs | 127.7 KiB | 11,647 |
| 1280 | 460 µs | 470 µs | 1.22 ms | 340.8 KiB | 2,173 |
| 2560 | 848 µs | 900 µs | 1.65 ms | 694.2 KiB | 1,180 |
| 5120 | 1.85 ms | 1.88 ms | 3.49 ms | 1.3 MiB | 542 |
| 10240 | 3.80 ms | 4.55 ms | 5.59 ms | 2.7 MiB | 263 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.90, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.46 µs | 4.65 µs | 6.76 µs | 4.5 KiB | 224,217 |
| 40 | 4.80 µs | 5.15 µs | 6.22 µs | 4.5 KiB | 208,212 |
| 80 | 5.65 µs | 5.89 µs | 12.0 µs | 4.5 KiB | 177,125 |
| 160 | 7.19 µs | 7.55 µs | 15.0 µs | 4.5 KiB | 139,102 |
| 320 | 10.2 µs | 10.5 µs | 26.9 µs | 4.5 KiB | 98,413 |
| 640 | 13.2 µs | 16.2 µs | 44.6 µs | 4.5 KiB | 75,852 |
| 1280 | 21.9 µs | 22.4 µs | 70.0 µs | 4.5 KiB | 45,703 |
| 2560 | 38.9 µs | 39.4 µs | 118 µs | 4.5 KiB | 25,686 |
| 5120 | 73.3 µs | 82.8 µs | 218 µs | 4.5 KiB | 13,648 |
| 10240 | 165 µs | 177 µs | 498 µs | 4.5 KiB | 6,043 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.6 µs | 15.3 µs | 12.8 µs | 3.6 KiB | 79,469 |
| 40 | 18.4 µs | 20.0 µs | 18.7 µs | 6.3 KiB | 54,270 |
| 80 | 31.3 µs | 34.7 µs | 99.5 µs | 11.7 KiB | 31,929 |
| 160 | 51.4 µs | 62.1 µs | 188 µs | 22.4 KiB | 19,462 |
| 320 | 88.4 µs | 103 µs | 277 µs | 45.0 KiB | 11,309 |
| 640 | 171 µs | 198 µs | 546 µs | 93.6 KiB | 5,844 |
| 1280 | 301 µs | 328 µs | 805 µs | 191.5 KiB | 3,327 |
| 2560 | 578 µs | 626 µs | 1.34 ms | 360.9 KiB | 1,729 |
| 5120 | 1.27 ms | 1.39 ms | 2.88 ms | 685.3 KiB | 789 |
| 10240 | 2.25 ms | 2.37 ms | 3.93 ms | 1.3 MiB | 445 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.55 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.91 ms | 1.91 ms | 75% |
| `load-exception-registry` | 1 | 537 µs | 537 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 99.4 µs | 3.9% |

**At 10240 entrys** (whole operation: 47.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 31.9 ms | 31.9 ms | 68% |
| `load-exception-registry` | 1 | 7.19 ms | 7.19 ms | 15% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 8.05 ms | 17% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-17T07:27:28.262Z` → `2026-11-17T07:28:29.509Z` (61 s), ci: CI (run 44034203264)
- Machine: AMD EPYC 7763 64-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `07770a727be6c021f3213310ad0835d634c1472e` on `chore/bump-internal-package-contract-v0.21.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

