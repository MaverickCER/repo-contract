# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.39 ms** per operation compared with a bare-minimum baseline (**275% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.39 ms | 25.9 ms |
| Added latency, relative to baseline | 275% | 329% |
| Added CPU time per operation | 2.04 ms | 25.5 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 720 ops/s | 39 ops/s |

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
| 20 | 20.8 µs | 94.3 µs | 73.6 µs | 354% | 255 µs | $0.00015 – $0.0029 |
| 40 | 35.8 µs | 132 µs | 96.3 µs | 269% | 196 µs | $0.0002 – $0.0022 |
| 80 | 68.5 µs | 264 µs | 195 µs | 285% | 475 µs | $0.00041 – $0.0053 |
| 160 | 133 µs | 490 µs | 358 µs | 270% | 759 µs | $0.00075 – $0.0085 |
| 320 | 266 µs | 893 µs | 627 µs | 236% | 855 µs | $0.0013 – $0.0096 |
| 640 | 506 µs | 1.89 ms | 1.39 ms | 275% | 2.04 ms | $0.0029 – $0.023 |
| 1280 | 1.02 ms | 3.64 ms | 2.62 ms | 256% | 2.67 ms | $0.0055 – $0.030 |
| 2560 | 1.95 ms | 7.22 ms | 5.28 ms | 271% | 5.29 ms | $0.011 – $0.059 |
| 5120 | 3.89 ms | 14.4 ms | 10.5 ms | 269% | 10.7 ms | $0.022 – $0.120 |
| 10240 | 7.87 ms | 33.8 ms | 25.9 ms | 329% | 25.5 ms | $0.054 – $0.287 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 234 µs | 3.47 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 46.3 µs | 1.12 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 393 µs | 5.69 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.41 ms | 24.5 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 28.2 ms | 462 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 103 µs | 3.40 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 55.7 ms | 875 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 28.3 ms | 463 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 57.8 µs | 2.81 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 9.37 µs | 111 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 120 µs | 1.85 ms |

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
| 20 | 77.9 µs | 107 µs | 252 µs | 117.8 KiB | 12,844 |
| 40 | 48.8 µs | 52.2 µs | 143 µs | 97.7 KiB | 20,481 |
| 80 | 58.3 µs | 61.4 µs | 169 µs | 122.1 KiB | 17,151 |
| 160 | 77.1 µs | 81.8 µs | 214 µs | 158.7 KiB | 12,962 |
| 320 | 119 µs | 124 µs | 364 µs | 237.4 KiB | 8,375 |
| 640 | 234 µs | 375 µs | 649 µs | 524.5 KiB | 4,273 |
| 1280 | 424 µs | 432 µs | 1.03 ms | 1.0 MiB | 2,359 |
| 2560 | 742 µs | 786 µs | 1.30 ms | 2.1 MiB | 1,347 |
| 5120 | 1.70 ms | 1.74 ms | 2.77 ms | 4.3 MiB | 589 |
| 10240 | 3.47 ms | 3.59 ms | 4.47 ms | 8.6 MiB | 288 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.11 µs | 8.69 µs | 30.8 µs | 17.0 KiB | 123,274 |
| 40 | 8.08 µs | 8.60 µs | 29.2 µs | 16.3 KiB | 123,689 |
| 80 | 10.5 µs | 11.9 µs | 35.9 µs | 20.5 KiB | 94,999 |
| 160 | 14.9 µs | 15.6 µs | 46.6 µs | 28.6 KiB | 67,183 |
| 320 | 25.6 µs | 26.6 µs | 79.3 µs | 48.2 KiB | 39,102 |
| 640 | 46.3 µs | 48.5 µs | 149 µs | 86.8 KiB | 21,606 |
| 1280 | 85.2 µs | 87.7 µs | 243 µs | 171.2 KiB | 11,736 |
| 2560 | 174 µs | 192 µs | 447 µs | 343.9 KiB | 5,732 |
| 5120 | 504 µs | 514 µs | 1.25 ms | 634.3 KiB | 1,983 |
| 10240 | 1.12 ms | 1.15 ms | 2.88 ms | 1.3 MiB | 891 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 18.6 µs | 19.6 µs | 18.8 µs | 7.3 KiB | 53,869 |
| 40 | 27.8 µs | 31.6 µs | 75.4 µs | 13.2 KiB | 36,023 |
| 80 | 53.1 µs | 54.2 µs | 135 µs | 25.1 KiB | 18,828 |
| 160 | 105 µs | 106 µs | 259 µs | 48.9 KiB | 9,569 |
| 320 | 208 µs | 212 µs | 517 µs | 96.5 KiB | 4,801 |
| 640 | 393 µs | 400 µs | 808 µs | 191.5 KiB | 2,545 |
| 1280 | 761 µs | 772 µs | 1.40 ms | 381.6 KiB | 1,313 |
| 2560 | 1.58 ms | 1.88 ms | 2.99 ms | 761.9 KiB | 633 |
| 5120 | 3.60 ms | 3.84 ms | 5.11 ms | 1.5 MiB | 278 |
| 10240 | 5.69 ms | 5.88 ms | 7.56 ms | 3.0 MiB | 176 |

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
| 20 | 55.5 µs | 66.7 µs | 182 µs | 44.0 KiB | 18,009 |
| 40 | 95.3 µs | 101 µs | 259 µs | 83.0 KiB | 10,497 |
| 80 | 185 µs | 199 µs | 474 µs | 161.5 KiB | 5,407 |
| 160 | 375 µs | 399 µs | 965 µs | 319.5 KiB | 2,668 |
| 320 | 655 µs | 682 µs | 1.25 ms | 632.2 KiB | 1,527 |
| 640 | 1.41 ms | 1.49 ms | 2.67 ms | 1.2 MiB | 708 |
| 1280 | 2.64 ms | 2.72 ms | 3.96 ms | 2.5 MiB | 379 |
| 2560 | 5.15 ms | 5.29 ms | 6.61 ms | 4.9 MiB | 194 |
| 5120 | 10.4 ms | 10.6 ms | 12.1 ms | 9.8 MiB | 96 |
| 10240 | 24.5 ms | 25.2 ms | 26.8 ms | 19.7 MiB | 41 |

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
| 20 | 1.48 ms | 1.73 ms | 3.27 ms | 652.5 KiB | 674 |
| 40 | 1.99 ms | 2.78 ms | 3.24 ms | 1.3 MiB | 503 |
| 80 | 3.80 ms | 4.74 ms | 5.05 ms | 2.6 MiB | 263 |
| 160 | 7.43 ms | 9.68 ms | 8.72 ms | 5.3 MiB | 135 |
| 320 | 14.4 ms | 15.6 ms | 16.1 ms | 10.6 MiB | 69 |
| 640 | 28.2 ms | 32.2 ms | 29.9 ms | 21.4 MiB | 36 |
| 1280 | 56.6 ms | 58.3 ms | 58.8 ms | 43.7 MiB | 18 |
| 2560 | 113 ms | 116 ms | 116 ms | 25.9 MiB | 9 |
| 5120 | 228 ms | 232 ms | 231 ms | 54.2 MiB | 4 |
| 10240 | 462 ms | 463 ms | 472 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.22, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.59 µs | 8.89 µs | 5.80 µs | 7.4 KiB | 178,982 |
| 40 | 8.19 µs | 9.50 µs | 28.8 µs | 14.0 KiB | 122,094 |
| 80 | 14.1 µs | 16.2 µs | 43.4 µs | 27.3 KiB | 70,866 |
| 160 | 26.7 µs | 28.7 µs | 77.4 µs | 53.9 KiB | 37,493 |
| 320 | 52.2 µs | 74.0 µs | 143 µs | 107.0 KiB | 19,172 |
| 640 | 103 µs | 119 µs | 282 µs | 213.3 KiB | 9,685 |
| 1280 | 368 µs | 381 µs | 801 µs | 515.9 KiB | 2,720 |
| 2560 | 743 µs | 759 µs | 1.43 ms | 1.0 MiB | 1,345 |
| 5120 | 1.63 ms | 1.75 ms | 2.97 ms | 2.1 MiB | 612 |
| 10240 | 3.40 ms | 3.60 ms | 5.16 ms | 4.2 MiB | 294 |

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
| 20 | 1.96 ms | 2.05 ms | 3.59 ms | 1.2 MiB | 509 |
| 40 | 3.72 ms | 3.75 ms | 5.32 ms | 2.5 MiB | 269 |
| 80 | 7.16 ms | 7.26 ms | 8.81 ms | 5.0 MiB | 140 |
| 160 | 14.0 ms | 19.3 ms | 15.7 ms | 10.0 MiB | 71 |
| 320 | 27.8 ms | 30.5 ms | 29.6 ms | 20.0 MiB | 36 |
| 640 | 55.7 ms | 57.5 ms | 57.7 ms | 40.1 MiB | 18 |
| 1280 | 112 ms | 116 ms | 116 ms | 16.1 MiB | 9 |
| 2560 | 219 ms | 219 ms | 221 ms | 32.3 MiB | 5 |
| 5120 | 437 ms | 438 ms | 439 ms | 707.4 KiB | 2 |
| 10240 | 875 ms | 880 ms | 878 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.14 ms | 1.17 ms | 2.72 ms | 645.6 KiB | 881 |
| 40 | 1.99 ms | 2.03 ms | 3.59 ms | 1.3 MiB | 502 |
| 80 | 3.69 ms | 3.74 ms | 5.30 ms | 2.5 MiB | 271 |
| 160 | 7.14 ms | 7.32 ms | 8.81 ms | 5.2 MiB | 140 |
| 320 | 14.2 ms | 14.3 ms | 15.9 ms | 10.6 MiB | 70 |
| 640 | 28.3 ms | 28.9 ms | 30.3 ms | 21.4 MiB | 35 |
| 1280 | 57.0 ms | 57.1 ms | 59.1 ms | 43.6 MiB | 18 |
| 2560 | 115 ms | 116 ms | 117 ms | 25.7 MiB | 9 |
| 5120 | 231 ms | 231 ms | 234 ms | 53.9 MiB | 4 |
| 10240 | 463 ms | 464 ms | 467 ms | 46.2 MiB | 2 |

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
| 20 | 4.11 µs | 9.77 µs | 4.22 µs | 9.3 KiB | 243,256 |
| 40 | 5.01 µs | 5.87 µs | 18.5 µs | 8.4 KiB | 199,520 |
| 80 | 8.35 µs | 9.04 µs | 26.3 µs | 16.2 KiB | 119,725 |
| 160 | 15.3 µs | 18.3 µs | 46.0 µs | 31.8 KiB | 65,225 |
| 320 | 29.6 µs | 30.4 µs | 86.5 µs | 63.1 KiB | 33,759 |
| 640 | 57.8 µs | 62.1 µs | 162 µs | 127.6 KiB | 17,290 |
| 1280 | 303 µs | 312 µs | 735 µs | 352.8 KiB | 3,300 |
| 2560 | 618 µs | 629 µs | 1.28 ms | 694.2 KiB | 1,618 |
| 5120 | 1.37 ms | 1.40 ms | 2.76 ms | 1.3 MiB | 729 |
| 10240 | 2.81 ms | 2.87 ms | 4.32 ms | 2.7 MiB | 356 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.90, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.05 µs | 3.19 µs | 12.3 µs | 4.5 KiB | 327,845 |
| 40 | 3.27 µs | 3.48 µs | 13.5 µs | 4.5 KiB | 305,481 |
| 80 | 3.60 µs | 3.87 µs | 14.5 µs | 4.5 KiB | 277,779 |
| 160 | 4.33 µs | 5.15 µs | 16.5 µs | 4.5 KiB | 230,973 |
| 320 | 6.06 µs | 6.50 µs | 21.1 µs | 4.5 KiB | 165,009 |
| 640 | 9.37 µs | 9.77 µs | 30.6 µs | 4.5 KiB | 106,706 |
| 1280 | 16.0 µs | 16.5 µs | 47.0 µs | 4.5 KiB | 62,579 |
| 2560 | 28.8 µs | 29.6 µs | 79.7 µs | 4.5 KiB | 34,697 |
| 5120 | 56.9 µs | 59.5 µs | 168 µs | 4.5 KiB | 17,579 |
| 10240 | 111 µs | 116 µs | 303 µs | 4.5 KiB | 9,004 |

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
| 20 | 9.38 µs | 11.6 µs | 9.60 µs | 3.6 KiB | 106,611 |
| 40 | 13.7 µs | 14.5 µs | 13.9 µs | 6.3 KiB | 73,195 |
| 80 | 23.5 µs | 25.2 µs | 96.9 µs | 11.6 KiB | 42,490 |
| 160 | 41.0 µs | 44.4 µs | 158 µs | 22.3 KiB | 24,407 |
| 320 | 66.2 µs | 74.7 µs | 209 µs | 44.8 KiB | 15,098 |
| 640 | 120 µs | 127 µs | 334 µs | 91.0 KiB | 8,332 |
| 1280 | 236 µs | 257 µs | 667 µs | 191.5 KiB | 4,237 |
| 2560 | 458 µs | 494 µs | 1.11 ms | 360.8 KiB | 2,183 |
| 5120 | 1.03 ms | 1.12 ms | 2.38 ms | 685.3 KiB | 969 |
| 10240 | 1.85 ms | 1.91 ms | 3.29 ms | 1.3 MiB | 541 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.89 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.41 ms | 1.41 ms | 75% |
| `load-exception-registry` | 1 | 393 µs | 393 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 88.0 µs | 4.6% |

**At 10240 entrys** (whole operation: 33.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 24.5 ms | 24.5 ms | 72% |
| `load-exception-registry` | 1 | 5.69 ms | 5.69 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.64 ms | 11% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T14:40:30.104Z` → `2026-11-02T14:41:23.399Z` (53 s), ci: CI (run 41461721691)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `d4c4c875bc5bb72485dcd1e00346784dbf00a4f3` on `feat/affected-scope`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

