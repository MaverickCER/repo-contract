# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **2.00 ms** per operation compared with a bare-minimum baseline (**297% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.01 – $0.1 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 2.00 ms | 33.6 ms |
| Added latency, relative to baseline | 297% | 337% |
| Added CPU time per operation | 3.05 ms | 33.3 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 – $0.1 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 501 ops/s | 30 ops/s |

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
| 20 | 38.0 µs | 182 µs | 144 µs | 380% | 626 µs | $0.0003 – $0.007 |
| 40 | 68.4 µs | 227 µs | 158 µs | 231% | 406 µs | $0.00033 – $0.0046 |
| 80 | 112 µs | 443 µs | 330 µs | 294% | 939 µs | $0.00069 – $0.011 |
| 160 | 202 µs | 712 µs | 510 µs | 252% | 990 µs | $0.0011 – $0.011 |
| 320 | 404 µs | 1.42 ms | 1.02 ms | 252% | 2.05 ms | $0.0021 – $0.023 |
| 640 | 671 µs | 2.67 ms | 2.00 ms | 297% | 3.05 ms | $0.0042 – $0.034 |
| 1280 | 1.37 ms | 4.95 ms | 3.58 ms | 261% | 3.76 ms | $0.0075 – $0.042 |
| 2560 | 2.52 ms | 9.78 ms | 7.26 ms | 289% | 7.40 ms | $0.015 – $0.083 |
| 5120 | 4.90 ms | 19.9 ms | 15.0 ms | 307% | 15.5 ms | $0.031 – $0.174 |
| 10240 | 9.96 ms | 43.5 ms | 33.6 ms | 337% | 33.3 ms | $0.070 – $0.375 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 599 µs | 4.55 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 77.5 µs | 1.60 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 552 µs | 6.81 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 2.03 ms | 32.2 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 37.6 ms | 571 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 167 µs | 4.52 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 67.7 ms | 1.08 s |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 34.9 ms | 566 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 97.7 µs | 3.67 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 16.3 µs | 166 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 227 µs | 2.53 ms |

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

