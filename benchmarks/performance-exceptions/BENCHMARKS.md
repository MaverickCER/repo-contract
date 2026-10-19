# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.64 ms** per operation compared with a bare-minimum baseline (**275% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.01). At list prices that is on the order of **~$0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.64 ms | 28.1 ms |
| Added latency, relative to baseline | 275% | 323% |
| Added CPU time per operation | 2.58 ms | 28.1 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 612 ops/s | 36 ops/s |

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
| 20 | 26.8 µs | 146 µs | 119 µs | 445% | 75.1 µs | $0.00025 – $0.00084 |
| 40 | 47.8 µs | 202 µs | 155 µs | 323% | 487 µs | $0.00032 – $0.0055 |
| 80 | 88.3 µs | 387 µs | 299 µs | 339% | 1.00 ms | $0.00062 – $0.011 |
| 160 | 166 µs | 623 µs | 457 µs | 275% | 1.03 ms | $0.00095 – $0.012 |
| 320 | 318 µs | 1.18 ms | 860 µs | 271% | 2.14 ms | $0.0018 – $0.024 |
| 640 | 595 µs | 2.23 ms | 1.64 ms | 275% | 2.58 ms | $0.0034 – $0.029 |
| 1280 | 1.19 ms | 4.16 ms | 2.97 ms | 251% | 3.03 ms | $0.0062 – $0.034 |
| 2560 | 2.18 ms | 8.13 ms | 5.95 ms | 273% | 5.96 ms | $0.012 – $0.067 |
| 5120 | 4.24 ms | 16.8 ms | 12.5 ms | 295% | 12.7 ms | $0.026 – $0.142 |
| 10240 | 8.72 ms | 36.9 ms | 28.1 ms | 323% | 28.1 ms | $0.059 – $0.316 |

**How the total grows:** O(n) (linear), exponent 1.01 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 364 µs | 3.84 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 64.5 µs | 1.39 ms |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 469 µs | 6.06 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.69 ms | 26.3 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 35.1 ms | 64.0 ms (at 1280) |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 146 µs | 560 µs (at 1280) |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 61.6 ms | 123 ms (at 1280) |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 31.7 ms | 63.3 ms (at 1280) |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 81.6 µs | 454 µs (at 1280) |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(log n) | 🟡 close (neighbouring class) | 13.2 µs | 23.7 µs (at 1280) |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 157 µs | 2.13 ms |

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

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 117 µs | 152 µs | 390 µs | 115.6 KiB | 8,571 |
| 40 | 81.5 µs | 123 µs | 256 µs | 99.2 KiB | 12,274 |
| 80 | 81.8 µs | 85.0 µs | 277 µs | 120.4 KiB | 12,229 |
| 160 | 110 µs | 113 µs | 386 µs | 159.3 KiB | 9,094 |
| 320 | 152 µs | 156 µs | 478 µs | 237.1 KiB | 6,558 |
| 640 | 364 µs | 577 µs | 1.31 ms | 656.2 KiB | 2,750 |
| 1280 | 540 µs | 568 µs | 1.51 ms | 1.0 MiB | 1,852 |
| 2560 | 918 µs | 936 µs | 1.86 ms | 2.1 MiB | 1,090 |
| 5120 | 1.98 ms | 2.03 ms | 3.72 ms | 4.3 MiB | 506 |
| 10240 | 3.84 ms | 3.98 ms | 5.44 ms | 8.6 MiB | 261 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.12, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 11.7 µs | 12.2 µs | 11.8 µs | 17.0 KiB | 85,764 |
| 40 | 11.5 µs | 11.9 µs | 11.7 µs | 16.3 KiB | 87,179 |
| 80 | 15.4 µs | 15.9 µs | 16.1 µs | 20.5 KiB | 65,082 |
| 160 | 22.2 µs | 23.5 µs | 72.0 µs | 28.6 KiB | 45,008 |
| 320 | 35.1 µs | 36.9 µs | 141 µs | 48.3 KiB | 28,493 |
| 640 | 64.5 µs | 69.0 µs | 241 µs | 86.8 KiB | 15,496 |
| 1280 | 125 µs | 131 µs | 410 µs | 166.1 KiB | 7,997 |
| 2560 | 259 µs | 268 µs | 784 µs | 329.7 KiB | 3,860 |
| 5120 | 624 µs | 640 µs | 1.78 ms | 634.3 KiB | 1,604 |
| 10240 | 1.39 ms | 1.44 ms | 4.10 ms | 1.3 MiB | 722 |

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
| 20 | 20.7 µs | 23.5 µs | 21.0 µs | 7.3 KiB | 48,362 |
| 40 | 35.0 µs | 36.8 µs | 133 µs | 13.2 KiB | 28,574 |
| 80 | 62.4 µs | 65.0 µs | 207 µs | 25.1 KiB | 16,014 |
| 160 | 123 µs | 130 µs | 393 µs | 48.9 KiB | 8,138 |
| 320 | 236 µs | 249 µs | 708 µs | 96.5 KiB | 4,241 |
| 640 | 469 µs | 492 µs | 1.41 ms | 191.6 KiB | 2,134 |
| 1280 | 837 µs | 866 µs | 1.82 ms | 381.6 KiB | 1,194 |
| 2560 | 1.74 ms | 2.00 ms | 3.86 ms | 761.9 KiB | 576 |
| 5120 | 3.65 ms | 3.76 ms | 5.93 ms | 1.5 MiB | 274 |
| 10240 | 6.06 ms | 6.41 ms | 8.77 ms | 3.0 MiB | 165 |

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
| 20 | 89.3 µs | 107 µs | 215 µs | 44.5 KiB | 11,197 |
| 40 | 145 µs | 160 µs | 529 µs | 83.3 KiB | 6,913 |
| 80 | 268 µs | 278 µs | 903 µs | 161.9 KiB | 3,729 |
| 160 | 486 µs | 511 µs | 1.44 ms | 319.5 KiB | 2,060 |
| 320 | 952 µs | 1.06 ms | 2.85 ms | 634.8 KiB | 1,050 |
| 640 | 1.69 ms | 1.81 ms | 3.67 ms | 1.2 MiB | 590 |
| 1280 | 3.07 ms | 3.19 ms | 5.09 ms | 2.5 MiB | 326 |
| 2560 | 5.87 ms | 6.11 ms | 8.06 ms | 4.9 MiB | 170 |
| 5120 | 11.8 ms | 12.1 ms | 14.2 ms | 9.8 MiB | 85 |
| 10240 | 26.3 ms | 26.7 ms | 29.3 ms | 19.7 MiB | 38 |

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

