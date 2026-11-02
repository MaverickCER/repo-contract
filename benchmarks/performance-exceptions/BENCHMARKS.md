# repo-contract: performance and cost report

What does adopting this package add to latency, CPU, memory and compute spend -- and how does that grow with workload? Three views, from the whole to the part: **(1)** the end-to-end total, **(2)** every function on its own, **(3)** which functions make up the total. New to benchmarks? Read [READING-BENCHMARKS.md](../READING-BENCHMARKS.md) first.

## What adopting this package costs

For a typical workload of **640 entrys** per operation, routing the work through `repo-contract` adds **1.10 ms** per operation compared with a bare-minimum baseline (**317% of the baseline**). Overall, it grows O(n) with workload size (measured exponent 1.02). At list prices that is on the order of **~$0.001 – $0.01 per million operations** of compute.

> The relative figure and the growth class are the steadier ones: both come from the same run, so they depend far less on the machine than a time does, though runtime behaviour and contention on the runner still move them. The growth class is an empirical fit to the sizes tested, not a proof of asymptotic complexity. Dollar figures are **order-of-magnitude** estimates from published list prices on shared hardware (see _Cost model_ below) -- good for comparing one package with another, not for budgeting.

| Cost | Typical (640 entrys) | Largest (10240 entrys) |
| --- | --- | --- |
| Added latency per operation | 1.10 ms | 18.3 ms |
| Added latency, relative to baseline | 317% | 312% |
| Added CPU time per operation | 1.80 ms | 18.3 ms |
| Added memory per operation (heap delta) | 1.4 MiB | 23.3 MiB |
| Compute cost per 1M operations (order of magnitude) | ~$0.001 – $0.01 | ~$0.1 |
| Single-core throughput ceiling of the overhead alone | 911 ops/s | 55 ops/s |

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
| 20 | 15.1 µs | 71.1 µs | 56.0 µs | 370% | 210 µs | $0.00012 – $0.0024 |
| 40 | 25.3 µs | 98.5 µs | 73.2 µs | 289% | 172 µs | $0.00015 – $0.0019 |
| 80 | 47.7 µs | 184 µs | 136 µs | 285% | 319 µs | $0.00028 – $0.0036 |
| 160 | 92.5 µs | 332 µs | 240 µs | 259% | 447 µs | $0.0005 – $0.005 |
| 320 | 185 µs | 662 µs | 477 µs | 258% | 742 µs | $0.00099 – $0.0083 |
| 640 | 346 µs | 1.44 ms | 1.10 ms | 317% | 1.80 ms | $0.0023 – $0.020 |
| 1280 | 713 µs | 2.65 ms | 1.94 ms | 272% | 2.44 ms | $0.004 – $0.027 |
| 2560 | 1.40 ms | 5.31 ms | 3.91 ms | 278% | 4.06 ms | $0.0081 – $0.046 |
| 5120 | 2.87 ms | 10.9 ms | 8.03 ms | 280% | 8.39 ms | $0.017 – $0.094 |
| 10240 | 5.88 ms | 24.2 ms | 18.3 ms | 312% | 18.3 ms | $0.038 – $0.206 |

**How the total grows:** O(n) (linear), exponent 1.02 over 10 sizes.

## 2. Function by function

Every function the package exposes is measured on its own across the full size ladder, then its measured growth rate is compared with the big-O we documented for it. A function whose measured class **differs** from its documented one is the most useful thing in this report: either the documentation or the code is wrong.

