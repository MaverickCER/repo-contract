# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.18 ms** per operation compared with a bare-minimum baseline (**218% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.18 ms | 22.7 ms |
| Added latency, relative to baseline | 218% | 363% |
| Added CPU time per operation | 1.21 ms | 22.7 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 849 ops/s | 44 ops/s |

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
| 20 | 33.7 µs | 139 µs | 105 µs | 313% | 106 µs | $0.00022 – $0.0012 |
| 40 | 48.5 µs | 218 µs | 171 µs | 353% | 171 µs | $0.00036 – $0.0019 |
| 80 | 81.0 µs | 351 µs | 270 µs | 334% | 272 µs | $0.00056 – $0.0031 |
| 160 | 147 µs | 586 µs | 438 µs | 297% | 1.99 ms | $0.00091 – $0.022 |
| 320 | 283 µs | 934 µs | 650 µs | 230% | 2.27 ms | $0.0014 – $0.026 |
| 640 | 540 µs | 1.70 ms | 1.18 ms | 218% | 1.21 ms | $0.0025 – $0.014 |
| 1280 | 862 µs | 3.18 ms | 2.31 ms | 268% | 2.32 ms | $0.0048 – $0.026 |
| 2560 | 1.54 ms | 6.20 ms | 4.67 ms | 303% | 4.75 ms | $0.0097 – $0.053 |
| 5120 | 3.01 ms | 14.0 ms | 11.0 ms | 366% | 11.4 ms | $0.023 – $0.129 |
| 10240 | 6.25 ms | 28.7 ms | 22.7 ms | 363% | 22.7 ms | $0.047 – $0.256 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 279 µs | 2.92 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 44.7 µs | 1.05 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 333 µs | 4.55 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.30 ms | 20.2 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 22.7 ms | 371 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 100 µs | 3.17 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 44.4 ms | 698 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 22.6 ms | 370 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 56.8 µs | 2.61 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 9.14 µs | 101 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 118 µs | 1.72 ms |

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

