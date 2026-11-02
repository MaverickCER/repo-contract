# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.14 ms** per operation compared with a bare-minimum baseline (**306% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.14 ms | 20.5 ms |
| Added latency, relative to baseline | 306% | 335% |
| Added CPU time per operation | 1.86 ms | 20.7 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 879 ops/s | 49 ops/s |

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
| 20 | 16.9 µs | 71.9 µs | 54.9 µs | 324% | 209 µs | $0.00011 – $0.0024 |
| 40 | 26.6 µs | 105 µs | 78.7 µs | 296% | 203 µs | $0.00016 – $0.0023 |
| 80 | 50.6 µs | 197 µs | 147 µs | 290% | 333 µs | $0.00031 – $0.0037 |
| 160 | 98.9 µs | 358 µs | 260 µs | 263% | 467 µs | $0.00054 – $0.0052 |
| 320 | 194 µs | 698 µs | 504 µs | 260% | 783 µs | $0.0011 – $0.0088 |
| 640 | 372 µs | 1.51 ms | 1.14 ms | 306% | 1.86 ms | $0.0024 – $0.021 |
| 1280 | 737 µs | 2.85 ms | 2.11 ms | 286% | 2.68 ms | $0.0044 – $0.030 |
| 2560 | 1.52 ms | 5.62 ms | 4.10 ms | 270% | 4.17 ms | $0.0085 – $0.047 |
| 5120 | 3.05 ms | 11.5 ms | 8.48 ms | 278% | 8.65 ms | $0.018 – $0.097 |
| 10240 | 6.11 ms | 26.6 ms | 20.5 ms | 335% | 20.7 ms | $0.043 – $0.233 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 187 µs | 2.86 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 34.9 µs | 876 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 298 µs | 4.25 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.09 ms | 19.6 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 20.0 ms | 335 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 74.0 µs | 2.67 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 38.6 ms | 651 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 20.2 ms | 328 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 41.2 µs | 2.32 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 6.57 µs | 68.5 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 87.2 µs | 1.42 ms |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 64.3 µs | 76.7 µs | 201 µs | 117.4 KiB | 15,551 |
| 40 | 38.4 µs | 40.1 µs | 102 µs | 97.3 KiB | 26,039 |
| 80 | 45.3 µs | 50.8 µs | 117 µs | 123.7 KiB | 22,077 |
| 160 | 58.3 µs | 62.9 µs | 146 µs | 158.1 KiB | 17,153 |
| 320 | 86.8 µs | 89.6 µs | 219 µs | 239.2 KiB | 11,523 |
| 640 | 187 µs | 246 µs | 546 µs | 524.5 KiB | 5,359 |
| 1280 | 310 µs | 324 µs | 669 µs | 1.0 MiB | 3,230 |
| 2560 | 597 µs | 636 µs | 1.15 ms | 2.1 MiB | 1,675 |
| 5120 | 1.35 ms | 1.41 ms | 2.35 ms | 4.3 MiB | 741 |
| 10240 | 2.86 ms | 3.32 ms | 3.92 ms | 8.6 MiB | 350 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.20, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.01 µs | 7.41 µs | 22.5 µs | 17.0 KiB | 142,679 |
| 40 | 6.33 µs | 7.23 µs | 22.0 µs | 16.3 KiB | 158,072 |
| 80 | 7.90 µs | 8.26 µs | 25.5 µs | 20.5 KiB | 126,551 |
| 160 | 11.3 µs | 11.9 µs | 34.9 µs | 28.6 KiB | 88,747 |
| 320 | 18.6 µs | 19.4 µs | 52.5 µs | 48.2 KiB | 53,785 |
| 640 | 34.9 µs | 38.2 µs | 93.3 µs | 86.6 KiB | 28,665 |
| 1280 | 66.8 µs | 69.3 µs | 176 µs | 167.5 KiB | 14,980 |
| 2560 | 141 µs | 145 µs | 334 µs | 338.6 KiB | 7,082 |
| 5120 | 425 µs | 436 µs | 1.07 ms | 634.3 KiB | 2,356 |
| 10240 | 876 µs | 893 µs | 1.66 ms | 1.3 MiB | 1,141 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.6 µs | 16.4 µs | 14.8 µs | 7.3 KiB | 68,594 |
| 40 | 20.7 µs | 22.6 µs | 56.1 µs | 13.2 KiB | 48,285 |
| 80 | 40.2 µs | 41.7 µs | 111 µs | 25.1 KiB | 24,868 |
| 160 | 76.6 µs | 79.0 µs | 182 µs | 48.9 KiB | 13,060 |
| 320 | 152 µs | 157 µs | 365 µs | 96.4 KiB | 6,599 |
| 640 | 298 µs | 306 µs | 654 µs | 191.5 KiB | 3,355 |
| 1280 | 578 µs | 595 µs | 1.13 ms | 381.6 KiB | 1,730 |
| 2560 | 1.21 ms | 1.48 ms | 2.40 ms | 761.9 KiB | 826 |
| 5120 | 2.78 ms | 3.05 ms | 4.09 ms | 1.5 MiB | 360 |
| 10240 | 4.25 ms | 4.33 ms | 5.93 ms | 3.0 MiB | 235 |

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
| 20 | 48.0 µs | 54.7 µs | 196 µs | 44.3 KiB | 20,848 |
| 40 | 71.4 µs | 93.3 µs | 186 µs | 82.8 KiB | 14,011 |
| 80 | 138 µs | 161 µs | 347 µs | 161.3 KiB | 7,248 |
| 160 | 260 µs | 283 µs | 604 µs | 318.6 KiB | 3,846 |
| 320 | 492 µs | 527 µs | 1.01 ms | 632.2 KiB | 2,031 |
| 640 | 1.09 ms | 1.17 ms | 2.13 ms | 1.2 MiB | 914 |
| 1280 | 2.06 ms | 2.11 ms | 3.17 ms | 2.5 MiB | 486 |
| 2560 | 4.04 ms | 4.15 ms | 5.33 ms | 4.9 MiB | 247 |
| 5120 | 8.01 ms | 8.14 ms | 9.68 ms | 9.8 MiB | 125 |
| 10240 | 19.6 ms | 19.7 ms | 21.9 ms | 19.7 MiB | 51 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.19 ms | 1.51 ms | 3.02 ms | 652.5 KiB | 839 |
| 40 | 1.41 ms | 2.31 ms | 2.48 ms | 1.3 MiB | 712 |
| 80 | 2.65 ms | 3.69 ms | 3.76 ms | 2.6 MiB | 377 |
| 160 | 5.20 ms | 6.81 ms | 6.39 ms | 5.2 MiB | 192 |
| 320 | 10.2 ms | 11.2 ms | 11.9 ms | 10.6 MiB | 98 |
| 640 | 20.0 ms | 20.5 ms | 21.6 ms | 21.4 MiB | 50 |
| 1280 | 39.9 ms | 42.3 ms | 41.9 ms | 43.7 MiB | 25 |
| 2560 | 80.9 ms | 83.9 ms | 82.9 ms | 25.9 MiB | 12 |
| 5120 | 166 ms | 192 ms | 175 ms | 54.2 MiB | 6 |
| 10240 | 335 ms | 339 ms | 344 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.24, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.26 µs | 5.27 µs | 4.39 µs | 9.6 KiB | 234,670 |
| 40 | 5.57 µs | 7.09 µs | 18.0 µs | 14.0 KiB | 179,404 |
| 80 | 10.2 µs | 12.3 µs | 29.4 µs | 27.3 KiB | 97,561 |
| 160 | 19.2 µs | 25.5 µs | 51.6 µs | 53.9 KiB | 52,114 |
| 320 | 36.9 µs | 43.5 µs | 96.8 µs | 107.0 KiB | 27,076 |
| 640 | 74.0 µs | 87.3 µs | 192 µs | 213.3 KiB | 13,510 |
| 1280 | 298 µs | 308 µs | 670 µs | 515.9 KiB | 3,360 |
| 2560 | 591 µs | 620 µs | 1.22 ms | 1.0 MiB | 1,691 |
| 5120 | 1.28 ms | 1.39 ms | 2.47 ms | 2.1 MiB | 781 |
| 10240 | 2.67 ms | 3.16 ms | 4.48 ms | 4.2 MiB | 375 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.44 ms | 1.47 ms | 2.82 ms | 1.2 MiB | 693 |
| 40 | 2.65 ms | 2.70 ms | 4.05 ms | 2.5 MiB | 377 |
| 80 | 5.05 ms | 5.11 ms | 6.50 ms | 5.0 MiB | 198 |
| 160 | 9.85 ms | 9.94 ms | 11.4 ms | 10.0 MiB | 101 |
| 320 | 19.5 ms | 25.1 ms | 21.3 ms | 20.0 MiB | 51 |
| 640 | 38.6 ms | 38.8 ms | 40.5 ms | 40.1 MiB | 26 |
| 1280 | 83.5 ms | 84.2 ms | 85.8 ms | 16.1 MiB | 12 |
| 2560 | 166 ms | 171 ms | 169 ms | 32.3 MiB | 6 |
| 5120 | 326 ms | 337 ms | 328 ms | 708.6 KiB | 3 |
| 10240 | 651 ms | 651 ms | 653 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 743 µs | 770 µs | 1.43 ms | 643.3 KiB | 1,346 |
| 40 | 1.48 ms | 1.56 ms | 2.89 ms | 1.3 MiB | 678 |
| 80 | 2.67 ms | 2.72 ms | 4.09 ms | 2.5 MiB | 374 |
| 160 | 5.13 ms | 5.22 ms | 6.56 ms | 5.2 MiB | 195 |
| 320 | 10.2 ms | 10.2 ms | 11.7 ms | 10.6 MiB | 98 |
| 640 | 20.2 ms | 20.4 ms | 21.9 ms | 21.4 MiB | 49 |
| 1280 | 40.3 ms | 40.6 ms | 42.1 ms | 43.6 MiB | 25 |
| 2560 | 81.7 ms | 82.6 ms | 83.7 ms | 25.7 MiB | 12 |
| 5120 | 165 ms | 169 ms | 169 ms | 53.9 MiB | 6 |
| 10240 | 328 ms | 331 ms | 332 ms | 46.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.39, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.12 µs | 7.43 µs | 3.24 µs | 9.3 KiB | 320,812 |
| 40 | 3.35 µs | 4.07 µs | 11.4 µs | 8.4 KiB | 298,942 |
| 80 | 5.78 µs | 5.98 µs | 17.0 µs | 16.2 KiB | 172,900 |
| 160 | 10.7 µs | 11.2 µs | 29.6 µs | 31.8 KiB | 93,132 |
| 320 | 20.5 µs | 21.4 µs | 54.2 µs | 63.1 KiB | 48,705 |
| 640 | 41.2 µs | 43.2 µs | 104 µs | 127.8 KiB | 24,289 |
| 1280 | 237 µs | 244 µs | 593 µs | 352.8 KiB | 4,223 |
| 2560 | 494 µs | 505 µs | 1.06 ms | 694.2 KiB | 2,024 |
| 5120 | 1.11 ms | 1.14 ms | 2.28 ms | 1.3 MiB | 900 |
| 10240 | 2.32 ms | 2.38 ms | 3.62 ms | 2.7 MiB | 432 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.85, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.17 µs | 2.27 µs | 8.82 µs | 4.5 KiB | 460,491 |
| 40 | 2.29 µs | 2.39 µs | 8.89 µs | 4.5 KiB | 436,665 |
| 80 | 2.56 µs | 2.72 µs | 9.60 µs | 4.5 KiB | 390,888 |
| 160 | 3.22 µs | 3.72 µs | 10.7 µs | 4.5 KiB | 310,339 |
| 320 | 4.37 µs | 4.65 µs | 13.6 µs | 4.5 KiB | 228,921 |
| 640 | 6.57 µs | 6.91 µs | 19.8 µs | 4.5 KiB | 152,231 |
| 1280 | 10.9 µs | 11.4 µs | 30.9 µs | 4.5 KiB | 91,864 |
| 2560 | 19.3 µs | 20.4 µs | 52.6 µs | 4.5 KiB | 51,780 |
| 5120 | 35.3 µs | 51.5 µs | 91.3 µs | 4.5 KiB | 28,357 |
| 10240 | 68.5 µs | 73.5 µs | 186 µs | 4.5 KiB | 14,605 |

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
| 20 | 8.26 µs | 10.9 µs | 8.50 µs | 3.7 KiB | 121,114 |
| 40 | 10.7 µs | 12.4 µs | 10.9 µs | 6.3 KiB | 93,112 |
| 80 | 17.0 µs | 18.3 µs | 68.0 µs | 11.6 KiB | 58,916 |
| 160 | 28.7 µs | 31.9 µs | 106 µs | 22.3 KiB | 34,849 |
| 320 | 48.5 µs | 57.6 µs | 157 µs | 44.7 KiB | 20,632 |
| 640 | 87.2 µs | 101 µs | 247 µs | 90.3 KiB | 11,468 |
| 1280 | 169 µs | 192 µs | 448 µs | 186.4 KiB | 5,908 |
| 2560 | 315 µs | 357 µs | 730 µs | 382.2 KiB | 3,171 |
| 5120 | 722 µs | 767 µs | 1.35 ms | 683.1 KiB | 1,386 |
| 10240 | 1.42 ms | 1.51 ms | 2.67 ms | 1.3 MiB | 707 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.51 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.09 ms | 1.09 ms | 73% |
| `load-exception-registry` | 1 | 298 µs | 298 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 117 µs | 7.7% |

**At 10240 entrys** (whole operation: 26.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 19.6 ms | 19.6 ms | 74% |
| `load-exception-registry` | 1 | 4.25 ms | 4.25 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.76 ms | 10% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T13:19:25.436Z` → `2026-11-02T13:20:09.825Z` (44 s), ci: CI (run 41449961951)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `362be6b4a56d04cba3dc736c412a9bf56bcb6ee3` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

