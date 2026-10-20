# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.83 ms** per operation compared with a bare-minimum baseline (**284%** of the baseline). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.83 ms | 31.1 ms |
| Added latency, relative to baseline | 284% | 331% |
| Added CPU time per operation | 2.70 ms | 31.0 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 – $1 |
| Single-core throughput ceiling of the overhead alone | 547 ops/s | 32 ops/s |

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
| 20 | 34.5 µs | 168 µs | 133 µs | 387% | 554 µs | $0.00028 – $0.0062 |
| 40 | 56.0 µs | 209 µs | 153 µs | 273% | 424 µs | $0.00032 – $0.0048 |
| 80 | 102 µs | 407 µs | 305 µs | 299% | 905 µs | $0.00064 – $0.010 |
| 160 | 193 µs | 656 µs | 463 µs | 241% | 887 µs | $0.00097 – $0.01 |
| 320 | 388 µs | 1.33 ms | 942 µs | 243% | 1.79 ms | $0.002 – $0.020 |
| 640 | 643 µs | 2.47 ms | 1.83 ms | 284% | 2.70 ms | $0.0038 – $0.030 |
| 1280 | 1.28 ms | 4.70 ms | 3.42 ms | 266% | 3.49 ms | $0.0071 – $0.039 |
| 2560 | 2.35 ms | 9.34 ms | 6.99 ms | 298% | 7.09 ms | $0.015 – $0.080 |
| 5120 | 4.60 ms | 18.9 ms | 14.3 ms | 311% | 14.5 ms | $0.030 – $0.163 |
| 10240 | 9.39 ms | 40.5 ms | 31.1 ms | 331% | 31.0 ms | $0.065 – $0.349 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `loadExceptionRegistry` | O(n) | O(n) | ✅ matches | 532 µs | 6.81 ms |
| `writeExceptionRegistry` | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.90 ms | 30.1 ms |
| `resolveExceptionPolicy` (glob-match) | O(n) | O(n) | ✅ matches | 35.5 ms | 552 ms |
| `resolveExceptionPolicy` (every-category) | O(n) | O(n log n) | 🟡 close (neighbouring class) | 162 µs | 4.32 ms |
| `evaluateExceptionRecord` | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `validateExceptionPolicyConfig` | O(n) | n/a | ❔ not enough data | n/a | n/a |
| `hashRequirementFields` | O(n) | O(n) | ✅ matches | 188 µs | 2.23 ms |

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

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 40 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 80 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 160 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 320 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 640 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 1280 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 2560 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 5120 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 10240 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |

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
| 20 | 29.1 µs | 31.4 µs | 67.8 µs | 7.3 KiB | 34,410 |
| 40 | 43.3 µs | 45.0 µs | 148 µs | 13.2 KiB | 23,112 |
| 80 | 83.8 µs | 87.1 µs | 293 µs | 25.1 KiB | 11,927 |
| 160 | 153 µs | 157 µs | 486 µs | 48.9 KiB | 6,546 |
| 320 | 288 µs | 294 µs | 848 µs | 96.5 KiB | 3,471 |
| 640 | 532 µs | 547 µs | 1.37 ms | 191.6 KiB | 1,878 |
| 1280 | 1.08 ms | 1.11 ms | 2.81 ms | 381.9 KiB | 929 |
| 2560 | 1.91 ms | 2.15 ms | 3.79 ms | 761.9 KiB | 522 |
| 5120 | 3.96 ms | 4.10 ms | 6.01 ms | 1.5 MiB | 253 |
| 10240 | 6.81 ms | 7.64 ms | 9.29 ms | 3.0 MiB | 147 |

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

