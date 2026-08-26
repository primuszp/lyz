# Changelog

All notable changes to this maintained fork are documented here. Release artifacts are available from <https://github.com/primuszp/lyz/releases>.

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
