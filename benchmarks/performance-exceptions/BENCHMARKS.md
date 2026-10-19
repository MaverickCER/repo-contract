# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **962 µs** per operation compared with a bare-minimum baseline (**281% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 962 µs | 16.7 ms |
| Added latency, relative to baseline | 281% | 304% |
| Added CPU time per operation | 1.60 ms | 16.6 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 1,039 ops/s | 60 ops/s |

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
| 20 | 13.7 µs | 66.7 µs | 53.0 µs | 387% | 210 µs | $0.00011 – $0.0024 |
| 40 | 25.0 µs | 91.6 µs | 66.6 µs | 267% | 158 µs | $0.00014 – $0.0018 |
| 80 | 45.2 µs | 163 µs | 117 µs | 260% | 236 µs | $0.00024 – $0.0027 |
| 160 | 86.6 µs | 321 µs | 235 µs | 271% | 434 µs | $0.00049 – $0.0049 |
| 320 | 177 µs | 615 µs | 437 µs | 247% | 679 µs | $0.00091 – $0.0076 |
| 640 | 343 µs | 1.31 ms | 962 µs | 281% | 1.60 ms | $0.002 – $0.018 |
| 1280 | 654 µs | 2.52 ms | 1.86 ms | 285% | 2.39 ms | $0.0039 – $0.027 |
| 2560 | 1.36 ms | 4.94 ms | 3.58 ms | 262% | 3.59 ms | $0.0075 – $0.040 |
| 5120 | 2.65 ms | 9.98 ms | 7.33 ms | 276% | 7.38 ms | $0.015 – $0.083 |
| 10240 | 5.49 ms | 22.2 ms | 16.7 ms | 304% | 16.6 ms | $0.035 – $0.186 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 170 µs | 2.41 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 29.1 µs | 754 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 269 µs | 3.87 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.04 ms | 16.4 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 19.2 ms | 37.8 ms (at 1280) |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 67.9 µs | 265 µs (at 1280) |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 36.5 ms | 71.3 ms (at 1280) |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 18.6 ms | 39.7 ms (at 1280) |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 36.4 µs | 204 µs (at 1280) |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(log n) | 🟡 close (neighbouring class) | 6.16 µs | 10.1 µs (at 1280) |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 75.7 µs | 1.28 ms |

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

**In the end-to-end run:** Once per run, between reading and writing the registry.

