---
title: How Does Git Scale With Commit Count? Benchmarking 10K to 10M Commits
description: I built synthetic Git repos from 10K to 10M commits to measure how history length affects count, log, blame and clone times, and what commit-graphs, Bloom filters and pack layout actually buy you.
pubDate: 2026-10-18
heroImage: ../../assets/blog/git.jpg
---

---
title: How Does Git Scale With Commit Count? Benchmarking 10K to 10M Commits
description: I built synthetic Git repos from 10K to 10M commits to measure how history length affects count, log, blame and clone times, and what commit-graphs, Bloom filters and pack layout actually buy you.
pubDate: 2026-10-18
heroImage: ../../assets/blog/git.jpg
---

This started as a dumb idea: build a GitHub repository with a record
number of commits. Then I found out people had already done it, and the
record sits around 100 million empty commits
([RVFET/committed](https://github.com/RVFET/committed), according to its
README). So I swapped in a more useful question: what does a long
history actually cost Git, and what do Git's built-in speedups buy you?

I built synthetic repositories with 10K, 100K, 1M and 10M commits, then
measured four history operations and four kinds of clone. The short
version:

- Without an index, `git rev-list --count`, `git log` and `git blame`
  slow down roughly 10× to 14× for every 10× more commits.
- The commit-graph makes counting commits about 5× to 8× faster in the
  larger runs. At 10K, the measured speedup is about 8.5×, but that ratio
  is less reliable because the timings are close to the measurement floor.
  It gave no consistent gain for `git log --oneline`.
- Changed-path Bloom filters help path-based operations. At 10M
  commits, blame dropped from about 68 seconds to 22 seconds, and
  `git log -n 1 -- static.txt` from 62 seconds to 28 seconds. The
  indexes move the curve down; they don't flatten it.
- Shallow-clone time grows from about 0.03 seconds at 10K to about
  3 seconds at 10M in the original pack layout. A separate 1M-commit
  control showed that repacking without deltas made the shallow clone
  about 8× faster. Pack layout clearly matters, though I haven't isolated
  the exact mechanism.

Everything here comes from one laptop and one Git version. Cache state
was not independently controlled or verified, and I flag where the
numbers are thin.

## The question

How do selected Git operations scale with history length in a controlled
synthetic repository, and how do commit-graphs and changed-path Bloom
filters change that?

Commit count is the variable I care about. Object count, pack size and
the number of stored file versions grow with it, and I don't isolate
them from one another except in the narrow controls in the shallow-clone
section.

## What I found in prior work

My search was limited to a couple dozen queries, without academic
databases, so read this as "what I found," not "what exists."

- **Redstone (2012).** The closest relative I found is a synthetic
  linear repository with 4 million commits and 1.3 million files,
  measured at one size, before commit-graphs and Bloom filters
  existed. It was repacked with a deep, wide delta window (depth 100,
  window 250), a very different pack layout from mine.
- **Commit-graph.** Microsoft's write-up and GitHub's coverage discuss
  the feature. The original [Git commit
  message](https://github.com/git/git/commit/177722b344) reports
  `rev-list --all` on a Linux copy of about 679K commits going from
  5.89 seconds to 1.07 seconds, roughly 5.5×.
- **Changed-path Bloom filters.** The patch series introducing them
  reported 2× to 6× for `git log -- <path>` on Git, Linux, Android and
  an internal repository of about 420K commits, and 10× to 30× on the
  internal repository. The series listed blame as future work.
- **Clones.** GitHub's data-driven clone study compared full, shallow,
  treeless and blobless clones on repositories including jQuery, Swift
  (about 130K commits) and Linux (about 1M). Its companion post, [Get
  up to speed with partial clone and shallow
  clone](https://github.blog/open-source/git/get-up-to-speed-with-partial-clone-and-shallow-clone/),
  explains the trade-offs.
- **Real monorepos.** Grab's Go monorepo had about 13 million commits.
  Pruning it to about 15.8 thousand cut clone time from 7.9 to 5.1
  minutes, but refs, trees and storage shrank at the same time, so
  commit count wasn't isolated. Dropbox shrank a monorepo from 87 GB
  to 20 GB by repacking with a larger delta depth and window, and
  clones dropped to under 15 minutes. Pack layout can matter as much
  as history length.
- **Other benchmarks and record repositories.** Git's performance test
  suite runs against real repositories rather than providing a
  commit-count sweep. The
  [RVFET/committed](https://github.com/RVFET/committed) and
  [Wuerfelhusten/commitment](https://github.com/Wuerfelhusten/commitment)
  repositories report reaching 100 million commits, but do not publish
  performance benchmarks.

I didn't find a controlled synthetic sweep across commit counts on
modern Git that compares no index, commit-graph and Bloom filters. That
conclusion is based on a limited search, so I'm presenting this as a
complement to real-repository measurements, not as a first.

## Setup

### Hardware and software

- Windows 11 Pro laptop, Intel Core i5-10210U (4 cores, 8 threads, 1.6
  GHz base), 16 GB RAM.
- Everything ran inside WSL2 (Ubuntu), with repositories on the Linux
  filesystem, not under `/mnt/c`.
- Git 2.53.0, hyperfine 1.19.0, Python 3.14.4, matplotlib 3.10.7.
- WSL had 7.7 GB of RAM for generation and history benchmarks. After
  my first 10M full clone was killed by the out-of-memory killer (Git
  at about 7.3 GB resident), I raised WSL to 11 GB plus 8 GB of swap
  for the 10M clone rerun.
- The laptop has a 250 GB SSD and a 1 TB HDD. I believe C: is the SSD,
  but I never confirmed it.

### The dataset

A Python script, `gen.py`, builds repositories with `git fast-import`.

- Linear history, no branches or merges, one fixed author, timestamps
  rising one second per commit.
- Commit *i* changes one of 100 small files (`data/f0.txt` to
  `data/f99.txt`), and the content is the commit number.
- Commit 1 also adds `static.txt` (20 lines), which is never touched
  again. This forces blame and path-limited log to search the full
  history. My first dataset lacked it, so blame would have stopped
  after about 100 commits. I caught that and regenerated the
  repositories before collecting the reported benchmarks.
- Resulting `.git` sizes: 4.4 MB, 43 MB, 424 MB and 4.3 GB, each with
  a single pack containing about four objects per commit (about 40
  million at 10M). Generation ran at 8,000 to 10,000 commits per
  second, so 10M took about 17 minutes.
- The `fast-import` packs are heavily delta-compressed (434 MB at 1M),
  and I never ran the original repositories through `git gc`. That
  turns out to matter, as the shallow-clone section shows.

For controls, I also generated `empty-1m` (empty commits) and `tip-1m`
(empty commits, with all 100 files plus `static.txt` added only in the
last commit).

### What I measured

Four history operations:

```bash
git rev-list --count HEAD        # count
git log --oneline                # log
git log -n 1 -- static.txt       # logfile: must search the whole history
git blame static.txt             # blame
```

`static.txt` only changes in commit 1, so `logfile` and `blame` have to
reach all the way back to find it.

Three index configurations:

1. **No graph:** `-c core.commitGraph=false`, with no commit-graph file
   present.
2. **Commit-graph:** built after the no-graph runs.
3. **Graph plus Bloom:** built after the plain-graph benchmarks.

```bash
# Commit-graph
git commit-graph write --reachable

# Commit-graph with changed-path Bloom filters
git commit-graph write --reachable --changed-paths
```

Clones were full, `--depth 1` (shallow), `--filter=blob:none` (blobless)
and `--filter=tree:0` (treeless), all with `--no-checkout` from a
`file://` URL so Git uses the real transfer path.

### Timing and cache state

I used hyperfine with `-N` (no shell) and one warmup run. History
operations got 10 timed runs at 10K and 100K, 5 at 1M and 3 at 10M.
Clone benchmarks got 5, 5, 3 and 1 runs respectively. The main history
benchmarks saved summary CSVs only (mean, standard deviation, median,
minimum and maximum); per-run data exists only for later diagnostic
experiments.

A warmup run does not guarantee a known cache state. I did not
independently control or verify whether operating-system and filesystem
caches were warm or cold, so these results should not be read as a
controlled warm-cache-versus-cold-cache comparison.

## Results

### History operations

Mean seconds. The indexed 10K count timings (about 4 ms) are close to
hyperfine's measurement floor, so treat the ratios at that size as
indicative only.

| Commits | Index         |  `count` |    `log` | `logfile` |  `blame` |
|--------:|---------------|---------:|---------:|----------:|---------:|
|     10K | None          |    0.034 |    0.046 |     0.053 |    0.062 |
|     10K | Graph         |    0.004 |    0.041 |     0.022 |    0.026 |
|     10K | Graph + Bloom |    0.004 |    0.042 |     0.009 |    0.009 |
|    100K | None          |    0.379 |    0.480 |     0.585 |    0.662 |
|    100K | Graph         |    0.050 |    0.542 |     0.351 |    0.378 |
|    100K | Graph + Bloom |    0.054 |    0.559 |     0.130 |    0.111 |
|      1M | None          |    4.666 |    6.068 |     7.715 |    7.782 |
|      1M | Graph         |    0.716 |    5.895 |     3.911 |    4.407 |
|      1M | Graph + Bloom |    0.723 |    5.879 |     1.590 |    1.480 |
|     10M | None          |   64.554 |   79.798 |   155.996 |  102.039 |
|     10M | Graph         |   11.975 |   81.466 |    62.109 |   67.554 |
|     10M | Graph + Bloom |   11.957 |   72.454 |    28.468 |   22.077 |

![History operations vs. commit count, log-log, mean ± standard deviation](/git-bench/ops.png)

What stands out:

- Without an index, count, log and blame grow roughly 10× to 14× per
  10× more commits, a little worse than linear at the top end.
  `logfile` grew 20.2× from 1M to 10M without a graph, 15.9× with the
  basic graph and 17.9× with Bloom filters.
- In the larger runs, the commit-graph speeds up counting by about
  5× to 8× (6.5× at 1M and 5.4× at 10M). At 10K, the measured speedup
  is about 8.5×, but that ratio is less reliable because the timings are
  close to the measurement floor. The larger-run results line up with
  the roughly 5.5× reported in the original commit message. The graph
  gave no consistent gain for `git log --oneline`. One possible
  explanation is that `log` still has to read and format every commit
  message, but I didn't test that.
- Bloom filters help path operations. Against the basic graph at 10M,
  blame went from 67.6 seconds to 22.1 seconds (about 3×), and
  `logfile` from 62.1 seconds to 28.5 seconds (about 2.2×). Count and
  full `log` were largely unaffected. These gains are at the low end
  of the 2× to 6× reported for `git log -- <path>` on real
  repositories, even though `static.txt` is a favorable case because
  it never changes after commit 1. I measured the blame gain but
  haven't verified exactly why blame benefits.

### What the indexes cost to build

Each build time is a single measurement, so there are no error bars.

| Commits | Commit-graph: time / size | Graph + Bloom: time / size |
|--------:|--------------------------:|---------------------------:|
|     10K |            0.10 s / 588 KB |             0.25 s / 656 KB |
|    100K |             0.79 s / 5.8 MB |              2.4 s / 6.4 MB |
|      1M |               9.7 s / 58 MB |                39 s / 64 MB |
|     10M |           2 m 22 s / 573 MB |            7 m 12 s / 639 MB |

![Index build time and on-disk size vs. commit count](/git-bench/index.png)

Bloom filters add roughly 11% to the file size and make the build take
about 3× as long. At 10M, that is about 289 seconds more than the plain
graph (431.7 seconds versus 142.3 seconds).

#### Is the index worth building?

A rough break-even calculation at 10M, assuming the same query repeats
and ignoring maintenance, divides the build cost by the time saved per
query.

| Comparison                                      | `logfile` queries to break even | `blame` queries to break even |
|-------------------------------------------------|--------------------------------:|------------------------------:|
| Bloom graph vs. no graph (about 432 s build cost) |                       About 3.4 |                     About 5.4 |
| Bloom graph vs. basic graph (about 289 s extra build cost) |                About 8.6 |                     About 6.4 |

On a repository this size, the index can pay for itself after a handful
of repeated path queries. This is a simplified calculation: it assumes
the measured query savings repeat and ignores the cost of maintaining or
rebuilding the index as the repository changes.

### Cloning

Each clone type used the same `file://` setup:

```bash
git clone --no-checkout file:///path/to/repo                      # full
git clone --no-checkout --depth 1 file:///path/to/repo            # shallow
git clone --no-checkout --filter=blob:none file:///path/to/repo   # blobless
git clone --no-checkout --filter=tree:0 file:///path/to/repo      # treeless
```

Mean seconds. The 10M row is one run per clone type, so it has no
meaningful error estimate. The 10M shallow figure of 10.4 seconds was a
slow first observation; the repeated runs described below were around
3.0–3.4 seconds.

|         Commits |   Full | Blobless | Treeless | Shallow |
|----------------:|-------:|---------:|---------:|--------:|
|             10K |  0.419 |    0.386 |    0.216 |   0.023 |
|            100K |  4.976 |    4.430 |    2.292 |   0.040 |
|              1M |   59.5 |     50.3 |     25.7 |   0.195 |
|   10M (one run) | 1036.7 |    950.6 |    381.3 |   10.4* |

\*The 10M shallow result is a slow first-run observation, not the
repeated-run estimate.

![Clone time by clone type and repository size](/git-bench/clone.png)

Full clones grew roughly in step with commit count. Treeless was about
2.7× faster than full at 10M, but that comparison is based on one run.
Blobless saves little here because the synthetic blobs are only a few
bytes each.

The first attempt at the 10M full clone was killed at about 7.3 GB
resident memory. After raising WSL to 11 GB plus swap, it finished in
about 17 minutes, with memory peaking near 10 GB and swap around 2.2 GB.
At this size, a full clone on a 16 GB laptop is a memory question as
well as a time question.

#### Did the partial-clone filters actually work?

Timing alone can't establish that, so I checked object counts in full,
blobless and treeless clones. At 10K:

| Clone type | Packed objects | Reported missing objects | Interpretation                                         |
|------------|---------------:|-------------------------:|--------------------------------------------------------|
| Full       |         40,001 |                        0 | 10,000 commits, 20,000 trees and 10,001 blobs          |
| Blobless   |         30,000 |                   10,001 | Blobs were omitted                                     |
| Treeless   |         10,000 |                  10,000* | Commits were retained; trees and blobs were omitted    |

\*For treeless clones, the "missing" count in this validation is not a
count of every omitted object beneath every tree. It reflects the
boundary used by the validation script, so it should not be compared
directly with the blobless count as if both counted all omitted objects.

The filters were also validated at 1M, but the detailed 1M object-count
breakdown is not reproduced here. I did not inspect the 10M clones, so
I'm not claiming direct validation at that size.

### The shallow-clone puzzle

The expected payload for a `--depth 1` clone in this dataset is 104
objects: one commit, two tree objects and 101 blobs. I inspected the
object count at 1M, but did not inspect the 10M clone directly, so I
can't confirm that count at every size. You might expect its time to stay
roughly flat. In the original pack layout, it didn't.

My first 10M shallow clone took 10.4 seconds. That was a single run
right after a 17-minute full clone. I treat it as a slow first-run
observation, not a cold-cache measurement: I didn't control cache state.
Repeated 10M runs took about 3.0–3.4 seconds. Hyperfine gave 3.364 ±
0.123 seconds with the commit-graph in place and 3.516 ± 0.413 seconds
with it moved away (three runs each), so the commit-graph was not the
cause.

Tracing a shallow clone with `GIT_TRACE2_PERF` showed about 97% of the
time inside `pack-objects`, mostly in its `prepare-pack` phase. The
table reports ranges across later runs treated as warm; run 1 was
consistently slower, and tracing adds some overhead.

| Commits / repository |    Total time | `prepare-pack` time |
|---------------------:|--------------:|--------------------:|
|                  10K | 0.030–0.032 s |    0.0012–0.0015 s |
|                 100K | 0.038–0.048 s |      0.011–0.013 s |
|                   1M |   0.25–0.30 s |        0.22–0.27 s |
|                  10M |     2.9–3.1 s |       2.85–3.09 s |

Across a thousandfold increase in commits, measured time in the
original pack layout grows by roughly two orders of magnitude. At 1M,
the shallow clone transferred 104 objects, which raises the question:
what is the time tracking?

I ran controls at 1M commits:

| Repository / layout           | Objects sent |     Total time | `prepare-pack` time |
|-------------------------------|-------------:|---------------:|--------------------:|
| `empty-1m`                    |            2 | 0.063–0.077 s  |       About 0.00001 s |
| `tip-1m`                      |          104 | 0.067–0.082 s  |       0.0003–0.0004 s |
| `file-1m` (original layout)   |          104 |   0.25–0.30 s  |          0.22–0.27 s |
| `file-1m` (no-delta repack)   |          104 | 0.028–0.029 s  |         About 0.0003 s |

The last row is the interesting one. I copied `file-1m` and repacked it
with:

```bash
git repack -a -d -f --window=0
```

This stores objects without delta compression. The pack grew from 434 MB
to 2.7 GB and took 2 minutes 28 seconds to build. The shallow clone then
dropped from about 0.222 seconds to 0.028 seconds in hyperfine, roughly
8× faster, with the same commits and the same 104 objects sent.

![Original vs. no-delta pack layout at 1M commits: history operations and clones](/git-bench/layout.png)

In the 1M control, pack layout had a substantial effect on
shallow-clone preparation time even though the repository and the 104
transferred objects were unchanged. The original-layout results also
show preparation time rising with repository size. I haven't isolated
every factor behind that scaling.

My hypothesis is that `pack-objects` spends time handling delta
relationships in the original `fast-import` pack, but I haven't traced
the internal mechanism closely enough to establish that. The layout
dependence is measured; the explanation is not.

### Does pack layout change the other results?

I reran the 1M history and clone benchmarks on both layouts.

- **History with the commit-graph:** the layouts differed by no more
  than about 2.5% on any operation.
- **History without the graph:** the no-delta median was about 3% to
  6% slower, with much higher variance. The five count runs on the
  no-delta pack were 4.56, 4.58, 4.59, 5.29 and 6.61 seconds, against
  4.27 to 4.35 seconds on the original. With five runs and that much
  variance, the difference is suggestive but inconclusive.
- **Clones (three runs each):** full went from 61.6 seconds (standard
  deviation 3.7) to 130.1 seconds (2.2), and blobless from 55.6
  seconds (3.9) to 121.7 seconds (3.0). Both were about 2.1× to 2.2×
  slower on the larger no-delta pack. Treeless was similar (27.2
  seconds versus 27.6 seconds). Shallow was about 8× faster.

I didn't test whether the original `fast-import` layout or the no-delta
layout is closer to a typical repository after `git gc`, so I can't say
which of my 10M clone results would shift in a real repository.

## Takeaways

### Measured, with the caveats above

1. Without an index, count, log and blame grow roughly 10× to 14× per
   10× more commits in this synthetic workload, slightly worse than
   linear at 10M.
2. In the larger runs, the commit-graph speeds up counting by about
   5× to 8×. The measured speedup at 10K is about 8.5×, but that ratio
   is less reliable because the timings are close to the measurement
   floor. There was no consistent gain for `git log --oneline`.
3. Bloom filters help path operations at 1M and 10M. They shift the
   curve down but don't flatten it.
4. At 10M, building the graph plus Bloom filters takes about 7 minutes,
   and the simplified break-even calculation suggests the extra build
   cost can be recovered after a handful of repeated path queries.
5. At 1M, pack layout barely changes history timings when a
   commit-graph is present.
6. The blobless and treeless filters were validated at 10K and 1M. The
   detailed object-count breakdown shown here is for 10K; 10M was not
   inspected.
7. In the original pack layout, repeated shallow-clone timings grew
   with repository size. The 1M control transferred 104 objects, but the
   10M clone's object count was not directly inspected. The 1M repack
   control shows that pack layout can have a large effect on that cost.

### Measured, but based on limited repeats

- All 10M history timings use three runs.
- Every 10M clone timing is a single run, including the
  treeless-versus-full comparison.
- Index build times are single measurements.
- The first 10M shallow-clone result of 10.4 seconds was a slow
  first-run observation, not a controlled cold-cache measurement.

### Hypotheses I haven't tested

- Memory pressure may contribute to the jumps from 1M to 10M: the 10M
  repository is about 4.3 GB and its graph about 0.6 GB, against 7.7
  GB of WSL RAM for the history benchmarks.
- `git log --oneline` may not benefit much from the graph because it
  still has to read and format every commit message.
- Delta-related work may explain the slow `prepare-pack` phase on the
  original pack.
- Full and blobless clones may be slower on the no-delta pack because
  the pack itself is much larger.

## Limitations

- **History shape:** linear only, no merges or branches, one file
  changed per commit, tiny blobs and uniform one-second timestamps.
  Real repositories look different.
- **Bloom filters:** `static.txt` is a favorable case. Frequently
  changing paths and multi-file commits weren't tested.
- **Cache state:** no controlled cold-cache comparison; cache state
  was not independently verified.
- **One machine:** a single laptop, a single Git version, WSL2, a CPU
  that may throttle (no temperature monitoring), and an unconfirmed
  SSD.
- **Memory configuration:** the 10M history benchmarks ran with 7.7 GB
  of WSL RAM, while the 10M clone rerun used 11 GB plus swap.
- **Low repeat counts:** three runs for 10M history, one run for each
  10M clone, and single timings for index builds. The main history
  CSVs have no per-run timings, and configuration order was not
  randomized.
- **Pack layout:** the original repositories were never run through
  `git gc`, and all 10M clone numbers come from that layout.
- **Tracing overhead:** `GIT_TRACE2_PERF` and date-related
  instrumentation add overhead to diagnostic timings.
- **Small-scale floor:** 10K timings, especially count at about 4 ms,
  are near the measurement floor.
- **Not measured:** `gc` and repack time as a benchmark, status,
  fetch, push, reachability bitmaps, multi-pack-index, and anything
  beyond 10M.
- **Prior work:** the literature search was limited; papers and
  mailing-list discussions may exist that I missed.

## Reproducibility

The scripts and results are available in the [git-scaling-bench
repository](https://github.com/hamzaasad26/git-scaling-bench). It
includes the generator (`gen.py`), benchmark scripts, filter validation,
shallow-clone tracing, verification script, charts and raw results.

A few parts are not fully scripted or independently reproduced:

- The index builds were originally typed by hand. `build-index.sh`
  reproduces them, but it was verified at 10K only.
- The pack-layout control was done by hand: copying `file-1m`, then
  running `git repack -a -d -f --window=0`. The exact hyperfine
  command lines for those runs weren't fully recoverable from shell
  history.
- `clonebench.sh` sets `uploadpack.allowFilter` on the source
  repositories and doesn't record WSL memory. The 10M clone row came
  from the 11 GB rerun, and that rerun overwrote the earlier 10M clone
  CSV.
- `gen.py` doesn't wipe its output directory, so use fresh output
  directories.
- Per-run JSON exists only for the 10M shallow repeats and the
  pack-layout checks.

See the repository
[README](https://github.com/hamzaasad26/git-scaling-bench#readme) for
the reproduction sequence and known issues.

## What I'd test next

In rough priority order:

1. Repeat the 10M history operations five to ten times with per-run
   JSON and randomized configuration order.
2. Add a frequently changing path and multi-file commits to test Bloom
   filters beyond the favorable case.
3. Compare against a `git gc`-packed copy of the repository.
4. Run a cold-cache subset with a documented cache-drop procedure.
5. Confirm the SSD and inspect the partial-clone object counts at 10M.

These are follow-up experiments, not prerequisites for interpreting the
results above.

## Conclusion

For most operations, runtime grew roughly linearly with history length.
However, path-limited `git log` grew substantially faster than linearly
between 1M and 10M commits in this synthetic workload. The commit-graph
and Bloom filters shift the runtime curve down, with speedups varying by
operation, but they don't eliminate the scaling cost.

The most useful surprise wasn't just about commits: shallow-clone
preparation time depended strongly on how the repository was packed.
Repacking the same 1M-commit repository without deltas made the shallow
clone about 8× faster, even though it transferred the same 104 objects
in both layouts. If you benchmark clone behavior on synthetic
repositories, check the pack layout before drawing broad conclusions.

This is one laptop, one Git version and a deliberately simple history.
I'd treat the results as a map of where to look on real repositories,
not a prediction of how every repository will behave.
