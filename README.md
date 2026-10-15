# Access Pocket — local MDB reader prototype

A static, read-only Microsoft Access table browser. The primary flow is **Choose from Files → choose a table and field → search → search next pages**. Each visitor supplies their own database. No database is bundled or uploaded by the local-file flow.

## Run locally

The browser bundles are checked in; no build is needed to try the app.

```sh
node scripts/serve.mjs
```

Open `http://127.0.0.1:4173`. This development preview listens only on this computer. It is not the architecture for using the app away from home.

## GitHub Pages (owner enables this)

In repository **Settings → Pages**, choose **Deploy from a branch**, **main**, **/ (root)**, then save. The repository root contains the ready-to-serve static site. All app asset and worker paths are relative, suitable for `https://ramez961.github.io/mdb-reader/`. No Actions workflow, backend, database conversion, Google setup or build service is required for the local-file flow. The URL is usable only after the owner enables Pages and GitHub finishes deployment.

On the iPhone, open the published site in Safari, tap **Choose from Files**, and choose the MDB. If Files shows a cloud provider, it may first download the entire file to the phone. For this large database, downloading to **On My iPhone** before choosing it is a useful device test. Device storage, cloud-provider behavior and Safari memory still need testing on the actual iPhone.

## What works and what remains

- Open user tables and inspect scalar fields; exact-value or contains search; empty value browses rows.
- Read 64 KiB chunks with an LRU chunk cache capped at 4 MiB. Parsing runs in a Web Worker. Metadata, parser buffers, page arrays, JavaScript runtime and results consume additional memory; 4 MiB is **not** a total-memory claim.
- Each search step scans at most 128 data pages, keeps at most 50 results and starts no more pages after 12 seconds. Time is checked between pages, so it is not a hard timeout. Each step also has an 8 MiB new-read budget. The initial open has a 16 MiB read budget.
- **Search next pages** resumes from the exact page/row cursor. It replaces the displayed step's results to keep retained memory bounded. A partial search with zero matches does not mean the whole table has no match.
- **Stop** terminates the worker immediately, clears the results and requires reopening. **Change database** replaces the current session after a new file is selected. **Forget database** drops the browser's selection and in-memory results; it does not delete the original file or revoke a Google grant.
- No edits, conversion, migrations, exports, service-worker caching, full offline database storage or saved search results.
- Binary, OLE, memo and complex fields are omitted from search/display to avoid large values. Access SQL, joins, Access forms, reports, macros and VBA are not executed. This prototype is **not** the original search form. Recreating that screen needs its screenshot, field definitions and matching rules.
- This is a sequential scan, **not an index-backed search**. A match near the end may require reading much of the database. The best next performance work is existing Jet-index traversal for the actual search fields, after those fields and indexes are known.
- Real iPhone testing and compatibility with the newer database remain outstanding. Desktop Chromium success does not prove Safari success.

Local file handles and names are not persisted. Closing/reloading the page requires choosing the local MDB again. Browser access does not provide reliable automatic reopening on iOS. The website itself requires a network connection to load; full offline use is not promised.

## Optional private Google Drive source (experimental)

Local files work without Google. The collapsed Drive panel contains an unverified integration for authenticated metadata and range downloads. It does not make files public and never uses a public download-link workaround.

To enable it, configure a Google Cloud web OAuth client, enable Drive API and Picker API, configure the consent screen/test users, and add the actual website origin (and localhost for development) as authorized JavaScript origins. Fill only the public browser `clientId`, restricted browser `apiKey`, and project number `appId` in `config.js`. Restrict the key by HTTP referrer and APIs. **Never put a client secret, access token, refresh token, personal file link or database ID in the repository.**

The code uses Google's token model and `drive.file`. That scope permits access to files explicitly selected for the app; it is not a read-only scope, although this reader only makes GET requests. A pasted link does not itself grant access to an existing private file: select it with Google Picker first if access fails. Keep Drive sharing restricted. Anyone-with-link access is not private.

Only the selected Drive ID/resource key is stored in this browser's localStorage. Access tokens live in memory and require interactive reauthorization after expiry or reload. Selection is per-browser, not a shared default. Forget clears the selection; remove the app's grant in your Google account separately if desired. Range responses must be HTTP 206 and are read with a byte cap; a server that ignores ranges is rejected before buffering the full file. File versions are checked before and after each search step. Real Drive authorization, Picker on iOS, CORS and range behavior remain untested.

## Development and checks

```sh
pnpm install --ignore-scripts
pnpm build
node --test --test-isolation=none tests/reader.test.mjs
```

Node 22+ is recommended. `pnpm build` bundles the pinned MIT-licensed `mdb-reader` 3.2.0 with a small bounded-page extension. The build adds `Table.pageCount` and `Table.readPage`, caps table-definition traversal and catalog rows, and supplies browser shims. The async chunk adapter retries a synchronous parse only when it encounters a missing chunk. It copies cached bytes before decoding, so parser mutations cannot corrupt cached pages.

The unit tests use synthetic data and exercise eviction, immutable cached bytes, read caps, continuation correctness, partial-result reporting, strict Drive URL parsing, full-download rejection and oversized-stream cancellation. Run the optional local feasibility script only with a private file path passed at runtime:

```sh
node scripts/feasibility.mjs "path/to/private.mdb" 128
```

That script assumes the test table `CARMDI` and prints aggregate metrics only. It never prints records or the derived test key. See [FEASIBILITY.md](FEASIBILITY.md) for measurements and limitations.

## Privacy and licensing

Publish reader code only. Do not commit databases, private fixtures, selected source links, credentials, screenshots of real rows or personal search output. The development server allowlists app assets and cannot serve the database. The local path is never sent to a server. Google scripts load only when a Drive action is invoked. Rendering uses text nodes, not record-derived HTML.

No license is granted here for the original application code. Third-party code retains its own licenses; see [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt), [MDB-READER-LICENSE.txt](MDB-READER-LICENSE.txt) and the legal notices embedded in both vendor bundles.
