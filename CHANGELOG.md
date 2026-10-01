# Changelog

All notable changes to this maintained fork are documented here. Release artifacts are available from <https://github.com/primuszp/lyz/releases>.

## 5.1.0 — 2026-10-01

### Changes

- Coordinate citation-key changes across all associated LyX documents with unique verified backups, file checks and a mapping commit after successful writes.
- Add persistent update journals, rollback after caught failures and startup recovery after an interrupted Zotero process. Preserve external edits or damaged backups and report blocked recovery.
- Add a searchable mapping manager with document, bibliography, item/key, recovery and archive views; previewed relink/remove actions preserve original rows and never delete physical files.
- Version and audit the SQLite schema at startup, archive displaced legacy mappings and export diagnostic JSON. Unsafe databases block data changes while settings, inspection and diagnostics remain available.
- Add inline **Test connection** and **Use default** preferences actions, tested pipe paths, active-document feedback and localized next steps. Add a live citation-key example and pattern warnings; expand `zoteroShort` in custom patterns.
- Redraw theme-aware LyZ icons for Zotero toolbars, menus and the settings sidebar, and use Zotero's status icons. Improve preferences styling in both light and dark mode.
- Move native LyX pipe I/O into a ChromeWorker with OS deadlines, a UI watchdog, unique request identifiers and structured errors. Reconnect rotated Windows pipe instances without resending commands; omit command arguments and response contents from transport logs.
- Make mapping counts linear, check distinct files with bounded concurrency, cache normalized search text and yield to UI events during large loops.
- Fix Windows path conversion at native file boundaries and switch existing LyX buffers without reloading unsaved edits.
- Restore cursor-position queries and use the committed citation key after a coordinated update.
- Recreate missing bibliographies and replace mapped files with the complete mapped item set plus new selections, preserving document keys. Reject unavailable items, invalid exports and duplicate keys before writing.

### Validation

- **169 regression tests** and add-on JavaScript syntax checks pass.
- **39 installed Windows lifecycle checks** pass with Zotero **10.0.1 / 10.0.3** and LyX **2.5.3**, including real export/insertion, Unicode files, unsaved edits, cancellation, rollback, actual process termination/restart recovery and the citation/rebuild fixes.
- The merged preferences pane passed **20 checks in each of light and dark mode**, including native connection results and painted icons. The mapping manager passed **14 native checks** during development.
- The release XPI is checked for ZIP integrity, matching production source bytes, metadata, XHTML/RDF/SVG parsing and exclusion of smoke-test hooks.

### Known limits

- Metadata targets Zotero **7–10**; native macOS/Linux transport and broader Zotero/LyX version coverage remain unverified.
- Multiple LyX windows, actual parent/child include relationships, interactive file pickers/recovery dialogs, keyboard/screen-reader behavior and native database corruption/migration failures require further validation.
- Automatic restoration/import of archived mappings, BibLaTeX/Biber workflows and cross-computer project transfer are not included.

## 5.0.71 — 2026-08-26

- Added Zotero 10 compatibility while retaining Zotero 7-9 support.
- Kept `~/.lyx/lyxpipe` as the portable Unix default and added discovery for versioned macOS LyX directories and common Linux/XDG locations.
- Expanded `~` before accessing Unix LyXServer pipes and included the resolved path in missing-pipe errors.
- Ensured BibTeX files are written successfully before citation-key and document mappings are committed.
- Preserved shared bibliography mappings when a document selects an existing database.
- Added localized titles for BibTeX and LyX-document update confirmations.
- Replaced GNU-specific `readlink -f` in the XPI build with portable Make functionality.
- Added Zotero 10 compatibility, pipe-path, write-order, database, and response-polling regression tests.
- Completed an installed runtime test with Zotero 10.0.1 and LyX 2.5 on macOS.

## 5.0.67 — 2026-07-27

- Hardened BibTeX update workflows and released the Zotero 7-9 modernization line.

## Earlier releases

Earlier history is preserved in Git tags and commit history. This changelog starts with the actively maintained Zotero 7-10 fork.
