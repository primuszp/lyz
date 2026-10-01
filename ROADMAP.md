# LyZ development roadmap

The roadmap favors data integrity, observable failures, and reproducible cross-platform behavior before new convenience features.

## P0 — protect documents and mappings

### Transactional multi-document key rewrite

Create isolated integration tests for the full key-change lifecycle: export the new BibTeX database, create verified `.lyz~` backups, rewrite every associated LyX document, and commit mappings only after all required writes succeed. Define and test rollback behavior for partial failure.

Development status: the coordinated workflow, persistent recovery journal and isolated filesystem/SQLite regression tests are implemented. Backups have unique names (`<file>.lyz-<uuid>.lyz~`). Caught failures restore recognized changes; startup verifies unfinished transactions and offers recovery after the affected LyX documents are closed. Actual child-process termination tests cover file staging/replacement and SQLite commit boundaries. An installed Windows test with Zotero 10.0.1 and LyX 2.5.3 passes 39 checks, including real citation insertion/export, unsaved edits in two associated documents, cancellation, rollback, process termination and startup recovery. It exposed and fixed native Windows path handling and selection of already-open buffers. Other platforms, multiple-window validation, real parent/child include relationships and hardware power-loss behavior remain pending; see [ZOTERO_LYX_RUNTIME_TEST.md](ZOTERO_LYX_RUNTIME_TEST.md) and [KEY_UPDATE_TESTING.md](KEY_UPDATE_TESTING.md). The Windows baseline is verified; the remaining matrix is documented as a known limitation of 5.1.0.

Success criteria:

- no database mapping points to an unwritten key;
- every modified LyX document has a verified backup;
- failure identifies the exact document or file and leaves a recoverable state.

### Database schema and recovery audit

Add an explicit schema version, startup integrity checks, and a supported export/diagnostic path so users never need to edit `lyz.sqlite` manually.

Development status: schema version 1, startup SQLite integrity/schema checks and diagnostic JSON export are implemented. A one-time transaction adopts unversioned databases and archives displaced duplicate rows. Unsafe databases block data changes while settings, LyX commands and diagnostics remain available. The `key_updates` table contains format-versioned journals, mapping snapshots, file fingerprints and an atomic commit marker; recovery runs only after the database audit passes. Fresh schema initialization, native mapping transactions and prepared-journal restart recovery are verified in installed Windows Zotero. Guided repair/import, native corruption cases and interactive diagnostic picker checks remain pending. See [DATABASE_RECOVERY.md](DATABASE_RECOVERY.md).

## P1 — reliable cross-platform integration

### Platform test matrix

Exercise current Zotero with supported LyX versions on macOS, Windows, and Linux. Cover the portable default, detected paths, custom paths, missing parent directories, stale pipes, Unicode paths, and multiple running LyX windows.

### LyXServer transport hardening

Add bounded timeouts, structured error categories, stale-response rejection, and diagnostic logging that records the resolved pipe path, command, client identifier, and response state without exposing bibliography content.

Development status (2026-10-01): native I/O now runs in a ChromeWorker with an opening/write/read deadline and a UI watchdog. Windows uses cancellable overlapped I/O on local named pipes; Unix uses nonblocking endpoints. Requests are serialized and carry unique session/client identifiers. Complete UTF-8 response lines are matched to the request; rotated Windows readers reconnect without resending a potentially executed command. Errors retain categories/stages and debug logs omit arguments/response contents. An installed Windows silent-pipe test verifies timeout and UI responsiveness, alongside the full update/recovery lifecycle. Native macOS/Linux and other supported Zotero versions still require validation.

### Automated installed smoke test

Build a repeatable fixture that opens an isolated LyX document, installs a test Zotero item, inserts a citation, updates the BibTeX entry, and verifies the document and mapping database.

Development status: `tests/run-zotero-smoke.py --lyx <executable>` implements the Windows fixture with a fresh Zotero profile/library, a separate LyX user directory and unique named pipe. It also verifies cancellation, partial-write rollback, abrupt Zotero termination and recovery in a new process. All 39 checks pass; confirmation answers and one write failure are injected by a test-only hook. macOS/Linux adapters, interactive UI review and broader version coverage remain pending. See [ZOTERO_LYX_RUNTIME_TEST.md](ZOTERO_LYX_RUNTIME_TEST.md).

## P2 — maintainability and user experience

### Preferences validation

Show whether the configured pipe is live, explain when the parent directory must be created, and provide a safe "Test connection" action with the resolved path and LyX response.

Development status: an inline, dialog-free connection test reports the resolved path and the active document, a missing pipe, a missing document, no reply or a LyX error, each with localized next steps. A live citation-key preview flags patterns that will not expand. Pane controls are validated in installed Zotero 10.0.3 with an isolated LyX 2.5 pipe on Windows. Missing Unix parent-directory detection, macOS/Linux runs and keyboard/screen-reader review remain pending.

### Mapping management UI

Replace prompt-driven rename/delete operations with one searchable view of documents, bibliographies, Zotero items, and citation keys. Include export and non-destructive repair actions.

Development status: the searchable manager, missing-file/item states, journal/archive views, diagnostic export, and previewed relink/remove actions are implemented. Manager changes preserve original rows in the same SQLite transaction and reject stale previews or occupied destinations. An isolated installed Zotero 10.0.1 test on Windows passes 14 native checks and caught/fixed resource registration and dialog loading. Archived-record restoration/import, broader corruption repair, manual layout/picker validation and other supported platforms/versions remain pending. See [MAPPING_MANAGER.md](MAPPING_MANAGER.md) and [ZOTERO_MAPPING_RUNTIME_TEST.md](ZOTERO_MAPPING_RUNTIME_TEST.md).

Performance follow-up (2026-10-01): bibliography counts now use one pass, distinct file checks run with bounded concurrency, and normalized search text is cached per snapshot. Large copying, item lookup and indexing loops yield to UI events every 256 records. The manager still loads a complete consistent inventory; database-side paging/lazy detail loading remains a possible follow-up for very large libraries.

### Localization quality gate

Check that every Fluent key exists in English, German, and Hungarian, and add automated validation for missing variables and generic dialog titles.

## P3 — future capabilities

- Evaluate BibLaTeX/Biber export as a separate, explicit workflow without changing existing BibTeX behavior.
- Investigate selection of a specific LyX window when several documents are open.
- Add opt-in project portability for mapping transfer between computers while preserving Zotero library identifiers.
- Explore continuous integration for packaging, metadata validation, and draft release artifacts.

Current CI already runs the Node.js tests and JavaScript syntax validation; packaging and release-artifact automation remain future work.

## Recommended next milestone

For follow-up releases, validate the new transport on macOS/Linux and other supported Zotero versions, then complete multiple-window, parent/child include and interactive UI checks. Windows transport hardening and the installed lifecycle now provide the baseline. These checks remain priorities after the 5.1.0 Windows baseline release.
