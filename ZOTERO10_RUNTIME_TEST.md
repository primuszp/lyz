# Zotero 10 runtime test report

Date: 2026-08-26

## Environment

- Zotero 10.0.1 on macOS
- LyX 2.5
- LyZ 5.0.71 release build
- XPI: `build/lyz.xpi`
- Isolated test files: `/tmp/lyz-zotero10-test`

## Passed checks

- The XPI installs in Zotero 10 and is enabled immediately.
- LyZ survives a full Zotero shutdown and restart.
- The Tools menu, toolbar menu and item context-menu integration appear.
- The preferences pane opens and saves its values.
- The configured LyXServer pipe returns the active LyX document path.
- A selected Zotero item is exported into a new BibTeX file.
- The generated BibTeX file contains the Zotero item identifier header and the expected entry.
- `citation-insert` adds the generated key to the active LyX document.
- Updating an unchanged BibTeX database succeeds.
- Bibliography and document mapping rename operations succeed in both directions.
- Document mapping deletion succeeds and leaves the bibliography mapping intact.
- Bibliography mapping deletion succeeds and removes its associated mappings.
- After shutdown, `lyz.sqlite` contains no residual records from the isolated test.

## Defects found

Both defects found during the runtime session were fixed before the 5.0.71 release. The final XPI was rebuilt, reinstalled, and retested.

### Z10-RUNTIME-001: Missing platform-aware LyXServer discovery

Severity: high for first-run usability.

LyZ correctly keeps the portable `~/.lyx/lyxpipe` default, but LyX 2.5 on this machine creates its pipes at:

`~/Library/Application Support/LyX-2.5/.lyxpipe`

Without automatic discovery, communication fails unless the user manually changes the setting or creates compatibility links. The runtime test continued after saving the actual pipe path in the LyZ preferences pane.

Resolution: keep `~/.lyx/lyxpipe` as the visible, user-overridable default and detect live pipes in the versioned macOS `LyX-*` configuration directories and common Linux/XDG locations. Windows continues to use `\\.\pipe\lyxpipe`. The final local setup uses `~/.lyx/lyxpipe`; after creating the missing `~/.lyx` parent directory and restarting LyX, both FIFO endpoints were created and live Zotero-LyX communication succeeded.

### Z10-RUNTIME-002: Generic JavaScript Application titles during BibTeX update

Severity: low.

Both confirmation windows shown by **Update BibTeX** use `[JavaScript Application]` as their title:

1. confirmation before updating the `.bib` file;
2. confirmation before updating related LyX documents.

Other tested LyZ prompts have specific localized titles.

Resolution: both confirmations now use the existing titled `confirm()` helper and localized English, German and Hungarian titles.

## Release verification

- Automated tests: 12 passed, 0 failed.
- All add-on JavaScript files passed syntax validation.
- `build/lyz.xpi` passed ZIP integrity validation.
- The XPI was installed as LyZ 5.0.71 and survived a Zotero restart.
- The published GitHub asset was downloaded again and matched the local SHA-256:
  `e7d963357d633967ecd6e13b4e90fa78dac3716590754c2fad51bb5f95604806`.
- The public update manifest advertises version 5.0.71 for Zotero 7 through 10.
- Release: <https://github.com/primuszp/lyz/releases/tag/v5.0.71>

## Test boundary

The destructive parts were limited to the isolated test files and temporary LyZ mappings. No Zotero library item metadata was edited or deleted. The key-changing multi-document rewrite branch was not forced by modifying a real Zotero item; dedicated isolated regression coverage remains a roadmap item.
