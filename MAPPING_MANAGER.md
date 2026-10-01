# Mapping manager

The unreleased 5.1.0 build replaces the separate rename/delete menu entries with **LyZ > Manage mappings…** in the Zotero Tools menu and LyZ toolbar. Hungarian: **Hozzárendelések kezelése…**. Opening the command again focuses the existing window.

## Inspect and search

The window has five views:

- **Documents:** document/bibliography associations and the availability of each file;
- **Bibliographies:** bibliography paths, document/key counts and file availability;
- **Citation keys:** Zotero item titles and identifiers, citation keys and bibliography paths, including unavailable/deleted items;
- **Interrupted updates:** retained update identifiers, states and full recovery records;
- **Preserved records:** original mappings retained during migration or manager edits, with their complete details.

Search matches paths, titles, identifiers, keys and record details, including accent-insensitive text. The problems filter narrows missing/unreadable/invalid files, unavailable items and interrupted updates. Lists are paginated at 50 records. Selecting a document or bibliography enables the available actions.

Unsafe schemas, partial database reads and pending update recovery make the manager read-only. Inspection, refresh and diagnostic export remain available. Merely opening the manager does not initiate recovery or alter mappings after normal startup initialization.

## Relink a relocated file

1. Select a document or bibliography and choose **Choose new file…**.
2. Select the corresponding existing `.lyx` or `.bib` file.
3. Review the old/new paths, affected document/key counts and document list.
4. Acknowledge that the preview has been reviewed, then save the change.

Document relinking changes one document path. Bibliography relinking changes the stored bibliography path for every associated document and key, while retaining citation-key values. If the original file still exists, its bytes must match the candidate. A candidate bibliography must also match the stored Zotero-item/citation-key associations exactly; a document must have recognizable LyX structure and valid citation lines. A missing or unresolved old path is identified explicitly in the preview.

Targets already used by another mapping are rejected. The manager does not silently merge or overwrite target mappings. It does not move files, rewrite citations or edit the bibliography path inside a LyX document; check LyX's bibliography setting separately when moving files.

## Remove a mapping

Select a document or bibliography and choose **Remove mapping…**. The preview lists all affected associations. Removing one document retains its bibliography keys; removing a bibliography removes its document associations and key mappings. Physical files are never deleted by this operation.

The same explicit review and acknowledgment are required before saving. Canceling, switching tabs, changing search/filter/page, refreshing or closing the window discards its current preview. Canceling the file picker performs no edit.

## Preservation and stale previews

Preview creation performs no writes. Saving rechecks the schema, pending recovery records, the complete active mapping snapshot and the relevant file fingerprints. Any intervening mapping change, edited candidate, or reappearing original file invalidates the preview. Create a fresh preview after investigating the change.

Original rows are added to the existing `migration_records` archive with operation identifiers and timestamps. Archiving and the edit commit in one SQLite transaction; a failed commit rolls both back. Edits and reads from the window share the existing Zotero command queue, so they do not overlap citation updates.

Preserved records can be inspected and exported. This first manager version does **not** offer automatic restoration/import of archived mappings, key reassignment, database corruption repair or manual journal deletion. These require additional consistency checks and remain future work. A preserved record is evidence, not proof that its old file/key association is still correct.

## Validation

`tests/mapping-manager.test.js` exercises the real database/mapping services against temporary SQLite and filesystem fixtures. Cases cover inventory, relocated files, exact bibliography associations, unchanged file bytes, archived edits, deletion scope, canceled previews, failed commits, stale mappings/files, pending journals, occupied paths, invalid files, partial reads, changed schemas and Zotero storage-row proxies.

`tests/mapping-manager-ui.test.js` runs the production controller through a DOM adapter and checks accent-insensitive search, problem filtering, row/tab selection, keyboard focus, pagination, preview acknowledgment, cancellation, read-only export, stale-preview errors and safe text rendering. It does not emulate Gecko layout or Zotero window/file-picker behavior.

The 2026-10-01 performance update counts documents/keys in one pass and checks each distinct path through at most eight concurrent file operations. Record copying, item lookup and search indexing yield to the UI every 256 records. Search caches folded record text in a WeakMap; fresh inventory objects invalidate the index without retaining old snapshots. Regression coverage adds 3000 references and checks shared counts, distinct file checks, concurrency bounds, UI timers during item lookup/indexing and refreshed search results. All 140 local tests pass. The manager still reads a complete snapshot before displaying pages; memory use and database-side paging remain follow-up topics for very large libraries.

Local gate on 2026-09-27 (Windows, Node.js 26): **126 tests passed**, JavaScript syntax checks passed, XHTML parsed successfully, and XPI archive/source-content verification passed.

For manual browser layout checks, run `node tests/mapping-preview-server.js` and open `http://127.0.0.1:8765/mapping-manager.xhtml`; append `?readonly=1` for the locked view. This fixture uses synthetic Hungarian data and never opens Zotero, SQLite or user documents. The Codex in-app browser blocked this local URL in this session, so visual/browser interaction validation is still pending.

An installed Zotero 10.0.1 smoke test on Windows now passes **14 native checks**, including window loading, Hungarian localization, CSS, native SQLite transactions, file hashing, Unicode relinking, cancellation, removal/archive, preserved physical bytes and close/reopen. Run `python tests/run-zotero-smoke.py --zotero <executable>` to repeat it in a fresh temporary profile. See [ZOTERO_MAPPING_RUNTIME_TEST.md](ZOTERO_MAPPING_RUNTIME_TEST.md) for the defect found, test boundaries and evidence.

Before release, verify all menu routes, interactive native picker behavior, keyboard navigation, long Unicode paths, light/dark visual layout and other supported platforms/versions. Use copied files for relink/remove tests. See [DATABASE_RECOVERY.md](DATABASE_RECOVERY.md) and [KEY_UPDATE_TESTING.md](KEY_UPDATE_TESTING.md) for remaining installed-runtime checks.
