# Installed Zotero–LyX lifecycle test

Verified on **2026-09-27**, Windows, Zotero **10.0.1**, Gecko **140.14.0**, LyX **2.5.3**, Hungarian locale. This tested unreleased 5.1.0 development source while extension metadata was still 5.0.71; development builds are now versioned 5.1.0-dev.

## Reproduce

```powershell
python tests/run-zotero-smoke.py --zotero 'C:\Program Files\Zotero\zotero.exe' --lyx 'C:\Program Files\LyX 2.5\bin\LyX.exe' --lyx-userdir-template "$env:APPDATA\LyX2.5" --timeout 90
```

Python uses only its standard library. The optional LyX template copies generated `*.lst` catalogs and `lyxrc.defaults` to avoid first-start configuration work. It does not copy preferences, sessions or documents.

Each run creates a fresh Zotero profile/library, separate LyX user directory, unique Windows named pipe and temporary Unicode-named documents. Zotero runs headless and the separate LyX process is hidden by default. `--inspect-lyx` shows only the isolated test window for diagnostics. The runner does not install into the normal Zotero profile or operate on the existing LyX session.

The temporary XPI adds `tests/zotero-lyx-runtime-smoke.js` to the production bootstrap. The hook supplies fixture confirmation answers, captures alerts, injects one document-write failure and pauses at the crash checkpoint. Production item selection, BibTeX translation, citation insertion, update orchestration, native XPCOM/IOUtils hashing and file I/O, SQLite transactions, LyXServer commands and startup recovery actually run. The distributable XPI contains no test hook.

The runner kills only its own Zotero process after a durable prepared journal and the first bibliography replacement, then starts a new Zotero process against the same isolated profile/database. No in-process rollback executes at that checkpoint. Owned Zotero/LyX processes are stopped on exit, including timeout/error cleanup. Missing results or failed assertions return a failure exit code. Temporary profiles, documents, backups, `result.json`, `crash-ready.json` and logs remain for inspection.

## Result

**31 native lifecycle checks passed**, covering:

- fresh audited native SQLite initialization and isolation of the Unicode document/pipe;
- selection of a real Zotero item, production BibTeX export, citation insertion and mapping commit;
- shared bibliography updates across two documents with unsaved edits preserved;
- changed citation keys in the bibliography, both documents and database;
- verified unique backups, unchanged unrelated files and restoration of the original active document;
- cancellation preserving file SHA-256 fingerprints and key mappings;
- opening, updating and reopening an initially closed associated document;
- caught write failure after earlier replacements, verified rollback and retirement of its journal;
- actual Zotero termination after the first replacement, recovery in a fresh process, restored file fingerprints and mappings, and removal of the prepared journal;
- successful retry with consistent citations in both documents after recovery.

The final successful run produced `result.json` in **`lyz-zotero-smoke-n4s_n117`**, with `passed: true` and `restartedAfterTermination: true`. The final report contains one expected Hungarian recovery-complete alert. The intentional caught failure was separately checked for exactly one alert before restarting.

All **126 Node regression tests** and add-on/test-hook JavaScript syntax checks also passed. The Node recovery suite covers additional termination checkpoints, including staging, each replacement and SQLite commit boundaries; see [KEY_UPDATE_TESTING.md](KEY_UPDATE_TESTING.md).

The rebuilt development artifact `build/lyz.xpi` contains 38 files, verified byte-for-byte against production source, with successful ZIP integrity and XHTML/RDF parsing checks. It contains no lifecycle hook. SHA-256: `40aca1d88d8fa1ab732bc8410999b53da76acd9e9ddf16d8a7459855f9d17894`. This artifact was not installed into the normal user profile or published.

## Preferences pane check

```powershell
python tests/run-zotero-smoke.py --zotero 'C:\Program Files\Zotero\zotero.exe' --lyx "$env:LOCALAPPDATA\Programs\LyX 2.5\bin\LyX.exe" --preferences --windowed --lyx-userdir-template "$env:APPDATA\LyX2.5" --timeout 90
```

