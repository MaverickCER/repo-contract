# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.03 ms** per operation compared with a bare-minimum baseline (**303% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.03 ms | 17.1 ms |
| Added latency, relative to baseline | 303% | 301% |
| Added CPU time per operation | 1.70 ms | 17.0 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 968 ops/s | 59 ops/s |

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
| 20 | 14.5 µs | 71.1 µs | 56.6 µs | 390% | 222 µs | $0.00012 – $0.0025 |
| 40 | 25.0 µs | 97.7 µs | 72.7 µs | 290% | 163 µs | $0.00015 – $0.0018 |
| 80 | 45.6 µs | 184 µs | 138 µs | 303% | 320 µs | $0.00029 – $0.0036 |
| 160 | 94.0 µs | 334 µs | 240 µs | 255% | 426 µs | $0.0005 – $0.0048 |
| 320 | 180 µs | 645 µs | 464 µs | 258% | 720 µs | $0.00097 – $0.0081 |
| 640 | 341 µs | 1.37 ms | 1.03 ms | 303% | 1.70 ms | $0.0022 – $0.019 |
| 1280 | 677 µs | 2.72 ms | 2.04 ms | 302% | 2.55 ms | $0.0043 – $0.029 |
| 2560 | 1.39 ms | 5.25 ms | 3.85 ms | 277% | 3.85 ms | $0.008 – $0.043 |
| 5120 | 2.82 ms | 10.8 ms | 8.03 ms | 285% | 8.34 ms | $0.017 – $0.094 |
| 10240 | 5.68 ms | 22.8 ms | 17.1 ms | 301% | 17.0 ms | $0.036 – $0.191 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 165 µs | 2.39 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 30.6 µs | 788 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 277 µs | 3.90 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.05 ms | 16.5 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 19.1 ms | 320 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 68.5 µs | 2.58 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 37.7 ms | 680 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 20.1 ms | 325 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 39.2 µs | 2.19 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 6.33 µs | 70.0 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 79.9 µs | 1.32 ms |

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
| 20 | 53.5 µs | 65.9 µs | 169 µs | 120.0 KiB | 18,689 |
| 40 | 33.0 µs | 34.6 µs | 81.3 µs | 97.1 KiB | 30,259 |
| 80 | 39.1 µs | 39.9 µs | 98.7 µs | 124.2 KiB | 25,582 |
| 160 | 50.8 µs | 52.5 µs | 128 µs | 158.1 KiB | 19,701 |
| 320 | 77.0 µs | 80.2 µs | 190 µs | 239.5 KiB | 12,987 |
| 640 | 165 µs | 215 µs | 502 µs | 524.5 KiB | 6,055 |
| 1280 | 278 µs | 283 µs | 619 µs | 1.0 MiB | 3,599 |
| 2560 | 544 µs | 560 µs | 1.06 ms | 2.1 MiB | 1,837 |
| 5120 | 1.22 ms | 1.27 ms | 2.17 ms | 4.3 MiB | 819 |
| 10240 | 2.39 ms | 2.43 ms | 3.04 ms | 8.6 MiB | 419 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.18, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.56 µs | 6.15 µs | 19.3 µs | 17.0 KiB | 179,956 |
| 40 | 5.48 µs | 5.71 µs | 19.1 µs | 16.3 KiB | 182,345 |
| 80 | 6.98 µs | 7.31 µs | 23.1 µs | 20.5 KiB | 143,252 |
| 160 | 9.95 µs | 10.2 µs | 29.7 µs | 28.6 KiB | 100,521 |
| 320 | 16.5 µs | 17.0 µs | 45.1 µs | 48.1 KiB | 60,489 |
| 640 | 30.6 µs | 31.2 µs | 78.0 µs | 87.8 KiB | 32,681 |
| 1280 | 64.5 µs | 65.8 µs | 158 µs | 171.0 KiB | 15,509 |
| 2560 | 131 µs | 134 µs | 315 µs | 338.6 KiB | 7,654 |
| 5120 | 352 µs | 359 µs | 744 µs | 668.2 KiB | 2,844 |
| 10240 | 788 µs | 798 µs | 1.50 ms | 1.3 MiB | 1,270 |

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
| 20 | 13.4 µs | 14.2 µs | 56.0 µs | 7.3 KiB | 74,635 |
| 40 | 19.9 µs | 20.5 µs | 53.6 µs | 13.2 KiB | 50,147 |
| 80 | 38.0 µs | 38.9 µs | 96.3 µs | 25.1 KiB | 26,334 |
| 160 | 73.6 µs | 78.7 µs | 178 µs | 48.9 KiB | 13,578 |
| 320 | 139 µs | 143 µs | 308 µs | 96.4 KiB | 7,200 |
| 640 | 277 µs | 285 µs | 617 µs | 191.5 KiB | 3,604 |
| 1280 | 533 µs | 558 µs | 1.06 ms | 381.6 KiB | 1,876 |
| 2560 | 1.09 ms | 1.43 ms | 2.23 ms | 761.9 KiB | 914 |
| 5120 | 2.54 ms | 2.71 ms | 3.79 ms | 1.5 MiB | 394 |
| 10240 | 3.90 ms | 4.09 ms | 5.35 ms | 3.0 MiB | 257 |

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
| 20 | 39.8 µs | 46.4 µs | 132 µs | 43.8 KiB | 25,097 |
| 40 | 68.4 µs | 79.1 µs | 181 µs | 82.8 KiB | 14,613 |
| 80 | 126 µs | 142 µs | 291 µs | 161.1 KiB | 7,953 |
| 160 | 251 µs | 281 µs | 582 µs | 318.6 KiB | 3,982 |
| 320 | 477 µs | 511 µs | 972 µs | 632.2 KiB | 2,097 |
| 640 | 1.05 ms | 1.11 ms | 2.08 ms | 1.2 MiB | 957 |
| 1280 | 1.94 ms | 2.02 ms | 2.98 ms | 2.5 MiB | 516 |
| 2560 | 3.76 ms | 3.86 ms | 4.90 ms | 4.9 MiB | 266 |
| 5120 | 7.61 ms | 13.2 ms | 9.02 ms | 9.8 MiB | 131 |
| 10240 | 16.5 ms | 16.9 ms | 18.2 ms | 19.7 MiB | 61 |

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
| 20 | 1.17 ms | 1.37 ms | 2.77 ms | 652.5 KiB | 857 |
| 40 | 1.32 ms | 2.13 ms | 2.33 ms | 1.3 MiB | 756 |
| 80 | 2.56 ms | 3.33 ms | 3.58 ms | 2.6 MiB | 391 |
| 160 | 5.23 ms | 6.36 ms | 6.28 ms | 5.2 MiB | 191 |
| 320 | 9.98 ms | 11.1 ms | 11.4 ms | 10.6 MiB | 100 |
| 640 | 19.1 ms | 19.5 ms | 20.2 ms | 21.4 MiB | 52 |
| 1280 | 39.1 ms | 42.4 ms | 40.5 ms | 43.7 MiB | 26 |
| 2560 | 76.8 ms | 79.4 ms | 78.6 ms | 25.9 MiB | 13 |
| 5120 | 158 ms | 163 ms | 163 ms | 54.3 MiB | 6 |
| 10240 | 320 ms | 323 ms | 329 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.26, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.77 µs | 4.70 µs | 4.09 µs | 7.4 KiB | 265,523 |
| 40 | 5.23 µs | 6.51 µs | 17.2 µs | 14.0 KiB | 191,325 |
| 80 | 9.18 µs | 13.4 µs | 25.6 µs | 27.3 KiB | 108,982 |
| 160 | 17.5 µs | 21.3 µs | 46.7 µs | 53.9 KiB | 57,166 |
| 320 | 34.0 µs | 39.5 µs | 93.8 µs | 107.2 KiB | 29,430 |
| 640 | 68.5 µs | 73.8 µs | 182 µs | 213.7 KiB | 14,596 |
| 1280 | 283 µs | 314 µs | 644 µs | 515.9 KiB | 3,529 |
| 2560 | 561 µs | 581 µs | 1.12 ms | 1.0 MiB | 1,782 |
| 5120 | 1.21 ms | 1.35 ms | 2.37 ms | 2.1 MiB | 827 |
| 10240 | 2.58 ms | 2.85 ms | 4.33 ms | 4.2 MiB | 388 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.36 ms | 1.39 ms | 2.64 ms | 1.2 MiB | 735 |
| 40 | 2.49 ms | 2.63 ms | 3.78 ms | 2.5 MiB | 401 |
| 80 | 4.74 ms | 4.85 ms | 6.01 ms | 5.0 MiB | 211 |
| 160 | 9.35 ms | 9.67 ms | 10.7 ms | 10.0 MiB | 107 |
| 320 | 18.7 ms | 19.3 ms | 20.5 ms | 20.0 MiB | 53 |
| 640 | 37.7 ms | 38.5 ms | 39.6 ms | 40.1 MiB | 27 |
| 1280 | 85.3 ms | 87.3 ms | 86.8 ms | 16.1 MiB | 12 |
| 2560 | 171 ms | 176 ms | 173 ms | 32.3 MiB | 6 |
| 5120 | 353 ms | 409 ms | 355 ms | 707.4 KiB | 3 |
| 10240 | 680 ms | 746 ms | 682 ms | 1.4 MiB | 1 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 789 µs | 807 µs | 1.46 ms | 643.3 KiB | 1,268 |
| 40 | 1.52 ms | 1.60 ms | 2.85 ms | 1.3 MiB | 658 |
| 80 | 2.69 ms | 2.75 ms | 4.05 ms | 2.5 MiB | 371 |
| 160 | 5.10 ms | 5.25 ms | 6.46 ms | 5.2 MiB | 196 |
| 320 | 10.1 ms | 13.0 ms | 11.4 ms | 10.6 MiB | 99 |
| 640 | 20.1 ms | 31.6 ms | 21.6 ms | 21.4 MiB | 50 |
| 1280 | 40.9 ms | 41.3 ms | 42.4 ms | 43.6 MiB | 24 |
| 2560 | 80.5 ms | 80.8 ms | 82.5 ms | 25.7 MiB | 12 |
| 5120 | 163 ms | 170 ms | 166 ms | 53.9 MiB | 6 |
| 10240 | 325 ms | 327 ms | 328 ms | 46.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.40, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.79 µs | 7.12 µs | 2.84 µs | 9.3 KiB | 358,958 |
| 40 | 3.21 µs | 3.35 µs | 10.6 µs | 8.4 KiB | 311,547 |
| 80 | 5.60 µs | 6.03 µs | 16.6 µs | 16.2 KiB | 178,432 |
| 160 | 10.4 µs | 10.6 µs | 28.8 µs | 31.8 KiB | 96,465 |
| 320 | 20.1 µs | 21.1 µs | 52.8 µs | 63.1 KiB | 49,844 |
| 640 | 39.2 µs | 40.8 µs | 100 µs | 127.8 KiB | 25,514 |
| 1280 | 207 µs | 209 µs | 464 µs | 349.8 KiB | 4,836 |
| 2560 | 471 µs | 480 µs | 1.02 ms | 694.2 KiB | 2,123 |
| 5120 | 1.05 ms | 1.08 ms | 2.21 ms | 1.3 MiB | 949 |
| 10240 | 2.19 ms | 2.30 ms | 3.45 ms | 2.7 MiB | 458 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.07 µs | 2.13 µs | 8.18 µs | 4.5 KiB | 482,088 |
| 40 | 2.12 µs | 2.20 µs | 7.83 µs | 4.5 KiB | 471,068 |
| 80 | 2.37 µs | 2.46 µs | 8.54 µs | 4.5 KiB | 422,420 |
| 160 | 3.07 µs | 3.28 µs | 10.1 µs | 4.5 KiB | 325,383 |
| 320 | 4.18 µs | 4.42 µs | 12.9 µs | 4.5 KiB | 239,474 |
| 640 | 6.33 µs | 6.69 µs | 18.7 µs | 4.5 KiB | 158,042 |
| 1280 | 10.5 µs | 12.3 µs | 28.9 µs | 4.5 KiB | 94,927 |
| 2560 | 18.1 µs | 21.5 µs | 48.8 µs | 4.5 KiB | 55,353 |
| 5120 | 34.8 µs | 44.0 µs | 93.7 µs | 4.5 KiB | 28,746 |
| 10240 | 70.0 µs | 75.6 µs | 199 µs | 4.5 KiB | 14,284 |

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
| 20 | 7.96 µs | 9.79 µs | 8.21 µs | 3.7 KiB | 125,550 |
| 40 | 9.67 µs | 10.9 µs | 9.76 µs | 6.3 KiB | 103,436 |
| 80 | 15.5 µs | 19.9 µs | 60.3 µs | 11.6 KiB | 64,566 |
| 160 | 24.0 µs | 26.8 µs | 80.6 µs | 22.2 KiB | 41,595 |
| 320 | 41.9 µs | 46.3 µs | 121 µs | 44.4 KiB | 23,854 |
| 640 | 79.9 µs | 87.6 µs | 212 µs | 89.7 KiB | 12,516 |
| 1280 | 150 µs | 165 µs | 372 µs | 183.3 KiB | 6,658 |
| 2560 | 294 µs | 319 µs | 673 µs | 382.2 KiB | 3,400 |
| 5120 | 634 µs | 674 µs | 1.23 ms | 643.1 KiB | 1,577 |
| 10240 | 1.32 ms | 1.40 ms | 2.47 ms | 1.3 MiB | 760 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.37 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.05 ms | 1.05 ms | 76% |
| `load-exception-registry` | 1 | 277 µs | 277 µs | 20% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 51.7 µs | 3.8% |

**At 10240 entrys** (whole operation: 22.8 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 16.5 ms | 16.5 ms | 72% |
| `load-exception-registry` | 1 | 3.90 ms | 3.90 ms | 17% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 2.40 ms | 11% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-24T12:49:02.432Z` → `2026-10-24T12:49:45.862Z` (43 s), ci: CI (run 40094646708)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15990 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `08a56952368f6314fb95ed92557172cba05e5702` on `chore/zod-advisory`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

