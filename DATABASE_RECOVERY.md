# LyZ database audit and diagnostics

This describes the unreleased 5.1.0 development code. Installed Zotero/LyX validation is still required before release.

## Startup checks

LyZ checks SQLite integrity before running its schema migration, file-update recovery or legacy Zotero-item migration. It checks the expected table columns, primary keys and mapping indexes, rejects unexpected triggers, and checks mapping fields for missing or invalid values. A connection reported as read-only is also blocked before migration.

The application schema version is stored in SQLite's `user_version` field. Schema version 1 contains `docs`, `keys`, `key_updates` and `migration_records`. It is separate from the format version inside each key-update journal. A newer or unknown database schema blocks data changes instead of attempting a downgrade.

The one-time migration from an unversioned database retains the existing highest-ID mapping when duplicate documents or `(bibliography, Zotero item)` pairs exist. It stores each displaced row, with its original ID and all values, in `migration_records`. Archiving, consolidation, index creation and the version flag commit in one transaction. Failed migrations roll back together. Duplicate consolidation is refused while a key-update journal exists, because changing its mapping snapshot could invalidate recovery.

Later startups audit the versioned schema without rerunning consolidation or silently recreating missing indexes. Invalid records and unexpected schemas are retained for diagnosis. LyZ does not guess which conflicting record should be restored.

## Export a report

Choose **LyZ > Export database diagnostics…** from Zotero's Tools menu or the LyZ toolbar menu. Hungarian: **Adatbázis-diagnosztika exportálása…**. Save the report as a `.json` file.

The report includes:

- startup status, integrity results, schema version and table/index definitions;
- document/bibliography associations and Zotero item/citation-key mappings;
- raw interrupted-update journals, including paths and fingerprints;
- displaced mappings preserved during schema migration;
- errors for any section that could not be read.

All readable mapping columns are included even if the table has an unexpected schema. Zotero storage rows are copied by explicit column access. A healthy export uses a single read transaction; if the transaction cannot start or finish, the report records the failure and attempts individual reads. Unreadable sections are reported as failures, not represented as successful empty exports.

The export does not read LyX or BibTeX file contents or change mappings. It remains available when startup auditing or interrupted-update recovery blocks data changes. It writes through a temporary file and refuses output filenames that would overwrite a known database, mapped file, archived mapping path or recovery artifact. Choosing Cancel does not read or write the database.

Reports contain local paths, Zotero item identifiers and citation keys. Review a report before sharing it. A JSON report is diagnostic evidence and a mapping snapshot, **not a restorable SQLite backup**; it cannot recover unreadable data.

## When data changes are blocked

Settings, LyX Command and Export database diagnostics remain available. Citation insertion, BibTeX updates and mapping deletion/rename operations are blocked. An unsafe database also prevents file-update recovery and the legacy Zotero migration from running.

The [mapping manager](MAPPING_MANAGER.md) remains available for read-only inspection. When database/recovery checks pass, it supports previewed file relinking and mapping removal, preserving original rows in `migration_records`. This archive now contains both migration and manager-edit records; manager records also carry an operation identifier and timestamp.

Export a report and preserve the original database, any SQLite sidecar files, and the verified document/BibTeX backups. Do not edit `lyz.sqlite` or delete recovery records to bypass the checks. If a report contains section errors, retain those errors alongside the readable mappings.

For an interrupted file update, follow [Citation-key update validation](KEY_UPDATE_TESTING.md): close every affected LyX document before accepting restoration. Unknown edits or damaged required backups need investigation; they are preserved rather than overwritten.

File relinking and mapping removal are supported by the manager. Restoration/import of ambiguous archived mappings or repair of physically damaged database files remains pending. Physical database corruption cannot be repaired merely by exporting JSON. Native Zotero database behavior, diagnostics file pickers and recovery dialogs need installed-runtime verification.

## Validation

`tests/database-audit.test.js` uses real SQLite and Zotero-style storage-row proxies. It covers version adoption, retained duplicate rows, rollback of failed migrations, read-only connections, unknown versions, invalid mappings, integrity failures, invalid indexes/triggers, pending journals, startup blocking, partial diagnostic reads, a real non-SQLite file, Unicode JSON export, safe export destinations, picker cancellation/replacement, all menu routes and English/German/Hungarian message variables.

Together with the existing file-update, recovery, manager and transport suites, the local gate on 2026-09-27 passed **121 tests** on Windows with Node.js 26. JavaScript syntax and XPI archive/source-content checks also passed. SQLite-integrity failure messages are injected in focused tests; the non-SQLite-file case exercises a real driver failure. Native Zotero/LyX interaction remains unverified for this development milestone.

The implementation uses the documented [SQLite integrity check and application version pragmas](https://www.sqlite.org/pragma.html), Zotero's [database connection API](https://raw.githubusercontent.com/zotero/zotero/main/chrome/content/zotero/xpcom/db.js) and [file picker API](https://raw.githubusercontent.com/zotero/zotero/main/chrome/content/zotero/modules/filePicker.mjs).