**Measured: O(n)** (exponent 0.87, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 78.5 µs | 105 µs | 308 µs | 117.8 KiB | 12,733 |
| 40 | 49.5 µs | 52.0 µs | 164 µs | 97.6 KiB | 20,190 |
| 80 | 58.6 µs | 61.3 µs | 190 µs | 121.7 KiB | 17,053 |
| 160 | 75.7 µs | 78.5 µs | 233 µs | 158.4 KiB | 13,207 |
| 320 | 103 µs | 109 µs | 262 µs | 241.1 KiB | 9,754 |
| 640 | 279 µs | 403 µs | 1.04 ms | 656.2 KiB | 3,581 |
| 1280 | 406 µs | 418 µs | 1.21 ms | 1.0 MiB | 2,463 |
| 2560 | 693 µs | 724 µs | 1.46 ms | 2.1 MiB | 1,444 |
| 5120 | 1.51 ms | 1.57 ms | 2.89 ms | 4.3 MiB | 661 |
| 10240 | 2.92 ms | 2.97 ms | 4.03 ms | 8.6 MiB | 342 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.15, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 7.52 µs | 8.22 µs | 7.60 µs | 17.0 KiB | 132,991 |
| 40 | 8.20 µs | 9.44 µs | 8.33 µs | 16.3 KiB | 121,904 |
| 80 | 10.6 µs | 11.3 µs | 22.8 µs | 20.5 KiB | 94,504 |
| 160 | 15.1 µs | 16.0 µs | 60.2 µs | 28.6 KiB | 66,183 |
| 320 | 24.6 µs | 25.9 µs | 92.0 µs | 48.2 KiB | 40,666 |
| 640 | 44.7 µs | 46.5 µs | 149 µs | 86.7 KiB | 22,368 |
| 1280 | 88.5 µs | 91.1 µs | 266 µs | 169.1 KiB | 11,302 |
| 2560 | 184 µs | 192 µs | 529 µs | 343.9 KiB | 5,440 |
| 5120 | 466 µs | 479 µs | 1.39 ms | 634.3 KiB | 2,146 |
| 10240 | 1.05 ms | 1.07 ms | 3.23 ms | 1.3 MiB | 955 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 15.0 µs | 16.6 µs | 15.2 µs | 7.3 KiB | 66,630 |
| 40 | 25.3 µs | 26.5 µs | 86.5 µs | 13.2 KiB | 39,526 |
| 80 | 47.1 µs | 49.9 µs | 150 µs | 25.1 KiB | 21,247 |
| 160 | 89.6 µs | 93.5 µs | 262 µs | 48.9 KiB | 11,159 |
| 320 | 174 µs | 180 µs | 483 µs | 96.4 KiB | 5,754 |
| 640 | 333 µs | 349 µs | 857 µs | 191.5 KiB | 3,002 |
| 1280 | 642 µs | 668 µs | 1.46 ms | 381.6 KiB | 1,557 |
| 2560 | 1.33 ms | 1.57 ms | 3.12 ms | 761.9 KiB | 750 |
| 5120 | 2.82 ms | 2.96 ms | 4.75 ms | 1.5 MiB | 355 |
| 10240 | 4.55 ms | 4.67 ms | 6.76 ms | 3.0 MiB | 220 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.9 µs | 66.8 µs | 186 µs | 44.1 KiB | 16,980 |
| 40 | 95.0 µs | 108 µs | 320 µs | 83.0 KiB | 10,521 |
| 80 | 181 µs | 189 µs | 571 µs | 161.5 KiB | 5,535 |
| 160 | 323 µs | 337 µs | 837 µs | 318.6 KiB | 3,097 |
| 320 | 612 µs | 630 µs | 1.40 ms | 632.2 KiB | 1,634 |
| 640 | 1.30 ms | 1.35 ms | 2.93 ms | 1.2 MiB | 772 |
| 1280 | 2.34 ms | 2.41 ms | 4.00 ms | 2.5 MiB | 427 |
| 2560 | 4.50 ms | 4.61 ms | 6.31 ms | 4.9 MiB | 222 |
| 5120 | 8.88 ms | 9.03 ms | 10.9 ms | 9.8 MiB | 113 |
| 10240 | 20.2 ms | 20.6 ms | 22.8 ms | 19.7 MiB | 49 |

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

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.37 ms | 1.61 ms | 3.59 ms | 652.5 KiB | 730 |
| 40 | 1.67 ms | 2.36 ms | 3.29 ms | 1.3 MiB | 598 |
| 80 | 3.08 ms | 4.08 ms | 4.68 ms | 2.6 MiB | 324 |
| 160 | 5.95 ms | 7.13 ms | 7.56 ms | 5.3 MiB | 168 |
| 320 | 11.4 ms | 12.2 ms | 13.2 ms | 10.6 MiB | 87 |
| 640 | 22.7 ms | 22.9 ms | 24.5 ms | 21.4 MiB | 44 |
| 1280 | 45.7 ms | 46.8 ms | 48.1 ms | 43.7 MiB | 22 |
| 2560 | 92.1 ms | 93.1 ms | 94.8 ms | 25.9 MiB | 11 |
| 5120 | 185 ms | 187 ms | 193 ms | 54.2 MiB | 5 |
| 10240 | 371 ms | 373 ms | 381 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.19, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.69 µs | 5.84 µs | 4.97 µs | 7.4 KiB | 213,117 |
| 40 | 8.56 µs | 9.11 µs | 17.7 µs | 14.0 KiB | 116,841 |
| 80 | 14.7 µs | 15.6 µs | 53.0 µs | 27.3 KiB | 68,088 |
| 160 | 27.0 µs | 29.9 µs | 88.8 µs | 53.9 KiB | 36,998 |
| 320 | 51.0 µs | 53.7 µs | 158 µs | 107.0 KiB | 19,590 |
| 640 | 100 µs | 109 µs | 308 µs | 213.3 KiB | 9,958 |
| 1280 | 411 µs | 428 µs | 1.23 ms | 516.0 KiB | 2,435 |
| 2560 | 732 µs | 755 µs | 1.63 ms | 1.0 MiB | 1,366 |
| 5120 | 1.56 ms | 1.65 ms | 3.25 ms | 2.1 MiB | 640 |
| 10240 | 3.17 ms | 3.36 ms | 5.65 ms | 4.0 MiB | 315 |

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
| 20 | 1.73 ms | 1.77 ms | 3.73 ms | 1.2 MiB | 579 |
| 40 | 3.08 ms | 3.12 ms | 5.09 ms | 2.5 MiB | 324 |
| 80 | 5.81 ms | 5.98 ms | 7.84 ms | 5.0 MiB | 172 |
| 160 | 11.2 ms | 11.3 ms | 13.3 ms | 10.0 MiB | 89 |
| 320 | 22.2 ms | 22.3 ms | 24.3 ms | 20.0 MiB | 45 |
| 640 | 44.4 ms | 45.3 ms | 46.9 ms | 40.1 MiB | 23 |
| 1280 | 88.7 ms | 94.0 ms | 91.0 ms | 16.1 MiB | 11 |
| 2560 | 176 ms | 177 ms | 179 ms | 32.3 MiB | 6 |
| 5120 | 350 ms | 350 ms | 353 ms | 708.6 KiB | 3 |
| 10240 | 698 ms | 700 ms | 701 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 986 µs | 1.07 ms | 3.01 ms | 645.6 KiB | 1,015 |
| 40 | 1.68 ms | 1.78 ms | 3.69 ms | 1.3 MiB | 597 |
| 80 | 3.07 ms | 3.14 ms | 5.07 ms | 2.5 MiB | 325 |
| 160 | 5.82 ms | 5.89 ms | 7.84 ms | 5.2 MiB | 172 |
| 320 | 11.4 ms | 11.6 ms | 13.4 ms | 10.6 MiB | 88 |
| 640 | 22.6 ms | 22.8 ms | 24.8 ms | 21.4 MiB | 44 |
| 1280 | 45.2 ms | 45.3 ms | 47.4 ms | 43.6 MiB | 22 |
| 2560 | 91.2 ms | 91.4 ms | 93.9 ms | 25.7 MiB | 11 |
| 5120 | 184 ms | 184 ms | 187 ms | 53.9 MiB | 5 |
| 10240 | 370 ms | 371 ms | 375 ms | 46.1 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.31, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.67 µs | 9.08 µs | 3.75 µs | 9.3 KiB | 272,622 |
| 40 | 5.20 µs | 6.28 µs | 5.87 µs | 8.4 KiB | 192,189 |
| 80 | 9.01 µs | 9.38 µs | 35.1 µs | 16.2 KiB | 111,047 |
| 160 | 15.9 µs | 16.7 µs | 55.6 µs | 31.8 KiB | 62,855 |
| 320 | 29.7 µs | 30.7 µs | 95.3 µs | 63.1 KiB | 33,666 |
| 640 | 56.8 µs | 58.3 µs | 175 µs | 127.6 KiB | 17,592 |
| 1280 | 306 µs | 316 µs | 853 µs | 352.8 KiB | 3,267 |
| 2560 | 609 µs | 625 µs | 1.46 ms | 694.2 KiB | 1,642 |
| 5120 | 1.30 ms | 1.33 ms | 3.06 ms | 1.3 MiB | 770 |
| 10240 | 2.61 ms | 2.69 ms | 4.53 ms | 2.7 MiB | 383 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.77 µs | 3.01 µs | 2.80 µs | 4.5 KiB | 360,807 |
| 40 | 3.09 µs | 3.48 µs | 3.12 µs | 4.5 KiB | 323,529 |
| 80 | 3.50 µs | 3.87 µs | 3.54 µs | 4.5 KiB | 285,334 |
| 160 | 4.37 µs | 4.77 µs | 4.42 µs | 4.5 KiB | 228,608 |
| 320 | 6.11 µs | 6.54 µs | 16.9 µs | 4.5 KiB | 163,635 |
| 640 | 9.14 µs | 9.60 µs | 36.0 µs | 4.5 KiB | 109,466 |
| 1280 | 15.2 µs | 15.8 µs | 54.8 µs | 4.5 KiB | 65,599 |
| 2560 | 27.3 µs | 28.7 µs | 89.0 µs | 4.5 KiB | 36,586 |
| 5120 | 51.8 µs | 53.9 µs | 163 µs | 4.5 KiB | 19,290 |
| 10240 | 101 µs | 108 µs | 317 µs | 4.5 KiB | 9,879 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 9.31 µs | 11.6 µs | 9.56 µs | 3.7 KiB | 107,392 |
| 40 | 12.7 µs | 14.5 µs | 12.9 µs | 6.3 KiB | 78,769 |
| 80 | 20.8 µs | 23.0 µs | 21.1 µs | 11.6 KiB | 48,079 |
| 160 | 37.3 µs | 40.0 µs | 79.6 µs | 22.3 KiB | 26,791 |
| 320 | 67.3 µs | 71.8 µs | 264 µs | 45.0 KiB | 14,860 |
| 640 | 118 µs | 126 µs | 389 µs | 91.0 KiB | 8,472 |
| 1280 | 218 µs | 226 µs | 617 µs | 186.4 KiB | 4,589 |
| 2560 | 440 µs | 471 µs | 1.28 ms | 360.0 KiB | 2,272 |
| 5120 | 980 µs | 1.02 ms | 2.67 ms | 683.6 KiB | 1,021 |
| 10240 | 1.72 ms | 1.79 ms | 3.53 ms | 1.3 MiB | 581 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.70 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.30 ms | 1.30 ms | 76% |
| `load-exception-registry` | 1 | 333 µs | 333 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 72.0 µs | 4.2% |

**At 10240 entrys** (whole operation: 28.7 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 20.2 ms | 20.2 ms | 70% |
| `load-exception-registry` | 1 | 4.55 ms | 4.55 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.94 ms | 14% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-15T21:53:05.215Z` → `2026-11-15T21:53:54.251Z` (49 s), ci: CI (run 43764681048)
- Machine: Intel(R) Xeon(R) 6975P-C, 4 logical core(s) (2 physical), 15701 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `4e579bb6c18fc4991d98d19f391f709f27edd82e` on `feat/v1-readiness`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