| Function | Varies | Documented | Measured | Agreement | At 640 | At 10240 |
| --- | --- | --- | --- | --- | --- | --- |
| `reconcileExceptions` | entry | O(n) | O(n) | ✅ matches | 226 µs | 2.68 ms |
| `reconcileExceptions` | existing-records | O(n) | O(n log n) | 🟡 close (neighbouring class) | 37.1 µs | 829 µs |
| `loadExceptionRegistry` | entry | O(n) | O(n) | ✅ matches | 277 µs | 4.31 ms |
| `writeExceptionRegistry` | entry | O(n log n) | O(n) | 🟡 close (neighbouring class) | 1.13 ms | 19.9 ms |
| `resolveExceptionPolicy` (glob-match) | entry | O(n) | O(n) | ✅ matches | 20.9 ms | 373 ms |
| `resolveExceptionPolicy` (every-category) | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 82.6 µs | 2.78 ms |
| `evaluateExceptionRecord` | entry | O(n) | O(n) | ✅ matches | 45.7 ms | 665 ms |
| `evaluateExceptionRecord` | rules | O(n) | O(n) | ✅ matches | 19.8 ms | 321 ms |
| `validateExceptionPolicyConfig` | entry | O(n) | O(n log n) | 🟡 close (neighbouring class) | 40.4 µs | 2.24 ms |
| `validateExceptionPolicyConfig` | valid-requirements | O(n) | O(n) | ✅ matches | 6.57 µs | 74.7 µs |
| `hashRequirementFields` | entry | O(n) | O(n) | ✅ matches | 84.9 µs | 1.41 ms |

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