`--preferences` reuses the isolated profile, LyX user directory and unique pipe but appends `tests/zotero-preferences-smoke.js` instead of the lifecycle hook. `--dark` emulates the operating-system dark theme. The hook first compares the LyZ toolbar button and its menu icons with Zotero's own toolbar in the main window. It then opens the real LyZ pane in the Zotero settings window, clicks **Test connection** against the live isolated pipe and against a missing pipe, types into the citation-key pattern, and saves `prefs-*.png` snapshots of the toolbar, settings sidebar and pane in the run directory.

Verified on **2026-09-29**, Windows, Zotero **10.0.3**, Gecko **140.15.0**, LyX 2.5, Hungarian locale: **20 checks passed** in light and dark mode. Checks cover the 20px toolbar icon tinted and sized like Zotero's New Item button, 16px icons on every toolbar menu item, resolution of all 11 referenced LyZ/Zotero icons, the settings sidebar entry (LyZ label and icon), Zotero's status icons with a pixel check that they are painted, pane stylesheet registration, Fluent labels, the example key from the shipped generator, the active Unicode document, the missing-pipe message with the tested path, clearing stale results after path edits, the case warning, autosave, and absence of modal alerts. A first attempt read the computed style before Zotero attached the stylesheet; the check now waits for it. The pixel check exposed a second defect: with a plugin-relative path, `PreferencePanes` loads the stylesheet from a `jar:file:` URL, which cannot load `chrome://zotero/skin` images, so the status icons had the correct computed style but painted nothing. The stylesheet is now registered by its `chrome://lyz/content/` URL; the old path fails the check with 0 painted pixels. The snapshots were reviewed manually. Keyboard navigation and screen-reader output remain unverified.

## Defects found and fixed

LyX reports Windows document paths with forward slashes. Native Zotero `IOUtils.read` rejected those paths with `NS_ERROR_FILE_UNRECOGNIZED_PATH`, although Node filesystem fixtures accepted them. `file-service.js` now converts Windows separators only at native file/path API boundaries, including backup and temporary paths. LyX commands, stored mappings and journals keep their paths; Unix paths retain literal backslashes.

Selecting an already-open dirty document through `file-open` could wait for a native reload confirmation. The update now tries `buffer-switch` before saving and closing. An explicit server ERROR permits opening a closed document from disk; an uncertain transport failure aborts without another open request. The installed test exercises both unsaved buffers and a closed document, and focused regressions cover the fallback boundary.

## Transport follow-up — 2026-10-01

The installed Windows lifecycle now passes **34 checks**, including a missing pipe with a structured error category, a connected local pipe that accepts the command but never replies, a bounded timeout, and a Zotero event-loop timer firing during the wait. The silent endpoint is a disposable server created by the Python runner; normal user pipes are excluded. The same run performs real citation insertion/export, updates, rollback, abrupt termination, restart recovery and retry.

Native I/O now runs in `lyx-pipe-worker.js` through a ChromeWorker. Windows requests use overlapped I/O with [`GetOverlappedResultEx` timeouts](https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-getoverlappedresultex) and cancellation before releasing operation buffers. Output reconnection handles LyX's rotating pipe instances without resending a command. Unix endpoints use [nonblocking FIFO access](https://www.man7.org/linux/man-pages/man7/fifo.7.html); SIGPIPE is blocked only for the worker's writes, consumed if pending and restored before returning the worker thread. Native macOS/Linux tests remain pending.

The controller serializes requests, uses a UUID per session and increasing request IDs, matches complete response lines including split UTF-8, and applies a 2.5-second OS deadline plus a 100-ms UI watchdog allowance. Failures include a code and stage. Debug logs include the resolved pipe and command name, client identifier and elapsed time, excluding arguments and response contents. Windows paths must name local `\\.\pipe\…` endpoints.

The local gate passes **140 tests**, including 3000 additional mapping records, bounded parallel file checks, UI responsiveness during item lookup/indexing and search-index refresh. Linux/macOS native bindings are simulated for nonblocking opens, regular-file refusal, EPIPE cleanup and signal-mask restoration. The installed mapping-manager smoke test also passes all **14 checks** after the performance changes. The original September evidence and checksum above describe the earlier artifact.

