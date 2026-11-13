# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.31 ms** per operation compared with a bare-minimum baseline (**235% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.06). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.31 ms | 26.5 ms |
| Added latency, relative to baseline | 235% | 350% |
| Added CPU time per operation | 1.31 ms | 26.7 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 762 ops/s | 38 ops/s |

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
| 20 | 32.8 µs | 145 µs | 112 µs | 341% | 113 µs | $0.00023 – $0.0013 |
| 40 | 51.2 µs | 222 µs | 171 µs | 333% | 172 µs | $0.00036 – $0.0019 |
| 80 | 91.3 µs | 381 µs | 289 µs | 316% | 1.48 ms | $0.0006 – $0.017 |
| 160 | 173 µs | 585 µs | 409 µs | 236% | 1.62 ms | $0.00085 – $0.018 |
| 320 | 338 µs | 981 µs | 641 µs | 190% | 1.51 ms | $0.0013 – $0.017 |
| 640 | 559 µs | 1.87 ms | 1.31 ms | 235% | 1.31 ms | $0.0027 – $0.015 |
| 1280 | 962 µs | 3.56 ms | 2.59 ms | 269% | 2.60 ms | $0.0054 – $0.029 |
| 2560 | 1.81 ms | 6.98 ms | 5.16 ms | 286% | 5.13 ms | $0.011 – $0.058 |
| 5120 | 3.68 ms | 16.5 ms | 12.8 ms | 350% | 13.0 ms | $0.027 – $0.146 |
| 10240 | 7.57 ms | 33.9 ms | 26.5 ms | 350% | 26.7 ms | $0.055 – $0.300 |

