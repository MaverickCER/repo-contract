# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **964 µs** per operation compared with a bare-minimum baseline (**238% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.04). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 964 µs | 18.6 ms |
| Added latency, relative to baseline | 238% | 369% |
| Added CPU time per operation | 979 µs | 18.9 ms |
| Added memory per operation (heap delta) | 1.5 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 1,037 ops/s | 54 ops/s |

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
| 20 | 24.0 µs | 109 µs | 85.9 µs | 358% | 86.0 µs | $0.00018 – $0.00097 |
| 40 | 36.9 µs | 164 µs | 127 µs | 345% | 127 µs | $0.00027 – $0.0014 |
| 80 | 65.3 µs | 277 µs | 212 µs | 324% | 811 µs | $0.00044 – $0.0091 |
| 160 | 122 µs | 424 µs | 301 µs | 246% | 1.25 ms | $0.00063 – $0.014 |
| 320 | 240 µs | 712 µs | 471 µs | 196% | 1.45 ms | $0.00098 – $0.016 |
| 640 | 405 µs | 1.37 ms | 964 µs | 238% | 979 µs | $0.002 – $0.011 |
| 1280 | 685 µs | 2.56 ms | 1.88 ms | 274% | 1.87 ms | $0.0039 – $0.021 |
| 2560 | 1.27 ms | 5.03 ms | 3.76 ms | 295% | 3.91 ms | $0.0078 – $0.044 |
| 5120 | 2.53 ms | 11.6 ms | 9.10 ms | 359% | 9.38 ms | $0.019 – $0.105 |
| 10240 | 5.03 ms | 23.6 ms | 18.6 ms | 369% | 18.9 ms | $0.039 – $0.212 |

**How the total grows:** O(n) (linear), exponent 1.04 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 165 µs | 2.41 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 28.8 µs | 773 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 274 µs | 3.89 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.06 ms | 17.6 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 18.5 ms | 304 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 63.3 µs | 2.48 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 37.2 ms | 586 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 19.0 ms | 309 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 36.2 µs | 2.10 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 5.88 µs | 65.0 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 76.0 µs | 1.27 ms |

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

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 52.0 µs | 67.2 µs | 162 µs | 120.0 KiB | 19,235 |
| 40 | 32.1 µs | 33.4 µs | 82.6 µs | 97.2 KiB | 31,127 |
| 80 | 39.1 µs | 42.8 µs | 104 µs | 123.7 KiB | 25,561 |
| 160 | 52.1 µs | 53.9 µs | 139 µs | 158.2 KiB | 19,191 |
| 320 | 75.7 µs | 77.0 µs | 183 µs | 239.5 KiB | 13,205 |
| 640 | 165 µs | 208 µs | 490 µs | 524.5 KiB | 6,065 |
| 1280 | 271 µs | 278 µs | 581 µs | 1.0 MiB | 3,688 |
| 2560 | 518 µs | 528 µs | 971 µs | 2.1 MiB | 1,930 |
| 5120 | 1.20 ms | 1.25 ms | 2.08 ms | 4.3 MiB | 836 |
| 10240 | 2.41 ms | 2.45 ms | 3.21 ms | 8.6 MiB | 415 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.20, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.26 µs | 5.53 µs | 17.7 µs | 17.0 KiB | 190,171 |
| 40 | 5.47 µs | 5.83 µs | 18.0 µs | 16.3 KiB | 182,683 |
| 80 | 6.64 µs | 6.86 µs | 21.0 µs | 20.5 KiB | 150,700 |
| 160 | 9.68 µs | 10.1 µs | 30.8 µs | 28.6 KiB | 103,327 |
| 320 | 15.7 µs | 16.8 µs | 43.6 µs | 48.2 KiB | 63,808 |
| 640 | 28.8 µs | 30.1 µs | 74.3 µs | 87.8 KiB | 34,734 |
| 1280 | 61.5 µs | 66.0 µs | 160 µs | 167.5 KiB | 16,265 |
| 2560 | 125 µs | 127 µs | 296 µs | 338.6 KiB | 8,001 |
| 5120 | 347 µs | 352 µs | 728 µs | 668.2 KiB | 2,879 |
| 10240 | 773 µs | 783 µs | 1.45 ms | 1.3 MiB | 1,294 |

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

