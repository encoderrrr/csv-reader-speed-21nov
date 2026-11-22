[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/encoderrrr/csv-reader-speed-21nov/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/encoderrrr/csv-reader-speed-21nov/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)


# Read broken CSV files faster, 21 November 2026

An entry for make.fun's "Read broken CSV files faster, 21 November 2026" bounty: https://make.fun/bounty/csv-reader-speed-01-run-20261121

## What it is

A faster drop-in for make.fun's csv-reader 1.0.0 that answers exactly as it does on every case. `solve.js` is a dependency-free ES module whose `run(input)` returns `{columns, rows, errors}` for an input of `{text, header}`, following the reference's broken-row policy exactly: a U+FEFF at the very start is dropped, records end at LF or CRLF, empty lines are no records, a CR outside quotes that is not followed by LF is dropped (`stray_cr`), a field opening with a quote runs to the next non-doubled quote (`""` inside is one quote, CRLF or a lone CR inside is read as LF), what follows the closing quote up to the next comma or line break is appended as-is (`quote_junk`), a quote that never closes is a literal and the text after it is re-read as unquoted (`unterminated_quote`), fields stay strings, and rows are padded (`short_row`) or cut (`long_row`) to the first record's width.

## How it works

A single-pass, index-based parser instead of the reference's one-character-at-a-time string building:

- Unquoted fields are found by scanning for the next delimiter with a tight `charCodeAt` loop, then sliced once — no per-character concatenation.
- Quoted fields locate their closing quote with native `indexOf` and likewise slice when the content needs no repair (no doubled quotes, no CR inside). Every scan of quoted content is bounded by the content's length.
- The slow paths (stray CRs, quote junk, unterminated quotes, CRs inside quotes) only run when the input actually contains those broken bits, and follow the reference's policy exactly.
- No dependencies, no WebAssembly, no native addons, nothing cached from one case to the next.

On the practice set (6 cases, ~11 MB of CSV) it parses in ~111 ms against the reference's ~600–700 ms, and the whole `node main.ts` run takes ~1.0 s against the house baseline's ~2.1 s on the same machine — about 2x faster end to end, ~6x on parsing alone. All 6 practice cases match the reference answers exactly, and the parser was checked against the reference on 6,232 extra inputs (hand-written edge cases plus random fuzzing over `a b , " \n \r space x`, with `header` true and false).

## Files

- `solve.js` — the fast parser (`run(input)`)
- `main.ts` — the entry program (the house baseline's driver, kept as-is: Node 22, standard library only, `--no-incremental-marking`)
- `package.json` — `{"type": "module"}`
- `LICENSE` — MIT

## Running it

```sh
MAKEFUN_INPUT_DIR=<dir with cases.json> MAKEFUN_OUTPUT_DIR=<fresh dir> node main.ts
```

It reads every case from `$MAKEFUN_INPUT_DIR/cases.json`, answers each one alone with `run`, and writes `$MAKEFUN_OUTPUT_DIR/answers.json`.