**How the total grows:** O(n) (linear), exponent 1.06 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 242 µs | 3.58 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 43.5 µs | 1.12 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 420 µs | 5.71 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.39 ms | 24.4 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 28.3 ms | 464 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 101 µs | 3.53 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 55.7 ms | 876 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 28.2 ms | 460 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 57.1 µs | 2.99 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 9.43 µs | 112 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 118 µs | 1.84 ms |

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

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 79.9 µs | 100 µs | 260 µs | 117.8 KiB | 12,523 |
| 40 | 49.7 µs | 54.0 µs | 144 µs | 97.7 KiB | 20,130 |
| 80 | 60.8 µs | 64.5 µs | 175 µs | 122.1 KiB | 16,439 |
| 160 | 80.6 µs | 84.2 µs | 218 µs | 158.7 KiB | 12,411 |
| 320 | 122 µs | 128 µs | 332 µs | 237.1 KiB | 8,219 |
| 640 | 242 µs | 307 µs | 669 µs | 524.5 KiB | 4,124 |
| 1280 | 442 µs | 467 µs | 1.07 ms | 1.0 MiB | 2,262 |
| 2560 | 783 µs | 801 µs | 1.41 ms | 2.1 MiB | 1,277 |
| 5120 | 1.77 ms | 1.81 ms | 3.01 ms | 4.3 MiB | 565 |
| 10240 | 3.58 ms | 3.70 ms | 4.62 ms | 8.6 MiB | 280 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.19 µs | 8.58 µs | 31.5 µs | 17.0 KiB | 122,148 |
| 40 | 7.97 µs | 8.45 µs | 25.8 µs | 16.3 KiB | 125,487 |
| 80 | 10.7 µs | 12.1 µs | 36.7 µs | 20.5 KiB | 93,123 |
| 160 | 15.3 µs | 16.2 µs | 50.3 µs | 28.6 KiB | 65,183 |
| 320 | 25.0 µs | 26.5 µs | 76.0 µs | 48.1 KiB | 39,928 |
| 640 | 43.5 µs | 45.3 µs | 125 µs | 86.7 KiB | 23,006 |
| 1280 | 85.1 µs | 91.9 µs | 244 µs | 171.2 KiB | 11,746 |
| 2560 | 171 µs | 179 µs | 441 µs | 343.9 KiB | 5,850 |
| 5120 | 492 µs | 503 µs | 1.23 ms | 634.3 KiB | 2,034 |
| 10240 | 1.12 ms | 1.16 ms | 2.89 ms | 1.3 MiB | 892 |

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
| 20 | 17.7 µs | 19.2 µs | 70.8 µs | 7.3 KiB | 56,505 |
| 40 | 29.0 µs | 29.8 µs | 84.6 µs | 13.2 KiB | 34,453 |
| 80 | 56.0 µs | 57.7 µs | 158 µs | 25.1 KiB | 17,856 |
| 160 | 106 µs | 107 µs | 259 µs | 48.9 KiB | 9,469 |
| 320 | 210 µs | 213 µs | 515 µs | 96.5 KiB | 4,764 |
| 640 | 420 µs | 429 µs | 1.03 ms | 191.6 KiB | 2,380 |
| 1280 | 765 µs | 773 µs | 1.40 ms | 381.6 KiB | 1,307 |
| 2560 | 1.55 ms | 1.94 ms | 2.95 ms | 761.9 KiB | 645 |
| 5120 | 3.58 ms | 3.71 ms | 5.07 ms | 1.5 MiB | 280 |
| 10240 | 5.71 ms | 5.76 ms | 7.51 ms | 3.0 MiB | 175 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 57.1 µs | 72.5 µs | 195 µs | 44.0 KiB | 17,516 |
| 40 | 97.0 µs | 107 µs | 272 µs | 83.0 KiB | 10,311 |
| 80 | 187 µs | 201 µs | 493 µs | 161.5 KiB | 5,355 |
| 160 | 341 µs | 376 µs | 752 µs | 318.6 KiB | 2,932 |
| 320 | 650 µs | 692 µs | 1.26 ms | 632.2 KiB | 1,538 |
| 640 | 1.39 ms | 1.46 ms | 2.67 ms | 1.2 MiB | 719 |
| 1280 | 2.57 ms | 2.66 ms | 3.87 ms | 2.5 MiB | 389 |
| 2560 | 5.04 ms | 5.13 ms | 6.49 ms | 4.9 MiB | 198 |
| 5120 | 10.2 ms | 10.6 ms | 11.9 ms | 9.8 MiB | 98 |
| 10240 | 24.4 ms | 29.3 ms | 26.7 ms | 19.7 MiB | 41 |

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
| 20 | 1.50 ms | 1.71 ms | 3.33 ms | 652.5 KiB | 666 |
| 40 | 1.96 ms | 2.85 ms | 3.21 ms | 1.3 MiB | 511 |
| 80 | 3.73 ms | 4.70 ms | 4.99 ms | 2.6 MiB | 268 |
| 160 | 7.33 ms | 9.33 ms | 8.64 ms | 5.3 MiB | 136 |
| 320 | 14.4 ms | 15.5 ms | 15.8 ms | 10.6 MiB | 70 |
| 640 | 28.3 ms | 31.5 ms | 29.7 ms | 21.4 MiB | 35 |
| 1280 | 56.6 ms | 57.1 ms | 58.6 ms | 43.7 MiB | 18 |
| 2560 | 114 ms | 115 ms | 116 ms | 25.9 MiB | 9 |
| 5120 | 229 ms | 232 ms | 232 ms | 54.2 MiB | 4 |
| 10240 | 464 ms | 488 ms | 474 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.24, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.38 µs | 6.41 µs | 5.47 µs | 7.4 KiB | 185,701 |
| 40 | 7.89 µs | 8.39 µs | 26.7 µs | 14.0 KiB | 126,678 |
| 80 | 14.3 µs | 16.7 µs | 44.9 µs | 27.3 KiB | 69,763 |
| 160 | 27.1 µs | 31.6 µs | 79.2 µs | 53.9 KiB | 36,869 |
| 320 | 52.8 µs | 60.1 µs | 150 µs | 107.0 KiB | 18,923 |
| 640 | 101 µs | 117 µs | 282 µs | 213.3 KiB | 9,862 |
| 1280 | 389 µs | 404 µs | 829 µs | 515.9 KiB | 2,570 |
| 2560 | 778 µs | 823 µs | 1.44 ms | 1.0 MiB | 1,286 |
| 5120 | 1.73 ms | 1.93 ms | 3.14 ms | 2.1 MiB | 578 |
| 10240 | 3.53 ms | 3.80 ms | 5.34 ms | 4.2 MiB | 283 |

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
| 20 | 2.03 ms | 2.07 ms | 3.66 ms | 1.2 MiB | 493 |
| 40 | 3.73 ms | 3.78 ms | 5.36 ms | 2.5 MiB | 268 |
| 80 | 7.20 ms | 8.51 ms | 8.84 ms | 5.0 MiB | 139 |
| 160 | 14.1 ms | 14.7 ms | 15.8 ms | 10.0 MiB | 71 |
| 320 | 28.6 ms | 40.8 ms | 32.3 ms | 20.0 MiB | 35 |
| 640 | 55.7 ms | 57.3 ms | 57.7 ms | 40.1 MiB | 18 |
| 1280 | 112 ms | 118 ms | 114 ms | 16.1 MiB | 9 |
| 2560 | 219 ms | 219 ms | 221 ms | 32.3 MiB | 5 |
| 5120 | 437 ms | 438 ms | 440 ms | 707.4 KiB | 2 |
| 10240 | 876 ms | 880 ms | 879 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.14 ms | 1.18 ms | 2.78 ms | 645.6 KiB | 876 |
| 40 | 2.01 ms | 2.03 ms | 3.66 ms | 1.3 MiB | 498 |
| 80 | 3.74 ms | 3.85 ms | 5.44 ms | 2.5 MiB | 267 |
| 160 | 7.21 ms | 7.31 ms | 9.03 ms | 5.2 MiB | 139 |
| 320 | 14.3 ms | 14.5 ms | 16.4 ms | 10.6 MiB | 70 |
| 640 | 28.2 ms | 28.7 ms | 30.4 ms | 21.4 MiB | 35 |
| 1280 | 56.5 ms | 56.5 ms | 58.7 ms | 43.6 MiB | 18 |
| 2560 | 114 ms | 115 ms | 117 ms | 25.7 MiB | 9 |
| 5120 | 230 ms | 230 ms | 233 ms | 53.9 MiB | 4 |
| 10240 | 460 ms | 461 ms | 464 ms | 46.2 MiB | 2 |

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
| 20 | 4.13 µs | 9.66 µs | 4.23 µs | 9.3 KiB | 242,420 |
| 40 | 4.99 µs | 5.70 µs | 18.2 µs | 8.4 KiB | 200,295 |
| 80 | 8.24 µs | 9.01 µs | 26.5 µs | 16.2 KiB | 121,415 |
| 160 | 15.5 µs | 16.1 µs | 47.3 µs | 31.8 KiB | 64,545 |
| 320 | 29.5 µs | 34.7 µs | 84.2 µs | 63.1 KiB | 33,861 |
| 640 | 57.1 µs | 59.0 µs | 157 µs | 127.8 KiB | 17,509 |
| 1280 | 322 µs | 328 µs | 752 µs | 352.8 KiB | 3,110 |
| 2560 | 651 µs | 667 µs | 1.32 ms | 694.2 KiB | 1,537 |
| 5120 | 1.46 ms | 1.50 ms | 2.83 ms | 1.3 MiB | 687 |
| 10240 | 2.99 ms | 3.06 ms | 4.51 ms | 2.7 MiB | 335 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.89, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.17 µs | 3.34 µs | 11.9 µs | 4.5 KiB | 315,476 |
| 40 | 3.28 µs | 3.45 µs | 13.3 µs | 4.5 KiB | 304,499 |
| 80 | 3.67 µs | 3.89 µs | 14.3 µs | 4.5 KiB | 272,299 |
| 160 | 4.51 µs | 4.74 µs | 17.3 µs | 4.5 KiB | 221,574 |
| 320 | 6.24 µs | 7.68 µs | 21.6 µs | 4.5 KiB | 160,185 |
| 640 | 9.43 µs | 10.0 µs | 30.5 µs | 4.5 KiB | 106,070 |
| 1280 | 16.4 µs | 17.1 µs | 49.0 µs | 4.5 KiB | 61,158 |
| 2560 | 29.3 µs | 31.0 µs | 79.4 µs | 4.5 KiB | 34,161 |
| 5120 | 56.1 µs | 57.3 µs | 150 µs | 4.5 KiB | 17,841 |
| 10240 | 112 µs | 115 µs | 310 µs | 4.5 KiB | 8,915 |

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
| 20 | 8.85 µs | 10.2 µs | 9.05 µs | 3.6 KiB | 112,963 |
| 40 | 13.5 µs | 14.6 µs | 13.7 µs | 6.3 KiB | 73,830 |
| 80 | 22.6 µs | 25.1 µs | 92.1 µs | 11.6 KiB | 44,168 |
| 160 | 37.0 µs | 42.5 µs | 128 µs | 22.3 KiB | 27,062 |
| 320 | 63.9 µs | 70.3 µs | 191 µs | 44.7 KiB | 15,650 |
| 640 | 118 µs | 123 µs | 329 µs | 91.0 KiB | 8,471 |
| 1280 | 234 µs | 244 µs | 656 µs | 191.5 KiB | 4,268 |
| 2560 | 459 µs | 521 µs | 1.15 ms | 360.9 KiB | 2,179 |
| 5120 | 866 µs | 898 µs | 1.58 ms | 643.1 KiB | 1,155 |
| 10240 | 1.84 ms | 1.93 ms | 3.33 ms | 1.3 MiB | 542 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.87 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.39 ms | 1.39 ms | 74% |
| `load-exception-registry` | 1 | 420 µs | 420 µs | 22% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 61.7 µs | 3.3% |

**At 10240 entrys** (whole operation: 33.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 24.4 ms | 24.4 ms | 72% |
| `load-exception-registry` | 1 | 5.71 ms | 5.71 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.75 ms | 11% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-13T00:23:23.011Z` → `2026-11-13T00:24:14.577Z` (52 s), ci: CI (run 43333798477)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `364060fc11152ee4034737a0bc82ec8f721c5c53` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