**Measured: O(n)** (exponent 1.00, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 95.4 µs | 102 µs | 373 µs | 44.5 KiB | 10,483 |
| 40 | 154 µs | 170 µs | 489 µs | 83.3 KiB | 6,508 |
| 80 | 287 µs | 318 µs | 847 µs | 161.9 KiB | 3,488 |
| 160 | 519 µs | 543 µs | 1.34 ms | 319.5 KiB | 1,925 |
| 320 | 1.04 ms | 1.09 ms | 2.72 ms | 634.7 KiB | 959 |
| 640 | 1.90 ms | 2.04 ms | 3.62 ms | 1.2 MiB | 527 |
| 1280 | 3.53 ms | 3.62 ms | 5.28 ms | 2.5 MiB | 283 |
| 2560 | 6.88 ms | 7.00 ms | 8.80 ms | 4.9 MiB | 145 |
| 5120 | 13.9 ms | 14.2 ms | 16.3 ms | 9.8 MiB | 72 |
| 10240 | 30.1 ms | 30.6 ms | 33.2 ms | 19.7 MiB | 33 |

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
| 20 | 2.07 ms | 2.23 ms | 4.55 ms | 652.5 KiB | 482 |
| 40 | 2.41 ms | 3.53 ms | 4.13 ms | 1.3 MiB | 414 |
| 80 | 4.48 ms | 5.98 ms | 6.20 ms | 2.6 MiB | 223 |
| 160 | 8.78 ms | 11.0 ms | 10.5 ms | 5.3 MiB | 114 |
| 320 | 17.4 ms | 24.0 ms | 19.3 ms | 10.6 MiB | 57 |
| 640 | 35.5 ms | 36.2 ms | 40.7 ms | 21.5 MiB | 28 |
| 1280 | 67.6 ms | 67.9 ms | 70.5 ms | 43.7 MiB | 15 |
| 2560 | 137 ms | 138 ms | 140 ms | 25.9 MiB | 7 |
| 5120 | 277 ms | 278 ms | 289 ms | 54.2 MiB | 4 |
| 10240 | 552 ms | 560 ms | 565 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.14, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 8.06 µs | 10.1 µs | 8.50 µs | 7.4 KiB | 124,032 |
| 40 | 11.9 µs | 14.1 µs | 43.0 µs | 14.0 KiB | 83,951 |
| 80 | 22.8 µs | 27.2 µs | 80.9 µs | 27.3 KiB | 43,792 |
| 160 | 43.8 µs | 52.1 µs | 153 µs | 53.9 KiB | 22,831 |
| 320 | 83.4 µs | 103 µs | 274 µs | 107.0 KiB | 11,996 |
| 640 | 162 µs | 198 µs | 508 µs | 213.3 KiB | 6,184 |
| 1280 | 547 µs | 607 µs | 1.39 ms | 516.0 KiB | 1,827 |
| 2560 | 991 µs | 1.01 ms | 1.94 ms | 1.0 MiB | 1,010 |
| 5120 | 2.11 ms | 2.25 ms | 3.95 ms | 2.1 MiB | 475 |
| 10240 | 4.32 ms | 4.49 ms | 6.74 ms | 4.2 MiB | 232 |

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

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 40 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 80 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 160 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 320 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 640 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 1280 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 2560 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 5120 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 10240 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |

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

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 40 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 80 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 160 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 320 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 640 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 1280 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 2560 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 5120 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |
| 10240 | ❌ Cannot read properties of undefined (reading 'values') |  |  |  |  |

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

**Measured: O(n)** (exponent 0.92, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 15.3 µs | 18.0 µs | 15.8 µs | 3.7 KiB | 65,373 |
| 40 | 21.4 µs | 23.3 µs | 21.7 µs | 6.4 KiB | 46,781 |
| 80 | 35.2 µs | 37.8 µs | 37.6 µs | 11.7 KiB | 28,395 |
| 160 | 62.0 µs | 65.1 µs | 254 µs | 22.4 KiB | 16,117 |
| 320 | 106 µs | 114 µs | 392 µs | 45.6 KiB | 9,436 |
| 640 | 188 µs | 202 µs | 623 µs | 93.6 KiB | 5,327 |
| 1280 | 321 µs | 328 µs | 904 µs | 191.5 KiB | 3,112 |
| 2560 | 616 µs | 663 µs | 1.49 ms | 360.9 KiB | 1,624 |
| 5120 | 1.30 ms | 1.39 ms | 3.08 ms | 683.8 KiB | 770 |
| 10240 | 2.23 ms | 2.31 ms | 4.14 ms | 1.3 MiB | 448 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.47 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.90 ms | 1.90 ms | 77% |
| `load-exception-registry` | 1 | 532 µs | 532 µs | 22% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 41.0 µs | 1.7% |

**At 10240 entrys** (whole operation: 40.5 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 30.1 ms | 30.1 ms | 74% |
| `load-exception-registry` | 1 | 6.81 ms | 6.81 ms | 17% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 3.54 ms | 8.7% |

## Failed measurements

- **fn:reconcile-exceptions** at n20: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:reconcile-exceptions** at n40: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:reconcile-exceptions** at n80: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:reconcile-exceptions** at n160: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:reconcile-exceptions** at n320: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:reconcile-exceptions** at n640: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:reconcile-exceptions** at n1280: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:reconcile-exceptions** at n2560: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:reconcile-exceptions** at n5120: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:reconcile-exceptions** at n10240: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:evaluate-exception-record** at n20: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:evaluate-exception-record** at n40: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:evaluate-exception-record** at n80: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:evaluate-exception-record** at n160: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:evaluate-exception-record** at n320: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:evaluate-exception-record** at n640: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:evaluate-exception-record** at n1280: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:evaluate-exception-record** at n2560: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:evaluate-exception-record** at n5120: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:evaluate-exception-record** at n10240: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:validate-exception-policy-config** at n20: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:validate-exception-policy-config** at n40: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:validate-exception-policy-config** at n80: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:validate-exception-policy-config** at n160: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:validate-exception-policy-config** at n320: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:validate-exception-policy-config** at n640: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:validate-exception-policy-config** at n1280: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:validate-exception-policy-config** at n2560: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:validate-exception-policy-config** at n5120: TypeError: Cannot read properties of undefined (reading 'values')
- **fn:validate-exception-policy-config** at n10240: TypeError: Cannot read properties of undefined (reading 'values')

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-20T08:46:28.804Z` → `2026-10-20T08:46:56.442Z` (28 s), ci: CI (run 39393922433)
- Machine: Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `1831ca7deaf3e275b509755b9cba687091fc5811` on `dependabot/npm_and_yarn/internal-package-contract-v0.11.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

