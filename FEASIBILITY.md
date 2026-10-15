# Feasibility result — 15 October 2026

The selected static architecture has passed a **desktop bounded-read milestone**. It has not yet passed the iPhone milestone or established acceptable full-database search latency.

## Actual large-file tests

Tested an existing 1,477,775,360-byte Jet MDB, opened read-only from its original location. The main table contains 3,352,398 rows and 20 columns. No personal records or search keys are included here.

| Test | Rows examined | Data pages | Total bytes read including metadata | Peak chunk cache | Time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node, browser bundle, 128-page scan | 6,092 | 128 | 2,228,224 | 2,228,224 | 170 ms |
| Node, browser bundle, eviction stress scan | 195,179 | 10,000 | 62,455,808 | 4,194,304 | 4,351 ms |
| Desktop Chromium, actual Files picker, no-match query | 6,092 | 128 | 2,228,224 | 2,228,224 | Not timed |

Node tests derived a key internally from a single existing row and found one matching row in the bounded scan; no key or record was printed. This is a consistency test, not an independent comparison against Access query results. The Chromium test used a synthetic nonmatching value so no personal rows were displayed or logged. File size and modification time were unchanged after the Node tests; this is not a full-file hash comparison. Individual reads were at most 65,536 bytes. The stress test deliberately uses a larger read budget than the app's ordinary step to exercise cache eviction.

Total process memory and iOS memory pressure have not been measured. The cache is only one component; metadata includes a list of 242,207 data-page numbers for this table. The reader does not retain every row. Standard scans discard nonmatching records and retain at most 50 matches per step. Replacing results between steps bounds retained output.

The iPhone must still prove that Safari can select this large file, expose it to a worker, complete bounded reads and stay responsive. Files may download a cloud-backed selection before it becomes readable. The newer database has not been tested.

## Approach chosen

Use a worker, bounded chunk cache and resumable page scan for the first local-files prototype. This preserves the MDB unchanged, avoids a server or conversion and removes Google OAuth as a requirement. It is a defensible browse/search experiment, not a promise of instant searches across millions of records. Local access is preferable for this initial test because a network range scan can incur many requests and substantial transfer.

For the eventual original search form, investigate traversal of existing MDB indexes on the actual input fields. The current JavaScript reader decodes table pages but does not expose indexed predicate lookups. Arbitrary contains searches cannot be assumed to benefit from ordinary indexes. Do not switch architecture silently if index support or iPhone testing fails.

## Library and platform research

- [mdb-reader](https://github.com/andipaetzold/mdb-reader), pinned to npm 3.2.0, is MIT licensed and has separate browser and Node builds. Its stock constructor takes an entire Buffer; stock `Table.getData` returns row-limited arrays but does not expose a predicate/index search. This prototype provides a virtual chunk-backed buffer and a small auditable page-reading extension, preserving all upstream license texts. See the [upstream Database implementation](https://github.com/andipaetzold/mdb-reader/blob/main/src/Database.ts) and [Table implementation](https://github.com/andipaetzold/mdb-reader/blob/main/src/Table.ts). Future maintenance is not guaranteed.
- [MDB Tools](https://github.com/mdbtools/mdbtools) is an alternative native parser with index-related implementation, not a drop-in browser solution. Libraries use LGPL-family terms; utilities use GPL-family terms. [AccessExplorer's WASM integration](https://github.com/clavisflow/AccessExplorer) distributes utility-based artifacts under GPL-2.0-only. This prototype does not bundle it. A WASM build alone would not prove bounded remote I/O.
- [MDB Tools' format notes](https://github.com/mdbtools/mdbtools/blob/dev/HACKING.md) describe table pages and index pages. Recreating queries still requires explicit field/operator/join semantics. Decoding an MDB does not execute Access forms, macros or VBA.
- [Blob.slice](https://developer.mozilla.org/en-US/docs/Web/API/Blob/slice) and [Blob.arrayBuffer](https://developer.mozilla.org/en-US/docs/Web/API/Blob/arrayBuffer) allow requesting a bounded local blob segment. The prototype slices before converting to an ArrayBuffer. This does not establish how iOS cloud file providers stage the underlying file or guarantee a Safari memory allowance.
- [Drive downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads) support authenticated media download and byte ranges. Drive serves bytes; it does not execute Access queries. Our optional transport rejects non-206 responses and caps streamed bytes. Real Drive/CORS integration still requires testing.
- Google's [token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model) supports browser REST/CORS requests without a client secret or backend refresh-token store, and requires user interaction for renewed tokens. [Picker integration](https://developers.google.com/workspace/drive/picker/guides/web-picker) plus [drive.file](https://developers.google.com/workspace/drive/api/guides/api-specific-auth) allows explicit per-file selection. A pasted private-file URL is not a permission grant.
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) document a 1 GB published-site limit. The MDB is not part of the site regardless of hosting limits. GitHub hosts only reader assets.

## Next validation

1. Owner enables GitHub Pages and tests Files selection on the actual iPhone 13 Pro Max.
2. Verify opening, browsing, a known exact match, a no-match partial search, continuation, Stop, Change and Forget; watch for Safari reloads or memory pressure. Keep personal results out of screenshots shared publicly.
3. Test the newer MDB separately.
4. The supplied main-form and general-search screenshots have now been implemented as an Arabic RTL browser interface. Compare the documented query assumptions and ambiguous raw field bindings with Access, then select an index strategy. See [INTERFACE.md](INTERFACE.md).

## Arabic vehicle-form update

The primary flow is now main record form → search popup → popup closes → matching record returns to the main form. Combined filters, inclusive year ranges and name/chassis/engine actions use the same bounded scan engine. A byte-budget stop preserves matches already found and returns the exact continuation cursor. Thirteen synthetic unit tests pass. Synthetic-MDB desktop Chromium testing verified 96 combined matches split into 50 and 46 without skipped/repeated records, main-form navigation, popup closure, dependent make/model suggestions and mobile/desktop layouts. The existing 1.48 GB consistency test was repeated after the predicate changes: 6,092 rows checked, 2,228,224 bytes read and a matching result, with source size/mtime unchanged. These remain desktop tests, not evidence of iPhone performance or exact Access query parity.
