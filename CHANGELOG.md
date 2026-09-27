# Changelog

All notable changes to this maintained fork are documented here. Release artifacts are available from <https://github.com/primuszp/lyz/releases>.

## Unreleased — 5.1.0 development

- Normalize Windows paths returned by LyX at native filesystem boundaries, including backup, recovery, mapping inspection and diagnostic export operations.
- Select already-open LyX buffers before saving instead of reopening dirty documents, avoiding a native reload confirmation that blocked multi-document updates. Open closed documents only after an explicit server error; abort on uncertain transport failures.
- Extend the isolated installed smoke runner to real Zotero/LyX citation insertion, BibTeX export, multi-document rewrites, cancellation, partial-write rollback and abrupt process termination/startup recovery. All 31 lifecycle checks pass on Windows with Zotero 10.0.1 and LyX 2.5.3; the local regression suite passes 126 tests.

- Fix native dialog loading by registering chrome resources during startup and using privileged content URLs. Replace the unsupported dynamic skin registration with a content registration for toolbar styles/icons.
- Add a repeatable installed Zotero smoke test with an isolated profile/library and unchanged source documents; 14 native checks pass on Windows with Zotero 10.0.1.

- Replace separate mapping rename/delete menu entries with a searchable manager for documents, bibliographies, item keys, interrupted updates and preserved records, localized in English, German and Hungarian.
- Add reviewed relink/remove operations that archive original rows in the same transaction, preserve physical files and reject changed previews, occupied targets or inconsistent bibliography keys. Keep inspection/export available when edits are blocked.

- Version the LyZ database schema and check SQLite integrity, expected columns/indexes and mapping fields before recovery or migrations. Unsafe or newer schemas block data changes while keeping settings, LyX commands and diagnostics available.
- Adopt unversioned databases in one transaction and preserve displaced duplicate mappings in a migration archive instead of silently losing them during every startup.
- Add localized database diagnostic JSON export to all LyZ menus, including readable mappings, schema, raw journals, archived rows and partial-read errors. Export does not include document/bibliography contents and protects known source files.

- Reworked Update BibTeX so citation-key changes cover every document associated with the bibliography. Canceling the document rewrite now aborts the entire update.
- Save and close associated LyX buffers before taking snapshots, and require server acknowledgements. Use `buffer-write:force` for already-saved buffers and verify that a canceled close did not leave a document open.
- Create unique, byte-verified backups of the bibliography and modified documents, write through temporary files, and commit all citation-key mappings in one SQLite transaction after the files are verified.
- Restore attempted file changes after a caught write or database failure. Report failed restores with the affected paths and retained backups; reopening failures after a successful commit are reported separately.
- Replace complete citation tokens without cascading substitutions, preserving UTF-8, BOMs, line endings and citations from other bibliographies.
- Validate bibliography headers and exports before writing; import shared identifiers only at commit and abort when a Zotero item is unavailable.
- Serialize Zotero menu operations and encode LyX commands as UTF-8 for Unicode document paths.
- Added isolated filesystem/SQLite lifecycle tests and Windows/Unix transport fixtures. Installed Windows Zotero/LyX validation now passes; broader platform/window checks remain pending. See `KEY_UPDATE_TESTING.md` and `ZOTERO_LYX_RUNTIME_TEST.md`.
- Added a versioned SQLite recovery journal before file replacement. Its commit marker is saved atomically with new mappings; startup can distinguish incomplete updates from completed commits, including a connection error reported after commit.
- Verify SHA-256 fingerprints and mapping snapshots before restart recovery. Restore interrupted changes only after the user closes affected LyX documents and confirms recovery; retain external edits, invalid journals and corrupt backups while blocking further LyZ data changes.
- Make recovery retryable after another interruption, clean abandoned staging files, and share concurrent initialization requests to avoid duplicate database connections or recovery prompts.
- Added actual child-process termination tests before file replacement, during staging, after each replacement, before SQLite commit and after commit.

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
