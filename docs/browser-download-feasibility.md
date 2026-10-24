# Static hosting and browser downloads — feasibility notes

Research date: 2026-10-24. Requirements: [project intent](project-intent.md). Provider authentication and API findings belong in [the main assessment](feasibility.md).

Status: documentation research plus a small synthetic Node.js ZIP experiment. No SvelteKit app, live cloud integration, or real-device browser test has been built or run.

## Verdict

**Static SvelteKit hosting is supported. Browser ZIP downloads are plausible at the expected small scale, but mobile reliability remains a prototype gate.** Streaming archive creation and streaming to the user's Downloads folder are separate capabilities. Supporting one does not guarantee the other.

Keep the agreed warning-only policy: do not turn suggested warning thresholds into hard application limits. Document that a browser can still fail or terminate a job and that no arbitrary-size guarantee is possible.

## 1. Static SvelteKit does not require an empty SPA shell

**Verified:** SvelteKit's static adapter generates static pages and has explicit GitHub Pages deployment guidance, including repository base paths and a `404.html` fallback. SvelteKit also permits a prerendered page to fetch personalized data in the browser after loading. [B1, B2]

**Recommendation:** Prerender the public shell, help, privacy, and any required authentication callback pages; initialize accounts and fetch drive data only in the browser. Initially represent folder navigation as client state or query parameters on an existing page rather than creating an unbounded dynamic route for every remote folder.

This avoids making normal browsing depend on GitHub Pages serving a deep-link fallback with a 404 response. A fallback can still be provided, but an OAuth callback should resolve to a real generated page. Callback behavior must be tested with the provider SDK, not inferred from static routing alone.

Use the exact deployment base path throughout asset URLs and callbacks. Do not prerender user-specific file metadata or perform authenticated API calls during the build. [B1, B2]

### Confirmed deployment follow-up: custom domain, no registrations yet

The user confirmed a custom domain on GitHub Pages and no existing Microsoft or Google app registrations. The actual domain has not been supplied. Use its canonical HTTPS origin when preparing provider registration; do not assume the default `github.io` repository subpath will be the production URL.

GitHub supports HTTPS enforcement for correctly configured custom domains. Its documentation recommends verifying ownership before linking the domain and warns against wildcard DNS records and dangling custom-domain configuration. Configure the domain in Pages before pointing serving DNS records at it; retain its verification TXT record. [B18, B19, B20]

These are deployment prerequisites to document and validate, not actions already performed. GitHub also warns against using Pages for sensitive transactions such as collecting passwords: this app must redirect authentication to the provider and never collect provider passwords itself. [B18]

## 2. Archive streaming is not disk streaming

| Approach | Evidence | Implication |
| --- | --- | --- |
| JSZip `generateAsync({ type: 'blob' })` | JSZip documents that generation retains the complete result in memory. Its `streamFiles` option reduces per-entry buffering but does not change this complete-result behavior. [B3, B4] | Straightforward for small archives; not a bounded-memory large-download strategy. |
| zip.js incremental writer | The library supports streams, incremental writing, workers, and ZIP64 archives larger than 4 GB. Its writer accepts a `WritableStream`. [B5, B6] | A promising candidate for a shared archive pipeline with different output destinations. ZIP64 capability does not imply a device can hold the archive. |
| Stream transformed into `Response(...).blob()` | Even the zip.js streaming example ultimately collects a complete Blob in this configuration. [B5] | Streaming inputs alone does not eliminate the complete output object or browser resource constraints. |
| Native file picker plus writable file stream | Chrome documents piping a stream into a file handle; the picker must be opened during user interaction, before lengthy preparation. [B7, B8] | Feature-detected direct-to-disk path; do not open the picker only after an async ZIP job has finished. |
| Service-worker-mediated save | StreamSaver documents a worker/iframe bridge, an external bridge by default, and interrupted downloads when the page is left. [B9] | Not the default recommendation for a small, privacy-focused app. If evaluated, self-host the bridge and audit its data flow. It is not a background-job guarantee. |

**Compatibility evidence:** The current browser-compatibility dataset reports `showSaveFilePicker` in desktop Chrome since 86 and Chrome Android since 132, but not Firefox or Safari; this includes Safari iOS through the dataset's mirrored support entry. Chrome's own release announcement confirms Android save-picker support in 132. These are documented compatibility claims, not tests performed for this project. Runtime feature detection and device tests remain necessary. [B10, B15]