**Measured: O(n)** (exponent 0.99, 7 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.81 ms | 2.26 ms | 4.43 ms | 652.5 KiB | 552 |
| 40 | 2.25 ms | 3.57 ms | 4.20 ms | 1.3 MiB | 445 |
| 80 | 4.24 ms | 5.46 ms | 6.19 ms | 2.6 MiB | 236 |
| 160 | 8.28 ms | 10.6 ms | 10.3 ms | 5.3 MiB | 121 |
| 320 | 16.2 ms | 19.0 ms | 18.3 ms | 10.6 MiB | 62 |
| 640 | 35.1 ms | 35.6 ms | 40.8 ms | 21.5 MiB | 28 |
| 1280 | 64.0 ms | 68.7 ms | 67.0 ms | 43.7 MiB | 16 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.12, 7 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.81 µs | 8.56 µs | 7.07 µs | 7.4 KiB | 146,922 |
| 40 | 11.8 µs | 12.6 µs | 27.7 µs | 14.0 KiB | 84,864 |
| 80 | 22.4 µs | 23.7 µs | 36.6 µs | 27.3 KiB | 44,741 |
| 160 | 38.0 µs | 40.3 µs | 133 µs | 53.9 KiB | 26,316 |
| 320 | 78.8 µs | 82.2 µs | 291 µs | 107.0 KiB | 12,695 |
| 640 | 146 µs | 153 µs | 469 µs | 213.3 KiB | 6,870 |
| 1280 | 560 µs | 577 µs | 1.58 ms | 516.0 KiB | 1,785 |

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

**Measured: O(n)** (exponent 0.98, 7 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.36 ms | 2.42 ms | 4.84 ms | 1.2 MiB | 424 |
| 40 | 4.29 ms | 4.48 ms | 6.79 ms | 2.5 MiB | 233 |
| 80 | 8.16 ms | 9.54 ms | 10.6 ms | 5.0 MiB | 123 |
| 160 | 15.9 ms | 20.9 ms | 18.4 ms | 10.0 MiB | 63 |
| 320 | 31.0 ms | 35.9 ms | 33.9 ms | 20.0 MiB | 32 |
| 640 | 61.6 ms | 66.9 ms | 64.4 ms | 40.1 MiB | 16 |
| 1280 | 123 ms | 133 ms | 127 ms | 16.1 MiB | 8 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 0.98, 7 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.38 ms | 1.44 ms | 3.82 ms | 645.0 KiB | 726 |
| 40 | 2.31 ms | 2.40 ms | 4.75 ms | 1.3 MiB | 433 |
| 80 | 4.19 ms | 4.33 ms | 6.65 ms | 2.6 MiB | 239 |
| 160 | 8.00 ms | 8.23 ms | 10.5 ms | 5.2 MiB | 125 |
| 320 | 16.0 ms | 17.4 ms | 18.7 ms | 10.6 MiB | 63 |
| 640 | 31.7 ms | 32.3 ms | 34.4 ms | 21.4 MiB | 32 |
| 1280 | 63.3 ms | 69.5 ms | 66.6 ms | 43.7 MiB | 16 |

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

**Measured: O(n log n)** (exponent 1.22, 7 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 5.55 µs | 13.1 µs | 5.68 µs | 9.3 KiB | 180,115 |
| 40 | 6.96 µs | 8.36 µs | 11.0 µs | 8.4 KiB | 143,759 |
| 80 | 12.7 µs | 13.0 µs | 51.9 µs | 16.2 KiB | 79,015 |
| 160 | 22.3 µs | 23.3 µs | 82.4 µs | 31.8 KiB | 44,846 |
| 320 | 41.9 µs | 43.6 µs | 144 µs | 63.1 KiB | 23,878 |
| 640 | 81.6 µs | 84.2 µs | 281 µs | 127.5 KiB | 12,259 |
| 1280 | 454 µs | 465 µs | 1.45 ms | 340.8 KiB | 2,205 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(log n)** (exponent 0.58, 7 sizes) -- 🟡 close (neighbouring class).

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.85 µs | 4.11 µs | 3.90 µs | 4.5 KiB | 260,057 |
| 40 | 4.13 µs | 4.46 µs | 4.18 µs | 4.5 KiB | 241,982 |
| 80 | 4.76 µs | 5.00 µs | 4.81 µs | 4.5 KiB | 210,235 |
| 160 | 6.00 µs | 6.53 µs | 6.09 µs | 4.5 KiB | 166,662 |
| 320 | 8.70 µs | 9.22 µs | 14.0 µs | 4.5 KiB | 114,894 |
| 640 | 13.2 µs | 13.7 µs | 54.2 µs | 4.5 KiB | 75,754 |
| 1280 | 23.7 µs | 25.3 µs | 49.9 µs | 4.5 KiB | 42,127 |

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

**Measured: O(n)** (exponent 0.96, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 13.9 µs | 17.0 µs | 14.1 µs | 3.7 KiB | 72,189 |
| 40 | 17.5 µs | 19.5 µs | 17.7 µs | 6.3 KiB | 56,998 |
| 80 | 28.4 µs | 30.5 µs | 29.3 µs | 11.7 KiB | 35,264 |
| 160 | 49.3 µs | 51.9 µs | 77.1 µs | 22.4 KiB | 20,287 |
| 320 | 85.9 µs | 92.8 µs | 329 µs | 45.0 KiB | 11,644 |
| 640 | 157 µs | 174 µs | 553 µs | 92.1 KiB | 6,358 |
| 1280 | 297 µs | 326 µs | 957 µs | 191.5 KiB | 3,363 |
| 2560 | 558 µs | 618 µs | 1.58 ms | 360.0 KiB | 1,793 |
| 5120 | 1.21 ms | 1.32 ms | 3.19 ms | 685.3 KiB | 825 |
| 10240 | 2.13 ms | 2.23 ms | 4.33 ms | 1.3 MiB | 468 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 2.23 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.69 ms | 1.69 ms | 76% |
| `load-exception-registry` | 1 | 469 µs | 469 µs | 21% |
| `reconcile-exceptions` | 1 | 364 µs | 364 µs | 16% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 0 | 0.0% |

**At 10240 entrys** (whole operation: 36.9 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 26.3 ms | 26.3 ms | 71% |
| `load-exception-registry` | 1 | 6.06 ms | 6.06 ms | 16% |
| `reconcile-exceptions` | 1 | 3.84 ms | 3.84 ms | 10% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 665 µs | 1.8% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-10-19T07:04:38.962Z` → `2026-10-19T07:05:13.787Z` (35 s), ci: CI (run 39211536253)
- Machine: INTEL(R) XEON(R) PLATINUM 8573C, 4 logical core(s) (2 physical), 15989 MB RAM, linux/x64, Node v24.21.0, GitHub Actions
- Git: `815dd5ed4df740239025d431bf0867004cac63e7` on `feat/adopt-ipc-v0.12.0`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

