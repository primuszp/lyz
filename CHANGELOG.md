# Changelog

All notable changes to this maintained fork are documented here. Release artifacts are available from <https://github.com/primuszp/lyz/releases>.

## Unreleased — 5.1.0 development

- Reworked Update BibTeX so citation-key changes cover every document associated with the bibliography. Canceling the document rewrite now aborts the entire update.
- Save and close associated LyX buffers before taking snapshots, and require server acknowledgements. Use `buffer-write:force` for already-saved buffers and verify that a canceled close did not leave a document open.
- Create unique, byte-verified backups of the bibliography and modified documents, write through temporary files, and commit all citation-key mappings in one SQLite transaction after the files are verified.
- Restore attempted file changes after a caught write or database failure. Report failed restores with the affected paths and retained backups; reopening failures after a successful commit are reported separately.
- Replace complete citation tokens without cascading substitutions, preserving UTF-8, BOMs, line endings and citations from other bibliographies.
- Validate bibliography headers and exports before writing; import shared identifiers only at commit and abort when a Zotero item is unavailable.
- Serialize Zotero menu operations and encode LyX commands as UTF-8 for Unicode document paths.
- Added isolated filesystem/SQLite lifecycle tests and Windows/Unix transport fixtures. Installed Zotero/LyX validation remains pending; see `KEY_UPDATE_TESTING.md`.

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
