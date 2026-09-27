# LyZ development roadmap

The roadmap favors data integrity, observable failures, and reproducible cross-platform behavior before new convenience features.

## P0 — protect documents and mappings

### Transactional multi-document key rewrite

Create isolated integration tests for the full key-change lifecycle: export the new BibTeX database, create verified `.lyz~` backups, rewrite every associated LyX document, and commit mappings only after all required writes succeed. Define and test rollback behavior for partial failure.

Development status: the coordinated workflow, persistent recovery journal and isolated filesystem/SQLite regression tests are implemented. Backups have unique names (`<file>.lyz-<uuid>.lyz~`). Caught failures restore recognized changes; startup verifies unfinished transactions and offers recovery after the affected LyX documents are closed. Actual child-process termination tests cover file staging/replacement and SQLite commit boundaries. Installed Zotero/LyX checks, multiple-window validation and hardware power-loss behavior remain pending; see [KEY_UPDATE_TESTING.md](KEY_UPDATE_TESTING.md). This item is not yet release-validated.

Success criteria:

- no database mapping points to an unwritten key;
- every modified LyX document has a verified backup;
- failure identifies the exact document or file and leaves a recoverable state.

### Database schema and recovery audit

Add an explicit schema version, startup integrity checks, and a supported export/diagnostic path so users never need to edit `lyz.sqlite` manually.

Development status: schema version 1, startup SQLite integrity/schema checks and diagnostic JSON export are implemented. A one-time transaction adopts unversioned databases and archives displaced duplicate rows. Unsafe databases block data changes while settings, LyX commands and diagnostics remain available. The `key_updates` table contains format-versioned journals, mapping snapshots, file fingerprints and an atomic commit marker; recovery runs only after the database audit passes. Guided repair/import for ambiguous mappings or corruption and installed-runtime validation remain pending. See [DATABASE_RECOVERY.md](DATABASE_RECOVERY.md).

## P1 — reliable cross-platform integration

### Platform test matrix

Exercise current Zotero with supported LyX versions on macOS, Windows, and Linux. Cover the portable default, detected paths, custom paths, missing parent directories, stale pipes, Unicode paths, and multiple running LyX windows.

### LyXServer transport hardening

Add bounded timeouts, structured error categories, stale-response rejection, and diagnostic logging that records the resolved pipe path, command, client identifier, and response state without exposing bibliography content.

Current foundation: response polling has a timeout and client matching. Key updates also require INFO acknowledgements, reject ERROR responses, and encode Unicode commands as UTF-8. A hard timeout around native pipe I/O, session-wide stale-response protection, and structured diagnostics still need work.

### Automated installed smoke test

Build a repeatable fixture that opens an isolated LyX document, installs a test Zotero item, inserts a citation, updates the BibTeX entry, and verifies the document and mapping database.

## P2 — maintainability and user experience

### Preferences validation

Show whether the configured pipe is live, explain when the parent directory must be created, and provide a safe "Test connection" action with the resolved path and LyX response.

### Mapping management UI

Replace prompt-driven rename/delete operations with one searchable view of documents, bibliographies, Zotero items, and citation keys. Include export and non-destructive repair actions.

Development status: the searchable manager, missing-file/item states, journal/archive views, diagnostic export, and previewed relink/remove actions are implemented. Manager changes preserve original rows in the same SQLite transaction and reject stale previews or occupied destinations. An isolated installed Zotero 10.0.1 test on Windows passes 14 native checks and caught/fixed resource registration and dialog loading. Archived-record restoration/import, broader corruption repair, manual layout/picker validation and other supported platforms/versions remain pending. See [MAPPING_MANAGER.md](MAPPING_MANAGER.md) and [ZOTERO_MAPPING_RUNTIME_TEST.md](ZOTERO_MAPPING_RUNTIME_TEST.md).

### Localization quality gate

Check that every Fluent key exists in English, German, and Hungarian, and add automated validation for missing variables and generic dialog titles.

## P3 — future capabilities

- Evaluate BibLaTeX/Biber export as a separate, explicit workflow without changing existing BibTeX behavior.
- Investigate selection of a specific LyX window when several documents are open.
- Add opt-in project portability for mapping transfer between computers while preserving Zotero library identifiers.
- Explore continuous integration for packaging, metadata validation, and draft release artifacts.

Current CI already runs the Node.js tests and JavaScript syntax validation; packaging and release-artifact automation remain future work.

## Recommended next milestone

Target 5.1.0 around the P0 multi-document transaction and recovery work. It addresses the highest-risk remaining path and creates the test foundation needed for later UI and cross-platform improvements.