**Measured: O(n)** (exponent 0.78, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 141 µs | 180 µs | 600 µs | 115.8 KiB | 7,093 |
| 40 | 99.9 µs | 139 µs | 436 µs | 99.8 KiB | 10,012 |
| 80 | 102 µs | 106 µs | 382 µs | 118.8 KiB | 9,775 |
| 160 | 131 µs | 135 µs | 462 µs | 159.8 KiB | 7,608 |
| 320 | 190 µs | 198 µs | 680 µs | 237.8 KiB | 5,257 |
| 640 | 599 µs | 809 µs | 2.49 ms | 670.1 KiB | 1,670 |
| 1280 | 604 µs | 616 µs | 1.62 ms | 1.0 MiB | 1,656 |
| 2560 | 1.21 ms | 1.24 ms | 3.16 ms | 2.1 MiB | 827 |
| 5120 | 2.31 ms | 2.39 ms | 4.18 ms | 4.3 MiB | 433 |
| 10240 | 4.55 ms | 4.66 ms | 5.89 ms | 8.6 MiB | 220 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.10, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 14.4 µs | 15.1 µs | 14.6 µs | 17.1 KiB | 69,651 |
| 40 | 14.7 µs | 15.5 µs | 15.0 µs | 16.3 KiB | 67,992 |
| 80 | 19.5 µs | 20.4 µs | 19.9 µs | 20.5 KiB | 51,255 |
| 160 | 28.4 µs | 29.4 µs | 125 µs | 28.6 KiB | 35,264 |
| 320 | 43.0 µs | 45.0 µs | 179 µs | 48.6 KiB | 23,242 |
| 640 | 77.5 µs | 80.0 µs | 299 µs | 86.9 KiB | 12,895 |
| 1280 | 139 µs | 144 µs | 473 µs | 168.3 KiB | 7,181 |
| 2560 | 302 µs | 311 µs | 1.04 ms | 335.9 KiB | 3,310 |
| 5120 | 688 µs | 734 µs | 1.89 ms | 634.3 KiB | 1,453 |
| 10240 | 1.60 ms | 1.66 ms | 4.46 ms | 1.3 MiB | 624 |

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

**Measured: O(n)** (exponent 0.91, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 29.0 µs | 30.6 µs | 29.5 µs | 7.3 KiB | 34,425 |
| 40 | 47.0 µs | 49.1 µs | 188 µs | 13.2 KiB | 21,293 |
| 80 | 85.2 µs | 88.9 µs | 311 µs | 25.1 KiB | 11,732 |
| 160 | 158 µs | 163 µs | 531 µs | 48.9 KiB | 6,326 |
| 320 | 301 µs | 309 µs | 943 µs | 96.5 KiB | 3,324 |
| 640 | 552 µs | 571 µs | 1.51 ms | 191.6 KiB | 1,811 |
| 1280 | 1.11 ms | 1.14 ms | 3.12 ms | 381.9 KiB | 899 |
| 2560 | 1.94 ms | 2.19 ms | 4.15 ms | 761.9 KiB | 517 |
| 5120 | 4.00 ms | 4.11 ms | 6.48 ms | 1.5 MiB | 250 |
| 10240 | 6.81 ms | 7.72 ms | 9.76 ms | 3.0 MiB | 147 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 111 µs | 122 µs | 481 µs | 44.0 KiB | 9,001 |
| 40 | 177 µs | 201 µs | 662 µs | 83.6 KiB | 5,643 |
| 80 | 302 µs | 322 µs | 946 µs | 161.9 KiB | 3,313 |
| 160 | 557 µs | 578 µs | 1.54 ms | 319.5 KiB | 1,794 |
| 320 | 1.11 ms | 1.20 ms | 3.08 ms | 634.7 KiB | 900 |
| 640 | 2.03 ms | 2.14 ms | 4.03 ms | 1.2 MiB | 492 |
| 1280 | 3.73 ms | 3.86 ms | 5.85 ms | 2.5 MiB | 268 |
| 2560 | 7.21 ms | 7.41 ms | 9.57 ms | 4.9 MiB | 139 |
| 5120 | 14.4 ms | 14.7 ms | 17.2 ms | 9.8 MiB | 69 |
| 10240 | 32.2 ms | 32.8 ms | 35.8 ms | 19.7 MiB | 31 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.00 ms | 2.62 ms | 4.85 ms | 652.5 KiB | 501 |
| 40 | 3.34 ms | 4.04 ms | 6.34 ms | 1.3 MiB | 300 |
| 80 | 4.72 ms | 5.34 ms | 6.88 ms | 2.6 MiB | 212 |
| 160 | 9.11 ms | 12.0 ms | 11.3 ms | 5.3 MiB | 110 |
| 320 | 18.2 ms | 26.1 ms | 22.3 ms | 10.6 MiB | 55 |
| 640 | 37.6 ms | 39.3 ms | 43.0 ms | 21.5 MiB | 27 |
| 1280 | 70.1 ms | 70.6 ms | 72.9 ms | 43.7 MiB | 14 |
| 2560 | 141 ms | 144 ms | 144 ms | 25.9 MiB | 7 |
| 5120 | 287 ms | 312 ms | 299 ms | 54.2 MiB | 3 |
| 10240 | 571 ms | 589 ms | 586 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.15, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 9.07 µs | 10.9 µs | 9.32 µs | 7.4 KiB | 110,243 |
| 40 | 14.9 µs | 16.0 µs | 33.1 µs | 14.0 KiB | 67,047 |
| 80 | 26.6 µs | 28.5 µs | 109 µs | 27.3 KiB | 37,620 |
| 160 | 46.9 µs | 49.2 µs | 171 µs | 53.9 KiB | 21,322 |
| 320 | 86.5 µs | 103 µs | 294 µs | 107.0 KiB | 11,565 |
| 640 | 167 µs | 198 µs | 544 µs | 213.3 KiB | 5,991 |
| 1280 | 560 µs | 603 µs | 1.49 ms | 516.0 KiB | 1,786 |
| 2560 | 1.16 ms | 1.31 ms | 3.18 ms | 1.0 MiB | 858 |
| 5120 | 2.22 ms | 2.29 ms | 4.33 ms | 2.1 MiB | 450 |
| 10240 | 4.52 ms | 4.74 ms | 7.34 ms | 4.2 MiB | 221 |

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
| 20 | 2.66 ms | 2.73 ms | 5.34 ms | 1.2 MiB | 376 |
| 40 | 4.75 ms | 4.83 ms | 7.49 ms | 2.5 MiB | 211 |
| 80 | 9.03 ms | 9.28 ms | 11.9 ms | 5.0 MiB | 111 |
| 160 | 17.3 ms | 18.7 ms | 20.2 ms | 10.0 MiB | 58 |
| 320 | 34.2 ms | 34.6 ms | 37.1 ms | 20.0 MiB | 29 |
| 640 | 67.7 ms | 68.3 ms | 71.0 ms | 40.1 MiB | 15 |
| 1280 | 137 ms | 139 ms | 142 ms | 16.2 MiB | 7 |
| 2560 | 269 ms | 271 ms | 272 ms | 32.3 MiB | 4 |
| 5120 | 541 ms | 542 ms | 544 ms | 707.4 KiB | 2 |
| 10240 | 1.08 s | 1.08 s | 1.08 s | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.52 ms | 1.62 ms | 4.31 ms | 645.6 KiB | 656 |
| 40 | 2.59 ms | 2.69 ms | 5.26 ms | 1.3 MiB | 387 |
| 80 | 4.78 ms | 5.00 ms | 7.48 ms | 2.5 MiB | 209 |
| 160 | 9.11 ms | 9.23 ms | 11.9 ms | 5.2 MiB | 110 |
| 320 | 17.7 ms | 17.8 ms | 20.5 ms | 10.6 MiB | 57 |
| 640 | 34.9 ms | 35.4 ms | 37.9 ms | 21.4 MiB | 29 |
| 1280 | 70.9 ms | 76.5 ms | 73.7 ms | 43.6 MiB | 14 |
| 2560 | 141 ms | 142 ms | 145 ms | 25.7 MiB | 7 |
| 5120 | 283 ms | 283 ms | 287 ms | 53.9 MiB | 4 |
| 10240 | 566 ms | 568 ms | 571 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.24, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.48 µs | 16.0 µs | 7.67 µs | 9.3 KiB | 133,699 |
| 40 | 9.06 µs | 10.5 µs | 10.2 µs | 8.4 KiB | 110,406 |
| 80 | 15.7 µs | 16.4 µs | 66.4 µs | 16.2 KiB | 63,590 |
| 160 | 28.4 µs | 29.7 µs | 116 µs | 31.9 KiB | 35,170 |
| 320 | 49.7 µs | 51.8 µs | 177 µs | 63.1 KiB | 20,104 |
| 640 | 97.7 µs | 101 µs | 348 µs | 127.4 KiB | 10,236 |
| 1280 | 479 µs | 491 µs | 1.48 ms | 340.8 KiB | 2,090 |
| 2560 | 858 µs | 872 µs | 1.93 ms | 694.2 KiB | 1,165 |
| 5120 | 1.84 ms | 1.87 ms | 4.07 ms | 1.3 MiB | 542 |
| 10240 | 3.67 ms | 3.75 ms | 6.12 ms | 2.7 MiB | 273 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.85, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.93 µs | 5.35 µs | 5.02 µs | 4.5 KiB | 202,827 |
| 40 | 5.25 µs | 5.52 µs | 5.33 µs | 4.5 KiB | 190,627 |
| 80 | 5.94 µs | 6.17 µs | 13.3 µs | 4.5 KiB | 168,330 |
| 160 | 7.51 µs | 7.86 µs | 7.61 µs | 4.5 KiB | 133,077 |
| 320 | 10.5 µs | 10.9 µs | 18.2 µs | 4.5 KiB | 95,053 |
| 640 | 16.3 µs | 16.7 µs | 49.8 µs | 4.5 KiB | 61,461 |
| 1280 | 25.1 µs | 25.9 µs | 101 µs | 4.5 KiB | 39,807 |
| 2560 | 46.0 µs | 48.5 µs | 177 µs | 4.5 KiB | 21,741 |
| 5120 | 87.2 µs | 92.0 µs | 325 µs | 4.5 KiB | 11,473 |
| 10240 | 166 µs | 175 µs | 593 µs | 4.5 KiB | 6,040 |

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

**Measured: O(n)** (exponent 0.88, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 21.8 µs | 43.8 µs | 22.3 µs | 3.8 KiB | 45,971 |
| 40 | 27.2 µs | 29.0 µs | 27.8 µs | 6.4 KiB | 36,715 |
| 80 | 44.1 µs | 46.9 µs | 45.1 µs | 11.8 KiB | 22,673 |
| 160 | 70.6 µs | 75.5 µs | 312 µs | 22.4 KiB | 14,161 |
| 320 | 126 µs | 137 µs | 526 µs | 43.9 KiB | 7,926 |
| 640 | 227 µs | 247 µs | 883 µs | 96.2 KiB | 4,408 |
| 1280 | 399 µs | 466 µs | 1.42 ms | 172.2 KiB | 2,504 |
| 2560 | 649 µs | 671 µs | 1.74 ms | 340.9 KiB | 1,541 |
| 5120 | 1.42 ms | 1.53 ms | 3.44 ms | 683.6 KiB | 703 |
| 10240 | 2.53 ms | 2.60 ms | 4.82 ms | 1.3 MiB | 395 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.67 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 2.03 ms | 2.03 ms | 76% |
| `load-exception-registry` | 1 | 552 µs | 552 µs | 21% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 83.2 µs | 3.1% |

**At 10240 entrys** (whole operation: 43.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 32.2 ms | 32.2 ms | 74% |
| `load-exception-registry` | 1 | 6.81 ms | 6.81 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 4.53 ms | 10% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-11T12:00:46.670Z` → `2026-11-11T12:01:54.358Z` (68 s), ci: CI (run 43013441445)
- Machine: Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, 4 logical core(s) (2 physical), 15982 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `edac848e771159164c3871993f65a7b5ccb346c8` on `docs/v1-claims-evidence`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

