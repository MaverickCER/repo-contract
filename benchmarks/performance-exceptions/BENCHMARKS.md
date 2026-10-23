# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.49 ms** per operation compared with a bare-minimum baseline (**263% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.00). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.49 ms | 25.6 ms |
| Added latency, relative to baseline | 263% | 328% |
| Added CPU time per operation | 2.42 ms | 25.2 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 671 ops/s | 39 ops/s |

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
| 20 | 25.5 µs | 127 µs | 101 µs | 396% | 383 µs | $0.00021 – $0.0043 |
| 40 | 43.3 µs | 175 µs | 131 µs | 303% | 431 µs | $0.00027 – $0.0048 |
| 80 | 81.7 µs | 311 µs | 229 µs | 280% | 622 µs | $0.00048 – $0.007 |
| 160 | 157 µs | 567 µs | 410 µs | 260% | 945 µs | $0.00085 – $0.011 |
| 320 | 301 µs | 1.09 ms | 788 µs | 262% | 1.97 ms | $0.0016 – $0.022 |
| 640 | 567 µs | 2.06 ms | 1.49 ms | 263% | 2.42 ms | $0.0031 – $0.027 |
| 1280 | 1.13 ms | 3.85 ms | 2.72 ms | 240% | 2.77 ms | $0.0057 – $0.031 |
| 2560 | 2.05 ms | 7.47 ms | 5.42 ms | 265% | 5.39 ms | $0.011 – $0.061 |
| 5120 | 3.89 ms | 15.2 ms | 11.3 ms | 289% | 11.2 ms | $0.023 – $0.126 |
| 10240 | 7.80 ms | 33.4 ms | 25.6 ms | 328% | 25.2 ms | $0.053 – $0.283 |

**How the total grows:** O(n) (linear), exponent 1.00 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 351 µs | 3.60 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 58.0 µs | 1.27 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 454 µs | 5.79 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.61 ms | 25.2 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 31.0 ms | 471 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 132 µs | 4.10 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 56.8 ms | 895 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 28.9 ms | 457 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 69.1 µs | 2.99 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 11.5 µs | 130 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 149 µs | 2.08 ms |

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

