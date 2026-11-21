# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/sanin8254-dev/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/sanin8254-dev/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Broken CSV, read faster. An entry for make.fun's **Read broken CSV files faster** bounty (csv-reader-speed-01-run-20261121).

`solve.js` is a dependency-free ES module whose `run(input)` is a drop-in replacement for csv-reader 1.0.0: for every input `{text, header}` it returns exactly csv-reader's answer — `{columns, rows, errors}` — under the same broken-row policy (dropped BOM, stray CRs dropped outside quotes, quoted fields with doubled quotes and embedded line breaks, junk after a closing quote appended, unterminated quotes read again as unquoted text, rows padded or cut to the first record's width, and every breakage reported in `errors` with its line and row).

Where csv-reader reads one character at a time and builds each field a character at a time, this reader scans by index: unquoted fields are cut out with string slicing (segments are only joined when a stray CR splits a field), quoted fields find their closing quote with `indexOf` and are sliced whole when they need no rewriting, and line counting over a quoted field is a single pass. The result is the same answers, several times faster.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`. Outside a container, `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for `/input` and `/output`. Node 22.18 or later; no dependencies.

---

<sub>Entered on [make.fun](https://make.fun/?ref=p6ectqw3&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
