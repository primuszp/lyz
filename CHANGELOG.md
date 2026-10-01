# Changelog

All notable changes to this maintained fork are documented here. Release artifacts are available from <https://github.com/primuszp/lyz/releases>.

## Unreleased — 5.1.0 development

- Restore cursor-position queries through the bounded worker transport. Changed-key citation insertion uses the key actually committed by the coordinated update and a localized confirmation.
- Recreate missing bibliographies and replace mapped files from their complete mapping set plus new selections, preserving existing document keys. Refuse unavailable items, invalid exports and duplicate keys before writing instead of omitting mapped entries.
- Move native LyXServer I/O into a ChromeWorker, with a deadline across opening/writing/reading, cancellable Windows overlapped operations, nonblocking Unix endpoints and a UI watchdog. Serialize requests, use unique session/client identifiers, retain split UTF-8 replies and structured failure categories, and reconnect rotated output endpoints without resending commands.
- Log resolved pipe, command name, client, duration and failure stage without command arguments or response/document contents. Windows transport accepts local named pipes; native macOS/Linux validation remains pending.
- Make mapping inventory counts linear, check each distinct file through at most eight concurrent requests, and reuse normalized search text until the next inventory snapshot. Validate shared counts with 3000 additional references.
- Extend installed Windows tests to a real connected pipe that never replies, missing-pipe categorization and UI responsiveness while waiting.
- Version development builds as `5.1.0-dev`, so they can be told apart from the 5.0.71 release in Zotero. Update manifests still advertise 5.0.71.
- Add **Test connection** and **Use default** to the LyX Server preferences. The result appears inline: connected with the active document, connected without a document, missing pipe, no answer or error. Each state explains the next step and shows the tested pipe path. Connection tests never open modal dialogs, and results for an edited path are discarded.
- Show a live example citation key under the key settings, with warnings for mis-capitalized keywords and patterns without keywords. The documented `zoteroShort` keyword now works inside custom patterns instead of being inserted literally.
- Load preferences-pane styles through `PreferencePanes` by `chrome://` URL so they apply in the separate Zotero settings window and can use Zotero's icons.
- Redraw LyZ graphics to match Zotero 7+: a 20px line icon (quoted document) for the items toolbar and settings sidebar, drawn on Zotero's grid and tinted by the theme, and 16px icons in the toolbar menu and item context menu. Generic actions use Zotero's own icons, and connection results use Zotero's status icons. The plugin icon is now flat, without shadows, gradients or rotated letters. The settings sidebar entry is labelled "LyZ" instead of the generic "Settings". Removed the unused `lyz.svg`, `lyz-colored.svg` and `lyz.png`.
- Add an installed Zotero/LyX preferences check (`run-zotero-smoke.py --lyx … --preferences`) that clicks the real pane controls against an isolated LyX pipe and saves snapshots. It passes 20 checks in light and dark mode on Windows with Zotero 10.0.3 and LyX 2.5, including icon size, tint and paint checks against Zotero's own toolbar; the local regression suite passes 142 tests.

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
