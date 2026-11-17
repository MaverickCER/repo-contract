# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend, and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.62 ms** per operation compared with a bare-minimum baseline (**281% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.03). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones. Both come from the same run, so they depend far less on the machine than a time does. Runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below). They show scale, not a budget.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.62 ms | 29.7 ms |
| Added latency, relative to baseline | 281% | 382% |
| Added CPU time per operation | 1.30 ms | 30.1 ms |
| Added memory per operation (heap delta) | 1.5 MiB | 23.8 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 617 ops/s | 34 ops/s |

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
| 20 | 33.0 µs | 251 µs | 216 µs | 654% | 219 µs | $0.00045 – $0.0025 |
| 40 | 52.6 µs | 334 µs | 283 µs | 539% | 742 µs | $0.00059 – $0.0083 |
| 80 | 92.5 µs | 461 µs | 367 µs | 397% | 1.59 ms | $0.00076 – $0.018 |
| 160 | 177 µs | 675 µs | 496 µs | 280% | 1.75 ms | $0.001 – $0.020 |
| 320 | 347 µs | 1.10 ms | 740 µs | 213% | 1.69 ms | $0.0015 – $0.019 |
| 640 | 577 µs | 2.20 ms | 1.62 ms | 281% | 1.30 ms | $0.0034 – $0.015 |
| 1280 | 1.00 ms | 3.95 ms | 2.95 ms | 295% | 2.64 ms | $0.0061 – $0.030 |
| 2560 | 1.90 ms | 7.57 ms | 5.65 ms | 298% | 5.48 ms | $0.012 – $0.062 |
| 5120 | 3.82 ms | 16.9 ms | 13.2 ms | 345% | 13.1 ms | $0.027 – $0.147 |
| 10240 | 7.78 ms | 37.4 ms | 29.7 ms | 382% | 30.1 ms | $0.062 – $0.339 |

**How the total grows:** O(n) (linear), exponent 1.03 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder. Its measured growth rate is then compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report. Either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 315 µs | 3.70 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 48.9 µs | 1.17 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 501 µs | 6.03 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.43 ms | 24.6 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 28.3 ms | 462 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 106 µs | 3.55 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 55.4 ms | 873 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 28.2 ms | 459 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.0 µs | 2.95 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 9.70 µs | 111 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 121 µs | 1.82 ms |

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

**Measured: O(n)** (exponent 0.91, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 79.6 µs | 97.4 µs | 255 µs | 117.8 KiB | 12,557 |
| 40 | 53.5 µs | 57.8 µs | 143 µs | 97.6 KiB | 18,702 |
| 80 | 65.0 µs | 66.8 µs | 193 µs | 120.4 KiB | 15,388 |
| 160 | 84.1 µs | 86.2 µs | 226 µs | 158.7 KiB | 11,896 |
| 320 | 126 µs | 132 µs | 340 µs | 237.1 KiB | 7,963 |
| 640 | 315 µs | 395 µs | 937 µs | 656.2 KiB | 3,175 |
| 1280 | 457 µs | 475 µs | 1.11 ms | 1.0 MiB | 2,191 |
| 2560 | 799 µs | 829 µs | 1.41 ms | 2.1 MiB | 1,252 |
| 5120 | 1.83 ms | 1.88 ms | 3.03 ms | 4.3 MiB | 546 |
| 10240 | 3.70 ms | 3.89 ms | 4.33 ms | 8.6 MiB | 270 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes): 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.53 µs | 8.93 µs | 33.2 µs | 17.0 KiB | 117,235 |
| 40 | 8.97 µs | 9.39 µs | 35.3 µs | 16.3 KiB | 111,510 |
| 80 | 11.2 µs | 12.2 µs | 38.8 µs | 20.5 KiB | 89,438 |
| 160 | 16.7 µs | 17.3 µs | 55.1 µs | 28.6 KiB | 59,835 |
| 320 | 27.0 µs | 29.8 µs | 80.4 µs | 48.1 KiB | 37,014 |
| 640 | 48.9 µs | 50.4 µs | 140 µs | 86.7 KiB | 20,468 |
| 1280 | 93.9 µs | 98.6 µs | 258 µs | 171.2 KiB | 10,644 |
| 2560 | 202 µs | 207 µs | 546 µs | 329.7 KiB | 4,957 |
| 5120 | 521 µs | 548 µs | 1.27 ms | 634.3 KiB | 1,921 |
| 10240 | 1.17 ms | 1.20 ms | 3.00 ms | 1.3 MiB | 854 |

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