**Measured: O(n)** (exponent 0.93, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 58.0 µs | 72.1 µs | 184 µs | 117.4 KiB | 17,232 |
| 40 | 35.9 µs | 38.2 µs | 91.5 µs | 97.2 KiB | 27,861 |
| 80 | 42.9 µs | 53.7 µs | 110 µs | 123.7 KiB | 23,318 |
| 160 | 57.0 µs | 58.5 µs | 142 µs | 158.1 KiB | 17,559 |
| 320 | 83.3 µs | 85.7 µs | 209 µs | 239.2 KiB | 12,008 |
| 640 | 226 µs | 292 µs | 728 µs | 656.2 KiB | 4,417 |
| 1280 | 298 µs | 305 µs | 645 µs | 1.0 MiB | 3,360 |
| 2560 | 559 µs | 574 µs | 1.06 ms | 2.1 MiB | 1,789 |
| 5120 | 1.29 ms | 1.33 ms | 2.05 ms | 4.3 MiB | 772 |
| 10240 | 2.68 ms | 2.80 ms | 3.69 ms | 8.6 MiB | 372 |

##### Varying `existing-records`

How many records the registry already holds.

**Expected: O(n).** Each existing record is indexed once and checked for staleness once.

**Measured: O(n log n)** (exponent 1.16, 10 sizes) -- 🟡 close (neighbouring class).

| existing-records | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.63 µs | 7.25 µs | 21.1 µs | 17.0 KiB | 150,729 |
| 40 | 5.63 µs | 6.59 µs | 18.6 µs | 16.3 KiB | 177,504 |
| 80 | 7.45 µs | 10.8 µs | 23.7 µs | 20.5 KiB | 134,140 |
| 160 | 11.1 µs | 14.7 µs | 32.0 µs | 28.6 KiB | 89,857 |
| 320 | 17.9 µs | 23.9 µs | 49.8 µs | 48.2 KiB | 55,888 |
| 640 | 37.1 µs | 47.1 µs | 121 µs | 86.8 KiB | 26,925 |
| 1280 | 60.1 µs | 65.5 µs | 150 µs | 171.0 KiB | 16,650 |
| 2560 | 129 µs | 140 µs | 305 µs | 338.6 KiB | 7,739 |
| 5120 | 378 µs | 434 µs | 953 µs | 634.3 KiB | 2,646 |
| 10240 | 829 µs | 907 µs | 1.51 ms | 1.3 MiB | 1,206 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 12.9 µs | 14.7 µs | 27.4 µs | 7.3 KiB | 77,777 |
| 40 | 18.7 µs | 19.2 µs | 46.8 µs | 13.2 KiB | 53,480 |
| 80 | 36.2 µs | 41.5 µs | 87.2 µs | 25.1 KiB | 27,604 |
| 160 | 71.4 µs | 77.8 µs | 168 µs | 48.9 KiB | 14,003 |
| 320 | 139 µs | 146 µs | 299 µs | 96.4 KiB | 7,210 |
| 640 | 277 µs | 314 µs | 598 µs | 191.5 KiB | 3,615 |
| 1280 | 541 µs | 613 µs | 1.04 ms | 381.6 KiB | 1,849 |
| 2560 | 1.25 ms | 1.69 ms | 2.38 ms | 761.9 KiB | 802 |
| 5120 | 2.94 ms | 3.13 ms | 4.10 ms | 1.5 MiB | 340 |
| 10240 | 4.31 ms | 4.61 ms | 5.78 ms | 3.0 MiB | 232 |

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

**Measured: O(n)** (exponent 1.04, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 43.3 µs | 60.1 µs | 153 µs | 44.0 KiB | 23,104 |
| 40 | 71.9 µs | 89.3 µs | 183 µs | 82.8 KiB | 13,906 |
| 80 | 139 µs | 161 µs | 344 µs | 161.3 KiB | 7,193 |
| 160 | 283 µs | 360 µs | 788 µs | 319.5 KiB | 3,532 |
| 320 | 499 µs | 601 µs | 1.00 ms | 632.2 KiB | 2,003 |
| 640 | 1.13 ms | 1.33 ms | 2.20 ms | 1.2 MiB | 886 |
| 1280 | 1.89 ms | 1.98 ms | 2.93 ms | 2.5 MiB | 528 |
| 2560 | 3.79 ms | 4.19 ms | 5.05 ms | 4.9 MiB | 264 |
| 5120 | 8.11 ms | 9.03 ms | 9.76 ms | 9.8 MiB | 123 |
| 10240 | 19.9 ms | 20.8 ms | 22.0 ms | 19.7 MiB | 50 |

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

**Measured: O(n)** (exponent 1.05, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.16 ms | 1.46 ms | 2.73 ms | 652.5 KiB | 865 |
| 40 | 1.36 ms | 2.28 ms | 2.39 ms | 1.3 MiB | 733 |
| 80 | 2.54 ms | 3.49 ms | 3.54 ms | 2.6 MiB | 394 |
| 160 | 5.23 ms | 6.74 ms | 6.43 ms | 5.2 MiB | 191 |
| 320 | 10.5 ms | 11.8 ms | 11.7 ms | 10.6 MiB | 96 |
| 640 | 20.9 ms | 21.9 ms | 22.9 ms | 21.4 MiB | 48 |
| 1280 | 42.1 ms | 43.1 ms | 44.2 ms | 43.7 MiB | 24 |
| 2560 | 85.4 ms | 91.4 ms | 87.9 ms | 25.9 MiB | 12 |
| 5120 | 188 ms | 192 ms | 192 ms | 54.2 MiB | 5 |
| 10240 | 373 ms | 380 ms | 385 ms | 47.0 MiB | 3 |

#### Variant `every-category`

The category is `*`: every rule is combined with the stricter-of rule.

**Measured: O(n log n)** (exponent 1.23, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 4.80 µs | 11.1 µs | 5.00 µs | 7.4 KiB | 208,256 |
| 40 | 7.08 µs | 11.7 µs | 30.1 µs | 14.0 KiB | 141,159 |
| 80 | 14.0 µs | 22.8 µs | 51.3 µs | 27.3 KiB | 71,629 |
| 160 | 29.6 µs | 53.3 µs | 32.6 µs | 53.9 KiB | 33,833 |
| 320 | 45.7 µs | 63.9 µs | 134 µs | 107.0 KiB | 21,897 |
| 640 | 82.6 µs | 120 µs | 254 µs | 213.3 KiB | 12,102 |
| 1280 | 318 µs | 410 µs | 766 µs | 515.9 KiB | 3,146 |
| 2560 | 606 µs | 757 µs | 1.27 ms | 1.0 MiB | 1,650 |
| 5120 | 1.41 ms | 1.73 ms | 2.74 ms | 2.1 MiB | 711 |
| 10240 | 2.78 ms | 3.61 ms | 4.65 ms | 4.2 MiB | 360 |

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

**Measured: O(n)** (exponent 0.95, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 1.51 ms | 1.69 ms | 3.00 ms | 1.2 MiB | 662 |
| 40 | 3.01 ms | 3.18 ms | 4.64 ms | 2.5 MiB | 332 |
| 80 | 5.86 ms | 7.95 ms | 7.77 ms | 5.0 MiB | 171 |
| 160 | 11.0 ms | 11.7 ms | 13.1 ms | 10.0 MiB | 91 |
| 320 | 22.4 ms | 23.3 ms | 24.6 ms | 20.0 MiB | 45 |
| 640 | 45.7 ms | 46.4 ms | 48.3 ms | 40.1 MiB | 22 |
| 1280 | 89.2 ms | 90.3 ms | 96.8 ms | 16.1 MiB | 11 |
| 2560 | 169 ms | 177 ms | 171 ms | 32.3 MiB | 6 |
| 5120 | 313 ms | 330 ms | 315 ms | 708.6 KiB | 3 |
| 10240 | 665 ms | 672 ms | 668 ms | 1.4 MiB | 2 |

##### Varying `rules`

How many rules the policy group has.

**Expected: O(n).** Each classification scans the group's rules once.

**Measured: O(n)** (exponent 1.00, 10 sizes) -- ✅ matches.

| rules | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 702 µs | 733 µs | 1.39 ms | 643.3 KiB | 1,425 |
| 40 | 1.41 ms | 1.45 ms | 2.77 ms | 1.3 MiB | 711 |
| 80 | 2.58 ms | 2.64 ms | 4.00 ms | 2.5 MiB | 387 |
| 160 | 5.02 ms | 5.14 ms | 6.71 ms | 5.2 MiB | 199 |
| 320 | 10.1 ms | 10.3 ms | 12.1 ms | 10.6 MiB | 99 |
| 640 | 19.8 ms | 20.0 ms | 21.9 ms | 21.4 MiB | 50 |
| 1280 | 39.7 ms | 39.8 ms | 41.8 ms | 43.6 MiB | 25 |
| 2560 | 80.3 ms | 81.3 ms | 82.8 ms | 25.7 MiB | 12 |
| 5120 | 160 ms | 160 ms | 163 ms | 53.9 MiB | 6 |
| 10240 | 321 ms | 322 ms | 325 ms | 46.2 MiB | 3 |

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

**Measured: O(n log n)** (exponent 1.38, 10 sizes) -- 🟡 close (neighbouring class).

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 3.09 µs | 7.72 µs | 3.19 µs | 9.3 KiB | 323,912 |
| 40 | 3.60 µs | 4.53 µs | 13.6 µs | 8.4 KiB | 277,569 |
| 80 | 6.00 µs | 7.84 µs | 18.9 µs | 16.2 KiB | 166,802 |
| 160 | 10.6 µs | 10.9 µs | 28.7 µs | 31.8 KiB | 94,631 |
| 320 | 20.8 µs | 21.4 µs | 54.7 µs | 63.1 KiB | 48,002 |
| 640 | 40.4 µs | 41.5 µs | 103 µs | 127.8 KiB | 24,770 |
| 1280 | 236 µs | 244 µs | 600 µs | 352.8 KiB | 4,243 |
| 2560 | 483 µs | 492 µs | 1.04 ms | 694.2 KiB | 2,069 |
| 5120 | 1.09 ms | 1.12 ms | 2.28 ms | 1.3 MiB | 917 |
| 10240 | 2.24 ms | 2.30 ms | 3.59 ms | 2.7 MiB | 447 |

##### Varying `valid-requirements`

How many requirement names are valid.

**Expected: O(n).** Each requirement is looked up by scanning the list of valid names.

**Measured: O(n)** (exponent 0.87, 10 sizes) -- ✅ matches.

| valid-requirements | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 2.32 µs | 2.47 µs | 2.36 µs | 4.5 KiB | 430,115 |
| 40 | 2.30 µs | 2.43 µs | 9.32 µs | 4.5 KiB | 433,953 |
| 80 | 2.56 µs | 2.71 µs | 9.73 µs | 4.5 KiB | 390,847 |
| 160 | 3.13 µs | 3.28 µs | 10.5 µs | 4.5 KiB | 319,901 |
| 320 | 4.48 µs | 4.82 µs | 15.2 µs | 4.5 KiB | 223,199 |
| 640 | 6.57 µs | 6.87 µs | 20.7 µs | 4.5 KiB | 152,321 |
| 1280 | 10.7 µs | 11.1 µs | 30.7 µs | 4.5 KiB | 93,794 |
| 2560 | 19.5 µs | 22.1 µs | 56.0 µs | 4.5 KiB | 51,397 |
| 5120 | 34.8 µs | 50.4 µs | 92.7 µs | 4.5 KiB | 28,708 |
| 10240 | 74.7 µs | 82.2 µs | 203 µs | 4.5 KiB | 13,381 |

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

**Measured: O(n)** (exponent 1.03, 10 sizes) -- ✅ matches.

| entrys | Median | p95 | CPU (median) | Heap Δ | Ops/s |
| --- | --- | --- | --- | --- | --- |
| 20 | 6.74 µs | 8.10 µs | 6.91 µs | 3.6 KiB | 148,413 |
| 40 | 9.69 µs | 10.5 µs | 9.77 µs | 6.3 KiB | 103,232 |
| 80 | 15.5 µs | 16.8 µs | 60.4 µs | 11.6 KiB | 64,609 |
| 160 | 25.7 µs | 29.0 µs | 87.1 µs | 22.3 KiB | 38,982 |
| 320 | 46.0 µs | 50.1 µs | 143 µs | 44.6 KiB | 21,740 |
| 640 | 84.9 µs | 96.0 µs | 238 µs | 90.3 KiB | 11,780 |
| 1280 | 153 µs | 164 µs | 369 µs | 183.3 KiB | 6,545 |
| 2560 | 303 µs | 334 µs | 694 µs | 382.2 KiB | 3,303 |
| 5120 | 694 µs | 730 µs | 1.31 ms | 683.1 KiB | 1,441 |
| 10240 | 1.41 ms | 1.49 ms | 2.69 ms | 1.3 MiB | 712 |

## 3. What makes up one end-to-end operation

Each function's measured cost is multiplied by how many times one end-to-end operation calls it. A function measured on its own includes everything it calls, so where one attributed function calls another, the nested time is subtracted from the caller (its _exclusive_ time): every moment of the operation belongs to at most one row. Shares are measured against the whole operation with the package, a figure measured directly -- not against the _added_ time, which is the small difference of two noisy medians. They are estimates (each function was measured separately); the remainder is shown as _unattributed_.

**At 640 entrys** (whole operation: 1.44 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 1.13 ms | 1.13 ms | 78% |
| `load-exception-registry` | 1 | 277 µs | 277 µs | 19% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 38.8 µs | 2.7% |

**At 10240 entrys** (whole operation: 24.2 ms)

| Function | Calls / operation | Time if called that often | Exclusive time | Share of operation |
| --- | --- | --- | --- | --- |
| `write-exception-registry` | 1 | 19.9 ms | 19.9 ms | 82% |
| `load-exception-registry` | 1 | 4.31 ms | 4.31 ms | 18% |
| `reconcile-exceptions` | 0 | 0 | 0 | 0.0% |
| `resolve-exception-policy` | 0 | 0 | 0 | 0.0% |
| `evaluate-exception-record` | 0 | 0 | 0 | 0.0% |
| `validate-exception-policy-config` | 0 | 0 | 0 | 0.0% |
| `hash-requirement-fields` | 0 | 0 | 0 | 0.0% |
| _unattributed_ |  |  | 10.7 µs | 0.0% |

## Cost model

Estimates use two bracketing price shapes: **low** = CPU-priced compute ($0.040 per vCPU-hour, billed on CPU time) and **high** = duration-and-memory-priced functions ($0.000017 per GB-second, billed on wall time, at least 128 MB reserved). Both are rounded list prices and change over time; override them in `benchmark.config.json` → `costRates` to match your platform and negotiated pricing.

## Environment and method

- Run: `2026-11-02T18:43:17.544Z` → `2026-11-02T18:44:01.995Z` (44 s), ci: CI (run 41501094531)
- Machine: AMD EPYC 9V45 96-Core Processor, 4 logical core(s) (2 physical), 15984 MB RAM, linux/x64, Node v24.22.1, GitHub Actions
- Git: `2067bcb6637d6c1cde36be8ecd0f548588aacc6c` on `changeset-release/main`
- Sizes: 20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240 entrys -- One entry of the main input a helper reads, writes or judges: an exception record, a finding, a rule of a policy config, a requirement field or a classification. Each function says which. 640 is a very large registry.

**Do not compare these numbers with another machine's, another day's, or another package's.** They exist to show how _this_ package's cost changes between runs on comparable hardware and how it scales with size. See [READING-BENCHMARKS.md](../READING-BENCHMARKS.md).

