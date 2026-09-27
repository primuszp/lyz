# Installed Zotero–LyX lifecycle test

Verified on **2026-09-27**, Windows, Zotero **10.0.1**, Gecko **140.14.0**, LyX **2.5.3**, Hungarian locale. This tests unreleased 5.1.0 development source; extension metadata remains at 5.0.71 until release preparation.

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

## Defects found and fixed

LyX reports Windows document paths with forward slashes. Native Zotero `IOUtils.read` rejected those paths with `NS_ERROR_FILE_UNRECOGNIZED_PATH`, although Node filesystem fixtures accepted them. `file-service.js` now converts Windows separators only at native file/path API boundaries, including backup and temporary paths. LyX commands, stored mappings and journals keep their paths; Unix paths retain literal backslashes.

Selecting an already-open dirty document through `file-open` could wait for a native reload confirmation. The update now tries `buffer-switch` before saving and closing. An explicit server ERROR permits opening a closed document from disk; an uncertain transport failure aborts without another open request. The installed test exercises both unsaved buffers and a closed document, and focused regressions cover the fallback boundary.

## Remaining release checks

These are automated application integration checks. Confirmation answers are injected; actual dialog interaction, file pickers, keyboard navigation and visual layout remain unverified. The two associated documents share a bibliography but do not contain a LyX parent/child include relationship. Multiple LyX windows/views, other supported Zotero/LyX versions, macOS/Linux, native read-only/missing-document failures, native corruption/migration cases and power-loss durability require further checks.

The native crash test covers a prepared journal after the first file replacement, not every native interruption boundary. External-edit and damaged-backup recovery cases are covered by Node fixtures and remain in the installed manual checklist. Native pipe I/O can still block outside the response-polling timeout; LyXServer transport hardening is the next roadmap step.