**Measured: O(n)** (exponent 0.89, 10 sizes): ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 103 µs | 121 µs | 254 µs | 11.6 KiB | 9,671 |
| 40 | 215 µs | 257 µs | 686 µs | 18.2 KiB | 4,651 |
| 80 | 125 µs | 131 µs | 254 µs | 29.4 KiB | 7,992 |
| 160 | 251 µs | 325 µs | 797 µs | 53.8 KiB | 3,980 |
| 320 | 296 µs | 329 µs | 922 µs | 101.3 KiB | 3,382 |
| 640 | 501 µs | 594 µs | 1.09 ms | 196.3 KiB | 1,996 |
| 1280 | 1.11 ms | 1.17 ms | 2.10 ms | 387.2 KiB | 897 |
| 2560 | 1.95 ms | 2.36 ms | 3.10 ms | 767.2 KiB | 512 |
| 5120 | 3.76 ms | 4.05 ms | 5.28 ms | 1.5 MiB | 266 |
| 10240 | 6.03 ms | 6.32 ms | 7.74 ms | 3.0 MiB | 166 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 60.0 µs | 73.6 µs | 217 µs | 44.1 KiB | 16,658 |
| 40 | 97.2 µs | 110 µs | 278 µs | 83.0 KiB | 10,284 |
| 80 | 186 µs | 200 µs | 502 µs | 161.6 KiB | 5,377 |
| 160 | 344 µs | 368 µs | 771 µs | 318.6 KiB | 2,905 |
| 320 | 655 µs | 699 µs | 1.30 ms | 632.1 KiB | 1,526 |
| 640 | 1.43 ms | 1.57 ms | 2.76 ms | 1.2 MiB | 700 |
| 1280 | 2.62 ms | 2.75 ms | 4.05 ms | 2.5 MiB | 381 |
| 2560 | 5.13 ms | 5.31 ms | 6.71 ms | 4.9 MiB | 195 |
| 5120 | 10.4 ms | 10.6 ms | 12.3 ms | 9.8 MiB | 97 |
| 10240 | 24.6 ms | 25.0 ms | 27.0 ms | 19.7 MiB | 41 |

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
| 20 | 1.51 ms | 1.80 ms | 3.44 ms | 652.5 KiB | 660 |
| 40 | 1.99 ms | 2.78 ms | 3.31 ms | 1.3 MiB | 502 |
| 80 | 3.77 ms | 4.68 ms | 5.10 ms | 2.6 MiB | 265 |
| 160 | 7.38 ms | 9.38 ms | 8.86 ms | 5.3 MiB | 136 |
| 320 | 14.4 ms | 15.3 ms | 16.3 ms | 10.6 MiB | 69 |
| 640 | 28.3 ms | 32.0 ms | 29.9 ms | 21.4 MiB | 35 |
| 1280 | 56.4 ms | 57.8 ms | 58.5 ms | 43.7 MiB | 18 |
| 2560 | 114 ms | 117 ms | 116 ms | 25.9 MiB | 9 |
| 5120 | 231 ms | 232 ms | 235 ms | 54.2 MiB | 4 |
| 10240 | 462 ms | 466 ms | 473 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.21, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.77 µs | 6.83 µs | 5.98 µs | 7.4 KiB | 173,340 |
| 40 | 8.53 µs | 9.87 µs | 30.8 µs | 14.0 KiB | 117,300 |
| 80 | 17.4 µs | 19.8 µs | 66.4 µs | 27.3 KiB | 57,493 |
| 160 | 28.8 µs | 33.6 µs | 86.2 µs | 53.9 KiB | 34,715 |
| 320 | 54.9 µs | 61.3 µs | 156 µs | 107.0 KiB | 18,216 |
| 640 | 106 µs | 121 µs | 294 µs | 213.3 KiB | 9,438 |
| 1280 | 427 µs | 439 µs | 1.09 ms | 516.0 KiB | 2,341 |
| 2560 | 760 µs | 826 µs | 1.46 ms | 1.0 MiB | 1,316 |
| 5120 | 1.70 ms | 1.85 ms | 3.09 ms | 2.1 MiB | 588 |
| 10240 | 3.55 ms | 3.72 ms | 5.39 ms | 4.2 MiB | 281 |

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
| 20 | 2.02 ms | 2.10 ms | 3.67 ms | 1.2 MiB | 494 |
| 40 | 3.73 ms | 3.79 ms | 5.38 ms | 2.5 MiB | 268 |
| 80 | 7.15 ms | 7.43 ms | 8.86 ms | 5.0 MiB | 140 |
| 160 | 14.1 ms | 14.3 ms | 16.0 ms | 10.0 MiB | 71 |
| 320 | 27.8 ms | 28.1 ms | 29.7 ms | 20.0 MiB | 36 |
| 640 | 55.4 ms | 62.6 ms | 57.7 ms | 40.1 MiB | 18 |
| 1280 | 112 ms | 113 ms | 114 ms | 16.1 MiB | 9 |
| 2560 | 218 ms | 223 ms | 221 ms | 32.3 MiB | 5 |
| 5120 | 436 ms | 441 ms | 439 ms | 707.4 KiB | 2 |
| 10240 | 873 ms | 881 ms | 876 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.01, 10 sizes): ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.15 ms | 1.20 ms | 2.79 ms | 645.6 KiB | 871 |
| 40 | 2.00 ms | 2.06 ms | 3.69 ms | 1.3 MiB | 499 |
| 80 | 3.72 ms | 3.90 ms | 5.46 ms | 2.5 MiB | 268 |
| 160 | 7.19 ms | 7.31 ms | 9.03 ms | 5.2 MiB | 139 |
| 320 | 14.2 ms | 14.3 ms | 16.2 ms | 10.6 MiB | 70 |
| 640 | 28.2 ms | 32.9 ms | 30.4 ms | 21.4 MiB | 35 |
| 1280 | 56.4 ms | 56.6 ms | 58.5 ms | 43.6 MiB | 18 |
| 2560 | 114 ms | 114 ms | 116 ms | 25.7 MiB | 9 |
| 5120 | 229 ms | 229 ms | 232 ms | 53.9 MiB | 4 |
| 10240 | 459 ms | 459 ms | 463 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.35, 10 sizes): 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.22 µs | 9.73 µs | 4.33 µs | 9.3 KiB | 237,137 |
| 40 | 5.31 µs | 6.67 µs | 20.6 µs | 8.4 KiB | 188,460 |
| 80 | 8.62 µs | 9.06 µs | 29.1 µs | 16.2 KiB | 116,020 |
| 160 | 16.0 µs | 16.8 µs | 49.6 µs | 31.8 KiB | 62,324 |
| 320 | 29.8 µs | 30.9 µs | 86.3 µs | 63.1 KiB | 33,604 |
| 640 | 58.0 µs | 60.0 µs | 166 µs | 127.6 KiB | 17,242 |
| 1280 | 330 µs | 336 µs | 777 µs | 352.8 KiB | 3,027 |
| 2560 | 652 µs | 665 µs | 1.34 ms | 694.2 KiB | 1,533 |
| 5120 | 1.46 ms | 1.54 ms | 2.88 ms | 1.3 MiB | 686 |
| 10240 | 2.95 ms | 3.06 ms | 4.52 ms | 2.7 MiB | 339 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.88, 10 sizes): ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.20 µs | 3.28 µs | 13.2 µs | 4.5 KiB | 312,760 |
| 40 | 3.40 µs | 3.57 µs | 14.3 µs | 4.5 KiB | 293,899 |
| 80 | 3.88 µs | 4.01 µs | 15.6 µs | 4.5 KiB | 257,872 |
| 160 | 4.55 µs | 4.73 µs | 17.3 µs | 4.5 KiB | 219,813 |
| 320 | 6.28 µs | 6.54 µs | 22.0 µs | 4.5 KiB | 159,282 |
| 640 | 9.70 µs | 10.1 µs | 31.3 µs | 4.5 KiB | 103,139 |
| 1280 | 16.9 µs | 17.3 µs | 50.2 µs | 4.5 KiB | 59,066 |
| 2560 | 30.3 µs | 38.1 µs | 85.0 µs | 4.5 KiB | 32,970 |
| 5120 | 56.8 µs | 59.0 µs | 161 µs | 4.5 KiB | 17,593 |
| 10240 | 111 µs | 114 µs | 308 µs | 4.5 KiB | 8,986 |

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
| 20 | 9.47 µs | 11.6 µs | 9.71 µs | 3.7 KiB | 105,624 |
| 40 | 13.4 µs | 14.8 µs | 13.6 µs | 6.3 KiB | 74,419 |
| 80 | 22.7 µs | 24.3 µs | 94.3 µs | 11.6 KiB | 43,990 |
| 160 | 36.4 µs | 38.9 µs | 130 µs | 22.3 KiB | 27,443 |
| 320 | 63.7 µs | 71.6 µs | 195 µs | 44.7 KiB | 15,697 |
| 640 | 121 µs | 129 µs | 342 µs | 91.0 KiB | 8,280 |
| 1280 | 236 µs | 245 µs | 678 µs | 191.5 KiB | 4,234 |
| 2560 | 504 µs | 638 µs | 1.26 ms | 360.0 KiB | 1,982 |
| 5120 | 1.02 ms | 1.12 ms | 2.38 ms | 685.2 KiB | 982 |
| 10240 | 1.82 ms | 1.87 ms | 3.31 ms | 1.3 MiB | 549 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls. So where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time). Every moment of the operation then belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly. They are not measured against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.20 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.43 ms | 1.43 ms | 65% |
| `load-exception-registry` | 1 | 501 µs | 501 µs | 23% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 272 µs | 12% |

**At 10240 entrys** (whole operation: 37.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 24.6 ms | 24.6 ms | 66% |
| `load-exception-registry` | 1 | 6.03 ms | 6.03 ms | 16% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 6.80 ms | 18% |

## Cost model

Estimates use two bracketing price shapes. **Low** is CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time). **High** is duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-17T20:34:48.005Z` → `2026-11-17T20:35:39.711Z` (52 s), ci: CI (run 44167179680)
- Machine: AMD EPYC 9V74 80-Core Processor, 4 logical core(s) (2 physical), 15983 MB RAM, linux/x64, Node v24.22.2, GitHub Actions
- Git: `a818d5635be77d2a10710078525555624f69cf5c` on `fix/round7-gaps`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys: One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They show how _this_ package's cost changes between runs on comparable hardware, and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