**Measured: O(n)** (exponent 0.86, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 99.4 µs | 108 µs | 379 µs | 115.4 KiB | 10,064 |
| 40 | 63.4 µs | 66.7 µs | 219 µs | 97.9 KiB | 15,778 |
| 80 | 75.4 µs | 76.9 µs | 262 µs | 120.4 KiB | 13,268 |
| 160 | 97.5 µs | 108 µs | 329 µs | 158.9 KiB | 10,258 |
| 320 | 141 µs | 144 µs | 451 µs | 237.1 KiB | 7,068 |
| 640 | 351 µs | 529 µs | 1.27 ms | 656.2 KiB | 2,848 |
| 1280 | 510 µs | 527 µs | 1.44 ms | 1.0 MiB | 1,961 |
| 2560 | 1.01 ms | 1.04 ms | 2.87 ms | 2.1 MiB | 992 |
| 5120 | 1.87 ms | 1.91 ms | 3.63 ms | 4.3 MiB | 534 |
| 10240 | 3.60 ms | 3.68 ms | 5.16 ms | 8.6 MiB | 277 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 10.4 µs | 10.8 µs | 10.5 µs | 17.0 KiB | 96,073 |
| 40 | 10.8 µs | 11.0 µs | 21.1 µs | 16.3 KiB | 92,245 |
| 80 | 14.1 µs | 14.7 µs | 25.1 µs | 20.5 KiB | 70,711 |
| 160 | 21.0 µs | 21.6 µs | 81.5 µs | 28.6 KiB | 47,584 |
| 320 | 33.6 µs | 34.6 µs | 129 µs | 48.2 KiB | 29,737 |
| 640 | 58.0 µs | 59.4 µs | 198 µs | 86.7 KiB | 17,236 |
| 1280 | 115 µs | 117 µs | 386 µs | 166.1 KiB | 8,694 |
| 2560 | 235 µs | 240 µs | 724 µs | 329.7 KiB | 4,256 |
| 5120 | 578 µs | 601 µs | 1.68 ms | 634.3 KiB | 1,729 |
| 10240 | 1.27 ms | 1.31 ms | 3.88 ms | 1.3 MiB | 785 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 19.7 µs | 21.5 µs | 19.9 µs | 7.3 KiB | 50,883 |
| 40 | 32.1 µs | 33.7 µs | 118 µs | 13.2 KiB | 31,165 |
| 80 | 59.9 µs | 61.5 µs | 199 µs | 25.1 KiB | 16,696 |
| 160 | 113 µs | 116 µs | 340 µs | 48.9 KiB | 8,844 |
| 320 | 227 µs | 233 µs | 685 µs | 96.5 KiB | 4,401 |
| 640 | 454 µs | 466 µs | 1.36 ms | 191.6 KiB | 2,204 |
| 1280 | 800 µs | 839 µs | 1.75 ms | 381.6 KiB | 1,249 |
| 2560 | 1.65 ms | 1.97 ms | 3.68 ms | 761.9 KiB | 604 |
| 5120 | 3.51 ms | 3.63 ms | 5.70 ms | 1.5 MiB | 285 |
| 10240 | 5.79 ms | 5.94 ms | 8.38 ms | 3.0 MiB | 173 |

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
| 20 | 83.3 µs | 99.6 µs | 185 µs | 44.5 KiB | 12,004 |
| 40 | 128 µs | 136 µs | 435 µs | 83.1 KiB | 7,828 |
| 80 | 230 µs | 248 µs | 689 µs | 161.5 KiB | 4,350 |
| 160 | 458 µs | 505 µs | 1.38 ms | 319.5 KiB | 2,186 |
| 320 | 768 µs | 802 µs | 1.68 ms | 632.2 KiB | 1,303 |
| 640 | 1.61 ms | 1.68 ms | 3.52 ms | 1.2 MiB | 621 |
| 1280 | 2.92 ms | 3.14 ms | 4.83 ms | 2.5 MiB | 343 |
| 2560 | 5.47 ms | 5.76 ms | 7.51 ms | 4.9 MiB | 183 |
| 5120 | 11.2 ms | 11.5 ms | 13.4 ms | 9.8 MiB | 89 |
| 10240 | 25.2 ms | 25.7 ms | 28.1 ms | 19.7 MiB | 40 |

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
| 20 | 1.97 ms | 2.05 ms | 4.65 ms | 652.5 KiB | 508 |
| 40 | 2.15 ms | 3.37 ms | 4.04 ms | 1.3 MiB | 464 |
| 80 | 4.01 ms | 5.27 ms | 5.88 ms | 2.6 MiB | 249 |
| 160 | 8.03 ms | 10.0 ms | 9.93 ms | 5.3 MiB | 125 |
| 320 | 15.6 ms | 17.3 ms | 17.7 ms | 10.6 MiB | 64 |
| 640 | 31.0 ms | 32.3 ms | 37.0 ms | 21.5 MiB | 32 |
| 1280 | 58.7 ms | 63.3 ms | 61.5 ms | 43.7 MiB | 17 |
| 2560 | 116 ms | 124 ms | 119 ms | 25.9 MiB | 9 |
| 5120 | 235 ms | 236 ms | 239 ms | 54.2 MiB | 4 |
| 10240 | 471 ms | 477 ms | 483 ms | 47.0 MiB | 2 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.44 µs | 7.51 µs | 6.78 µs | 7.4 KiB | 155,236 |
| 40 | 11.0 µs | 11.3 µs | 36.9 µs | 14.0 KiB | 90,536 |
| 80 | 19.9 µs | 21.3 µs | 75.6 µs | 27.3 KiB | 50,353 |
| 160 | 36.2 µs | 38.1 µs | 124 µs | 53.9 KiB | 27,661 |
| 320 | 69.3 µs | 82.5 µs | 224 µs | 107.0 KiB | 14,426 |
| 640 | 132 µs | 141 µs | 401 µs | 213.3 KiB | 7,594 |
| 1280 | 523 µs | 557 µs | 1.49 ms | 516.0 KiB | 1,912 |
| 2560 | 1.04 ms | 1.12 ms | 3.01 ms | 1.0 MiB | 959 |
| 5120 | 1.95 ms | 2.12 ms | 3.88 ms | 2.1 MiB | 512 |
| 10240 | 4.10 ms | 4.20 ms | 6.60 ms | 4.2 MiB | 244 |

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
| 20 | 2.17 ms | 2.25 ms | 4.53 ms | 1.2 MiB | 460 |
| 40 | 3.82 ms | 4.08 ms | 6.19 ms | 2.5 MiB | 262 |
| 80 | 7.47 ms | 7.63 ms | 9.91 ms | 5.0 MiB | 134 |
| 160 | 14.7 ms | 18.2 ms | 17.3 ms | 10.0 MiB | 68 |
| 320 | 31.4 ms | 39.0 ms | 34.0 ms | 20.0 MiB | 32 |
| 640 | 56.8 ms | 58.2 ms | 60.2 ms | 40.1 MiB | 18 |
| 1280 | 115 ms | 118 ms | 118 ms | 16.1 MiB | 9 |
| 2560 | 225 ms | 226 ms | 228 ms | 32.3 MiB | 4 |
| 5120 | 441 ms | 452 ms | 444 ms | 707.4 KiB | 2 |
| 10240 | 895 ms | 896 ms | 899 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.22 ms | 1.35 ms | 3.61 ms | 645.6 KiB | 822 |
| 40 | 2.03 ms | 2.42 ms | 4.26 ms | 1.3 MiB | 493 |
| 80 | 3.82 ms | 4.02 ms | 6.18 ms | 2.5 MiB | 262 |
| 160 | 7.23 ms | 7.63 ms | 9.59 ms | 5.2 MiB | 138 |
| 320 | 14.7 ms | 15.2 ms | 17.1 ms | 10.6 MiB | 68 |
| 640 | 28.9 ms | 29.6 ms | 31.3 ms | 21.4 MiB | 35 |
| 1280 | 58.8 ms | 59.5 ms | 61.8 ms | 43.6 MiB | 17 |
| 2560 | 118 ms | 120 ms | 120 ms | 25.7 MiB | 8 |
| 5120 | 235 ms | 239 ms | 238 ms | 53.9 MiB | 4 |
| 10240 | 457 ms | 462 ms | 462 ms | 46.2 MiB | 2 |

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

**Measured: O(n log n)** (exponent 1.30, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.91 µs | 12.1 µs | 5.05 µs | 9.3 KiB | 203,777 |
| 40 | 6.61 µs | 8.10 µs | 7.56 µs | 8.4 KiB | 151,338 |
| 80 | 12.0 µs | 12.3 µs | 49.4 µs | 16.2 KiB | 83,403 |
| 160 | 20.7 µs | 21.0 µs | 74.5 µs | 31.8 KiB | 48,362 |
| 320 | 42.1 µs | 46.6 µs | 160 µs | 63.1 KiB | 23,743 |
| 640 | 69.1 µs | 76.2 µs | 227 µs | 127.8 KiB | 14,479 |
| 1280 | 355 µs | 384 µs | 941 µs | 352.8 KiB | 2,819 |
| 2560 | 706 µs | 771 µs | 1.60 ms | 694.2 KiB | 1,417 |
| 5120 | 1.50 ms | 1.64 ms | 3.39 ms | 1.3 MiB | 666 |
| 10240 | 2.99 ms | 3.26 ms | 5.07 ms | 2.7 MiB | 334 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.89, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.37 µs | 3.86 µs | 3.40 µs | 4.5 KiB | 297,097 |
| 40 | 3.68 µs | 4.10 µs | 3.91 µs | 4.5 KiB | 271,787 |
| 80 | 4.15 µs | 4.57 µs | 4.18 µs | 4.5 KiB | 240,983 |
| 160 | 5.28 µs | 6.01 µs | 5.69 µs | 4.5 KiB | 189,552 |
| 320 | 7.61 µs | 8.56 µs | 13.7 µs | 4.5 KiB | 131,332 |
| 640 | 11.5 µs | 12.9 µs | 46.8 µs | 4.5 KiB | 86,886 |
| 1280 | 18.6 µs | 20.3 µs | 67.8 µs | 4.5 KiB | 53,798 |
| 2560 | 34.5 µs | 37.3 µs | 115 µs | 4.5 KiB | 28,953 |
| 5120 | 70.3 µs | 81.8 µs | 276 µs | 4.5 KiB | 14,220 |
| 10240 | 130 µs | 139 µs | 411 µs | 4.5 KiB | 7,713 |

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

**Measured: O(n)** (exponent 0.97, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.9 µs | 14.1 µs | 12.3 µs | 3.7 KiB | 83,892 |
| 40 | 16.2 µs | 19.2 µs | 17.1 µs | 6.3 KiB | 61,748 |
| 80 | 28.0 µs | 31.9 µs | 29.2 µs | 11.7 KiB | 35,691 |
| 160 | 44.1 µs | 49.2 µs | 95.9 µs | 22.3 KiB | 22,672 |
| 320 | 76.9 µs | 87.0 µs | 299 µs | 45.0 KiB | 13,011 |
| 640 | 149 µs | 165 µs | 530 µs | 92.1 KiB | 6,698 |
| 1280 | 280 µs | 312 µs | 916 µs | 191.5 KiB | 3,571 |
| 2560 | 533 µs | 579 µs | 1.49 ms | 360.9 KiB | 1,876 |
| 5120 | 1.18 ms | 1.28 ms | 3.23 ms | 685.3 KiB | 845 |
| 10240 | 2.08 ms | 2.19 ms | 4.20 ms | 1.3 MiB | 480 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.06 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.61 ms | 1.61 ms | 78% |
| `load-exception-registry` | 1 | 454 µs | 454 µs | 22% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 10240 entrys** (whole operation: 33.4 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 25.2 ms | 25.2 ms | 75% |
| `load-exception-registry` | 1 | 5.79 ms | 5.79 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.43 ms | 7.3% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-23T08:25:25.396Z` → `2026-10-23T08:26:24.854Z` (59 s), ci: CI (run 39922840872)
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `3353338870be39317cacea06985298a9ce822c7d` on `chore/security-and-dep-updates`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