**Recommendation:** Evaluate zip.js with a Blob output fallback first, plus a native file-stream output where available. Do not make the native API mandatory for v1. Keep archive code lazy-loaded and measure the production bundle before selecting a library permanently.

**Initial implementation behavior:** The OneDrive prototype lazy-loads the ZIP code only when a download is requested. It warns (without rejecting) when known aggregate size exceeds 100 MiB, when any file size is unknown, or when a folder contains more than 500 files. These are provisional UX warning thresholds, not capacity guarantees or hard caps; revise them after mobile testing. The fallback download waits for the user to click a visible “Save ZIP” action, which is more compatible with browsers that restrict delayed programmatic downloads.

## 3. Recoverable file errors need deliberate buffering

**Verified:** zip.js supports buffered entry writes, cancellation signals, and recovery/finalization after caught entry failures. It exposes `hasCorruptedEntries` for partially written entries; removing an entry from the central directory does not remove bytes already streamed to the output. Parallel entry writes can introduce per-entry buffering. [B6, B11]

**Synthetic experiment performed:** Using Node.js `v26.12.1` and the published `@zip.js/zip.js@2.24.0` native build, with workers disabled and compression level zero:

1. Add `folder/ok.txt` successfully.
2. Add a stream that emits a chunk and then raises a simulated network error.
3. Catch that entry's rejection and add `errors.txt`.
4. Finalize and reopen the ZIP, checking the successful file's content and CRC.
5. Separately verify that a pre-aborted entry operation rejects.
6. Independently open both archives with Python's standard-library `zipfile`, verify the entry list and successful content, and run `testzip()` to check their listed entries' CRCs. Both passed.

| Experiment | Observed result |
| --- | --- |
| Unbuffered entry failure | Final archive listed only `folder/ok.txt` and `errors.txt`; successful content/CRC checked; writer reported `hasCorruptedEntries: true`. |
| Buffered entry failure | Final archive listed the same successful entries and checked content/CRC; writer reported `hasCorruptedEntries: false`. |
| Pre-aborted entry | Rejected as expected. |

The temporary probe is `/tmp/user/1000/opencode/cloud-browser-zip-feasibility.mjs`; it fetches the pinned build from [B12]. It is not a repository test suite or a durable artifact.

**What this proves:** This particular library/build can salvage the successful entries for this synthetic failure. Buffering changes failure artifacts, so partial-failure handling cannot be just a toast around an arbitrary streaming pipeline.

**What this does not prove:** Real network/CORS behavior, compression-worker packaging, ongoing cancellation latency, memory ceilings, extraction compatibility in native OS archive tools, or any desktop/mobile browser behavior. Python checks provide an independent reader, not that complete compatibility matrix.

**Recommendation:** For the initial small-job path, process entries sequentially and buffer the current entry before appending it, with a clear report for omissions. This trades per-entry memory for cleaner recovery; the complete Blob output may still dominate resource use. Benchmark before choosing concurrency. Test extractor behavior before considering unbuffered salvage a supported user path.

## 4. Storage and mobile lifecycle are real limits

**Verified:** WebKit applies storage quotas and may evict origin data. Its storage estimate is not a guarantee that the advertised capacity can be written. [B13] Chrome's lifecycle documentation explains that browsers may freeze or discard pages, with some termination paths unobservable, especially on mobile. [B14]

**Implications:**

- OPFS or IndexedDB can be evaluated as temporary staging, but neither is unlimited storage nor a universal download destination.
- A complete archive Blob does not necessarily map one-to-one to JavaScript heap memory; actual peak RAM/storage must be measured rather than estimated from ZIP size alone.
- “Keep this tab open while preparing your ZIP” is an honest initial expectation. Neither a web worker nor a service worker establishes guaranteed completion after page closure, OS suspension, or browser termination.
- Cancellation should abort pending fetches and archive work, release references/object URLs, and remove any app-created temporary storage when execution permits. Startup cleanup is needed if persistent temporary storage is introduced, because termination cleanup is not guaranteed.
- Provider exports with unknown size need progress by discovered/completed items and bytes received, not an invented exact percentage.

These are implementation recommendations derived from the cited platform behavior, not additional confirmed product requirements.

## 5. Browser prototype gates

Before promising mobile ZIP downloads, use synthetic fixtures and then real provider downloads to test:

- Desktop Chrome/Edge, Firefox, Safari, Android Chrome, and iOS Safari; record actual OS/browser versions.
- Small nested folders, empty folders, Unicode names, duplicate names, and filename collisions caused by document export extensions.
- Approximately 10 MB and 100 MB workloads with both compressible and already-compressed data, then a larger job after the warning. These are test points, not app caps or guaranteed capacities.
- Many tiny files as a separate stress case; file count matters independently of bytes.
- HTTP failure before an entry, connection failure mid-entry, interrupted listing, and failure while finalizing the output.
- Cancellation during discovery, fetch, archive creation, and saving.
- Save-dialog cancellation, fallback download behavior, fresh user interaction to save a prepared archive, and object-URL cleanup.
- Tab switching, phone locking, app backgrounding, and reopening after interruption; do not claim resumability unless separately implemented and tested.
- Extract results using native OS archive tools, not only the library that produced them.
- Peak resources, responsiveness, archive correctness, omission-report accuracy, and initial/lazy-loaded JS sizes.

**Exit condition:** Demonstrate the expected small workload on the target devices, document observed limitations, and preserve a truthful failure path. Until then, the mobile portion is conditionally feasible, not validated.

## 6. Later folder uploads are not blocked by save-picker support

**Verified:** Directory selection through `<input type="file" webkitdirectory>` exposes descendant files with their `webkitRelativePath`. This is a different capability from picking an output file for a download. [B16]

The current compatibility dataset records working directory selection in Chrome Android 132+, Firefox Android 142+, and Safari iOS 18.4+, alongside desktop support. Earlier versions have specific partial implementations, so checking only whether the property exists is insufficient for a complete support promise. [B17]

**Inference:** A future browser-only folder upload can reconstruct a remote directory hierarchy from those paths, subject to provider write APIs and permissions. The flat file list alone does not preserve empty folders; a later specification must address that limitation and older mobile versions. This does not add uploads to v1.

## Sources

- **B1:** SvelteKit, static adapter and GitHub Pages: https://svelte.dev/docs/kit/adapter-static
- **B2:** SvelteKit, page options, prerendering and browser personalization: https://svelte.dev/docs/kit/page-options
- **B3:** JSZip, performance and limitations: https://stuk.github.io/jszip/documentation/limitations.html
- **B4:** JSZip, generation and `streamFiles`: https://stuk.github.io/jszip/documentation/api_jszip/generate_async.html
- **B5:** zip.js, maintainer README and stream examples: https://github.com/gildas-lormeau/zip.js/blob/master/README.md
- **B6:** zip.js, `ZipWriter` API: https://gildas-lormeau.github.io/zip.js/api/classes/ZipWriter.html
- **B7:** Chrome, File System Access API: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- **B8:** File System Access specification, save picker: https://wicg.github.io/file-system-access/#api-showsavefilepicker
- **B9:** StreamSaver, maintainer documentation: https://github.com/jimmywarting/StreamSaver.js/blob/master/README.md
- **B10:** MDN compatibility dataset, `Window.showSaveFilePicker` (compatibility evidence, not a browser-vendor guarantee): https://github.com/mdn/browser-compat-data/blob/main/api/Window.json
- **B11:** zip.js, entry options including buffering and cancellation: https://gildas-lormeau.github.io/zip.js/api/interfaces/ZipWriterAddDataOptions.html
- **B12:** Published package build used in the synthetic experiment: https://unpkg.com/@zip.js/zip.js@2.24.0/index-native.min.js
- **B13:** WebKit, storage policy: https://webkit.org/blog/14403/updates-to-storage-policy/
- **B14:** Chrome, page lifecycle: https://developer.chrome.com/docs/web-platform/page-lifecycle-api
- **B15:** Chrome 132 release announcement, Android file-system access: https://developer.chrome.com/blog/new-in-chrome-132#fs-access-android-webview
- **B16:** File and Directory Entries API, directory selection and relative paths: https://wicg.github.io/entries-api/#html-forms
- **B17:** MDN compatibility dataset, `HTMLInputElement.webkitdirectory`: https://github.com/mdn/browser-compat-data/blob/main/api/HTMLInputElement.json
- **B18:** GitHub Pages, HTTPS and custom domains: https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https
- **B19:** GitHub Pages, domain verification and takeover prevention: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages
- **B20:** GitHub Pages, custom-domain configuration order: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