Current native evidence: lifecycle `result.json` in `lyz-zotero-smoke-mvcpapnd` reports `passed: true`, 34 checks and `restartedAfterTermination: true`. The mapping-manager result is in `lyz-zotero-smoke-wtgjmqhx`.

The pre-merge transport development XPI contains 39 production files, verified byte-for-byte, with successful ZIP integrity and XHTML/RDF checks and no smoke-test hook. SHA-256: `9afff65e5bb4cf4e3d5f0a53e1452ae1bb971001bc03c7283d591aa0c92b4870`. macOS is explicitly recognized at initialization so its worker selects libSystem and the platform-specific FIFO constants; this routing is covered by regression tests, while native macOS execution remains pending.

## Preferences/transport merge verification — 2026-10-01

The `preferences-ux` branch is integrated with the worker-based transport. The inline probe uses the canonical bounded request directly and translates missing-pipe and timeout categories into pane states without modal alerts or synchronous pipe streams. Regressions verify a stalled worker, a subsequent successful probe and path-resolution failures. All **158 Node tests** and add-on syntax checks pass.

On Windows with Zotero **10.0.1**, Gecko **140.14.0** and LyX **2.5.3**, the merged lifecycle passes **34 checks**, including abrupt termination/restart recovery (`lyz-zotero-smoke-3wg6tdx2`). The real preferences pane passes **20 checks in each of light and dark mode**, with no alerts or snapshot errors (`lyz-zotero-smoke-cs4p6eu2` and `lyz-zotero-smoke-m_mku384`). This includes native connection/missing-pipe results and painted status icons. Keyboard navigation and screen-reader output still require review.

The preferences runner now avoids creating the silent-pipe fixture used only by the lifecycle tests. An unused synchronous pipe accept blocked cleanup in the first merged preferences runs after successful assertions; reruns exit successfully after this separation.

The rebuilt `5.1.0-dev` XPI contains **40 production files**, with source-byte comparison, ZIP integrity and XHTML/RDF/SVG parsing verified, and no smoke-test hook. SHA-256: `35f2fa3d345a6cc1577b5acaa6c9070c64f879f9d5d6a2f85e2aa9f7911ce9dc`.

## Citation review fixes — 2026-10-01

All **169 Node regression tests** and JavaScript syntax checks pass. The new SQLite-backed citation suite covers complete mapped-file replacement (including unselected entries), missing-bibliography recreation with stable keys, unavailable items, invalid exports, duplicate keys, rejected writes and insertion of the actually committed key after a coordinated update.

The installed Windows lifecycle passes **39 checks** with Zotero **10.0.1** and LyX **2.5.3** (`lyz-zotero-smoke-tw566pso`, `passed: true`, `restartedAfterTermination: true`). It now exercises cursor retrieval and changed-key insertion through the production citation command, then recreates a removed bibliography after metadata changes and replaces a mapped bibliography with an existing and a newly selected real Zotero item. Existing document keys remain valid and the recreated document association is checked. The test-only confirmation hook accepts the localized changed-record confirmation; a newly inserted citation can split a text marker, so the unsaved-text assertion compares the marker with citation insets removed.

The rebuilt development XPI contains **40 production files**, verified against source bytes with ZIP integrity and XHTML/RDF/SVG checks, and no test hook. SHA-256: `85f42e24922811ff25efb798f7e4323984e8491548a9fc0397d94039b55e732b`.

## Remaining release checks (current)

These are automated application integration checks. Confirmation answers are injected; actual dialog interaction, file pickers, keyboard navigation and visual layout remain unverified. The two associated documents share a bibliography but do not contain a LyX parent/child include relationship. Multiple LyX windows/views, other supported Zotero/LyX versions, macOS/Linux, native read-only/missing-document failures, native corruption/migration cases and power-loss durability require further checks.

The native crash test covers a prepared journal after the first file replacement, not every native interruption boundary. External-edit and damaged-backup recovery cases are covered by Node fixtures and remain in the installed manual checklist. Native timeout/cancellation behavior on macOS/Linux and broader version coverage are the next transport validation steps.