**Measured: O(n)** (exponent 0.99, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.1 µs | 13.0 µs | 47.6 µs | 7.3 KiB | 82,602 |
| 40 | 18.6 µs | 19.1 µs | 47.9 µs | 13.2 KiB | 53,713 |
| 80 | 35.8 µs | 37.4 µs | 86.3 µs | 25.1 KiB | 27,965 |
| 160 | 71.9 µs | 76.6 µs | 169 µs | 48.9 KiB | 13,899 |
| 320 | 143 µs | 149 µs | 337 µs | 96.4 KiB | 6,986 |
| 640 | 274 µs | 279 µs | 593 µs | 191.5 KiB | 3,656 |
| 1280 | 527 µs | 536 µs | 1.02 ms | 381.6 KiB | 1,898 |
| 2560 | 1.15 ms | 1.38 ms | 2.22 ms | 761.9 KiB | 866 |
| 5120 | 2.51 ms | 2.65 ms | 3.67 ms | 1.5 MiB | 398 |
| 10240 | 3.89 ms | 3.98 ms | 5.27 ms | 3.0 MiB | 257 |

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
| 20 | 37.7 µs | 45.2 µs | 126 µs | 43.8 KiB | 26,551 |
| 40 | 64.7 µs | 71.6 µs | 171 µs | 82.8 KiB | 15,455 |
| 80 | 127 µs | 135 µs | 323 µs | 161.3 KiB | 7,891 |
| 160 | 240 µs | 257 µs | 563 µs | 318.6 KiB | 4,167 |
| 320 | 483 µs | 533 µs | 998 µs | 632.2 KiB | 2,069 |
| 640 | 1.06 ms | 1.10 ms | 2.09 ms | 1.2 MiB | 946 |
| 1280 | 1.94 ms | 2.00 ms | 3.02 ms | 2.5 MiB | 517 |
| 2560 | 3.78 ms | 3.89 ms | 4.96 ms | 4.9 MiB | 264 |
| 5120 | 7.73 ms | 8.23 ms | 9.20 ms | 9.8 MiB | 129 |
| 10240 | 17.6 ms | 18.2 ms | 19.4 ms | 19.7 MiB | 57 |

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
| 20 | 1.12 ms | 1.31 ms | 2.64 ms | 652.5 KiB | 891 |
| 40 | 1.41 ms | 2.04 ms | 2.47 ms | 1.3 MiB | 708 |
| 80 | 2.54 ms | 3.33 ms | 3.56 ms | 2.6 MiB | 394 |
| 160 | 4.88 ms | 6.11 ms | 5.95 ms | 5.2 MiB | 205 |
| 320 | 9.75 ms | 10.7 ms | 10.9 ms | 10.6 MiB | 103 |
| 640 | 18.5 ms | 21.6 ms | 19.7 ms | 21.4 MiB | 54 |
| 1280 | 37.1 ms | 39.1 ms | 38.8 ms | 43.7 MiB | 27 |
| 2560 | 74.9 ms | 75.5 ms | 77.0 ms | 25.9 MiB | 13 |
| 5120 | 152 ms | 153 ms | 158 ms | 54.3 MiB | 7 |
| 10240 | 304 ms | 305 ms | 312 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.27, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.52 µs | 4.32 µs | 3.60 µs | 7.4 KiB | 284,320 |
| 40 | 4.78 µs | 5.51 µs | 14.5 µs | 14.0 KiB | 209,087 |
| 80 | 9.00 µs | 13.7 µs | 25.4 µs | 27.3 KiB | 111,106 |
| 160 | 16.9 µs | 19.0 µs | 44.4 µs | 53.9 KiB | 59,237 |
| 320 | 34.1 µs | 37.4 µs | 92.4 µs | 107.0 KiB | 29,315 |
| 640 | 63.3 µs | 68.3 µs | 167 µs | 213.7 KiB | 15,790 |
| 1280 | 268 µs | 279 µs | 611 µs | 515.9 KiB | 3,737 |
| 2560 | 542 µs | 565 µs | 1.10 ms | 1.0 MiB | 1,844 |
| 5120 | 1.18 ms | 1.25 ms | 2.23 ms | 2.1 MiB | 845 |
| 10240 | 2.48 ms | 2.76 ms | 4.18 ms | 4.2 MiB | 404 |

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
| 20 | 1.36 ms | 1.40 ms | 2.65 ms | 1.2 MiB | 733 |
| 40 | 2.50 ms | 2.64 ms | 3.78 ms | 2.5 MiB | 400 |
| 80 | 4.79 ms | 4.84 ms | 6.08 ms | 5.0 MiB | 209 |
| 160 | 9.41 ms | 9.53 ms | 10.7 ms | 10.0 MiB | 106 |
| 320 | 18.7 ms | 19.6 ms | 20.0 ms | 20.0 MiB | 53 |
| 640 | 37.2 ms | 39.6 ms | 38.7 ms | 40.1 MiB | 27 |
| 1280 | 72.5 ms | 72.9 ms | 73.9 ms | 16.1 MiB | 14 |
| 2560 | 145 ms | 148 ms | 147 ms | 32.3 MiB | 7 |
| 5120 | 289 ms | 292 ms | 291 ms | 707.4 KiB | 3 |
| 10240 | 586 ms | 588 ms | 588 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 672 µs | 692 µs | 1.31 ms | 643.3 KiB | 1,489 |
| 40 | 1.36 ms | 1.44 ms | 2.66 ms | 1.3 MiB | 736 |
| 80 | 2.48 ms | 2.51 ms | 3.75 ms | 2.5 MiB | 404 |
| 160 | 4.82 ms | 4.89 ms | 6.12 ms | 5.2 MiB | 207 |
| 320 | 9.52 ms | 9.59 ms | 10.8 ms | 10.6 MiB | 105 |
| 640 | 19.0 ms | 19.8 ms | 20.3 ms | 21.4 MiB | 53 |
| 1280 | 38.4 ms | 38.8 ms | 39.7 ms | 43.6 MiB | 26 |
| 2560 | 77.2 ms | 78.8 ms | 79.4 ms | 25.7 MiB | 13 |
| 5120 | 154 ms | 155 ms | 156 ms | 53.9 MiB | 6 |
| 10240 | 309 ms | 314 ms | 312 ms | 46.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.40, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.74 µs | 6.93 µs | 2.81 µs | 9.3 KiB | 365,035 |
| 40 | 3.11 µs | 4.52 µs | 10.6 µs | 8.4 KiB | 321,702 |
| 80 | 5.23 µs | 7.25 µs | 15.2 µs | 16.2 KiB | 191,179 |
| 160 | 9.64 µs | 9.80 µs | 25.8 µs | 31.8 KiB | 103,768 |
| 320 | 18.6 µs | 19.4 µs | 47.6 µs | 63.1 KiB | 53,882 |
| 640 | 36.2 µs | 36.8 µs | 90.9 µs | 127.7 KiB | 27,623 |
| 1280 | 206 µs | 209 µs | 461 µs | 349.8 KiB | 4,856 |
| 2560 | 460 µs | 466 µs | 980 µs | 694.2 KiB | 2,172 |
| 5120 | 1.02 ms | 1.33 ms | 2.09 ms | 1.3 MiB | 985 |
| 10240 | 2.10 ms | 2.15 ms | 3.28 ms | 2.7 MiB | 477 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.86, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.94 µs | 2.04 µs | 7.63 µs | 4.5 KiB | 514,160 |
| 40 | 2.02 µs | 2.11 µs | 7.58 µs | 4.5 KiB | 495,833 |
| 80 | 2.41 µs | 2.55 µs | 9.40 µs | 4.5 KiB | 414,543 |
| 160 | 2.86 µs | 3.17 µs | 9.03 µs | 4.5 KiB | 349,442 |
| 320 | 3.86 µs | 3.97 µs | 11.4 µs | 4.5 KiB | 259,198 |
| 640 | 5.88 µs | 6.35 µs | 16.4 µs | 4.5 KiB | 170,043 |
| 1280 | 10.4 µs | 13.8 µs | 28.7 µs | 4.5 KiB | 96,206 |
| 2560 | 18.0 µs | 23.7 µs | 47.5 µs | 4.5 KiB | 55,531 |
| 5120 | 34.2 µs | 48.0 µs | 90.2 µs | 4.5 KiB | 29,246 |
| 10240 | 65.0 µs | 90.6 µs | 173 µs | 4.5 KiB | 15,394 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.88 µs | 6.80 µs | 6.00 µs | 3.6 KiB | 170,036 |
| 40 | 8.69 µs | 9.43 µs | 8.85 µs | 6.3 KiB | 115,015 |
| 80 | 14.4 µs | 15.3 µs | 56.5 µs | 11.6 KiB | 69,465 |
| 160 | 23.5 µs | 26.3 µs | 78.2 µs | 22.2 KiB | 42,511 |
| 320 | 43.2 µs | 49.6 µs | 136 µs | 44.6 KiB | 23,174 |
| 640 | 76.0 µs | 85.6 µs | 204 µs | 89.7 KiB | 13,156 |
| 1280 | 143 µs | 157 µs | 351 µs | 183.3 KiB | 6,982 |
| 2560 | 284 µs | 313 µs | 642 µs | 382.2 KiB | 3,527 |
| 5120 | 636 µs | 669 µs | 1.20 ms | 683.1 KiB | 1,572 |
| 10240 | 1.27 ms | 1.33 ms | 2.39 ms | 1.3 MiB | 788 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.37 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.06 ms | 1.06 ms | 77% |
| `load-exception-registry` | 1 | 274 µs | 274 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 36.5 µs | 2.7% |

**At 10240 entrys** (whole operation: 23.6 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 17.6 ms | 17.6 ms | 75% |
| `load-exception-registry` | 1 | 3.89 ms | 3.89 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.13 ms | 9.0% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-15T07:05:26.783Z` → `2026-11-15T07:06:06.249Z` (39 s), ci: CI (run 43687150892)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `c968b12ca3ffc07428d76f750f67c60cc7212521` on `chore/bump-internal-package-contract-v0.19.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

