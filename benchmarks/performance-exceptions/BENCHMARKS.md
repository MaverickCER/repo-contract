# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.43 ms** per operation compared with a bare-minimum baseline (**281% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.43 ms | 26.1 ms |
| Added latency, relative to baseline | 281% | 314% |
| Added CPU time per operation | 2.09 ms | 25.8 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 701 ops/s | 38 ops/s |

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
| 20 | 21.8 µs | 93.9 µs | 72.2 µs | 331% | 254 µs | $0.00015 – $0.0029 |
| 40 | 35.8 µs | 144 µs | 108 µs | 302% | 282 µs | $0.00023 – $0.0032 |
| 80 | 68.5 µs | 267 µs | 198 µs | 289% | 490 µs | $0.00041 – $0.0055 |
| 160 | 127 µs | 498 µs | 371 µs | 293% | 840 µs | $0.00077 – $0.0094 |
| 320 | 269 µs | 989 µs | 720 µs | 268% | 1.55 ms | $0.0015 – $0.017 |
| 640 | 508 µs | 1.94 ms | 1.43 ms | 281% | 2.09 ms | $0.003 – $0.024 |
| 1280 | 1.03 ms | 3.73 ms | 2.70 ms | 263% | 2.82 ms | $0.0056 – $0.032 |
| 2560 | 1.96 ms | 7.44 ms | 5.48 ms | 280% | 5.57 ms | $0.011 – $0.063 |
| 5120 | 3.98 ms | 14.9 ms | 10.9 ms | 275% | 11.1 ms | $0.023 – $0.125 |
| 10240 | 8.30 ms | 34.4 ms | 26.1 ms | 314% | 25.8 ms | $0.054 – $0.290 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 298 µs | 3.54 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 50.8 µs | 1.14 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 391 µs | 5.65 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.45 ms | 25.4 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 28.6 ms | 484 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 103 µs | 3.44 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 58.8 ms | 878 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 28.0 ms | 456 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.8 µs | 2.86 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 9.25 µs | 120 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 121 µs | 1.86 ms |

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

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 77.7 µs | 99.6 µs | 256 µs | 117.8 KiB | 12,870 |
| 40 | 50.0 µs | 52.5 µs | 144 µs | 97.7 KiB | 20,001 |
| 80 | 59.7 µs | 62.3 µs | 171 µs | 122.1 KiB | 16,758 |
| 160 | 81.0 µs | 85.1 µs | 237 µs | 158.9 KiB | 12,350 |
| 320 | 116 µs | 120 µs | 319 µs | 237.1 KiB | 8,606 |
| 640 | 298 µs | 424 µs | 897 µs | 656.2 KiB | 3,351 |
| 1280 | 423 µs | 435 µs | 1.02 ms | 1.0 MiB | 2,362 |
| 2560 | 762 µs | 777 µs | 1.36 ms | 2.1 MiB | 1,312 |
| 5120 | 1.71 ms | 1.74 ms | 2.85 ms | 4.3 MiB | 584 |
| 10240 | 3.54 ms | 3.58 ms | 4.48 ms | 8.6 MiB | 283 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.75 µs | 8.09 µs | 28.3 µs | 17.0 KiB | 129,099 |
| 40 | 8.59 µs | 9.20 µs | 30.9 µs | 16.3 KiB | 116,479 |
| 80 | 11.0 µs | 12.2 µs | 37.3 µs | 20.5 KiB | 90,913 |
| 160 | 16.9 µs | 17.7 µs | 54.7 µs | 28.6 KiB | 59,147 |
| 320 | 27.0 µs | 27.9 µs | 80.9 µs | 48.1 KiB | 37,002 |
| 640 | 50.8 µs | 53.2 µs | 150 µs | 86.7 KiB | 19,677 |
| 1280 | 86.0 µs | 89.3 µs | 247 µs | 171.2 KiB | 11,625 |
| 2560 | 194 µs | 208 µs | 533 µs | 329.7 KiB | 5,148 |
| 5120 | 511 µs | 527 µs | 1.26 ms | 634.3 KiB | 1,957 |
| 10240 | 1.14 ms | 1.18 ms | 2.94 ms | 1.3 MiB | 875 |

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
| 20 | 18.8 µs | 20.3 µs | 19.0 µs | 7.3 KiB | 53,174 |
| 40 | 28.3 µs | 30.2 µs | 81.7 µs | 13.2 KiB | 35,395 |
| 80 | 53.9 µs | 73.2 µs | 143 µs | 25.1 KiB | 18,565 |
| 160 | 105 µs | 154 µs | 262 µs | 48.9 KiB | 9,552 |
| 320 | 208 µs | 213 µs | 523 µs | 96.5 KiB | 4,801 |
| 640 | 391 µs | 397 µs | 809 µs | 191.5 KiB | 2,559 |
| 1280 | 762 µs | 773 µs | 1.40 ms | 381.6 KiB | 1,313 |
| 2560 | 1.56 ms | 1.88 ms | 2.96 ms | 761.9 KiB | 641 |
| 5120 | 3.61 ms | 3.87 ms | 5.17 ms | 1.5 MiB | 277 |
| 10240 | 5.65 ms | 5.78 ms | 7.51 ms | 3.0 MiB | 177 |

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
| 20 | 60.9 µs | 92.6 µs | 214 µs | 44.1 KiB | 16,415 |
| 40 | 99.1 µs | 123 µs | 275 µs | 83.0 KiB | 10,089 |
| 80 | 190 µs | 206 µs | 501 µs | 161.5 KiB | 5,251 |
| 160 | 352 µs | 379 µs | 768 µs | 318.6 KiB | 2,843 |
| 320 | 666 µs | 703 µs | 1.29 ms | 632.2 KiB | 1,501 |
| 640 | 1.45 ms | 1.55 ms | 2.71 ms | 1.2 MiB | 687 |
| 1280 | 2.75 ms | 2.85 ms | 4.11 ms | 2.5 MiB | 364 |
| 2560 | 5.42 ms | 5.71 ms | 6.97 ms | 4.9 MiB | 184 |
| 5120 | 10.8 ms | 10.9 ms | 12.6 ms | 9.8 MiB | 93 |
| 10240 | 25.4 ms | 25.6 ms | 27.7 ms | 19.7 MiB | 39 |

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
| 20 | 1.54 ms | 1.98 ms | 3.43 ms | 652.5 KiB | 649 |
| 40 | 2.05 ms | 2.88 ms | 3.33 ms | 1.3 MiB | 487 |
| 80 | 3.90 ms | 4.71 ms | 5.20 ms | 2.6 MiB | 257 |
| 160 | 7.69 ms | 9.82 ms | 9.13 ms | 5.3 MiB | 130 |
| 320 | 14.4 ms | 15.6 ms | 16.2 ms | 10.6 MiB | 70 |
| 640 | 28.6 ms | 30.6 ms | 30.4 ms | 21.4 MiB | 35 |
| 1280 | 57.7 ms | 60.3 ms | 59.9 ms | 43.7 MiB | 17 |
| 2560 | 116 ms | 123 ms | 118 ms | 25.9 MiB | 9 |
| 5120 | 232 ms | 241 ms | 235 ms | 54.2 MiB | 4 |
| 10240 | 484 ms | 485 ms | 494 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.22, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.70 µs | 8.46 µs | 5.90 µs | 7.4 KiB | 175,377 |
| 40 | 8.17 µs | 9.78 µs | 28.8 µs | 14.0 KiB | 122,377 |
| 80 | 14.5 µs | 17.2 µs | 44.7 µs | 27.3 KiB | 68,978 |
| 160 | 31.5 µs | 37.3 µs | 111 µs | 53.9 KiB | 31,775 |
| 320 | 53.3 µs | 63.6 µs | 152 µs | 107.0 KiB | 18,778 |
| 640 | 103 µs | 142 µs | 288 µs | 213.3 KiB | 9,686 |
| 1280 | 377 µs | 388 µs | 818 µs | 515.9 KiB | 2,653 |
| 2560 | 757 µs | 788 µs | 1.42 ms | 1.0 MiB | 1,321 |
| 5120 | 1.64 ms | 1.76 ms | 2.97 ms | 2.1 MiB | 611 |
| 10240 | 3.44 ms | 3.58 ms | 5.28 ms | 4.2 MiB | 290 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.14 ms | 2.17 ms | 3.79 ms | 1.2 MiB | 467 |
| 40 | 3.97 ms | 4.06 ms | 5.64 ms | 2.5 MiB | 252 |
| 80 | 7.66 ms | 8.85 ms | 9.43 ms | 5.0 MiB | 130 |
| 160 | 14.9 ms | 15.1 ms | 16.9 ms | 10.0 MiB | 67 |
| 320 | 29.5 ms | 29.9 ms | 31.6 ms | 20.0 MiB | 34 |
| 640 | 58.8 ms | 61.2 ms | 60.9 ms | 40.1 MiB | 17 |
| 1280 | 118 ms | 118 ms | 120 ms | 16.1 MiB | 8 |
| 2560 | 219 ms | 219 ms | 221 ms | 32.3 MiB | 5 |
| 5120 | 436 ms | 437 ms | 439 ms | 707.4 KiB | 2 |
| 10240 | 878 ms | 904 ms | 880 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.09 ms | 1.16 ms | 2.73 ms | 645.6 KiB | 913 |
| 40 | 2.02 ms | 2.26 ms | 3.67 ms | 1.3 MiB | 495 |
| 80 | 3.74 ms | 3.78 ms | 5.42 ms | 2.5 MiB | 268 |
| 160 | 7.22 ms | 7.29 ms | 9.03 ms | 5.2 MiB | 139 |
| 320 | 14.1 ms | 14.3 ms | 15.9 ms | 10.6 MiB | 71 |
| 640 | 28.0 ms | 28.2 ms | 30.1 ms | 21.4 MiB | 36 |
| 1280 | 56.2 ms | 57.2 ms | 58.3 ms | 43.6 MiB | 18 |
| 2560 | 113 ms | 113 ms | 116 ms | 25.7 MiB | 9 |
| 5120 | 228 ms | 230 ms | 231 ms | 53.9 MiB | 4 |
| 10240 | 456 ms | 456 ms | 460 ms | 46.2 MiB | 2 |

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
| 20 | 4.16 µs | 9.77 µs | 4.28 µs | 9.3 KiB | 240,600 |
| 40 | 5.19 µs | 6.70 µs | 19.4 µs | 8.4 KiB | 192,693 |
| 80 | 8.69 µs | 9.06 µs | 28.6 µs | 16.2 KiB | 115,061 |
| 160 | 15.7 µs | 16.2 µs | 46.6 µs | 31.8 KiB | 63,852 |
| 320 | 30.0 µs | 30.8 µs | 85.0 µs | 63.1 KiB | 33,348 |
| 640 | 58.8 µs | 61.5 µs | 167 µs | 127.6 KiB | 17,001 |
| 1280 | 310 µs | 333 µs | 756 µs | 352.8 KiB | 3,224 |
| 2560 | 625 µs | 635 µs | 1.31 ms | 694.2 KiB | 1,600 |
| 5120 | 1.40 ms | 1.42 ms | 2.87 ms | 1.3 MiB | 717 |
| 10240 | 2.86 ms | 2.94 ms | 4.44 ms | 2.7 MiB | 349 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.92, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.23 µs | 3.34 µs | 10.2 µs | 4.5 KiB | 309,822 |
| 40 | 3.37 µs | 3.52 µs | 13.9 µs | 4.5 KiB | 297,164 |
| 80 | 3.74 µs | 3.92 µs | 15.0 µs | 4.5 KiB | 267,048 |
| 160 | 4.46 µs | 4.71 µs | 17.3 µs | 4.5 KiB | 224,426 |
| 320 | 6.13 µs | 7.02 µs | 22.0 µs | 4.5 KiB | 163,163 |
| 640 | 9.25 µs | 9.84 µs | 29.9 µs | 4.5 KiB | 108,089 |
| 1280 | 16.0 µs | 16.7 µs | 48.1 µs | 4.5 KiB | 62,354 |
| 2560 | 28.7 µs | 29.5 µs | 80.1 µs | 4.5 KiB | 34,847 |
| 5120 | 56.2 µs | 58.7 µs | 154 µs | 4.5 KiB | 17,786 |
| 10240 | 120 µs | 123 µs | 324 µs | 4.5 KiB | 8,365 |

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
| 20 | 9.63 µs | 11.3 µs | 9.79 µs | 3.6 KiB | 103,879 |
| 40 | 14.1 µs | 15.4 µs | 14.4 µs | 6.3 KiB | 70,977 |
| 80 | 24.5 µs | 25.7 µs | 102 µs | 11.6 KiB | 40,824 |
| 160 | 38.1 µs | 41.8 µs | 137 µs | 22.3 KiB | 26,234 |
| 320 | 67.3 µs | 74.5 µs | 211 µs | 44.8 KiB | 14,862 |
| 640 | 121 µs | 129 µs | 337 µs | 91.0 KiB | 8,289 |
| 1280 | 238 µs | 258 µs | 671 µs | 191.5 KiB | 4,200 |
| 2560 | 415 µs | 446 µs | 879 µs | 382.2 KiB | 2,412 |
| 5120 | 1.05 ms | 1.12 ms | 2.40 ms | 685.3 KiB | 950 |
| 10240 | 1.86 ms | 1.94 ms | 3.34 ms | 1.3 MiB | 538 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.94 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.45 ms | 1.45 ms | 75% |
| `load-exception-registry` | 1 | 391 µs | 391 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 89.9 µs | 4.6% |

**At 10240 entrys** (whole operation: 34.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 25.4 ms | 25.4 ms | 74% |
| `load-exception-registry` | 1 | 5.65 ms | 5.65 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.36 ms | 9.8% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-31T15:47:45.798Z` → `2026-10-31T15:48:39.677Z` (54 s), ci: CI (run 41215322995)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `8b44c385e3a8b28ec92580870f90d28f676f6d52` on `dependabot/npm_and_yarn/dev-dependencies-6c9b387527`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

