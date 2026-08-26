# LyZ development roadmap

The roadmap favors data integrity, observable failures, and reproducible cross-platform behavior before new convenience features.

## P0 — protect documents and mappings

### Transactional multi-document key rewrite

Create isolated integration tests for the full key-change lifecycle: export the new BibTeX database, create `.lyz` backups, rewrite every associated LyX document, and commit mappings only after all required writes succeed. Define and test rollback behavior for partial failure.

Success criteria:

- no database mapping points to an unwritten key;
- every modified LyX document has a verified backup;
- failure identifies the exact document or file and leaves a recoverable state.

### Database schema and recovery audit

Add an explicit schema version, startup integrity checks, and a supported export/diagnostic path so users never need to edit `lyz.sqlite` manually.

## P1 — reliable cross-platform integration

### Platform test matrix

Exercise current Zotero with supported LyX versions on macOS, Windows, and Linux. Cover the portable default, detected paths, custom paths, missing parent directories, stale pipes, Unicode paths, and multiple running LyX windows.

### LyXServer transport hardening

Add bounded timeouts, structured error categories, stale-response rejection, and diagnostic logging that records the resolved pipe path, command, client identifier, and response state without exposing bibliography content.

### Automated installed smoke test

Build a repeatable fixture that opens an isolated LyX document, installs a test Zotero item, inserts a citation, updates the BibTeX entry, and verifies the document and mapping database.

## P2 — maintainability and user experience

### Preferences validation

Show whether the configured pipe is live, explain when the parent directory must be created, and provide a safe "Test connection" action with the resolved path and LyX response.

### Mapping management UI

Replace prompt-driven rename/delete operations with one searchable view of documents, bibliographies, Zotero items, and citation keys. Include export and non-destructive repair actions.

### Localization quality gate

Check that every Fluent key exists in English, German, and Hungarian, and add automated validation for missing variables and generic dialog titles.

## P3 — future capabilities

- Evaluate BibLaTeX/Biber export as a separate, explicit workflow without changing existing BibTeX behavior.
- Investigate selection of a specific LyX window when several documents are open.
- Add opt-in project portability for mapping transfer between computers while preserving Zotero library identifiers.
- Explore continuous integration for packaging, metadata validation, and draft release artifacts.

## Recommended next milestone

Target 5.1.0 around the P0 multi-document transaction and recovery work. It addresses the highest-risk remaining path and creates the test foundation needed for later UI and cross-platform improvements.