**Measured: O(n)** (exponent 0.98, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 51.1 µs | 64.9 µs | 160 µs | 120.0 KiB | 19,555 |
| 40 | 32.7 µs | 34.1 µs | 86.3 µs | 97.2 KiB | 30,590 |
| 80 | 39.1 µs | 41.2 µs | 98.5 µs | 124.2 KiB | 25,598 |
| 160 | 50.1 µs | 52.4 µs | 125 µs | 158.1 KiB | 19,942 |
| 320 | 75.1 µs | 90.7 µs | 185 µs | 239.5 KiB | 13,311 |
| 640 | 170 µs | 275 µs | 520 µs | 524.5 KiB | 5,898 |
| 1280 | 274 µs | 287 µs | 609 µs | 1.0 MiB | 3,650 |
| 2560 | 543 µs | 571 µs | 1.06 ms | 2.1 MiB | 1,843 |
| 5120 | 1.23 ms | 1.79 ms | 2.20 ms | 4.3 MiB | 815 |
| 10240 | 2.41 ms | 2.45 ms | 2.97 ms | 8.6 MiB | 415 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.19, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.37 µs | 5.53 µs | 18.8 µs | 17.0 KiB | 186,371 |
| 40 | 5.47 µs | 5.68 µs | 19.1 µs | 16.3 KiB | 182,883 |
| 80 | 6.89 µs | 7.16 µs | 23.1 µs | 20.5 KiB | 145,066 |
| 160 | 9.32 µs | 9.64 µs | 28.4 µs | 28.6 KiB | 107,318 |
| 320 | 15.6 µs | 15.8 µs | 43.9 µs | 48.2 KiB | 64,303 |
| 640 | 29.1 µs | 29.6 µs | 75.2 µs | 87.8 KiB | 34,322 |
| 1280 | 61.2 µs | 62.2 µs | 151 µs | 171.0 KiB | 16,350 |
| 2560 | 124 µs | 127 µs | 300 µs | 338.6 KiB | 8,080 |
| 5120 | 343 µs | 358 µs | 729 µs | 668.2 KiB | 2,916 |
| 10240 | 754 µs | 794 µs | 1.44 ms | 1.3 MiB | 1,327 |

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
| 20 | 11.7 µs | 12.4 µs | 45.6 µs | 7.3 KiB | 85,111 |
| 40 | 18.7 µs | 21.1 µs | 47.9 µs | 13.2 KiB | 53,345 |
| 80 | 35.1 µs | 36.9 µs | 85.8 µs | 25.1 KiB | 28,526 |
| 160 | 70.6 µs | 72.6 µs | 178 µs | 48.9 KiB | 14,159 |
| 320 | 140 µs | 147 µs | 310 µs | 96.4 KiB | 7,153 |
| 640 | 269 µs | 287 µs | 597 µs | 191.5 KiB | 3,719 |
| 1280 | 514 µs | 529 µs | 1.02 ms | 381.6 KiB | 1,947 |
| 2560 | 1.12 ms | 1.35 ms | 2.25 ms | 761.9 KiB | 893 |
| 5120 | 2.41 ms | 2.52 ms | 3.59 ms | 1.5 MiB | 415 |
| 10240 | 3.87 ms | 4.11 ms | 5.27 ms | 3.0 MiB | 259 |

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
| 20 | 39.2 µs | 43.3 µs | 129 µs | 43.8 KiB | 25,490 |
| 40 | 66.0 µs | 87.0 µs | 168 µs | 82.7 KiB | 15,149 |
| 80 | 123 µs | 127 µs | 286 µs | 161.1 KiB | 8,155 |
| 160 | 241 µs | 259 µs | 560 µs | 318.6 KiB | 4,156 |
| 320 | 471 µs | 500 µs | 969 µs | 632.2 KiB | 2,125 |
| 640 | 1.04 ms | 1.12 ms | 2.09 ms | 1.2 MiB | 960 |
| 1280 | 1.85 ms | 1.94 ms | 2.88 ms | 2.5 MiB | 539 |
| 2560 | 3.71 ms | 3.81 ms | 4.86 ms | 4.9 MiB | 270 |
| 5120 | 7.14 ms | 7.44 ms | 8.46 ms | 9.8 MiB | 140 |
| 10240 | 16.4 ms | 31.5 ms | 18.0 ms | 19.7 MiB | 61 |

### `resolveExceptionPolicy`

**Why we benchmark it.** It decides, for each exception record, which policy applies, and runs once per classification of every record.

**What poor performance would mean.** Slower judgement of every record in proportion to how many rules a policy has.

**Expected growth: O(n).** It scans the group's rules for an exact match and then for glob matches, so cost is proportional to the number of rules.

**Measured on a shorter ladder (20, 40, 80, 160, 320, 640, 1280).** Every call builds a regular expression for each rule it tests, so sizes beyond a few thousand rules take minutes per sample; no real policy has that many.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| rules | swept | The tier axis: rules in the group. |
| category | variant | An exact rule, a category matched by a glob, or every category at once. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

#### Variant `glob-match`

The category matches one glob rule.

**Measured: O(n)** (exponent 0.97, 7 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 947 µs | 1.05 ms | 1.72 ms | 649.5 KiB | 1,056 |
| 40 | 1.30 ms | 1.62 ms | 2.28 ms | 1.3 MiB | 769 |
| 80 | 2.55 ms | 3.23 ms | 3.58 ms | 2.6 MiB | 391 |
| 160 | 4.92 ms | 6.10 ms | 5.98 ms | 5.2 MiB | 203 |
| 320 | 9.56 ms | 10.8 ms | 10.7 ms | 10.6 MiB | 105 |
| 640 | 19.2 ms | 21.5 ms | 20.4 ms | 21.4 MiB | 52 |
| 1280 | 37.8 ms | 38.8 ms | 39.5 ms | 43.7 MiB | 26 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.15, 7 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.70 µs | 4.76 µs | 3.78 µs | 7.4 KiB | 270,356 |
| 40 | 5.06 µs | 6.39 µs | 15.6 µs | 14.0 KiB | 197,436 |
| 80 | 9.50 µs | 11.3 µs | 26.7 µs | 27.3 KiB | 105,258 |
| 160 | 17.8 µs | 21.0 µs | 48.1 µs | 53.9 KiB | 56,194 |
| 320 | 33.4 µs | 35.9 µs | 89.4 µs | 107.2 KiB | 29,971 |
| 640 | 67.9 µs | 79.4 µs | 183 µs | 213.3 KiB | 14,718 |
| 1280 | 265 µs | 290 µs | 600 µs | 515.9 KiB | 3,774 |

### `evaluateExceptionRecord`

**Why we benchmark it.** It decides whether one record is permitted, and runs for every record of a registry.

**What poor performance would mean.** Slower judgement of a whole registry, multiplied by the number of classifications each record carries and the rules each policy has.

**Expected growth: O(n).** Each classification is resolved once, so cost is proportional to the number of classifications.

**Measured on a shorter ladder (20, 40, 80, 160, 320, 640, 1280).** Every call builds a regular expression for each rule it tests, so sizes beyond a few thousand rules take minutes per sample; no real policy has that many.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| classifications | swept | The tier axis: classifications the record is judged under. |
| rules | swept | How many rules the policy group has. |
| requirements | fixed at 4 | How many fields the policy's matching rule requires. Each costs one field read and one trim, which is too small next to resolving the rules to measure a growth rate of its own. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n)** (exponent 0.97, 7 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.41 ms | 1.44 ms | 2.72 ms | 1.2 MiB | 710 |
| 40 | 2.51 ms | 2.61 ms | 3.81 ms | 2.5 MiB | 399 |
| 80 | 4.85 ms | 4.96 ms | 6.13 ms | 5.0 MiB | 206 |
| 160 | 9.62 ms | 9.70 ms | 11.0 ms | 10.0 MiB | 104 |
| 320 | 18.3 ms | 25.1 ms | 19.6 ms | 20.0 MiB | 55 |
| 640 | 36.5 ms | 36.9 ms | 37.9 ms | 40.1 MiB | 27 |
| 1280 | 71.3 ms | 71.6 ms | 72.6 ms | 16.1 MiB | 14 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 7 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 667 µs | 674 µs | 1.29 ms | 643.3 KiB | 1,499 |
| 40 | 1.34 ms | 1.38 ms | 2.60 ms | 1.3 MiB | 748 |
| 80 | 2.46 ms | 2.51 ms | 3.72 ms | 2.5 MiB | 406 |
| 160 | 4.74 ms | 4.85 ms | 6.01 ms | 5.2 MiB | 211 |
| 320 | 9.34 ms | 9.51 ms | 10.6 ms | 10.6 MiB | 107 |
| 640 | 18.6 ms | 19.7 ms | 20.0 ms | 21.4 MiB | 54 |
| 1280 | 39.7 ms | 40.3 ms | 41.2 ms | 43.6 MiB | 25 |

### `validateExceptionPolicyConfig`

**Why we benchmark it.** A check validates its policy config before it judges a single record, once per run.

**What poor performance would mean.** Slower starts for every check in proportion to how large its policy is.

**Expected growth: O(n).** Each rule is validated once, and each required field is looked up in the list of valid ones.

**Measured on a shorter ladder (20, 40, 80, 160, 320, 640, 1280).** Every call builds a regular expression for each rule it tests, so sizes beyond a few thousand rules take minutes per sample; no real policy has that many.

**Variables that could change its cost**

| Variable | How it is handled | What it is |
| --- | --- | --- |
| rules | swept | The tier axis: rules in the config. |
| valid-requirements | swept | How many requirement names are valid. |
| runtime | fixed at "Node (V8)" | Measured on Node only. |

**In the end-to-end run:** Not part of the end-to-end operation, which reads and writes a registry.

**Measured: O(n log n)** (exponent 1.15, 7 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.80 µs | 6.98 µs | 2.84 µs | 9.3 KiB | 357,410 |
| 40 | 3.32 µs | 3.44 µs | 11.4 µs | 8.4 KiB | 300,898 |
| 80 | 7.24 µs | 7.79 µs | 28.9 µs | 16.2 KiB | 138,199 |
| 160 | 10.0 µs | 10.5 µs | 27.7 µs | 31.8 KiB | 99,628 |
| 320 | 19.3 µs | 20.2 µs | 50.0 µs | 63.1 KiB | 51,811 |
| 640 | 36.4 µs | 37.6 µs | 91.3 µs | 127.7 KiB | 27,443 |
| 1280 | 204 µs | 207 µs | 445 µs | 349.8 KiB | 4,910 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(log n)** (exponent 0.51, 7 sizes) -- 🟡 close (neighbouring class).

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.85 µs | 1.92 µs | 6.89 µs | 4.5 KiB | 539,387 |
| 40 | 1.98 µs | 2.04 µs | 7.16 µs | 4.5 KiB | 505,690 |
| 80 | 2.38 µs | 2.46 µs | 8.37 µs | 4.5 KiB | 420,444 |
| 160 | 3.14 µs | 3.34 µs | 10.6 µs | 4.5 KiB | 318,065 |
| 320 | 4.13 µs | 4.77 µs | 12.9 µs | 4.5 KiB | 242,045 |
| 640 | 6.16 µs | 6.46 µs | 18.2 µs | 4.5 KiB | 162,311 |
| 1280 | 10.1 µs | 10.6 µs | 27.3 µs | 4.5 KiB | 99,007 |

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

**Measured: O(n)** (exponent 1.02, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.92 µs | 6.84 µs | 6.00 µs | 3.6 KiB | 169,004 |
| 40 | 8.83 µs | 9.38 µs | 8.93 µs | 6.2 KiB | 113,240 |
| 80 | 14.0 µs | 14.7 µs | 54.0 µs | 11.6 KiB | 71,180 |
| 160 | 22.5 µs | 24.8 µs | 72.5 µs | 22.2 KiB | 44,362 |
| 320 | 40.0 µs | 55.6 µs | 112 µs | 44.3 KiB | 25,023 |
| 640 | 75.7 µs | 90.3 µs | 202 µs | 89.7 KiB | 13,202 |
| 1280 | 143 µs | 152 µs | 354 µs | 183.3 KiB | 7,013 |
| 2560 | 281 µs | 309 µs | 639 µs | 382.2 KiB | 3,556 |
| 5120 | 601 µs | 636 µs | 1.16 ms | 643.1 KiB | 1,663 |
| 10240 | 1.28 ms | 1.38 ms | 2.40 ms | 1.3 MiB | 782 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.31 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.04 ms | 1.04 ms | 80% |
| `load-exception-registry` | 1 | 269 µs | 269 µs | 21% |
| `reconcile-exceptions` | 1 | 170 µs | 170 µs | 13% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 10240 entrys** (whole operation: 22.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 16.4 ms | 16.4 ms | 74% |
| `load-exception-registry` | 1 | 3.87 ms | 3.87 ms | 17% |
| `reconcile-exceptions` | 1 | 2.41 ms | 2.41 ms | 11% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-19T13:03:41.144Z` → `2026-10-19T13:04:05.480Z` (24 s), ci: CI (run 39254970455)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `9a7f16bb0d0e2237799eb2925b1b4d3de7798c99` on `changeset-release/main`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

